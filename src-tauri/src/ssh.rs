use std::{
    collections::HashMap,
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    time::Duration,
};

use russh::{client, keys::{decode_secret_key, HashAlg, PrivateKeyWithHashAlg, PublicKeyOrCertificate}, ChannelMsg, Disconnect};
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, State};
use tokio::{sync::{mpsc, watch}, time::timeout};
use zeroize::Zeroize;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const SETUP_TIMEOUT: Duration = Duration::from_secs(45);
const IO_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_INPUT_BYTES: usize = 64 * 1024;
const MAX_SESSIONS: usize = 16;

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
}

#[derive(Default, Clone)]
pub struct SshState {
    sessions: Arc<Mutex<HashMap<String, SessionControl>>>,
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
        sessions.insert(session_id.clone(), SessionControl { tx, cancel, ready: ready.clone() });
    }
    let result = tokio::select! {
        biased;
        _ = cancel_rx.changed() => Err("SSH connection cancelled.".to_string()),
        result = timeout(SETUP_TIMEOUT, establish(request, &on_event)) => result.unwrap_or_else(|_| Err("SSH authentication or terminal setup timed out.".into())),
    };
    match result {
        Ok((handle, channel)) => {
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
    handle: SshHandle,
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

#[cfg(test)]
mod tests {
    use super::*;

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
            sessions.insert("first".into(), SessionControl { tx: first_tx, cancel: cancel.clone(), ready: ready.clone() });
            sessions.insert("second".into(), SessionControl { tx: second_tx, cancel, ready: Arc::new(AtomicBool::new(true)) });
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
}
