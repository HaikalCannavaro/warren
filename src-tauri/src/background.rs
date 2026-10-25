use serde_json::Value;
use tauri::AppHandle;
#[cfg(target_os = "android")]
use tauri_plugin_harbor_android_updater::AndroidUpdaterExt;

#[tauri::command]
pub async fn background_chat(app: AppHandle, action: String, payload: Value) -> Result<Value, String> {
    if !["status", "configure", "disable", "permission", "enqueue", "sync", "results", "ack"].contains(&action.as_str()) {
        return Err("Unsupported background action.".into());
    }
    #[cfg(target_os = "android")]
    { app.android_updater().background_chat(action, payload.to_string()).await.map_err(|_| "The Android background operation failed. Check relay configuration and device storage.".into()) }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, payload);
        if action == "status" { Ok(serde_json::json!({"supported": false, "enabled": false})) }
        else { Err("Native background delivery is available on Android.".into()) }
    }
}
