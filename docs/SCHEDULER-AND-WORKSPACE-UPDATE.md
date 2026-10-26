# Scheduler dan perapian Warren

Catatan tahap Scheduler berikut bersifat historis. Habitat kelinci dan navigasi Settings dilanjutkan pada [pembaruan berikutnya](HABITAT-AND-NAVIGATION-UPDATE.md).

Baseline tepat: **v0.6.1**, commit
`878bfb3c149fd05d8a0adc2c6f592c68665a85f8`.
Application ID tetap `dev.harbor.workspace`. Nomor versi belum dinaikkan.

## Perubahan yang disertakan

- Scheduler: pilih koneksi VPS, baca cron, tambah/edit jadwal, aktif/nonaktif,
  pencarian, dan hapus dengan konfirmasi. Jadwal berjalan pada server.
- Agent Chat dan pengelolaan profil Agent dihapus dari tampilan. Navigasi:
  Observer, Terminal, Scheduler, Burrow, Connections, Settings.
- Background delivery tidak lagi ada di Settings. Sinkronisasi otomatis React,
  enqueue, worker Android, serta pemrosesan pesan FCM tidak mengirim pekerjaan
  Agent baru. Bridge background hanya melaporkan status retired.
- Worker Android lama tetap memiliki nama/constructor yang sama sebagai shim
  agar record WorkManager dari APK sebelumnya selesai tanpa pekerjaan baru.
  Tag kerja lokal lama dibatalkan; auto-init messaging dimatikan dan penghapusan
  token dicoba jika Firebase sudah terinisialisasi. Push yang sudah diantrekan
  masih mungkin tiba. Tidak ada pembatalan task Hermes di server.
- Data chat, outbox terenkripsi, dan profil lama tidak dihapus. Kode/skema lama
  yang diperlukan untuk kompatibilitas brankas masih disertakan. UI tidak
  menampilkan data itu sebagai aktivitas chat berjalan atau menghalangi updater.
- Firebase release menjadi opsional. Tidak ada perubahan token, kunci, atau
  konfigurasi VPS. Layanan relay yang sudah terpasang tidak dihentikan.
- Subteks umum dibesarkan; form, footer, status, dan navigasi mobile mendapat
  pembungkusan teks yang lebih baik. Tema Dark/Terracotta memakai palet yang ada.
- [Habitat kelinci Observer](OBSERVER-HABITAT-CONCEPT.md) hanya dokumen konsep.
  Runbooks belum dibuat.

## Integrasi patch untuk bot release

Mulai dari checkout bersih commit baseline di atas. Bila HEAD berbeda, periksa
perubahan yang sudah ada dan integrasikan manual; jangan memaksa patch atau
mereset perubahan pengguna.

```sh
git rev-parse HEAD
git apply --check warren-scheduler-from-878bfb3.patch
git apply warren-scheduler-from-878bfb3.patch
npm ci
npm test
npm run test:release
npm run build
python -m unittest discover -s scripts -p test_scheduler_remote.py -v
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

Patch dan ZIP source adalah dua cara alternatif memasang perubahan yang sama;
jangan menerapkan patch lagi pada ZIP source yang sudah diperbarui. Manifest
mencantumkan hash patch, arsip source, dan seluruh source file. Paket tidak
menyertakan dependency, build output, fixture visual, token, Firebase private key,
atau konfigurasi layanan milik pengguna.

## Validasi sebelum rilis

Build frontend dan tes lokal bukan bukti kelulusan installer/APK atau transport
SSH native. Jalankan build Windows/Android dan pemeriksaan startup APK di CI,
lalu uji upgrade dari APK lama pada perangkat sebenarnya dengan package ID dan
sertifikat yang sama. Pertahankan aturan shrinker/Room yang sudah ada karena
WorkManager masih memerlukan kompatibilitas upgrade.

Pada VPS Linux pengujian, gunakan akun/crontab terpisah: buat jadwal aman yang
menulis timestamp, edit, nonaktif/aktifkan, dan hapus. Periksa bahwa komentar,
environment, serta entri lain bertahan; uji konflik edit eksternal dan putus
koneksi saat simpan. Periksa pergantian host agar tidak menulis ke host lain.
Uji Windows host menampilkan pesan unsupported tanpa mutasi.

Pada APK upgrade, pastikan tidak ada Agent/background panel, tidak ada enqueue
ulang setelah unlock/resume, Worker lama berhenti, biometrik dan updater tetap
berfungsi, serta profil SSH dan isi brankas lama tetap utuh. Terminal sentuh,
dropdown, kedua tema, dan lebar ponsel perlu diperiksa di perangkat fisik.

Naikkan seluruh metadata versi mengikuti alur release repo, lalu gunakan tag baru.
Perubahan ini belum dipush, belum diterbitkan, dan tidak berisi installer/APK.
