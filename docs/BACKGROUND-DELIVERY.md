# Pengiriman background Warren dan Firebase

Baseline: Warren v0.5.0, commit `81350a9be1efd6745a5daf6747bb7795506252aa`.
Target perangkat: Samsung Galaxy A73 5G SM-A736B, One UI 8 / Android 16 API 36.
Application ID tetap **`dev.harbor.workspace`**. Versi source tidak dinaikkan oleh patch ini.

## Cara kerjanya

Pengiriman background diaktifkan per koneksi Gateway lewat Settings → Background delivery. Pesan disimpan ke brankas Warren sebelum diserahkan ke outbox Android. Outbox mengenkripsi pesan dan token relay dengan AES-GCM menggunakan kunci Android Keystore yang terpisah dari master password brankas. Pengaktifan fitur ini mengizinkan antrean native melanjutkan pengiriman ketika UI ditutup atau brankas dikunci; prosesnya tidak menyimpan master password.

WorkManager menjalankan HTTP submit/sinkronisasi singkat ketika jaringan tersedia. Pekerjaan agen yang panjang berjalan melalui relay di VPS, tidak menunggu Activity, WebView, atau koneksi WebSocket HP. Relay menyimpan pekerjaan di SQLite sebelum mengakui penerimaan, lalu memakai Gateway `hermes-gateway-v1` dengan `durable-admission-v1` dan `event-replay-v1`.

ID pengiriman tidak diganti saat retry. Setelah restart relay, admission yang sudah tersimpan diperiksa melalui `prompt.receipt`; bila tanda terima belum sempat tersimpan, `prompt.submit` memakai `submission_id` yang sama. Hasil diambil melalui replay yang dicocokkan dengan session/admission, atau result receipt. Status yang tidak pasti tetap unknown; relay tidak memanggil cancel, interrupt, resolve_unknown, atau menjalankan ulang dengan ID baru. Kebenaran deduplikasi tetap bergantung pada kontrak durable admission server yang dipakai.

Saat Warren dibuka dan brankas terbuka, hasil cache native disalin ke chat. Cache native baru dihapus setelah hasil berhasil tersimpan di Stronghold. Jika app terhenti di antara penyimpanan intent dan enqueue native, intent dipulihkan saat brankas berikutnya dibuka. Selama pesan masih pending, pengiriman baru/perubahan sesi pada percakapan itu dibatasi agar pekerjaan tidak tumpang tindih.

Konfigurasi Gateway lain tetap memakai jalur sebelumnya. Background delivery ini berlaku pada **Android** dan membutuhkan relay yang disediakan dalam `server/background-relay/`. Untuk Windows, hotfix v0.6.0 menambahkan close ke tray; lihat [catatan hotfix startup dan tray](RELEASE-0.6.0-HOTFIX.md).

## 1. Buat aplikasi Android di Firebase

