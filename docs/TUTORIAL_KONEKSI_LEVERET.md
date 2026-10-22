# Panduan Menghubungkan Profil Leveret ke Aplikasi Warren

Dokumen ini memandu langkah-langkah menghubungkan aplikasi **Warren** ke profil agen **Leveret** yang berjalan di VPS Anda via Cloudflare Tunnel HTTPS.

---

## 1. Konfigurasi Server (Sudah Terpasang di VPS)

* **Domain Endpoint (HTTPS):** `https://leveret.unlessrabbit.my.id/v1`
* **Port Lokal:** `8642` (di-forward oleh Cloudflare Tunnel)
* **Model Name:** `leveret`
* **API Token (`API_SERVER_KEY`):** `6f421c87eac3cbe4e987e1db24e2139e`

---

## 2. Mengaktifkan Gateway API Server di VPS

Konfigurasi `.env` untuk API server sudah disiapkan di VPS (`/root/.hermes/profiles/leveret/.env`). Agar service gateway memuat variabel ini dan membuka port 8642:

1. Buka Warren, lalu buka tab **Terminal** dan hubungkan SSH ke VPS Anda.
2. Jalankan perintah berikut di terminal:
   ```bash
   hermes gateway restart
   ```
3. Verifikasi port sudah aktif:
   ```bash
   curl -I https://leveret.unlessrabbit.my.id/v1/models
   ```
   *(Harus mengembalikan HTTP 401 Unauthorized jika tanpa token, atau HTTP 200 OK jika dengan Bearer token).*

---

## 3. Langkah Input di Aplikasi Warren (Windows)

1. Buka aplikasi **Warren** di PC/Laptop Anda.
2. Buka brankas menggunakan master password Anda (minimal 12 karakter).
3. Masuk ke menu **Koneksi** (ikon Network di navigasi kiri).
4. Di bagian **Hermes / Agent**, klik tombol **+ Agent** atau **Koneksi Agent**.
5. Isi formulir dengan data berikut:
   * **Nama koneksi:** `Leveret`
   * **URL server:** `https://leveret.unlessrabbit.my.id/v1`
   * **API token:** `6f421c87eac3cbe4e987e1db24e2139e`
   * **Model:** `leveret`
6. Klik **Simpan Agent**.
7. Pada kartu koneksi Leveret yang baru muncul, klik tombol **Tes endpoint**. Indikator akan menunjukkan koneksi berhasil.
8. Buka tab **Agent** (ikon Kelinci 🐰) di navigasi kiri. Klik **Percakapan baru** dan pilih **Leveret**. Anda sekarang bisa langsung berdiskusi dengan Leveret!
