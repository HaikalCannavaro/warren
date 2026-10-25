//! Internal Android bridge. Deliberately has no JavaScript command permissions.
//! Only the application Rust updater and biometric modules call this bridge.

use serde::{Deserialize, Serialize};
use tauri::{plugin::{Builder, PluginHandle, TauriPlugin}, Manager, Runtime};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInfo {
    pub package_name: String,
    pub version_name: String,
    pub version_code: u64,
    pub cache_dir: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallApk {
    pub path: String,
    pub package_name: String,
    pub version_name: String,
    pub version_code: u64,
    pub sha256: String,
    pub size: u64,
}

#[derive(Deserialize)]
pub struct InstallResponse {
    pub status: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BiometricStatusResponse {
    pub available: bool,
    pub enrolled: bool,
    pub enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrollBiometricArgs {
    pub password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BiometricEnabledResponse {
    pub enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockBiometricArgs {
    pub title: String,
    pub subtitle: String,
    pub cancel_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockBiometricResponse {
    pub password: String,
}

pub struct AndroidUpdater<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AndroidUpdater<R> {
    #[cfg(target_os = "android")]
    pub async fn background_chat(&self, action: String, payload: String) -> Result<serde_json::Value, tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin_async("backgroundChat", serde_json::json!({"action": action, "payload": payload})).await
    }
    #[cfg(target_os = "android")]
    pub async fn runtime_info(&self) -> Result<RuntimeInfo, tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin_async("runtimeInfo", ()).await
    }

    #[cfg(target_os = "android")]
    pub async fn install_apk(&self, args: InstallApk) -> Result<InstallResponse, tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin_async("installApk", args).await
    }

    #[cfg(target_os = "android")]
    pub async fn biometric_status(&self) -> Result<BiometricStatusResponse, tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin_async("biometricStatus", ()).await
    }

    #[cfg(target_os = "android")]
    pub async fn enroll_biometric(&self, password: String) -> Result<BiometricEnabledResponse, tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin_async("enrollBiometric", EnrollBiometricArgs { password }).await
    }

    #[cfg(target_os = "android")]
    pub async fn unlock_biometric(
        &self,
        title: String,
        subtitle: String,
        cancel_text: String,
    ) -> Result<UnlockBiometricResponse, tauri::plugin::mobile::PluginInvokeError> {
        self.0
            .run_mobile_plugin_async("unlockBiometric", UnlockBiometricArgs { title, subtitle, cancel_text })
            .await
    }

    #[cfg(target_os = "android")]
    pub async fn clear_biometric(&self) -> Result<BiometricEnabledResponse, tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin_async("clearBiometric", ()).await
    }
}

pub trait AndroidUpdaterExt<R: Runtime> {
    fn android_updater(&self) -> &AndroidUpdater<R>;
}

impl<R: Runtime, T: Manager<R>> AndroidUpdaterExt<R> for T {
    fn android_updater(&self) -> &AndroidUpdater<R> {
        self.state::<AndroidUpdater<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R, serde_json::Value> {
    Builder::new("harbor-android-updater")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            app.manage(AndroidUpdater(api.register_android_plugin("dev.harbor.updater", "AndroidUpdaterPlugin")?));
            #[cfg(not(target_os = "android"))]
            let _ = (app, api);
            Ok(())
        })
        .build()
}
