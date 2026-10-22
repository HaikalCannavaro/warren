// Android personal-APK updates. URLs and keys are baked into the application;
// the webview can only check, download, and open the system installer.

use crate::updater::{AvailableUpdate, DownloadEvent, InstallResult, UpdateInfo};
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::StreamExt;
use minisign_verify::{PublicKey, Signature};
use reqwest::{Client, Url};
use semver::Version;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{path::PathBuf, time::{Duration, Instant}};
use tauri::{ipc::Channel, AppHandle, State};
use tauri_plugin_harbor_android_updater::{AndroidUpdaterExt, InstallApk, RuntimeInfo};
use tokio::{io::AsyncWriteExt, sync::Mutex};

const MAX_APK_BYTES: u64 = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES: usize = 128 * 1024;
const MAX_PAYLOAD_BYTES: usize = 64 * 1024;

#[derive(Default)]
pub(crate) struct AndroidUpdateState {
    pending: Mutex<Option<PendingUpdate>>,
}

struct PendingUpdate {
    manifest: Manifest,
    downloaded: Option<PathBuf>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    schema_version: u32,
    package_name: String,
    version: String,
    version_code: u64,
    url: String,
    sha256: String,
    size: u64,
    notes: String,
    published_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    payload: String,
    signature: String,
}

struct Config {
    endpoint: Url,
    pubkey: String,
}

fn secure_url(value: &str) -> Result<Url, String> {
    if value.len() > 8192 || value.chars().any(char::is_control) {
        return Err("The update URL is invalid.".into());
    }
    let url = Url::parse(value).map_err(|_| "The update URL is invalid.")?;
    if url.scheme() != "https" || url.host_str().is_none()
        || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some()
    {
        return Err("Updates require HTTPS without embedded credentials or a fragment.".into());
    }
    Ok(url)
}

fn public_key(encoded: &str) -> Result<PublicKey, String> {
    let bytes = STANDARD.decode(encoded.trim()).map_err(|_| "The release signing key is invalid.")?;
    let text = std::str::from_utf8(&bytes).map_err(|_| "The release signing key is invalid.")?;
    PublicKey::decode(text).map_err(|_| "The release signing key is invalid.".into())
}

fn configuration(app: &AppHandle) -> Result<Config, String> {
    let plugins = &app.config().plugins.0;
    let config = plugins.get("harbor-android-updater")
        .ok_or("Android updates are not configured for this build.")?;
    let endpoint = config.get("endpoint").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty())
        .ok_or("The Android release location is not configured.")?;
    let pubkey = config.get("pubkey").and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty())
        .or_else(|| plugins.get("updater").and_then(|v| v.get("pubkey")).and_then(|v| v.as_str()))
        .filter(|s| !s.trim().is_empty()).ok_or("The release signing key is not configured.")?;
    public_key(pubkey)?;
    Ok(Config { endpoint: secure_url(endpoint)?, pubkey: pubkey.to_owned() })
}

fn client(timeout: Duration) -> Result<Client, String> {
    Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .timeout(timeout)
        .referer(false)
        // GitHub assets redirect to a CDN. Every redirect must remain HTTPS;
        // neither this request nor a redirected request carries application secrets.
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || secure_url(attempt.url().as_str()).is_err() {
                attempt.error("Unsafe update redirect")
            } else {
                attempt.follow()
            }
        }))
        .user_agent(concat!("Warren/", env!("CARGO_PKG_VERSION")))
        .build().map_err(|_| "The update connection could not be prepared.".into())
}

fn verify_payload(payload: &[u8], signature: &str, key: &str) -> Result<(), String> {
    let key = public_key(key)?;
    let signature = STANDARD.decode(signature.trim()).map_err(|_| "The release signature is invalid.")?;
    let text = std::str::from_utf8(&signature).map_err(|_| "The release signature is invalid.")?;
    let signature = Signature::decode(text).map_err(|_| "The release signature is invalid.")?;
    key.verify(payload, &signature, true).map_err(|_| "Release verification failed. The update was rejected.".into())
}

