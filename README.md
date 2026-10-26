# Warren

Ruang kerja personal berbasis **Tauri 2 + React + TypeScript** untuk terminal SSH, pemantauan fleet Hermes, komunikasi A2A, dan jadwal server.

**Warren** terinspirasi dari *rabbit warren*: jaringan liang tempat kelinci hidup. Observer menjadi halaman awal. Navigasi utama berisi Observer, Terminal, Scheduler, Burrow, dan Connections. Settings terpisah dengan ikon gear di bawah sidebar desktop atau pada header mobile.

## Fitur

- **Observer**: telemetry Linux/NVIDIA, roster 11 agen (1 orchestrator + 10 spesialis), task ledger Hermes, pemilih host hardware dan orkestrator terpisah, serta auto-poll 10 detik. [Panduan Observer](docs/OBSERVER.md).
- **Terminal**: xterm.js interaktif, beberapa sesi SSH, resize, tombol bantu, konfirmasi paste, dan scroll sentuh mobile.
- **Scheduler**: daftar cron pengguna SSH, tambah/edit jadwal, aktif/nonaktif, hapus dengan konfirmasi, pemilih VPS, dan penanda zona waktu server. Jadwal dijalankan cron di VPS, sehingga tetap berjalan saat Warren ditutup. [Panduan Scheduler](docs/SCHEDULER.md).
- **Burrow**: stream log A2A melalui SSH, pemilih sumber VPS, filter spesialis, dan drawer transkrip berdasarkan task ID. [Panduan Burrow](docs/BURROW.md).
- **Connections**: profil VPS dengan password atau private key. Fingerprint host harus dikonfirmasi sebelum autentikasi; perubahan host key ditolak.
- **Settings**: tema Warren Dark / Terracotta, English / Bahasa Indonesia, ukuran teks terminal, biometrik pada perangkat yang mendukung, dan pembaruan aplikasi.
- Brankas lokal Stronghold menyimpan profil, kredensial, dan data aplikasi. Password utama minimal 12 karakter; tidak ada pemulihan password.

Menu Agent Chat, pengelolaan koneksi Agent, dan pengaturan Background delivery telah dihapus. Sinkronisasi otomatis serta worker pengiriman Android dihentikan. Data chat dan profil lama tetap disimpan di brankas untuk kompatibilitas upgrade; penghapusan fitur tidak menghapus riwayat, membatalkan task Hermes, atau menghentikan layanan relay VPS. Modul transport lama masih ada sebagai kode kompatibilitas, tetapi tidak tersedia dari navigasi aplikasi. [Catatan perubahan](docs/SCHEDULER-AND-WORKSPACE-UPDATE.md).

Fleet Roster Observer kini memiliki **habitat kelinci pixel art beranimasi**: Leveret di tengah atas, sepuluh spesialis termasuk Nexus di bawahnya, lima status kerja, dan detail tugas lewat ketukan. [Panduan Pixel Fleet](docs/PIXEL-FLEET.md). Runbooks belum diimplementasikan.

## Tampilan dan bahasa

Antarmuka menggunakan English secara default. Ganti melalui **Settings → Language → English / Bahasa Indonesia**. Bahasa tidak menerjemahkan output terminal atau log server. Tema dan bahasa disimpan pada perangkat. Subteks telah diperbesar, dropdown mengikuti tema, dan navigasi mobile dapat digulir.

Sumber ikon vektor berada di `public/brand/`. Jalankan `npm run icons:generate` untuk menghasilkan ikon Windows dan launcher Android. `npm run android:init` juga menjalankan generator ikon. Nama proses desktop adalah `warren.exe`.

## Jalankan antarmuka

Gunakan Node.js dan npm sesuai pipeline proyek. Dari root source:

```sh
npm ci
npm test
npm run build
npm run preview -- --port 1420
```

Buka `http://127.0.0.1:1420`. Browser menampilkan antarmuka tanpa transport SSH native. Profil preview berada di memori; tema dan bahasa tersimpan pada perangkat. SSH, Scheduler server, dan brankas terenkripsi memerlukan aplikasi Tauri. Source produksi tidak menyuntikkan data contoh Scheduler/Observer/Burrow.

