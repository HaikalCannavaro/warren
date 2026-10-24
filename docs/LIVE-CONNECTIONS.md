# Menghubungkan perangkat dan layanan Warren

Kredensial diisi **langsung dari aplikasi**, bukan di-hardcode. Aplikasi native Windows/Android menyimpan profil SSH, token agen, dan konfigurasi layanan dalam Stronghold vault lokal yang terenkripsi. Pada browser, perubahan hanya berada dalam memori.

## 1. Perangkat awal

| Target | Platform yang Anda berikan | Tailscale |
| --- | --- | --- |
| Hcnnvr-studio | Ubuntu 22.04 Azure | `100.65.133.127` |
| haikalcannavaro | Windows 11 | `100.91.205.20` |

Buka **Nodes → Configure** pada perangkat yang sesuai. Nama dan IP sudah menjadi isian awal. Isi username SSH sebenarnya, port (umumnya 22), serta password atau private key/passphrase. Simpan, lalu pilih **Connect SSH**. Cocokkan fingerprint SHA-256 dengan sumber server tepercaya sebelum memilih **Trust & connect**. Perubahan host key ditolak sebelum autentikasi.

Gunakan **Add device connection** untuk perangkat lain. Perangkat tambahan tampil sebagai target tersendiri dan dapat dipilih pada koneksi agen. Tidak ada username, password, private key, atau token produksi bawaan di source.

## 2. Kanban dan feed A2A

Buka **Settings → Kanban & A2A connections**. Isian awal mengarah ke VPS yang Anda berikan, tetapi koneksi belum diaktifkan sampai **Save & connect** dipilih:

- Kanban base URL: `http://100.65.133.127:9119/api/plugins/kanban`
- A2A Cockpit base URL: `http://100.65.133.127:3450`
- Token Kanban dan token A2A: isi bila layanan Anda memerlukannya; masing-masing dikirim sebagai Bearer token ke endpoint yang bersangkutan.

Warren membaca:

```text
GET <kanban>/board
GET <kanban>/orchestration
GET <kanban>/workers/active
GET <kanban>/tasks/{task_id}
GET <cockpit>/api/v1/swarm/feed
WS  <kanban>/events
```

WebSocket Kanban diturunkan otomatis dari base URL. Isian event override tersedia bila reverse proxy menggunakan path lain. Jika tersedia tailer A2A WebSocket, masukkan URL-nya pada **Event stream overrides → A2A WebSocket**. Tanpa URL tersebut, feed memakai GET berkala.

**Alamat `127.0.0.1` di ponsel mengarah ke ponsel itu sendiri.** Jika plugin hanya listen pada localhost VPS, sediakan akses ke layanan itu melalui interface Tailscale atau reverse proxy Anda, lalu isi URL yang bisa dicapai oleh aplikasi. Warren tidak mengubah binding atau membuka port di VPS secara otomatis.

REST dipoll setiap 10 detik. Event Kanban memicu refresh board yang digabungkan agar burst event tidak menyebabkan request berlebihan. Jika WebSocket putus, polling REST tetap berjalan dan status stream ditampilkan di Settings. Error satu layanan tidak menghapus data layanan lain. Refresh manual membuka ulang stream. Lock vault menghentikan subscription dan mencegah respons terlambat mengisi layar kembali.

DAG memakai `task_links` dan `mission_edges` dari respons API; lifecycle `todo`, `ready`, `running`, `blocked`, `review`, `done` tetap ditampilkan. Worker aktif berasal dari `/workers/active`. Inspector task mengambil rincian `/tasks/{id}`, termasuk komentar dan metadata lampiran yang dikembalikan server. A2A memakai timestamp, sender, peer, task ID, dan summary yang diterima dari agregator/tailer.

Integrasi ini **baca-saja**. Tombol membuat/mengubah task tidak mengirim API yang belum ditentukan. Endpoint mutasi/dispatch belum diberikan; engine Kanban dan worker di server tetap mengelola lifecycle tugas.

## 3. Endpoint agen per target

Pada **Agents → Configure/Connect**, tetapkan:

1. Nama profil agen dan kategori Core Fleet, Security, atau Companions.
2. **Execution node** yang benar.
3. Endpoint HTTP/Gateway yang benar-benar menjalankan agen pada perangkat tersebut, beserta tokennya.

Node selector di atas composer memilih **endpoint profil yang ditetapkan ke node tersebut**, bukan menambahkan nama PC ke prompt. Jika target belum memiliki endpoint, pengiriman dinonaktifkan dan tidak dialihkan ke node lain. Koneksi Gateway tetap memerlukan `session_authority` dan `durable-admission-v1`.

Port listener A2A 9900–9911 bukan otomatis endpoint chat canonical `/api/ws`. Karena itu Warren tidak menebak URL chat dari nomor listener A2A. Nama profil yang Anda berikan sudah tersedia sebagai role yang bisa dikonfigurasi; role belum berarti koneksi aktif.

## 4. GPU Windows lewat SSH

Sesudah profil PC disimpan dan fingerprint-nya diverifikasi, pilih **Read GPU stats**. Rust membuka channel SSH exec terpisah dari terminal, lalu hanya menjalankan perintah tetap berikut:

```sh
nvidia-smi --query-gpu=utilization.gpu,utilization.memory,memory.total,memory.used,temperature.gpu --format=csv,noheader,nounits
```

Tidak ada field untuk menyisipkan command lain. Query dibatasi waktu, ukuran output, dan harus selesai dengan exit status 0. Pembacaan diperbarui setiap 10 detik selama aktif pada tab Nodes; **Stop**, pergantian tab, atau lock menghentikan sampling. Keystroke/output terminal interaktif tidak dipakai untuk mengangkut query.

VRAM occupancy dihitung dari `memory.used / memory.total`. `utilization.memory` ditampilkan terpisah sebagai memory-engine activity. Banyak GPU menghasilkan beberapa card. Pembacaan gagal ditandai; nilai lama, bila ada, ditandai stale. CPU/RAM tidak diisi tanpa sumber telemetry untuk metrik tersebut.

## 5. Browser capture dari Gateway

Warren menerima `tool_artifact`/`tool.artifact` pada event Gateway yang terikat ke **session dan admission ID** yang sesuai. Payload gambar mengikuti format Anda:

```json
{
  "type": "tool_artifact",
  "tool": "browser_exec",
  "artifact_type": "image/png",
  "data": "data:image/png;base64,..."
}
```

Event tanpa identitas session/admission tidak ditempelkan ke percakapan lain. Gambar PNG/JPEG/WebP yang valid tampil di bubble asisten dan tab **Telemetry → Browser**, dengan frame 16:9 dan tombol Zoom. URL gambar eksternal serta SVG tidak dimuat sebagai artifact. Payload base64 dibatasi sekitar 1.8 MiB per gambar agar sesuai batas frame Gateway; gunakan capture WebP/PNG yang cukup kecil. Dua capture terakhir per pesan dipertahankan dalam vault.

Chrome/CDP port 9222 dan Playwright Windows tetap dijalankan oleh agen/harness server. Warren menampilkan artifact yang diterima, bukan menjalankan browser remote debugging secara langsung.

## Validasi yang tersedia

Source diuji dengan server HTTP/WebSocket loopback, board dan feed protokol, serta server SSH uji yang memverifikasi bahwa hanya command GPU tetap dijalankan. Penolakan host key yang berubah diuji sebelum autentikasi. Ini tidak menyatakan bahwa koneksi fisik ke kedua alamat Tailscale sudah diuji: profil SSH dan layanan yang reachable masih perlu Anda isi/aktifkan dari aplikasi.
