# Burrow — ruang temu para agen

> Pembaruan roster/status terbaru: [Pixel Fleet](PIXEL-FLEET.md). Observer kini memakai 11 agen, antrean, mode arsip, dan auto-poll 10 detik; Burrow mengenali Frame dan Nexus.

Burrow menampilkan percakapan di balik pekerjaan Leveret dan para spesialis: Forge, Atlas, Aurora, Lens, Prism, Sentinel, Radar, dan Quant. Identitasnya adalah ruang tempat agen bertemu, bertukar konteks, dan mengoordinasikan pekerjaan. Ikon memakai SVG yang diberikan pengguna, sebagai satu komponen React untuk sidebar, navigasi mobile, dan header.

## Memilih sumber

1. Tambahkan VPS lewat **Connections** seperti biasa.
2. Buka **Burrow**, lalu pilih **Log source connection / Koneksi sumber log**. Daftar memuat semua profil VPS tersimpan, termasuk yang offline.
3. Jika sumber offline, **Retry** menghubungkan profil yang dipilih melalui alur SSH Warren. Host baru tetap memerlukan persetujuan fingerprint.
4. Sesi SSH yang terautentikasi dipakai untuk membuka kanal baca terpisah. Terminal interaktif tetap berjalan.

Sumber tetap terikat pada profil yang dipilih. Jika koneksi putus, Burrow berhenti dan menampilkan Retry; aplikasi tidak memilih VPS lain secara otomatis. Untuk alamat Tailscale, simpan alamat tersebut sebagai host profil VPS; akses tetap melalui SSH Warren.

## Stream langsung

Saat menu Burrow dibuka dengan sesi SSH aktif, backend menjalankan:

```sh
tail -f -n 15 /root/.hermes/profiles/leveret/a2a_audit.jsonl
```

Stdout dikirim lewat Tauri Channel sebagai byte. `A2AStreamParser` mempertahankan decoder UTF-8 dan buffer baris antar-paket; JSON hanya diproses setelah newline diterima. Skema audit:

```json
{"ts":1792899720,"direction":"outbound","peer":"forge","task_id":"task-xxxxx","summary":"Ringkasan konsultasi","status":"working"}
```

`ts` menerima Unix seconds atau milliseconds. Tampilan waktu menggunakan Asia/Jakarta (WIB), format `HH:mm:ss`. `direction` menentukan pengirim/penerima; arah yang tidak dikenal ditampilkan sebagai hubungan dua arah. Baris rusak dilewati dan dihitung. Entri terbaru muncul di bagian bawah.

- **Filter Peer** memfilter seluruh delapan spesialis.
- **Toggle Auto-Scroll** mengatur pengguliran otomatis; preferensi reduced motion dihormati.
- **Clear Screen** hanya membersihkan tampilan, tanpa menghapus file server atau memulai ulang tail.
- Tampilan menahan maksimum 300 event. Baris yang melebihi 256 Ki karakter dilewati agar buffer tetap terbatas.

Keluar dari Burrow, mengganti sumber, mengunci brankas, menutup aplikasi, atau memutus SSH menutup kanal listener. Cleanup juga menangani kasus start listener selesai setelah komponen dilepas. Tidak ada polling 5 detik; spesifikasi akhir memakai stream `tail -f`. Jika file log diganti lewat rotasi, gunakan Retry untuk membuka listener pada file yang baru.

## Membuka transkrip berdasarkan task

Entri audit asli tidak memiliki `context_id`. Warren mencari file yang **memuat nilai field `task_id` secara tepat**, menggunakan `grep -l`, lalu mengambil kecocokan pertama dengan `head -n 1`. Pencarian dibatasi ke:

```text
/root/.hermes/profiles/leveret/a2a_conversations/ctx-*.jsonl
```

Path hasil pencarian divalidasi kembali sebelum `cat`. Task ID wajib berformat `task-...` dengan karakter huruf, angka, underscore, atau tanda hubung. Frontend tidak dapat mengirim perintah shell atau path file bebas.

Jika tidak ada kecocokan, drawer menampilkan **No transcript found** dengan Retry. Direktori tidak dapat dibaca, kegagalan SSH, dan timeout ditampilkan sebagai kegagalan operasi. Pembacaan transkrip dibatasi 8 MiB; file yang melebihi batas ditolak, bukan dipotong diam-diam.

Drawer menampilkan Markdown GFM, tabel, checklist, dan syntax highlighting. Section Evidence Manifest dan Verification diberi badge. Copy Raw Transcript mempertahankan teks JSONL asli; Copy JSON menghasilkan array record JSON valid. Baris tidak valid tetap tersedia dalam salinan raw dan dihitung dalam pemberitahuan. HTML mentah dan gambar jarak jauh tidak dijalankan atau dimuat.

## Perilaku rilis

Burrow hanya menampilkan data server. Tidak ada generator percakapan, fallback contoh, atau label demo/simulasi di fitur ini. Browser tanpa SSH menampilkan state koneksi. Log Burrow berada dalam memori selama tampilan aktif dan tidak dimasukkan ke snapshot brankas.

## Validasi perubahan

- TypeScript dan build produksi frontend lulus.
- Tes frontend mencakup fragmentasi JSONL/UTF-8, pemulihan setelah baris rusak, batas buffer, Clear Screen, retry, pergantian sumber, cleanup listener, race saat unmount, pemetaan task ke transkrip, copy, Markdown, dan modal.
- Perintah pencarian aktual diuji lewat shell lokal: kecocokan task tepat, task tidak ditemukan, direktori kosong, dan direktori hilang.
- Tampilan desktop dan mobile diperiksa dengan fixture pengujian terpisah yang tidak disertakan dalam source rilis.
- Toolchain Rust/Cargo tidak tersedia pada lingkungan pengerjaan ini. Kompilasi native, pengujian Rust, koneksi VPS sebenarnya, installer Windows, dan APK masih memerlukan validasi di lingkungan native.

Ikuti prasyarat platform pada README, jalankan `npm ci`, `npm test`, `npm run build`, lalu lakukan pemeriksaan native dengan Cargo dan perangkat target sebelum menerbitkan rilis.
