use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;

const REMOTE_HELPER: &str = include_str!("scheduler_remote.py");

pub fn prepare(request: &Value) -> Result<(String, String), String> {
    let action = request.get("action").and_then(Value::as_str).ok_or("Invalid Scheduler operation.")?;
    if !matches!(action, "list" | "save" | "toggle" | "delete") {
        return Err("Unsupported Scheduler operation.".into());
    }
    if action != "list" {
        let revision = request.get("revision").and_then(Value::as_str).ok_or("Refresh the crontab before making changes.")?;
        if revision.len() != 64 || !revision.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err("Invalid crontab revision. Refresh this host first.".into());
        }
    }
    let payload = serde_json::to_vec(request).map_err(|_| "Could not encode the Scheduler request.")?;
    if payload.len() > 128 * 1024 {
        return Err("The Scheduler request is too large.".into());
    }
    // Only the fixed embedded helper appears in the shell command. All user
    // fields travel on a separate exec channel's stdin and are decoded as JSON.
    let command = format!(
        "LC_ALL=C python3 -c 'import base64,sys; sys.argv=[\"warren-scheduler\",sys.stdin.read()]; exec(compile(base64.b64decode(\"{}\"),\"<warren-scheduler>\",\"exec\"))'",
        STANDARD.encode(REMOTE_HELPER)
    );
    Ok((command, STANDARD.encode(payload)))
}

pub fn response(output: &str) -> Result<Value, String> {
    let value: Value = serde_json::from_str(output).map_err(|_| "The selected host returned an invalid Scheduler response. Linux, Python 3 and crontab are required.")?;
    if value.get("error").is_some() {
        return Err(value.get("message").and_then(Value::as_str).unwrap_or("The crontab operation could not be completed.").chars().take(800).collect());
    }
    if !value.get("jobs").is_some_and(Value::is_array)
        || !value.get("revision").is_some_and(Value::is_string)
        || !value.get("username").is_some_and(Value::is_string)
        || !value.get("timezone").is_some_and(Value::is_string)
    {
        return Err("The selected host returned an incomplete Scheduler snapshot.".into());
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn user_commands_never_become_part_of_the_ssh_shell_command() {
        let script = "echo 'quote'; $(touch /tmp/never-run-by-scheduler)";
        let request = json!({"action":"save","revision":"a".repeat(64),"job":{"name":"check","schedule":"0 * * * *","command":script,"enabled":true}});
        let (command, stdin) = prepare(&request).unwrap();
        assert!(!command.contains(script));
        assert!(command.contains("sys.stdin.read()"));
        let decoded: Value = serde_json::from_slice(&STANDARD.decode(stdin).unwrap()).unwrap();
        assert_eq!(decoded, request);
    }

    #[test]
    fn mutations_require_a_real_snapshot_revision() {
        assert!(prepare(&json!({"action":"delete","id":"job"})).is_err());
        assert!(prepare(&json!({"action":"run"})).is_err());
        assert!(prepare(&json!({"action":"list"})).is_ok());
    }

    #[test]
    fn structured_conflicts_are_returned_as_actionable_errors() {
        assert!(response(r#"{"error":"conflict","message":"Crontab changed. Refresh first."}"#).unwrap_err().contains("Refresh"));
        assert!(response("<html>login</html>").is_err());
    }
}
