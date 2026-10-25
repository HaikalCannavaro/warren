import { useEffect, useState } from 'react';
import { Bell, LoaderCircle, Send } from 'lucide-react';
import { backgroundCommand, backgroundStatus, type BackgroundStatus } from '../lib/backgroundChat';
import { useI18n } from '../lib/i18n';
import type { HermesProfile } from '../types';
import { SelectMenu } from './SelectMenu';

export function BackgroundSettings({ profiles, deviceId }: { profiles: HermesProfile[]; deviceId: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<BackgroundStatus>({ supported: false, enabled: false });
  const [profileId, setProfileId] = useState(''); const [relayUrl, setRelayUrl] = useState(''); const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const refresh = async () => { const next = await backgroundStatus(); setStatus(next); if (next.profileId) setProfileId(next.profileId); if (next.relayUrl) setRelayUrl(next.relayUrl); };
  useEffect(() => { void refresh().catch(() => setError(t('Could not read background delivery settings.', 'Pengaturan pengiriman background belum terbaca.'))); }, []);
  const perform = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action(); await refresh(); } catch { setError(t('Check the relay address, token, Gateway match, and device storage.', 'Periksa alamat relay, token, kecocokan Gateway, dan penyimpanan perangkat.')); } finally { setBusy(false); } };
  const gateways = profiles.filter(profile => profile.transport === 'gateway');
  return <section className="settings-card panel" aria-label={t('Background delivery', 'Pengiriman background')}>
    <div className="settings-card-title"><Send size={21}/><div><h2>{t('Background delivery', 'Pengiriman background')}</h2><p>{t('Keep Agent messages moving when you leave Warren.', 'Lanjutkan pengiriman pesan Agent saat meninggalkan Warren.')}</p></div></div>
    {!status.supported ? <p className="settings-explainer">{t('Available in the Android app. Server setup is required for delivery and push notifications.', 'Tersedia di aplikasi Android. Siapkan layanan server untuk pengiriman dan push notification.')}</p> : <>
      <p className="settings-explainer">{t('Messages are queued securely on this device. Your server runs the task and stores the reply.', 'Pesan diantrekan secara terenkripsi di perangkat. Server menjalankan tugas dan menyimpan balasannya.')}</p>
      <div className="setting-row"><strong>{t('Status', 'Status')}</strong><span className="subtle-tag">{status.enabled ? t('ENABLED', 'AKTIF') : t('OFF', 'NONAKTIF')} · {status.pendingCount ?? 0} {t('pending', 'tertunda')}</span></div>
      <form className="background-settings-form" onSubmit={event => { event.preventDefault(); void perform(async () => {
        const profile = gateways.find(item => item.id === profileId); if (!profile) throw new Error('Select an Agent');
        await backgroundCommand('configure', { profileId, deviceId, relayUrl, token, gatewayUrl: profile.url }); setToken('');
      }); }}>
        <label>{t('Agent connection', 'Koneksi Agent')}<SelectMenu label={t('Background Agent', 'Agent background')} value={profileId} options={gateways.map(profile => ({value: profile.id, label: profile.name}))} onValueChange={setProfileId} placeholder={t('Choose a Gateway connection', 'Pilih koneksi Gateway')}/></label>
        <label>{t('Delivery service address', 'Alamat layanan pengiriman')}<input type="url" required value={relayUrl} onChange={event => setRelayUrl(event.target.value)} placeholder="https://your-server.example/warren" autoComplete="off"/></label>
        <label>{t('Delivery service token', 'Token layanan pengiriman')}<input type="password" required minLength={32} value={token} onChange={event => setToken(event.target.value)} autoComplete="off"/></label>
        <div className="settings-card-footer"><button className="button primary" disabled={busy || !profileId}>{busy && <LoaderCircle size={14} className="spinning"/>}{t('Connect & enable', 'Hubungkan & aktifkan')}</button>{status.enabled && <button type="button" className="button secondary" disabled={busy} onClick={() => void perform(async () => { await backgroundCommand('disable'); })}>{t('Pause delivery', 'Jeda pengiriman')}</button>}</div>
      </form>
      <div className="setting-row"><div><strong>{t('Result notifications', 'Notifikasi hasil')}</strong><span>{status.pushReady ? status.notificationsAllowed ? t('Notifications allowed', 'Notifikasi diizinkan') : t('Allow notifications on this device.', 'Izinkan notifikasi di perangkat ini.') : t('Firebase configuration has not been added to this build.', 'Konfigurasi Firebase belum ditambahkan ke build ini.')}</span></div><button className="button secondary" disabled={busy || !status.pushReady} onClick={() => void perform(async () => { await backgroundCommand('permission'); })}><Bell size={14}/>{t('Allow', 'Izinkan')}</button></div>
      {status.lastError && <p className="settings-explainer" role="status">{status.lastError}</p>}
    </>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </section>;
}
