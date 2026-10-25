# Tema dan scroll terminal mobile

## Settings → Theme / Pengaturan → Tema

- **Warren Dark** memakai palet gelap Warren yang ada dan tetap menjadi default.
- **Terracotta** memakai hierarki `#F5EBDD` untuk latar, `#413333` untuk teks, `#F2765E` untuk aksi/penanda aktif, serta `#315B8C` untuk ikon dan aksen sekunder. Surface dan border memakai turunan palet tersebut.
- Ikon umum mengikuti satu aksen per tema: mint pada Warren Dark, biru pada Terracotta. Warna role nama/badge agen di Burrow tetap dibedakan agar identitas spesialis mudah dipindai.
- Pilihan disimpan pada perangkat melalui `warren.theme`, seperti pilihan bahasa. Tema dipulihkan sebelum antarmuka React dibuka, berlaku pada layar brankas, dan tidak membutuhkan perubahan struktur brankas.
- Perubahan tema memperbarui opsi warna xterm yang sedang terpasang. Terminal, buffer, koneksi SSH, dan percakapan tidak dibuat ulang.

Implementasi ada pada `src/lib/theme.ts`, `src/components/ThemePicker.tsx`, dan `src/themes.css`. Ketika penyimpanan browser tidak tersedia, pilihan tetap berlaku untuk sesi aplikasi saat ini.

## Scroll riwayat terminal dengan sentuhan

Viewport xterm 6 bersifat virtual. Gerakan jari harus memperbarui posisi buffer melalui API `scrollLines`, bukan menggulir elemen pembungkus Warren.

`src/lib/terminalTouch.ts` memasang listener sentuh pada masing-masing terminal:

- Satu jari yang bergerak vertikal menggulir riwayat buffer normal.
- Gerakan kecil diakumulasi ke tinggi baris terminal yang sedang dirender.
- Tap tetap dapat memfokuskan terminal; swipe tidak menghasilkan klik sintetis yang membuka keyboard.
- Gerakan horizontal, pinch dua jari, buffer tanpa riwayat, dan alternate screen tidak diambil alih oleh penggulir riwayat ini.
- Listener dilepas bersama sesi terminal. Gerakan scroll tidak mengirim input ke server.

CSS `touch-action: pinch-zoom` memastikan WebView tidak mengambil alih gerakan pan vertikal, sambil tetap mengizinkan pinch. Wheel/mouse dan tombol pintas terminal tetap memakai penanganan xterm yang sudah ada.

## Validasi

Dropdown sumber VPS, filter agen, jenis koneksi, dan riwayat terminal menggunakan `SelectMenu` bersama. Daftar tampil dalam portal agar tidak terpotong panel, mengikuti posisi trigger saat resize/scroll, bergeser agar tetap di dalam layar, dan membuka ke atas jika ruang bawah terbatas. Komponen mendukung Arrow/Home/End, Enter, Escape, Tab, pencarian lewat ketikan, pilihan disabled, dan penutupan saat klik di luar.

Tes memeriksa persistensi tema, pemulihan preferensi, kegagalan local storage, perubahan warna tanpa reset terminal, swipe dua arah, tap/pinch, akumulasi gerakan kecil, alternate screen, dan cleanup listener. Pemeriksaan UI dilakukan pada desktop dan mobile di browser. Pengujian pada perangkat Android/Windows native tetap diperlukan; lingkungan pengerjaan tidak menyediakan toolchain Rust/Cargo atau perangkat Android.
