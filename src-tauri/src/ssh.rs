use std::{
    collections::HashMap,
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    time::Duration,
};

use russh::{client, keys::{decode_secret_key, HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate}, ChannelMsg, Disconnect};
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, State};
use tokio::{sync::{mpsc, watch, Semaphore}, time::timeout};
use zeroize::Zeroize;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const SETUP_TIMEOUT: Duration = Duration::from_secs(45);
const IO_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_INPUT_BYTES: usize = 64 * 1024;
const MAX_SESSIONS: usize = 16;
const OBSERVER_GPU: &str = "nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits";
const OBSERVER_LINUX: &str = "export LC_ALL=C; cat /proc/loadavg && free -m && df -h / && uptime -p && printf '\\n__WARREN_CORES__\\n' && (getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || true)";
const OBSERVER_FLEET: &str = "sqlite3 -readonly -json /root/.hermes/kanban.db \"SELECT assignee, status, title FROM tasks WHERE status IN ('running', 'blocked', 'review', 'ready', 'todo', 'scheduled');\"";
const OBSERVER_TASKS: &str = "sqlite3 -readonly -json /root/.hermes/kanban.db \"SELECT id, title, assignee, status, priority, datetime(created_at, 'unixepoch') as created_at FROM tasks WHERE status != 'archived' ORDER BY created_at DESC LIMIT 25;\"";
const OBSERVER_TASKS_WITH_ARCHIVED: &str = "sqlite3 -readonly -json /root/.hermes/kanban.db \"SELECT id, title, assignee, status, priority, datetime(created_at, 'unixepoch') as created_at FROM tasks ORDER BY created_at DESC LIMIT 25;\"";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshRequest {
    session_id: String,
    host: String,
    port: u16,
    username: String,
    auth: AuthMethod,
    password: String,
    private_key: String,
    passphrase: String,
    fingerprint: String,
    cols: u32,
    rows: u32,
}

