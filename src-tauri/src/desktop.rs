use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

const TRAY_ID: &str = "warren-background";

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn initialize(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "warren-open", "Open Warren", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "warren-quit", "Quit Warren", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Warren — running in the background")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "warren-open" => show_main(app),
            "warren-quit" => {
                // Let the workspace save its final snapshot before explicitly exiting.
                // Showing it also exposes a storage error instead of stranding a hidden app.
                show_main(app);
                let _ = app.emit_to("main", "warren://quit-requested", ());
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(event, TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            }) {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

pub fn hide(app: AppHandle) -> Result<(), String> {
    // Never hide the only window without a way to bring it back.
    if app.tray_by_id(TRAY_ID).is_none() {
        return Err("The system tray is unavailable. Warren will remain open.".into());
    }
    let window = app.get_webview_window("main").ok_or("Warren window is unavailable.")?;
    window.hide().map_err(|error| error.to_string())
}
