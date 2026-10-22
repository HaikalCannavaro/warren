# Panel Agent dan Tool Activity

Perubahan ini dibuat dari repository `HaikalCannavaro/warren`, commit `1dd1679bbe7068ee6eb59a3f75c40418424c3f46`. Nomor versi tetap mengikuti repository; tentukan nomor versi rilis berikutnya saat menyiapkan distribusi.

## Menggunakan panel

- Tombol panel di kiri atas aplikasi menyembunyikan atau menampilkan sidebar Warren. Sesi terminal tetap terpasang ketika sidebar ditutup.
- Agent menampilkan satu ruang chat tanpa panel riwayat. Ketik `/new` untuk memulai sesi baru; tombol **Start chat** (**Mulai chat**) hanya muncul sebelum ada chat aktif. **Open chat** (**Buka chat**) di Connections melanjutkan chat yang sudah ada untuk koneksi tersebut. Saat brankas dibuka kembali, Warren memulihkan chat aktif yang tersimpan, atau chat terbaru jika pilihan sebelumnya tidak tersedia.
- Tombol aktivitas di kanan judul percakapan membuka atau menutup **Tool Activity**. Panel juga memiliki tombol tutup sendiri.
- Panel aktivitas selalu berdampingan dengan chat, termasuk pada layar kecil. Saat dibuka, panel bergeser dari kanan dan mempersempit chat; saat ditutup, chat melebar. Panel tidak menutup bubble atau menonaktifkan composer. Escape menutup panel hanya ketika fokus berada di dalam panel; fokus kembali ke tombol pembuka.
- Chat menggunakan tinggi ruang kerja yang tersedia. Pesan pengguna berada di kanan; balasan profil Agent berada di kiri. Draft dan riwayat aktivitas tetap tersedia ketika panel disembunyikan.
- Dot sesi terhubung dan proses Agent berdenyut lembut. Menu aktif memiliki gelombang singkat, dan perpindahan halaman memakai fade serta pergeseran ringan. Seluruh gerakan menghormati preferensi sistem **reduced motion**.

Panel aktivitas terbuka secara default pada desktop yang cukup lebar. Pilihan buka/tutup bertahan saat ukuran jendela berubah dan saat berpindah menu selama aplikasi terbuka; bukan pengaturan permanen. Navigasi mempertahankan komponen Agent dan terminal, sehingga draft, pilihan teks, dan riwayat tidak dibuat ulang. Bubble pengguna tetap menempel di kanan dan bubble Agent di kiri selama lebar chat berubah.

## Identitas koneksi dan Profile

Header menampilkan nama koneksi dan **Profile** Hermes, misalnya `Personal VPS` dan `Leveret`. Tidak ada menu rename conversation. Profile berbeda dari model AI yang menjalankan Agent; `/model` tetap mengatur mesin AI sesuai dukungan server.

Gateway membaca nama profile dari `snapshot.info.profile_name`. Identitas internal `profile_id` tidak ditampilkan. Nama profile tersimpan bersama sesi dan balasan baru agar identitas balasan sebelumnya tidak ikut berubah. Balasan lama yang belum memiliki metadata memakai label profile sesi/koneksi yang tersedia, atau `Agent` jika belum diketahui.

Kolom Profile pada koneksi menyediakan label ketika nama belum dilaporkan server. Kolom ini tidak memindahkan sesi ke profile lain. Pada HTTP, pilih URL/token milik profile yang dituju, termasuk rute `/p/<profile>/` jika disediakan server. Parameter model API tetap terpisah di Advanced karena dapat berupa alias API atau model AI. Pada Gateway, nama yang dilaporkan server diutamakan.

