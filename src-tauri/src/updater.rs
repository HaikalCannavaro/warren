use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use tauri::{ipc::Channel, AppHandle, Manager};

const MAX_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateInfo {
    pub platform: String,
    pub configured: bool,
    pub current_version: String,
    pub message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AvailableUpdate {
    pub version: String,
    pub notes: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
}

#[derive(Clone, Serialize)]
pub(crate) struct DownloadEvent {
    pub event: &'static str,
    pub downloaded: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total: Option<u64>,
}

#[derive(Serialize)]
pub(crate) struct InstallResult {
    pub status: &'static str,
}

fn validate_update_url(value: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(value).map_err(|_| "The update URL is invalid.")?;
    if url.scheme() != "https" || url.host_str().is_none()
        || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return Err("Updates require an HTTPS URL without embedded credentials or a fragment.".into());
    }
    Ok(())
}

fn validate_windows_config(config: Option<&Value>) -> Result<(), String> {
    let config = config.ok_or("Updates are not configured for this build. A release location and signing key are required.")?;
    let pubkey = config.get("pubkey").and_then(Value::as_str).filter(|v| !v.trim().is_empty())
        .ok_or("The release signing key is not configured.")?;
    let decoded = base64::engine::general_purpose::STANDARD.decode(pubkey)
        .map_err(|_| "The release signing key is invalid.")?;
    let decoded = std::str::from_utf8(&decoded).map_err(|_| "The release signing key is invalid.")?;
    minisign_verify::PublicKey::decode(decoded).map_err(|_| "The release signing key is invalid.")?;
    let endpoints = config.get("endpoints").and_then(Value::as_array).filter(|v| !v.is_empty())
        .ok_or("The release location is not configured.")?;
    for endpoint in endpoints {
        validate_update_url(endpoint.as_str().ok_or("The release location is invalid.")?)?;
    }
    for option in ["dangerousInsecureTransportProtocol", "dangerousAcceptInvalidCerts", "dangerousAcceptInvalidHostnames", "allowDowngrades"] {
        if config.get(option).is_some_and(|value| value != &Value::Bool(false)) {
            return Err("This build has an unsafe updater configuration.".into());
        }
    }
    if config.get("requireSignedVersion").and_then(Value::as_bool) != Some(true) {
        return Err("This build must require signed release versions before updates can be enabled.".into());
    }
    Ok(())
}

