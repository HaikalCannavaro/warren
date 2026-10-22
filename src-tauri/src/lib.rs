mod hermes;
mod ssh;
mod updater;
#[cfg(target_os = "android")]
mod android_updates;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ssh::SshState::default())
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            app.handle().plugin(
                tauri_plugin_stronghold::Builder::with_argon2(&data_dir.join("vault-salt.bin")).build(),
            )?;
            #[cfg(target_os = "windows")]
            updater::initialize(app.handle())?;
            #[cfg(target_os = "android")]
            {
                app.manage(android_updates::AndroidUpdateState::default());
                app.handle().plugin(tauri_plugin_harbor_android_updater::init())?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<ssh::SshState>().disconnect_all();
            }
        })
        .invoke_handler(tauri::generate_handler![
            ssh::ssh_probe,
            ssh::ssh_connect,
            ssh::ssh_write,
            ssh::ssh_resize,
            ssh::ssh_disconnect,
            hermes::probe_hermes,
            hermes::chat_stream,
            updater::get_update_info,
            updater::check_for_update,
            updater::download_update,
            updater::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("Warren could not start");
}
