use serde::{Deserialize, Serialize};
use tauri::AppHandle;
#[cfg(target_os = "android")]
use tauri_plugin_harbor_android_updater::AndroidUpdaterExt;
use zeroize::Zeroize;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BiometricStatus {
    pub available: bool,
    pub enrolled: bool,
    pub enabled: bool,
}

#[tauri::command]
pub async fn biometric_status(app: AppHandle) -> Result<BiometricStatus, String> {
    #[cfg(target_os = "android")]
    {
        let res = app
            .android_updater()
            .biometric_status()
            .await
            .map_err(|_| "Could not query Android biometric status.".to_string())?;
        Ok(BiometricStatus {
            available: res.available,
            enrolled: res.enrolled,
            enabled: res.enabled,
        })
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(BiometricStatus {
            available: false,
            enrolled: false,
            enabled: false,
        })
    }
}

#[tauri::command]
pub async fn biometric_enroll(app: AppHandle, mut password: String) -> Result<bool, String> {
    if password.len() < 12 {
        password.zeroize();
        return Err("Master password must be at least 12 characters.".into());
    }
    #[cfg(target_os = "android")]
    {
        let to_send = password.clone();
        password.zeroize();
        let res = app
            .android_updater()
            .enroll_biometric(to_send)
            .await
            .map_err(|e| e.to_string())?;
        Ok(res.enabled)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        password.zeroize();
        Err("Biometric unlock is only available on mobile.".into())
    }
}

#[tauri::command]
pub async fn biometric_unlock(
    app: AppHandle,
    title: String,
    subtitle: String,
    cancel_text: String,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        let res = app
            .android_updater()
            .unlock_biometric(title, subtitle, cancel_text)
            .await
            .map_err(|e| e.to_string())?;
        Ok(res.password)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, title, subtitle, cancel_text);
        Err("Biometric unlock is only available on mobile.".into())
    }
}

#[tauri::command]
pub async fn biometric_clear(app: AppHandle) -> Result<bool, String> {
    #[cfg(target_os = "android")]
    {
        let res = app
            .android_updater()
            .clear_biometric()
            .await
            .map_err(|e| e.to_string())?;
        Ok(res.enabled)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn biometric_status_serializes_in_camel_case() {
        let status = BiometricStatus {
            available: true,
            enrolled: true,
            enabled: false,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert_eq!(json, r#"{"available":true,"enrolled":true,"enabled":false}"#);
    }
}
