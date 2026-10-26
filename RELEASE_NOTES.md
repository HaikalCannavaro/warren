# Warren v0.7.1

Rilis resmi Warren v0.7.1 — Memperkenalkan **Unified Living Burrow**, habitat bawah tanah organik 2.5D dengan kurva SVG halus dan penyatuan tanah tunggal (single soil union), reposisi Liang Teduh ke tengah bawah terhubung ke Liang Mimpi dan Pos Bantuan, lubang rumput alami (natural turf opening), distribusi Idle 6-5 yang seimbang, serta validasi 466 tes frontend.

### Ringkasan Rilis (v0.7.1):
- **Unified Living Burrow 2.5D (Observer Habitat)**:
  - Visualisasi habitat organik 2.5D memperhalus liang dan terowongan menjadi satu kesatuan tanah alami berbasis SVG/CSS tanpa WebGL/raster berat, mempertahankan karakter kelinci, pohon, dan rumput pixel art.
  - Penyatuan tanah tunggal (*single soil union*): Dinding, rim, dan lantai digambar satu kali per lapisan pada seluruh jaringan dengan mask SVG, menghilangkan garis sambungan atau diskontinuitas warna.
  - Mulut terowongan melebar secara halus (*smooth flare*) ke ruang liang, serta pintu masuk permukaan berupa lubang oval berbayang pada rumput alami.
- **Topologi 5 Liang & Reposisi Liang Teduh**:
  - Lima liang bawah tanah organik: Liang Siaga (kiri atas), Ruang Telaah (kanan atas), Pos Bantuan (kiri tengah), Liang Mimpi (kanan bawah), dan Liang Teduh yang digeser ke tengah bawah.
  - Liang Teduh terhubung langsung via terowongan ke Liang Mimpi dan Pos Bantuan, dengan pathfinding graf shortest-path untuk animasi perpindahan agen.
  - Teras Koneksi di permukaan rumput untuk kelinci yang menunggu data telemetri pertama tanpa membuat liang fiktif.
- **Distribusi Idle 6-5 Seimbang & Dinamika Kelinci**:
  - Pembagian 11 agen Idle terdistribusi stabil antara Liang Mimpi (6) dan Liang Teduh (5) tanpa reshuffle acak saat auto-poll.
  - Animasi perpindahan status aktif (*walking sprite*, status badge *On the way / Di perjalanan*, orientasi wajah tanpa pembalikan teks nameplate).
- **Verifikasi Kualitas & Test Suite**:
  - 466 unit/integration tests lulus di 39 test files (termasuk geometri liang, kurva kontur, deteksi containment, flare sambungan, dan shortest path).

---

# Warren v0.7.0

Rilis resmi Warren v0.7.0 — Memperkenalkan **Pixel Art Fleet Habitat**, visualisasi terowongan liang bawah tanah interaktif untuk armada agen (1 Orchestrator + 10 Spesialis termasuk Nexus), 5 status kerja agen berbasis prioritas atensi dengan animasi pixel CSS, Task Ledger 9 status dengan toggle arsip, dan query telemetri Kanban yang dioptimalkan.

### Ringkasan Rilis (v0.7.0):
- **Pixel Art Fleet Habitat (Observer)**:
  - Habitat bawah tanah interaktif dengan visual pixel art bergaya retro (grid 56×48): rumput hijau, tanah liat, dan dinding liang pasir dengan kontras tinggi pada tema Dark dan Terracotta.
  - Struktur hierarki akurat: **Leveret** sebagai Orchestrator di puncak tengah liang, menaungi **10 Agen Spesialis** (Aurora, Frame, Lens, Forge, Prism, Sentinel, Atlas, Radar, Quant, dan Nexus).
- **5 Status Agen & Animasi Karakter (Prioritas Atensi)**:
  - Status kerja komprehensif: **`BLOCKED`** > **`WORKING`** > **`IN REVIEW`** > **`QUEUED`** > **`IDLE`**.
  - Status `QUEUED` membaca task berstatus `ready`, `todo`, dan `scheduled` agar antrean pekerjaan agen terpantau transparan.
- **Task Ledger 9 Status & Toggle Arsip**:
  - Dukungan penuh 9 status resmi Hermes: `triage`, `todo`, `scheduled`, `ready`, `running`, `blocked`, `review`, `done`, serta `archived`.
  - Toggle **Show archived** untuk menyertakan task yang telah diarsipkan ke dalam 25 baris ledger secara aman (read-only).
