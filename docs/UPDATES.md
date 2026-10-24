# Pembaruan Warren dari dalam aplikasi

Build rilis Warren memakai repository **HaikalCannavaro/warren**. Overlay `src-tauri/tauri.release.conf.json` dilacak Git dan menyimpan public key produksi, endpoint Windows `latest.json`, serta endpoint Android `android.json`. Private key dan kredensial penandatanganan tidak disimpan dalam source.

Versi source **0.3.0** mempertahankan public key dan endpoint v0.2.3, application ID `dev.harbor.workspace`, identitas vault, serta plugin Android `harbor-android-updater`. versionCode Android naik dari 2003 menjadi 3000. Manifest Android publik v0.2.3 berhasil diverifikasi dengan public key yang dipertahankan ini. Sertifikat APK yang sama tetap wajib digunakan saat build; signature metadata saja tidak menggantikan pemeriksaan sertifikat aplikasi.

## Alur penggunaan

1. Di aplikasi yang sudah terpasang, buka **Settings → App updates → Check for updates**. Pada tampilan lama, panel ini ada di pengaturan workspace. Pada Mission Control v0.3.0, panel tersedia langsung di tab Settings.
2. Baca catatan rilis, lalu pilih **Download update**. Warren mengunduh paket dan memverifikasinya. Tidak perlu mengambil aset dari halaman GitHub. Status unduhan tetap tersedia saat berpindah tab Mission Control.
3. Tutup sesi SSH, hentikan polling GPU, dan tunggu aktivitas Hermes selesai. Pilih **Install update**. Warren menyimpan vault sebelum pemasangan dan menolak pemasangan jika penyimpanan gagal atau pekerjaan masih aktif.
4. Windows menjalankan installer dan dapat menutup aplikasi. Android meminta konfirmasi pemasangan melalui installer sistem. Jika perlu, izinkan pemasangan dari Warren, kembali ke aplikasi, lalu tekan **Install update** lagi tanpa mengunduh ulang.

Aplikasi tetap mengunduh paket lengkap. Ini bukan delta update atau pemasangan diam-diam. Membuka installer Android belum membuktikan pemasangan berhasil; pengguna dapat membatalkan. Versi baru dilaporkan setelah aplikasi baru terpasang dan dibuka. Build lama yang tidak memuat updater atau konfigurasi produksi memerlukan pemasangan awal yang sesuai.

## Identitas dan rahasia rilis yang harus dipertahankan

Gunakan **kunci yang sudah dipakai rilis sebelumnya**. Jangan membuat kunci baru untuk pembaruan reguler.

Repository Actions memerlukan rahasia berikut:

| Secret | Kegunaan |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Kunci updater yang cocok dengan public key dalam overlay |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password kunci updater, jika digunakan |
| `ANDROID_KEYSTORE_BASE64` | Keystore APK produksi yang sama dengan aplikasi terpasang |
| `ANDROID_KEYSTORE_PASSWORD` | Password keystore |
| `ANDROID_KEY_ALIAS` | Alias kunci APK produksi |
| `ANDROID_KEY_PASSWORD` | Password kunci APK |

Workflow memeriksa keberadaan rahasia yang wajib sebelum build. Windows menghasilkan installer NSIS beserta signature updater. Android menghasilkan APK universal, menyelaraskannya dengan zipalign, menandatanganinya dengan keystore asli, lalu memeriksa signature APK. CI memakai `GITHUB_TOKEN` bawaan dengan izin tulis konten hanya pada job publikasi. Jangan menanam token GitHub ke aplikasi.

Kredensial SSH perangkat berbeda dari rahasia rilis. Username, password/private key SSH, dan passphrase diisi melalui form koneksi aplikasi dan disimpan dalam vault native.

## Menyiapkan versi berikutnya

Dari Node.js 24 dan checkout yang bersih:

```bash
node scripts/prepare-release.mjs 0.3.1
npm ci
npm test
npm run test:release
npm run build
```

Perintah `prepare-release` memperbarui keenam file versi/lockfile sekaligus dan mempertahankan repository, public key, serta identitas aplikasi. Versi stabil harus meningkat dan memakai format `MAJOR.MINOR.PATCH`. versionCode dihitung sebagai `major × 1.000.000 + minor × 1.000 + patch`; minor dan patch harus di bawah 1.000.