impl Drop for SshRequest {
    fn drop(&mut self) {
        self.password.zeroize();
        self.private_key.zeroize();
        self.passphrase.zeroize();
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum AuthMethod { Password, Key }

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SshEvent {
    Data { data: Vec<u8> },
    Status { status: &'static str, #[serde(skip_serializing_if = "Option::is_none")] message: Option<String> },
}

enum SessionCommand {
    Write(String),
    Resize(u32, u32),
}

struct SessionControl {
    tx: mpsc::Sender<SessionCommand>,
    cancel: watch::Sender<bool>,
    ready: Arc<AtomicBool>,
    connection: Option<Arc<SshHandle>>,
    burrow_slot: Arc<Semaphore>,
    scheduler_slot: Arc<Semaphore>,
}

struct BurrowListener { cancel: watch::Sender<bool> }

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum BurrowEvent {
    Data { data: Vec<u8> },
    Status { status: &'static str, #[serde(skip_serializing_if = "Option::is_none")] message: Option<String> },
}

#[derive(Default, Clone)]
pub struct SshState {
    sessions: Arc<Mutex<HashMap<String, SessionControl>>>,
    burrow_listeners: Arc<Mutex<HashMap<String, BurrowListener>>>,
    observer_reads: Arc<Mutex<HashMap<String, watch::Sender<bool>>>>,
}

impl SshState {
    pub(crate) fn has_sessions(&self) -> bool {
        // A poisoned lock is uncertain state, so fail closed for an update install.
        self.sessions.lock().map(|sessions| !sessions.is_empty()).unwrap_or(true)
    }

    pub fn disconnect_all(&self) {
        if let Ok(sessions) = self.sessions.lock() {
            for control in sessions.values() { let _ = control.cancel.send(true); }
        }
        if let Ok(listeners) = self.burrow_listeners.lock() {
            for listener in listeners.values() { let _ = listener.cancel.send(true); }
        }
        if let Ok(reads) = self.observer_reads.lock() { for cancel in reads.values() { let _ = cancel.send(true); } }
    }
}

fn validate_host(host: &str, port: u16) -> Result<(), String> {
    if host.is_empty() || host.len() > 253 || port == 0
        || host.chars().any(|c| c.is_whitespace() || c.is_control() || matches!(c, '/' | '\\' | '@' | '?' | '#' | '[' | ']')) {
        return Err("Enter a host name or IP address and a port from 1 to 65535 (without a URL prefix).".into());
    }
    Ok(())
}

fn validate_dimensions(cols: u32, rows: u32) -> Result<(), String> {
    if !(1..=1000).contains(&cols) || !(1..=1000).contains(&rows) {
        return Err("Terminal dimensions must be between 1 and 1000.".into());
    }
    Ok(())
}

fn validate_input(data: &str) -> Result<(), String> {
    if data.len() > MAX_INPUT_BYTES { return Err("Terminal input exceeds 64 KiB. Paste a smaller block.".into()); }
    Ok(())
}

fn valid_fingerprint(value: &str) -> bool {
    let Some(hash) = value.strip_prefix("SHA256:") else { return false; };
    hash.len() == 43 && hash.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/'))
}

fn fingerprints_match(expected: &str, actual: &str) -> bool {
    valid_fingerprint(expected) && expected == actual
}

fn validate_request(request: &SshRequest) -> Result<(), String> {
    validate_host(&request.host, request.port)?;
    validate_dimensions(request.cols, request.rows)?;
    if request.session_id.is_empty() || request.session_id.len() > 128 {
        return Err("Invalid terminal session identifier.".into());
    }
    if request.username.is_empty() || request.username.len() > 256 || request.username.chars().any(char::is_control) {
        return Err("Enter a valid SSH username.".into());
    }
    if !valid_fingerprint(&request.fingerprint) {
        return Err("Confirm the server SHA256 host fingerprint before connecting.".into());
    }
    if request.private_key.len() > 128 * 1024 || request.password.len() > 16 * 1024 || request.passphrase.len() > 16 * 1024 {
        return Err("SSH credential input is too large.".into());
    }
    Ok(())
}

struct HostVerifier {
    expected: Option<String>,
    observed: Arc<Mutex<Option<String>>>,
}

impl client::Handler for HostVerifier {
    type Error = russh::Error;

    async fn check_server_key(&mut self, key: &PublicKeyOrCertificate) -> Result<bool, Self::Error> {
        let actual = key.public_key().fingerprint(HashAlg::Sha256).to_string();
        if let Ok(mut observed) = self.observed.lock() { *observed = Some(actual.clone()); }
        // A probe has no expected key and intentionally rejects the handshake here.
        // Credentials are available only to the separate, pinned connection path.
        Ok(self.expected.as_ref().is_some_and(|expected| fingerprints_match(expected, &actual)))
    }
}

fn ssh_config() -> Arc<client::Config> {
    Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(20)),
        keepalive_max: 3,
        inactivity_timeout: None,
        nodelay: true,
        channel_buffer_size: 32,
        ..Default::default()
    })
}

// russh runs its protocol loop in a separate task. Closing this duplicate socket
// also stops that task if a handshake/setup future is dropped by timeout or cancel.
struct SocketGuard(std::net::TcpStream);

impl Drop for SocketGuard {
    fn drop(&mut self) { let _ = self.0.shutdown(std::net::Shutdown::Both); }
}

struct SshHandle {
    handle: client::Handle<HostVerifier>,
    _socket: SocketGuard,
}

impl std::ops::Deref for SshHandle {
    type Target = client::Handle<HostVerifier>;
    fn deref(&self) -> &Self::Target { &self.handle }
}

impl std::ops::DerefMut for SshHandle {
    fn deref_mut(&mut self) -> &mut Self::Target { &mut self.handle }
}

async fn open_connection(host: &str, port: u16, verifier: HostVerifier) -> Result<SshHandle, String> {
    let stream = tokio::net::TcpStream::connect((host, port)).await.map_err(|e| e.to_string())?;
    stream.set_nodelay(true).map_err(|e| e.to_string())?;
    let stream = stream.into_std().map_err(|e| e.to_string())?;
    let guard = SocketGuard(stream.try_clone().map_err(|e| e.to_string())?);
    let stream = tokio::net::TcpStream::from_std(stream).map_err(|e| e.to_string())?;
    let handle = client::connect_stream(ssh_config(), stream, verifier).await.map_err(|e| e.to_string())?;
    Ok(SshHandle { handle, _socket: guard })
}

#[tauri::command]
pub async fn ssh_probe(host: String, port: u16) -> Result<String, String> {
    validate_host(&host, port)?;
    let observed = Arc::new(Mutex::new(None));
    let verifier = HostVerifier { expected: None, observed: observed.clone() };
    let result = timeout(CONNECT_TIMEOUT, open_connection(&host, port, verifier)).await;
    let fingerprint = observed.lock().map_err(|_| "Host fingerprint state unavailable.")?.clone();
    if let Some(fingerprint) = fingerprint { return Ok(fingerprint); }
    match result {
        Err(_) => Err("SSH host fingerprint lookup timed out.".into()),
        Ok(Err(error)) => Err(format!("Could not read SSH host fingerprint: {error}")),
        Ok(Ok(handle)) => {
            let _ = timeout(IO_TIMEOUT, handle.disconnect(Disconnect::ByApplication, "Probe complete", "en")).await;
            Err("SSH server did not present a host key.".into())
        }
    }
}

type SshChannel = russh::Channel<client::Msg>;

fn send_data(events: &Channel<SshEvent>, data: &[u8]) -> Result<(), String> {
    events.send(SshEvent::Data { data: data.to_vec() }).map_err(|_| "Terminal view closed.".into())
}

async fn await_acceptance(channel: &mut SshChannel, events: &Channel<SshEvent>, operation: &str) -> Result<(), String> {
    loop {
        match channel.wait().await {
            Some(ChannelMsg::Success) => return Ok(()),
            Some(ChannelMsg::Failure) => return Err(format!("Server refused the {operation} request.")),
            Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => send_data(events, &data)?,
            Some(ChannelMsg::Close) | Some(ChannelMsg::Eof) | None => return Err(format!("Server closed during {operation}.")),
            _ => {}
        }
    }
}

async fn establish(mut request: SshRequest, events: &Channel<SshEvent>) -> Result<(SshHandle, SshChannel), String> {
    let observed = Arc::new(Mutex::new(None));
    let verifier = HostVerifier { expected: Some(request.fingerprint.clone()), observed: observed.clone() };
    let connection = timeout(CONNECT_TIMEOUT, open_connection(&request.host, request.port, verifier))
        .await.map_err(|_| "SSH connection timed out.".to_string())?;
    let mut handle = connection.map_err(|error| {
        if let Ok(observed) = observed.lock() {
            if let Some(actual) = observed.as_ref() {
                if !fingerprints_match(&request.fingerprint, actual) {
                    return format!("SSH host key changed. Expected {}; received {}. No credentials were sent. Verify the server independently before updating trust.", request.fingerprint, actual);
                }
            }
        }
        format!("SSH connection failed: {error}")
    })?;
    let authenticated = match request.auth {
        AuthMethod::Password => handle.authenticate_password(&request.username, std::mem::take(&mut request.password))
            .await.map_err(|_| "SSH password authentication failed.".to_string())?.success(),
        AuthMethod::Key => {
            let mut encoded = std::mem::take(&mut request.private_key);
            let mut passphrase = std::mem::take(&mut request.passphrase);
            let key = tokio::task::spawn_blocking(move || {
                let result = decode_secret_key(&encoded, if passphrase.is_empty() { None } else { Some(&passphrase) });
                encoded.zeroize();
                passphrase.zeroize();
                result
            }).await.map_err(|_| "Could not decode SSH private key.".to_string())?
                .map_err(|_| "Cannot read the SSH private key. Check its format and passphrase.".to_string())?;
            // SHA-1 RSA is never selected, including servers that omit server-sig-algs.
            let rsa_hash = handle.best_supported_rsa_hash().await
                .map_err(|_| "Could not negotiate SSH key authentication.".to_string())?
                .flatten().or(Some(HashAlg::Sha256));
            handle.authenticate_publickey(&request.username, PrivateKeyWithHashAlg::new(Arc::new(key), rsa_hash))
                .await.map_err(|_| "SSH private-key authentication failed.".to_string())?.success()
        }
    };
    if !authenticated { return Err("SSH authentication was rejected. Check the account and credential.".into()); }
    let mut channel = handle.channel_open_session().await.map_err(|e| format!("Could not open SSH session: {e}"))?;
    channel.request_pty(true, "xterm-256color", request.cols, request.rows, 0, 0, &[]).await
        .map_err(|e| format!("Could not request terminal: {e}"))?;
    await_acceptance(&mut channel, events, "terminal").await?;
    channel.request_shell(true).await.map_err(|e| format!("Could not request shell: {e}"))?;
    await_acceptance(&mut channel, events, "shell").await?;
    Ok((handle, channel))
}

#[tauri::command]
pub async fn ssh_connect(request: SshRequest, on_event: Channel<SshEvent>, state: State<'_, SshState>) -> Result<(), String> {
    validate_request(&request)?;
    let session_id = request.session_id.clone();
    let (tx, rx) = mpsc::channel(32);
    let (cancel, mut cancel_rx) = watch::channel(false);
    let ready = Arc::new(AtomicBool::new(false));
    let sessions = state.sessions.clone();
    {
        let mut sessions = sessions.lock().map_err(|_| "Terminal state unavailable.".to_string())?;
        if sessions.contains_key(&session_id) { return Err("This terminal session is already connecting or open.".into()); }
        if sessions.len() >= MAX_SESSIONS { return Err("Close a terminal before opening more than 16 sessions.".into()); }
        sessions.insert(session_id.clone(), SessionControl { tx, cancel, ready: ready.clone(), connection: None, burrow_slot: Arc::new(Semaphore::new(1)), scheduler_slot: Arc::new(Semaphore::new(1)) });
    }
    let result = tokio::select! {
        biased;
        _ = cancel_rx.changed() => Err("SSH connection cancelled.".to_string()),
        result = timeout(SETUP_TIMEOUT, establish(request, &on_event)) => result.unwrap_or_else(|_| Err("SSH authentication or terminal setup timed out.".into())),
    };
    match result {
        Ok((handle, channel)) => {
            let handle = Arc::new(handle);
            if let Ok(mut sessions) = sessions.lock() {
                if let Some(control) = sessions.get_mut(&session_id) { control.connection = Some(handle.clone()); }
            }
            ready.store(true, Ordering::Release);
            if on_event.send(SshEvent::Status { status: "connected", message: None }).is_err() {
                let _ = timeout(IO_TIMEOUT, handle.disconnect(Disconnect::ByApplication, "View closed", "en")).await;
                if let Ok(mut sessions) = sessions.lock() { sessions.remove(&session_id); }
                return Err("Terminal view closed.".into());
            }
            tauri::async_runtime::spawn(run_session(session_id, handle, channel, rx, cancel_rx, on_event, sessions, ready));
            Ok(())
        }
        Err(error) => {
            if let Ok(mut sessions) = sessions.lock() { sessions.remove(&session_id); }
            let _ = on_event.send(SshEvent::Status { status: "error", message: Some(error.clone()) });
            Err(error)
        }
    }
}

async fn run_session(
    session_id: String,
    handle: Arc<SshHandle>,
    mut channel: SshChannel,
    mut commands: mpsc::Receiver<SessionCommand>,
    mut cancel: watch::Receiver<bool>,
    events: Channel<SshEvent>,
    sessions: Arc<Mutex<HashMap<String, SessionControl>>>,
    ready: Arc<AtomicBool>,
) {
    let mut reason = None;
    let mut failed = false;
    loop {
        if *cancel.borrow() { break; }
        tokio::select! {
            biased;
            _ = cancel.changed() => break,
            command = commands.recv() => {
                let result = match command {
                    Some(SessionCommand::Write(mut data)) => {
                        let result = timeout(IO_TIMEOUT, channel.data(data.as_bytes())).await;
                        data.zeroize();
                        result
                    }
                    Some(SessionCommand::Resize(cols, rows)) => timeout(IO_TIMEOUT, channel.window_change(cols, rows, 0, 0)).await,
                    None => break,
                };
                match result {
                    Ok(Ok(())) => {}
                    Ok(Err(error)) => { reason = Some(format!("SSH transport failed: {error}. Input was not retried.")); failed = true; break; }
                    Err(_) => { reason = Some("SSH write timed out. Input delivery is uncertain; it was not retried.".into()); failed = true; break; }
                }
            }
            message = channel.wait() => match message {
                Some(ChannelMsg::Data { data }) | Some(ChannelMsg::ExtendedData { data, .. }) => {
                    if send_data(&events, &data).is_err() { break; }
                }
                Some(ChannelMsg::ExitStatus { exit_status }) => { reason = Some(format!("Remote shell exited with status {exit_status}.")); }
                Some(ChannelMsg::ExitSignal { .. }) => { reason = Some("Remote shell ended by signal.".into()); }
                Some(ChannelMsg::Close) | Some(ChannelMsg::Eof) | None => break,
                _ => {}
            }
        }
    }
    ready.store(false, Ordering::Release);
    commands.close();
    while let Ok(command) = commands.try_recv() {
        if let SessionCommand::Write(mut data) = command { data.zeroize(); }
    }
    let _ = timeout(Duration::from_secs(2), channel.close()).await;
    let _ = timeout(Duration::from_secs(2), handle.disconnect(Disconnect::ByApplication, "Terminal closed", "en")).await;
    if let Ok(mut sessions) = sessions.lock() { sessions.remove(&session_id); }
    let _ = events.send(SshEvent::Status { status: if failed { "error" } else { "disconnected" }, message: reason });
}

fn queue_command(state: &SshState, session_id: &str, command: SessionCommand) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|_| "Terminal state unavailable.".to_string())?;
    let control = sessions.get(session_id).ok_or("Terminal session is not open.")?;
    if !control.ready.load(Ordering::Acquire) { return Err("Terminal session is not connected.".into()); }
    control.tx.try_send(command).map_err(|error| {
        if let SessionCommand::Write(mut data) = error.into_inner() { data.zeroize(); }
        "Terminal input queue is full or the session closed. Input was not retried.".into()
    })
}