- **Backend Rust & Telemetry Performance**:
  - Parameter `includeArchived` pada bridge native Rust Observer untuk query cepat tanpa overhead; auto-poll 10 detik aktif secara default.

---

# Warren v0.6.1

Rilis hotfix resmi Warren v0.6.1 — Mengatasi fatal crash startup Android (WorkManager Room reflection) dan menambahkan fitur minimize-to-tray pada desktop Windows.

### Ringkasan Hotfix (v0.6.1):
- **Perbaikan Fatal Crash Startup Android (Samsung One UI / Android 16)**:
  - Memperbaiki aturan ProGuard/R8 consumer (`consumer-rules.pro`) untuk mempertahankan constructor reflection `androidx.work.impl.WorkDatabase_Impl` dan class turunan `androidx.room.RoomDatabase`.
  - Mengeliminasi `NoSuchMethodException` pada `InitializationProvider` yang sebelumnya menyebabkan crash saat cold-start.
  - Menambahkan verifikator bytecode otomatis (`scripts/verify-android-startup.py`) pada CI pipeline.
- **Desktop System Tray (Close-to-Tray)**:
  - Tombol **Close (X) / Alt+F4** di desktop menyembunyikan aplikasi ke system tray tanpa memutus koneksi Gateway, AI stream, maupun sesi terminal SSH.

---

# Warren v0.6.0

Rilis resmi Warren v0.6.0 — Memperkenalkan **Background Chat Delivery**, **Remote Push Notifications (Firebase FCM)**, Native Outbox dengan Android Keystore & WorkManager, serta Replay & Reconnection Recovery.

### Ringkasan Rilis (v0.6.0):
- **Background Chat Delivery & Remote Push Notifications (Firebase FCM)**: Chat ke agen tetap berjalan di latar belakang saat aplikasi ditutup/layar mati, dengan notifikasi sistem Android saat selesai.
- **Native Android Outbox & Keystore Security**: Antrean pesan WorkManager dengan enkripsi AES-256-GCM berbasis hardware **Android Keystore**, terpisah dari master password brankas.
- **Settings → Background Delivery**: Panel konfigurasi background relay per koneksi Gateway dan izin `POST_NOTIFICATIONS` Android 13+.
- **Server Background Relay**: Layanan relay VPS terhubung ke Hermes Gateway dengan protokol `durable-admission-v1` dan `event-replay-v1`.

---

# Warren v0.5.0

Rilis resmi Warren v0.5.0 — Memperkenalkan **Fleet Observer Dashboard**, **The Burrow (Inter-Agent A2A Swarm Chatter)**, Multi-Host Telemetri SSH, dan Tema Visual Baru (Warren Dark & Terracotta).

### Ringkasan Rilis (v0.5.0):
- **Fleet Observer Dashboard**: Pemantauan hardware Linux/Windows/NVIDIA GPU via SSH, status armada agen, dan Task Ledger Kanban.
- **The Burrow (Swarm Chatter)**: Live streaming non-blocking lalu lintas A2A chatter via SSH `tail -f` dengan drawer detail Markdown syntax highlighting.
- **Tema Visual Baru**: Tema **Warren Dark** dan **Terracotta** dengan font lokal JetBrains Mono WOFF2 mandiri.
- **Mobile Terminal UX**: Peningkatan gestur scroll sentuh terminal yang lebih halus dan responsif.

---

# Warren v0.4.0

Rilis resmi Warren v0.4.0 — Rollback ke arsitektur stabil v0.2.3 (Personal Workspace untuk SSH Terminal & Hermes Agent Companion dengan Biometrik Fingerprint & Layout Fixes).

### Ringkasan Rilis (v0.4.0):
- **Arsitektur Stabil v0.2.3 Dipulihkan**: Workspace stabil fokus pada SSH Terminal dan Hermes Agent.
- **Biometric / Fingerprint Unlock (Android)**: Buka kunci brankas dengan sensor sidik jari perangkat berbasis Android Keystore (`AndroidKeyStore`).
- **Android Safe-Area & Viewport Fix**: Integrasi `WindowInsetsCompat` dan safe-area CSS, perbaikan kalkulasi FitAddon terminal mobile agar baris bawah dan kanan tidak terpotong.
- **Extended Slash Commands Suite**: 13 perintah slash HTTP & lokal (`/lastcmd`, `/term`, `/clear`, `/retry`, `/fork`, `/export`, `/models`, `/model`, `/skills`, `/tools`, `/status`, `/stop`, `/help`).
