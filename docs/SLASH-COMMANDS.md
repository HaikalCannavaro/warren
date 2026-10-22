# Perintah slash dan koneksi Gateway Hermes

Warren menyediakan menu perintah dari kolom chat Agent. `/help` dan `/new` bekerja di Warren; perintah sesi seperti `/status`, `/model`, dan `/stop` memerlukan koneksi Gateway Hermes yang kompatibel. Ketersediaan perintah ditampilkan dalam menu, sehingga sebuah perintah yang didukung CLI Hermes belum tentu bisa dijalankan dari Warren.

Agent memakai satu ruang chat tanpa panel daftar percakapan. Setelah chat pertama dibuka, gunakan `/new` atau `/new Nama sesi` untuk membuat percakapan baru pada koneksi yang sama. **Open chat** di halaman Connections melanjutkan chat yang sudah ada untuk koneksi itu. Chat aktif dipulihkan saat brankas dibuka kembali; data percakapan sebelumnya tetap tersimpan.

Bahasa antarmuka bawaan adalah **English**. Ubah melalui **Settings → Language → English / Bahasa Indonesia** (**Pengaturan → Bahasa**). Pilihan langsung berlaku dan disimpan di perangkat. Bahasa pesan pengguna, balasan Agent, hasil server, dan nama perintah tidak diubah oleh pengaturan ini.

