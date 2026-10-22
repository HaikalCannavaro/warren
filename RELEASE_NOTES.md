# Warren v0.2.1

Rilis resmi Warren v0.2.1 — Personal Workspace untuk SSH Terminal & Hermes Agent Companion.

### Pembaruan & Fitur Baru (v0.2.1):
- **Android APK Release Distribution**: Pipeline otomatis untuk build dan signing APK rilis Android (`Warren-0.2.1-android.apk`) beserta manifest pembaruan (`android.json`).
- **Tag-Driven CI/CD & Version Integrity**: Workflow rilis GitHub Actions multi-platform berbasis tag git (`v*`) dengan validasi integritas versi numerik (versionCode 2001), pencegahan downgrade/penimpaan rilis yang sudah ada, dan perlindungan immutability v0.2.0.
- **Enhanced Agent UI & Companion**: Panel aktivitas alat (Tool Activity Panel) interaktif dengan pelacakan status runtime, dukungan slash commands (`/clear`, `/help`, dll.), dan antarmuka bilingual (Bahasa Indonesia & English) yang dapat diganti di Pengaturan tanpa mereset sesi terminal atau agent.
- **Leveret Agent Integration**: Dokumentasi dan konfigurasi panduan koneksi profil agent Leveret untuk interaksi workspace.
- **Multi-Session Terminal & Vault**: Peningkatan stabilitas tab terminal xterm.js v6 dengan manajemen PTY, paste protection, dan brankas lokal Stronghold terenkripsi Argon2.
