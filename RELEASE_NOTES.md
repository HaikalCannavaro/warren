# Warren v0.4.0

Rilis resmi Warren v0.4.0 — Rollback ke arsitektur stabil v0.2.3 (Personal Workspace untuk SSH Terminal & Hermes Agent Companion dengan Biometrik Fingerprint & Layout Fixes).

### Ringkasan Rilis (v0.4.0):
- **Arsitektur Stabil v0.2.3 Dipulihkan**:
  - Mengembalikan workspace stabil ke antarmuka klasik Warren yang fokus pada SSH Terminal dan Hermes Agent.
- **Biometric / Fingerprint Workspace Unlock (Android)**:
  - Dukungan buka kunci brankas cepat menggunakan sensor sidik jari / biometrik perangkat (`androidx.biometric.BiometricPrompt`) yang diamankan dengan enkripsi AES-256-GCM berbasis hardware **Android Keystore (`AndroidKeyStore`)**.
  - Opsi pendaftaran otomatis (*Enable fingerprint unlock on this device*) saat membuka brankas pertama kali dengan master password, tombol akses cepat **Buka dengan sidik jari** di layar masuk, serta pengaturan manajemen biometrik di menu **Settings**.
- **Android System Bar & Cutout Safe-Area Fix**:
  - Integrasi `WindowInsetsCompat` (`systemBars()`, `displayCutout()`, dan `ime()`) langsung pada root view native Android serta fallback CSS `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` agar bagian atas aplikasi (`.topbar` & `.vault-screen`) tidak lagi tertimpa oleh status bar sistem.
- **Mobile SSH Terminal Viewport & Clipping Fix**:
  - Perbaikan kalkulasi dimensi `FitAddon` dengan memisahkan padding ke wrapper `.xterm-shell` dan mengenolkan padding `.xterm-container`, ditambah pemangkasan batas baris/kolom (*row/col clamping*) dan listener `window.visualViewport` saat keyboard virtual muncul agar baris prompt paling bawah dan sisi kanan terminal tidak lagi terpotong.
  - Tata letak halaman terminal mobile yang lebih ringkas dan responsif untuk memaksimalkan ruang vertikal sesi SSH.
- **Extended Slash Commands Suite**: Tetap menyertakan seluruh 13 perintah slash HTTP & lokal (`/lastcmd`, `/term`, `/clear`, `/retry`, `/fork`, `/export`, `/models`, `/model`, `/skills`, `/tools`, `/status`, `/stop`, `/help`).
