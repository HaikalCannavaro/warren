# Bridge pembaruan APK Warren

Plugin internal ini membuka izin dan dialog pemasangan Android. Pemeriksaan rilis, unduhan HTTPS, verifikasi minisign, dan SHA-256 berada di `../src/android_updates.rs`. Tidak ada izin perintah plugin untuk JavaScript; antarmuka aplikasi hanya memakai empat perintah Rust updater.

Konfigurasi yang dibundel:

```json
{
  "plugins": {
    "harbor-android-updater": {
      "endpoint": "https://github.com/OWNER/REPO/releases/latest/download/android.json",
      "pubkey": "PUBLIC_KEY_TAURI_BASE64"
    }
  }
}
```

Endpoint kosong menonaktifkan pembaruan. Kunci kosong dapat memakai `plugins.updater.pubkey`. Jangan memasukkan private key ke aplikasi. Distribusi ini khusus APK pribadi; izin `REQUEST_INSTALL_PACKAGES` bukan jalur pembaruan Google Play.

`android.json` merupakan `{ "payload": "BASE64_BYTES_JSON", "signature": "ISI_FILE_SIG_TAURI" }`. `payload` berisi byte JSON UTF-8 persis yang ditandatangani memakai Tauri signer. Contoh data sebelum encoding:

```json
{
  "schemaVersion": 1,
  "packageName": "dev.harbor.workspace",
  "version": "0.2.1",
  "versionCode": 2001,
  "url": "https://github.com/OWNER/REPO/releases/download/v0.2.1/Warren-universal.apk",
  "sha256": "SHA256_LOWERCASE_64_HEX",
  "size": 12345678,
  "notes": "Catatan rilis",
  "publishedAt": "2026-10-22T00:00:00Z"
}
```

Versi dan versionCode harus lebih tinggi daripada aplikasi terpasang. Keduanya, package name, ukuran, dan hash harus cocok dengan APK. Sertifikat penandatangan APK harus sama persis dengan sertifikat aplikasi terpasang. Simpan keystore Android dan private key updater secara terpisah; keduanya diperlukan untuk merilis pembaruan.

Metadata dibatasi 128 KiB, payload 64 KiB, catatan 16 KiB, dan APK 512 MiB. Koneksi dibatasi 15 detik, pembacaan yang macet 30 detik, pemeriksaan 45 detik, dan unduhan total 10 menit. Maksimal lima pengalihan tetap menggunakan HTTPS. Kanal progress yang gagal menghentikan unduhan lokal; tidak ada unduhan latar belakang/resume otomatis. File parsial dibuang. APK terverifikasi disimpan di cache privat memakai nama hash dan dapat dibersihkan Android. Setelah proses aplikasi mati, pemeriksaan dan unduhan perlu diulang.

Sebelum membuka dialog, worker Android menghitung ulang hash dan memeriksa package/version/sertifikat. FileProvider hanya membagikan direktori cache pembaruan dengan izin baca sementara. Izin sumber tidak dikenal membuka pengaturan; setelah kembali, pengguna harus menekan Pasang lagi. `installerOpened` hanya berarti dialog telah dibuka. Instalasi selalu memerlukan persetujuan Android; pembatalan, kegagalan, atau keberhasilan instalasi tidak dilaporkan sebagai hasil final oleh bridge ini. Rotasi sertifikat dan split APK belum didukung; gunakan APK universal.

## Verifikasi yang masih diperlukan

Tes sumber Rust mencakup URL, batas metadata, versi/package, dan tanda tangan yang diubah. Tes JUnit mencakup identitas APK, downgrade, dan sertifikat. Tes native belum dijalankan di lingkungan pengembangan ini: Android SDK/NDK/Gradle dan linker Windows belum tersedia. File sumber dan konfigurasi bukan bukti bahwa APK sudah berhasil dibangun atau dipasang.

Setelah toolchain tersedia:

1. Bangun APK dasar dan APK versi berikutnya dengan package ID dan keystore yang sama. Jalankan tes Rust pada target/harness yang menyertakan `android_updates` dan tes unit modul Gradle `tauri-plugin-harbor-android-updater`.
2. Pasang APK dasar, isi endpoint/kunci melalui konfigurasi rilis, publikasikan envelope dan APK valid. Cek pembaruan dari aplikasi; pastikan versi, catatan, dan progress sesuai.
3. Putus jaringan dan tutup aplikasi saat unduh. Pastikan tidak ada kandidat parsial yang dapat dipasang. Coba ukuran berlebih, respons lambat, dan redirect HTTP; semuanya harus gagal.
4. Ubah payload, signature, ukuran, hash, package ID, versionCode, versionName, atau keystore APK satu per satu. Pastikan ditolak sebelum dialog pemasangan. Coba versi sama dan lebih lama; jangan tawarkan downgrade.
5. Pada Android 8+, matikan izin instalasi sumber Warren. Tekan Pasang, berikan/tolak izin, lalu kembali. Tidak boleh ada instalasi otomatis; klik berikutnya diperlukan.
6. Batalkan dialog instalasi, lalu ulangi dan setujui. Pastikan pembatalan tidak disebut sukses; setelah pemasangan buka Warren dan periksa versi baru serta data vault. Pastikan pengaman sesi aktif dan penyimpanan vault berjalan sebelum dialog dibuka.
7. Pastikan pemanggilan langsung `plugin:harbor-android-updater|installApk` dari webview ditolak ACL. Periksa merged manifest: provider tidak diekspor, izin hanya URI tertentu, dan tidak ada izin storage luas.

Rujukan: [Tauri mobile plugin](https://v2.tauri.app/develop/plugins/develop-mobile/), [FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider), [PackageManager](https://developer.android.com/reference/android/content/pm/PackageManager), [SigningInfo](https://developer.android.com/reference/android/content/pm/SigningInfo), [aturan identitas pembaruan Android](https://developer.android.com/google/play/app-updates).