fn parse_envelope(bytes: &[u8], key: &str) -> Result<Manifest, String> {
    if bytes.len() > MAX_MANIFEST_BYTES { return Err("The release metadata is too large.".into()); }
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|_| "The release metadata is invalid.")?;
    let payload = STANDARD.decode(&envelope.payload).map_err(|_| "The release metadata is invalid.")?;
    if payload.len() > MAX_PAYLOAD_BYTES { return Err("The release metadata is too large.".into()); }
    // Verify exact bytes before interpreting any URL, version, size, or hash.
    // Version is inside the signed payload, so an unsigned version cannot be substituted.
    verify_payload(&payload, &envelope.signature, key)?;
    serde_json::from_slice(&payload).map_err(|_| "The signed release metadata is invalid.".into())
}

fn validate_manifest(manifest: &Manifest, current: &RuntimeInfo) -> Result<bool, String> {
    if manifest.schema_version != 1 || manifest.package_name != current.package_name {
        return Err("This release does not belong to the installed application.".into());
    }
    secure_url(&manifest.url)?;
    if manifest.size == 0 || manifest.size > MAX_APK_BYTES || manifest.version_code == 0
        || manifest.version_code > i64::MAX as u64
        || manifest.sha256.len() != 64 || !manifest.sha256.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        || manifest.notes.len() > 16 * 1024 || manifest.published_at.as_ref().is_some_and(|s| s.len() > 64)
    {
        return Err("The signed release metadata has invalid limits or an invalid checksum.".into());
    }
    let next = Version::parse(&manifest.version).map_err(|_| "The release version is invalid.")?;
    let installed = Version::parse(&current.version_name).map_err(|_| "The installed version cannot be compared safely.")?;
    Ok(next > installed && manifest.version_code > current.version_code)
}

async fn runtime_info(app: &AppHandle) -> Result<RuntimeInfo, String> {
    tokio::time::timeout(Duration::from_secs(15), app.android_updater().runtime_info()).await
        .map_err(|_| "Android did not respond to the update check.".to_string())?
        .map_err(|_| "Android application details could not be read.".into())
}

pub(crate) async fn get_update_info(app: AppHandle) -> Result<UpdateInfo, String> {
    let current = runtime_info(&app).await?;
    let config = configuration(&app);
    let message = match &config {
        Ok(_) => "Updates are verified in Warren. Android will ask before installing.".to_owned(),
        Err(message) => message.clone(),
    };
    Ok(UpdateInfo { platform: "android".into(), configured: config.is_ok(),
        current_version: current.version_name, message })
}

pub(crate) async fn check_for_update(app: AppHandle, state: State<'_, AndroidUpdateState>) -> Result<Option<AvailableUpdate>, String> {
    let mut pending = state.pending.try_lock().map_err(|_| "Another update operation is still running.")?;
    // A failed recheck must never leave an older candidate selected for installation.
    *pending = None;
    let config = configuration(&app)?;
    let current = runtime_info(&app).await?;
    let response = client(Duration::from_secs(45))?.get(config.endpoint)
        .header(reqwest::header::ACCEPT, "application/json")
        .header(reqwest::header::ACCEPT_ENCODING, "identity").send().await
        .map_err(|_| "The release service could not be reached. Try again later.")?;
    if response.status() == reqwest::StatusCode::NO_CONTENT { return Ok(None); }
    if !response.status().is_success() { return Err("The release service rejected the check.".into()); }
    if response.content_length().is_some_and(|n| n > MAX_MANIFEST_BYTES as u64) {
        return Err("The release metadata is too large.".into());
    }
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "The release metadata download was interrupted.")?;
        if body.len().saturating_add(chunk.len()) > MAX_MANIFEST_BYTES { return Err("The release metadata is too large.".into()); }
        body.extend_from_slice(&chunk);
    }
    let manifest = parse_envelope(&body, &config.pubkey)?;
    if !validate_manifest(&manifest, &current)? { return Ok(None); }
    let result = AvailableUpdate { version: manifest.version.clone(), notes: manifest.notes.clone(), published_at: manifest.published_at.clone() };
    *pending = Some(PendingUpdate { manifest, downloaded: None });
    Ok(Some(result))
}

