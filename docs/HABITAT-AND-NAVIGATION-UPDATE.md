# Habitat Observer dan navigasi Settings

> Arsip tahap desain sebelumnya. Implementasi terbaru memakai habitat pixel art 2.5D dengan area menurut status dan perpindahan berjalan: lihat [LIVING-BURROW.md](LIVING-BURROW.md).

Perubahan ini melanjutkan paket Scheduler dari baseline **v0.6.1**,
`878bfb3c149fd05d8a0adc2c6f592c68665a85f8`. Versi dan application ID tetap.

## Hasil perubahan

- Settings dipisahkan dari navigasi utama dan memakai ikon gear. Pada desktop
  letaknya di bawah sidebar; pada mobile ada di header.
- Fleet Roster Observer menjadi habitat sepuluh kelinci dengan bentuk clay 2.5D,
  shading, bayangan, terowongan, animasi makan/tidur, dan pose review/blocked.
- Ketuk kelinci membuka role, status, tugas aktif, sumber, dan waktu pembaruan.
- Data stale/unknown, penghematan animasi, reduced motion, dua tema, dan tampilan
  mobile ditangani. Tidak ada perubahan kontrak SSH/SQLite atau command server baru.
- Profil yang sudah diedit tidak memakai sesi SSH lama dengan endpoint berbeda.

Lihat [panduan habitat](OBSERVER-HABITAT.md). Panduan Scheduler dan penghapusan
Agent sebelumnya tetap berlaku. Runbooks belum dibuat.

## Cara mengintegrasikan

Paket terbaru menyertakan dua patch alternatif. Terapkan **hanya salah satu**:

1. `warren-habitat-from-878bfb3.patch`: seluruh perubahan Scheduler, penghapusan
   Agent, typography, habitat, dan Settings terhadap baseline repo v0.6.1 yang
   bersih pada commit di atas.
2. `warren-habitat-update.patch`: hanya tambahan habitat/Settings terhadap source
   paket `warren-scheduler-handoff.zip` sebelumnya. Target sebelumnya harus sama
   dengan tree yang dicatat dalam manifest, bukan checkout repo v0.6.1 polos.

```sh
git apply --check <patch-yang-sesuai>
git apply <patch-yang-sesuai>
npm ci
npm test
npm run build
```

`warren-habitat-source.zip` adalah source lengkap yang sudah diperbarui, sebagai
alternatif patch. Jangan menambahkan patch pada ZIP source terbaru yang sudah
memuat perubahan itu. Jika source bot telah berubah, integrasikan manual tanpa
memaksa patch atau mereset pekerjaan yang ada.

Manifest mengikat hash patch, source file, dan ZIP. Fixture visual tidak disertakan
dalam source produksi; screenshot hanya menunjukkan data uji lokal. Tidak ada
token/kunci, dependency, hasil build, atau installer/APK dalam paket.

## Sebelum release

Jalankan CI dan build installer/APK menggunakan toolchain proyek. Periksa
upgrade, fingerprint unlock, updater, dan koneksi SSH pada perangkat sebenarnya.
Pada VPS pengujian, verifikasi transisi running → idle serta blocked/review,
putus/sambung SSH, pergantian orkestrator, dan snapshot kedaluwarsa. Animasi
tidak membuktikan task Hermes sedang berjalan; status tetap berasal dari data.

Perubahan ini belum dipush atau diterbitkan. Pilih nomor versi/tag baru melalui
alur release repository setelah pemeriksaan native berhasil.