Acuan integrasi ini adalah **Hermes 0.22.4**, commit [`4d04303818b61bf3aa09278af48356315515965b`](https://github.com/NousResearch/hermes-agent/tree/4d04303818b61bf3aa09278af48356315515965b). Protokol Gateway menyediakan kontrol sesi dan perintah; profil HTTP memakai API Chat Completions. [Dokumentasi integrasi resmi Hermes](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration).

## Pilih jenis koneksi

| Jenis koneksi | Alamat yang diisi | Kredensial | Perintah Warren |
| --- | --- | --- | --- |
| HTTP · OpenAI compatible | Contoh `https://hermes.example.com/v1` | `API_SERVER_KEY` untuk API Server | `/help` dan `/new` |
| Gateway · Chat and Hermes commands | Contoh `wss://hermes.example.com/api/ws` | Token sesi Gateway yang berlaku pada layanan tersebut | Perintah lokal dan perintah Gateway yang dinyatakan tersedia |

Alamat Gateway harus menunjuk layanan sesi WebSocket yang sudah berjalan. Pada VPS Linux, gunakan alamat WSS dan konfigurasi reverse proxy yang memang meneruskan koneksi WebSocket ke layanan Gateway. Jangan menebak alamatnya dengan mengganti `/v1` menjadi `/api/ws` pada port API Server. Menjalankan API Server saja belum memastikan endpoint sesi yang dibutuhkan Warren tersedia.

Warren menerima `wss://` untuk server remote. `ws://` hanya diterima untuk IP loopback `127.0.0.1` atau `[::1]`. Loopback pada Android menunjuk perangkat Android itu sendiri. Alamat dengan prefiks reverse proxy dapat digunakan, misalnya `wss://hermes.example.com/hermes/api/ws`; alamat harus tetap berakhir dengan `/api/ws` dan tidak memuat kredensial, query, atau fragmen.

## Dapatkan alamat dan akses sesi

1. Buka dashboard atau akses sesi Hermes milik Anda yang sudah berfungsi. Pastikan instalasinya menyediakan layanan Gateway WebSocket yang sesuai, lalu dapatkan URL lengkapnya dari konfigurasi instalasi atau administrator Anda.
2. Dapatkan **token akses sesi pengguna yang diterbitkan server dan diizinkan untuk Gateway** melalui mekanisme akses sesi instalasi tersebut. Token ini berbeda dari `API_SERVER_KEY`; jangan menyalin API key atau token proses dashboard lama ke kolom token Gateway. Warren belum menyediakan alur login dashboard atau penerbitan token.
3. Pastikan instalasi menyediakan akses berbasis token sesi untuk klien seperti Warren. Hermes 0.22.4 memverifikasi token akses pengguna melalui penyedia autentikasi dashboard, termasuk pada layanan publik yang dilindungi login. Jika instalasi hanya menyediakan tiket/login dashboard tanpa token sesi yang dapat Anda gunakan, buka dashboard atau klien resmi Hermes yang mendukung alur tersebut. [Pemeriksaan autentikasi WebSocket Hermes 0.22.4](https://github.com/NousResearch/hermes-agent/blob/v0.22.4/hermes_cli/web_server_chat.py).

Warren tidak memasang layanan, mengubah firewall, membuat reverse proxy, atau mengganti pengaturan keamanan VPS. Panduan ini tidak meminta perubahan pada server eksternal.

## Tambahkan koneksi di Warren

1. Jalankan aplikasi native dan buka brankas. Pratinjau browser dapat dipakai menjelajahi formulir, tetapi tidak membuka koneksi nyata.
2. Buka **Connections → Agent** (**Koneksi → Agent**), lalu isi **Connection name** (**Nama koneksi**).
3. Pada **Connection type** (**Jenis koneksi**), pilih **Gateway · Chat and Hermes commands** (**Gateway · Chat dan perintah Hermes**).
4. Isi **Server URL** (**URL server**) dengan endpoint WSS lengkap dan **Gateway token** (**Token Gateway**) dengan token sesi Anda. **Profile** adalah nama profile Hermes, misalnya Leveret; Gateway mengutamakan nama yang dilaporkan server. Pengaturan model AI terpisah di **Advanced** dan boleh dikosongkan untuk mengikuti model server.
5. Pilih **Save Agent** (**Simpan Agent**), gunakan **Test connection** (**Uji koneksi**), lalu **Open chat** (**Buka chat**) dan ketik `/` untuk memuat daftar perintah.

Mengganti jenis koneksi mengosongkan isian URL dan token agar kredensial dari jenis lama tidak terpakai. Mengganti alamat atau jenis koneksi membuat profil baru; percakapan lama tetap memakai profil sebelumnya.

Jika token kedaluwarsa atau ditolak, dapatkan token baru melalui mekanisme akses sesi Hermes Anda, lalu edit kredensial profil di Warren. Pembaruan token dan percobaan koneksi dilakukan secara manual. Tidak ada penyegaran token atau pengiriman ulang pekerjaan otomatis.

## Gunakan menu perintah

- Ketik `/` di awal pesan, lalu ketik sebagian nama untuk menyaring daftar.
- Gunakan **↑/↓** untuk memilih, **Tab** untuk melengkapi, atau sentuh pilihan pada layar. Pilihan hanya mengisi kolom chat.
- **Enter** saat nama masih sebagian melengkapi pilihan. **Enter** pada perintah lengkap menjalankannya. Tambahkan argumen sebelum mengirim bila diperlukan.
- **Esc** menutup menu. **Shift + Enter** membuat baris baru.
- Untuk mengirim teks chat yang diawali `/`, ketik dua garis miring. Contoh `//help` dikirim sebagai teks `/help`.

| Perintah | Fungsi | Saat Agent bekerja |
| --- | --- | --- |
| `/help` | Menampilkan daftar dan ketersediaan perintah Warren | Diizinkan |
| `/new [name]` | Membuat percakapan baru pada koneksi yang sama | Tunggu pekerjaan selesai |
| `/status` | Meminta status sesi Gateway | Diizinkan bila tersedia |
| `/usage` | Meminta informasi pemakaian sesi | Diizinkan bila tersedia |
| `/model MODEL [--provider PROVIDER]` | Mengganti model sesi; gunakan `/model` tanpa argumen untuk melihat model | Tunggu pekerjaan selesai |
| `/compact [focus]` | Meminta peringkasan konteks sesi dengan fokus opsional | Tunggu pekerjaan selesai |
| `/stop` | Meminta penghentian pekerjaan sesi yang aktif | Diizinkan bila tersedia |

Gunakan ID model dari server sebagai `MODEL`. Jika perlu memilih penyedia, tambahkan `--provider PROVIDER` sebagai argumen terpisah. Tanda titik dua di dalam ID model tetap bagian dari ID tersebut; Warren tidak memisahkannya menjadi penyedia dan model. Header chat menampilkan nama koneksi dan **Profile** Hermes. `/model` mengatur mesin AI, bukan mengganti profile Hermes.

Perintah yang belum tersedia dinonaktifkan dan memiliki alasan. Jika daftar gagal dimuat, gunakan **Try again** (**Coba lagi**). Perintah yang tidak dikenal tidak dikirim sebagai pesan biasa ke model. Daftar awal Warren terbatas pada perintah di atas; ini bukan dukungan untuk semua slash command Hermes. Rute dan kemampuan perintah memang berbeda antarklien Hermes. [Perbandingan perintah Gateway resmi](https://hermes-agent.nousresearch.com/docs/developer-guide/gateway-command-parity).

## Baca hasil dan tangani pekerjaan terputus

Hasil perintah muncul sebagai kartu **Command** (**Perintah**) yang terpisah dari pesan pengguna dan jawaban Agent. Kartu ini tidak ikut dikirim sebagai riwayat chat pada permintaan berikutnya. Catatan aktivitas server tetap ditampilkan melalui panel **Tool Activity**.

`/stop` mengirim permintaan penghentian. Tunggu konfirmasi server; perintah ini tidak membatalkan perubahan yang sudah dilakukan tool. Menutup panel, menutup aplikasi, atau kehilangan jaringan tidak membuktikan pekerjaan di server telah berhenti.

Jika koneksi berakhir tanpa konfirmasi, Warren menandai hasil **belum diketahui** dan tidak mengirim ulang otomatis. Periksa sesi melalui Hermes sebelum mengulangi pekerjaan. Hasil perintah yang masih menunggu saat aplikasi terputus juga dipulihkan sebagai belum diketahui.

Warren belum memiliki antarmuka untuk persetujuan tool, pertanyaan klarifikasi, sudo, atau permintaan rahasia dari Gateway. Bila pekerjaan memerlukannya, gunakan dashboard atau klien Hermes yang mendukung interaksi tersebut. Jangan menganggap persetujuan telah diberikan hanya karena chat terlihat berjalan. Hermes menyediakan interaksi ini sebagai permintaan terpisah kepada klien. [Alur interaksi klien pada dokumentasi resmi](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration#serverclient-requests-questions-the-agent-asks-you).

## Status pengujian

Perubahan source mencakup pengujian parser, routing, antarmuka perintah, dan pemulihan data. Koneksi ke VPS Anda belum diuji langsung. Build native Windows belum dapat diselesaikan pada lingkungan pengerjaan karena linker MSVC `link.exe` belum tersedia; source ini belum menjadi installer Windows atau APK yang baru diuji pada perangkat. Lihat [catatan pengujian](TESTING.md) sebelum menyiapkan rilis.