// Synchronous drop cleanup also runs if the future is cancelled while downloading.
struct PartialFile(PathBuf);
impl Drop for PartialFile {
    fn drop(&mut self) { let _ = std::fs::remove_file(&self.0); }
}

pub(crate) async fn download_update(app: AppHandle, on_event: Channel<DownloadEvent>, state: State<'_, AndroidUpdateState>) -> Result<(), String> {
    let mut slot = state.pending.try_lock().map_err(|_| "Another update operation is still running.")?;
    let pending = slot.as_mut().ok_or("Check for an update before downloading.")?;
    pending.downloaded = None;
    let current = runtime_info(&app).await?;
    let manifest = &pending.manifest;
    if !validate_manifest(manifest, &current)? { return Err("This release is no longer newer than the installed application.".into()); }
    let cache = PathBuf::from(&current.cache_dir);
    if !cache.is_absolute() { return Err("Android did not provide a valid private cache directory.".into()); }
    let directory = cache.join("harbor-updates");
    tokio::fs::create_dir_all(&directory).await.map_err(|_| "The update cache could not be prepared.")?;
    let destination = directory.join(format!("{}.apk", manifest.sha256));
    let partial = PartialFile(directory.join("download.part"));
    let mut file = tokio::fs::File::create(&partial.0).await.map_err(|_| "The update download could not be saved.")?;
    on_event.send(DownloadEvent { event: "progress", downloaded: 0, total: Some(manifest.size) })
        .map_err(|_| "The update download was stopped because its window closed.")?;
    let response = client(Duration::from_secs(600))?.get(secure_url(&manifest.url)?)
        .header(reqwest::header::ACCEPT_ENCODING, "identity").send().await
        .map_err(|_| "The update download could not start. Try again later.")?;
    if !response.status().is_success() { return Err("The release service rejected the download.".into()); }
    if response.content_length().is_some_and(|size| size != manifest.size) {
        return Err("The update size does not match the signed release.".into());
    }
    let mut stream = response.bytes_stream();
    let mut downloaded = 0u64;
    let mut hash = Sha256::new();
    let mut last_progress = Instant::now();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "The update download was interrupted. Check your connection and retry.")?;
        downloaded = downloaded.checked_add(chunk.len() as u64).ok_or("The update size is invalid.")?;
        if downloaded > manifest.size { return Err("The update exceeds its signed size limit.".into()); }
        hash.update(&chunk);
        file.write_all(&chunk).await.map_err(|_| "The update could not be saved. Check available storage.")?;
        if last_progress.elapsed() >= Duration::from_millis(200) {
            on_event.send(DownloadEvent { event: "progress", downloaded, total: Some(manifest.size) })
                .map_err(|_| "The update download was stopped because its window closed.")?;
            last_progress = Instant::now();
        }
    }
    let digest = format!("{:x}", hash.finalize());
    if downloaded != manifest.size || digest != manifest.sha256 {
        return Err("The APK failed integrity verification and was rejected.".into());
    }
    file.flush().await.map_err(|_| "The update could not be saved.")?;
    file.sync_all().await.map_err(|_| "The update could not be saved.")?;
    drop(file);
    // Hash-addressed names prevent a later check from replacing an APK that the
    // system installer may still be reading. Cache is private and OS-reclaimable.
    tokio::fs::rename(&partial.0, &destination).await.map_err(|_| "The verified update could not be prepared.")?;
    on_event.send(DownloadEvent { event: "progress", downloaded, total: Some(manifest.size) })
        .map_err(|_| "The update download finished after its window closed. Check again before installing.")?;
    pending.downloaded = Some(destination);
    Ok(())
}

