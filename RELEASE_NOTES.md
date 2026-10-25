# Warren v0.6.0

Rilis resmi Warren v0.6.0 — Memperkenalkan **Background Chat Delivery**, **Remote Push Notifications (Firebase Cloud Messaging / FCM)**, Native Outbox dengan Android Keystore & WorkManager, serta Replay & Reconnection Recovery.

### Ringkasan Rilis (v0.6.0):
- **Background Chat Delivery & Remote Push Notifications (Firebase FCM)**:
  - Chat ke agen tidak lagi terputus saat aplikasi ditutup, di-minimize, atau saat layar HP mati (Doze Mode).
  - Integrasi remote push notification FCM: HP menerima notifikasi banner sistem Android saat agen (Leveret) selesai memberikan balasan di latar belakang.
- **Native Android Outbox & Keystore Security**:
  - Antrean pesan native menggunakan WorkManager dengan enkripsi AES-256-GCM berbasis hardware **Android Keystore**, terpisah dari master password brankas.
  - Dukungan retry otomatis dengan ID tetap (`Idempotency`) dan sinkronisasi kembali saat jaringan pulih.
- **Settings → Background Delivery**:
  - Panel konfigurasi baru di tab Settings untuk mengaktifkan pengiriman background per koneksi Gateway, mendaftarkan token perangkat, dan meminta izin `POST_NOTIFICATIONS` Android 13+.
- **Server Background Relay**:
  - Layanan relay ringan di VPS yang terhubung ke Hermes Gateway dengan protokol `durable-admission-v1` dan `event-replay-v1` untuk menjamin pekerjaan agen tetap diselesaikan dan diteruskan ke FCM.

---

# Warren v0.5.0

Rilis resmi Warren v0.5.0 — Memperkenalkan **Fleet Observer Dashboard**, **The Burrow (Inter-Agent A2A Swarm Chatter)**, Dukungan Multi-Host Telemetri SSH, Tema Visual Baru (Warren Dark & Terracotta), dan Perbaikan Pengalaman Terminal Mobile.

### Ringkasan Rilis (v0.5.0):
- **Fleet Observer Dashboard (Halaman Awal Default)**:
  - Pusat observability terintegrasi yang memantau 3 pilar: Metrik Fisik Hardware (Linux CPU/RAM/Disk/Uptime & Windows/NVIDIA GPU load/VRAM/suhu via SSH), Status Kerja Armada Agen (Fleet Roster States), dan Status Tugas Kanban Hermes.
  - Multi-server host selector terpisah untuk fleksibilitas pemantauan node worker vs host orkestrator utama, dilengkapi toggle auto-poll 10 detik.
- **The Burrow (Swarm Chatter)**:
  - Ruang temu dan monitoring lalu lintas komunikasi rahasia antar-agen (A2A Chatter Stream) secara live streaming non-blocking via SSH `tail -f`.
  - Drawer detail transkrip percakapan turn-by-turn terformat Markdown lengkap dengan code syntax highlighting (`rehype-highlight` + `remark-gfm`).
- **Tema Visual Baru & Tipografi Mandiri**:
  - Dukungan multi-tema: **Warren Dark** (Midnight Obsidian) dan **Terracotta** (Warm Ember).
  - Integrasi font lokal JetBrains Mono WOFF2 tanpa ketergantungan CDN eksternal.
- **Peningkatan Mobile Terminal**:
  - Dukungan pengguliran riwayat terminal melalui sentuhan/swipe gestur mobile yang lebih halus dan responsif.

---

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
