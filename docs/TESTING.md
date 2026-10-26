# Pengujian Warren

## Liang dan tunnel menyatu dengan lubang rumput - 27 Oktober 2026

- **466 tes frontend / 39 berkas lulus** dengan `npm test -- --maxWorkers=2`. Termasuk kurva rongga halus, containment pada lekukan diagonal, sambungan Teduh ke Mimpi dan Pos Bantuan, pemilihan jalur terpendek, serta flare di pertemuan tunnel/liang yang tidak menggandakan jalur bersama atau membuat lubang fiktif.
- Test perjalanan penuh tetap memeriksa perpindahan, pause/resume dan cleanup dengan jam simulasi 30 detik. Batas eksekusi test jsdom ini menjadi 15 detik setelah batas awal 5 detik tidak cukup ketika suite dan build berjalan bersamaan. Semua assertion dan langkah simulasi 50 ms dipertahankan; ini bukan timeout aplikasi.
- TypeScript dan build produksi frontend lulus. Tidak ada dependency atau aset raster baru. Peringatan chunk utama Vite di atas 500 kB tetap ada. Layout numerik memiliki memo terbatas 256 entri.
- Browser desktop 1280 px dan mobile 390 px: path rongga, tunnel dan viewBox identik; selalu lima liang. Batas papan, sprite, nameplate dan alas tidur berada dalam kontur dengan margin 4 px, tanpa overlap dan tanpa overflow horizontal. Pada mobile 320 px dengan sebelas Idle, pembagian tetap 6-5 dan semua 21 objek yang diperiksa tetap di dalam kontur serta tidak bertumpuk.
- Dinding/rim/lantai digambar sekali per lapisan pada gabungan bentuk rongga dan tunnel. Material dan kontur berbagi mask SVG sehingga warna serta batasnya tidak terpotong di sambungan. Detail mulut Ruang Telaah dan lubang oval di rumput diperiksa secara visual. Dark dan Terracotta diperiksa; console preview tanpa error/warning.
- Screenshot memakai fixture lokal yang tidak dikemas. Auto-poll tetap 10 detik, tanpa mutasi VPS. Native/APK, perangkat fisik dan VPS nyata belum diuji pada revisi ini. Catatan berikut adalah hasil tahap sebelumnya.

## Lima liang dengan tunnel acuan dipertahankan - 27 Oktober 2026

- **463 tes frontend / 39 berkas lulus** dengan `npm test -- --maxWorkers=2`. Tes rute memastikan empat jalur asli identik sebelum dan sesudah penambahan liang kelima, hanya ada satu sambungan turun dari Mimpi ke Teduh, tidak ada cabang tambahan menuju liang baru, dan kelinci berjalan melalui sambungan tersebut dalam dua arah.
- Dua tes tambahan memeriksa proporsi lebar untuk satu/dua penghuni dan jumlah yang selalu lima liang, termasuk ketika sebelas agen belum memiliki data. Tes kapasitas mencakup 0-11 penghuni, seluruh kontur, centering baris terakhir, header, sprite, nameplate, dan bedding. Pada keadaan tanpa data, teras berada di permukaan.
- TypeScript dan build produksi frontend lulus. Peringatan chunk utama Vite di atas 500 kB tetap ada. Pada run pengembangan, tes animasi sempat melewati batas 5 detik; frame kini dijalankan dalam satu batch pengujian dengan langkah waktu tetap 50 ms dan pemeriksaan pause/resume, kedatangan, serta cleanup tetap dipertahankan. Full suite terakhir lulus.
- Browser desktop 1280 px dan mobile 390 px menghasilkan path tunnel dan viewBox yang identik. Proporsi liang dan jalur tidak disusun ulang pada mobile. Pengukuran header mengabaikan noise subpiksel dari zoom agar geometri tidak berubah saat skala berubah.
- Browser mobile 320 px dengan semua sebelas Idle: pembagian 6-5, nol avatar/nameplate keluar kontur (margin 4 px), nol overlap, dan nol overflow horizontal dokumen. Pada sumber belum tersedia, tetap lima rongga dan sebelas kelinci seluruhnya berada dalam teras permukaan. Console preview tanpa error/warning.
- Screenshot memakai data uji lokal yang tidak dimasukkan ke source produksi. Query dan auto-poll 10 detik tetap, tanpa mutasi VPS. Native/APK, perangkat fisik, dan VPS nyata belum diuji. Hasil berikut merupakan catatan tahap sebelumnya dan desainnya telah diganti oleh revisi ini.