1. Buka [Firebase Console](https://console.firebase.google.com/), buat atau pilih project milik Anda.
2. Pilih **Project settings → General → Your apps → Add app → Android**.
3. Isi **Android package name** dengan tepat: `dev.harbor.workspace`. Nama panggilan boleh `Warren`. Pertahankan application ID dan sertifikat APK yang sudah dipakai untuk upgrade pemasangan lama.
4. Daftarkan aplikasi, lalu unduh file **`google-services.json`**. Pendaftaran FCM dasar tidak memerlukan SHA certificate fingerprint; tambahkan fingerprint jika layanan Firebase lain mengharuskannya.
5. Simpan file asli pada source Warren:

```text
warren/
  src-tauri/
    firebase/
      google-services.json       ← salinan lokal yang tahan proses generate
```

File ini adalah konfigurasi client Android. **Jangan meletakkan service-account private key VPS di lokasi ini.**

6. Siapkan Node, Rust, Java/Android SDK, platform `android-36`, serta NDK `28.2.13676358`, mengikuti prasyarat repo. Dari root source:

```sh
npm ci
npm run android:init
node scripts/configure-android-firebase.mjs --required
```

`android:init` sudah memanggil konfigurator ini secara opsional. Perintah `--required` memastikan konfigurasi sudah terpasang sebelum build yang membutuhkan push. Hasilnya:

```text
src-tauri/gen/android/
  build.gradle.kts              ← Google services plugin
  app/
    build.gradle.kts            ← apply plugin Google services
    google-services.json        ← lokasi yang dibaca plugin Gradle
```

Lokasi efektifnya **`src-tauri/gen/android/app/google-services.json`**, bukan root `src-tauri/` atau direktori library `android-updater/`. Konfigurator memeriksa package name, menyalin file, menambahkan plugin secara idempoten, serta menonaktifkan backup aplikasi karena outbox terikat ke kunci Keystore perangkat. Ulangi setelah project Android di-generate ulang.

7. Build dengan pipeline Android yang sudah dipakai repo. Dependensi Firebase Messaging dan WorkManager berada pada library native Warren; tidak ada Analytics yang ditambahkan.

### GitHub Actions

Tambahkan secret repo **`FIREBASE_GOOGLE_SERVICES_BASE64`** berisi base64 dari file client `google-services.json`. Contoh membuat nilainya secara lokal:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('src-tauri/firebase/google-services.json'))
```

Salin hasilnya ke **GitHub repository → Settings → Secrets and variables → Actions → New repository secret**. Workflow Android sekarang menjalankan konfigurator dengan `--required`, sehingga build rilis berhenti bila file Firebase hilang atau package salah. Base64 adalah format penyimpanan, bukan enkripsi; CI menanganinya sebagai secret. File service-account server tidak masuk ke secret Android ini.

## 2. Siapkan private key Firebase di VPS

1. Pada Firebase project yang sama, buka **Project settings → Service accounts → Firebase Admin SDK**.
2. Pilih **Generate new private key**, unduh JSON, lalu beri nama `FIREBASE_SERVICE_ACCOUNT_KEY.json`. Kunci ini khusus proses server. Gunakan service account dengan izin kirim FCM yang diperlukan, mengikuti kebijakan IAM project Anda; FCM HTTP v1 API harus aktif.
3. Pindahkan file melalui jalur administrasi Anda ke VPS Hcnnvr-studio. File ini **tidak** dimasukkan ke source, patch, APK, lampiran chat, atau arsip release.
4. Salin source folder `server/background-relay/` ke `/opt/warren-relay` di VPS. Contoh setup Ubuntu 22.04 dari akun administrator:

```sh
sudo useradd --system --home /var/lib/warren-relay --shell /usr/sbin/nologin warren-relay
sudo install -d -m 0750 -o warren-relay -g warren-relay /etc/warren-relay
sudo install -d -m 0700 -o warren-relay -g warren-relay /var/lib/warren-relay
sudo install -m 0600 -o warren-relay -g warren-relay /path/to/FIREBASE_SERVICE_ACCOUNT_KEY.json /etc/warren-relay/FIREBASE_SERVICE_ACCOUNT_KEY.json
sudo apt-get install python3-venv
sudo python3 -m venv /opt/warren-relay/.venv
sudo /opt/warren-relay/.venv/bin/pip install -r /opt/warren-relay/requirements.txt
```

Jika user/direktori sudah ada, gunakan yang sudah ada dan periksa kepemilikannya. Tidak perlu menjalankan daemon sebagai root.

5. Salin `relay.env.example` sebagai `/etc/warren-relay/relay.env`, lalu isi menggunakan editor/secret manager di VPS:

```text
WARREN_GATEWAY_URL=wss://leveret.unlessrabbit.my.id/api/ws
WARREN_GATEWAY_PUBLIC_URL=wss://leveret.unlessrabbit.my.id/api/ws
WARREN_GATEWAY_TOKEN=<token Gateway yang sudah ada>
WARREN_RELAY_TOKEN=<token baru khusus relay, minimal 32 karakter>
WARREN_RELAY_DB=/var/lib/warren-relay/jobs.sqlite3
GOOGLE_APPLICATION_CREDENTIALS=/etc/warren-relay/FIREBASE_SERVICE_ACCOUNT_KEY.json
```

`WARREN_GATEWAY_URL` adalah endpoint yang dapat dicapai daemon. Jika memilih endpoint lokal/Tailscale, biarkan `WARREN_GATEWAY_PUBLIC_URL` sama dengan URL yang disimpan di profil Warren agar pengecekan sumber tetap cocok. Aplikasi Android tetap memakai HTTPS untuk relay dan WSS untuk koneksi Gateway langsung.

Buat token relay terpisah menggunakan generator acak, misalnya `openssl rand -hex 32`. Masukkan token tersebut hanya ke environment server dan pengaturan background di perangkat. Token Gateway pengguna tidak ditanamkan dalam source atau contoh konfigurasi.

```sh
sudo chown warren-relay:warren-relay /etc/warren-relay/relay.env
sudo chmod 0600 /etc/warren-relay/relay.env
```

6. Pasang unit systemd yang disertakan:

```sh
sudo install -m 0644 /opt/warren-relay/warren-relay.service /etc/systemd/system/warren-relay.service
sudo systemctl daemon-reload
sudo systemctl enable --now warren-relay
sudo systemctl status warren-relay
```

`GOOGLE_APPLICATION_CREDENTIALS` membuat Firebase Admin SDK menggunakan private key server untuk menandatangani permintaan push. Jika variabel tersebut tidak dipasang, relay tetap menyimpan dan menjalankan tugas, tetapi tidak mengirim push.

7. Relay hanya mendengarkan **127.0.0.1:8766**. Tambahkan location yang disertakan dalam `nginx-location.conf` ke virtual host HTTPS yang sudah ada. Ini menghasilkan alamat layanan **`https://leveret.unlessrabbit.my.id/warren`**. Pertahankan konfigurasi TLS dan `/api/ws` yang ada. Uji konfigurasi nginx sebelum reload.

