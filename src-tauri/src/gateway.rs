use std::{
    collections::HashMap,
    sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex},
    time::Duration,
};

use futures_util::{SinkExt, StreamExt};
use reqwest::Url;
use serde::Serialize;
use tauri::{ipc::Channel, State};
use tokio::{sync::{mpsc, oneshot, watch}, time::timeout};
use tokio_tungstenite::{connect_async_with_config, tungstenite::{protocol::WebSocketConfig, Message}};
use zeroize::Zeroizing;

const MAX_CONNECTIONS: usize = 8;
const MAX_TOKEN_BYTES: usize = 8 * 1024;
const MAX_MESSAGE_BYTES: usize = 2 * 1024 * 1024;
const SEND_QUEUE_CAPACITY: usize = 8;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);
const IO_TIMEOUT: Duration = Duration::from_secs(15);
const CLOSE_TIMEOUT: Duration = Duration::from_secs(1);

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum GatewayTransportEvent {
    Message { text: String },
    Closed { message: String },
}

struct Outgoing {
    text: String,
    done: oneshot::Sender<Result<(), String>>,
}

struct ConnectionControl {
    generation: Arc<()>,
    tx: mpsc::Sender<Outgoing>,
    cancel: watch::Sender<bool>,
    ready: Arc<AtomicBool>,
}

#[derive(Default, Clone)]
pub struct GatewayState {
    connections: Arc<Mutex<HashMap<String, ConnectionControl>>>,
}

// A dropped connect future, failed handshake, or stopped reader releases its slot.
// Identity is checked because disconnect can free an ID before its task finishes.
struct ConnectionGuard {
    state: GatewayState,
    connection_id: String,
    generation: Arc<()>,
}

impl Drop for ConnectionGuard {
    fn drop(&mut self) {
        if let Ok(mut connections) = self.state.connections.lock() {
            if connections.get(&self.connection_id)
                .is_some_and(|control| Arc::ptr_eq(&control.generation, &self.generation)) {
                connections.remove(&self.connection_id);
            }
        }
    }
}

struct Reservation {
    commands: mpsc::Receiver<Outgoing>,
    cancel: watch::Receiver<bool>,
    ready: Arc<AtomicBool>,
    guard: ConnectionGuard,
}

impl GatewayState {
    fn reserve(&self, connection_id: String) -> Result<Reservation, String> {
        if connection_id.is_empty() || connection_id.len() > 128 || connection_id.chars().any(char::is_control) {
            return Err("Invalid gateway connection identifier.".into());
        }
        let mut connections = self.connections.lock().map_err(|_| "Gateway connection state unavailable.")?;
        if connections.contains_key(&connection_id) {
            return Err("This gateway connection is already active.".into());
        }
        if connections.len() >= MAX_CONNECTIONS {
            return Err("The gateway connection limit has been reached.".into());
        }
        let (tx, commands) = mpsc::channel(SEND_QUEUE_CAPACITY);
        let (cancel_tx, cancel) = watch::channel(false);
        let ready = Arc::new(AtomicBool::new(false));
        let generation = Arc::new(());
        connections.insert(connection_id.clone(), ConnectionControl {
            generation: generation.clone(), tx, cancel: cancel_tx, ready: ready.clone(),
        });
        Ok(Reservation { commands, cancel, ready, guard: ConnectionGuard {
            state: self.clone(), connection_id, generation,
        } })
    }

    fn disconnect(&self, connection_id: &str) -> Result<(), String> {
        let mut connections = self.connections.lock().map_err(|_| "Gateway connection state unavailable.")?;
        if let Some(control) = connections.remove(connection_id) { let _ = control.cancel.send(true); }
        Ok(())
    }

    pub fn disconnect_all(&self) {
        if let Ok(mut connections) = self.connections.lock() {
            for (_, control) in connections.drain() { let _ = control.cancel.send(true); }
        }
    }
}

