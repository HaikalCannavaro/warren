# Panduan Lengkap Koneksi & Integrasi Warren Mobile (Real Environment)
**Data Asli: URL Cloudflare Tunnel, Tailscale IP, API Key & Kredensial Nyata**

Dokumen ini berisi parameter koneksi **aktual dan terverifikasi** untuk menghubungkan aplikasi **Warren** ke seluruh layanan di VPS (`Hcnnvr-studio`) dan Windows PC (`haikalcannavaro`).

---

## 1. Koneksi Agent Chat (Tab "Agents") — 100% Verified

Warren dapat terhubung langsung ke agen **Leveret** (Master Orchestrator yang mengendalikan seluruh armada A2A dan toolset) melalui endpoint REST OpenAI-compatible berlatensi rendah:

### Parameter Form Koneksi Agen:
* **Nama Koneksi / Profil**: `Leveret`
* **Jenis Koneksi (Transport)**: `HTTP · Kompatibel OpenAI` (`openai`)
* **URL Server**:
  * **Jalur Publik (Cloudflare Tunnel)**:  
    `https://leveret.unlessrabbit.my.id/v1`
  * **Jalur Privat (Tailscale Mesh)**:  
    `http://100.65.133.127:8642/v1`
* **API Token**:  
  `6f421c87eac3cbe4e987e1db24e2139e`
* **Model**:  
  `leveret`
* **Execution Node**: `Hcnnvr-studio`

> **Status Uji Coba**:  
> Endpoint `https://leveret.unlessrabbit.my.id/v1/chat/completions` sudah diuji via cURL dengan token di atas dan mengembalikan respons `HTTP 200 OK` secara instan.

---

## 2. Koneksi Dual-Node SSH (Tab "Nodes")

Untuk membuka sesi terminal native mobile dan membaca telemetri hardware:

### Node 1: Linux VPS (`Hcnnvr-studio`)
* **Host**: `100.65.133.127` *(IP Tailscale)*
* **Port**: `22`
* **Username**: `root`
* **Metode Autentikasi**: Password root VPS Anda atau SSH Private Key.
* **Fingerprint SHA-256**: Disetujui saat pertama kali connect (*Trust & Connect*).

### Node 2: Windows Workstation (`haikalcannavaro`)
* **Host**: `100.91.205.20` *(IP Tailscale)*
* **Port**: `22` *(OpenSSH Windows)*
* **Username**: Username akun Windows Anda (contoh: `haikal` atau `Administrator`).
* **Metode Autentikasi**: Password Windows Anda atau SSH Key.
* **Fitur GPU Telemetry**: Begitu terhubung, tap tombol **Read GPU stats** untuk membaca otomatis utilisasi GPU NVIDIA, VRAM, dan temperatur secara live via `nvidia-smi`.

---

## 3. Koneksi Kanban Mission DAG & A2A Swarm (Tab "Settings")

Untuk memantau graf dependensi tugas (DAG) dan stream obrolan antar-agen (*A2A Chatter*):

Buka tab **Settings** → **Kanban & A2A connections**:

### A. Melalui Jalur Publik (Cloudflare Tunnel HTTPS/WSS)
* **Kanban Base URL**:  
  `https://hermes.unlessrabbit.my.id/api/plugins/kanban`
* **Kanban Event WebSocket URL**:  
  `wss://hermes.unlessrabbit.my.id/api/plugins/kanban/events`
* **A2A Cockpit Base URL**:  
  `https://hermes.unlessrabbit.my.id` (atau port 3450 jika di-tunnel)
* **Autentikasi Dashboard**:  
  * **Username**: `hcnnvr`
  * **Password**: Password web dashboard Hermes Anda.

### B. Melalui Jalur Tailscale Mesh (Privat Tanpa Internet)
* **Kanban Base URL**:  
  `http://100.65.133.127:9119/api/plugins/kanban`
* **Kanban Event WebSocket URL**:  
  `ws://100.65.133.127:9119/api/plugins/kanban/events`
* **A2A Cockpit Base URL**:  
  `http://100.65.133.127:3450`

---

## 4. Gateway WebSocket Eksklusif (Jika Memakai Mode Gateway)

Jika menggunakan mode `Transport: Gateway (WebSocket)` di profil chat:
* **Endpoint URL**:  
  `wss://hermes.unlessrabbit.my.id/api/ws`  
  *(atau via Tailscale: `ws://100.65.133.127:9119/api/ws`)*
* **Protokol Wire**: `durable-admission-v1`
* **Token / Ticket**: Menggunakan session ticket yang di-mint dari dashboard auth (`hcnnvr`).

---

## 5. Ringkasan Cheat-Sheet Cepat Salin-Tempel

| Layanan | Parameter | Nilai Asli (Tinggal Copy) |
| :--- | :--- | :--- |
| **Agent Leveret Chat** | URL Server | `https://leveret.unlessrabbit.my.id/v1` |
| **Agent Leveret Chat** | API Token | `6f421c87eac3cbe4e987e1db24e2139e` |
| **Agent Leveret Chat** | Model | `leveret` |
| **SSH VPS** | Host & Port | `100.65.133.127` : `22` (User: `root`) |
| **SSH Windows PC** | Host & Port | `100.91.205.20` : `22` (User: Windows Anda) |
| **Kanban DAG** | Base URL | `https://hermes.unlessrabbit.my.id/api/plugins/kanban` |
| **Kanban Events** | WebSocket URL | `wss://hermes.unlessrabbit.my.id/api/plugins/kanban/events` |
| **Dashboard Auth** | Username | `hcnnvr` |
