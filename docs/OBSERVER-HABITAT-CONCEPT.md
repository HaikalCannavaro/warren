# Konsep habitat kelinci di Observer

Dokumen ini adalah arsip usulan awal. Habitat 2.5D dan animasi telah diimplementasikan; perilaku yang benar-benar tersedia dijelaskan pada [OBSERVER-HABITAT.md](OBSERVER-HABITAT.md). Tautan detail ke Burrow dan penemuan roster dinamis masih usulan.

## Letak dan tujuan

Habitat berada di **Observer** sebagai visualisasi fleet. Warren/Burrow menjadi
inspirasi bentuk sarang, liang, dan area makan kelinci; menu **Burrow** tetap
menampilkan log komunikasi A2A. Hardware telemetry dan task ledger Observer tetap
tersedia. Habitat tidak membutuhkan Agent Chat.

## Satu agen, satu kelinci

Jumlah kelinci mengikuti roster, bukan jumlah task aktif. Roster saat ini memiliki
10 agen: Leveret, Forge, Atlas, Frame, Aurora, Prism, Lens, Sentinel, Radar, dan Quant.
Karena itu tampil 10 kelinci, termasuk agen idle. Jika roster berubah, jumlahnya
mengikuti perubahan tersebut.

Setiap kelinci memiliki identitas agen yang stabil, label nama, dan badge status.
Agen yang mengerjakan beberapa task tetap memiliki satu kelinci; jumlah task dan
daftarnya ditampilkan pada detail agen.

## Perilaku sesuai status

| Status fleet | Usulan pose | Informasi yang tetap terlihat |
|---|---|---|
| Running / working | Makan wortel dengan gerakan kecil | Nama agen dan tugas berjalan |
| Idle | Tidur di sarang dengan napas pelan | Idle / siap menerima tugas |
| Review | Duduk terjaga di samping hasil kerja | Menunggu peninjauan |
| Blocked | Berhenti beraktivitas dengan penanda hambatan | Tugas yang terblokir |
| Offline / unknown | Pose netral dengan indikator koneksi tidak tersedia | Status belum dapat dipastikan |

Kegagalan polling atau SSH tidak boleh mengubah agen menjadi idle. Tampilkan data
terakhir sebagai **kedaluwarsa** bila tersedia, tandai sumber offline, dan hentikan
animasi status sampai data kembali terkonfirmasi. Untuk agen dengan beberapa
task, gunakan aturan agregasi status fleet yang konsisten dan tampilkan status
task lain di detail.

Data habitat mengikuti **sumber orkestrator fleet di Observer**, memakai siklus
refresh dan auto-poll yang sama. Mengganti target hardware tidak memindahkan sumber
status kelinci ke server lain secara diam-diam.

## Interaksi

Klik atau ketuk kelinci untuk membuka panel detail: nama agen, status, judul task,
jumlah task aktif, dan waktu pembaruan terakhir. Sediakan tautan **Buka log A2A**
menuju Burrow dengan konteks agen/task yang relevan. Tidak ada perintah server yang
dijalankan hanya karena kelinci diketuk.

## Visual dan aksesibilitas

Usulan MVP memakai ilustrasi **2D SVG dengan animasi CSS**: aset ringan, tajam pada
berbagai ukuran layar, dan mudah menyesuaikan dua tema Warren. Gaya ilustrasi ini
masih proposal; belum ada pilihan final antara ilustrasi lembut, pixel art, atau
isometrik.

Warna sarang, panel, dan teks mengikuti token tema. Identitas spesialis memakai
aksen role yang sudah ada pada fleet; status tetap ditulis agar tidak bergantung
pada warna. Pada mobile, gunakan susunan dua kolom atau area habitat yang dapat
digulir vertikal, nama/status yang terbaca, dan target ketuk minimal 44 px.
Informasi penting selalu tersedia melalui ketukan, bukan hanya hover.

Hormati **reduced motion** dengan pose statis. Jeda animasi ketika halaman/app
tersembunyi dan saat panel habitat tidak terlihat untuk menghemat baterai. Animasi
hanya merepresentasikan status yang telah diterima; tidak menjadi penentu status.

## Pemeriksaan saat implementasi nanti

- Roster 10 agen menghasilkan 10 kelinci, termasuk ketika semua agen idle.
- Beberapa task untuk satu agen tidak menambah karakter baru.
- Working menampilkan makan; idle menampilkan tidur; review/blocked tetap berbeda.
- Data offline atau kedaluwarsa tidak ditampilkan sebagai idle.
- Pergantian sumber fleet tidak mencampurkan status dari host sebelumnya.
- Detail dan log A2A dapat diakses dengan keyboard maupun sentuhan.
- Kedua tema, layar mobile, reduced motion, dan jeda animasi diperiksa sebelum rilis.