Perbarui `RELEASE_NOTES.md`, commit source yang sudah diperiksa, lalu buat dan push tag `vVERSI` pada commit itu. Tag harus tepat sama dengan versi source. Jangan memindahkan tag rilis yang sudah dipakai.

## Publikasi otomatis dari tag

Workflow `.github/workflows/release.yml` berjalan ketika tag `v*` didorong, atau melalui workflow dispatch dengan tag yang sudah ada:

1. Memastikan versi konsisten, tag tepat menunjuk checkout, versi lebih baru dari latest, dan nomor tersebut belum dipakai oleh release atau draft.
2. Menjalankan tes frontend, tes alat rilis, dan build frontend; membangun installer Windows dan APK Android dalam job terpisah.
3. Mengemas kedua platform, memverifikasi signature dan metadata, lalu membuat draft dengan aset lengkap. Endpoint pembaruan lama tetap aktif selama tahap ini.
4. Mengunduh kembali seluruh aset draft ke direktori baru, memeriksa kelengkapan, SHA-256 terhadap indeks lokal, serta signature dan versi kedua manifest.
5. Menerbitkan draft sebagai **stable/latest** hanya setelah pemeriksaan aset berhasil. Feed `/releases/latest/download/latest.json` dan `/android.json` kemudian menunjuk versi baru.

Jika suatu pemeriksaan gagal, workflow berhenti; kegagalan verifikasi unggahan meninggalkan draft tanpa mengaktifkan pembaruan baru. Periksa log Actions sebelum memperbaiki dan menjalankan ulang. Job prepare menolak nomor versi yang sudah memiliki draft; draft gagal tidak ditimpa otomatis.

Pengujian pemasangan dan upgrade pada Windows/Android fisik tetap perlu dilakukan. Verifikasi otomatis mencakup paket dan protokol, tetapi tidak menggantikan pengujian installer pada perangkat pengguna.

## Pengemasan manual

Gunakan overlay rilis pada setiap build produksi:

```bash
npm run desktop:release
npm run android:release
npm run release:package -- --repository HaikalCannavaro/warren --windows PATH/Warren-setup.exe --android PATH/Warren-release.apk --notes RELEASE_NOTES.md
npm run release:publish -- --directory release/vVERSI
```

Windows membutuhkan MSVC; Android membutuhkan Java, SDK, NDK, target Rust, dan keystore produksi. Installer harus memiliki signature `.exe.sig` di sampingnya, dan APK harus sudah ditandatangani. `desktop:build`/`android:build` biasa tidak otomatis menyertakan overlay updater.

`release:package` menghasilkan binary bernama tetap, manifest, catatan, dan indeks SHA-256 dalam `release/vVERSI/`; folder lama tidak ditimpa. `release:publish` manual membuat **draft**, bukan stable. Setelah memeriksa paket kedua platform, jalankan:

```bash
node scripts/promote-release.mjs release/vVERSI
```

Perintah promosi mengunduh dan memverifikasi aset draft sebelum publikasi latest. Ia menolak release yang sudah diterbitkan, prerelease, paket satu platform, file hilang/tambahan, perubahan bytes, dan signature tidak valid. Semua perintah GitHub memerlukan autentikasi GitHub CLI dengan izin yang sesuai.

## Pemeriksaan pada perangkat

Windows memakai plugin updater Tauri resmi, endpoint HTTPS, versi yang terikat signature, dan penolakan downgrade. Android memeriksa signature metadata, hash/ukuran APK, package ID, versionName, versionCode yang meningkat, serta sertifikat APK yang cocok dengan aplikasi terpasang sebelum membuka installer. Verifikasi TLS dan signature tetap aktif.

Update mempertahankan lokasi data aplikasi. Tidak ada migrasi vault yang menghapus data dalam v0.3.0. Rotasi kunci dan rollback tidak termasuk alur ini. Koneksi Tailscale dan layanan Hermes dikonfigurasi terpisah di aplikasi; rilis tidak otomatis menghubungkan perangkat.