fn authenticated_url(raw: &str, token: &str) -> Result<Url, String> {
    const INVALID_URL: &str = "Enter a secure gateway WebSocket URL ending in /api/ws. Local connections may use ws://127.0.0.1 or ws://[::1].";
    if raw.len() > 8192 || raw.chars().any(|c| c.is_control() || c.is_whitespace() || c == '\\') {
        return Err(INVALID_URL.into());
    }
    let mut url = Url::parse(raw).map_err(|_| INVALID_URL)?;
    let authority = raw.split_once("://").map(|(_, rest)| rest.split('/').next().unwrap_or("")).unwrap_or("");
    if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some()
        || authority.contains('@') || url.query().is_some() || url.fragment().is_some()
        || !url.path().ends_with("/api/ws") || url.port() == Some(0) {
        return Err(INVALID_URL.into());
    }
    let literal_loopback = ["127.0.0.1", "[::1]"].iter().any(|host| {
        authority.strip_prefix(host).is_some_and(|suffix| suffix.is_empty() || suffix.starts_with(':'))
    });
    if url.scheme() != "wss" && !(url.scheme() == "ws" && literal_loopback) {
        return Err(INVALID_URL.into());
    }
    if token.is_empty() || token.len() > MAX_TOKEN_BYTES || token.chars().any(char::is_control) {
        return Err("Enter a gateway session token of at most 8 KiB without control characters.".into());
    }
    // Hermes authenticates its WebSocket handshake with a query session token.
    // URL encoding ensures reserved token characters cannot add query parameters.
    url.query_pairs_mut().append_pair("token", token);
    Ok(url)
}

fn validate_message(text: &str) -> Result<(), String> {
    if text.len() > MAX_MESSAGE_BYTES {
        return Err("Gateway message exceeds 2 MiB.".into());
    }
    Ok(())
}

type EventSink = Box<dyn Fn(GatewayTransportEvent) -> bool + Send + Sync>;

async fn open_gateway(connection_id: String, raw_url: String, token: String, events: EventSink, state: GatewayState) -> Result<(), String> {
    let token = Zeroizing::new(token);
    let url = authenticated_url(&raw_url, &token)?;
    let request_url = Zeroizing::new(url.to_string());
    drop(url);
    drop(token);
    let Reservation { mut commands, mut cancel, ready, guard } = state.reserve(connection_id)?;
    let config = WebSocketConfig::default()
        .max_message_size(Some(MAX_MESSAGE_BYTES))
        .max_frame_size(Some(MAX_MESSAGE_BYTES))
        .write_buffer_size(16 * 1024)
        .max_write_buffer_size(2 * MAX_MESSAGE_BYTES);
    let connection = tokio::select! {
        biased;
        _ = cancel.changed() => return Err("Gateway connection cancelled.".into()),
        result = timeout(CONNECT_TIMEOUT, connect_async_with_config(request_url.as_str(), Some(config), false)) => result,
    };
    drop(request_url);
    let (mut socket, _) = connection
        .map_err(|_| "Gateway connection timed out.")?
        .map_err(|_| "Could not connect to the gateway. Check its address, session token, and availability.")?;
    if *cancel.borrow() { return Err("Gateway connection cancelled.".into()); }
    ready.store(true, Ordering::Release);
    tauri::async_runtime::spawn(async move {
        let message = loop {
            if *cancel.borrow() { break "Gateway disconnected."; }
            tokio::select! {
                _ = cancel.changed() => break "Gateway disconnected.",
                command = commands.recv() => {
                    let Some(Outgoing { text, done }) = command else { break "Gateway disconnected."; };
                    if done.is_closed() { continue; }
                    let result = tokio::select! {
                        biased;
                        _ = cancel.changed() => Err("Gateway disconnected.".to_string()),
                        result = timeout(IO_TIMEOUT, socket.send(Message::Text(text.into()))) => match result {
                            Ok(Ok(())) => Ok(()),
                            Ok(Err(_)) => Err("Could not send the gateway message.".into()),
                            Err(_) => Err("Gateway message delivery timed out.".into()),
                        },
                    };
                    let failed = result.is_err();
                    let _ = done.send(result);
                    if failed { break "Gateway connection closed during message delivery."; }
                },
                incoming = socket.next() => match incoming {
                    Some(Ok(Message::Text(text))) => {
                        if !events(GatewayTransportEvent::Message { text: text.to_string() }) {
                            break "Gateway view closed.";
                        }
                    },
                    Some(Ok(Message::Close(_))) | None => break "Gateway connection closed.",
                    Some(Ok(Message::Binary(_))) => break "Gateway sent an unsupported binary message.",
                    Some(Ok(Message::Ping(_))) => {
                        // Tungstenite queues the protocol pong automatically.
                        let flushed = tokio::select! {
                            biased;
                            _ = cancel.changed() => false,
                            result = timeout(IO_TIMEOUT, socket.flush()) => matches!(result, Ok(Ok(()))),
                        };
                        if !flushed { break "Gateway connection stopped responding."; }
                    },
                    Some(Ok(_)) => {},
                    Some(Err(_)) => break "Gateway connection failed or sent an invalid message.",
                },
            }
        };
        ready.store(false, Ordering::Release);
        // Cleanup precedes the terminal event so a consumer can reconnect at once.
        drop(guard);
        drop(commands);
        let _ = timeout(CLOSE_TIMEOUT, socket.close(None)).await;
        let _ = events(GatewayTransportEvent::Closed { message: message.into() });
    });
    Ok(())
}