Pemisahan ini mengikuti [implementasi API Server Hermes 0.22.4](https://github.com/NousResearch/hermes-agent/blob/v0.22.4/gateway/platforms/api_server.py) dan [panduan HTTP multi-profile](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server#multi-profile-routing-pprofile).

Sidebar disederhanakan menjadi identitas Warren, navigasi, panduan singkat, dan versi. Label **Personal workspace**, **Browser preview**, **PREVIEW**, serta banner mode pratinjau tidak lagi memenuhi area utama. Informasi batas demo browser tersedia di kartu informasi aplikasi pada halaman Settings. Koneksi langsung dan brankas terenkripsi memerlukan aplikasi terpasang.

## Bahasa antarmuka

Warren memakai **English** secara default. Buka **Settings → Language** atau **Pengaturan → Bahasa** untuk memilih **English** atau **Bahasa Indonesia**. Teks antarmuka langsung menyesuaikan dan pilihan tersimpan di perangkat, termasuk setelah aplikasi dibuka ulang. Penggantian bahasa tidak mengubah sesi, isi pesan, balasan Agent, hasil server, atau data terminal. Bahasa balasan Agent tetap mengikuti konfigurasi Hermes dan percakapannya.

## Isi log

Log disimpan bersama percakapan di brankas lokal. Setiap percakapan menyimpan paling banyak **200 entri**, dengan teks sampai **4.000 karakter per entri**. Percakapan lama tanpa log tetap bisa dibuka; aktivitas sebelum pembaruan ini tidak dapat direkonstruksi.

Log mencatat awal permintaan, teks progres tool yang dilaporkan server, awal respons, dan hasil akhir permintaan. Status terputus/tidak pasti ditampilkan sebagai **Status unknown**. Penyelesaian respons bukan bukti bahwa semua tool berhasil.

Jika endpoint tidak mengirim event progres tool, Warren hanya dapat menampilkan aktivitas permintaan/respons yang diterimanya. Panel ini tidak menambahkan akses ke proses server, tidak mengambil log shell secara otomatis, dan tidak mengeksekusi perintah baru.

Teks progres ditampilkan sebagai teks biasa. Log mengikuti chat aktif; menutup panel tidak menghentikan pencatatan. Jika pengguna sedang membaca entri lama, panel mempertahankan posisi baca alih-alih selalu melompat ke bawah.

## Memasang perubahan ke source

Paket **Warren-slash-commands-source.zip** menyertakan source lengkap, termasuk panel Agent, slash command, dan pilihan bahasa. Paket terbaru tidak menyertakan patch pendamping. Ekstrak ke folder terpisah untuk meninjau perubahan, lalu dari folder source yang berisi `package.json`:

```powershell
npm ci
npm test
npm run build
```

Jika repository Anda sudah memiliki perubahan tambahan, bandingkan dengan source paket sebelum mengintegrasikannya. Pertahankan konfigurasi rilis dan perubahan lokal yang masih diperlukan.

Untuk distribusi, gunakan konfigurasi rilis, signing key, dan identitas aplikasi yang sudah dipakai pada Warren terpasang. Naikkan versi melalui alur rilis yang sudah tersedia, lalu ikuti [panduan pembaruan](UPDATES.md). Paket source ini tidak menerbitkan rilis GitHub atau memperbarui aplikasi terpasang secara otomatis.

## Validasi perubahan

Tes frontend mencakup persistensi dan pemulihan log, isolasi percakapan, callback yang datang terlambat, batas log, status terminal, draft saat panel ditutup, akses keyboard panel, metadata Profile, serta navigasi yang tidak melepas terminal atau Agent. Build frontend dan pemeriksaan TypeScript dijalankan pada source ini.

Demo visual memakai data simulasi tanpa koneksi VPS; keterangan demo tersedia di Settings. Pengujian antarmuka di browser mencakup desktop, ukuran ponsel, pergantian bahasa, dan pemulihan pilihan setelah reload. Perubahan ini belum diuji terhadap Hermes langsung, installer Windows baru, atau APK baru; lakukan pemeriksaan pada perangkat sebelum merilis build berikutnya. Hasil dan batas pengujian terbaru tercantum dalam [TESTING.md](TESTING.md).
