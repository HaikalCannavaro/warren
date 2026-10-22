//! Native Hermes API transport. No automatic retries, redirects, or remote stop claims.

use futures_util::StreamExt;
use reqwest::{header, Client, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{net::IpAddr, time::Duration};
use tauri::ipc::Channel;

const MAX_FRAME_BYTES: usize = 512 * 1024;
const MAX_STREAM_BYTES: usize = 16 * 1024 * 1024;
const MAX_REQUEST_BYTES: usize = 4 * 1024 * 1024;
const MAX_PROBE_BYTES: usize = 256 * 1024;
const IDLE_TIMEOUT: Duration = Duration::from_secs(75);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesRequest {
    request_id: String,
    conversation_id: String,
    url: String,
    token: String,
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Deserialize, Serialize)]
struct ChatMessage {
    role: ChatRole,
    content: String,
}

#[derive(Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum ChatRole {
    User,
    Assistant,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum HermesEvent {
    Delta { text: String },
    Tool { text: String },
    Done {
        #[serde(rename = "finishReason")]
        finish_reason: String,
    },
    Error { message: String, uncertain: bool },
}

#[derive(Serialize)]
pub struct HermesCapabilities {
    reachable: bool,
    streaming: bool,
    detail: String,
}

#[derive(Clone, Debug)]
struct Failure {
    message: String,
    uncertain: bool,
}

impl Failure {
    fn certain(message: impl Into<String>) -> Self {
        Self { message: message.into(), uncertain: false }
    }

    fn uncertain(message: impl Into<String>) -> Self {
        Self { message: message.into(), uncertain: true }
    }
}

/// Keep parsing strict before URL normalization can disguise userinfo or an IPv4 shorthand.
fn normalize_base_url(input: &str) -> Result<Url, Failure> {
    let input = input.trim();
    if input.is_empty() || input.len() > 2048 || input.chars().any(|c| c.is_control() || c == '\\') {
        return Err(Failure::certain("Enter a valid Hermes base URL."));
    }
    let (_, rest) = input.split_once("://").ok_or_else(|| Failure::certain("Use an HTTPS base URL, or HTTP with a literal loopback address."))?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.contains('@') {
        return Err(Failure::certain("Do not put credentials in the URL. Use the API token field."));
    }
    let mut url = Url::parse(input).map_err(|_| Failure::certain("The Hermes base URL is invalid."))?;
    if url.host_str().is_none() || !url.username().is_empty() || url.password().is_some()
        || url.query().is_some() || url.fragment().is_some()
    {
        return Err(Failure::certain("The base URL must have a host and no credentials, query, or fragment."));
    }
    match url.scheme() {
        "https" => {}
        "http" => {
            let literal_host = if let Some(bracketed) = authority.strip_prefix('[') {
                bracketed.split_once(']').map(|(host, _)| host).unwrap_or_default()
            } else {
                authority.split(':').next().unwrap_or_default()
            };
            let loopback = literal_host.parse::<IpAddr>().map(|ip| ip.is_loopback()).unwrap_or(false);
            if !loopback {
                return Err(Failure::certain("Remote Hermes connections require HTTPS. HTTP is allowed only for literal loopback addresses such as 127.0.0.1 or [::1]."));
            }
        }
        _ => return Err(Failure::certain("Use HTTPS, or HTTP with a literal loopback address.")),
    }
    let path = url.path().trim_end_matches('/');
    if path.ends_with("/chat/completions") || path.ends_with("/models") {
        return Err(Failure::certain("Enter the API base URL ending in /v1, not an individual endpoint."));
    }
    let path = if path.ends_with("/v1") { path.to_owned() } else { format!("{path}/v1") };
    url.set_path(&path);
    Ok(url)
}

fn endpoint(base: &Url, suffix: &str) -> Url {
    let mut url = base.clone();
    url.set_path(&format!("{}/{suffix}", base.path()));
    url
}