## Akar tunggang dan liang tidur terbawah - 27 Oktober 2026

- **461 tes frontend / 39 berkas lulus** dengan `npm test -- --maxWorkers=2`. Lima tes tambahan serta revisi tes geometri memeriksa satu batang tengah hingga dasar, cabang ke semua liang, sambungan tetangga pada kedua sisi, jalur tetangga terpendek yang sama dengan gambar, Teras Koneksi opsional, dan penolakan jalur bila ruang tengah terhalang. Tes perpindahan, pause/resume, zoom, dan kapasitas tetap lulus.
- TypeScript dan build produksi frontend lulus. Peringatan ukuran chunk utama Vite di atas 500 kB tetap ada. Tidak ada dependency baru.
- Browser desktop 1280 px dan mobile 390 px mengonfirmasi path batang, seluruh jaringan, dan viewBox identik. Dua liang Idle terletak di bawah seluruh liang kerja. Pemeriksaan visual memperlihatkan sambungan di bibir dan lantai liang terbuka utuh. Tema Dark dan Terracotta diperiksa.
- Pada mobile 320 px dengan sebelas agen Idle, pembagian tetap 6-5; semua bingkai sprite/nameplate berada di dalam kontur udara dengan margin 4 px, nol tumpang tindih, dan nol overflow horizontal dokumen. Batang tengah tetap terhubung setelah kapasitas liang membesar.
- Screenshot memakai data uji lokal yang tidak disertakan di source produksi. Auto-poll tetap 10 detik, tanpa mutasi VPS. Native/APK, perangkat fisik, dan VPS nyata belum diuji pada revisi ini. Catatan berikut adalah hasil tahap sebelumnya.

## Dua liang Idle dan kapasitas kontur - 27 Oktober 2026

- **456 tes frontend / 39 berkas lulus** dengan `npm test -- --maxWorkers=2`. Sebanyak 17 tes tambahan mencakup pembagian acak yang stabil dan seimbang, semua populasi 0-11 pada enam variasi kontur, lekukan yang tidak terdeteksi dengan cek empat sudut saja, serta containment komponen untuk seluruh penghuni pada Idle, Queued, Review, Blocked, dan Awaiting Data.
- TypeScript dan build produksi frontend lulus. Satu tes animasi mengalami timeout pada run paralel bawaan; seluruh suite lulus ketika worker dibatasi dua. Peringatan chunk utama Vite di atas 500 kB masih ada.
- Browser dengan data uji memverifikasi sebelas Idle terbagi 6-5. Seluruh bingkai sprite dan nameplate berada dalam kontur udara SVG dengan margin 4 px, nol tumpang tindih dan nol overflow horizontal dokumen. Uji browser sebelas Review, Queued, dan Blocked pada lebar 320 px juga memenuhi pemeriksaan tersebut.
- Desktop 1280 px dan mobile 320 px menghasilkan path kontur yang identik dan pembagian penghuni yang sama. Mobile hanya memperkecil kanvas; label ikut mengecil pada Pas layar dan bisa dibaca pada 1:1. Tidak ada error/warning console pada preview pemeriksaan kapasitas.
- Pembagian Idle tidak berubah saat polling identik; keanggotaan yang berubah diseimbangkan dengan pemindahan minimum. Ukuran rongga disesuaikan terhadap grid dan papan; tidak ada clipping avatar untuk menutupi overflow.
- Fixture dan screenshot memakai data uji lokal, dikecualikan dari source produksi. Poll tetap 10 detik, tidak ada mutasi VPS. Native/APK, perangkat fisik, dan VPS nyata belum diuji pada revisi ini. Catatan berikut merupakan hasil tahap sebelumnya.

## Skala mobile tanpa perubahan bentuk - 26 Oktober 2026