#[tauri::command]
pub async fn ssh_write(session_id: String, data: String, state: State<'_, SshState>) -> Result<(), String> {
    validate_input(&data)?;
    queue_command(&state, &session_id, SessionCommand::Write(data))
}

#[tauri::command]
pub async fn ssh_resize(session_id: String, cols: u32, rows: u32, state: State<'_, SshState>) -> Result<(), String> {
    validate_dimensions(cols, rows)?;
    queue_command(&state, &session_id, SessionCommand::Resize(cols, rows))
}

#[tauri::command]
pub async fn ssh_disconnect(session_id: String, state: State<'_, SshState>) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|_| "Terminal state unavailable.".to_string())?;
    if let Some(control) = sessions.get(&session_id) { let _ = control.cancel.send(true); }
    Ok(())
}

// Deliberately expose a log reader, never an arbitrary shell-execution IPC command.
fn burrow_lookup_command(task_id: &str) -> Result<String, String> {
    if !task_id.starts_with("task-") || task_id.len() <= 5 || task_id.len() > 160
        || !task_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') {
        return Err("Invalid Burrow task ID. Expected task- followed by letters, digits, underscores or hyphens.".into());
    }
    // Match the complete JSON field value; task-abc must not match task-abcd.
    Ok(format!(r#"if [ ! -d /root/.hermes/profiles/leveret/a2a_conversations ] || [ ! -r /root/.hermes/profiles/leveret/a2a_conversations ]; then printf '%s\n' 'Burrow conversation directory is unavailable.' >&2; exit 1; fi; set -- /root/.hermes/profiles/leveret/a2a_conversations/ctx-*.jsonl; if [ -e "$1" ]; then grep -l -E -- '"task_id"[[:space:]]*:[[:space:]]*"{task_id}"' "$@" | head -n 1; fi"#))
}

fn burrow_file_command(path: &str) -> Result<String, String> {
    let id = path.strip_prefix("/root/.hermes/profiles/leveret/a2a_conversations/")
        .and_then(|name| name.strip_suffix(".jsonl")).ok_or("Unexpected Burrow transcript path.")?;
    if !id.starts_with("ctx-") || id.len() <= 4 || id.len() > 160
        || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') {
        return Err("Unexpected Burrow transcript filename.".into());
    }
    Ok(format!("cat -- '{path}'"))
}

