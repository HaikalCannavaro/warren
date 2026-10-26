mod biometric;
mod background;
mod hermes;
mod gateway;
mod ssh;
mod updater;
mod scheduler;
#[cfg(desktop)]
mod desktop;
#[cfg(target_os = "android")]
mod android_updates;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ssh::SshState::default())
        .manage(gateway::GatewayState::default())
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.handle().plugin(
                tauri_plugin_stronghold::Builder::with_argon2(&data_dir.join("vault-salt.bin")).build(),
            )?;
            #[cfg(target_os = "windows")]
            updater::initialize(app.handle())?;
            #[cfg(desktop)]
            if let Err(error) = desktop::initialize(app.handle()) {
                eprintln!("Warren system tray could not start: {error}");
            }
            #[cfg(target_os = "android")]
            {
                app.manage(android_updates::AndroidUpdateState::default());
                app.handle().plugin(tauri_plugin_harbor_android_updater::init())?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // The frontend saves and hides to tray. A slow or not-yet-loaded
                // frontend must never turn an ordinary close into a real exit.
                if window.label() == "main" {
                    api.prevent_close();
                }
            }
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<ssh::SshState>().disconnect_all();
                window.state::<gateway::GatewayState>().disconnect_all();
            }
        })
        .invoke_handler(tauri::generate_handler![
            desktop_hide,
            desktop_quit,
            background::background_chat,
            ssh::ssh_probe,
            ssh::ssh_connect,
            ssh::ssh_write,
            ssh::ssh_resize,
            ssh::ssh_disconnect,
            ssh::ssh_read_burrow,
            ssh::ssh_burrow_listen,
            ssh::ssh_burrow_stop,
            ssh::ssh_observer_start,
            ssh::ssh_observer_cancel,
            ssh::ssh_scheduler,
            hermes::probe_hermes,
            hermes::hermes_http,
            hermes::chat_stream,
            gateway::gateway_connect,
            gateway::gateway_send,
            gateway::gateway_disconnect,
            gateway::gateway_disconnect_all,
            updater::get_update_info,
            updater::check_for_update,
            updater::download_update,
            updater::install_update,
            biometric::biometric_status,
            biometric::biometric_enroll,
            biometric::biometric_unlock,
            biometric::biometric_clear,
        ])
        .run(tauri::generate_context!())
        .expect("Warren could not start");
}

#[tauri::command]
fn desktop_hide(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    { desktop::hide(app) }
    #[cfg(mobile)]
    { let _ = app; Err("The system tray is available on desktop only.".into()) }
}

#[tauri::command]
fn desktop_quit(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    { app.exit(0); Ok(()) }
    #[cfg(mobile)]
    { let _ = app; Err("Desktop exit is unavailable on mobile.".into()) }
}