fn authorization(token: &str) -> Result<header::HeaderValue, Failure> {
    let token = token.trim();
    if token.is_empty() || token.len() > 8192 || !token.bytes().all(|b| b.is_ascii_graphic()) {
        return Err(Failure::certain("Enter a valid Hermes API token."));
    }
    let mut value = header::HeaderValue::from_str(&format!("Bearer {token}"))
        .map_err(|_| Failure::certain("The API token contains unsupported characters."))?;
    value.set_sensitive(true);
    Ok(value)
}

fn client() -> Result<Client, Failure> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .retry(reqwest::retry::never())
        // Do not send loopback bearer credentials through an inherited system proxy.
        .no_proxy()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(IDLE_TIMEOUT)
        .user_agent(concat!("Warren/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| Failure::certain("The secure HTTP client could not be initialized."))
}

fn http_failure(status: StatusCode) -> Failure {
    match status.as_u16() {
        401 | 403 => Failure::certain("Hermes rejected the API credentials. Check the token and profile URL."),
        404 => Failure::certain("The Hermes endpoint was not found. Check the API base URL and server configuration."),
        409 => Failure::certain("Hermes refused this request identity. Do not resend it as new work until you inspect the original turn."),
        429 => Failure::certain("Hermes refused the request because a limit was reached. No automatic retry was made."),
        400..=499 => Failure::certain(format!("Hermes rejected the request (HTTP {}). No automatic retry was made.", status.as_u16())),
        300..=399 => Failure::uncertain("Hermes returned a redirect, which was not followed. Check the final endpoint; execution status is unknown."),
        _ => Failure::uncertain(format!("Hermes returned HTTP {}. Execution status is unknown; check the server before sending again.", status.as_u16())),
    }
}

#[tauri::command]
pub async fn probe_hermes(url: String, token: String) -> Result<HermesCapabilities, String> {
    probe_inner(&url, &token).await.map_err(|error| error.message)
}

async fn probe_inner(url: &str, token: &str) -> Result<HermesCapabilities, Failure> {
    let base = normalize_base_url(url)?;
    let auth = authorization(token)?;
    let response = client()?.get(endpoint(&base, "models"))
        .header(header::AUTHORIZATION, auth)
        .header(header::ACCEPT, "application/json")
        .timeout(Duration::from_secs(20))
        .send().await
        .map_err(|_| Failure::certain("Could not reach the authenticated Hermes model endpoint. Check the address, network, and TLS certificate."))?;
    if !response.status().is_success() { return Err(http_failure(response.status())); }
    if response.content_length().is_some_and(|size| size > MAX_PROBE_BYTES as u64) {
        return Err(Failure::certain("The model endpoint response exceeded the safe size limit."));
    }
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| Failure::certain("The model endpoint response was interrupted."))?;
        if body.len() + chunk.len() > MAX_PROBE_BYTES {
            return Err(Failure::certain("The model endpoint response exceeded the safe size limit."));
        }
        body.extend_from_slice(&chunk);
    }
    let models: Value = serde_json::from_slice(&body)
        .map_err(|_| Failure::certain("The model endpoint did not return the expected JSON format."))?;
    if !models.get("data").is_some_and(Value::is_array) {
        return Err(Failure::certain("This endpoint did not return an OpenAI-compatible models list."));
    }
    Ok(HermesCapabilities {
        reachable: true,
        streaming: false,
        detail: "Authenticated model endpoint reachable. Streaming is checked when sending a message; tools and remote cancellation have not been verified.".into(),
    })
}

