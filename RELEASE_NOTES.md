# Warren v0.7.0

Rilis resmi Warren v0.7.0 — Memperkenalkan **Pixel Art Fleet Habitat**, visualisasi terowongan liang bawah tanah interaktif untuk armada agen (1 Orchestrator + 10 Spesialis termasuk Nexus), 5 status kerja agen berbasis prioritas atensi dengan animasi pixel CSS, Task Ledger 9 status dengan toggle arsip, dan query telemetri Kanban yang dioptimalkan.

### Ringkasan Rilis (v0.7.0):
- **Pixel Art Fleet Habitat (Observer)**:
  - Habitat bawah tanah interaktif dengan visual pixel art bergaya retro (grid 56×48): rumput hijau, tanah liat, dan dinding liang pasir dengan kontras tinggi pada tema Dark dan Terracotta.
  - Struktur hierarki akurat: **Leveret** sebagai Orchestrator di puncak tengah liang, menaungi **10 Agen Spesialis** (Aurora, Frame, Lens, Forge, Prism, Sentinel, Atlas, Radar, Quant, dan Nexus).
  - Jaringan terowongan SVG bersambung dinamis via ResizeObserver: 2 cabang simetris di layar desktop dan 1 poros tengah vertikal di layar mobile tanpa tabrakan dinding atau teks.
- **5 Status Agen & Animasi Karakter (Prioritas Atensi)**:
  - Status kerja komprehensif dengan hierarki perhatian: **`BLOCKED`** (Merah - minta bantuan) > **`WORKING`** (Hijau - makan wortel) > **`IN REVIEW`** (Amber - membaca laporan) > **`QUEUED`** (Biru muda - jam pasir) > **`IDLE`** (Abu-abu - tidur lelap).
  - Status `QUEUED` membaca task berstatus `ready`, `todo`, dan `scheduled` sehingga antrean pekerjaan agen terpantau transparan sebelum dieksekusi.
- **Task Ledger 9 Status & Toggle Arsip**:
  - Dukungan penuh 9 status resmi Hermes: `triage`, `todo`, `scheduled`, `ready`, `running`, `blocked`, `review`, `done`, serta `archived`.
  - Toggle **Show archived** untuk menyertakan task yang telah diarsipkan ke dalam 25 baris ledger secara aman (read-only).
- **Backend Rust & Telemetry Performance**:
  - Parameter `includeArchived` pada bridge native Rust Observer untuk query cepat tanpa overhead.
  - Auto-poll 10 detik aktif secara default dengan manajemen cancellation request saat tab tersembunyi atau koneksi terputus.

---

# Warren v0.6.1

Rilis hotfix resmi Warren v0.6.1 — Mengatasi fatal crash startup Android (WorkManager Room reflection) dan menambahkan fitur minimize-to-tray pada desktop Windows.

### Ringkasan Hotfix (v0.6.1):
- **Perbaikan Fatal Crash Startup Android (Samsung One UI / Android 16)**:
  - Memperbaiki aturan ProGuard/R8 consumer (`consumer-rules.pro`) untuk mempertahankan constructor reflection `androidx.work.impl.WorkDatabase_Impl` dan class turunan `androidx.room.RoomDatabase`.
  - Mengeliminasi `NoSuchMethodException` pada `InitializationProvider` yang sebelumnya menyebabkan aplikasi force close seketika saat cold-start.
  - Menambahkan verifikator bytecode otomatis (`scripts/verify-android-startup.py`) pada pipeline CI untuk menjamin APK rilis bebas dari regresi startup reflection.
- **Desktop System Tray (Close-to-Tray)**:
  - Tombol **Close (X) / Alt+F4** di desktop kini menyimpan state vault secara aman dan menyembunyikan aplikasi ke system tray tanpa memutus koneksi Gateway, stream respons AI, maupun sesi terminal SSH.
  - Opsi **Quit Warren** pada menu konteks tray untuk keluar penuh secara bersih setelah flush state.

---

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
- **Arsitektur Stabil v0.2.3 Dipulihkan**: Workspace stabil fokus pada SSH Terminal dan Hermes Agent.
- **Biometric / Fingerprint Unlock (Android)**: Buka kunci brankas cepat dengan sensor sidik jari perangkat berbasis Android Keystore.
- **Android System Bar & Cutout Safe-Area Fix**: Integrasi `WindowInsetsCompat` pada root view native Android dan safe-area CSS.
- **Mobile SSH Terminal Viewport & Clipping Fix**: Perbaikan kalkulasi dimensi FitAddon dan visualViewport keyboard virtual.
- **Extended Slash Commands Suite**: 13 perintah slash HTTP & lokal (`/lastcmd`, `/term`, `/clear`, `/retry`, `/fork`, `/export`, `/models`, `/model`, `/skills`, `/tools`, `/status`, `/stop`, `/help`).
