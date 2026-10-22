# Arsitektur Warren

Warren adalah klien React dan TypeScript di dalam Tauri 2. Antarmuka browser menyediakan pratinjau; koneksi SSH, akses Hermes, dan brankas memerlukan aplikasi native. Windows dan Android menjadi target implementasi, tetapi build dan perilaku native belum tervalidasi pada perangkat.

Pergantian merek ke Warren mencakup nama tampilan, ikon, serta nama aset rilis. Identifier aplikasi `dev.harbor.workspace`, nama berkas dan client brankas, dan namespace plugin internal tetap stabil untuk mempertahankan lokasi data dan kontrak native. Warren ditujukan sebagai installer pertama yang dirilis. Transisi dari installer Windows Harbor, bila ada, memerlukan migrasi tersendiri karena NSIS juga memakai nama produk untuk identitas instalasi; upgrade Android memerlukan package ID dan sertifikat yang sama serta versi lebih tinggi.

## Batas komponen

| Komponen | Tanggung jawab |
| --- | --- |
| `src/components/TerminalWorkspace.tsx` | Terminal xterm, tab, ukuran layar, dan peninjauan paste. |
| `src/components/HermesWorkspace.tsx` | Percakapan, draft, respons streaming, dan aktivitas alat. |
| `src/hooks/useWorkspace.ts` | Status sesi, identitas percakapan, penyimpanan, penguncian, dan penutupan desktop. |
| `src/lib/native.ts` | Perintah Tauri dan kanal peristiwa bertipe. |
| `src/lib/vault.ts` | Antrean penyimpanan snapshot melalui Stronghold. |
| `src-tauri/src/ssh.rs` | Transport SSH dengan russh dan PTY interaktif. |
| `src-tauri/src/hermes.rs` | HTTP terautentikasi dan parser SSE Hermes. |

Terminal dan chat memiliki identitas serta siklus hidup terpisah. Berpindah halaman atau percakapan tidak menutup terminal. Menutup satu sesi tidak menutup sesi lain. Buffer terminal bersifat sementara; profil, draft, pengaturan, dan riwayat chat masuk ke snapshot brankas.

## SSH

`ssh_probe` membaca fingerprint SHA-256 lalu menolak handshake tanpa autentikasi. Pengguna membandingkannya dengan sumber tepercaya sebelum menyimpan kepercayaan. `ssh_connect` memeriksa kembali fingerprint yang tepat sebelum memakai password atau private key; perubahan host atau port menghapus kepercayaan tersimpan.

Setiap sesi memiliki kanal keluaran byte, antrean input terbatas, PTY, dan shell sendiri. Batasnya 16 sesi dan 64 KiB per pengiriman input. Tidak ada reconnect, pengulangan autentikasi, atau pengiriman ulang input otomatis. Penolakan input atau resize ditampilkan sebagai kesalahan operasi; status koneksi tetap mengikuti peristiwa native. Penutupan sesi dan penghancuran jendela meminta pemutusan SSH.

## Hermes

URL dinormalisasi ke basis `/v1`. Koneksi jarak jauh wajib HTTPS; HTTP hanya diizinkan untuk alamat IP loopback literal. Kredensial dalam URL, query, fragmen, redirect, proxy bawaan sistem, dan retry otomatis ditolak atau dinonaktifkan. Pada Android, loopback menunjuk perangkat Android itu sendiri.

`probe_hermes` memeriksa `/models` memakai bearer token. Hasil ini hanya memverifikasi endpoint model, bukan streaming, ketersediaan seluruh alat, atau pembatalan. Chat memakai `/chat/completions`, `stream: true`, `X-Hermes-Session-Key` per percakapan, dan `Idempotency-Key` per permintaan. Identitas permintaan disimpan sebelum dikirim.

Parser SSE berbasis byte menangani Unicode terpotong, CRLF, komentar keepalive, dan peristiwa alat. Batasnya 512 KiB per frame, 16 MiB per stream, serta jeda tanpa byte 75 detik. Kegagalan atau pembatalan dari server tidak dianggap sukses; putus transport tanpa konfirmasi hasil menghasilkan status `unknown`. Percakapan dengan hasil `unknown` tidak boleh mengirim lanjutan sebelum pengguna memeriksa server dan membuat percakapan baru.

Mengubah URL profil membuat profil baru dan mempertahankan hubungan riwayat dengan endpoint lama. Warren tidak menyediakan remote cancel, pemulihan hasil melalui polling, penyambungan ulang stream, atau pemulihan otomatis pekerjaan. Menutup tampilan tidak menjamin tugas Hermes berhenti.

## Brankas dan siklus hidup

Stronghold menyimpan snapshot terenkripsi `harbor.hold` di direktori data lokal aplikasi, menggunakan master password minimal 12 karakter dan Argon2 dengan salt lokal. Ini bukan integrasi OS keychain, Windows Credential Manager, atau Android Keystore. Tidak ada reset atau pemulihan master password. Data yang dibuka tetap diperlukan dalam memori antarmuka selama digunakan.

Penyimpanan biasa ditunda 350 ms dan dijalankan berurutan. Penguncian menolak chat yang masih aktif, memblokir pekerjaan baru secara sinkron, memutus sesi SSH, menyimpan, lalu melepas Stronghold. Penutupan desktop memblokir perubahan, menandai respons yang belum selesai sebagai `unknown`, menunggu penyimpanan, lalu menghancurkan jendela. Peristiwa chat terlambat diabaikan agar snapshot itu tidak berubah menjadi sukses semu. Jika penyimpanan gagal, jendela tetap terbuka.

Android tidak memakai intersepsi penutupan desktop. Perubahan visibilitas mencoba menyimpan, tetapi suspend, force-stop, atau penghentian proses oleh OS tidak menjamin operasi asinkron selesai. Saat snapshot dibuka kembali, pesan yang tersimpan sebagai `streaming` dipulihkan menjadi `unknown`. Sesi SSH, buffer terminal, dan stream tidak dipulihkan.

## Pembaruan aplikasi

`useAppUpdater` mempertahankan status pemeriksaan dan unduhan di tingkat App agar pergantian halaman tidak menghapus progres. `UpdatePanel` menyediakan tindakan eksplisit cek, unduh, dan pasang. `runUpdateInstallation` menolak sesi SSH/permintaan Hermes aktif, membekukan perubahan, lalu menyimpan brankas sebelum memanggil installer. Kegagalan pemasangan mengharuskan pemeriksaan ulang; hasil izin/installer Android tetap memungkinkan percobaan ulang eksplisit.

Empat command di `src-tauri/src/updater.rs` menyediakan metadata build, pengecekan, pengunduhan dan pemasangan. URL, public key, dan artifact tersimpan di sisi native; frontend tidak menerima kewenangan memilih URL installer. Windows memakai `tauri-plugin-updater` dengan verifikasi signature dan versi bertanda tangan. Android memakai `android_updates.rs` untuk verifikasi metadata dan unduhan, serta plugin internal `android-updater` untuk validasi APK dan dialog OS. Backend Android memeriksa ulang hash dan identitas APK sebelum membuka installer melalui FileProvider privat.

Konfigurasi produksi dibuat oleh `scripts/release.mjs`; default tanpa konfigurasi bersifat nonaktif. Pengemasan dan publikasi draft memverifikasi ulang signature serta isi paket. Android memakai keystore APK yang sama antarrilis, terpisah dari kunci penandatanganan metadata updater. Detail operasi terdapat di [UPDATES.md](UPDATES.md). Tidak ada layanan update eksternal yang dijalankan dari source ini.