fn validate_request(request: &HermesRequest) -> Result<(), Failure> {
    for (id, max) in [(&request.request_id, 255), (&request.conversation_id, 256)] {
        if id.is_empty() || id.len() > max || !id.bytes().all(|b| b.is_ascii_graphic()) {
            return Err(Failure::certain("The request and conversation need valid unique identifiers."));
        }
    }
    if request.model.trim().is_empty() || request.model.len() > 200 || request.model.chars().any(char::is_control) {
        return Err(Failure::certain("Enter a valid Hermes model name."));
    }
    if request.messages.is_empty() || request.messages.len() > 1000
        || request.messages.last().is_none_or(|m| m.role != ChatRole::User || m.content.trim().is_empty())
    {
        return Err(Failure::certain("A chat request must end with a nonempty user message and contain at most 1,000 messages."));
    }
    let size = request.messages.iter().try_fold(0usize, |size, message| size.checked_add(message.content.len()));
    if size.is_none_or(|size| size > MAX_REQUEST_BYTES) {
        return Err(Failure::certain("This conversation exceeds the 4 MiB request limit. Start a shorter conversation."));
    }
    Ok(())
}

/// Errors travel through one channel event. Only an undeliverable event rejects the
/// command, preventing the frontend from seeing both an event and a rejection.
#[tauri::command]
pub async fn chat_stream(request: HermesRequest, on_event: Channel<HermesEvent>) -> Result<(), String> {
    if let Err(error) = chat_inner(request, &on_event).await {
        let message = error.message.clone();
        on_event.send(HermesEvent::Error { message: error.message, uncertain: error.uncertain })
            .map_err(|_| message)?;
    }
    Ok(())
}

fn emit(channel: &Channel<HermesEvent>, event: HermesEvent) -> Result<(), Failure> {
    channel.send(event).map_err(|_| Failure::uncertain("The chat view stopped receiving the response. Hermes may still be running; remote cancellation was not requested."))
}

async fn chat_inner(request: HermesRequest, channel: &Channel<HermesEvent>) -> Result<(), Failure> {
    validate_request(&request)?;
    let base = normalize_base_url(&request.url)?;
    let auth = authorization(&request.token)?;
    let client = client()?;
    let body = serde_json::json!({ "model": request.model, "messages": request.messages, "stream": true });
    let outbound = client.post(endpoint(&base, "chat/completions"))
        .header(header::AUTHORIZATION, auth)
        .header(header::ACCEPT, "text/event-stream")
        .header("X-Hermes-Session-Key", request.conversation_id)
        .header("Idempotency-Key", request.request_id)
        .timeout(Duration::from_secs(2 * 60 * 60))
        .json(&body)
        .build().map_err(|_| Failure::certain("The Hermes request could not be prepared."))?;
    // From execute onward, a transport error does not prove the turn never ran.
    let response = tokio::time::timeout(IDLE_TIMEOUT, client.execute(outbound)).await
        .map_err(|_| Failure::uncertain("Hermes did not return response headers in time. Execution status is unknown; no retry was made."))?
        .map_err(|_| Failure::uncertain("The connection to Hermes failed. Execution status is unknown; check the server before sending again."))?;
    if !response.status().is_success() { return Err(http_failure(response.status())); }
    let is_sse = response.headers().get(header::CONTENT_TYPE).and_then(|h| h.to_str().ok())
        .and_then(|h| h.split(';').next()).is_some_and(|mime| mime.trim().eq_ignore_ascii_case("text/event-stream"));
    if !is_sse {
        return Err(Failure::uncertain("Hermes did not return an event stream. The turn may have run; inspect the server before resending."));
    }
    if response.content_length().is_some_and(|size| size > MAX_STREAM_BYTES as u64) {
        return Err(Failure::uncertain("The Hermes response exceeded the safe size limit. Execution status is unknown."));
    }
    let mut stream = response.bytes_stream();
    let mut decoder = SseDecoder::default();
    let mut state = CompletionState::default();
    let mut total = 0usize;
    loop {
        let chunk = tokio::time::timeout(IDLE_TIMEOUT, stream.next()).await
            .map_err(|_| Failure::uncertain("The Hermes stream stalled for 75 seconds. Hermes may still be running; no retry was made."))?;
        let Some(chunk) = chunk else { break };
        let chunk = chunk.map_err(|_| Failure::uncertain("The Hermes stream was interrupted. The result is unknown; no retry was made."))?;
        total = total.checked_add(chunk.len()).ok_or_else(|| Failure::uncertain("The Hermes response exceeded the safe size limit."))?;
        if total > MAX_STREAM_BYTES {
            return Err(Failure::uncertain("The Hermes response exceeded 16 MiB. Hermes may still be running; no retry was made."));
        }
        // Byte arrivals, including SSE comments, reset the idle watchdog.
        for bytes in chunk.chunks(8 * 1024) {
            for frame in decoder.push(bytes)? {
                for event in state.accept(frame)? { emit(channel, event)?; }
                if state.completed { return Ok(()); }
            }
        }
    }
    for frame in decoder.finish()? {
        for event in state.accept(frame)? { emit(channel, event)?; }
    }
    if let Some(event) = state.finish()? { emit(channel, event)?; }
    Ok(())
}

