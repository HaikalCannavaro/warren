# Pixel Warren — fleet, status, dan sumber data

## Hierarki dan visual

Observer menampilkan satu sarang **pixel art** dengan **11 kelinci**: Leveret
sebagai orchestrator di tengah atas, dan sepuluh spesialis di bawahnya. Pada
desktop, dua cabang dari Leveret dibuat simetris ke kiri/kanan. Pada mobile,
satu poros turun lurus dari Leveret ke tengah. Seluruh terowongan digambar
sebagai jaringan SVG yang sama agar dinding tidak menutup persimpangan.

Posisi sambungan mengikuti letak liang yang benar-benar dirender melalui
ResizeObserver. Pada desktop, dua poros simetris melewati sela kolom. Pada mobile,
satu koridor dari Leveret melewati sela kedua kolom dan bercabang
ke kiri/kanan pada setiap tingkat. Label tidak dijadikan jalur terowongan.

Sprite memakai grid 56×48 dengan tepi tajam dan gerakan CSS bertahap. Ukuran
gambar mobile menjadi 112×96; nama agen tetap 12 px, status 11 px, dan subteks
role 12 px. Panel/detail mengikuti tema Dark dan Terracotta. Permukaan memakai
rumput hijau terang, tanah coklat, dinding liang berwarna pasir, dan interior
terowongan gelap. Nameplate serta warna role tetap kontras pada kedua tema.
Sudut atas desktop memakai satu polyline bersambung dengan miter join agar
border luar siku tidak terpotong. Tidak ada aset raster, model 3D, WebGL, atau
library animasi tambahan.

Settings tetap terpisah dari menu utama, menggunakan gear di bawah sidebar atau
pada header mobile. Burrow tetap merupakan pembaca log A2A.

## Daftar dan role

Roster dan role didefinisikan bersama pada `src/lib/fleet.ts`, mengikuti daftar
pengguna. Observer, filter assignee, habitat, dan filter/transkrip Burrow memakai
daftar yang sama. Ini belum merupakan discovery roster otomatis dari VPS.

| Agen | Role |
|---|---|
| Leveret | Chief of Staff & Quality Governor — orchestrator |
| Aurora | Product & UX Design Direction |
| Frame | Frontend Implementation |
| Lens | Independent Rendered Visual QA |
| Forge | Backend & Systems Engineering |
| Prism | Functional QA & Algorithmic Correctness |
| Sentinel | Security, Threat & Hardening |
| Atlas | Infrastructure, SRE & Operations |
| Radar | Technical Research & Intelligence |
| Quant | Quantitative Research & Market Analysis |
| Nexus | Operations, Documentation & Coordination |

## Sumber status sebenarnya

Warren membaca `/root/.hermes/kanban.db` melalui SSH dari **Orchestrator Host**
yang dipilih di Observer. Query bersifat read-only dan membaca `assignee`,
`status`, serta `title` dari tabel `tasks`. Mengubah target hardware tidak
mengubah sumber fleet secara diam-diam.

Status adalah hasil agregasi task yang tercatat dalam Kanban. Aktivitas worker
yang tidak dicatat ke database belum terlihat oleh indikator ini. Roster tidak
mengambil status dari fitur Agent Chat yang sudah dihapus.

## Lima status dan prioritas perhatian

Prioritas: **BLOCKED > WORKING > IN REVIEW > QUEUED > IDLE**.

| Status | Kondisi | Badge | Animasi |
|---|---|---|---|
| BLOCKED | Minimal satu task blocked | Merah | Mengangkat tanda bantuan dan menoleh |
| WORKING | Ada task running, tanpa blocked | Hijau | Mengunyah wortel dan gerakan telinga |
| IN REVIEW | Ada review, tanpa blocked/running | Amber | Membaca lembar hasil kerja |
| QUEUED | Ada ready/todo/scheduled, tanpa status di atas | Biru muda | Menunggu dengan jam pasir dan gerakan telinga |
| IDLE | Tidak ada task aktif atau antrean | Abu-abu | Tidur dan bernapas perlahan |

Triage, done, dan archived tidak dihitung sebagai pekerjaan aktif atau antrean
dispatch. Jika ada beberapa task, semua task aktif/antrean tetap ada di detail;
badge utama mengikuti prioritas di atas. Satu agen tetap hanya memiliki satu kelinci.

## Task Ledger

Ledger mengenali **triage, todo, scheduled, ready, running, blocked, review,
done, archived**. Status yang belum dikenal tetap dipertahankan sebagai teks
server dengan indikator unknown, bukan diubah menjadi done.

Filter status dan assignee berlaku pada 25 entri terbaru yang dibaca. Archived
disembunyikan secara default dan dikeluarkan **sebelum LIMIT 25** pada query
server. Toggle **Show archived** membaca 25 entri terbaru termasuk arsip. Mematikan
toggle mengembalikan filter Archived ke All statuses dan membatalkan pembacaan
arsip yang lama. Respons terlambat dari mode lain diabaikan.

Toggle tersebut hanya mengatur pembacaan. Warren tidak menghapus, mengarsipkan,
memindahkan kolom, atau mengubah status task pada VPS. Query fleet terpisah dari
ledger dan tidak dibatasi 25 task.

## Siklus pembaruan dan aksesibilitas

- **Auto-poll 10 detik**, aktif secara default; Refresh Data tetap tersedia.
- Pembacaan yang masih berjalan tidak ditumpuk. Saat halaman tersembunyi, tidak
  ada poll baru; perpindahan host/mode membatalkan request yang tidak relevan.
- Snapshot 60 detik, error, atau sumber offline ditandai stale/unknown. Data yang
  gagal dibaca tidak dianggap idle.
- Animasi berhenti saat stale, loading, tersembunyi, di luar viewport, atau dialog
  terbuka. Pause manual dan preferensi reduced motion perangkat dihormati.
- Ketuk/klik kelinci membuka role lengkap, scope, seluruh task aktif/antrean,
  sumber, dan timestamp WIB. Fokus kembali ke kelinci setelah dialog ditutup.
- Screenshot/preview browser untuk pemeriksaan desain memakai fixture lokal;
  fixture tidak disertakan dalam source produksi dan bukan status VPS pengguna.

## Validasi dan batas

Tes frontend mencakup agregasi status, Nexus, semua status ledger, mode arsip,
cancellation, interval 10 detik, interaksi detail, timer, dan konektivitas jaringan
terowongan. Tes SQLite mengeksekusi query aktual dari Rust pada database dalam
memori, termasuk kasus banyak arsip yang tidak boleh menggeser task aktif.

Build Rust/Android, pemasangan APK, dan pembacaan VPS nyata belum divalidasi pada
lingkungan pengerjaan ini. Gunakan pipeline native dan perangkat sebelum rilis.
