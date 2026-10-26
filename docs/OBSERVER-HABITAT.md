# Habitat fleet di Observer

> Arsip tahap desain sebelumnya. Implementasi terbaru memakai habitat pixel art 2.5D dengan area menurut status dan perpindahan berjalan: lihat [LIVING-BURROW.md](LIVING-BURROW.md).

Fleet Roster kini tampil sebagai sarang kelinci bergaya **clay 2.5D**, dengan
shading SVG, bayangan, liang bertingkat, dan jalur terowongan bersama. Grafik
dibuat langsung dalam source; tidak membutuhkan WebGL, model 3D eksternal,
texture, library animasi, atau render loop JavaScript.

## Data dan perilaku

Habitat tetap berada di **Observer → Fleet Roster**. Menu Burrow tetap menampilkan
log A2A. Data habitat berasal dari pembacaan fleet SQLite melalui SSH ke **Orchestrator
Host**, sama seperti roster sebelumnya. Mengganti Target Host hardware tidak
memindahkan sumber status kelinci.

Daftar kelinci mengikuti `FLEET_AGENTS`: Leveret, Forge, Atlas, Frame, Aurora,
Prism, Lens, Sentinel, Radar, dan Quant. Satu agen memiliki satu kelinci, termasuk
saat idle. Beberapa tugas untuk satu agen tidak menambah karakter. Roster saat
ini didefinisikan dalam source Warren; bukan hasil penemuan otomatis agen baru.

| Status | Tampilan |
|---|---|
| Working | Duduk makan wortel, kepala mengunyah dan telinga bergerak ringan |
| Idle | Tidur dengan napas perlahan dan tanda z |
| Review | Memegang lembar hasil kerja, menunduk membacanya |
| Blocked | Terjaga dengan penanda hambatan |
| Awaiting data | Terjaga netral dengan tanda tanya; tidak dinyatakan idle |

Aturan agregasi status tetap: blocked lebih dahulu, lalu review, working,
dan idle bila tidak ada tugas aktif. Seluruh tugas tetap terlihat di detail.

Ketuk/klik kelinci untuk membuka dialog berisi role, status, semua judul tugas
aktif, nama sumber, dan waktu pembaruan WIB. Interaksi ini hanya membaca data;
tidak mengirim perintah atau membatalkan task pada VPS.

## Kesegaran dan animasi

- Gunakan Refresh Data atau Auto-poll 10s yang sudah ada di Observer.
- Snapshot berumur **60 detik** ditandai kedaluwarsa. Ini juga berlaku jika
  auto-poll dimatikan; Refresh berhasil mengembalikan status current.
- Error polling mempertahankan status terakhir, menampilkan penanda stale,
  dan menjeda animasi. Tidak ada perubahan palsu menjadi idle.
- Data yang belum tersedia menghasilkan sepuluh kelinci unknown, tanpa data
  contoh yang disuntikkan ke aplikasi produksi.
- Animasi berhenti saat halaman/app tersembunyi, habitat keluar viewport,
  pembacaan sedang berlangsung, dialog detail terbuka, atau data belum current.
- Tombol Pause motion/Resume motion memberi kontrol manual. Preferensi
  `prefers-reduced-motion` perangkat dihormati dan membekukan animasi.
- Observer hanya menerima sesi yang cocok dengan profil, hostname, port, dan
  username saat ini. Sesi lama dari profil yang endpoint-nya sudah diedit tidak
  dipakai untuk membaca fleet. Pergantian sumber mereset detail agen yang terbuka.

Tidak ada listener jaringan atau polling SSH baru khusus animasi. Timer lokal
10 detik hanya memeriksa umur snapshot dan dibersihkan saat komponen dilepas.
Gerakan dibuat oleh CSS; pose tidak menentukan status server.

## Navigasi dan responsivitas

Settings terpisah dari lima menu utama. Desktop menempatkannya dengan ikon gear
di bagian bawah sidebar. Mobile memakai gear pada header; gear juga tersedia
ketika sidebar desktop dilipat. Header Settings menggunakan ikon gear yang sama.

Habitat memakai lima kolom/dua tingkat pada panel lebar. Panel sempit memakai
dua kolom agar nama dan status tetap terbaca tanpa panorama yang harus digeser.
Detail bisa dibuka dengan keyboard dan fokus kembali ke kelinci setelah ditutup.
Kedua tema Warren Dark dan Terracotta mempunyai warna terrain yang sesuai palet.

## Batas validasi

Tes komponen memeriksa jumlah kelinci, status/pose, banyak tugas, detail yang
berubah, data unknown/stale, timer, visibility, reduced motion, dan observer
viewport. Pemeriksaan browser menggunakan fixture lokal terpisah dari source
produksi. Build native, APK/perangkat fisik, dan koneksi VPS nyata tetap perlu
diuji sebelum rilis digunakan.
