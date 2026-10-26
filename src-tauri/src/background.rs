use serde_json::Value;
use tauri::AppHandle;

#[tauri::command]
pub async fn background_chat(app: AppHandle, action: String, payload: Value) -> Result<Value, String> {
    let _ = (app, payload);
    if action == "status" {
        Ok(serde_json::json!({"supported": false, "enabled": false, "retired": true}))
    } else {
        Err("Agent chat and background delivery have been retired from Warren.".into())
    }
}
