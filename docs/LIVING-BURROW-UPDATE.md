# Paket Warren Unified Burrow

Baseline repository tetap **v0.6.1 / 878bfb3c149fd05d8a0adc2c6f592c68665a85f8**.
Version metadata dan application ID tidak diganti. Source lengkap juga memuat
Scheduler, penghapusan Agent Chat, Settings terpisah, dan perubahan Pixel Fleet
yang sudah disiapkan pada tahap sebelumnya.

Revisi terbaru memperhalus liang dan tunnel menjadi satu habitat tanah yang
menyatu, sementara kelinci, pohon, dan rumput tetap pixel art. Kelima liang
memakai kurva organik yang halus. Liang Teduh bergeser ke tengah bawah dan
tersambung langsung ke Liang Mimpi serta Pos Bantuan.

Dinding, rim dan lantai memakai gabungan bentuk SVG dan satu pewarnaan per
lapisan pada seluruh jaringan, sehingga sambungan tidak memiliki garis potong
atau perubahan warna sendiri. Mulut tunnel melebar halus ke ruang liang.
Pintu di permukaan menjadi lubang oval pada rumput dengan bibir tanah dan
bayangan, tanpa mengubah jalur masuk kelinci.

Kapasitas dihitung dari kurva ruang dan batas elemen yang terlihat. Sebelas
Idle tetap dibagi acak dan stabil menjadi 6-5. Jalur animasi memakai jaringan
serta titik tikungan yang sama dengan gambar. Tanpa data, kelinci tetap di
teras permukaan, sehingga jumlah liang selalu lima.

Kanvas 1040 px, bentuk organik, kedalaman 2.5D, animasi berjalan, Pas layar,
1:1, zoom dan panning tetap tersedia. Mobile memakai geometri desktop yang
diperkecil merata. Sumber data dan auto-poll 10 detik tidak berubah.

Panduan perilaku lengkap: [LIVING-BURROW.md](LIVING-BURROW.md).

## Pilih satu cara integrasi

- `warren-unified-burrow-from-878bfb3.patch`: diterapkan ke checkout bersih baseline
  repository di atas; mencakup seluruh perubahan kumulatif.
- `warren-unified-burrow-update.patch`: diterapkan ke source tepat dari
  `warren-reference-burrow-source.zip` sebelumnya, dengan tree asal dalam manifest.
- `warren-unified-burrow-source.zip`: source lengkap yang sudah diperbarui;
  tidak perlu menerapkan patch lagi ke ZIP tersebut.

Jangan memaksa patch di atas perubahan bot yang berbeda. Periksa terlebih dahulu:

```sh
git apply --check <patch-yang-sesuai>
git apply <patch-yang-sesuai>
npm ci
npm test -- --maxWorkers=2
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
```

Delta dari paket Reference Burrow hanya frontend dan dokumentasi. Query/bridge
native sebelumnya tetap disertakan dan belum dikompilasi pada lingkungan ini.
Jalankan pipeline native serta uji Windows/Android dan SSH pada host pengujian
sebelum merilis. Versi/tag ditentukan melalui alur release repository.

Paket berisi manifest hash, dua patch, source, panduan, dan screenshot data uji.
Tidak memuat fixture preview, node_modules, hasil build, kunci Firebase, atau
konfigurasi token. Tidak ada push, release, atau perubahan layanan VPS.