#[derive(Debug)]
struct SseFrame {
    event: String,
    data: String,
}

/// Decode lines from bytes, so a network split inside UTF-8 cannot corrupt text.
#[derive(Default)]
struct SseDecoder {
    line: Vec<u8>,
    event: String,
    data: String,
    has_data: bool,
    skip_lf: bool,
    saw_line: bool,
    frame_bytes: usize,
}

impl SseDecoder {
    fn push(&mut self, bytes: &[u8]) -> Result<Vec<SseFrame>, Failure> {
        let mut frames = Vec::new();
        for &byte in bytes {
            if self.skip_lf {
                self.skip_lf = false;
                if byte == b'\n' { continue; }
            }
            self.frame_bytes += 1;
            if self.frame_bytes > MAX_FRAME_BYTES {
                return Err(Failure::uncertain("A Hermes stream frame exceeded the safe size limit. Execution status is unknown."));
            }
            if byte == b'\r' || byte == b'\n' {
                self.process_line(&mut frames)?;
                self.skip_lf = byte == b'\r';
            } else {
                self.line.push(byte);
            }
        }
        Ok(frames)
    }

    fn process_line(&mut self, frames: &mut Vec<SseFrame>) -> Result<(), Failure> {
        let bytes = std::mem::take(&mut self.line);
        let line = std::str::from_utf8(&bytes).map_err(|_| Failure::uncertain("Hermes returned invalid UTF-8 stream data. Execution status is unknown."))?;
        let line = if self.saw_line { line } else { line.trim_start_matches('\u{feff}') };
        self.saw_line = true;
        if line.is_empty() {
            self.dispatch(frames);
        } else if !line.starts_with(':') {
            let (field, value) = line.split_once(':').unwrap_or((line, ""));
            let value = value.strip_prefix(' ').unwrap_or(value);
            match field {
                "event" => self.event = value.into(),
                "data" => {
                    self.has_data = true;
                    self.data.push_str(value);
                    self.data.push('\n');
                }
                _ => {}
            }
        }
        Ok(())
    }

    fn dispatch(&mut self, frames: &mut Vec<SseFrame>) {
        if self.has_data {
            self.data.pop();
            frames.push(SseFrame { event: std::mem::take(&mut self.event), data: std::mem::take(&mut self.data) });
        } else {
            self.event.clear();
        }
        self.has_data = false;
        self.frame_bytes = 0;
    }

    fn finish(&mut self) -> Result<Vec<SseFrame>, Failure> {
        let mut frames = Vec::new();
        if !self.line.is_empty() { self.process_line(&mut frames)?; }
        self.dispatch(&mut frames);
        Ok(frames)
    }
}

#[derive(Default)]
struct CompletionState {
    finish_reason: Option<String>,
    completed: bool,
    failed: bool,
}

