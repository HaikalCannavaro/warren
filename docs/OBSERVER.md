# Observer — fleet dan infrastruktur

> Pembaruan roster/status terbaru: [Living Burrow](LIVING-BURROW.md). Observer kini memakai 11 agen, antrean, mode arsip, dan auto-poll 10 detik; Burrow mengenali Frame dan Nexus.

Observer adalah halaman awal Warren dan item pertama di sidebar maupun navigasi mobile. Ikon mata/HUD memakai SVG yang diberikan pengguna, dipakai bersama pada menu dan header. Panel, dropdown, ikon umum, dan angka mengikuti tema Warren Dark atau Terracotta; identitas spesialis serta indikator kesehatan tetap memiliki warna yang bermakna.

## Sumber data

Tambahkan profil lewat **Connections**, lalu pilih **Target Host** untuk hardware. Daftar memuat seluruh profil VPS tersimpan beserta status koneksinya. Gunakan **Connect** jika sumber belum tersambung; verifikasi fingerprint host tetap memakai alur Warren yang sudah ada.

**Orchestrator Host** menentukan sumber Fleet Roster dan Task Ledger secara terpisah. Profil yang nama atau host-nya memuat `hcnnvr-studio` dipilih saat pertama kali membuka Observer. Jika tidak ada, pilih host orkestrator secara eksplisit. Mengganti target hardware ke workstation tidak memindahkan query Kanban dari VPS orkestrator.

Pembacaan memakai kanal exec terpisah pada sesi SSH terautentikasi. Terminal interaktif dan inputnya tetap terpisah. Tidak ada kredensial tambahan maupun perintah shell bebas yang dapat dikirim melalui API Observer.

## Hardware Telemetry

Backend mencoba Linux dengan locale C:

```sh
cat /proc/loadavg && free -m && df -h / && uptime -p
```

Jumlah CPU logis juga dibaca melalui `getconf _NPROCESSORS_ONLN` atau `nproc`. Kartu CPU menampilkan load average mentah 1m/5m/15m. Bar menunjukkan tekanan beban `load 1m / jumlah CPU logis × 100`, bukan persentase utilisasi CPU yang diukur secara langsung. Jika jumlah CPU tidak tersedia, bar tekanan beban tidak ditampilkan.

RAM menunjukkan used/total dalam MB dan persentase pemakaian. Disk memakai filesystem `/`. Uptime berasal dari `uptime -p`.

Pada Linux yang menyediakan `nvidia-smi`, data GPU ditambahkan. Jika perintah Linux tidak dapat dijalankan, backend mencoba query NVIDIA langsung, termasuk untuk server SSH Windows:

```sh
nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits
```

Setiap baris CSV menjadi satu GPU dengan utilisasi, VRAM, dan suhu. Workstation membutuhkan SSH server serta `nvidia-smi` pada PATH sesi SSH. Tanpa driver/perintah yang didukung, panel menampilkan kegagalan pembacaan. Utilisasi/suhu NVIDIA yang tidak tersedia ditampilkan sebagai `—`.

Persentase beban memakai hijau di bawah 70, kuning dari 70 sampai 85, merah di atas 85. Indikator suhu memakai batas angka yang sama dalam °C. Nilai bar dibatasi pada area 0–100; angka asli tetap tersedia pada kartu/keterangan aksesibilitas.

## Fleet Roster dan Task Ledger

SQLite dibuka dengan `-readonly`, sehingga file database yang hilang tidak dibuat tanpa sengaja. Host orkestrator harus menyediakan CLI SQLite dengan dukungan `-json`, serta akses baca ke `/root/.hermes/kanban.db`.

```sh
sqlite3 -readonly -json /root/.hermes/kanban.db "SELECT assignee, status, title FROM tasks WHERE status IN ('running', 'blocked', 'review');"
sqlite3 -readonly -json /root/.hermes/kanban.db "SELECT id, title, assignee, status, priority, datetime(created_at, 'unixepoch') as created_at FROM tasks ORDER BY created_at DESC LIMIT 25;"
```

Roster mencakup Leveret, Forge, Atlas, Frame, Aurora, Prism, Lens, Sentinel, Radar, dan Quant. Assignee dicocokkan tanpa membedakan kapitalisasi; awalan `agent:`, `agent/`, `agent_`, atau `agent-` juga diterima. Jika satu agen punya beberapa pekerjaan, status utama mengutamakan BLOCKED, lalu IN REVIEW, lalu WORKING. Judul utama dan jumlah tugas aktif lain tetap ditampilkan.

IDLE hanya muncul setelah query berhasil dan agen tidak memiliki tugas aktif. Data yang belum terbaca menampilkan AWAITING DATA, bukan status idle yang diperkirakan. Status ini berasal dari tugas Kanban, bukan pemeriksaan heartbeat proses agen.

Task Ledger menampilkan maksimum 25 tugas terbaru, dengan filter All/Running/Blocked/Done serta assignee. Nilai prioritas teks dipertahankan; prioritas numerik ditampilkan sebagai `P<nilai>`. Waktu SQLite yang tidak memuat zona diperlakukan sebagai UTC dan dirender dalam WIB. Tabel dapat digulir horizontal pada ponsel.

## Refresh dan pembatalan

- **Refresh Data** mengambil ulang ketiga panel yang sumbernya tersambung.
- **Auto-poll 10s** bersifat opsional dan tidak menjalankan permintaan bertumpuk. Polling berkala berhenti selama halaman browser tersembunyi.
- Mengganti target hardware membatalkan pembacaan hardware lama dan langsung mengambil sumber baru. Fleet dan task tetap pada sumber orkestrator.
- Mengganti orkestrator, meninggalkan Observer, mengunci brankas, atau memutus SSH membatalkan kanal baca terkait. Respons lama diabaikan.
- Jika refresh gagal, data terakhir dari sumber yang sama tetap terlihat dengan pesan kegagalan dan waktu pembacaan terakhir. Data host lain tidak ditampilkan selama pergantian sumber.
- Pembukaan kanal dibatasi 15 detik, satu pembacaan 20 detik, dan output 8 MiB. Kanal ditutup setelah selesai atau dibatalkan.

Tidak ada fallback data buatan pada source aplikasi. Fixture untuk pemeriksaan UI disimpan di luar source dan tidak disertakan dalam ZIP.

## Validasi

Parser Linux/NVIDIA/SQLite, batas numerik, prioritas status roster, WIB, pembatalan saat pergantian host, respons terlambat, polling, filter, dan state tanpa data diuji di frontend. Navigasi awal Observer serta urutan sidebar/mobile juga diperiksa. Tampilan diperiksa pada desktop dan lebar ponsel 390 px dalam kedua tema.

Build frontend dan pemeriksaan tipe lulus. Toolchain Rust/Cargo dan perangkat target tidak tersedia pada lingkungan pengerjaan; kompilasi native, koneksi VPS/Windows SSH sesungguhnya, installer, dan APK belum divalidasi.
