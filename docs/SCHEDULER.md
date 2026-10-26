# Scheduler

Scheduler mengelola **crontab milik akun SSH yang tersambung**. Setelah disimpan,
cron server menjalankan jadwal meskipun Warren, desktop, atau HP ditutup.

## Menggunakan Scheduler

1. Simpan profil VPS pada Connections dan hubungkan SSH. Konfirmasi fingerprint
   host sebagaimana alur Terminal biasa.
2. Buka Scheduler dan pilih **Target host**. Daftar profil berasal dari VPS Warren.
   Jika belum tersambung, gunakan tombol Connect; Scheduler tidak memilih sesi
   server lain sebagai pengganti.
3. Klik Refresh untuk membaca daftar terbaru. Nama pengguna SSH dan zona waktu
   server tampil di atas daftar.
4. Klik **Add schedule**, isi nama, pilih preset atau ekspresi cron khusus, dan
   masukkan perintah satu baris. Simpan untuk memasangnya di crontab.
5. Gunakan Edit, Enable/Disable, atau Delete pada jadwal. Delete meminta konfirmasi.

Menyimpan jadwal tidak langsung menjalankan perintah. Jadwal yang aktif dapat
berjalan pada waktu cron berikutnya. Tidak ada tombol Run now pada versi ini.

## Host dan format yang didukung

- Linux dengan Python 3 dan utilitas `crontab`, serta izin cron untuk akun SSH.
- Tidak memakai sudo, tidak membaca crontab user lain atau `/etc/crontab`.
- Windows Task Scheduler dan systemd timers belum didukung. Host yang tidak
  memenuhi syarat menampilkan kesalahan tanpa memasang jadwal.
- Lima kolom: `minute hour day month weekday`, angka, nama bulan/hari,
  list/range/step positif. Macro: `@reboot`, `@hourly`, `@daily`, `@weekly`,
  `@monthly`, `@yearly`, `@annually`, `@midnight`.
- Nama maksimal 120 karakter; perintah satu baris maksimal 32 KiB UTF-8. TAB
  diperbolehkan, tetapi newline dan karakter kontrol lain ditolak.
- Ekspresi maksimal 256 karakter; format khusus implementasi cron yang tidak
  dikenal Warren dipertahankan sebagai baris yang tidak diedit.

Cron memakai lingkungan server yang minimal, biasanya shell `/bin/sh`. Gunakan
path absolut, arahkan output jika perlu, dan gunakan `/bin/bash /path/script.sh`
bila script membutuhkan Bash. Persen literal ditulis `\%`; `%` tanpa escape
memiliki arti khusus dalam cron. Warren mempertahankan perintah tanpa mencoba
menjalankan, meng-escape ulang, atau mengubah perilaku shell-nya.

Zona waktu yang ditampilkan adalah zona waktu server, bukan HP. Jika ada
`CRON_TZ` atau `TZ` di crontab, Warren menampilkan peringatan karena jadwal tertentu
dapat mengikuti aturan tersebut. Warren tidak mengubah zona waktu atau environment.

## Pelestarian dan perubahan bersamaan

Daftar berasal dari `crontab -l`. Pemasangan memakai `crontab -` pada kanal SSH
exec terpisah; terminal interaktif tetap tersedia. Request pengguna dikirim
sebagai data JSON melalui stdin, bukan disisipkan ke command shell SSH.

Baris yang didukung dapat diberi nama dengan komentar `# WARREN_JOB <metadata>`.
Nonaktif menggunakan awalan `# WARREN_DISABLED ` agar bisa diaktifkan lagi.
Komentar biasa tidak diubah menjadi jadwal. Komentar, environment, dan baris lain
dipertahankan. Menghapus hanya membuang entri yang dipilih beserta metadata
Warren miliknya; file boleh mendapat newline akhir saat diubah.

Setiap snapshot memiliki hash revision. Sebelum menulis, helper mengunci sesama
penulis Warren untuk UID yang sama lalu membaca ulang crontab. Revision yang
berbeda ditolak agar pengguna bisa Refresh dahulu. Editor dibatasi pada host,
sesi, dan revision asalnya. Beralih host mengabaikan hasil baca yang terlambat.

Editor eksternal seperti `crontab -e` tidak memakai lock Warren. Masih ada celah
kecil antara pembacaan dan pemasangan jika editor lain menulis persis bersamaan;
hindari mengedit crontab yang sama lewat dua alat pada saat bersamaan.

Jika koneksi terputus atau respons penulisan tidak terkonfirmasi, Warren tidak
mengirim ulang perubahan otomatis. Tombol perubahan ditahan sampai Refresh
berhasil. Periksa daftar di server sebelum mencoba lagi. Menutup halaman tidak
membatalkan penulisan yang sudah dikirim.

## Batas pengujian

Pengujian lokal memakai transport palsu dan backend crontab dalam memori, tanpa
mengubah VPS pengguna. Build Rust/Android dan uji cron server nyata wajib dilakukan
di pipeline/perangkat sebelum release. Lihat [TESTING.md](TESTING.md).
