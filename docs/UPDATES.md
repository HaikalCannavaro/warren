# Pembaruan Warren dari dalam aplikasi

Warren 0.2.0 menambahkan **Pengaturan → Pembaruan aplikasi** dengan pemeriksaan versi, catatan rilis, unduhan, dan pemasangan. Windows memakai updater Tauri. Android memakai APK pribadi dan konfirmasi installer sistem. Paket tetap diunduh, tetapi pengguna tidak perlu membuka halaman aset GitHub untuk mengambilnya secara manual.

Source belum memiliki repository rilis atau kunci milik Anda. Build biasa menampilkan bahwa sumber pembaruan belum dikonfigurasi. Tombol tidak mengklaim versi terbaru ketika konfigurasi kosong, jaringan gagal, atau pemeriksaan belum dilakukan. Fitur ini memerlukan build awal dengan konfigurasi rilis di bawah; aplikasi lama yang belum memuat updater tetap memerlukan pemasangan awal.

Nama aplikasi dan aset rilis kini Warren. Identifier aplikasi `dev.harbor.workspace`, lokasi brankas, dan konfigurasi plugin `harbor-android-updater` tetap sama. Warren ditujukan menjadi installer pertama yang dirilis. Bila sudah memasang installer Windows bernama Harbor, pergantian nama produk NSIS perlu rencana migrasi atau pemasangan ulang tersendiri; identifier yang sama belum menjamin installer menimpa pemasangan lama. Pada Android, upgrade memerlukan package ID dan keystore yang sama serta versi lebih tinggi. Pertahankan endpoint dan kunci updater yang sudah digunakan; pergantian nama tidak memerlukan kunci baru. Versi source ini tetap 0.2.0 sebelum rilis; untuk memperbarui pemasangan 0.2.0, naikkan versi mengikuti panduan di bawah.

## Alur penggunaan

1. Buka **Pengaturan**, lalu **Cek pembaruan**.
2. Jika tersedia, baca catatan rilis dan pilih **Unduh update**. Paket diperiksa sebelum tombol pemasangan tersedia.
3. Tutup sesi SSH dan tunggu permintaan Hermes yang sedang aktif selesai. Pilih **Pasang update**. Warren menyimpan brankas terlebih dahulu dan menolak pekerjaan baru selama persiapan pemasangan.
4. Windows menjalankan installer pembaruan dan dapat menutup aplikasi. Android membuka installer sistem. Jika izin pemasangan dari Warren belum aktif, Android membuka halaman izin; setelah kembali, tekan **Pasang update** lagi.

Membuka installer Android belum berarti pembaruan berhasil. Pengguna boleh membatalkan konfirmasi. Versi baru dilaporkan setelah aplikasi baru terpasang dan dibuka. Tidak ada instalasi diam-diam, pemeriksaan berkala di background, sinkronisasi data antardevais, atau pembatalan tugas Hermes di server.

## Siapkan identitas rilis sekali

Gunakan repository GitHub **publik** untuk aset rilis, atau sediakan layanan HTTPS publik sendiri dengan penyesuaian konfigurasi. Jangan menanam token GitHub privat di aplikasi. Script yang disediakan menargetkan GitHub publik dengan nama `OWNER/REPO`; repository belum dibuat oleh source ini.