- **439 tes frontend / 38 berkas lulus.** Dua tes baru memastikan kanvas desktop tetap utuh ketika diperkecil, kontrol Fit/1:1 bekerja, dan perubahan zoom tidak mengulang atau membatalkan perjalanan. Tujuh tes komponen LivingBurrow dijalankan ulang setelah penyempurnaan tombol dan scrolling terakhir, semuanya lulus.
- TypeScript dan build frontend diperiksa. Kanvas logis berukuran tetap 1040 px; tidak ada pergantian susunan liang atau ukuran sprite khusus mobile.
- Perbandingan browser desktop 1280 px dengan mobile 390 px mengonfirmasi path terowongan, kontur rongga, dan viewBox identik. Selisih geometri ternormalisasi kurang dari 0,001 px; overflow horizontal dokumen nol.
- Mode Fit pada mobile menampilkan sekitar 32% pada lebar panel yang diuji. Mode 1:1 menampilkan font nama 12 px dan status 11 px dengan panning horizontal/vertikal native, sedangkan kontrol tetap berukuran normal. Teks pada mode Fit memang ikut diperkecil; gunakan zoom atau detail agen untuk membacanya.
- Fixture dan screenshot memakai data uji lokal yang tidak masuk source produksi. Query/data, auto-poll 10 detik, dan native tidak berubah. Native/APK serta VPS nyata belum diuji pada tahap ini.

## Rongga organik dan geometri terowongan - 26 Oktober 2026

- Revisi visual mengganti ruangan persegi menjadi rongga berlekuk dengan ukuran, posisi, dan kedalaman berbeda. Mobile memakai rongga lebar berselang-seling agar nama 12 px dan status 11 px tetap terbaca.
- **437 tes frontend / 38 berkas lulus.** Lima tes geometri baru memeriksa kontur deterministik, koneksi rongga desktop asimetris/mobile berselang-seling, jalur yang tidak memotong rongga lain, titik tikungan yang sama untuk gambar dan perjalanan, serta tidak mengarang jalur ketika pintu tidak tersedia.
- TypeScript dan build produksi lulus. Kedua tema diperiksa pada revisi ini. Mobile 320 px dengan 11 agen idle memiliki 4 koneksi liang, nol nameplate bertumpuk, nol overflow horizontal, nama 12 px dan status 11 px. Fixture browser dipisahkan dari source produksi. Data/status, auto-poll 10 detik, dan query native tidak berubah.
- Native/APK dan VPS sebenarnya belum diuji. Panduan terkini: [LIVING-BURROW.md](LIVING-BURROW.md). Hasil berikut adalah catatan tahap sebelumnya.

## Living Burrow dan perjalanan antararea - 26 Oktober 2026

- **432 tes frontend / 37 berkas lulus.** Sembilan tes domain/komponen baru menggantikan delapan tes geometri model lama. Mencakup pemetaan lima status ke area, sumber unknown terpisah, rute melewati pintu/poros, jarak berjalan dan arah, status berubah di tengah perjalanan, pause/resume, cleanup frame, reduced motion, serta data pertama tanpa perjalanan fiktif.
- TypeScript dan build frontend produksi diperiksa. Pemeriksaan browser memakai fixture lokal di aplikasi dan preview komponen yang sama; fixture tidak disertakan dalam paket source.
- Pada mobile 320 px dengan seluruh 11 agen idle, jumlah kelinci tetap 11, semuanya masuk Liang Mimpi, tidak ada nameplate saling tumpang tindih atau overflow horizontal dokumen. Nama tetap 12 px dan status 11 px. Habitat bertambah tinggi ketika banyak agen menempati satu area.
- Kedua tema, label Indonesia/Inggris, slot sesuai status, serta perpindahan Working ke Blocked diperiksa di browser. Penanda perjalanan terlihat sebelum kelinci tiba pada Pos Bantuan.
- Animasi ini menampilkan status dari Kanban; tidak mengendalikan worker atau menulis status task. Auto-poll tetap 10 detik. Native/APK serta VPS nyata belum diuji pada tahap ini; batas native paket sebelumnya tetap berlaku.
- Panduan terkini: [LIVING-BURROW.md](LIVING-BURROW.md). Hasil berikut merupakan catatan tahap sebelumnya.

## Pixel Fleet, hierarki, dan lima status — 26 Oktober 2026

