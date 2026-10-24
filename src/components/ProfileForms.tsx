import { useId, useState, type FormEvent } from 'react';
import { FileKey2, Upload, ShieldCheck, KeyRound, Server, CircleHelp, ChevronDown } from 'lucide-react';
import type { VpsProfile, HermesProfile } from '../types';
import { normalizeAgentProfileName, normalizeGatewayUrl, normalizeHermesUrl } from '../lib/domain';
import { Dialog } from './Dialog';
import { useI18n } from '../lib/i18n';

export function VpsForm({ profile, onSave, onClose }: { profile?: VpsProfile; onSave: (profile: VpsProfile) => void; onClose: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const [value, setValue] = useState<VpsProfile>(profile ?? { id: crypto.randomUUID(), name: '', host: '', port: 22, username: 'root', auth: 'key', password: '', privateKey: '', passphrase: '' });
  const [error, setError] = useState('');
  const update = <K extends keyof VpsProfile>(key: K, next: VpsProfile[K]) => setValue((current) => ({ ...current, [key]: next }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.name.trim()) return setError(t("Give this connection a name.", "Beri nama koneksi ini agar mudah ditemukan."));
    if (!value.host.trim() || /[\s/]/.test(value.host.trim()) || value.host.includes('://')) return setError(t("Enter an IP address or hostname without a protocol or spaces.", "Masukkan alamat IP atau hostname tanpa protokol atau spasi."));
    if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) return setError(t("Port must be a number between 1 and 65535.", "Port harus berupa angka antara 1 dan 65535."));
    if (!value.username.trim()) return setError(t("An SSH username is required.", "Username SSH diperlukan."));
    if (value.auth === 'password' && !value.password) return setError(t("Enter the SSH password.", "Masukkan password SSH."));
    if (value.auth === 'key' && !value.privateKey.trim()) return setError(t("Paste or import an SSH private key.", "Tempel atau impor private key SSH."));
    const hostChanged = profile && (value.host.trim() !== profile.host || value.port !== profile.port);
    try { onSave({ ...value, name: value.name.trim(), host: value.host.trim(), username: value.username.trim(), fingerprint: hostChanged ? undefined : value.fingerprint, password: value.auth === 'password' ? value.password : '', privateKey: value.auth === 'key' ? value.privateKey : '', passphrase: value.auth === 'key' ? value.passphrase : '' }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("The connection could not be saved.", "Koneksi belum dapat disimpan.")); }
  };
  return <Dialog title={profile ? t("Edit VPS connection", "Edit koneksi VPS") : t("Add VPS", "Tambahkan VPS")} description={t("Save your server details and connect whenever you need.", "Simpan detail server, lalu mulai sesi SSH kapan saja.")} onClose={onClose} wide>
    <form className="profile-form" onSubmit={submit}>
      <label htmlFor={`${id}-name`}>{t("Connection name", "Nama koneksi")}<input id={`${id}-name`} value={value.name} onChange={(event) => update('name', event.target.value)} placeholder={t("e.g. Production server", "Contoh: Production server")} maxLength={80} autoComplete="off" required/></label>
      <div className="form-row host-row"><label htmlFor={`${id}-host`}>{t("Host / IP address", "Host / alamat IP")}<input id={`${id}-host`} value={value.host} onChange={(event) => update('host', event.target.value)} placeholder="server.example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required/></label><label htmlFor={`${id}-port`}>Port<input id={`${id}-port`} type="number" min={1} max={65535} value={value.port || ''} onChange={(event) => update('port', Number(event.target.value))} required/></label></div>
      <label htmlFor={`${id}-username`}>Username<input id={`${id}-username`} value={value.username} onChange={(event) => update('username', event.target.value)} autoCapitalize="none" autoComplete="username" spellCheck={false} required/></label>
      <fieldset className="auth-field"><legend>{t("Authentication method", "Metode autentikasi")}</legend><div className="segmented"><button type="button" className={value.auth === 'key' ? 'selected' : ''} aria-pressed={value.auth === 'key'} onClick={() => update('auth', 'key')}><FileKey2 size={16}/> SSH key</button><button type="button" className={value.auth === 'password' ? 'selected' : ''} aria-pressed={value.auth === 'password'} onClick={() => update('auth', 'password')}><KeyRound size={16}/> Password</button></div></fieldset>
      {value.auth === 'key' ? <><label htmlFor={`${id}-private-key`}>Private key<textarea id={`${id}-private-key`} className="key-input" value={value.privateKey} onChange={(event) => update('privateKey', event.target.value)} rows={5} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" autoCapitalize="none" autoCorrect="off" spellCheck={false} required/></label><label className="file-import" htmlFor={`${id}-key-file`}><Upload size={15}/> {t("Import private key file", "Impor file private key")}<input id={`${id}-key-file`} type="file" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 128 * 1024) return setError(t("The private key file is too large (128 KB maximum).", "File private key terlalu besar (maksimal 128 KB).")); try { update('privateKey', await file.text()); setError(''); } catch { setError(t("The file could not be read.", "File tidak dapat dibaca.")); } }}/></label><label htmlFor={`${id}-passphrase`}>Passphrase <span className="optional">{t("optional", "opsional")}</span><input id={`${id}-passphrase`} type="password" value={value.passphrase} onChange={(event) => update('passphrase', event.target.value)} placeholder={t("If your key is protected by a passphrase", "Jika key Anda dilindungi passphrase")} autoComplete="off"/></label></> : <label htmlFor={`${id}-password`}>{t("SSH password", "Password SSH")}<input id={`${id}-password`} type="password" value={value.password} onChange={(event) => update('password', event.target.value)} autoComplete="new-password" placeholder={t("Server account password", "Password akun server")} required/></label>}
      <p className="form-note"><ShieldCheck size={16}/> {t("Credentials are encrypted in the app’s local vault.", "Kredensial disimpan dalam brankas terenkripsi di aplikasi native.")}</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>{t("Cancel", "Batal")}</button><button className="button primary" type="submit"><Server size={16}/>{profile ? t("Save changes", "Simpan perubahan") : t("Save VPS", "Simpan VPS")}</button></div>
    </form>
  </Dialog>;
}

export function HermesForm({ profile, onSave, onClose }: { profile?: HermesProfile; onSave: (profile: HermesProfile) => void; onClose: () => void }) {
  const { t } = useI18n();
  const id = useId();
  const [value, setValue] = useState<HermesProfile>(profile ?? { id: crypto.randomUUID(), name: '', url: '', token: '', model: '' });
  const [error, setError] = useState('');
  const gateway = value.transport === 'gateway';
  const [advancedOpen, setAdvancedOpen] = useState(!gateway && !value.model.trim());
  const showMissingModel = () => {
    setAdvancedOpen(true);
    setError(t('Enter the API model ID advertised by your Hermes endpoint.', 'Masukkan ID model API yang tersedia pada endpoint Hermes Anda.'));
  };
  const update = (key: keyof HermesProfile, next: string) => setValue((current) => ({ ...current, [key]: next }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.name.trim()) return setError(t("Give this Agent connection a name.", "Beri nama koneksi Hermes ini."));
    if (!value.token.trim()) return setError(gateway ? t("A Gateway session token is required.", "Token sesi Gateway wajib diisi.") : t("A Hermes API token is required. Use API_SERVER_KEY from your server.", "API token Hermes wajib diisi. Gunakan API_SERVER_KEY dari server Anda."));
    if (value.agentProfile?.trim() && !normalizeAgentProfileName(value.agentProfile)) return setError(t('Use a profile name of up to 80 characters, without paths or control characters.', 'Gunakan nama profil maksimal 80 karakter, tanpa path atau karakter kontrol.'));
    if (!gateway && !value.model.trim()) return showMissingModel();
    try { const url = gateway ? normalizeGatewayUrl(value.url) : normalizeHermesUrl(value.url); onSave({ ...value, name: value.name.trim(), url, token: value.token.trim(), model: value.model.trim(), agentProfile: normalizeAgentProfileName(value.agentProfile) }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("Check your Hermes server URL.", "Periksa URL server Hermes Anda.")); }
  };
  return <Dialog title={profile ? t("Edit Agent connection", "Edit koneksi Agent") : t("Connect Agent", "Hubungkan Agent")} description={gateway ? t("Connect a Gateway session for chat and Hermes commands.", "Hubungkan sesi Gateway untuk chat dan perintah Hermes.") : t("Use the OpenAI-compatible endpoint on your Hermes server.", "Gunakan endpoint kompatibel OpenAI dari server Hermes Anda.")} onClose={onClose} wide>
    <form className="profile-form" onSubmit={submit}>
      <label htmlFor={`${id}-name`}>{t("Connection name", "Nama koneksi")}<input id={`${id}-name`} value={value.name} onChange={(event) => update('name', event.target.value)} placeholder={t("e.g. Personal VPS", "Contoh: VPS pribadi")} maxLength={80} required/></label>
      <label htmlFor={`${id}-agent-profile`}>{t('Profile', 'Profil')} <span className="optional">{t('optional', 'opsional')}</span><input id={`${id}-agent-profile`} value={value.agentProfile ?? ''} onChange={event => update('agentProfile', event.target.value)} placeholder="Leveret" maxLength={80} autoCapitalize="none" autoComplete="off" spellCheck={false}/><span className="field-hint">{gateway ? t('Name of the Hermes profile served by this connection. Gateway can detect it automatically.', 'Nama profil Hermes yang dilayani koneksi ini. Gateway dapat mendeteksinya otomatis.') : t('Use the profile’s server URL and API token. This name labels the connection; it does not switch profiles on the server.', 'Gunakan URL server dan token API profil tersebut. Nama ini menjadi label koneksi; tidak mengganti profil di server.')}</span></label>
      <label htmlFor={`${id}-transport`}>{t("Connection type", "Jenis koneksi")}<select id={`${id}-transport`} className="transport-select" value={value.transport ?? 'openai'} onChange={event => { const transport = event.target.value as 'openai' | 'gateway'; setValue(current => ({ ...current, transport, url: '', token: '' })); setAdvancedOpen(transport === 'openai' && !value.model.trim()); setError(''); }}><option value="openai">{t("HTTP · OpenAI compatible", "HTTP · Kompatibel OpenAI")}</option><option value="gateway">{t("Gateway · Chat and Hermes commands", "Gateway · Chat dan perintah Hermes")}</option></select></label>
      <label htmlFor={`${id}-url`}>{t("Server URL", "URL server")}<input id={`${id}-url`} type="url" value={value.url} onChange={(event) => update('url', event.target.value)} placeholder={gateway ? 'wss://hermes.example.com/api/ws' : 'https://hermes.example.com/v1'} autoCapitalize="none" autoCorrect="off" spellCheck={false} required/><span className="field-hint">{gateway ? t("Enter the full WebSocket URL, including /api/ws. Use WSS; WS is only supported for 127.0.0.1 or [::1].", "Masukkan URL WebSocket lengkap, termasuk /api/ws. WSS diperlukan; WS hanya untuk 127.0.0.1 atau [::1].") : t("Use HTTPS. HTTP is only supported for 127.0.0.1 or [::1].", "HTTPS diperlukan. HTTP hanya untuk 127.0.0.1 atau [::1].")}</span></label>
      <label htmlFor={`${id}-token`}>{gateway ? t("Gateway token", "Token Gateway") : 'API token'}<input id={`${id}-token`} type="password" value={value.token} onChange={(event) => update('token', event.target.value)} placeholder={gateway ? t("Your Gateway session token", "Token sesi Gateway Anda") : t("API_SERVER_KEY from your Hermes server", "API_SERVER_KEY dari server Hermes")} autoComplete="new-password" required/><span className="field-hint">{gateway ? t("Use the Gateway session token issued by your server.", "Gunakan token sesi Gateway yang diberikan server Anda.") : t("Required. Use the API_SERVER_KEY value from your Hermes server.", "Wajib diisi. Gunakan nilai API_SERVER_KEY dari server Hermes Anda.")}</span></label>
      <details open={advancedOpen} onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
        <summary className="text-link"><ChevronDown size={14} style={{ transform: advancedOpen ? 'rotate(180deg)' : undefined }}/>{t('Advanced', 'Lanjutan')}</summary>
        <label htmlFor={`${id}-model`} style={{ marginTop: 12 }}>Model {gateway && <span className="optional">{t('optional', 'opsional')}</span>}<input id={`${id}-model`} value={value.model} onChange={event => update('model', event.target.value)} placeholder={gateway ? t('Leave blank to use the server’s default model', 'Kosongkan untuk model bawaan server') : t('API model ID from your server', 'ID model API dari server Anda')} autoCapitalize="none" spellCheck={false} required={!gateway} onInvalid={event => { event.preventDefault(); showMissingModel(); }}/><span className="field-hint">{gateway ? t('Optional model override when creating a session. This does not select the Hermes profile.', 'Penggantian model opsional saat membuat sesi. Ini tidak memilih profil Hermes.') : t('Use an ID advertised by the endpoint’s /models API. This API parameter is separate from the Hermes profile name.', 'Gunakan ID dari API /models endpoint. Parameter API ini terpisah dari nama profil Hermes.')}</span></label>
      </details>
      <p className="form-note"><CircleHelp size={16}/> {t("Messages are sent to this endpoint. Use a server and address you trust.", "Pesan dikirim ke endpoint ini. Pastikan alamat dan pemilik server tepercaya.")}</p>
      {profile && (value.transport ?? 'openai') !== (profile.transport ?? 'openai') ? <p className="form-note">{t("Changing the connection type creates a new connection. Existing chats keep their original connection.", "Mengganti jenis koneksi membuat koneksi baru. Percakapan sebelumnya tetap menggunakan koneksi lama.")}</p> : profile && value.url.trim() !== profile.url && <p className="form-note">{t("Changing the server address creates a new connection. Existing connections and chats keep their original address.", "Mengganti alamat server membuat koneksi baru. Koneksi dan percakapan sebelumnya tetap menggunakan alamat lama.")}</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>{t("Cancel", "Batal")}</button><button className="button primary" type="submit">{profile ? t("Save changes", "Simpan perubahan") : t("Save Agent", "Simpan Agent")}</button></div>
    </form>
  </Dialog>;
}
