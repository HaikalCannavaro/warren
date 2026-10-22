import { AlertCircle, CheckCircle2, Download, LoaderCircle, PackageCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AppUpdater } from '../hooks/useAppUpdater';
import { useI18n } from '../lib/i18n';

export function UpdatePanel({ updater, blockingReason }: { updater: AppUpdater; blockingReason?: string }) {
  const { t, locale } = useI18n();
  const { phase, info, release, preview, currentVersion, busy, downloaded, progress, error } = updater;
  const platform = info?.platform;
  const unavailable = preview || phase === 'unconfigured';
  const canInstall = downloaded && !!release;
  const canDownload = !!release && !downloaded;
  const percent = progress?.total ? Math.max(0, Math.min(100, Math.round(progress.downloaded / progress.total * 100))) : undefined;
  const published = release?.publishedAt ? new Date(release.publishedAt) : null;
  const date = published && Number.isFinite(published.getTime()) ? published.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' }) : undefined;
  const status = preview ? t('Available in the app', 'Tersedia di aplikasi')
    : phase === 'idle' ? t('Not checked yet', 'Belum diperiksa')
    : phase === 'checking' ? updater.operation === 'metadata' ? t('Loading update settings…', 'Membaca konfigurasi pembaruan…') : t('Checking for updates…', 'Memeriksa rilis terbaru…')
    : phase === 'available' ? t(`Version ${release?.version ?? ''} available`, `Versi ${release?.version ?? ''} tersedia`)
    : phase === 'downloading' ? t('Downloading and verifying…', 'Mengunduh dan memverifikasi paket…')
    : phase === 'ready' ? t('Ready to install', 'Unduhan siap dipasang')
    : phase === 'installing' ? updater.operation === 'install' ? t('Starting installation…', 'Memulai pemasangan…') : t('Restarting Warren…', 'Memulai ulang Warren…')
    : phase === 'permissionRequired' ? t('Installation permission required', 'Izin pemasangan diperlukan')
    : phase === 'installerOpened' ? t('System installer opened', 'Installer sistem telah dibuka')
    : phase === 'latest' ? t('You’re up to date', 'Versi ini yang terbaru')
    : phase === 'error' ? t('Update incomplete', 'Pembaruan belum selesai') : t('Updates not configured', 'Pembaruan belum dikonfigurasi');
  const message = preview ? t('Use Warren on Windows or Android to check for and install updates.', 'Gunakan Warren di Windows atau Android untuk memeriksa dan memasang pembaruan.')
    : phase === 'unconfigured' ? platform === 'unsupported' ? t('In-app updates are supported on Windows and Android.', 'Pembaruan dalam aplikasi didukung di Windows dan Android.') : t('The release source is not configured. Checking and downloading are unavailable.', 'Sumber rilis belum dikonfigurasi. Pemeriksaan dan unduhan belum tersedia.')
    : phase === 'idle' ? t('Check for updates to see whether a new release is available.', 'Tekan Cek pembaruan untuk melihat apakah ada rilis terbaru.')
    : phase === 'latest' ? t('No newer version was found for this device.', 'Pemeriksaan berhasil dan tidak menemukan versi yang lebih baru untuk perangkat ini.')
    : phase === 'permissionRequired' ? t('Allow Warren to install apps from this source in Android settings. Return here and select Install update again; no new download is needed.', 'Izinkan Warren memasang aplikasi dari sumber ini di pengaturan Android. Setelah kembali ke Warren, tekan Pasang update lagi. APK tidak perlu diunduh ulang.')
    : phase === 'installerOpened' ? t('Finish the confirmation in the Android installer. Opening it does not confirm that the update is installed.', 'Selesaikan konfirmasi pada installer Android. Membuka installer belum berarti pembaruan berhasil dipasang.')
    : phase === 'ready' ? platform === 'android' ? t('The APK has been downloaded and verified. Android will ask you to confirm installation.', 'APK sudah diunduh dan diverifikasi. Android akan meminta konfirmasi sebelum memasang pembaruan.') : t('The package has been downloaded and verified. Save your work; Warren will restart after installation.', 'Paket sudah diunduh dan diverifikasi. Simpan pekerjaan Anda; Warren akan dimulai ulang setelah pemasangan.')
    : phase === 'available' ? t('Review the release notes, then download the update for this device.', 'Tinjau catatan rilis, lalu unduh paket pembaruan untuk perangkat ini.')
    : phase === 'downloading' ? t('Wait for download and verification to finish before installing.', 'Tunggu unduhan dan verifikasi selesai sebelum memasang.')
    : phase === 'installing' ? platform === 'android' ? t('Preparing the Android installer. Follow any permission requests on your device.', 'Menyiapkan installer Android. Ikuti permintaan izin yang tampil pada perangkat.') : t('Installation may close and restart Warren.', 'Pemasangan dapat menutup dan memulai ulang Warren.') : '';

  return <section className="settings-card panel update-panel" aria-labelledby="updates-heading">
    <div className="settings-card-title"><Download size={21}/><div><h2 id="updates-heading">{t('App updates', 'Pembaruan aplikasi')}</h2><p>{platform === 'android' ? t('Download in Warren, confirm installation in Android.', 'Unduh APK di Warren, konfirmasi pemasangan di Android.') : platform === 'windows' ? t('Check, download, and install updates from Warren.', 'Periksa, unduh, dan pasang pembaruan dari Warren.') : t('Updates for Windows and Android.', 'Pembaruan untuk aplikasi Windows dan Android.')}</p></div><span className="subtle-tag update-current-version">v{currentVersion}</span></div>
    <div className={`update-status update-status-${phase}`} role="status" aria-live="polite">
      <span className="update-status-icon">{busy ? <LoaderCircle size={19} className="spinning"/> : phase === 'latest' ? <CheckCircle2 size={19}/> : phase === 'ready' || phase === 'installerOpened' ? <PackageCheck size={19}/> : phase === 'error' || phase === 'permissionRequired' ? <AlertCircle size={19}/> : <RefreshCw size={18}/>}</span>
      <div><strong>{status}</strong>{message && <p>{message}</p>}</div>
    </div>
    {error && <p className="inline-error update-error" role="alert">{error}</p>}
    {phase === 'downloading' && <div className="update-progress"><progress aria-label={t('Update download progress', 'Progres unduhan pembaruan')} max={100} value={percent}/><span>{progress ? `${formatBytes(progress.downloaded)}${progress.total ? ` / ${formatBytes(progress.total)}` : t(' downloaded', ' diunduh')}` : t('Preparing download…', 'Menyiapkan unduhan…')}{percent !== undefined && ` · ${percent}%`}</span></div>}
    {release && <div className="update-release"><div className="update-release-heading"><strong>Warren {release.version}</strong>{date && <time dateTime={release.publishedAt}>{date}</time>}</div><span className="field-label">{t('RELEASE NOTES', 'CATATAN RILIS')}</span><pre className="update-release-notes">{release.notes.trim() || t('No release notes provided.', 'Rilis ini tidak menyertakan catatan.')}</pre></div>}
    {canInstall && blockingReason && <p className="inline-warning update-install-block">{blockingReason}</p>}
    <div className="settings-card-footer update-actions">
      {canInstall ? <button className="button primary" disabled={busy || !!blockingReason} onClick={() => void updater.install()}><PackageCheck size={15}/>{t('Install update', 'Pasang update')}</button> : canDownload ? <button className="button primary" disabled={busy} onClick={() => void updater.download()}>{phase === 'downloading' ? <LoaderCircle size={15} className="spinning"/> : <Download size={15}/>} {t('Download update', 'Unduh update')}</button> : <button className="button secondary" disabled={busy || unavailable} onClick={() => void updater.check()}>{phase === 'checking' ? <LoaderCircle size={15} className="spinning"/> : <RefreshCw size={15}/>} {t('Check for updates', 'Cek pembaruan')}</button>}
      {!preview && info?.configured && <span className="update-trust"><ShieldCheck size={13}/>{t('Verified before installation', 'Paket diverifikasi sebelum pemasangan')}</span>}
    </div>
  </section>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
