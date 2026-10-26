# Living Burrow di Observer

Fleet Roster memadukan **kelinci pixel art dan habitat organik halus 2.5D**:
pohon, rumput hijau, lapisan tanah coklat, bibir liang, bayangan tegas, dan
jaringan terowongan berkelok. Rongga memiliki kontur membulat tidak beraturan,
ukuran berbeda, dan posisi berselang-seling, menggantikan ruangan persegi yang
tersusun simetris. Ini memakai SVG/CSS dan tidak menambahkan WebGL,
model 3D, gambar AI, atau dependency animasi.

## Nama area dan status

| Status nyata | Nama Indonesia | Nama Inggris | Aktivitas |
|---|---|---|---|
| WORKING | Padang Wortel | Carrot Meadow | Berjalan pendek di rumput, lalu makan wortel |
| IDLE | Liang Mimpi | Dream Burrow | Tidur dan bernapas perlahan |
| IDLE | Liang Teduh | Quiet Burrow | Liang tidur kedua; berbagi penghuni dengan Liang Mimpi |
| QUEUED | Liang Siaga | Standby Den | Menunggu dengan jam pasir |
| IN REVIEW | Ruang Telaah | Review Nook | Membaca hasil kerja |
| BLOCKED | Pos Bantuan | Help Hollow | Mengangkat tanda bantuan dan menoleh |
| Belum ada data | Teras Koneksi (permukaan) | Signal Porch | Menunggu pembacaan sumber; bukan liang tambahan |

Papan area mencantumkan nama, status, dan jumlah agen tujuan sesuai snapshot.
Nama dan badge status tetap ikut setiap kelinci. Bahasa nama mengikuti Settings.
Leveret tetap orchestrator dengan mahkota; sepuluh spesialis tetap memiliki
identitas dan warna role sendiri. **Semua agen, termasuk Leveret, sekarang
berpindah menurut status**, menggantikan posisi hierarki statis desain sebelumnya.

Kelinci Idle dibagi acak tetapi seimbang antara **Liang Mimpi dan Liang Teduh**.
Jika seluruh sebelas agen Idle, pembagiannya 6-5. Pilihan liang tetap stabil
selama habitat terpasang; auto-poll tidak mengacak ulang. Saat ada agen masuk
atau keluar dari Idle, penghuni lama dipertahankan sejauh mungkin dan hanya
penyesuaian minimum dilakukan agar selisih populasi paling banyak satu.
Pembagian ini bersifat visual per sesi habitat, tidak mengubah data agen.

Totalnya selalu **lima liang bawah tanah**. Susunannya mempertahankan empat
posisi organik awal: Liang Siaga di kiri atas, Ruang Telaah di kanan atas,
Pos Bantuan di kiri tengah, dan Liang Mimpi di posisi bekas Pos Bantuan kanan
bawah. Liang Teduh berada agak ke tengah bawah, tersambung langsung ke
Liang Mimpi dan Pos Bantuan. Ketika data belum tersedia, kelinci menunggu di Teras
Koneksi di permukaan; tidak dibuat liang keenam dan statusnya tidak dianggap Idle.

Kapasitas setiap liang dihitung dari kontur udara SVG yang benar-benar digambar.
Area papan, sprite, nameplate, dan alas tidur ditempatkan di dalam kontur
dengan jarak aman; tinggi rongga bertambah bila perlu. Yang diuji adalah batas
elemen yang terlihat, sehingga sudut kosong pembungkus tidak memperbesar liang.
Baris terakhir dengan satu kelinci dipusatkan. Pengecekan meliputi
lekukan dinding, bukan hanya empat sudut kotak pembatas. Tidak ada clipping
untuk menyembunyikan kelinci yang tidak muat. Slot sprite tetap 128 px dan
tinggi baris 150 px pada kanvas asli. Posisi dapat dirapikan langsung ketika
ukuran liang berubah, sementara perpindahan tujuan liang tetap beranimasi.

## Perpindahan

Pada perubahan status yang terkonfirmasi, kelinci berjalan dari posisi saat ini
melalui jaringan terowongan ke area tujuan. Graf memilih jalur terpendek
pada tunnel yang terlihat, termasuk dua sambungan ke Liang Teduh. Badge segera
mencerminkan status baru; tulisan **Di perjalanan / On the way** terlihat selama
perpindahan. Sosok berjalan dipakai saat transit dan pose aktivitas dipakai
setelah tiba. Label tidak dicerminkan saat arah kelinci berubah.