#[derive(Serialize)]
pub struct BurrowTranscriptResult { path: Option<String>, content: String }

#[tauri::command]
pub async fn ssh_read_burrow(session_id: String, task_id: String, state: State<'_, SshState>) -> Result<BurrowTranscriptResult, String> {
    let command = burrow_lookup_command(&task_id)?;
    let (connection, mut cancel, slot) = {
        let sessions = state.sessions.lock().map_err(|_| "SSH state unavailable.")?;
        let control = sessions.get(&session_id).ok_or("Connect a VPS terminal before reading Burrow logs.")?;
        if !control.ready.load(Ordering::Acquire) || *control.cancel.borrow() { return Err("The SSH session is offline.".into()); }
        let connection = control.connection.clone().ok_or("The SSH session is not ready.")?;
        (connection, control.cancel.subscribe(), control.burrow_slot.clone())
    };
    let _permit = slot.try_acquire_owned().map_err(|_| "A Burrow read is already in progress on this SSH session.")?;
    let found = read_ssh_text(&connection, &mut cancel, None, &command).await?;
    let path = found.trim();
    if path.is_empty() { return Ok(BurrowTranscriptResult { path: None, content: String::new() }); }
    let command = burrow_file_command(path)?;
    let content = read_ssh_text(&connection, &mut cancel, None, &command).await?;
    Ok(BurrowTranscriptResult { path: Some(path.into()), content })
}

async fn wait_for_read_cancel(cancel: &mut Option<watch::Receiver<bool>>) {
    if let Some(receiver) = cancel.as_mut() { let _ = receiver.changed().await; }
    else { std::future::pending::<()>().await; }
}

