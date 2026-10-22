import { useId, useState, type FormEvent } from 'react';
import { FileKey2, Upload, ShieldCheck, KeyRound, Server, CircleHelp } from 'lucide-react';
import type { VpsProfile, HermesProfile } from '../types';
import { normalizeHermesUrl } from '../lib/domain';
import { Dialog } from './Dialog';

export function VpsForm({ profile, onSave, onClose }: { profile?: VpsProfile; onSave: (profile: VpsProfile) => void; onClose: () => void }) {
  const id = useId();
  const [value, setValue] = useState<VpsProfile>(profile ?? { id: crypto.randomUUID(), name: '', host: '', port: 22, username: 'root', auth: 'key', password: '', privateKey: '', passphrase: '' });
  const [error, setError] = useState('');
  const update = <K extends keyof VpsProfile>(key: K, next: VpsProfile[K]) => setValue((current) => ({ ...current, [key]: next }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.name.trim()) return setError('Beri nama koneksi ini agar mudah ditemukan.');
    if (!value.host.trim() || /[\s/]/.test(value.host.trim()) || value.host.includes('://')) return setError('Masukkan alamat IP atau hostname tanpa protokol atau spasi.');
    if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) return setError('Port harus berupa angka antara 1 dan 65535.');
    if (!value.username.trim()) return setError('Username SSH diperlukan.');
    if (value.auth === 'password' && !value.password) return setError('Masukkan password SSH.');
    if (value.auth === 'key' && !value.privateKey.trim()) return setError('Tempel atau impor private key SSH.');
    const hostChanged = profile && (value.host.trim() !== profile.host || value.port !== profile.port);
    try { onSave({ ...value, name: value.name.trim(), host: value.host.trim(), username: value.username.trim(), fingerprint: hostChanged ? undefined : value.fingerprint, password: value.auth === 'password' ? value.password : '', privateKey: value.auth === 'key' ? value.privateKey : '', passphrase: value.auth === 'key' ? value.passphrase : '' }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Koneksi belum dapat disimpan.'); }
  };
  return <Dialog title={profile ? 'Edit koneksi VPS' : 'Tambahkan VPS'} description="Simpan detail server, lalu mulai sesi SSH kapan saja." onClose={onClose} wide>
    <form className="profile-form" onSubmit={submit}>
      <label htmlFor={`${id}-name`}>Nama koneksi<input id={`${id}-name`} value={value.name} onChange={(event) => update('name', event.target.value)} placeholder="Contoh: Production server" maxLength={80} autoComplete="off" required/></label>
      <div className="form-row host-row"><label htmlFor={`${id}-host`}>Host / alamat IP<input id={`${id}-host`} value={value.host} onChange={(event) => update('host', event.target.value)} placeholder="server.example.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} required/></label><label htmlFor={`${id}-port`}>Port<input id={`${id}-port`} type="number" min={1} max={65535} value={value.port || ''} onChange={(event) => update('port', Number(event.target.value))} required/></label></div>
      <label htmlFor={`${id}-username`}>Username<input id={`${id}-username`} value={value.username} onChange={(event) => update('username', event.target.value)} autoCapitalize="none" autoComplete="username" spellCheck={false} required/></label>
      <fieldset className="auth-field"><legend>Metode autentikasi</legend><div className="segmented"><button type="button" className={value.auth === 'key' ? 'selected' : ''} aria-pressed={value.auth === 'key'} onClick={() => update('auth', 'key')}><FileKey2 size={16}/> SSH key</button><button type="button" className={value.auth === 'password' ? 'selected' : ''} aria-pressed={value.auth === 'password'} onClick={() => update('auth', 'password')}><KeyRound size={16}/> Password</button></div></fieldset>
      {value.auth === 'key' ? <><label htmlFor={`${id}-private-key`}>Private key<textarea id={`${id}-private-key`} className="key-input" value={value.privateKey} onChange={(event) => update('privateKey', event.target.value)} rows={5} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" autoCapitalize="none" autoCorrect="off" spellCheck={false} required/></label><label className="file-import" htmlFor={`${id}-key-file`}><Upload size={15}/> Impor file private key<input id={`${id}-key-file`} type="file" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 128 * 1024) return setError('File private key terlalu besar (maksimal 128 KB).'); try { update('privateKey', await file.text()); setError(''); } catch { setError('File tidak dapat dibaca.'); } }}/></label><label htmlFor={`${id}-passphrase`}>Passphrase <span className="optional">opsional</span><input id={`${id}-passphrase`} type="password" value={value.passphrase} onChange={(event) => update('passphrase', event.target.value)} placeholder="Jika key Anda dilindungi passphrase" autoComplete="off"/></label></> : <label htmlFor={`${id}-password`}>Password SSH<input id={`${id}-password`} type="password" value={value.password} onChange={(event) => update('password', event.target.value)} autoComplete="new-password" placeholder="Password akun server" required/></label>}
      <p className="form-note"><ShieldCheck size={16}/> Kredensial disimpan dalam brankas terenkripsi di aplikasi native.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button className="button primary" type="submit"><Server size={16}/>{profile ? 'Simpan perubahan' : 'Simpan VPS'}</button></div>
    </form>
  </Dialog>;
}

export function HermesForm({ profile, onSave, onClose }: { profile?: HermesProfile; onSave: (profile: HermesProfile) => void; onClose: () => void }) {
  const id = useId();
  const [value, setValue] = useState<HermesProfile>(profile ?? { id: crypto.randomUUID(), name: '', url: '', token: '', model: '' });
  const [error, setError] = useState('');
  const update = (key: keyof HermesProfile, next: string) => setValue((current) => ({ ...current, [key]: next }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.name.trim()) return setError('Beri nama koneksi Hermes ini.');
    if (!value.token.trim()) return setError('API token Hermes wajib diisi. Gunakan API_SERVER_KEY dari server Anda.');
    if (!value.model.trim()) return setError('Masukkan model yang tersedia di server Hermes Anda.');
    try { const url = normalizeHermesUrl(value.url); onSave({ ...value, name: value.name.trim(), url, token: value.token.trim(), model: value.model.trim() }); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Periksa URL server Hermes Anda.'); }
  };
  return <Dialog title={profile ? 'Edit koneksi Agent' : 'Hubungkan Agent'} description="Gunakan endpoint kompatibel OpenAI dari server Hermes Anda." onClose={onClose} wide>
    <form className="profile-form" onSubmit={submit}>
      <label htmlFor={`${id}-name`}>Nama koneksi<input id={`${id}-name`} value={value.name} onChange={(event) => update('name', event.target.value)} placeholder="Contoh: Leveret" maxLength={80} required/></label>
      <label htmlFor={`${id}-url`}>URL server<input id={`${id}-url`} type="url" value={value.url} onChange={(event) => update('url', event.target.value)} placeholder="https://hermes.example.com/v1" autoCapitalize="none" autoCorrect="off" spellCheck={false} required/><span className="field-hint">HTTPS diperlukan. HTTP hanya untuk 127.0.0.1 atau [::1].</span></label>
      <label htmlFor={`${id}-token`}>API token<input id={`${id}-token`} type="password" value={value.token} onChange={(event) => update('token', event.target.value)} placeholder="API_SERVER_KEY dari server Hermes" autoComplete="new-password" required/><span className="field-hint">Wajib diisi. Gunakan nilai API_SERVER_KEY dari server Hermes Anda.</span></label>
      <label htmlFor={`${id}-model`}>Model<input id={`${id}-model`} value={value.model} onChange={(event) => update('model', event.target.value)} placeholder="ID model dari server Anda" autoCapitalize="none" spellCheck={false} required/><span className="field-hint">Gunakan nama model yang dikonfigurasi pada endpoint.</span></label>
      <p className="form-note"><CircleHelp size={16}/> Pesan dikirim ke endpoint ini. Pastikan alamat dan pemilik server tepercaya.</p>
      {profile && value.url.trim() !== profile.url && <p className="form-note">Mengganti alamat server membuat koneksi baru. Koneksi dan percakapan sebelumnya tetap menggunakan alamat lama.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>Batal</button><button className="button primary" type="submit">{profile ? 'Simpan perubahan' : 'Simpan Agent'}</button></div>
    </form>
  </Dialog>;
}