- **431 tes frontend / 37 berkas lulus**, TypeScript lulus. Mencakup satu Leveret + sepuluh spesialis, Nexus/Frame di Burrow, role pengguna, prioritas blocked > running > review > queued > idle, mode arsip/cancellation, serta auto-poll default 10 detik tanpa overlap.
- Tujuh tes geometri memastikan seluruh liang tersambung, Leveret bercabang simetris di desktop, satu poros tengah pada mobile, sudut luar utuh, dan poros melewati sela kolom. Delapan tes geometri/mount dijalankan ulang setelah perubahan mobile terakhir dan lulus. Tes mount/ResizeObserver memastikan jaringan muncul saat pertama dirender serta mengikuti perubahan ukuran. Lima pose animasi, unknown/stale, reduced motion, dialog/fokus, dan cleanup juga diperiksa.
- **4 tes query SQLite lulus**: menjalankan query aktual dari source Rust pada database dalam memori; antrean disertakan, arsip default tersembunyi sebelum LIMIT 25, mode arsip eksplisit, dan tidak ada penulisan task.
- Build produksi frontend lulus; chunk utama sekitar 807 kB / gzip 232 kB, drawer transkrip tetap terpisah. Peringatan chunk utama di atas 500 kB masih ada.
- Rumput hijau, tanah coklat, dinding liang terang dan nameplate gelap diverifikasi pada Dark/Terracotta.
- Pemeriksaan browser mobile 320 px mengonfirmasi sprite 112 px, nama 12 px/status 11 px, nol overflow dokumen dan tidak ada label yang bertabrakan dengan terowongan. Pusat sprite Leveret sama dengan pusat habitat. Fixture visual terpisah dari source produksi.
- Query/bridge native berubah untuk status antrean dan `includeArchived`. Rust/Cargo, build Windows/APK, upgrade perangkat fisik, dan VPS sebenarnya belum divalidasi di lingkungan ini. Tes SQL lokal bukan bukti kompilasi native.
- Panduan terkini: [PIXEL-FLEET.md](PIXEL-FLEET.md). Catatan di bawah adalah hasil tahap sebelumnya.

## Habitat Observer dan Settings terpisah — 26 Oktober 2026

- **413 tes frontend / 34 berkas lulus**. Tes baru mencakup 10 kelinci untuk 10 agen, banyak tugas per agen, detail mengikuti data terbaru, status unknown/stale, usia snapshot 60 detik, pause manual, visibility, reduced motion, IntersectionObserver, dan pembersihan timer.
- Settings memakai gear di luar kedua navigasi utama; navigasi menjadi lima item. Tes memastikan akses ke Settings dan terminal tetap tersedia. Sesi SSH dengan endpoint lama dari profil yang sudah diedit tidak dipakai untuk membaca Observer.
- TypeScript dan build produksi lulus. Main JavaScript 799,89 kB / gzip 229,23 kB; chunk transkrip terpisah 345,21 kB / gzip 105,60 kB. Peringatan chunk utama di atas 500 kB tetap ada.
- Desain memakai SVG/CSS dengan shading 2.5D dan animasi, tanpa dependency baru. Pemeriksaan browser memakai fixture lokal yang dikecualikan dari paket produksi; tidak mengubah VPS atau tugas agen.
- Build native, APK/perangkat fisik, dan SSH VPS nyata belum diuji pada tahap ini. Perubahan tahap ini hanya frontend dan dokumentasi; batas native pada paket Scheduler sebelumnya tetap berlaku.

## Scheduler dan penghapusan Agent — 26 Oktober 2026

