import { AlertCircle, CheckCircle2, Download, LoaderCircle, PackageCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import type { AppUpdater } from '../hooks/useAppUpdater';

export function UpdatePanel({ updater, blockingReason }: { updater: AppUpdater; blockingReason?: string }) {
  const { phase, info, release, preview, currentVersion, busy, downloaded, progress, error } = updater;
  const platform = info?.platform;
  const unavailable = preview || phase === 'unconfigured';
  const canInstall = downloaded && !!release;
  const canDownload = !!release && !downloaded;
  const percent = progress?.total ? Math.max(0, Math.min(100, Math.round(progress.downloaded / progress.total * 100))) : undefined;
  const published = release?.publishedAt ? new Date(release.publishedAt) : null;
  const date = published && Number.isFinite(published.getTime()) ? published.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }) : undefined;
  const status = preview ? 'Tersedia di aplikasi native' : phase === 'idle' ? 'Belum diperiksa' : phase === 'checking' ? updater.operation === 'metadata' ? 'Membaca konfigurasi pembaruan…' : 'Memeriksa rilis terbaru…' : phase === 'available' ? `Versi ${release?.version ?? ''} tersedia` : phase === 'downloading' ? 'Mengunduh dan memverifikasi paket…' : phase === 'ready' ? 'Unduhan siap dipasang' : phase === 'installing' ? updater.operation === 'install' ? 'Memulai pemasangan…' : 'Memulai ulang Warren…' : phase === 'permissionRequired' ? 'Izin pemasangan diperlukan' : phase === 'installerOpened' ? 'Installer sistem telah dibuka' : phase === 'latest' ? 'Versi ini yang terbaru' : phase === 'error' ? 'Pembaruan belum selesai' : 'Pembaruan belum dikonfigurasi';
  const message = preview ? 'Pembaruan tidak tersedia dalam pratinjau browser. Gunakan aplikasi Windows atau Android untuk memeriksa rilis.' : phase === 'unconfigured' ? info?.message || 'Sumber rilis belum dikonfigurasi. Pemeriksaan dan unduhan belum tersedia.' : phase === 'idle' ? 'Tekan Cek pembaruan untuk memeriksa rilis yang tersedia. Belum ada pemeriksaan rilis yang dilakukan.' : phase === 'latest' ? 'Pemeriksaan berhasil dan tidak menemukan versi yang lebih baru untuk perangkat ini.' : phase === 'permissionRequired' ? 'Izinkan Warren memasang aplikasi dari sumber ini di pengaturan Android. Setelah kembali ke Warren, tekan Pasang update lagi. APK tidak perlu diunduh ulang.' : phase === 'installerOpened' ? 'Selesaikan konfirmasi pada installer Android. Membuka installer belum berarti pembaruan berhasil dipasang.' : phase === 'ready' ? platform === 'android' ? 'APK sudah diunduh dan diverifikasi. Android akan meminta konfirmasi sebelum memasang pembaruan.' : 'Paket sudah diunduh dan diverifikasi. Simpan pekerjaan Anda; Warren akan dimulai ulang setelah pemasangan.' : phase === 'available' ? 'Tinjau catatan rilis, lalu unduh paket pembaruan untuk perangkat ini.' : phase === 'downloading' ? 'Tunggu unduhan dan verifikasi selesai sebelum memasang.' : phase === 'installing' ? platform === 'android' ? 'Menyiapkan installer Android. Ikuti permintaan izin yang tampil pada perangkat.' : 'Pemasangan dapat menutup dan memulai ulang Warren.' : '';

  return <section className="settings-card panel update-panel" aria-labelledby="updates-heading">
    <div className="settings-card-title"><Download size={21}/><div><h2 id="updates-heading">Pembaruan aplikasi</h2><p>{platform === 'android' ? 'Unduh APK di Warren, konfirmasi pemasangan di Android.' : platform === 'windows' ? 'Periksa, unduh, dan pasang pembaruan dari Warren.' : 'Pembaruan untuk aplikasi Windows dan Android.'}</p></div><span className="subtle-tag update-current-version">v{currentVersion}</span></div>
    <div className={`update-status update-status-${phase}`} role="status" aria-live="polite">
      <span className="update-status-icon">{busy ? <LoaderCircle size={19} className="spinning"/> : phase === 'latest' ? <CheckCircle2 size={19}/> : phase === 'ready' || phase === 'installerOpened' ? <PackageCheck size={19}/> : phase === 'error' || phase === 'permissionRequired' ? <AlertCircle size={19}/> : <RefreshCw size={18}/>}</span>
      <div><strong>{status}</strong>{message && <p>{message}</p>}</div>
    </div>
    {error && <p className="inline-error update-error" role="alert">{error}</p>}
    {phase === 'downloading' && <div className="update-progress"><progress aria-label="Progres unduhan pembaruan" max={100} value={percent}/><span>{progress ? `${formatBytes(progress.downloaded)}${progress.total ? ` / ${formatBytes(progress.total)}` : ' diunduh'}` : 'Menyiapkan unduhan…'}{percent !== undefined && ` · ${percent}%`}</span></div>}
    {release && <div className="update-release"><div className="update-release-heading"><strong>Warren {release.version}</strong>{date && <time dateTime={release.publishedAt}>{date}</time>}</div><span className="field-label">CATATAN RILIS</span><pre className="update-release-notes">{release.notes.trim() || 'Rilis ini tidak menyertakan catatan.'}</pre></div>}
    {canInstall && blockingReason && <p className="inline-warning update-install-block">{blockingReason}</p>}
    <div className="settings-card-footer update-actions">
      {canInstall ? <button className="button primary" disabled={busy || !!blockingReason} onClick={() => void updater.install()}><PackageCheck size={15}/>Pasang update</button> : canDownload ? <button className="button primary" disabled={busy} onClick={() => void updater.download()}>{phase === 'downloading' ? <LoaderCircle size={15} className="spinning"/> : <Download size={15}/>}Unduh update</button> : <button className="button secondary" disabled={busy || unavailable} onClick={() => void updater.check()}>{phase === 'checking' ? <LoaderCircle size={15} className="spinning"/> : <RefreshCw size={15}/>}Cek pembaruan</button>}
      {!preview && info?.configured && <span className="update-trust"><ShieldCheck size={13}/>Paket diverifikasi sebelum pemasangan</span>}
    </div>
  </section>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
