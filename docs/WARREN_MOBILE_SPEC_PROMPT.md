# Warren Mobile — Hermes Multi-Agent Mission Control & Dual-Node Cockpit
## Comprehensive Product Requirements Document (PRD), Architecture & AI Implementation Prompt

---

## 1. Ringkasan Eksekutif & Karakteristik Project

**Warren Mobile** adalah aplikasi client mobile berbasis **Tauri v2 (Android APK)** dan **React 19 + TypeScript** yang dirancang sebagai pusat komando operasional (*Mission Control Cockpit*) untuk:
1. **Hermes Autonomous Agent Fleet**: Orkestrasi multi-agen dinamis berbasis protokol native **A2A** (*Agent-to-Agent*) dan **Kanban Lifecycle**.
2. **Dual-Node Execution Hub (Environment Nyata Kita)**: Routing eksekusi transparan antara server Linux cloud 24/7 (**VPS `Hcnnvr-studio`**) dan workstation bertenaga (**Windows PC `haikalcannavaro`**) melalui mesh network **Tailscale**.
3. **Telegram-Style High-Fidelity Tool Telemetry**: Visualisasi pemanggilan tools internal agen secara *inline*, ringkas, interaktif, dan dapat di-*expand* langsung di dalam bubble chat tanpa mengotori alur percakapan.
4. **Tauri Native Security**: Brankas lokal terenkripsi (*Tauri Stronghold*) yang diamankan oleh autentikasi biometrik native perangkat (*Fingerprint/Face Unlock*).

---