- Baseline tepat v0.6.1 / `878bfb3c149fd05d8a0adc2c6f592c68665a85f8`.
- **404 tes frontend / 33 berkas lulus**. Suite mencakup validasi cron, pemilihan host dan endpoint sesi yang tepat, edit berdasarkan revision, respons terlambat, kegagalan penulisan tanpa retry, modal saat pending, serta retirement sinkronisasi background setelah unlock/resume. Setelah perapian form terakhir, 15 tes komponen Scheduler dijalankan kembali dan lulus.
- **68 tes script release**, **10 tes verifier startup APK**, dan **4 tes relay Python** lulus. Relay memakai loopback lokal dan tetap disertakan sebagai kode legacy, bukan fitur chat aktif.
- Helper cron Python: **22 tes lulus, 3 tes lock POSIX dilewati pada Windows**. Workflow Ubuntu CI menjalankan ketiganya. Tes backend memakai crontab palsu; tidak ada mutasi crontab atau pengiriman task pada VPS pengguna.
- TypeScript dan build produksi Vite lulus. Main JavaScript 782,78 kB / gzip 224,06 kB; drawer transkrip terpisah 345,21 kB / gzip 105,60 kB. Peringatan chunk di atas 500 kB masih ada.
- Tampilan diperiksa pada desktop 1280×900 dan mobile 390×844, tema Dark/Terracotta, form, serta dropdown host. Mobile tidak mempunyai overflow dokumen horizontal; dropdown berada di dalam viewport. Log browser tidak menunjukkan error/warning. Pemeriksaan visual daftar berisi fixture lokal terpisah; fixture tidak disertakan dalam source/paket produksi.
- Menu Agent, profil Agent, dan Background delivery tidak tersedia. Riwayat/profil lama tetap tersimpan dan tidak menghalangi updater sebagai aktivitas live. Worker Android lama menjadi shim tanpa pengiriman; Firebase opsional untuk release.
- Rust/Cargo, Android SDK/NDK/Gradle, dan perangkat fisik tidak tersedia untuk validasi native pada tahap ini. Tiga tes Rust baru tersedia tetapi belum dijalankan. Build installer/APK, upgrade lama, serta SSH/cron VPS nyata masih perlu lulus sebelum release. Tes verifier di atas menguji alat pemeriksa, bukan APK baru yang sudah dibangun.
- Habitat kelinci di Observer hanya konsep; tidak ada aset/animasi habitat yang diimplementasikan.

Catatan berikut adalah hasil historis; pengujian fitur Agent/background di bawah tidak menyatakan fitur itu masih aktif pada source terbaru.

## Background delivery Android dan Firebase — 25 Oktober 2026

- Baseline tepat `81350a9be1efd6745a5daf6747bb7795506252aa` / Warren v0.5.0. Perubahan belum dipush atau diterbitkan.
- **331 tes frontend dalam 30 berkas lulus**, termasuk intent background sebelum enqueue, penyimpanan gagal tanpa pengiriman kedua, acknowledgment setelah Stronghold berhasil, hasil terlambat setelah lock, pemulihan status, serta konfigurasi Settings. Suite penuh lulus dengan dua worker; satu run paralel sebelumnya mencapai timeout pada tes navigasi updater yang sudah ada.
- **68 tes script rilis lulus**, termasuk pemasangan Firebase pada modul Android yang benar, package validation, dan konfigurator yang idempoten. TypeScript dan build frontend produksi lulus; peringatan chunk Vite di atas 500 kB tetap ada.
- **4 tes relay Python lulus** dengan HTTP/WebSocket loopback nyata: autentikasi API/idempotensi, receipt terputus setelah submit lalu ID dipakai ulang, persistensi SQLite dan korelasi replay, serta hasil error/unknown yang tidak dinyatakan sukses. Tidak ada tugas agen yang dikirim ke server pengguna dalam tes ini.
- Bridge native memuat outbox terenkripsi Android Keystore, WorkManager, Firebase Messaging, dan routing notifikasi setelah unlock. Source Rust/Kotlin ditambahkan tetapi belum dikompilasi pada lingkungan ini karena toolchain Rust/Android SDK lengkap tidak tersedia.
- Firebase project asli, service-account key, deployment relay di VPS, push end-to-end, swipe/Doze pada Galaxy A73 Android 16, serta build/install/upgrade APK tetap memerlukan validasi pipeline dan perangkat pengguna. Kelulusan frontend/relay lokal bukan bukti kelulusan Android native.
- Panduan konfigurasi dan batasan tersedia pada [BACKGROUND-DELIVERY.md](BACKGROUND-DELIVERY.md). Konfigurasi dan kunci asli dikecualikan dari Git dan paket source.

## Observer, Burrow, tema, dan terminal mobile — 25 Oktober 2026