fn validate_download_size(downloaded: u64, total: Option<u64>) -> Result<(), String> {
    if downloaded > MAX_DOWNLOAD_BYTES || total.is_some_and(|size| size > MAX_DOWNLOAD_BYTES) {
        return Err("The update exceeds the 512 MiB download limit.".into());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub(crate) fn initialize(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let config = app.config().plugins.0.get("updater");
    let configured = validate_windows_config(config).and_then(|()| {
        serde_json::from_value::<tauri_plugin_updater::Config>(config.cloned().unwrap_or_default())
            .map_err(|_| "The release configuration is invalid.".to_string())
            .and_then(|parsed| {
                // Check the plugin's parsed values too, including any supported aliases.
                if parsed.dangerous_insecure_transport_protocol || parsed.dangerous_accept_invalid_certs
                    || parsed.dangerous_accept_invalid_hostnames || parsed.allow_downgrades || !parsed.require_signed_version {
                    Err("This build has an unsafe updater configuration.".into())
                } else { Ok(()) }
            })
    });
    let config_error = configured.err();
    if config_error.is_none() {
        app.plugin(tauri_plugin_updater::Builder::new().build())?;
    }
    app.manage(windows::UpdateState { config_error, pending: tokio::sync::Mutex::new(None) });
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_update_info(app: AppHandle) -> Result<UpdateInfo, String> {
    #[cfg(target_os = "windows")]
    { return Ok(windows::info(&app)); }
    #[cfg(target_os = "android")]
    { return crate::android_updates::get_update_info(app).await; }
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    { Ok(UpdateInfo { platform: "unsupported".into(), configured: false, current_version: app.package_info().version.to_string(), message: "In-app updates are available on Windows and Android.".into() }) }
}

#[tauri::command]
pub(crate) async fn check_for_update(app: AppHandle) -> Result<Option<AvailableUpdate>, String> {
    #[cfg(target_os = "windows")]
    { return windows::check(&app).await; }
    #[cfg(target_os = "android")]
    { return crate::android_updates::check_for_update(app.clone(), app.state::<crate::android_updates::AndroidUpdateState>()).await; }
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    { let _ = app; Err("In-app updates are unavailable on this platform.".into()) }
}

#[tauri::command]
pub(crate) async fn download_update(app: AppHandle, on_event: Channel<DownloadEvent>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { return windows::download(&app, on_event).await; }
    #[cfg(target_os = "android")]
    { return crate::android_updates::download_update(app.clone(), on_event, app.state::<crate::android_updates::AndroidUpdateState>()).await; }
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    { let _ = (app, on_event); Err("In-app updates are unavailable on this platform.".into()) }
}

#[tauri::command]
pub(crate) async fn install_update(app: AppHandle) -> Result<InstallResult, String> {
    // The interface freezes mutations and saves the vault before invoking this command.
    // Also fail closed if a connecting or connected native SSH session remains.
    if app.state::<crate::ssh::SshState>().has_sessions() {
        return Err("Disconnect all terminals before installing an update.".into());
    }
    #[cfg(target_os = "windows")]
    { return windows::install(&app).await; }
    #[cfg(target_os = "android")]
    { return crate::android_updates::install_update(app.clone(), app.state::<crate::android_updates::AndroidUpdateState>()).await; }
    #[cfg(not(any(target_os = "windows", target_os = "android")))]
    { Err("In-app updates are unavailable on this platform.".into()) }
}

#[cfg(target_os = "windows")]
mod windows {
    use super::*;
    use std::time::Duration;
    use tauri_plugin_updater::{Update, UpdaterExt};
    use tokio::sync::{watch, Mutex};

    pub(super) struct PendingUpdate {
        update: Update,
        verified_bytes: Option<Vec<u8>>,
    }

    pub(super) struct UpdateState {
        pub config_error: Option<String>,
        pub pending: Mutex<Option<PendingUpdate>>,
    }

    impl UpdateState {
        fn ensure_configured(&self) -> Result<(), String> {
            match &self.config_error { Some(error) => Err(error.clone()), None => Ok(()) }
        }
    }

    pub(super) fn info(app: &AppHandle) -> UpdateInfo {
        let state = app.state::<UpdateState>();
        UpdateInfo {
            platform: "windows".into(),
            configured: state.config_error.is_none(),
            current_version: app.package_info().version.to_string(),
            message: state.config_error.clone().unwrap_or_else(|| "Signed Windows updates are available for this build.".into()),
        }
    }

    pub(super) async fn check(app: &AppHandle) -> Result<Option<AvailableUpdate>, String> {
        let state = app.state::<UpdateState>();
        state.ensure_configured()?;
        let mut pending = state.pending.try_lock().map_err(|_| "Another update operation is in progress.")?;
        // A new check invalidates all earlier metadata and downloaded bytes.
        *pending = None;
        let ssh = app.state::<crate::ssh::SshState>().inner().clone();
        let updater = app.updater_builder()
            .timeout(Duration::from_secs(45))
            .configure_client(|client| client.https_only(true).connect_timeout(Duration::from_secs(15)).read_timeout(Duration::from_secs(60)))
            .on_before_exit(move || ssh.disconnect_all())
            .build().map_err(|error| format!("Could not prepare the update check: {error}"))?;
        let result = updater.check().await.map_err(|error| format!("Could not check for updates: {error}"))?;
        let Some(mut update) = result else { return Ok(None); };
        validate_update_url(update.download_url.as_str())?;
        if update.signature.is_empty() { return Err("The release has no signature.".into()); }
        update.timeout = Some(Duration::from_secs(10 * 60));
        let available = AvailableUpdate {
            version: update.version.clone(),
            notes: update.body.as_deref().unwrap_or_default().chars().take(32_000).collect(),
            published_at: update.raw_json.get("pub_date").and_then(Value::as_str).map(str::to_owned),
        };
        *pending = Some(PendingUpdate { update, verified_bytes: None });
        Ok(Some(available))
    }

    pub(super) async fn download(app: &AppHandle, on_event: Channel<DownloadEvent>) -> Result<(), String> {
        let state = app.state::<UpdateState>();
        state.ensure_configured()?;
        let mut guard = state.pending.try_lock().map_err(|_| "Another update operation is in progress.")?;
        let pending = guard.as_mut().ok_or("Check for an update before downloading.")?;
        if let Some(bytes) = &pending.verified_bytes {
            return on_event.send(DownloadEvent { event: "progress", downloaded: bytes.len() as u64, total: Some(bytes.len() as u64) })
                .map_err(|_| "The update window is no longer available.".into());
        }
        on_event.send(DownloadEvent { event: "progress", downloaded: 0, total: None })
            .map_err(|_| "The update window is no longer available.")?;
        let (stop_tx, mut stop_rx) = watch::channel::<Option<String>>(None);
        let mut downloaded = 0u64;
        let download = pending.update.download(|chunk, total| {
            downloaded = downloaded.saturating_add(chunk as u64);
            let result = validate_download_size(downloaded, total).and_then(|()| {
                on_event.send(DownloadEvent { event: "progress", downloaded, total })
                    .map_err(|_| "The update window is no longer available.".into())
            });
            if let Err(error) = result { stop_tx.send_replace(Some(error)); }
        }, || {});
        let bytes = tokio::select! {
            biased;
            _ = stop_rx.changed() => Err(stop_rx.borrow().clone().unwrap_or_else(|| "The update download was interrupted.".into())),
            result = download => result.map_err(|error| format!("The update could not be downloaded or verified: {error}")),
        }?;
        if let Some(error) = stop_rx.borrow().as_ref() { return Err(error.clone()); }
        validate_download_size(bytes.len() as u64, None)?;
        on_event.send(DownloadEvent { event: "progress", downloaded: bytes.len() as u64, total: Some(bytes.len() as u64) })
            .map_err(|_| "The update window is no longer available.")?;
        // Official download() has authenticated both bytes and signed version at this point.
        pending.verified_bytes = Some(bytes);
        Ok(())
    }

    pub(super) async fn install(app: &AppHandle) -> Result<InstallResult, String> {
        let state = app.state::<UpdateState>();
        state.ensure_configured()?;
        let mut guard = state.pending.try_lock().map_err(|_| "Another update operation is in progress.")?;
        if guard.as_ref().and_then(|pending| pending.verified_bytes.as_ref()).is_none() {
            return Err("Download and verify an update before installing it.".into());
        }
        // Consume exactly once, including on failure. A retry requires a fresh check/download.
        let mut pending = guard.take().ok_or("There is no update ready to install.")?;
        let bytes = pending.verified_bytes.take().ok_or("The update has not been verified.")?;
        tauri::async_runtime::spawn_blocking(move || pending.update.install(bytes))
            .await.map_err(|error| format!("Could not start the installer: {error}"))?
            .map_err(|error| format!("Could not install the update: {error}. Check for the update again to retry."))?;
        // Windows normally exits inside install() after launching the verified installer.
        Ok(InstallResult { status: "relaunching" })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid_release_config() -> Value {
        // Public fixture from minisign-verify's tests; no private key is present.
        let key = "untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3";
        json!({
            "pubkey": base64::engine::general_purpose::STANDARD.encode(key),
            "endpoints": ["https://updates.example.com/latest.json"],
            "requireSignedVersion": true,
            "allowDowngrades": false,
            "windows": {"installMode": "passive"}
        })
    }

    #[test]
    fn complete_secure_configuration_enables_update_requests() {
        assert!(validate_windows_config(Some(&valid_release_config())).is_ok());
    }

    #[test]
    fn missing_release_configuration_does_not_enable_update_requests() {
        assert!(validate_windows_config(None).is_err());
        assert!(validate_windows_config(Some(&json!({"pubkey":"", "endpoints":[]}))).is_err());
        assert!(validate_windows_config(Some(&json!({"pubkey":"key", "endpoints":[]}))).is_err());
        let mut config = valid_release_config();
        config["endpoints"] = json!([]);
        assert!(validate_windows_config(Some(&config)).is_err());
        config = valid_release_config();
        config["pubkey"] = json!("placeholder");
        assert!(validate_windows_config(Some(&config)).is_err());
    }

    #[test]
    fn release_configuration_rejects_insecure_transport_and_downgrades() {
        for field in ["dangerousInsecureTransportProtocol", "dangerousAcceptInvalidCerts", "dangerousAcceptInvalidHostnames", "allowDowngrades"] {
            let mut config = valid_release_config();
            config[field] = json!(true);
            assert!(validate_windows_config(Some(&config)).is_err(), "{field}");
        }
        let mut unbound = valid_release_config();
        unbound.as_object_mut().unwrap().remove("requireSignedVersion");
        assert!(validate_windows_config(Some(&unbound)).is_err());
    }

    #[test]
    fn release_urls_reject_credentials_fragments_and_plain_http() {
        for url in ["http://updates.example.com/latest.json", "https://user:password@updates.example.com/update.exe", "https://updates.example.com/update.exe#fragment", "file:///tmp/update.exe", "not a URL"] {
            assert!(validate_update_url(url).is_err(), "{url}");
        }
        assert!(validate_update_url("https://github.com/example/harbor/releases/latest/download/latest.json").is_ok());
        assert!(validate_update_url("https://release-assets.githubusercontent.com/update.exe?token=temporary").is_ok());
    }

    #[test]
    fn download_limits_apply_even_without_a_content_length() {
        assert!(validate_download_size(1024, None).is_ok());
        assert!(validate_download_size(MAX_DOWNLOAD_BYTES, Some(MAX_DOWNLOAD_BYTES)).is_ok());
        assert!(validate_download_size(1, Some(MAX_DOWNLOAD_BYTES + 1)).is_err());
        assert!(validate_download_size(MAX_DOWNLOAD_BYTES + 1, None).is_err());
    }
}