Untuk pengembangan gunakan `npm run dev`. Jika PowerShell memblokir `npm.ps1`, gunakan `npm.cmd`.

## Windows

Siapkan Rust stable MSVC, Microsoft C++ Build Tools dengan **Desktop development with C++** dan Windows SDK, serta WebView2. Lihat [prasyarat Tauri](https://v2.tauri.app/start/prerequisites/#windows).

```sh
npm ci
npm run desktop:dev
# Build installer
npm run desktop:build
```

Installer NSIS berada di `src-tauri/target/release/bundle/nsis/` setelah build berhasil. Penutupan jendela desktop mengikuti perilaku tray yang sudah ada.

## Android

Siapkan Android Studio, SDK Platform, Build Tools, Platform Tools, Command-line Tools, dan NDK yang digunakan pipeline. Atur `JAVA_HOME`, `ANDROID_HOME`, serta `NDK_HOME`.

```sh
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
npm ci
npm run android:init
npm run android:dev
# Build APK
npm run android:build
```

Firebase tidak diperlukan untuk fitur aktif Warren. Pipeline menerima konfigurasi Firebase lama secara opsional untuk kompatibilitas upgrade dan penghentian registrasi push. Worker lama dipertahankan sebagai shim tanpa pengiriman agar record WorkManager dari versi sebelumnya tetap dapat diselesaikan. Registrasi token lama dihentikan sebaik mungkin; push yang sudah diantrekan sebelumnya masih mungkin tiba.

Sesi SSH tidak dijamin tetap aktif jika Android menghentikan aplikasi. Jadwal yang sudah tersimpan tetap berjalan di **cron server**, tanpa proses background Warren pada HP.

## Hubungkan VPS

1. Buka aplikasi native dan buat/buka brankas.
2. Pada **Connections**, tambahkan host/IP, port, username, serta password atau private key.
3. Sambungkan dan cocokkan fingerprint host dengan sumber tepercaya.
4. Gunakan sesi di Terminal; pilih profil yang sama di Scheduler, Observer, atau Burrow sesuai sumber datanya.

Scheduler mengelola crontab akun SSH tersebut, bukan `/etc/crontab`, akun lain, Windows Task Scheduler, atau systemd timer. Server harus menyediakan Linux, Python 3, dan `crontab` dengan izin yang sesuai. Observer/Burrow juga memerlukan file dan utilitas server sesuai panduannya.

## Penyimpanan, upgrade, dan rilis

Application ID tetap **`dev.harbor.workspace`**. Brankas `harbor.hold`, salt `vault-salt.bin`, dan client Stronghold `harbor-workspace-v1` tidak diganti. Backup keduanya secara aman saat app ditutup. Upgrade Android memerlukan package ID dan sertifikat yang sama serta versi lebih tinggi.

Source perubahan ini memakai baseline **v0.6.1 / `878bfb3c149fd05d8a0adc2c6f592c68665a85f8`**. Nomor versi belum dinaikkan; pilih versi baru saat menyiapkan release. [Panduan update](docs/UPDATES.md) dan [hasil pengujian](docs/TESTING.md).

## Struktur utama

```text
src/App.tsx                     Navigasi dan integrasi halaman
src/components/                 Tampilan, terminal, Scheduler, Observer, Burrow
src/hooks/useWorkspace.ts       Sesi SSH, brankas, dan state aplikasi
src/lib/scheduler.ts            Tipe dan validasi cron
src/lib/schedulerClient.ts      Batas IPC Scheduler
src-tauri/src/ssh.rs            Transport SSH dan host-key verification
src-tauri/src/scheduler.rs      IPC dan transport request Scheduler
src-tauri/src/scheduler_remote.py Editor crontab yang dijalankan pada VPS
docs/                          Panduan dan pengujian
```

`package-lock.json` dan `src-tauri/Cargo.lock` disertakan. Dependency, hasil build, dan kredensial tidak disertakan dalam paket source. Pemeriksaan native:

```sh
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

Build installer/APK, upgrade perangkat fisik, dan uji Scheduler pada VPS perlu lulus sebelum release digunakan.