## 2. Technical Stack & Real Dual-Node Infrastructure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WARREN MOBILE (Tauri v2 + React 19)                   │
│   [Tailwind CSS] [Lucide Icons] [xterm.js] [Stronghold Vault] [Biometrics]  │
└───────────────────────┬─────────────────────────────┬───────────────────────┘
                        │ (WebSocket wss://.../api/ws)│ (Tailscale Mesh / SSH)
                        ▼                             ▼
┌───────────────────────────────────────────┐ ┌───────────────────────────────┐
│        NODE 1: LINUX VPS (Azure)          │ │  NODE 2: WINDOWS WORKSTATION  │
│        "Hcnnvr-studio" (100.65.133.127)   │ │  "haikalcannavaro" (100.91.205.20)
├───────────────────────────────────────────┤ ├───────────────────────────────┤
│ • Hermes Gateway Daemon (durable-v1)      │ │ • GPU Processing (CUDA/Local) │
│ • FastAPI Backend Cockpit (Port 3450)     │ │ • Playwright Non-Headless GUI │
│ • Docker Containers & PM2 Daemons         │ │ • Android APK / Tauri Compile │
│ • Cloudflare Tunnel (unlessrabbit.my.id)  │ │ • Remote Power: Ping, WOL     │
│ • Telegram & WhatsApp Bridge Daemons      │ │ • Native PowerShell / PTY     │
└───────────────────────────────────────────┘ └───────────────────────────────┘
```

### 2.1. Protokol Komunikasi (WebSocket vs REST)
* **Koneksi Utama: Hermes WebSocket Gateway (`wss://.../api/ws`)**
  * Wire Protocol: `durable-admission-v1` (terverifikasi kompatibel dengan Hermes Agent Gateway).
  * Karakteristik Mobile:
    * **Latency**: Sub-50ms roundtrip (meniadakan overhead handshake TLS berulang pada jaringan mobile).
    * **Bi-directional Push**: Server langsung mendorong token delta, status tool execution, event inter-agent chatter, dan approval dialog tanpa polling baterai.
    * **Resilience**: State sesi persisten di server; saat koneksi seluler terputus dan tersambung kembali (auto-reconnect backoff 2s/4s/8s), percakapan dan status turn tidak hilang.
* **Koneksi Sekunder: REST HTTP API Fallback**
  * Digunakan hanya saat endpoint gateway tidak menyediakan layanan socket atau untuk pengecekan status awal `/health`.

---

## 3. Dynamic Agent Roster & Classification (Seluruh Profil Fleet)

Warren **tidak me-hardcode** daftar agen secara statis di frontend. Saat tersambung ke Gateway, aplikasi melakukan dynamic discovery profil dari server (`/root/.hermes/profiles/`) dan mengelompokkannya ke dalam 3 tier operasional:

```
                  ┌─────────────────────────────────────────┐
                  │    DYNAMIC AGENT ROSTER DISCOVERY       │
                  └────────────────────┬────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
 [ CORE ENGINEERING ]        [ RED-TEAM & SECURITY ]        [ COMPANIONS & BOTS ]
 • LEVERET (Chief of Staff)  • ANTAGONIST (HackerAI Pentest)• GROUPBOT (AW.ai)
 • FORGE (Backend & APIs)    • SENTINEL (Defensive Audit)   • Future Chat Bridges
 • FRAME (Frontend UI/Client)
 • AURORA (Product & UX DNA)
 • ATLAS (DevOps, SRE, VPS)
 • PRISM (Functional QA)
 • LENS (Rendered Visual QA)
 • RADAR (Web Research)
 • QUANT (Quantitative Engine)
 • NEXUS (Obsidian Knowledge)
```

### 3.1. Roster Lengkap Spesialis Fleet di Environment Kita

1. **LEVERET** (Chief of Staff, Swarm Orchestrator, Quality Governor):
   * Menerima prompt komprehensif, memecah milestone, mendelegasikan tugas ke spesialis via A2A & Kanban, menegakkan quality gates.
2. **FORGE** (Backend, APIs, Databases, Integrasi & Bot):
   * Membangun service FastAPI, skrip automation, manajemen database, dan server-side logic.
3. **FRAME** (Frontend & Client Architecture):
   * Implementasi komponen React 19, arsitektur UI mobile, optimasi layout, rendering state, dan integrasi Tauri native.
4. **AURORA** (Product Design & Visual Architecture):
   * Merancang sistem desain (Design DNA), information architecture, palet warna, tipografi, dan standar anti-AI-slop.
5. **ATLAS** (DevOps, SRE, Infrastructure & Operations):
   * Pengelolaan runtime VPS, container Docker, PM2 daemon, Cloudflare tunnel, backup, dan metrik kesehatan mesin.
6. **PRISM** (Functional QA, Regression & Algorithmic Correctness):
   * Pengujian logika bisnis, eksekusi unit/integration test, validasi kontrak API, dan benchmark data.
7. **LENS** (Rendered Visual QA & Art Direction Verification):
   * Inspeksi DOM hasil render di viewport mobile/desktop, deteksi layout overflow, dan verifikasi tampilan fisik UI.
8. **SENTINEL** (Defensive Security & Vault Protection):
   * Audit keamanan kode, proteksi kredensial, sanitasi payload, pengujian auth, dan enkripsi.
9. **ANTAGONIST** (Offensive Security, Pentest & Red-Team):
   * Spesialis Red-Team, vulnerability assessment, web/API penetration testing, dan exploit analysis.
10. **RADAR** (Current Technical Research & Web Intelligence):
    * Eksplorasi dokumentasi teknis terbaru, web scraping terarah, benchmark teknologi, dan primary sources.
11. **QUANT** (Quantitative & Statistical Analysis):
    * Analisis time-series, pemodelan probabilitas, strategi finansial, dan data crunching.
12. **NEXUS** (Documentation, Obsidian RAG & Ops Sync):
    * Sinkronisasi knowledge base Obsidian Vault, pencatatan runbook/SOP, dan dokumentasi release notes.
13. **GROUPBOT (AW.ai)**:
    * Bot companion interaktif untuk platform komunikasi instan (WhatsApp/Telegram).

---

## 4. Dual-Node Execution Hub (Device Real Kita)

Sistem mengenali dan mengontrol dua node komputasi nyata di jaringan kita:

### Node 1: Linux VPS (`Hcnnvr-studio` — Ubuntu Azure 24/7)
* **Identitas Node**: `Hcnnvr-studio` | Tailscale IP: `100.65.133.127`
* **Karakteristik**: Server cloud Linux yang selalu aktif 24 jam dengan Cloudflare Tunnel (`unlessrabbit.my.id`).
* **Beban Kerja**:
  * Hermes Gateway WebSocket Daemon (`durable-admission-v1`).
  * Backend API Cockpit FastAPI (`port 3450`).
  * Microservices Docker container, cronjob otomatis, dan bot WhatsApp/Telegram.
* **Aksi Cepat di Warren**: Membuka sesi SSH native terminal langsung dari ponsel.

### Node 2: Windows Workstation (`haikalcannavaro` — Windows PC Haikal)
* **Identitas Node**: `haikalcannavaro` | Tailscale IP: `100.91.205.20`
* **Karakteristik**: Laptop/PC desktop Windows utama milik Haikal, terhubung P2P via Tailscale Mesh.
* **Beban Kerja**:
  * Akselerasi GPU lokal (NVIDIA CUDA) untuk komputasi model atau rendering.
  * Browser testing non-headless (Playwright GUI langsung terlihat di layar monitor).
  * Build pipeline lokal (compile Android APK / Tauri biner).
  * Remote power management: Ping latency, Sleep, Wake-on-LAN (WOL).
* **Aksi Cepat di Warren**: Membuka PowerShell/PTY remote via Tailscale bridge port 8088 atau SSH Windows.

### Target Node Selector di Chat Composer:
Di bagian atas input chat terdapat tombol toggle cepat:  
`Exec Target: [ 🌐 Hcnnvr-studio (VPS) ▾ ]`  
User dapat men-tap untuk beralih ke `[ 🖥️ haikalcannavaro (PC) ]` atau `[ ⚡ AUTO (Orchestrator Decision) ]`.

---

## 5. Fitur Utama: Telegram-Style Inline Tool Execution

### 5.1. Masalah pada Desain Lama
Pada versi lama atau antarmuka standar, aktivitas tool agen (seperti membaca file, menjalankan shell, atau search) disembunyikan di tab terpisah atau hanya muncul sebagai log teks mentah panjang yang merusak ritme membaca percakapan.

### 5.2. Solusi: Inline Collapsible Tool Cards (Mirip Telegram / Modern CLI)
Saat agen mengeksekusi tool di background, aplikasi merender kartu interaktif kompak langsung di dalam stream pesan:

#### Struktur Komponen Kartu Tool:
1. **Header Bar (Tinggi 38px, rounded 8px, background `#101a28`, border `#233044`)**:
   * **Left Icon**: Ikon spesifik kategori tool:
     * `⚡ terminal` → TerminalSquare
     * `📄 read_file` → FileText
     * `🔍 search_files` → Search
     * `✏️ patch / write_file` → FileCode2
     * `🌐 web_search / web_extract` → Globe
     * `🖥️ browser_exec` → Monitor
     * `🤖 a2a_call / delegate_task` → GitMerge
   * **Title & Parameter Snippet**:
     * Format: `<tool_name>(<high_signal_arg>)`
     * Contoh: `search_files(pattern: "*warren*", path: "/root/haikal")`
     * Font: Monospace (`Cascadia Code`), ukuran 11px, warna `#bad2dd`.
   * **Status Badge**:
     * **RUNNING**: Dot berdenyut + label `Running...` (Aksen oranye-kuning `#f59e0b`).
     * **SUCCESS**: Badge centang teal `#6be2c4` dengan runtime (contoh: `0.38s ✓`).
     * **FAILED**: Badge silang merah `#fa9aa5` dengan error code (contoh: `Exit 1 ✗`).
   * **Right Chevron**: Ikon panah (`ChevronDown` / `ChevronUp`) mengindikasikan kartu dapat di-tap.

2. **Expanded Accordion (Muncul saat kartu di-tap)**:
   * **Section 1: Input Arguments**: JSON payload terformat rapi dengan syntax highlighting gelap.
   * **Section 2: Execution Output / Result**:
     * Monospace output box (`#0a0f18`) dengan max-height 180px dan scrollbar halus.
     * Tombol **Copy Output** di pojok kanan atas.
     * Jika output berupa diff patch, gunakan penanda warna merah (`-`) dan hijau (`+`).

3. **Smart Chain Grouping (Batch Tool Executions)**:
   * Jika agen memanggil 3 atau lebih tools beruntun sebelum membalas teks (misal: `search_files` → `read_file` → `patch` → `terminal`), kartu-kartu tersebut otomatis dirangkum dalam satu baris header:  
     `▶ 4 Tools Executed (search_files, read_file, patch, terminal) • 1.6s total`
   * Men-tap header akan membuka seluruh riwayat pemanggilan tool secara teratur.

---

## 6. Design System & Visual Identity (Warren Industrial Dark)

* **Palet Warna**:
  * `Background Base`: `#0c131f` (Deep Obsidian Navy)
  * `Surface Card`: `#101a28` (Card & Panel Base)
  * `Surface Elevated`: `#152031` (Modal, Dropdown, Bottom Sheet)
  * `Border / Divider`: `#233044` (Subtle 1px border)
  * `Accent Primary`: `#6be2c4` (Teal Emerald Glow)
  * `Accent Secondary`: `#183533` (Active item container)
  * `Text Primary`: `#dce4ee` (Kontras tinggi, nyaman di mata)
  * `Text Muted`: `#8b9ab0` (Label, subtitle)
  * `Text Faint`: `#607087` (Timestamp, footnote)
  * `Status Badges`:
    * Success / Connected: `#6be2c4`
    * Warning / Active: `#f59e0b`
    * Danger / Disconnected: `#fa9aa5`
* **Tipografi**:
  * Antarmuka Umum: `Inter`, `-apple-system`, `sans-serif`
  * Kode, Terminal & Telemetri: `Cascadia Code`, `SF Mono`, `Consolas`, monospace
* **Layout & Ergonomi Mobile**:
  * **Bottom Navigation Bar**: 5 item navigasi utama yang dapat dijangkau ibu jari satu tangan.
  * **Safe Area Insets**: Mendukung `env(safe-area-inset-top)` dan `env(safe-area-inset-bottom)` untuk perangkat modern.
  * **Touch Target**: Minimal 44 × 44 pt pada semua elemen tombol interaktif.

---

## 7. Arsitektur 5 Tab Navigasi Aplikasi Mobile

### 📱 Tab 1: "Swarm" (Inter-Agent Chatter & Mission Control)
* **Header**:
  * Logo Warren (`Warren.`), Connection Pill (`WS: Live • 12ms`), dan Icon Quick Lock Brankas.
* **Active Mission Card**:
  * Menampilkan misi aktif yang dipimpin oleh LEVERET.
  * Visualisasi DAG (Directed Acyclic Graph) mini: status task selesai/berjalan (misal: `3/5 Tasks Done`).
* **Live A2A Activity Feed (Inter-Agent Chatter Stream)**:
  * Stream percakapan antar-agen secara langsung:
    * `[LEVERET → FORGE]` *"Bangun endpoint auth baru di port 3450."*
    * `[FORGE]` *"Unit test passed. Running Docker rebuild..."*
    * `[FORGE → SENTINEL]` *"Minta audit sanitasi input payload."*
    * `[SENTINEL → LEVERET]` *"Security scan clear: 0 vulnerabilities found."*
  * Badge status lifecycle: `WORKING`, `CONSULTING`, `DONE`.
  * Tapping pada item obrolan membuka **Subagent Trace Sheet** (detail reasoning, prompt payload, pemakaian token).

### 💬 Tab 2: "Agents" (Fleet Roster & 1-on-1 Chat)
* **Sub-Header Filter**:
  * Filter tab kategori: `All`, `Core Fleet`, `Security & Ops`, `Companions`.
* **Agent Carousel**:
  * Avatar agen horizontal dengan indikator status dot (Online, Busy, Standby).
* **Direct Conversation Thread**:
  * Chat 1-on-1 bersih dengan agen terpilih.
  * Pesan Markdown kaya: blok kode berwarna dengan tombol copy.
  * **Telegram-Style Inline Tool Cards** (sebagaimana didefinisikan pada Bab 5).
* **Composer Area**:
  * Target Node Selector Pill: `[ Hcnnvr-studio (VPS) ▾ ]` di atas input teks.
  * Tombol helper Slash Command (`/help`, `/new`, `/status`, `/compact`, `/stop`).
  * Input textarea yang memanjang dinamis (auto-expand hingga 140px).
  * Tombol Kirim beraksen Teal dengan animasi status `Streaming...` dan counter token.

### 🖥️ Tab 3: "Nodes" (Dual-Node Monitoring & Terminal)
* **Card Node 1: Linux VPS (`Hcnnvr-studio` — 100.65.133.127)**:
  * Status gauge: CPU %, RAM %, Disk NVMe %, Network Ping.
  * Layanan aktif: Docker (active), PM2 (hermes-daemon), Cloudflare Tunnel (Online `unlessrabbit.my.id`).
  * Tombol Aksi: **Launch VPS Terminal** (SSH).
* **Card Node 2: Windows Workstation (`haikalcannavaro` — 100.91.205.20 Tailscale)**:
  * Status koneksi: Tailscale Active.
  * Telemetri: GPU NVIDIA Usage %, VRAM %, CPU Temp.
  * Tombol Kontrol Daya: Ping, Sleep, Wake-on-LAN (WOL).
  * Tombol Aksi: **Launch PowerShell Shell**.
* **Embedded Mobile Terminal (`xterm.js`)**:
  * Terminal dengan font monospace tajam dan scrollback buffer.
  * **Custom Mobile Keybar** di atas keyboard sentuh:  
    `[ ESC ]  [ TAB ]  [ CTRL ]  [ ALT ]  [ | ]  [ / ]  [ - ]  [ ↑ ]  [ ↓ ]`

### ⚡ Tab 4: "Telemetry" (Forensic Drawer & Code Diffs)
* **Global Tool Audit Log**:
  * Rekam jejak seluruh eksekusi tool lintas agen dalam bentuk timeline audit terinci.
* **Unified Git Diff Viewer**:
  * Visualisasi side-by-side / inline diff dengan warna merah/hijau saat agen melakukan patch pada source code project.
* **Headless Browser Snapshot**:
  * Kartu preview screenshot 16:9 dari hasil pengujian Playwright / Browser Use tool di VPS (`Hcnnvr-studio`) atau PC (`haikalcannavaro`).

### ⚙️ Tab 5: "Settings" (Security & Vault Management)
* **Local Stronghold Vault**:
  * Status proteksi enkripsi hardware.
  * Toggle Biometric Unlock (Sidik Jari / Face ID).
  * Auto-lock idle timer (1 menit, 5 menit, segera).
* **Gateway Connectivity**:
  * URL WebSocket Gateway (`wss://.../api/ws`).
  * REST Fallback URL.
  * Gateway Token (tersimpan aman di keychain perangkat).
* **Preferensi**:
  * Bahasa Antarmuka: *Bahasa Indonesia* / *English*.
  * Konfigurasi font & ukuran tampilan terminal.

---

## 8. Master AI Implementation Prompt (Ready to Copy)

Gunakan instruksi terstruktur di bawah ini saat memberikan prompt ke AI coding agent / UI generator (seperti **v0.dev, Claude Artifacts, Cursor, Figma AI, Bolt, Lovable**):

```text
Buatkan source code aplikasi mobile lengkap dan mockup antarmuka (React 19 + Tailwind CSS + Lucide Icons + TypeScript) untuk "Warren Mobile — Hermes Multi-Agent Mission Control & Dual-Node Cockpit".

SPESIFIKASI VISUAL & TEMA:
- Tema: Industrial High-Tech Dark Mode.
- Palet Warna: Background #0c131f, surface card #101a28, elevated panel #152031, border line #233044, accent teal #6be2c4, accent dim #173b38, text #dce4ee & #8b9ab0, warning #f59e0b, danger #fa9aa5.
- Font: Inter untuk UI, Cascadia Code / monospace untuk code & telemetri.
- Viewport: Mobile-first (390px - 430px) dengan safe-area insets dan Bottom Navigation Bar 5 tab:
  1. Tab "Swarm" (Mission DAG, inter-agent chatter timeline, trace inspector).
  2. Tab "Agents" (Categorized carousel: Core Fleet, Security, Companions; direct chat dengan Telegram-style tool execution card, node selector).
  3. Tab "Nodes" (Dual-node monitoring: Linux VPS "Hcnnvr-studio" & Windows Workstation "haikalcannavaro" via Tailscale dengan GPU stats, terminal SSH xterm.js dengan mobile keybar).
  4. Tab "Telemetry" (Audit log tool terperinci, unified file diff patch viewer, browser snapshot preview 16:9).
  5. Tab "Settings" (Local encrypted vault, biometrics unlock, websocket gateway config).

FITUR KHUSUS TELEGRAM-STYLE INLINE TOOL EXECUTION DI CHAT:
- Di dalam bubble pesan chat asisten, render pemanggilan tool internal agen secara inline sebagai Collapsible Tool Cards:
  * Header Bar: Tool Icon (Terminal, Search, File, Edit, Web), nama tool + parameter penting ringkas (misal: terminal("npm run test") atau search_files("*.ts")), badge status (RUNNING shimmer kuning-oranye, DONE 0.4s centang teal, ERROR silang merah), dan ikon expand chevron.
  * State Expand (Tap to Open): Accordion box monospace gelap berisi formatted JSON arguments dan box preview stdout/output log dengan tombol "Copy Output".
  * Tool Chain Grouping: Jika 3+ tool dipanggil berurutan, kelompokkan secara cerdas dalam satu kartu rangkuman: "▶ 4 Tools Executed (search_files, read_file, patch, terminal) • 1.6s".

FITUR DUAL-NODE & KONEKTIVITAS:
- Header atas menampilkan status WebSocket real-time: "WS: Connected • 14ms" (Hermes durable-admission-v1).
- Tepat di atas composer pesan chat terdapat Node Selector Pill: [ 🌐 Hcnnvr-studio ▾ ] / [ 🖥️ haikalcannavaro ▾ ] untuk mengarahkan target eksekusi agen.
- Sediakan touch interaction yang halus, code block dengan syntax highlight & tombol copy, serta mobile keyboard action bar [ESC][TAB][CTRL][ALT][|][/][↑][↓] pada tab terminal.
```
