# Warren

Aplikasi personal berbasis **Tauri 2 + React + TypeScript** untuk mengakses VPS melalui SSH dan berbicara dengan Hermes Agent. Terminal dan Hermes berada di bagian terpisah.

**Warren** terinspirasi dari *rabbit warren*: jaringan liang tempat kelinci hidup. Ikonnya menampilkan pintu liang melengkung dengan dua telinga kelinci. Jalur bercabang di dalamnya melambangkan koneksi server dan agen, dalam warna mint di atas latar gelap. Warren menjadi ruang kerja untuk server dan **Leveret**, nama profil agen Hermes milik pengguna. Hermes tetap nama layanan yang dihubungkan; profil dan endpoint dikonfigurasi oleh pengguna.

Sumber ikon vektor berada di `public/brand/`. Jalankan `npm run icons:generate` untuk menghasilkan ulang ikon Windows dan launcher Android, termasuk adaptive icon dan versi monokrom. `npm run android:init` menjalankan langkah ini otomatis setelah proyek Android dibuat; jika menjalankan inisialisasi langsung lewat Tauri, jalankan generator ikon sesudahnya. Nama proses build desktop adalah `warren.exe`.

Source versi 0.2.0 ini memuat UI dan transport native, dengan target Windows dan Android. **Build frontend dan 62 tes frontend sudah lolos. Build Rust, installer Windows, APK, serta koneksi ke server nyata belum terverifikasi.** Pemeriksaan native di lingkungan pengerjaan terhenti karena Microsoft C++ linker (`link.exe`) belum tersedia. Lihat [catatan pengujian](docs/TESTING.md).

## Fitur dalam source

- Terminal interaktif xterm.js, beberapa sesi, resize, tombol bantu terminal, dan konfirmasi sebelum paste.
- Profil VPS dengan password atau private key; fingerprint host harus dikonfirmasi sebelum autentikasi. Perubahan host key ditolak.
- Profil Hermes dengan URL dan API token, tes endpoint, percakapan terpisah, jawaban streaming dan Markdown.
- Brankas lokal Stronghold untuk profil, kredensial, pengaturan, draft, dan riwayat chat. Password utama minimal 12 karakter; tidak ada pemulihan password.
- Pemisahan sesi SSH dari percakapan Hermes. Output terminal tidak otomatis dimasukkan ke chat. Aplikasi tidak otomatis menjalankan saran perintah dari chat.
- Status chat yang terputus ditandai belum diketahui; aplikasi tidak mengirim ulang permintaan otomatis.
- UI responsif, navigasi mobile, dan pengaturan ukuran teks terminal.
- Cek pembaruan, catatan rilis, unduhan terverifikasi, serta pemasangan melalui updater Windows atau installer APK Android.

## Pembaruan aplikasi

Versi 0.2.0 menambahkan **Pengaturan → Pembaruan aplikasi**. Setelah build awal dengan sumber rilis dan public key milik Anda, pengguna bisa mengunduh pembaruan dari dalam Warren. Android tetap meminta konfirmasi pemasangan sistem. Instalasi ditahan selama sesi SSH atau permintaan Hermes aktif dan jika brankas gagal disimpan.

Repository dan kunci produksi belum diisi. Build biasa menampilkan sumber pembaruan belum dikonfigurasi; gunakan [panduan setup dan rilis update](docs/UPDATES.md) untuk menyiapkan keduanya. Source menyertakan alat konfigurasi, pengemasan manifest, dan pembuatan draft rilis. Belum ada rilis nyata yang diterbitkan atau dipasang melalui updater.

## Jalankan tampilan terlebih dahulu

Gunakan Node.js 24 dan npm. Dari folder source yang berisi `package.json`:

```powershell
npm ci
npm test
npm run build
npm run preview -- --port 1420
```

Buka `http://127.0.0.1:1420`. Browser hanya menampilkan pratinjau UI: formulir bisa dijelajahi, data hanya berada di memori dan hilang saat reload. SSH, chat nyata, dan penyimpanan terenkripsi berjalan di aplikasi Tauri.

Untuk mengembangkan UI dengan perubahan langsung, gunakan `npm run dev`. Jika PowerShell memblokir `npm.ps1`, gunakan `npm.cmd` pada perintah yang sama. Jangan mematikan kebijakan keamanan sistem hanya untuk menjalankannya.

## Windows desktop

