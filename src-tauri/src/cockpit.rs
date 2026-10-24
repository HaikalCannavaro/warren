//! Read-only Kanban/A2A transport. No direct SQLite mutation or remote command API.
use std::{collections::HashMap, net::IpAddr, sync::{Arc, Mutex}, time::Duration};
use futures_util::{SinkExt, StreamExt};
use reqwest::{redirect::Policy, Url};
use serde::Serialize;
use tauri::{ipc::Channel, State};
use tokio::sync::watch;
use tokio_tungstenite::{connect_async_with_config, tungstenite::{client::IntoClientRequest, http::HeaderValue, protocol::WebSocketConfig, Message}};
use zeroize::Zeroizing;
const MAX_BODY: usize = 4 * 1024 * 1024;

fn private_host(host: &str) -> bool {
    let host = host.trim_matches(['[', ']']);
    match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(ip)) => ip.is_loopback() || ip.is_private() || (ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1])),
        Ok(IpAddr::V6(ip)) => ip.is_loopback() || ip.is_unique_local(),
        Err(_) => host.ends_with(".ts.net"),
    }
}
fn checked_url(raw: &str, websocket: bool) -> Result<Url, String> {
    if raw.len() > 4096 || raw.chars().any(|c| c.is_control() || c.is_whitespace() || c == '\\') { return Err("Enter a valid service address.".into()); }
    let url = Url::parse(raw).map_err(|_| "Invalid service address.")?;
    if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() || url.port() == Some(0) { return Err("Service URLs must not contain credentials, query parameters, or fragments.".into()); }
    let secure = if websocket { "wss" } else { "https" };
    let local = if websocket { "ws" } else { "http" };
    if url.scheme() != secure && !(url.scheme() == local && private_host(url.host_str().unwrap_or(""))) { return Err("Use HTTPS/WSS, or a private/Tailscale address for HTTP/WS.".into()); }
    Ok(url)
}
fn allowed_path(path: &str) -> bool {
    matches!(path, "/board" | "/orchestration" | "/workers/active" | "/api/v1/swarm/feed") ||
        path.strip_prefix("/tasks/").is_some_and(|id| !id.is_empty() && id.len() <= 256 && id.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_')))
}
#[tauri::command]
pub async fn cockpit_get(base_url: String, path: String, token: String) -> Result<String, String> {
    let token = Zeroizing::new(token);
    if !allowed_path(&path) { return Err("This service route is not supported.".into()); }
    let mut url = checked_url(&base_url, false)?;
    url.set_path(&format!("{}{}", url.path().trim_end_matches('/'), path));
    let client = reqwest::Client::builder().no_proxy().redirect(Policy::none()).timeout(Duration::from_secs(15)).build().map_err(|_| "Could not initialize service transport.")?;
    let mut request = client.get(url).header("Accept", "application/json");
    if !token.is_empty() { request = request.bearer_auth(token.as_str()); }
    let response = request.send().await.map_err(|_| "Service request failed. Check address, Tailscale access, and authentication.")?;
    if !response.status().is_success() { return Err(format!("Service returned HTTP {}.", response.status().as_u16())); }
    let mut stream = response.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "Service response was interrupted.")?;
        if body.len() + chunk.len() > MAX_BODY { return Err("Service response exceeded 4 MiB.".into()); }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|_| "Service response was not UTF-8.".into())
}
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ServiceEvent { Open, Message { text: String }, Closed { message: String } }
#[derive(Default, Clone)]
pub struct CockpitState { streams: Arc<Mutex<HashMap<String, watch::Sender<bool>>>> }
impl CockpitState {
    pub fn disconnect_all(&self) { if let Ok(streams) = self.streams.lock() { for cancel in streams.values() { let _ = cancel.send(true); } } }
}
#[tauri::command]
pub async fn cockpit_events_open(connection_id: String, url: String, token: String, on_event: Channel<ServiceEvent>, state: State<'_, CockpitState>) -> Result<(), String> {
    let token = Zeroizing::new(token);
    let url = checked_url(&url, true)?;
    if connection_id.is_empty() || connection_id.len() > 128 { return Err("Invalid service connection ID.".into()); }
    let mut request = url.as_str().into_client_request().map_err(|_| "Invalid event stream address.")?;
    if !token.is_empty() { request.headers_mut().insert("Authorization", HeaderValue::from_str(&format!("Bearer {}", token.as_str())).map_err(|_| "Invalid service token.")?); }
    let (cancel, mut cancellation) = watch::channel(false);
    let streams = state.streams.clone();
    {
        let mut active = streams.lock().map_err(|_| "Service stream state unavailable.")?;
        if active.contains_key(&connection_id) || active.len() >= 8 { return Err("Service stream limit reached or ID already in use.".into()); }
        active.insert(connection_id.clone(), cancel);
    }
    // Spawn before connecting so cancellation/lock also covers an incomplete handshake.
    tauri::async_runtime::spawn(async move {
        let operation = async {
            let (mut socket, _) = tokio::time::timeout(Duration::from_secs(15), connect_async_with_config(request, Some(WebSocketConfig::default().max_message_size(Some(MAX_BODY)).max_frame_size(Some(MAX_BODY))), false)).await.map_err(|_| "Event stream connection timed out.")?.map_err(|_| "Could not connect to service events.")?;
            on_event.send(ServiceEvent::Open).map_err(|_| "Service view closed.")?;
            while let Some(frame) = socket.next().await {
                match frame.map_err(|_| "Service event transport failed.")? {
                    Message::Text(text) => {
                        if text.len() > MAX_BODY { return Err("Service event exceeded 4 MiB."); }
                        on_event.send(ServiceEvent::Message { text: text.to_string() }).map_err(|_| "Service view closed.")?;
                    }
                    Message::Ping(bytes) => socket.send(Message::Pong(bytes)).await.map_err(|_| "Service heartbeat failed.")?,
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            Ok::<(), &str>(())
        };
        let reason = tokio::select! { biased; _ = cancellation.changed() => "Service stream disconnected.".to_string(), result = operation => result.err().unwrap_or("Service stream closed.").to_string() };
        if let Ok(mut active) = streams.lock() { active.remove(&connection_id); }
        let _ = on_event.send(ServiceEvent::Closed { message: reason });
    });
    Ok(())
}
#[tauri::command]
pub async fn cockpit_events_close(connection_id: String, state: State<'_, CockpitState>) -> Result<(), String> {
    if let Some(cancel) = state.streams.lock().map_err(|_| "Service stream state unavailable.")?.get(&connection_id) { let _ = cancel.send(true); }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn read_only_service_transport_sends_auth_and_rejects_redirects() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        for redirect in [false, true] {
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let address = listener.local_addr().unwrap();
            let server = tokio::spawn(async move {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut bytes = vec![0; 8192];
                let count = socket.read(&mut bytes).await.unwrap();
                let request = String::from_utf8_lossy(&bytes[..count]);
                assert!(request.starts_with("GET /api/plugins/kanban/board HTTP/1.1"));
                assert!(request.to_lowercase().contains("authorization: bearer fixture-token"));
                let response = if redirect { "HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/secret\r\nContent-Length: 0\r\nConnection: close\r\n\r\n" } else { "HTTP/1.1 200 OK\r\nContent-Length: 12\r\nConnection: close\r\n\r\n{\"tasks\":[]}" };
                socket.write_all(response.as_bytes()).await.unwrap();
            });
            let response = cockpit_get(format!("http://{address}/api/plugins/kanban"), "/board".into(), "fixture-token".into()).await;
            if redirect { assert!(response.unwrap_err().contains("302")); } else { assert_eq!(response.unwrap(), "{\"tasks\":[]}"); }
            server.await.unwrap();
        }
    }

    #[test]
    fn service_urls_accept_explicit_private_endpoints_and_reject_credential_leaks() {
        for url in ["http://100.65.133.127:9119/api/plugins/kanban", "http://127.0.0.1:9119", "https://cockpit.example"] { assert!(checked_url(url, false).is_ok()); }
        for url in ["http://example.com", "https://user:secret@example.com", "http://100.65.133.127:9119?token=secret", "file:///root/.hermes/kanban/kanban.db"] { assert!(checked_url(url, false).is_err()); }
        assert!(checked_url("ws://100.65.133.127:9119/api/plugins/kanban/events", true).is_ok());
        assert!(!allowed_path("/tasks/../secrets"));
        assert!(allowed_path("/tasks/task-8f92a1"));
    }
}
