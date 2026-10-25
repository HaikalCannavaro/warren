import { translate } from './i18n';
import type { Conversation, SavedState, VpsProfile } from '../types';
import { interruptExecutionLog } from './executionLog';
import { hasUncertainSessionMutation, sanitizeCommandResults } from './slashCommands';

export function emptyState(): SavedState {
  return { version: 1, deviceId: crypto.randomUUID(), vps: [], hermes: [], conversations: [], settings: { fontSize: 14, scrollback: 5000 } };
}

export function normalizeHermesUrl(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error(translate("Enter a valid HTTPS address for Hermes.", "Masukkan alamat HTTPS Hermes yang valid.")); }
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error(translate("Use HTTPS. HTTP is allowed only for a development loopback address.", "Gunakan HTTPS. HTTP hanya diizinkan untuk loopback pengembangan."));
  if (url.username || url.password || url.search || url.hash) throw new Error(translate("The address must not contain credentials, query parameters, or fragments.", "Alamat tidak boleh memuat kredensial, query, atau fragmen."));
  const path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/chat/completions') || path.endsWith('/models')) throw new Error(translate("Enter the service base URL, such as https://hermes.example/v1.", "Masukkan URL dasar layanan, misalnya https://hermes.example/v1."));
  url.pathname = path.endsWith('/v1') ? path : `${path}/v1`;
  return url.toString().replace(/\/$/, '');
}

export function normalizeGatewayUrl(input: string): string {
  if (/[\x00-\x1f\x7f]/.test(input)) throw new Error(translate("The Gateway address contains control characters.", "Alamat Gateway memuat karakter kontrol."));
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error(translate("Enter a valid Gateway WebSocket address.", "Masukkan alamat WebSocket Gateway yang valid.")); }
  const loopback = ['127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) throw new Error(translate("Use WSS. WS is allowed only for a loopback IP address.", "Gunakan WSS. WS hanya diizinkan untuk IP loopback."));
  if (url.username || url.password || url.search || url.hash) throw new Error(translate("The address must not contain credentials, query parameters, or fragments.", "Alamat tidak boleh memuat kredensial, query, atau fragmen."));
  if (!url.pathname.endsWith('/api/ws')) throw new Error(translate("Enter the full Gateway endpoint ending in /api/ws.", "Masukkan endpoint lengkap Gateway yang berakhir dengan /api/ws."));
  return url.toString();
}

export function sanitizePaste(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
}

export function normalizeAgentProfileName(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 80 || /[\x00-\x1f\x7f-\x9f/\\]/.test(value)) return undefined;
  return value.trim() || undefined;
}

export function validateVps(profile: VpsProfile): void {
  if (!profile.id || !profile.name.trim() || !profile.host.trim() || !profile.username.trim()) throw new Error(translate("VPS name, host, and username are required.", "Nama, host, dan username VPS wajib diisi."));
  if (/[\s/\\\x00-\x1f]/.test(profile.host) || profile.host.includes('://')) throw new Error(translate("Enter a hostname or IP address without a URL scheme or spaces.", "Isi host dengan hostname atau IP, tanpa URL atau spasi."));
  if (!Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) throw new Error(translate("SSH port must be between 1 and 65535.", "Port SSH harus antara 1 dan 65535."));
  if (profile.auth === 'password' && !profile.password) throw new Error(translate("SSH password is required.", "Password SSH belum diisi."));
  if (profile.auth === 'key' && !profile.privateKey.includes('PRIVATE KEY')) throw new Error(translate("Enter a valid OpenSSH or PEM private key.", "Masukkan private key OpenSSH atau PEM yang valid."));
}

export function recoverState(input: unknown): SavedState {
  if (!input || typeof input !== 'object') throw new Error(translate("Vault data is invalid.", "Data brankas tidak valid."));
  const s = input as SavedState;
  if (s.version !== 1 || typeof s.deviceId !== 'string' || !Array.isArray(s.vps) || !Array.isArray(s.hermes) || !Array.isArray(s.conversations) || !s.settings) throw new Error(translate("The vault version or structure is unsupported. Your data was not overwritten.", "Versi atau struktur brankas tidak didukung. Data tidak ditimpa."));
  if (s.vps.some(p=> !p || typeof p.id !== 'string' || typeof p.host !== 'string') || s.hermes.some(p=> !p || typeof p.id !== 'string' || typeof p.url !== 'string')) throw new Error(translate("The vault contains an invalid profile.", "Profil dalam brankas tidak valid."));
  for (const c of s.conversations) {
    if (!c || typeof c.id !== 'string' || typeof c.profileId !== 'string' || !Array.isArray(c.messages) || typeof c.draft !== 'string') throw new Error(translate("The vault contains an invalid conversation.", "Percakapan dalam brankas tidak valid."));
    for (const m of c.messages) {
      if (!m || typeof m.content !== 'string' || !['user','assistant'].includes(m.role)) throw new Error(translate("The vault contains an invalid message.", "Pesan dalam brankas tidak valid."));
    }
  }
  const interruption=translate("The app closed during this request. Its status in Hermes is unknown. It was not resent.", "Aplikasi terhenti saat permintaan berlangsung. Status pekerjaan di Hermes belum diketahui. Tidak dikirim ulang.");
  return {...s, settings: {
    fontSize: Math.max(10, Math.min(24, Number(s.settings.fontSize) || 14)),
    scrollback: Math.max(1000, Math.min(20000, Number(s.settings.scrollback) || 5000)),
  }, hermes:s.hermes.map(profile=>({...profile,agentProfile:normalizeAgentProfileName(profile.agentProfile)})), conversations: s.conversations.map(c => ({...c,
    executionLog:interruptExecutionLog(c,interruption),
    commandResults:sanitizeCommandResults(c.commandResults,interruption),
    gatewayStateUncertain:c.gatewayStateUncertain===true || hasUncertainSessionMutation(c.commandResults) ? true : undefined,
    gatewaySessionId:typeof c.gatewaySessionId==='string' && c.gatewaySessionId.trim() && c.gatewaySessionId.length<=512 ? c.gatewaySessionId : undefined,
    agentProfile:normalizeAgentProfileName(c.agentProfile),
    messages:c.messages.map(m=> ({...m,agentProfile:m.role==='assistant'?normalizeAgentProfileName(m.agentProfile):undefined,...(m.status === 'streaming' && !m.background ? {status:'unknown' as const,error:interruption} : {})})),
  }))};
}

export function conversationHistory(conversation: Conversation): {role:'user'|'assistant';content:string}[] {
  return conversation.messages.filter(m=>m.role==='user' || m.status==='complete').map(({role,content})=>({role,content}));
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : translate("The operation failed. Check your connection and try again manually.", "Operasi gagal. Periksa koneksi dan coba kembali secara manual.");
}