Siapkan Rust stable dengan target MSVC, Microsoft C++ Build Tools dengan komponen **Desktop development with C++** dan Windows SDK, serta WebView2. Panduan instalasinya tersedia di [prasyarat resmi Tauri](https://v2.tauri.app/start/prerequisites/#windows).

```powershell
npm ci
npm run desktop:dev
```

Untuk build rilis:

```powershell
npm run desktop:build
```

Konfigurasi menghasilkan installer NSIS di `src-tauri/target/release/bundle/nsis/` setelah build berhasil. Sertifikat penandatanganan aplikasi belum dikonfigurasi. Source ini tidak menyertakan installer hasil build.

## Android

Pasang Android Studio, SDK Platform, Build Tools, Platform Tools, Command-line Tools, serta NDK. Atur `JAVA_HOME` ke Java bawaan Android Studio, `ANDROID_HOME` ke folder SDK, dan `NDK_HOME` ke versi NDK yang dipilih. Ikuti [prasyarat Android Tauri](https://v2.tauri.app/start/prerequisites/#android) sesuai lokasi instalasi Anda.

```powershell
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
npm ci
npm run android:init
npm run android:dev
```

Folder proyek Android dibuat oleh `android:init`. Jalankan dengan emulator atau perangkat yang tersambung. Untuk build:

```powershell
npm run android:build
```

Build Android dan perilaku keyboard, clipboard, brankas, serta suspend/resume pada perangkat fisik masih perlu diuji. Signing rilis dan publikasi Play Store belum disiapkan. Source ini tidak menjanjikan sesi SSH tetap aktif ketika Android menghentikan aplikasi.

## Hubungkan VPS

1. Buka aplikasi native, lalu buat/buka brankas menggunakan password utama.
2. Pada **Koneksi**, tambahkan host/IP, port, username dan metode autentikasi. Private key dapat ditempel atau diimpor.
3. Pilih sambungkan. Cocokkan fingerprint dengan sumber tepercaya dari server sebelum menerima host baru.
4. Gunakan halaman **Terminal**. Beralih ke Hermes tidak otomatis menutup sesi terminal.

Host key yang berubah memerlukan pemeriksaan server; tidak ada tombol menerima perubahan secara otomatis. Source belum memuat pengelolaan `known_hosts` lanjutan, jump host, port forwarding atau SFTP. Jangan menyimpan salinan private key dalam folder source.

## Hubungkan Hermes

Integrasi menargetkan **Hermes Agent dari Nous Research** dengan API Server yang kompatibel dengan Chat Completions. Aktifkan `API_SERVER_ENABLED=true`, tetapkan `API_SERVER_KEY` dengan nilai rahasia sendiri, lalu jalankan gateway sesuai [panduan Hermes API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server).

Pada **Koneksi → Hermes**, masukkan:

| Isian | Contoh |
| --- | --- |
| URL dasar | `https://hermes.example.com/v1` |
| Token | Nilai `API_SERVER_KEY` milik Anda |
| Model | `hermes-agent` |

Alamat remote harus HTTPS. Pengembangan di mesin yang sama dapat memakai `http://127.0.0.1:8642/v1`; alamat tersebut pada Android merujuk ke perangkat Android sendiri. Untuk VPS, siapkan akses HTTPS yang terautentikasi ke API Anda. Warren tidak memasang atau mengubah layanan VPS.

Tombol **Tes endpoint** memeriksa `/models`; keberhasilannya belum membuktikan streaming berhasil. Jawaban memakai `/chat/completions` dengan streaming. Header identitas percakapan dan permintaan disertakan, tetapi aplikasi tidak mengasumsikan semua versi Hermes menjamin deduplikasi.

Mengubah URL profil Hermes membuat profil baru agar percakapan lama tetap terikat ke endpoint semula. Jika hasil chat berstatus belum diketahui, periksa pekerjaan di Hermes terlebih dahulu. Menutup aplikasi atau kehilangan jaringan tidak membuktikan pekerjaan agen di server berhenti.

## Penyimpanan dan batas versi awal

Brankas `harbor.hold` dan salt `vault-salt.bin` berada di direktori data lokal aplikasi dengan identifier `dev.harbor.workspace`. Simpan backup keduanya secara aman ketika aplikasi ditutup. Password utama tidak disimpan; kehilangan password berarti data tidak bisa dibuka.

Nama tampilan dan ikon kini Warren. Identifier `dev.harbor.workspace`, nama brankas `harbor.hold`, client Stronghold `harbor-workspace-v1`, serta namespace plugin internal tetap sama untuk mempertahankan lokasi data dan kontrak native. Kata `harbor` pada identifier teknis tersebut bukan nama tampilan aplikasi. Warren ditujukan menjadi installer pertama yang dirilis; bila sudah memasang build Windows bernama Harbor, transisi installer perlu rencana migrasi atau pemasangan ulang tersendiri karena nama produk NSIS ikut menentukan identitas instalasinya. Upgrade Android tetap memerlukan package ID dan sertifikat yang sama serta versi lebih tinggi.

Implementasi memakai password Stronghold, belum unlock otomatis melalui Windows Credential Manager/Android Keystore atau biometrik. Data yang diperlukan UI tersedia dalam memori saat brankas terbuka. Tidak ada sinkronisasi perangkat, pemulihan run Hermes, pembatalan pekerjaan remote, attachment, atau persetujuan tool Hermes dalam UI ini. Riwayat teks chat disimpan; scrollback terminal tidak disimpan.

Warren memisahkan panel terminal dari chat, tetapi Hermes di server tetap dapat menjalankan tool yang Anda aktifkan di sana. Atur izin agen di sisi Hermes sesuai kebutuhan.

## Struktur source

```text
src/components/          Tampilan, terminal, chat, dan dialog
src/hooks/useWorkspace.ts  State sesi, penyimpanan dan alur aplikasi
src/lib/native.ts        Batas komunikasi React ke Rust
src/lib/vault.ts         Brankas Stronghold
src/lib/domain.ts        Validasi dan pemulihan state
src-tauri/src/ssh.rs     Transport SSH dan pemeriksaan host key
src-tauri/src/hermes.rs  HTTP dan parser streaming Hermes
src-tauri/src/lib.rs     Pendaftaran command dan lifecycle native
docs/                   Arsitektur dan pengujian
```

`package-lock.json` dan `src-tauri/Cargo.lock` disertakan. Dependency, cache, hasil build dan kredensial tidak termasuk dalam ZIP. Untuk pemeriksaan native setelah toolchain tersedia:

```powershell
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

Lanjutkan dengan langkah manual di [TESTING.md](docs/TESTING.md) sebelum mengandalkan aplikasi untuk mengelola server.
