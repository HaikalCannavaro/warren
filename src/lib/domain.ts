import type { Conversation, SavedState, VpsProfile } from '../types';

export function emptyState(): SavedState {
  return { version: 1, deviceId: crypto.randomUUID(), vps: [], hermes: [], conversations: [], settings: { fontSize: 14, scrollback: 5000 } };
}

export function normalizeHermesUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Masukkan alamat HTTPS Hermes yang valid.'); }
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('Gunakan HTTPS. HTTP hanya diizinkan untuk loopback pengembangan.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Alamat tidak boleh memuat kredensial, query, atau fragmen.');
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/chat/completions') || path.endsWith('/models')) throw new Error('Masukkan URL dasar layanan, misalnya https://hermes.example/v1.');
  url.pathname = path.endsWith('/v1') ? path : `${path}/v1`;
  return url.toString().replace(/\/$/, '');
}

export function sanitizePaste(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}

export function validateVps(profile: VpsProfile): void {
  if (!profile.id || !profile.name.trim() || !profile.host.trim() || !profile.username.trim()) throw new Error('Nama, host, dan username VPS wajib diisi.');
  if (/[\s/\\\x00-\x1f]/.test(profile.host) || profile.host.includes('://')) throw new Error('Isi host dengan hostname atau IP, tanpa URL atau spasi.');
  if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) throw new Error('Port SSH harus antara 1 dan 65535.');
  if (profile.auth === 'password' && !profile.password) throw new Error('Password SSH belum diisi.');
  if (profile.auth === 'key' && !profile.privateKey.includes('PRIVATE KEY')) throw new Error('Masukkan private key OpenSSH atau PEM yang valid.');
}

export function recoverState(input: unknown): SavedState {
  if (!input || typeof input !== 'object') throw new Error('Data brankas tidak valid.');
  const s = input as SavedState;
  if (s.version !== 1 || typeof s.deviceId !== 'string' || !Array.isArray(s.vps) || !Array.isArray(s.hermes) || !Array.isArray(s.conversations) || !s.settings) throw new Error('Versi atau struktur brankas tidak didukung. Data tidak ditimpa.');
  if (s.vps.some(p=> !p || typeof p.id !== 'string' || typeof p.host !== 'string') || s.hermes.some(p=> !p || typeof p.id !== 'string' || typeof p.url !== 'string')) throw new Error('Profil dalam brankas tidak valid.');
  for (const c of s.conversations) {
    if (!c || typeof c.id !== 'string' || typeof c.profileId !== 'string' || !Array.isArray(c.messages) || typeof c.draft !== 'string') throw new Error('Percakapan dalam brankas tidak valid.');
    for (const m of c.messages) {
      if (!m || typeof m.content !== 'string' || !['user','assistant'].includes(m.role)) throw new Error('Pesan dalam brankas tidak valid.');
    }
  }
  return {...s, settings: {
    fontSize: Math.max(10, Math.min(24, Number(s.settings.fontSize) || 14)),
    scrollback: Math.max(1000, Math.min(20000, Number(s.settings.scrollback) || 5000)),
  }, conversations: s.conversations.map(c => ({...c, messages:c.messages.map(m=> m.status === 'streaming' ? {...m,status:'unknown',error:'Aplikasi terhenti saat permintaan berlangsung. Status pekerjaan di Hermes belum diketahui. Tidak dikirim ulang.'} : m)}))};
}

export function conversationHistory(conversation: Conversation): {role:'user'|'assistant';content:string}[] {
  return conversation.messages.filter(m=>m.role==='user' || m.status==='complete').map(({role,content})=>({role,content}));
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : 'Operasi gagal. Periksa koneksi dan coba kembali secara manual.';
}