impl CompletionState {
    fn accept(&mut self, frame: SseFrame) -> Result<Vec<HermesEvent>, Failure> {
        if self.failed { return Err(Failure::certain("Hermes already reported that this turn failed or was interrupted.")); }
        if self.completed { return Ok(Vec::new()); }
        let result = self.accept_frame(frame);
        if result.is_err() { self.failed = true; }
        result
    }

    fn accept_frame(&mut self, frame: SseFrame) -> Result<Vec<HermesEvent>, Failure> {
        let event = frame.event.as_str();
        if event == "error" {
            return Err(Failure::certain("Hermes reported a stream error. Some work may already have occurred; inspect the server before sending again."));
        }
        if !matches!(event, "" | "message" | "chat.completion.chunk" | "hermes.tool.progress") {
            return Ok(Vec::new());
        }
        if frame.data.trim().is_empty() { return Ok(Vec::new()); }
        if frame.data.trim() == "[DONE]" {
            if event == "hermes.tool.progress" { return Ok(Vec::new()); }
            self.completed = true;
            return Ok(vec![HermesEvent::Done { finish_reason: self.finish_reason.clone().unwrap_or_else(|| "stop".into()) }]);
        }
        let value: Value = serde_json::from_str(&frame.data)
            .map_err(|_| Failure::uncertain("Hermes returned malformed stream data. Execution status is unknown."))?;
        if value.get("error").is_some_and(|value| !value.is_null()) {
            return Err(Failure::certain("Hermes reported that the request failed. Some work may already have occurred; inspect the server before sending again."));
        }
        if event == "hermes.tool.progress" || value.get("object").and_then(Value::as_str) == Some("hermes.tool.progress") {
            let name = ["tool", "tool_name", "name"].iter().find_map(|key| value.get(key).and_then(Value::as_str));
            let text = match name {
                Some(name) => format!("Running {}", name.chars().filter(|c| !c.is_control()).take(120).collect::<String>()),
                None => "Hermes is using a tool".into(),
            };
            return Ok(vec![HermesEvent::Tool { text }]);
        }
        let choices = value.get("choices").and_then(Value::as_array)
            .ok_or_else(|| Failure::uncertain("Hermes returned an unrecognized completion frame. Execution status is unknown."))?;
        let mut events = Vec::new();
        for choice in choices {
            // This client requests one answer. Do not combine alternate choices.
            if choice.get("index").and_then(Value::as_u64).is_some_and(|index| index != 0) { continue; }
            if choice.get("error").is_some_and(|value| !value.is_null()) {
                return Err(Failure::certain("Hermes reported that this turn failed. Inspect the server before sending again."));
            }
            if let Some(reason) = choice.get("finish_reason").filter(|value| !value.is_null()) {
                let reason = reason.as_str().ok_or_else(|| Failure::uncertain("Hermes returned an invalid completion status."))?;
                match reason {
                    "error" | "failed" => return Err(Failure::certain("Hermes reported that this turn failed. Some work may already have occurred; inspect the server before sending again.")),
                    "cancelled" | "canceled" => return Err(Failure::certain("Hermes reported that this turn was interrupted. Some work may already have occurred.")),
                    "stop" | "length" => self.finish_reason = Some(reason.into()),
                    "content_filter" => return Err(Failure::certain("The provider blocked this response with a content filter.")),
                    "tool_calls" | "function_call" => return Err(Failure::certain("The server returned a client-side tool request. This client expects Hermes to execute tools on the server.")),
                    _ => return Err(Failure::uncertain("Hermes returned an unknown completion status. Inspect the server before sending again.")),
                }
            }
            if let Some(content) = choice.get("delta").and_then(|delta| delta.get("content")).filter(|value| !value.is_null()) {
                let text = content.as_str().ok_or_else(|| Failure::uncertain("Hermes returned an unsupported content chunk. Execution status is unknown."))?;
                if !text.is_empty() { events.push(HermesEvent::Delta { text: text.into() }); }
            }
        }
        Ok(events)
    }