async fn send_gateway(connection_id: &str, text: String, state: &GatewayState) -> Result<(), String> {
    validate_message(&text)?;
    let (tx, cancel) = {
        let connections = state.connections.lock().map_err(|_| "Gateway connection state unavailable.")?;
        let control = connections.get(connection_id).ok_or("Gateway is not connected.")?;
        if !control.ready.load(Ordering::Acquire) { return Err("Gateway is still connecting.".into()); }
        (control.tx.clone(), control.cancel.clone())
    };
    let (done, result) = oneshot::channel();
    // Reject excess senders before they can wait while retaining another payload.
    tx.try_send(Outgoing { text, done }).map_err(|error| match error {
        mpsc::error::TrySendError::Full(_) => "Gateway send queue is full. Try again shortly.",
        mpsc::error::TrySendError::Closed(_) => "Gateway is not connected.",
    })?;
    match timeout(IO_TIMEOUT, async {
        result.await.map_err(|_| "Gateway connection closed during message delivery.".to_string())?
    }).await {
        Ok(result) => result,
        Err(_) => {
            // Cancel on backpressure timeout so queued work cannot execute later.
            let _ = cancel.send(true);
            Err("Gateway message delivery timed out.".into())
        },
    }
}

#[tauri::command]
pub async fn gateway_connect(connection_id: String, url: String, token: String, on_event: Channel<GatewayTransportEvent>, state: State<'_, GatewayState>) -> Result<(), String> {
    open_gateway(connection_id, url, token, Box::new(move |event| on_event.send(event).is_ok()), state.inner().clone()).await
}

#[tauri::command]
pub async fn gateway_send(connection_id: String, text: String, state: State<'_, GatewayState>) -> Result<(), String> {
    send_gateway(&connection_id, text, state.inner()).await
}

#[tauri::command]
pub fn gateway_disconnect(connection_id: String, state: State<'_, GatewayState>) -> Result<(), String> {
    state.disconnect(&connection_id)
}