Buat kunci penandatanganan updater Tauri di lokasi privat di luar source. Kunci publik boleh dibagikan; private key dan password harus disimpan terpisah. Gunakan pasangan kunci yang sama untuk semua rilis berikutnya. Mekanisme dan signature updater dijelaskan dalam [dokumentasi Tauri Updater](https://v2.tauri.app/plugin/updater/).

```powershell
$keyDir = Join-Path $env:LOCALAPPDATA 'WarrenReleaseKeys'
New-Item -ItemType Directory -Force -Path $keyDir
npm run tauri -- signer generate --write-keys "$keyDir/warren.key"
npm run release:configure -- --repository OWNER/REPO --public-key "$keyDir/warren.key.pub"
```

Perintah konfigurasi membuat `src-tauri/tauri.release.conf.json` berisi public key, endpoint Windows `latest.json`, endpoint Android `android.json`, dan versionCode Android. File ini diabaikan Git agar konfigurasi contoh tidak menggantikan sumber rilis Anda. Tidak ada private key yang disalin ke aplikasi.

Untuk Android, buat dan simpan juga **keystore penandatanganan APK**. Ini kunci berbeda dari kunci updater. Konfigurasikan Gradle setelah `npm run android:init` mengikuti [panduan penandatanganan Android Tauri](https://v2.tauri.app/distribute/sign/android/). Semua APK pembaruan harus memakai application ID `dev.harbor.workspace` dan sertifikat APK yang sama dengan pemasangan awal. Source ini tidak menyediakan pemulihan atau pergantian kunci.

Jalur APK pribadi ini menggunakan izin Android `REQUEST_INSTALL_PACKAGES`; distribusi Google Play perlu alur berbeda. Tidak ada konfigurasi Play Store dalam versi ini.

## Build rilis

Naikkan versi stabil `MAJOR.MINOR.PATCH` di `package.json`, `src-tauri/tauri.conf.json`, dan `src-tauri/Cargo.toml`, lalu perbarui lockfile. Hindari merilis ulang nomor versi yang sama. Script menolak prerelease dan memetakan versi ke `major × 1.000.000 + minor × 1.000 + patch` untuk Android; minor dan patch harus di bawah 1.000.

Jalankan kembali `release:configure` setelah mengganti versi. Siapkan variabel penandatanganan pada terminal build, menggunakan private key milik Anda. Password dapat dimasukkan melalui mekanisme rahasia CI atau sesi terminal privat; jangan menuliskannya dalam source.

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$keyDir/warren.key"
# Jika key dilindungi password, set TAURI_SIGNING_PRIVATE_KEY_PASSWORD secara privat.
npm ci
npm test
npm run test:release
npm run desktop:release
npm run android:release
```

Windows memerlukan toolchain C++/MSVC. Android memerlukan SDK, NDK, Java, target Rust, dan konfigurasi signing Gradle. Build APK universal sesuai target perangkat; source paket awal tidak memuat binary hasil build. Gunakan perintah `desktop:release` dan `android:release` agar overlay updater ikut tertanam. `desktop:build`/`android:build` biasa tidak otomatis membaca overlay itu.

## Siapkan dan terbitkan versi berikutnya

Setelah build, pastikan installer Windows dan APK benar-benar membawa versi yang dimaksud. Uji pemasangan bersih serta pembaruan dari versi sebelumnya pada perangkat uji. Simpan catatan perubahan dalam file teks atau Markdown.

```powershell
npm run release:package -- --repository OWNER/REPO --windows "PATH/Warren-setup.exe" --android "PATH/Warren-release.apk" --notes "CHANGELOG.md"
```

Installer Windows harus NSIS x64 dengan file `.exe.sig` di sampingnya. APK harus sudah ditandatangani keystore rilis. Parameter `--windows` atau `--android` boleh dihilangkan untuk paket satu platform, tetapi pastikan endpoint platform lainnya masih disediakan pada rilis terbaru jika penggunanya perlu tetap bisa memeriksa update.

Script menghasilkan folder `release/vVERSI/`: binary dengan nama tetap, manifest Windows, envelope Android bertanda tangan, catatan, dan indeks file. Metadata Android mengikat package name, versi, versionCode, URL, ukuran, serta SHA-256 APK. Jangan mengedit manifest setelah penandatanganan. Folder rilis yang sudah ada tidak ditimpa otomatis.

Buat dan push tag Git `vVERSI` untuk commit source yang dibuild. Setelah login GitHub CLI, jalankan:

```powershell
npm run release:publish -- --directory "release/vVERSI"
```

Perintah ini membuat **draft GitHub Release** pada repository dalam indeks, bukan langsung mengaktifkan pembaruan. Periksa seluruh aset dan hasil uji, kemudian publish sebagai rilis stabil/latest. Endpoint `/releases/latest/download/` akan menunjuk rilis itu. Draft dan prerelease tidak menjadi pembaruan stabil melalui alur ini. Script publikasi tidak dijalankan selama pengerjaan source.

## Pemeriksaan yang dilakukan aplikasi

Windows hanya mengaktifkan updater jika endpoint HTTPS dan public key valid tersedia, meminta versi yang terikat signature, menolak downgrade, dan memverifikasi paket melalui plugin resmi. Android memverifikasi signature payload metadata, hash/ukuran APK, package ID, versionName, versionCode yang meningkat, serta kecocokan sertifikat APK dengan aplikasi terpasang sebelum menyerahkannya ke installer. HTTPS dan verifikasi signature tetap aktif.

Update tidak menghapus direktori data aplikasi secara sengaja. Perubahan schema brankas pada fitur mendatang tetap memerlukan migrasi dan pengujian upgrade; updater bukan jaminan kompatibilitas data. Backup brankas sebelum uji migrasi. Rotasi kunci dan rollback belum diimplementasikan.

## Status verifikasi

Tes frontend memakai mock IPC untuk memeriksa status, progress, urutan penyimpanan, duplikasi klik, dan penolakan pemasangan saat ada pekerjaan. Alat rilis memiliki tes terpisah untuk konfigurasi dan metadata. Build native, penandatanganan binary rilis nyata, instalasi Windows, serta dialog/upgrade Android belum diuji pada perangkat. Repository, kunci produksi dan rilis nyata belum dibuat.