Perubahan status di tengah perjalanan menghitung ulang rute dari posisi saat itu,
tanpa kembali melompat ke posisi awal. Poll berulang dengan status/posisi sama
tidak mengulang perjalanan. Ukuran ruangan menyesuaikan jumlah penghuninya.
Desktop dan mobile memakai kanvas logis yang sama, selebar **1040 px**. Mobile
hanya memperkecil skala seluruh kanvas: bentuk, susunan, proporsi rongga,
terowongan, posisi kelinci dan jalur perjalanan tidak disusun ulang.

**Pas layar / Fit** menyesuaikan skala otomatis terhadap lebar panel. Semua
elemen, termasuk teks, ikut diperkecil pada tampilan ringkas ini. Tombol **1:1**
mengembalikan ukuran asli (nama 12 px dan status 11 px); tombol plus/minus
menyesuaikan pembesaran hingga 150%. Ketika diperbesar, peta bisa digeser secara
horizontal dan vertikal di panelnya sendiri tanpa melebarkan halaman. Kontrol
zoom tetap berukuran normal, dengan target sentuh mobile setinggi 44 px.

Kontur liang memakai kurva kuadratik tertutup yang halus. Kelincinya, pohon,
dan rumput tetap memakai gaya pixel art. Batas kurva yang sama disampel untuk
memastikan papan, sprite, nameplate dan alas tidur tetap di dalam rongga;
pemeriksaan juga menangani lekukan diagonal. Layout numerik memakai cache
terbatas 256 entri, tanpa menyimpan data koneksi atau agen di cache tersebut.

Dinding, bibir tanah, dan lantai memakai **bidang gabungan SVG** yang sama untuk
liang serta tunnel. Setiap lapisan dicat sekali pada seluruh gabungan bentuk,
sehingga tidak ada warna atau garis batas tersendiri di titik pertemuan.
Mulut tunnel melebar halus ke dalam liang; detail lantai tidak melintang di
sambungan. Pintu atas berupa lubang oval di rumput dengan bibir tanah, bayangan,
dan rumput di tepinya, memakai titik masuk yang sama dengan jalur kelinci.
Tidak ada filter blur, WebGL, atau gambar raster tambahan.

Jaringan utama empat liang tetap berkelok sesuai desain acuan. Liang Teduh
bergeser ke tengah bawah dan memiliki sambungan ke Liang Mimpi serta Pos
Bantuan. Tikungan tunnel disampel lebih rapat dengan koordinat pecahan agar
lengkungan halus; titik yang sama dipakai oleh gambar dan animasi kelinci.
ResizeObserver mengukur ulang posisi rongga setelah tata letak berubah.

Animasi dijeda saat manual pause, stale/error/loading, halaman tersembunyi,
habitat keluar viewport, atau dialog detail dibuka. Frame terjadwal dibatalkan
saat pause/unmount. Setelah dilanjutkan, waktu yang terlewat tidak digunakan
untuk melompat maju. Preferensi reduced motion memasang kelinci langsung di
tujuan. Perubahan lebar layar atau zoom tidak mengulang perjalanan dan tidak
mengganti geometri kanvas. Data pertama atau kehilangan data tidak
mengarang perjalanan dari/ke Teras Koneksi.

## Data dan batas

Roster tetap satu Leveret + sepuluh spesialis dari `src/lib/fleet.ts`.
Status berasal dari Kanban SQLite melalui SSH **Orchestrator Host** di Observer,
dengan prioritas blocked > running > review > queued > idle. Auto-poll tetap
10 detik. Perubahan ini hanya visual; tidak memulai tugas, mengubah status,
atau menulis ke database VPS. Hitungan papan adalah jumlah agen tujuan,
bukan deteksi fisik lokasi worker.

Detail kelinci tetap memuat role, scope, task, sumber, dan timestamp WIB.
Burrow pada menu navigasi tetap pembaca log A2A.

Pemeriksaan browser dan screenshot memakai fixture lokal yang tidak dikemas
ke source produksi. Native Windows/Android dan VPS sebenarnya tidak dijalankan
pada tahap desain ini. Lihat [TESTING.md](TESTING.md) untuk hasil validasi.
