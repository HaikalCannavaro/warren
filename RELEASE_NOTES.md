# Warren v0.2.2

Rilis resmi Warren v0.2.2 — Personal Workspace untuk SSH Terminal & Hermes Agent Companion.

### Pembaruan & Fitur Baru (v0.2.2):
- **Extended Slash Commands Suite**: Dukungan penuh slash command pada koneksi HTTP REST (`transport: 'openai'`) dengan pengelompokan 4 kategori antarmuka:
  - **Workspace Bridge**: `/lastcmd [lines]` (dan alias `/term`) untuk menangkap N baris output terakhir dari buffer terminal SSH aktif dan langsung menyuntikkannya ke composer Agent sebagai blok konteks terformat.
  - **Session Control**: `/clear` (membersihkan visual pesan layar tanpa mereset memori sesi server), `/retry` (mengirim ulang pesan terakhir), `/fork [name]` (mencabangkan percakapan aktif ke tab sesi baru untuk eksperimen aman), `/export [md|json]` (mengunduh atau menyalin transkrip chat), dan `/stop` (menghentikan streaming seketika melalui abort controller lokal dan stop request).
  - **Hermes REST Intelligence**: `/models` & `/model [id]` (melihat dan mengganti model AI via `GET /v1/models`), `/skills` (melihat skill agent yang aktif via `GET /v1/skills`), dan `/tools` (melihat toolset yang tersedia via `GET /v1/toolsets`).
  - **System & Telemetry**: `/status` (mengukur latensi round-trip ms, status kesehatan server, dan fitur aktif via `GET /health` dan `GET /v1/capabilities`), `/help` (panduan perintah berkategori), dan `/usage` (status pemakaian sesi).
- **Adaptive Slash Menu UX**: Desain menu slash command responsif dengan pembagian kategori visual, navigasi keyboard (`↑/↓`, `Tab`, `Enter`, `Esc`), serta mode compact horizontal-scroll pada layar sempit/mobile agar tidak terhalang keyboard virtual.
- **Native HTTP Bridge Hardening**: Modul Rust `hermes_http` di backend Tauri v2 untuk eksekusi request REST berotentikasi ke API Server Hermes.
- **In-App Auto-Updater Compatibility**: Pembaruan otomatis dapat langsung diunduh dan dipasang dari menu Pengaturan Warren pada versi Windows dan Android.