API `/v1/health`, `/v1/jobs`, `/v1/jobs/<id>`, dan `/v1/devices` semuanya memerlukan `Authorization: Bearer <WARREN_RELAY_TOKEN>`. Daemon terikat ke satu pemilik dan satu Gateway yang dikonfigurasi; bukan layanan multi-tenant. Jangan membuka port loopback relay langsung ke internet. SQLite mengandung isi tugas/hasil, sehingga direktori state perlu tetap privat dan disertakan dalam kebijakan backup/retensi VPS Anda.

## 3. Aktifkan pada Galaxy A73

1. Pasang APK yang sudah ditandatangani dengan package dan sertifikat yang sama dengan instalasi sebelumnya.
2. Buka brankas dan pastikan profil Agent bertipe **Gateway** memakai WSS publik yang disebut di atas.
3. Buka **Settings → Background delivery**. Pilih koneksi Agent, isi alamat `https://leveret.unlessrabbit.my.id/warren` dan token **relay** yang baru.
4. Tekan **Connect & enable**. Warren memeriksa bahwa relay mengiklankan Gateway yang sama dengan profil yang dipilih. Token tersimpan terenkripsi dalam Keystore-backed outbox.
5. Tekan **Allow** pada Result notifications, lalu izinkan notifikasi Android. FCM token perangkat didaftarkan otomatis ke relay. Jika Firebase belum dipasang ke build, panel akan menyatakannya.
6. Kirim pesan uji yang aman. Tunggu sampai pesan diantrekan, lalu pindah aplikasi atau tutup tampilan. Cek hasil di server dan notifikasi perangkat. Ketuk notifikasi, buka brankas bila perlu, dan percakapan terkait dibuka serta disinkronkan.

Notifikasi hanya berisi pemberitahuan umum dan ID percakapan/pengiriman. Teks chat tidak dikirim melalui FCM atau ditampilkan di lock screen. Jeda pengiriman di Settings menghentikan worker lokal; tugas yang sudah diterima VPS tidak dibatalkan. Aktifkan kembali untuk mengambil hasil yang belum tersinkron.

## Batas Android 16 dan cakupan uji

- Ini bukan layanan foreground `dataSync` yang dipaksa hidup berjam-jam. Worker melakukan operasi jaringan singkat, sedangkan pekerjaan agen berada di VPS. Pengiriman bisa ditunda oleh Doze, kuota WorkManager, kondisi jaringan, dan kebijakan baterai One UI.
- Poll fallback native memakai interval minimum WorkManager 15 menit, ditambah retry terjadwal. Push serta pembukaan Warren memicu sinkronisasi. Tidak ada janji polling tepat setiap beberapa detik ketika HP idle.
- Force Stop melalui Settings menghentikan pengiriman/push sampai app dibuka kembali. Setelah reboot, pekerjaan tersimpan dapat dilanjutkan setelah perangkat dibuka dan sistem menjadwalkannya.
- Jika proses mati sebelum enqueue native berhasil disimpan, intent dalam brankas dipulihkan saat Warren dibuka dan di-unlock. Pesan belum bisa dianggap diterima VPS sebelum ada konfirmasi relay.
- Approval/clarification interaktif yang belum didukung Warren tidak disetujui otomatis. Gunakan klien Hermes yang mendukungnya bila agen membutuhkan jawaban/izin tersebut.
- Akses VPS administratif dan file Firebase asli tidak tersedia pada lingkungan pengerjaan. Relay belum dipasang pada Hcnnvr-studio dan push FCM ke Galaxy A73 belum diuji. Pengujian lokal menggunakan server Gateway tiruan, bukan eksekusi tugas pada VPS pengguna.
- Toolchain Rust/Android SDK lengkap tidak tersedia di lingkungan pengerjaan. Build native, tes Kotlin pada perangkat, pemasangan dan upgrade APK harus dijalankan oleh pipeline serta perangkat target sebelum rilis.

Uji penerimaan: offline sebelum kirim; tutup setelah kirim; putus jaringan setelah receipt; restart daemon; layar mati/Doze; ketuk notif ketika brankas terkunci; izin notif ditolak; penyimpanan penuh; retry ID sama; serta upgrade dari APK v0.5.0 menggunakan signing key lama.

## Pemeriksaan pengembang

```sh
npm ci
npm test
npm run test:release
npm run build
python3 -m venv server/background-relay/.venv
server/background-relay/.venv/bin/pip install -r server/background-relay/requirements.txt
cd server/background-relay
.venv/bin/python -m unittest -v test_relay
```

Sumber resmi: [setup Firebase Android](https://firebase.google.com/docs/android/setup), [FCM Android](https://firebase.google.com/docs/cloud-messaging/android/get-started), [server FCM](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [WorkManager](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started), [Doze](https://developer.android.com/training/monitoring-device-state/doze-standby), serta [kontrak canonical Hermes](https://github.com/NousResearch/hermes-agent/blob/v0.22.4/tui_gateway/contracts/canonical_sessions.py).
