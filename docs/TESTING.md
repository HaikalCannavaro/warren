# Pengujian Warren

Status berikut adalah hasil validasi pada 22 Oktober 2026. Kelulusan frontend tidak membuktikan koneksi atau penyimpanan native berfungsi pada Windows maupun Android.

## Hasil yang sudah tersedia

| Pemeriksaan | Hasil |
| --- | --- |
| Suite frontend | 62 tes dalam 10 berkas lulus. |
| Alat rilis | 25 tes Node lulus: konfigurasi, manifest, signature termasuk fixture resmi Tauri, byte yang berubah, serta paket platform yang tidak lengkap. |
| TypeScript | Pemeriksaan tipe lulus. |
| Pratinjau browser | Panel Terminal, panel Hermes, formulir VPS, serta panel Pembaruan versi 0.2.0 diperiksa secara visual. Tidak ada error atau warning pada log browser yang diamati. |
| `npm run build` | Lulus; JavaScript sekitar 817 KB, gzip sekitar 232 KB. Vite memberi peringatan chunk di atas 500 KB. |
| Dependensi Rust | Versi dikunci di `Cargo.lock` dan dependensi sudah diambil. |
| Kompilasi native | Terhenti karena `link.exe` tidak tersedia, sebelum aplikasi selesai dikompilasi. |
| Tes Rust | Sudah ditulis, belum dijalankan sebagai executable. |
| VPS dan Hermes nyata | Belum diuji. |
| Windows, Android, dan penyimpanan native | Build, peluncuran, Stronghold pada perangkat, dan pemeriksaan keamanan perangkat/keystore belum tervalidasi. Tidak ada integrasi OS keychain/keystore yang diklaim. |

Tes frontend mencakup domain dan validasi, pemisahan sesi, kepercayaan host, penyimpanan identitas sebelum pengiriman chat, status hasil tidak diketahui, perubahan endpoint, penolakan operasi saat mengunci, penutupan desktop, serta perilaku antarmuka terminal dan chat. Mock IPC dan brankas tidak menguji transport atau enkripsi native.

Tes Rust yang tersedia mencakup fingerprint, batas input dan antrean SSH, penutupan socket, validasi URL, framing SSE, status terminal, serta server HTTP loopback untuk header, autentikasi, dan penolakan redirect. Keberadaan tes bukan bukti bahwa tes tersebut lulus.

## Menjalankan pemeriksaan

Jalankan dari akar proyek setelah menyiapkan dependensi dan toolchain yang sesuai:

```sh
npm ci
npm test
npm run test:release
npm run build
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Windows memerlukan Rust target MSVC, Microsoft C++ Build Tools beserta Windows SDK dan `link.exe`, serta WebView2. Instalasi Rust saja belum cukup. Android memerlukan JDK, Android SDK/NDK, target Rust Android, dan proyek Android yang diinisialisasi. Ikuti prasyarat platform pada README sebelum menjalankan:

```sh
npm run desktop:dev
npm run android:init
npm run android:dev
```

## Penerimaan manual setelah toolchain siap

Gunakan server dan data uji yang boleh dioperasikan. Catat versi OS, perangkat, server, hasil aktual, dan log yang telah disamarkan untuk setiap langkah.

1. **Brankas:** buat master password, simpan profil, draft, dan chat, lalu tutup dan buka aplikasi. Periksa persistensi, penolakan password salah, dan kebutuhan password setelah penguncian. Pastikan token/password tidak muncul di log atau penyimpanan browser.
2. **Kepercayaan SSH:** gunakan host baru dan cocokkan fingerprint dari konsol server. Tolak kepercayaan dan periksa bahwa autentikasi tidak terjadi. Terima fingerprint yang benar; kemudian ubah host key pada server uji dan pastikan koneksi ditolak sebelum kredensial dikirim.
3. **Autentikasi dan isolasi:** uji password serta private key terenkripsi. Buka dua sesi, jalankan `pwd` atau `whoami`, ubah ukuran terminal, pindah ke chat, dan kembali. Tutup satu sesi; sesi lainnya harus tetap bekerja.
4. **Input terminal:** uji tombol Ctrl+C, paste yang ditinjau, dan penolakan input di atas 64 KiB. Setelah penolakan, terminal harus tetap dapat menerima input kecil selama koneksi masih hidup. Periksa bahwa input tidak dikirim ulang otomatis.
5. **Hermes:** uji probe dengan token benar dan salah, lalu dua percakapan terpisah. Periksa teks Unicode, urutan delta, indikator alat, dan pemetaan respons ke percakapan asal. Ubah URL profil dan pastikan riwayat tetap terkait profil lama.
6. **Kegagalan stream:** pada fixture terkendali, uji 401, 500, redirect, `finish_reason: error`, `cancelled`, dan putus stream sebelum selesai. Pastikan tidak ada sukses semu atau retry otomatis; hasil transport yang tidak pasti harus menjadi `unknown`.
7. **Penutupan desktop:** edit draft lalu segera tutup. Buka kembali dan periksa hasil tersimpan. Tutup saat Hermes berjalan: snapshot harus memuat `unknown`; periksa server secara terpisah karena tugas mungkin berlanjut. Selama proses tutup/kunci, pekerjaan dan perubahan baru harus ditolak.
8. **Gagal menyimpan:** pada lingkungan uji yang dapat dipulihkan, buat penulisan brankas gagal lalu minta tutup/kunci. Jendela harus tetap terbuka dengan pesan kesalahan dan dapat digunakan setelah kegagalan ditangani.
9. **Android:** uji keyboard, rotasi, ukuran PTY, pergantian aplikasi, jaringan terputus, dan force-stop saat chat berjalan. Periksa snapshot terakhir dan pemulihan `streaming` menjadi `unknown`. Jangan mengharapkan pemulihan sesi SSH atau jaminan simpan saat OS membunuh proses.

Jangan menandai rilis native siap sebelum kompilasi, tes Rust, peluncuran perangkat, dan langkah penerimaan yang relevan selesai dengan bukti hasilnya.

## Penerimaan updater pada perangkat

Tes frontend menggunakan mock IPC. Tes rilis memverifikasi signature fixture dan metadata; keduanya tidak menjalankan installer OS. Lima tes native Windows, lima tes native Android, serta dua tes Kotlin yang ditambahkan untuk updater belum dijalankan sebagai executable. Lakukan uji upgrade dari satu build bertanda tangan ke versi berikutnya sebelum menerbitkan rilis nyata:

1. Build tanpa endpoint/key harus menampilkan pembaruan belum dikonfigurasi, bukan sudah terbaru. Uji juga 404, timeout, dan metadata rusak.
2. Build rilis awal harus menemukan versi yang lebih baru pada endpoint uji. Ubah satu byte binary, signature, atau versi yang ditandatangani; pemasangan harus ditolak.
3. Jalankan sesi SSH atau permintaan Hermes, lalu coba pasang; pemasangan harus ditahan. Simulasikan gagal menyimpan brankas dan pastikan installer belum dibuka.
4. Windows: verifikasi proses installer, pembukaan versi baru, serta brankas/profil/riwayat tetap bisa dibuka.
5. Android: tolak izin pemasangan, kembali, izinkan dan coba lagi. Batalkan installer lalu ulangi. Tidak boleh ada instalasi otomatis atau pesan sukses sebelum benar-benar terpasang.
6. Android: APK dengan package ID, versionName, versionCode atau sertifikat berbeda harus ditolak; APK versi lebih lama juga ditolak. Verifikasi kasus aplikasi dihentikan Android selama unduhan.

Panduan rilis ada di [UPDATES.md](UPDATES.md); detail bridge dan pemeriksaan perangkat ada di [README plugin Android](../src-tauri/android-updater/README.md).