async fn read_ssh_text(connection: &SshHandle, cancel: &mut watch::Receiver<bool>, mut request_cancel: Option<watch::Receiver<bool>>, command: &str) -> Result<String, String> {
    run_ssh_text(connection, cancel, request_cancel.take(), command, None, Duration::from_secs(20)).await
}

async fn run_ssh_text(connection: &SshHandle, cancel: &mut watch::Receiver<bool>, mut request_cancel: Option<watch::Receiver<bool>>, command: &str, input: Option<&[u8]>, operation_timeout: Duration) -> Result<String, String> {
    if *cancel.borrow() { return Err("The SSH session is offline.".into()); }
    if request_cancel.as_ref().is_some_and(|receiver| *receiver.borrow()) { return Err("SSH read cancelled.".into()); }
    // Opening an exec channel leaves the interactive PTY, its input and output intact.
    let mut channel = tokio::select! {
        biased;
        _ = cancel.changed() => return Err("SSH disconnected while opening the read channel.".into()),
        _ = wait_for_read_cancel(&mut request_cancel) => return Err("SSH read cancelled.".into()),
        result = timeout(IO_TIMEOUT, connection.channel_open_session()) => result
            .map_err(|_| "Opening the SSH read channel timed out.")?
            .map_err(|_| "The server refused a separate SSH read channel.")?,
    };
    let result = tokio::select! {
        biased;
        _ = cancel.changed() => Err("SSH disconnected while reading data.".into()),
        _ = wait_for_read_cancel(&mut request_cancel) => Err("SSH read cancelled.".into()),
        result = timeout(operation_timeout, async {
            channel.exec(true, command.as_bytes()).await.map_err(|_| "Could not request the SSH read.".to_string())?;
            if let Some(data) = input {
                channel.data(data).await.map_err(|_| "Could not send the Scheduler request.".to_string())?;
                channel.eof().await.map_err(|_| "Could not finish sending the Scheduler request.".to_string())?;
            }
            let mut output = Vec::new();
            let mut stderr = Vec::new();
            let mut exit_status = None;
            while let Some(message) = channel.wait().await {
                match message {
                    ChannelMsg::Data { data } => {
                        if output.len() + data.len() > 8 * 1024 * 1024 { return Err("SSH output exceeds the 8 MiB read limit; data was not truncated.".into()); }
                        output.extend_from_slice(&data);
                    }
                    ChannelMsg::ExtendedData { data, .. } => { stderr.extend_from_slice(&data[..data.len().min(4096_usize.saturating_sub(stderr.len()))]); }
                    ChannelMsg::ExitStatus { exit_status: status } => { exit_status = Some(status); }
                    ChannelMsg::Failure | ChannelMsg::ExitSignal { .. } => return Err("The server rejected the SSH read.".into()),
                    ChannelMsg::Close => break,
                    _ => {}
                }
            }
            match exit_status {
                Some(0) if output.is_empty() && !stderr.is_empty() => Err(format!("The SSH read returned no data. {}", String::from_utf8_lossy(&stderr).trim())),
                Some(0) => String::from_utf8(output).map_err(|_| "SSH output must be UTF-8 text.".into()),
                Some(_) => Err(format!("Could not read server data. Check installed utilities, paths and SSH account permissions. {}", String::from_utf8_lossy(&stderr).trim())),
                None => Err("SSH ended without confirming the read. Retry explicitly.".into()),
            }
        }) => result.unwrap_or_else(|_| Err("The SSH operation timed out.".into())),
    };
    let _ = timeout(Duration::from_secs(2), channel.close()).await;
    result
}

