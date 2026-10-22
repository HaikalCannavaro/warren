//! Internal Android bridge. Deliberately has no JavaScript command permissions.
//! Only the application Rust updater supplies installer arguments.

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

pub struct AndroidUpdater<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> AndroidUpdater<R> {
    #[cfg(target_os = "android")]
    pub async fn runtime_info(&self) -> Result<RuntimeInfo, tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin_async("runtimeInfo", ()).await
    }

    #[cfg(target_os = "android")]
    pub async fn install_apk(&self, args: InstallApk) -> Result<InstallResponse, tauri::plugin::mobile::PluginInvokeError> {
        self.0.run_mobile_plugin_async("installApk", args).await
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