#[tauri::command]
pub fn gateway_disconnect_all(state: State<'_, GatewayState>) {
    state.disconnect_all();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_secure_and_literal_loopback_gateway_endpoints() {
        for endpoint in [
            "wss://gateway.example/api/ws",
            "wss://gateway.example:8443/hermes/api/ws",
            "ws://127.0.0.1:8642/api/ws",
            "ws://[::1]:8642/api/ws",
        ] {
            assert!(authenticated_url(endpoint, "session-token").is_ok(), "{endpoint}");
        }
    }

    #[test]
    fn rejects_insecure_ambiguous_and_credential_bearing_endpoints() {
        for endpoint in [
            "https://gateway.example/api/ws", "ws://gateway.example/api/ws",
            "ws://localhost/api/ws", "ws://127.0.0.2/api/ws",
            "ws://2130706433/api/ws", "ws://127.1/api/ws",
            "wss://user:pass@gateway.example/api/ws", "wss://@gateway.example/api/ws",
            "wss://gateway.example/api/ws?token=leaked", "wss://gateway.example/api/ws?",
            "wss://gateway.example/api/ws#secret", "wss://gateway.example/api/ws#",
            "wss://gateway.example/api/ws\n", " wss://gateway.example/api/ws",
            "wss://gateway.example\\api/ws", "wss://gateway.example/api/chat",
        ] {
            let error = authenticated_url(endpoint, "private-session-token").unwrap_err();
            assert!(!error.contains(endpoint));
            assert!(!error.contains("private-session-token"));
        }
    }

    #[test]
    fn encodes_credentials_as_a_single_query_value() {
        let endpoint = authenticated_url("wss://gateway.example/api/ws", "a+b&c=?#/% ü").unwrap();
        assert_eq!(endpoint.query(), Some("token=a%2Bb%26c%3D%3F%23%2F%25+%C3%BC"));
        assert_eq!(endpoint.query_pairs().collect::<Vec<_>>(), vec![("token".into(), "a+b&c=?#/% ü".into())]);
    }

    #[test]
    fn credential_and_message_limits_count_bytes() {
        assert!(authenticated_url("wss://gateway.example/api/ws", &"x".repeat(8192)).is_ok());
        assert!(authenticated_url("wss://gateway.example/api/ws", &"x".repeat(8193)).is_err());
        assert!(authenticated_url("wss://gateway.example/api/ws", "").is_err());
        assert!(authenticated_url("wss://gateway.example/api/ws", "token\n").is_err());
        assert!(validate_message(&"x".repeat(2 * 1024 * 1024)).is_ok());
        assert!(validate_message(&"x".repeat(2 * 1024 * 1024 + 1)).is_err());
        assert!(validate_message(&"ü".repeat(1024 * 1024 + 1)).is_err());
    }

    #[test]
    fn reservations_limit_connections_and_old_cleanup_cannot_remove_a_replacement() {
        let state = GatewayState::default();
        let mut reservations = Vec::new();
        for index in 0..8 {
            reservations.push(state.reserve(format!("connection-{index}")).unwrap());
        }
        assert!(state.reserve("ninth".into()).is_err());
        assert!(state.reserve("connection-0".into()).is_err());
        state.disconnect("connection-0").unwrap();
        let replacement = state.reserve("connection-0".into()).unwrap();
        drop(reservations.remove(0));
        assert!(state.reserve("connection-0".into()).is_err());
        state.disconnect_all();
        assert!(state.connections.lock().unwrap().is_empty());
        assert!(*replacement.cancel.borrow());
    }

    #[test]
    fn event_wire_contract_contains_only_transport_payloads() {
        assert_eq!(serde_json::to_value(GatewayTransportEvent::Message { text: "hello".into() }).unwrap(),
            serde_json::json!({ "type": "message", "text": "hello" }));
        assert_eq!(serde_json::to_value(GatewayTransportEvent::Closed { message: "Gateway closed.".into() }).unwrap(),
            serde_json::json!({ "type": "closed", "message": "Gateway closed." }));
    }

    #[tokio::test]
    async fn full_send_queue_rejects_immediately_without_retaining_another_payload() {
        let state = GatewayState::default();
        let mut reservation = state.reserve("backpressure".into()).unwrap();
        reservation.ready.store(true, Ordering::Release);
        let mut sends = Vec::new();
        for _ in 0..8 {
            let sender_state = state.clone();
            sends.push(tokio::spawn(async move {
                send_gateway("backpressure", "queued".into(), &sender_state).await
            }));
        }
        timeout(Duration::from_secs(5), async {
            while reservation.commands.len() != 8 { tokio::task::yield_now().await; }
        }).await.unwrap();
        let rejected = timeout(Duration::from_secs(1), send_gateway("backpressure", "overflow".into(), &state))
            .await.expect("A full queue must reject immediately");
        assert!(rejected.is_err());
        for _ in 0..8 {
            let command = reservation.commands.recv().await.unwrap();
            assert_eq!(command.text, "queued");
            command.done.send(Ok(())).unwrap();
        }
        for send in sends { send.await.unwrap().unwrap(); }
    }

    #[tokio::test]
    async fn real_loopback_handshake_encodes_token_and_exchanges_messages() {
        use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_hdr_async(stream, |request: &Request, response: Response| {
                assert_eq!(request.uri().path(), "/api/ws");
                assert_eq!(request.uri().query(), Some("token=private%2B%26%3F%23"));
                assert!(!request.headers().contains_key("authorization"));
                Ok(response)
            }).await.unwrap();
            let request = socket.next().await.unwrap().unwrap();
            assert_eq!(request.into_text().unwrap(), "client message");
            socket.send(Message::Text("server message".into())).await.unwrap();
            socket.close(None).await.unwrap();
        });
        let state = GatewayState::default();
        let (events, mut received) = mpsc::unbounded_channel();
        open_gateway("roundtrip".into(), format!("ws://{address}/api/ws"), "private+&?#".into(),
            Box::new(move |event| events.send(event).is_ok()), state.clone()).await.unwrap();
        send_gateway("roundtrip", "client message".into(), &state).await.unwrap();
        let message = timeout(Duration::from_secs(5), received.recv()).await.unwrap().unwrap();
        assert!(matches!(message, GatewayTransportEvent::Message { text } if text == "server message"));
        let closed = timeout(Duration::from_secs(5), received.recv()).await.unwrap().unwrap();
        assert!(matches!(closed, GatewayTransportEvent::Closed { .. }));
        server.await.unwrap();
        assert!(state.connections.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn dropped_event_consumer_closes_the_socket_and_releases_capacity() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            socket.send(Message::Text("delivery will fail".into())).await.unwrap();
            let closed = timeout(Duration::from_secs(5), socket.next()).await.unwrap();
            assert!(matches!(closed, Some(Ok(Message::Close(_))) | None));
        });
        let state = GatewayState::default();
        open_gateway("abandoned".into(), format!("ws://{address}/api/ws"), "private".into(),
            Box::new(|_| false), state.clone()).await.unwrap();
        server.await.unwrap();
        timeout(Duration::from_secs(5), async {
            while !state.connections.lock().unwrap().is_empty() { tokio::task::yield_now().await; }
        }).await.unwrap();
    }

    #[tokio::test]
    async fn oversized_incoming_message_is_closed_without_forwarding() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut socket = tokio_tungstenite::accept_async(stream).await.unwrap();
            let _ = socket.send(Message::Text("x".repeat(2 * 1024 * 1024 + 1).into())).await;
            let _ = timeout(Duration::from_secs(5), socket.next()).await;
        });
        let state = GatewayState::default();
        let (events, mut received) = mpsc::unbounded_channel();
        open_gateway("oversized".into(), format!("ws://{address}/api/ws"), "private".into(),
            Box::new(move |event| events.send(event).is_ok()), state.clone()).await.unwrap();
        let event = timeout(Duration::from_secs(5), received.recv()).await.unwrap().unwrap();
        assert!(matches!(event, GatewayTransportEvent::Closed { .. }));
        assert!(state.connections.lock().unwrap().is_empty());
        server.await.unwrap();
    }

    #[tokio::test]
    async fn disconnect_all_cancels_an_incomplete_handshake() {
        use tokio::io::AsyncReadExt;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let state = GatewayState::default();
        let pending_state = state.clone();
        let pending = tokio::spawn(async move {
            open_gateway("pending".into(), format!("ws://{address}/api/ws"), "private".into(),
                Box::new(|_| true), pending_state).await
        });
        let (mut stream, _) = listener.accept().await.unwrap();
        state.disconnect_all();
        assert!(timeout(Duration::from_secs(5), pending).await.unwrap().unwrap().is_err());
        assert!(state.connections.lock().unwrap().is_empty());
        let mut remaining = Vec::new();
        timeout(Duration::from_secs(5), stream.read_to_end(&mut remaining)).await.unwrap().unwrap();
    }

    #[tokio::test]
    async fn failed_handshake_never_exposes_the_url_token_or_server_response() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buffer = [0_u8; 4096];
            let _ = stream.read(&mut buffer).await.unwrap();
            stream.write_all(b"HTTP/1.1 401 secret-server-reason\r\nContent-Length: 0\r\n\r\n").await.unwrap();
        });
        let state = GatewayState::default();
        let result = open_gateway("rejected".into(), format!("ws://{address}/api/ws"), "private-session".into(),
            Box::new(|_| true), state.clone()).await;
        let error = result.unwrap_err();
        for secret in ["private-session", "secret-server-reason", "127.0.0.1"] {
            assert!(!error.contains(secret));
        }
        server.await.unwrap();
        assert!(state.connections.lock().unwrap().is_empty());
    }
}