pub(crate) async fn install_update(app: AppHandle, state: State<'_, AndroidUpdateState>) -> Result<InstallResult, String> {
    let slot = state.pending.try_lock().map_err(|_| "Another update operation is still running.")?;
    let pending = slot.as_ref().ok_or("Check for and download an update before installing.")?;
    let path = pending.downloaded.as_ref().ok_or("Download and verify the update before installing.")?;
    let current = runtime_info(&app).await?;
    if !validate_manifest(&pending.manifest, &current)? { return Err("This release is no longer newer than the installed application.".into()); }
    let manifest = &pending.manifest;
    let result = app.android_updater().install_apk(InstallApk {
        path: path.to_string_lossy().into_owned(), package_name: manifest.package_name.clone(),
        version_name: manifest.version.clone(), version_code: manifest.version_code,
        sha256: manifest.sha256.clone(), size: manifest.size,
    }).await.map_err(|_| "Android could not verify or open this update. Check the APK identity, signature, storage, and installation permission.".to_string())?;
    match result.status.as_str() {
        "permissionRequired" => Ok(InstallResult { status: "permissionRequired" }),
        "installerOpened" => Ok(InstallResult { status: "installerOpened" }),
        _ => Err("Android returned an unexpected installation status.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest() -> Manifest {
        Manifest { schema_version: 1, package_name: "dev.harbor.workspace".into(),
            version: "0.2.1".into(), version_code: 2001,
            url: "https://example.com/harbor.apk".into(), sha256: "ab".repeat(32),
            size: 20, notes: "A release".into(), published_at: None }
    }

    fn installed() -> RuntimeInfo {
        RuntimeInfo { package_name: "dev.harbor.workspace".into(), version_name: "0.2.0".into(),
            version_code: 2000, cache_dir: "/data/user/0/dev.harbor.workspace/cache".into() }
    }

    #[test]
    fn requires_https_without_credentials_or_fragments() {
        for url in ["http://example.com/update", "https://u:p@example.com/update", "https://example.com/#x", "file:///tmp/update"] {
            assert!(secure_url(url).is_err(), "{url}");
        }
        assert!(secure_url("https://release-assets.githubusercontent.com/asset?token=temporary").is_ok());
    }

    #[test]
    fn requires_both_versions_to_increase_and_correct_package() {
        assert_eq!(validate_manifest(&manifest(), &installed()).unwrap(), true);
        let mut item = manifest();
        item.version_code = 2000;
        assert!(!validate_manifest(&item, &installed()).unwrap());
        item = manifest(); item.version = "0.1.9".into();
        assert!(!validate_manifest(&item, &installed()).unwrap());
        item = manifest(); item.package_name = "other.app".into();
        assert!(validate_manifest(&item, &installed()).is_err());
    }

    #[test]
    fn rejects_unbounded_or_malformed_artifact_metadata() {
        let mut item = manifest(); item.size = MAX_APK_BYTES + 1;
        assert!(validate_manifest(&item, &installed()).is_err());
        item = manifest(); item.sha256 = "zz".repeat(32);
        assert!(validate_manifest(&item, &installed()).is_err());
        item = manifest(); item.version_code = i64::MAX as u64 + 1;
        assert!(validate_manifest(&item, &installed()).is_err());
        item = manifest(); item.version = "latest".into();
        assert!(validate_manifest(&item, &installed()).is_err());
    }

    #[test]
    fn signature_verification_rejects_modified_payload_and_missing_signature() {
        // Public test vector from the official Tauri updater tests; signed bytes are "test".
        let key = STANDARD.encode("untrusted comment: minisign public key E7620F1842B4E81F\nRWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3");
        let signature = STANDARD.encode("untrusted comment: signature from minisign secret key\nRUQf6LRCGA9i559r3g7V1qNyJDApGip8MfqcadIgT9CuhV3EMhHoN1mGTkUidF/z7SrlQgXdy8ofjb7bNJJylDOocrCo8KLzZwo=\ntrusted comment: timestamp:1633700835\tfile:test\tprehashed\nwLMDjy9FLAuxZ3q4NlEvkgtyhrr0gtTu6KC4KBJdITbbOeAi1zBIYo0v4iTgt8jJpIidRJnp94ABQkJAgAooBQ==");
        assert!(verify_payload(b"test", &signature, &key).is_ok());
        assert!(verify_payload(b"tampered", &signature, &key).is_err());
        assert!(verify_payload(b"test", "", &key).is_err());
    }

    #[test]
    fn refuses_unsigned_envelope_before_interpreting_payload() {
        let bytes = br#"{"payload":"e30=","signature":""}"#;
        assert!(parse_envelope(bytes, "invalid key").is_err());
        assert!(parse_envelope(&vec![0; MAX_MANIFEST_BYTES + 1], "").is_err());
    }
}