- **322 tes frontend dalam 28 berkas lulus.** Pemeriksaan TypeScript dan build produksi frontend lulus. Main JavaScript 953,14 KB (gzip 275,35 KB); drawer transkrip dimuat terpisah. Peringatan ukuran chunk Vite di atas 500 KB masih ada.
- Observer adalah halaman awal dan menu pertama di sidebar/mobile, dengan ikon SVG pengguna. Linux/NVIDIA, SQLite JSON, roster sepuluh agen, filter task, cancellation saat host berubah, respons terlambat, polling tanpa overlap, dan state tanpa data tercakup dalam tes.
- Burrow memakai SSH `tail -f -n 15` dengan buffering UTF-8/JSONL, pemilih sumber, cleanup kanal, serta pencarian transkrip berdasarkan task ID. Empat pemeriksaan shell lokal untuk lookup transkrip lulus: task tepat, tidak ditemukan, direktori kosong, dan direktori hilang.
- Warren Dark dan Terracotta diperiksa bersama ikon palet, custom dropdown, drawer Markdown, dan scroll terminal sentuh. Perubahan tema memperbarui xterm tanpa mengganti sesi. Perintah tes navigasi juga memastikan terminal dan draft Agent bertahan.
- UI desktop 1280×900 dan ponsel 390×844 diperiksa dengan fixture terpisah. Pergantian hardware Linux ke GPU mempertahankan sumber orkestrator. Tidak ada overflow dokumen horizontal pada lebar ponsel; tabel Kanban memiliki area scroll sendiri. Fixture pengujian tidak dimasukkan ke source aplikasi atau ZIP.
- Source aplikasi tidak menampilkan data buatan atau label demo/simulasi pada Burrow/Observer. Pemeriksaan tanpa koneksi memakai state menunggu/terputus.
- Rust/Cargo tidak tersedia pada lingkungan pengerjaan tahap ini. Tes Rust tersedia tetapi belum dijalankan; kompilasi native, VPS sebenarnya, Windows SSH/GPU sebenarnya, installer Windows, APK, dan uji sentuh pada perangkat Android belum divalidasi.

Catatan berikut adalah hasil tahap sebelumnya, termasuk identitas dan penanda preview yang telah diganti oleh perubahan terbaru.

## Profile, panel berdampingan, dan navigasi — 23 Oktober 2026

- **237 tes frontend dalam 15 berkas lulus**, termasuk metadata Profile, penyimpanan identitas per balasan, metadata yang hilang, callback koneksi lama, form Profile/model terpisah, panel tanpa overlay, dan komponen chat/terminal yang tetap terpasang saat navigasi.
- **25 tes alat rilis lulus.** TypeScript dan build produksi lulus. JavaScript 883,12 KB (gzip 252,67 KB); peringatan ukuran chunk Vite di atas 500 KB tetap ada.
- Browser diperiksa dengan data simulasi pada **1280 × 720**, **1024 × 768**, dan **390 × 844**. Panel selalu mengikuti alur flex; selisih overlap nol (toleransi pembulatan subpiksel). Pada 1024 px, chat 504,4 px dengan kedua panel terbuka dan 986,4 px setelah keduanya disembunyikan. Pada ponsel, chat sekitar 201,3 px dan panel 171,5 px, tanpa overflow dokumen horizontal.
- Bubble Agent menempel di sisi kiri dan pengguna di kanan. Saat panel berubah lebar, sisi bubble tetap mengikuti area chat. Isi log tetap pada lebar target di WebView yang mendukung container queries; shell panel mengatur pemotongan dan animasi. Fallback layout tetap tersedia pada WebView lama.
- Header menampilkan `Personal VPS · SIMULASI` + `Profile: Leveret`, dan bubble balasan memakai `Leveret`. Menu rename conversation tidak ada. Form menampilkan Profile terpisah dari model AI di Advanced.
- Navigasi Terminal → Agent → Connections → Settings memakai fade ringan dan gelombang menu aktif. Draft `/`, pilihan buka/tutup panel, dan komponen Agent tetap terjaga saat berpindah menu. Aturan reduced-motion menonaktifkan animasi/transisi.
- Nama profile Gateway berasal dari metadata `info.profile_name`; `profile_id` dan model tidak dipakai sebagai nama profile. Pengujian memakai mock protokol, **belum diuji dengan Hermes/VPS nyata**. Installer Windows dan APK baru belum dibuat atau divalidasi; batas toolchain native di bawah tetap berlaku.

Hasil berikut merupakan catatan tahap sebelumnya; perilaku drawer/overlay pada catatan lama telah diganti oleh panel berdampingan.

## Slash command, satu ruang chat, dan bahasa — 23 Oktober 2026

