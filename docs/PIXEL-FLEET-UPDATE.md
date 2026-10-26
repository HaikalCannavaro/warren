# Paket Pixel Fleet Warren

Perubahan ini melanjutkan paket habitat sebelumnya, dari baseline repository
**v0.6.1 / `878bfb3c149fd05d8a0adc2c6f592c68665a85f8`**. Version metadata dan
application ID `dev.harbor.workspace` tidak dinaikkan atau diganti.

## Perubahan

- Habitat clay diganti pixel art; sprite mobile lebih kecil, teks tetap terbaca.
- Rumput hijau dan tanah coklat, dengan dinding terang serta interior gelap.
- Leveret di tengah atas: dua cabang simetris di desktop, satu poros tengah
  di mobile. Terowongan
  mengikuti posisi liang dan memakai satu jaringan, tanpa dinding penutup di
  pertemuan jalur horizontal/vertikal.
- Roster menjadi 1 orchestrator + 10 spesialis, termasuk Nexus. Role diperbarui
  sesuai daftar pengguna; Observer dan Burrow berbagi sumber daftar yang sama.
- Lima status memiliki animasi dan badge berbeda, dengan prioritas
  blocked → running → review → queue → idle.
- Ledger mendukung sembilan status, filter lengkap, dan toggle arsip read-only.
- Query native diperluas untuk status antrean serta mode arsip. Auto-poll tetap
  **10 detik**, aktif secara default.

Lihat [panduan Pixel Fleet](PIXEL-FLEET.md). Scheduler, penghapusan Agent Chat,
serta Settings gear terpisah dari tahap sebelumnya tetap disertakan.

## Memilih patch

Terapkan **satu** patch sesuai source bot saat ini:

- `warren-pixel-fleet-from-878bfb3.patch`: seluruh perubahan terhadap checkout
  bersih baseline repo di atas.
- `warren-pixel-fleet-update.patch`: tambahan terhadap source tepat dalam
  `warren-habitat-handoff.zip` sebelumnya; tree asal tercantum di manifest.

```sh
git apply --check <patch-yang-sesuai>
git apply <patch-yang-sesuai>
npm ci
npm test
npm run build
python -m unittest discover -s scripts -p test_observer_queries.py -v
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

ZIP source terbaru sudah berisi seluruh perubahan; jangan menerapkan patch lagi
di atas ZIP itu. Jika bot sudah memiliki perubahan sendiri, integrasikan manual
tanpa memaksa patch atau mereset pekerjaan yang ada.

## Sebelum rilis

Perubahan mencakup bridge Rust Observer: parameter boolean opsional
`includeArchived` memilih salah satu query tetap. Periksa build Windows/Android
dan kompatibilitas pemanggilan lama tanpa parameter tersebut. Tidak ada SQL
buatan pengguna yang diterima dari UI.

Uji schema Kanban nyata pada VPS pengujian: ready/todo/scheduled harus menjadi
Queued, running mengalahkan review, dan blocked mengalahkan semuanya. Periksa
semua opsi ledger, arsip default tersembunyi, host berubah, serta putus koneksi.
Uji pada mobile minimal 320/390 px dan pastikan jalur terowongan tidak menimpa
label. Tes lokal memakai fixture dan SQLite dalam memori; bukan VPS pengguna.

Paket tidak menyertakan token, konfigurasi Firebase asli, dependency, fixture
visual, hasil build, atau installer/APK. Naikkan versi/tag melalui alur release
repository setelah pemeriksaan native berhasil. Tidak ada push/release atau
perubahan layanan VPS yang dilakukan dalam pengerjaan ini.