    fn finish(&mut self) -> Result<Option<HermesEvent>, Failure> {
        if self.failed { return Err(Failure::certain("Hermes reported a failed or interrupted turn.")); }
        if self.completed { return Ok(None); }
        let reason = self.finish_reason.clone().ok_or_else(|| Failure::uncertain("The Hermes stream ended without a completion marker. Execution status is unknown; no retry was made."))?;
        self.completed = true;
        Ok(Some(HermesEvent::Done { finish_reason: reason }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_root_and_profile_api_bases() {
        for (input, expected) in [
            ("https://agent.example", "https://agent.example/v1"),
            ("https://agent.example/v1/", "https://agent.example/v1"),
            ("https://agent.example/p/work/", "https://agent.example/p/work/v1"),
            ("http://127.0.0.1:8642", "http://127.0.0.1:8642/v1"),
            ("http://[::1]:8642/v1", "http://[::1]:8642/v1"),
        ] {
            assert_eq!(normalize_base_url(input).unwrap().as_str(), expected);
        }
    }

    #[test]
    fn rejects_insecure_remote_hosts_and_url_spoofing() {
        for input in [
            "http://localhost:8642", "http://localhost.evil:8642", "http://127.0.0.1.evil",
            "http://192.168.1.1:8642", "http://127.1", "http://2130706433", "http://0x7f000001",
            "http://[::ffff:127.0.0.1]", "https://user:secret@agent.example/v1",
            "https://@agent.example", "https://agent.example/v1?token=secret",
            "https://agent.example/v1#secret", "https://agent.example\\@evil.example",
            "https://agent.example/\nsecret", "file:///etc/passwd", "https://agent.example/v1/chat/completions",
        ] {
            assert!(normalize_base_url(input).is_err(), "accepted {input}");
        }
    }

    #[test]
    fn parses_sse_split_at_every_byte_without_corrupting_unicode() {
        let wire = "\u{feff}: keepalive\r\nevent: message\r\ndata: {\"choices\":[{\"delta\":{\"content\":\"Hi 🌊 café\"},\r\ndata: \"finish_reason\":null}]}\r\n\r\n".as_bytes();
        for split in 0..=wire.len() {
            let mut parser = SseDecoder::default();
            let mut frames = parser.push(&wire[..split]).unwrap();
            frames.extend(parser.push(&wire[split..]).unwrap());
            assert_eq!(frames.len(), 1);
            assert_eq!(frames[0].event, "message");
            let mut state = CompletionState::default();
            assert_eq!(state.accept(frames.remove(0)).unwrap(), vec![HermesEvent::Delta { text: "Hi 🌊 café".into() }]);
        }
    }

    #[test]
    fn parses_single_byte_chunks_cr_lines_and_trailing_frame() {
        let mut parser = SseDecoder::default();
        let mut frames = Vec::new();
        for byte in b": heartbeat\revent: hermes.tool.progress\rdata: {\"tool\":\"terminal\"}\r\rdata: [DONE]" {
            frames.extend(parser.push(&[*byte]).unwrap());
        }
        frames.extend(parser.finish().unwrap());
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].event, "hermes.tool.progress");
        assert_eq!(frames[1].data, "[DONE]");
    }

    #[test]
    fn rejects_oversized_sse_and_invalid_utf8() {
        assert!(SseDecoder::default().push(&vec![b'a'; MAX_FRAME_BYTES + 1]).is_err());
        assert!(SseDecoder::default().push(b"data: \xff\n\n").is_err());
    }

    fn frame(data: &str) -> SseFrame {
        SseFrame { event: String::new(), data: data.into() }
    }

    #[test]
    fn completion_waits_for_terminal_marker_and_emits_once() {
        let mut state = CompletionState::default();
        assert!(state.accept(frame(r#"{"choices":[{"delta":{},"finish_reason":"stop"}]}"#)).unwrap().is_empty());
        assert_eq!(state.accept(frame("[DONE]")).unwrap(), vec![HermesEvent::Done { finish_reason: "stop".into() }]);
        assert!(state.accept(frame("[DONE]")).unwrap().is_empty());
    }

    #[test]
    fn eof_without_completion_is_uncertain() {
        let mut state = CompletionState::default();
        state.accept(frame(r#"{"choices":[{"delta":{"content":"partial"},"finish_reason":null}]}"#)).unwrap();
        assert!(state.finish().unwrap_err().uncertain);
    }

    #[test]
    fn explicit_finish_is_terminal_even_without_done_marker() {
        let mut state = CompletionState::default();
        state.accept(frame(r#"{"choices":[{"delta":{},"finish_reason":"length"}]}"#)).unwrap();
        assert_eq!(state.finish().unwrap(), Some(HermesEvent::Done { finish_reason: "length".into() }));
    }

    #[test]
    fn error_and_cancelled_finishes_never_become_success() {
        for reason in ["error", "cancelled"] {
            let mut state = CompletionState::default();
            let payload = format!(r#"{{"choices":[{{"delta":{{}},"finish_reason":"{reason}"}}]}}"#);
            let error = state.accept(frame(&payload)).unwrap_err();
            assert!(!error.uncertain);
            assert!(state.accept(frame("[DONE]")).is_err());
        }
    }

    #[test]
    fn errors_do_not_expose_server_body_and_http_statuses_preserve_uncertainty() {
        let mut state = CompletionState::default();
        let error = state.accept(frame(r#"{"error":{"message":"secret-token"}}"#)).unwrap_err();
        assert!(!error.message.contains("secret-token"));
        for code in [400, 401, 403, 404, 409, 422, 429] {
            assert!(!http_failure(reqwest::StatusCode::from_u16(code).unwrap()).uncertain);
        }
        assert!(http_failure(reqwest::StatusCode::INTERNAL_SERVER_ERROR).uncertain);
        assert!(http_failure(reqwest::StatusCode::TEMPORARY_REDIRECT).uncertain);
    }

    fn request(url: String) -> HermesRequest {
        HermesRequest {
            request_id: "request-4da527b6".into(), conversation_id: "conversation-47fcd6de".into(),
            url, token: "test-only-secret".into(), model: "hermes-agent".into(),
            messages: vec![ChatMessage { role: ChatRole::User, content: "Hello".into() }],
        }
    }

    fn recording_channel() -> (Channel<HermesEvent>, std::sync::Arc<std::sync::Mutex<Vec<Value>>>) {
        let events = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let recorded = events.clone();
        let channel = Channel::new(move |body| {
            if let tauri::ipc::InvokeResponseBody::Json(json) = body {
                recorded.lock().unwrap().push(serde_json::from_str(&json).unwrap());
            }
            Ok(())
        });
        (channel, events)
    }

    async fn local_server(response: String) -> (String, tokio::task::JoinHandle<String>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut buffer = [0u8; 1024];
            loop {
                let len = socket.read(&mut buffer).await.unwrap();
                if len == 0 { break; }
                request.extend_from_slice(&buffer[..len]);
                if let Some(end) = request.windows(4).position(|bytes| bytes == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..end]);
                    let length = headers.lines().find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        if name.eq_ignore_ascii_case("content-length") { value.trim().parse::<usize>().ok() } else { None }
                    }).unwrap_or(0);
                    if request.len() >= end + 4 + length { break; }
                }
                assert!(request.len() < 64 * 1024);
            }
            socket.write_all(response.as_bytes()).await.unwrap();
            socket.shutdown().await.unwrap();
            String::from_utf8(request).unwrap()
        });
        (url, server)
    }

    fn http_response(status: &str, content_type: &str, body: &str) -> String {
        format!("HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len())
    }

    #[tokio::test]
    async fn native_stream_sends_identity_headers_and_delivers_one_completion() {
        let body = "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello 🌊\"},\"finish_reason\":null}]}\r\n\r\ndata: {\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}]}\r\n\r\ndata: [DONE]\r\n\r\n";
        let (url, server) = local_server(http_response("200 OK", "text/event-stream; charset=utf-8", body)).await;
        let (channel, events) = recording_channel();
        chat_stream(request(url), channel).await.unwrap();
        let received = server.await.unwrap();
        let (headers, body) = received.split_once("\r\n\r\n").unwrap();
        let headers = headers.to_ascii_lowercase();
        assert!(headers.starts_with("post /v1/chat/completions http/1.1"));
        assert!(headers.contains("authorization: bearer test-only-secret"));
        assert!(headers.contains("x-hermes-session-key: conversation-47fcd6de"));
        assert!(headers.contains("idempotency-key: request-4da527b6"));
        let payload: Value = serde_json::from_str(body).unwrap();
        assert_eq!(payload["stream"], true);
        assert_eq!(payload["model"], "hermes-agent");
        assert_eq!(payload["messages"][0]["content"], "Hello");
        assert_eq!(*events.lock().unwrap(), vec![
            serde_json::json!({"type":"delta", "text":"Hello 🌊"}),
            serde_json::json!({"type":"done", "finishReason":"stop"}),
        ]);
    }

    #[tokio::test]
    async fn native_errors_emit_once_with_correct_uncertainty_and_no_raw_body() {
        for (status, mime, body, uncertain) in [
            ("401 Unauthorized", "application/json", "test-only-secret", false),
            ("500 Internal Server Error", "text/plain", "test-only-secret", true),
            ("200 OK", "text/event-stream", "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"error\"}],\"error\":{\"message\":\"test-only-secret\"}}\n\ndata: [DONE]\n\n", false),
            ("200 OK", "text/event-stream", "data: {\"choices\":[{\"delta\":{\"content\":\"partial\"},\"finish_reason\":null}]}\n\n", true),
        ] {
            let (url, server) = local_server(http_response(status, mime, body)).await;
            let (channel, events) = recording_channel();
            chat_stream(request(url), channel).await.unwrap();
            server.await.unwrap();
            let events = events.lock().unwrap();
            let errors: Vec<_> = events.iter().filter(|value| value["type"] == "error").collect();
            assert_eq!(errors.len(), 1);
            assert_eq!(errors[0]["uncertain"], uncertain);
            assert!(!errors[0]["message"].as_str().unwrap().contains("test-only-secret"));
            assert!(!events.iter().any(|value| value["type"] == "done"));
        }
    }

    #[tokio::test]
    async fn native_redirect_is_not_followed_with_bearer_credentials() {
        let destination = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let response = format!("HTTP/1.1 307 Temporary Redirect\r\nLocation: http://{}/leak\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", destination.local_addr().unwrap());
        let (url, server) = local_server(response).await;
        let (channel, events) = recording_channel();
        chat_stream(request(url), channel).await.unwrap();
        server.await.unwrap();
        assert_eq!(events.lock().unwrap()[0]["type"], "error");
        assert!(tokio::time::timeout(Duration::from_millis(100), destination.accept()).await.is_err());
    }

    #[tokio::test]
    async fn probe_checks_authenticated_models_without_claiming_streaming() {
        let (url, server) = local_server(http_response("200 OK", "application/json", r#"{"object":"list","data":[{"id":"hermes-agent"}]}"#)).await;
        let result = probe_hermes(url, "test-only-secret".into()).await.unwrap();
        let received = server.await.unwrap();
        assert!(received.starts_with("GET /v1/models HTTP/1.1"));
        assert!(received.to_ascii_lowercase().contains("authorization: bearer test-only-secret"));
        assert!(result.reachable);
        assert!(!result.streaming);
    }
}