- **205 tes frontend dalam 15 berkas lulus**, termasuk protokol Gateway, batas perintah, penyimpanan sesi sebelum pengiriman, pemulihan hasil tidak diketahui, satu ruang chat, dan pergantian bahasa.
- **25 tes alat rilis lulus.** Pemeriksaan TypeScript dan build frontend produksi juga lulus. JavaScript 881,63 KB (gzip 252,46 KB); peringatan ukuran chunk Vite di atas 500 KB masih ada.
- Default antarmuka adalah English. English / Bahasa Indonesia tersedia di Settings → Language. Tes memeriksa pembaruan label dan `html.lang`, penyimpanan pilihan, storage yang tidak tersedia, serta perubahan bahasa tanpa mereset terminal, formulir, draft, atau mengubah payload/pesan Agent.
- Browser diperiksa pada **1280 × 720** dan **390 × 844** dengan fixture data contoh. Sidebar tidak lagi menampilkan Personal workspace, PREVIEW, atau Mode pratinjau. Keterangan demo berada di Settings; konten fixture tetap diberi penanda simulasi.
- Pilihan Indonesia bertahan setelah reload browser. Tampilan Settings mobile tidak mengalami overflow horizontal. Drawer Tool Activity dapat dibuka dan ditutup dengan Escape, fokus kembali ke tombolnya, dan draft `/` tetap ada. Menu slash tampil dalam bahasa antarmuka. Log browser akhir tidak berisi error/warning.
- Panel daftar percakapan dihapus. `/new` membuat sesi baru; pembukaan chat dari Connections melanjutkan chat yang ada. Pilihan terakhir dipulihkan setelah membuka brankas. Riwayat tersimpan tidak dihapus.
- Integrasi mengacu pada Hermes **0.22.4**, canonical Gateway dengan `session_authority` dan `durable-admission-v1`. Pengujian protokol memakai mock transport, **belum terhubung ke VPS/Hermes nyata**.
- **12 tes transport Gateway Rust tersedia tetapi belum dapat dijalankan.** Kompilasi MSVC terhenti sebelum kode aplikasi karena `link.exe` tidak tersedia. Installer Windows, APK, dan penyimpanan native pada perangkat belum tervalidasi untuk perubahan ini. Source belum dipush atau dirilis.
- Source dikemas sebagai ZIP tanpa dependensi/build/cache/kredensial. Tidak disertakan patch yang dapat membawa kembali kredensial lama dari konteks penghapusan dokumentasi.

Lihat [SLASH-COMMANDS.md](SLASH-COMMANDS.md) untuk koneksi Gateway dan [AGENT-WORKSPACE.md](AGENT-WORKSPACE.md) untuk perilaku antarmuka. Hasil di bawah adalah catatan tahap sebelumnya.

## Pembaruan panel Agent — 23 Oktober 2026

- **88 tes dalam 12 berkas lulus**, termasuk log per percakapan, pemulihan status terputus, callback terlambat, panel tersembunyi, akses keyboard log, dan dialog yang dibuka di atas drawer.
- **TypeScript dan build frontend lulus.** JavaScript sekitar 826 KB sebelum gzip; peringatan Vite tentang chunk di atas 500 KB tetap ada.
- Preview nyata komponen aplikasi diperiksa di browser pada ukuran **1280 × 720** dan **390 × 844**, memakai fixture lokal dengan banner **DATA SIMULASI**. Chat pengguna di kanan dan Agent di kiri, lebar chat bertambah saat panel dilipat, draft tetap ada, drawer dapat ditutup dengan Escape, fokus berpindah dengan benar, dan tidak ada overflow horizontal pada ukuran yang diperiksa.
- Dot sesi memiliki animasi pulse; aturan CSS reduced-motion mematikan animasi/transisi. Tidak ada error atau warning di log browser yang diamati pada pemeriksaan akhir.
- Pengujian ini tidak menjalankan Hermes/VPS nyata, build installer Windows baru, atau APK baru. Mock IPC dan data simulasi tidak membuktikan koneksi atau penyimpanan native. Source fitur belum diterbitkan sebagai rilis.

Petunjuk penggunaan dan integrasi patch tersedia di [AGENT-WORKSPACE.md](AGENT-WORKSPACE.md).

## Catatan baseline sebelumnya

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
