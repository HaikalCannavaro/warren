# Panduan Lengkap Koneksi & Integrasi Warren Mobile (Real Environment)
**Data Asli: URL Cloudflare Tunnel, Tailscale IP, API Key & Gateway WebSocket**

Dokumen ini berisi parameter koneksi **aktual dan terverifikasi** untuk menghubungkan aplikasi **Warren** ke seluruh layanan di VPS (`Hcnnvr-studio`) dan Windows PC (`haikalcannavaro`).

---

## 1. Koneksi Agent Chat (Tab "Agents") — 100% Verified

Anda memiliki 2 opsi koneksi resmi untuk terhubung langsung ke agen **Leveret** (Master Orchestrator):

### OPSI A: Gateway (WebSocket) — Mode Tercepat & Real-time (Rekomendasi Utama)
Mode ini menggunakan koneksi persisten WebSocket dua arah dengan protokol resmi `hermes-gateway-v1` dan `durable-admission-v1`:
* **Nama Koneksi / Profil**: `Leveret`
* **Jenis Koneksi (Transport)**: `Gateway` (WebSocket)
* **Gateway URL**:
  * **Jalur Publik (Cloudflare Tunnel WSS)**:  
    `wss://leveret.unlessrabbit.my.id/api/ws`
  * **Jalur Privat (Tailscale Mesh)**:  
    `ws://100.65.133.127:8640/api/ws`
* **Gateway Token**:  
  `6f421c87eac3cbe4e987e1db24e2139e`
* **Model**:  
  `leveret`
* **Execution Node**: `Hcnnvr-studio`

> **Status Uji Coba**:  
> Endpoint `wss://leveret.unlessrabbit.my.id/api/ws` sudah diuji langsung dengan token di atas. Berhasil menerima handshake `gateway.ready`, lulus validasi `session_authority: true`, dan berhasil membuat sesi chat dengan kapabilitas `durable-admission-v1`.

---

### OPSI B: HTTP · Kompatibel OpenAI (REST Streaming)
* **Nama Koneksi / Profil**: `Leveret`
* **Jenis Koneksi (Transport)**: `HTTP · Kompatibel OpenAI` (`openai`)
* **URL Server**:
  * `https://leveret.unlessrabbit.my.id/v1`
  * Tailscale: `http://100.65.133.127:8642/v1`
* **API Token**:  
  `6f421c87eac3cbe4e987e1db24e2139e`
* **Model**:  
  `leveret`

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
  `https://hermes.unlessrabbit.my.id`
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

## 4. Ringkasan Cheat-Sheet Cepat Salin-Tempel (WebSocket Mode)

| Parameter di Warren | Nilai Asli (Tinggal Copy) |
| :--- | :--- |
| **Jenis Koneksi** | `Gateway` (WebSocket) |
| **Gateway URL** | `wss://leveret.unlessrabbit.my.id/api/ws` |
| **Gateway Token** | `6f421c87eac3cbe4e987e1db24e2139e` |
| **Model** | `leveret` |
| **Execution Node** | `Hcnnvr-studio` |
| **SSH VPS Host** | `100.65.133.127:22` (User: `root`) |
| **SSH Windows PC** | `100.91.205.20:22` (User: Windows Anda) |
