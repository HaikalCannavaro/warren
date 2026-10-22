fn main() {
    // No webview permissions are generated: only Warren's Rust updater calls this bridge.
    tauri_plugin::Builder::new(&[]).android_path("android").build();
}
