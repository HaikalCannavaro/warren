# Warren: hotfix startup Android dan close ke tray

Baseline wajib: `a4fe7f8d5f8719802b12f999b6a122833b55a695` (v0.6.0).
Patch mempertahankan application ID `dev.harbor.workspace` dan versi source 0.6.0.
Bot rilis harus memilih versi baru sebelum membuat tag; jangan memakai ulang tag v0.6.0.

## Diagnosis yang sudah dibuktikan

Bugreport Galaxy A73 menunjukkan crash sebelum Activity/UI dibuat:

```text
FATAL EXCEPTION: main
Process: dev.harbor.workspace
Unable to get provider androidx.startup.InitializationProvider
Caused by: java.lang.NoSuchMethodException: androidx.work.impl.WorkDatabase_Impl.<init> []
at androidx.work.WorkManagerInitializer
```

Inspeksi statis APK publik Warren v0.6.0 mengonfirmasi bahwa class
`androidx.work.impl.WorkDatabase_Impl` ada, tetapi tidak memiliki definisi constructor
`<init>`. Room membuat database WorkManager lewat refleksi. Optimasi R8 menghapus
constructor yang dibutuhkan tersebut sehingga startup provider gagal.

Perbaikan menambahkan aturan consumer ProGuard khusus `WorkDatabase_Impl` dan menjaga
constructor database Room. Optimasi release tetap aktif. Firebase configuration
ada pada APK yang diperiksa; bukti crash ini menunjuk pada constructor Room.

`scripts/verify-android-startup.py` membaca seluruh DEX dalam APK hasil build dan
memastikan constructor public tanpa argumen benar-benar didefinisikan. Pemeriksa
ini sudah dicoba pada APK lama dan menolaknya sesuai error di bugreport. Workflow
rilis menjalankannya setelah signing, sebelum upload dan pembuatan draft release.
Pemeriksaan ini mencakup kegagalan startup tersebut; tetap lakukan launch smoke test.

## Perilaku desktop

- Tombol **X / Alt+F4** menyimpan state lalu menyembunyikan jendela ke system tray.
  Workspace React, koneksi Gateway, aliran respons HTTP, dan SSH tetap hidup.
- Klik kiri ikon tray atau pilih **Open Warren** untuk membuka jendela yang sama.
  Balasan yang masuk selama tersembunyi tetap masuk ke chat dan tersimpan di vault.
- **Quit Warren** pada menu tray benar-benar keluar setelah menyimpan state.
  Jika pekerjaan desktop belum selesai saat Quit, hasil lokal tetap ditandai
  `unknown`; pekerjaan server tidak dibatalkan atau dikirim ulang.
- Bila tray tidak tersedia atau penyimpanan gagal, jendela tetap terbuka dan
  menampilkan error. Tombol close juga dicegah mengakhiri proses sebelum listener
  frontend selesai dimuat. Jalur restart/exit installer tetap dapat berjalan.
- Pesan yang sudah berstatus `unknown` dari versi lama tidak diubah menjadi selesai
  tanpa konfirmasi server. Verifikasi hasilnya di Hermes; patch mencegah tombol X
  menghasilkan status itu pada pengiriman berikutnya. Membuka lewat tray menjaga
  sesi yang sama; hotfix ini belum menambahkan single-instance untuk peluncuran EXE kedua.

Desktop tetap membutuhkan komputer menyala dan jaringan tersedia. Quit, Task
Manager, atau restart OS mengakhiri proses lokal. Android memakai jalur relay/
WorkManager yang sudah ada; konfigurasi background delivery tetap diperlukan.

## Instruksi untuk bot rilis

Gunakan checkout bersih baseline di atas. Terapkan patch sebelum mengubah versi:

```sh
git switch --detach a4fe7f8d5f8719802b12f999b6a122833b55a695
git switch -c fix/startup-and-tray
git apply --check warren-hotfix-from-a4fe7f8.patch
git apply warren-hotfix-from-a4fe7f8.patch
npm ci
npm test
npm run test:release
python -m unittest discover -s scripts -p test_android_startup.py -v
npm run build
```

Jika baseline sudah memiliki perubahan lain, tinjau dan gabungkan perubahan di
branch terpisah; jangan memaksa patch dengan mengabaikan hunk yang gagal.

Build native melalui workflow repo. Untuk build Android manual, jalankan pemeriksa
pada APK **release yang sudah diminifikasi**, lalu pada artefak yang akan dibagikan:

```sh
python scripts/verify-android-startup.py artifacts/android/Warren-android.apk
```

Tetap gunakan signing key, application ID, dan private Firebase configuration
yang sama dengan rilis terpasang. Sesudah memilih versi baru lewat prosedur
`release:configure` repo, buat commit/tag baru. Workflow membangun kedua platform
dan menyiapkan draft release; lakukan verifikasi perangkat sebelum publish.

## Hasil validasi patch

- 336 tes frontend, 68 tes script rilis, 4 tes relay, dan 10 tes pemeriksa APK lulus.
- TypeScript dan build frontend production lulus.
- Pemeriksa menolak APK v0.6.0 yang crash karena constructor tidak ada.
- Patch diuji `git apply --check` dan hasil penerapannya dicocokkan dengan source.

Build Rust/installer Windows dan APK baru belum dijalankan di workspace penyusun
patch karena toolchain native tidak tersedia. Menjalankan APK baru pada A73 dan
tray Windows perlu diverifikasi setelah build; hasil tes frontend tidak menggantikan
verifikasi native tersebut.

## Verifikasi sebelum publish

1. **Android:** upgrade dari APK lama dengan signing key yang sama, buka Warren
   beberapa kali, unlock vault, lalu pastikan tidak ada fatal error baru di logcat.
2. **Android background:** kirim satu chat, tutup UI, tunggu hasil di server,
   periksa notifikasi, buka kembali dan periksa hanya satu pengiriman/satu hasil.
3. **Windows:** kirim chat yang lama, tekan X saat writing, pastikan proses dan
   ikon tray tetap ada. Buka melalui tray; hasil harus lengkap. Kirim follow-up di
   percakapan yang sama. Periksa juga terminal SSH yang sedang aktif.
4. **Windows:** pilih Quit untuk mengakhiri proses; uji X dari layar unlock dan
   uji instalasi update. Kegagalan penyimpanan harus menahan penutupan.

Paket hotfix tidak menyertakan bugreport mentah, token Gateway, Google services
configuration, service account, maupun signing key.