#[tauri::command]
pub async fn ssh_scheduler(session_id: String, request: serde_json::Value, state: State<'_, SshState>) -> Result<serde_json::Value, String> {
    let mutation = request.get("action").and_then(serde_json::Value::as_str) != Some("list");
    let (command, input) = crate::scheduler::prepare(&request)?;
    let (connection, mut session_cancel, slot) = {
        let sessions = state.sessions.lock().map_err(|_| "SSH state unavailable.")?;
        let control = sessions.get(&session_id).ok_or("Connect the selected Scheduler host over SSH first.")?;
        if !control.ready.load(Ordering::Acquire) || *control.cancel.borrow() {
            return Err("The selected Scheduler host is offline.".into());
        }
        (control.connection.clone().ok_or("SSH is not ready.")?, control.cancel.subscribe(), control.scheduler_slot.clone())
    };
    let _permit = slot.try_acquire_owned().map_err(|_| "Wait for the current Scheduler operation to finish, then refresh.")?;
    let output = run_ssh_text(&connection, &mut session_cancel, None, &command, Some(input.as_bytes()), Duration::from_secs(45)).await.map_err(|cause| {
        if mutation {
            format!("The schedule change was not confirmed. Refresh this host before making another change. {cause}")
        } else { cause }
    })?;
    crate::scheduler::response(&output)
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ObserverReadKind { Hardware, Fleet, Tasks }

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ObserverResult {
    Hardware { linux: Option<String>, gpu: Option<String>, warning: Option<String> },
    Fleet { data: String },
    Tasks { data: String },
}

#[derive(Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ObserverEvent { Result { result: ObserverResult }, Error { message: String } }

#[tauri::command]
pub fn ssh_observer_start(session_id: String, request_id: String, kind: ObserverReadKind, include_archived: Option<bool>, on_event: Channel<ObserverEvent>, state: State<'_, SshState>) -> Result<(), String> {
    if request_id.is_empty() || request_id.len() > 128 { return Err("Invalid Observer request ID.".into()); }
    let (connection, mut session_cancel) = {
        let sessions = state.sessions.lock().map_err(|_| "SSH state unavailable.")?;
        let control = sessions.get(&session_id).ok_or("Connect the selected Observer host over SSH first.")?;
        if !control.ready.load(Ordering::Acquire) || *control.cancel.borrow() { return Err("The selected SSH host is offline.".into()); }
        (control.connection.clone().ok_or("SSH is not ready.")?, control.cancel.subscribe())
    };
    let (cancel, read_cancel) = watch::channel(false);
    let reads = state.observer_reads.clone();
    {
        let mut reads = reads.lock().map_err(|_| "Observer state unavailable.")?;
        if reads.contains_key(&request_id) { return Err("This Observer request is already active.".into()); }
        if reads.len() >= 16 { return Err("Wait for previous Observer reads to finish.".into()); }
        reads.insert(request_id.clone(), cancel);
    }
    tauri::async_runtime::spawn(async move {
        let result = perform_observer_read(&connection, &mut session_cancel, &read_cancel, kind, include_archived.unwrap_or(false)).await;
        if let Ok(mut reads) = reads.lock() { reads.remove(&request_id); }
        if *read_cancel.borrow() { return; }
        let event = match result { Ok(result) => ObserverEvent::Result { result }, Err(message) => ObserverEvent::Error { message } };
        let _ = on_event.send(event);
    });
    Ok(())
}

#[tauri::command]
pub fn ssh_observer_cancel(request_id: String, state: State<'_, SshState>) -> Result<(), String> {
    let reads = state.observer_reads.lock().map_err(|_| "Observer state unavailable.")?;
    if let Some(cancel) = reads.get(&request_id) { let _ = cancel.send(true); }
    Ok(())
}

async fn perform_observer_read(connection: &SshHandle, session_cancel: &mut watch::Receiver<bool>, cancel: &watch::Receiver<bool>, kind: ObserverReadKind, include_archived: bool) -> Result<ObserverResult, String> {
    match kind {
        ObserverReadKind::Hardware => {
            let linux = read_ssh_text(connection, session_cancel, Some(cancel.clone()), OBSERVER_LINUX).await;
            if *cancel.borrow() { return Err("Observer read cancelled.".into()); }
            if let Ok(linux) = linux {
                let probe = format!("if command -v nvidia-smi >/dev/null 2>&1; then {OBSERVER_GPU}; fi");
                let gpu = read_ssh_text(connection, session_cancel, Some(cancel.clone()), &probe).await;
                let (gpu, warning) = match gpu { Ok(data) => (if data.trim().is_empty() { None } else { Some(data) }, None), Err(error) => (None, Some(error)) };
                Ok(ObserverResult::Hardware { linux: Some(linux), gpu, warning })
            } else {
                let gpu = read_ssh_text(connection, session_cancel, Some(cancel.clone()), OBSERVER_GPU).await
                    .map_err(|error| format!("Linux telemetry is unavailable and the NVIDIA query failed. {error}"))?;
                Ok(ObserverResult::Hardware { linux: None, gpu: Some(gpu), warning: None })
            }
        }
        ObserverReadKind::Fleet => Ok(ObserverResult::Fleet { data: read_ssh_text(connection, session_cancel, Some(cancel.clone()), OBSERVER_FLEET).await? }),
        ObserverReadKind::Tasks => Ok(ObserverResult::Tasks { data: read_ssh_text(connection, session_cancel, Some(cancel.clone()), if include_archived { OBSERVER_TASKS_WITH_ARCHIVED } else { OBSERVER_TASKS }).await? }),
    }
}

#[tauri::command]
pub fn ssh_burrow_listen(session_id: String, listener_id: String, on_event: Channel<BurrowEvent>, state: State<'_, SshState>) -> Result<(), String> {
    if listener_id.is_empty() || listener_id.len() > 128 { return Err("Invalid Burrow listener ID.".into()); }
    let (connection, session_cancel) = {
        let sessions = state.sessions.lock().map_err(|_| "SSH state unavailable.")?;
        let control = sessions.get(&session_id).ok_or("Connect a VPS terminal before monitoring Burrow.")?;
        if !control.ready.load(Ordering::Acquire) || *control.cancel.borrow() { return Err("The SSH session is offline.".into()); }
        (control.connection.clone().ok_or("The SSH session is not ready.")?, control.cancel.subscribe())
    };
    let (cancel, listener_cancel) = watch::channel(false);
    let listeners = state.burrow_listeners.clone();
    {
        let mut listeners = listeners.lock().map_err(|_| "Burrow listener state unavailable.")?;
        if listeners.contains_key(&listener_id) { return Err("This Burrow listener is already open.".into()); }
        if listeners.len() >= 8 { return Err("Too many Burrow listeners. Close an existing monitor first.".into()); }
        listeners.insert(listener_id.clone(), BurrowListener { cancel });
    }
    tauri::async_runtime::spawn(async move {
        let result = run_burrow_tail(connection, session_cancel, listener_cancel, &on_event).await;
        if let Ok(mut listeners) = listeners.lock() { listeners.remove(&listener_id); }
        let (status, message) = match result { Ok(()) => ("closed", None), Err(error) => ("error", Some(error)) };
        let _ = on_event.send(BurrowEvent::Status { status, message });
    });
    Ok(())
}

#[tauri::command]
pub fn ssh_burrow_stop(listener_id: String, state: State<'_, SshState>) -> Result<(), String> {
    let listeners = state.burrow_listeners.lock().map_err(|_| "Burrow listener state unavailable.")?;
    if let Some(listener) = listeners.get(&listener_id) { let _ = listener.cancel.send(true); }
    Ok(())
}

async fn run_burrow_tail(connection: Arc<SshHandle>, mut session_cancel: watch::Receiver<bool>, mut listener_cancel: watch::Receiver<bool>, events: &Channel<BurrowEvent>) -> Result<(), String> {
    if *session_cancel.borrow() || *listener_cancel.borrow() { return Ok(()); }
    events.send(BurrowEvent::Status { status: "connecting", message: None }).map_err(|_| "Burrow view closed.")?;
    let mut channel = tokio::select! {
        biased;
        _ = session_cancel.changed() => return Err("SSH disconnected. Reconnect the VPS and retry.".into()),
        _ = listener_cancel.changed() => return Ok(()),
        result = timeout(IO_TIMEOUT, connection.channel_open_session()) => result
            .map_err(|_| "Opening the Burrow stream timed out.")?.map_err(|_| "The server refused a Burrow SSH channel.")?,
    };
    let result = async {
        tokio::select! {
            biased;
            _ = session_cancel.changed() => return Err("SSH disconnected. Reconnect the VPS and retry.".into()),
            _ = listener_cancel.changed() => return Ok(()),
            result = timeout(IO_TIMEOUT, channel.exec(true, "tail -f -n 15 /root/.hermes/profiles/leveret/a2a_audit.jsonl")) => {
                result.map_err(|_| "Starting the Burrow stream timed out.")?.map_err(|_| "Could not start the Burrow stream.")?;
            }
        }
        let mut acknowledged = false;
        let mut stderr = Vec::new();
        let deadline = tokio::time::sleep(IO_TIMEOUT);
        tokio::pin!(deadline);
        loop {
            tokio::select! {
                biased;
                _ = session_cancel.changed() => return Err("SSH disconnected. Reconnect the VPS and retry.".into()),
                _ = listener_cancel.changed() => return Ok(()),
                _ = &mut deadline, if !acknowledged => return Err("The server did not acknowledge the Burrow stream.".into()),
                message = channel.wait() => match message {
                    Some(ChannelMsg::Success) => {
                        acknowledged = true;
                        events.send(BurrowEvent::Status { status: "monitoring", message: None }).map_err(|_| "Burrow view closed.")?;
                    }
                    Some(ChannelMsg::Data { data }) => {
                        // Preserve bytes across IPC; TextDecoder handles split UTF-8 in the UI.
                        events.send(BurrowEvent::Data { data: data.to_vec() }).map_err(|_| "Burrow view closed.")?;
                    }
                    Some(ChannelMsg::ExtendedData { data, .. }) => stderr.extend_from_slice(&data[..data.len().min(4096_usize.saturating_sub(stderr.len()))]),
                    Some(ChannelMsg::ExitStatus { exit_status }) => return Err(format!("Burrow tail ended (status {exit_status}). {}", String::from_utf8_lossy(&stderr).trim())),
                    Some(ChannelMsg::Failure) | Some(ChannelMsg::ExitSignal { .. }) => return Err("The server rejected or terminated the Burrow stream.".into()),
                    Some(ChannelMsg::Close) | Some(ChannelMsg::Eof) | None => return Err(format!("The Burrow stream closed. {}", String::from_utf8_lossy(&stderr).trim())),
                    _ => {}
                }
            }
        }
    }.await;
    // Closing only this exec channel terminates tail without touching the terminal PTY.
    let _ = timeout(Duration::from_secs(2), channel.close()).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observer_ingestion_is_limited_to_fixed_read_only_commands() {
        assert!(OBSERVER_FLEET.starts_with("sqlite3 -readonly -json "));
        assert!(OBSERVER_TASKS.contains("LIMIT 25"));
        assert!(OBSERVER_GPU.contains("--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu"));
        assert!(serde_json::from_str::<ObserverReadKind>("\"hardware\"").is_ok());
        assert!(serde_json::from_str::<ObserverReadKind>("\"arbitrary-shell-command\"").is_err());
    }

    #[tokio::test]
    async fn observer_cancel_wakes_a_waiting_read() {
        let (cancel, receiver) = watch::channel(false);
        let mut request = Some(receiver);
        cancel.send(true).unwrap();
        timeout(Duration::from_secs(1), wait_for_read_cancel(&mut request)).await.unwrap();
    }

    #[test]
    fn dropping_connection_guard_closes_a_socket_retained_by_the_protocol_task() {
        use std::io::Read;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let retained_socket = std::net::TcpStream::connect(listener.local_addr().unwrap()).unwrap();
        let (mut peer, _) = listener.accept().unwrap();
        peer.set_read_timeout(Some(Duration::from_secs(2))).unwrap();
        let guard = SocketGuard(retained_socket.try_clone().unwrap());
        drop(guard);
        assert_eq!(peer.read(&mut [0; 1]).unwrap(), 0);
        drop(retained_socket);
    }

    #[tokio::test]
    async fn discovery_rejects_the_handshake_and_a_changed_host_key_never_passes() {
        use russh::client::Handler;
        // Public key from RFC 8032 test vector 1; no private credential is stored.
        let key: PublicKeyOrCertificate = russh::keys::parse_public_key_base64(
            "AAAAC3NzaC1lZDI1NTE5AAAAINdamAGCsQq31Uv+08lkBzoO4XLz2qYjJa8CGmj3B1Ea"
        ).unwrap().into();
        let observed = Arc::new(Mutex::new(None));
        let mut verifier = HostVerifier { expected: None, observed: observed.clone() };
        assert!(!verifier.check_server_key(&key).await.unwrap());
        assert_eq!(observed.lock().unwrap().as_deref(), Some("SHA256:bbXpuKG6zhzdmnxq256TlqzFBzRl2f6OOg722cYNbU8"));
        verifier.expected = Some("SHA256:bbXpuKG6zhzdmnxq256TlqzFBzRl2f6OOg722cYNbU8".into());
        assert!(verifier.check_server_key(&key).await.unwrap());
        verifier.expected = Some("SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA".into());
        assert!(!verifier.check_server_key(&key).await.unwrap());
    }

    #[tokio::test]
    async fn terminal_input_is_isolated_and_never_queued_before_authentication() {
        let state = SshState::default();
        let (first_tx, mut first_rx) = mpsc::channel(1);
        let (second_tx, mut second_rx) = mpsc::channel(1);
        let (cancel, _cancel_rx) = watch::channel(false);
        let ready = Arc::new(AtomicBool::new(false));
        {
            let mut sessions = state.sessions.lock().unwrap();
            sessions.insert("first".into(), SessionControl { tx: first_tx, cancel: cancel.clone(), ready: ready.clone(), connection: None, burrow_slot: Arc::new(Semaphore::new(1)), scheduler_slot: Arc::new(Semaphore::new(1)) });
            sessions.insert("second".into(), SessionControl { tx: second_tx, cancel, ready: Arc::new(AtomicBool::new(true)), connection: None, burrow_slot: Arc::new(Semaphore::new(1)), scheduler_slot: Arc::new(Semaphore::new(1)) });
        }
        assert!(queue_command(&state, "first", SessionCommand::Write("secret\r".into())).is_err());
        assert!(first_rx.try_recv().is_err());
        ready.store(true, Ordering::Release);
        queue_command(&state, "first", SessionCommand::Write("pwd\r".into())).unwrap();
        assert!(second_rx.try_recv().is_err());
        assert!(queue_command(&state, "first", SessionCommand::Write("unexpected replay\r".into())).is_err());
        assert!(matches!(first_rx.recv().await, Some(SessionCommand::Write(data)) if data == "pwd\r"));
        assert!(first_rx.try_recv().is_err());
    }

    // Removing exact fingerprint matching must never send credentials to a new host.
    #[test]
    fn trust_requires_exact_previously_confirmed_sha256_fingerprint() {
        let fingerprint = "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        assert!(fingerprints_match(fingerprint, fingerprint));
        assert!(!fingerprints_match("", fingerprint));
        assert!(!fingerprints_match("SHA256:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", fingerprint));
        assert!(!fingerprints_match(&fingerprint.to_lowercase(), fingerprint));
        assert!(!fingerprints_match(&format!("{fingerprint} "), fingerprint));
        assert!(!fingerprints_match("MD5:aa:bb", "MD5:aa:bb"));
    }

    #[test]
    fn rejects_zero_and_unbounded_terminal_dimensions() {
        assert!(validate_dimensions(80, 24).is_ok());
        assert!(validate_dimensions(1, 1).is_ok());
        assert!(validate_dimensions(0, 24).is_err());
        assert!(validate_dimensions(80, 0).is_err());
        assert!(validate_dimensions(u32::MAX, 24).is_err());
        assert!(validate_dimensions(80, u32::MAX).is_err());
    }

    #[test]
    fn preserves_terminal_control_input_but_rejects_oversize_pastes() {
        assert!(validate_input("\u{3}\u{1b}[A\r\n").is_ok());
        assert!(validate_input("echo café\r").is_ok());
        assert!(validate_input(&"x".repeat(70_000)).is_err());
        assert!(validate_input(&"é".repeat(40_000)).is_err());
    }

    #[test]
    fn host_validation_accepts_dns_ipv4_ipv6_but_not_urls_or_control_characters() {
        for host in ["example.com", "192.0.2.1", "::1", "2001:db8::5"] {
            assert!(validate_host(host, 22).is_ok(), "{host}");
        }
        for host in ["", " example.com", "ssh://example.com", "example.com/path", "a\nb", "a b"] {
            assert!(validate_host(host, 22).is_err(), "{host}");
        }
        assert!(validate_host("example.com", 0).is_err());
    }

    #[test]
    fn burrow_resolves_task_ids_without_shell_or_path_injection() {
        let lookup = burrow_lookup_command("task-ABC_123").unwrap();
        assert!(lookup.contains("grep -l -E --"));
        assert!(lookup.contains(r#""task_id"[[:space:]]*:[[:space:]]*"task-ABC_123""#));
        assert_eq!(burrow_file_command("/root/.hermes/profiles/leveret/a2a_conversations/ctx-123.jsonl").unwrap(), "cat -- '/root/.hermes/profiles/leveret/a2a_conversations/ctx-123.jsonl'");
        for value in ["", "task-", "../secret", "/etc/passwd", "task-x;id", "$(id)", "task-x\nwhoami", "task-x'", "task-x.jsonl", "task-x with spaces"] {
            assert!(burrow_lookup_command(value).is_err(), "{value}");
        }
        assert!(burrow_lookup_command(&format!("task-{}", "a".repeat(161))).is_err());
        for path in ["/etc/passwd", "/root/.hermes/profiles/leveret/a2a_conversations/../secret.jsonl", "/root/.hermes/profiles/leveret/a2a_conversations/task-123.jsonl", "/root/.hermes/profiles/leveret/a2a_conversations/ctx-x';id.jsonl", "/root/.hermes/profiles/leveret/a2a_conversations/ctx-x.jsonl\n/etc/passwd"] {
            assert!(burrow_file_command(path).is_err(), "{path}");
        }
    }
}
