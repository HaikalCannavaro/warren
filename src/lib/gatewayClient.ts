import { translate } from './i18n';
import { parseToolArtifact } from './artifacts';
import { normalizeAgentProfileName } from './domain';
import type { HermesEvent, HermesProfile, SlashCommand } from '../types';
import { connectGateway, disconnectGateway, sendGateway } from './native';
import type { GatewayTransportEvent } from './native';

// Verified against NousResearch/hermes-agent v0.22.4, contracts/canonical_sessions.py.
// Standalone serve has a different wire contract. Never infer it from a version string.
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const str = (value: unknown): string => typeof value === 'string' ? value : '';
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const RPC_TIMEOUT = 30_000;
const TURN_TIMEOUT = 30 * 60_000;

export class GatewayError extends Error {
  constructor(message: string, public readonly uncertain = false, public readonly code?: number) { super(message); this.name = 'GatewayError'; }
}
interface PendingRpc {
  resolve: (result: Row) => void;
  reject: (error: GatewayError) => void;
  timer: ReturnType<typeof setTimeout>;
  mutation: boolean;
}
interface SessionState { id: string; revision: number; generation: number; info: Row; busy: boolean; }
interface Turn {
  sessionId: string; admissionId?: string; buffer: Row[]; ended: boolean; dispatched: boolean;
  agentProfile?: string;
  terminalError?: GatewayError;
  admitted: Promise<void>; resolveAdmission: () => void;
  onEvent: (event: HermesEvent) => void;
  resolve: () => void; reject: (error: GatewayError) => void;
  timer: ReturnType<typeof setTimeout>;
}
const routes = (): Array<SlashCommand & { aliases?: string[] }> => [
  { name: 'help', description: translate("View commands and their availability.", "Lihat perintah dan ketersediaannya."), available: true, allowWhileRunning: true },
  { name: 'new', description: translate("Start a new conversation.", "Mulai percakapan baru."), available: true },
  { name: 'model', description: translate("View or change the session model.", "Lihat atau ubah model sesi."), args: '[model] [--provider provider]', available: false },
  { name: 'status', description: translate("Check the Agent session status.", "Periksa status sesi Agent."), available: false, allowWhileRunning: true },
  { name: 'usage', description: translate("View session usage.", "Lihat pemakaian sesi."), available: false, allowWhileRunning: true },
  { name: 'compact', aliases: ['compress'], description: translate("Compact the conversation context.", "Ringkas konteks percakapan."), args: '[focus]', available: false },
  { name: 'stop', description: translate("Ask the Agent to stop its active task.", "Minta Agent menghentikan pekerjaan aktif."), available: false, allowWhileRunning: true },
];

export class GatewayClient {
  private readonly connectionId = crypto.randomUUID();
  private readonly profile: HermesProfile;
  private nextId = 0;
  private connected = false;
  private closed = false;
  private started = false;
  private disconnecting?: Promise<void>;
  private connecting?: Promise<void>;
  private ready?: { resolve: (payload: Row) => void; reject: (error: GatewayError) => void };
  private heartbeat?: ReturnType<typeof setInterval>;
  private pending = new Map<number, PendingRpc>();
  private sessions = new Map<string, SessionState>();
  private turns = new Map<string, Turn>();
  private sequences = new Map<string, number>();
  private catalogs = new Map<string, SlashCommand[]>();

  constructor(profile: HermesProfile, private readonly onSessionProfile?: (sessionId: string, profile: string | undefined) => void, private readonly onDisconnect?: () => void) { this.profile = { ...profile }; }

  isClosed(): boolean { return this.closed; }
  /** Measures a real Gateway RPC round trip, after the capability handshake. */
  async ping(): Promise<number> {
    const start = performance.now();
    await this.rpc('gateway.ping', {}, 15_000);
    return Math.max(0, Math.round(performance.now() - start));
  }
  getSessionProfile(sessionId: string): string | undefined { return normalizeAgentProfileName(this.sessions.get(sessionId)?.info.profile_name); }

  private notifySessionProfile(sessionId: string): void {
    try { this.onSessionProfile?.(sessionId, this.getSessionProfile(sessionId)); } catch { /* Display metadata cannot alter protocol handling. */ }
  }

  private safe(message: string): string {
    let text = message;
    for (const secret of [this.profile.token, encodeURIComponent(this.profile.token)].filter(Boolean)) text = text.split(secret).join('[redacted]');
    return text.replace(/([?&](?:token|ticket|internal|api_key)=)[^\s&#]+/gi, '$1[redacted]').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 2000);
  }

  connect(): Promise<void> {
    if (this.closed) return Promise.reject(new GatewayError(translate("The Gateway connection is closed. Open it again manually.", "Koneksi Gateway sudah ditutup. Buka kembali secara manual.")));
    if (this.connecting) return this.connecting;
    if (this.connected) return Promise.resolve();
    this.connecting = this.open();
    return this.connecting;
  }

  private async open(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ready = new Promise<Row>((resolve, reject) => {
      this.ready = { resolve, reject };
      timer = setTimeout(() => reject(new GatewayError(translate("The Gateway did not complete its handshake within 15 seconds.", "Gateway tidak mengirim handshake dalam 15 detik."))), 15_000);
    });
    this.started = true;
    try {
      const [payload] = await Promise.all([ready, connectGateway(this.connectionId, this.profile.url, this.profile.token, event => this.receive(event))]);
      if (payload.session_authority !== true) throw new GatewayError(translate("This Gateway does not advertise session_authority. Warren requires the shared Hermes 0.22.4 Gateway; standalone endpoints are not supported yet.", "Gateway ini tidak mengiklankan session_authority. Warren memerlukan Gateway bersama Hermes 0.22.4; endpoint standalone belum didukung."));
      if (this.closed) throw new GatewayError(translate("The Gateway connection is closed.", "Koneksi Gateway sudah ditutup."));
      this.connected = true;
      await this.rpc('client.capabilities', { server_requests: true });
      const description = await this.rpc('runtime.describe', {});
      if (!Array.isArray(description.capabilities) || !description.capabilities.includes('durable-admission-v1')) throw new GatewayError(translate("This Gateway does not support durable-admission-v1. The message was not sent.", "Gateway tidak mendukung durable-admission-v1. Pesan tidak dikirim."));
      if (payload.heartbeat === true) this.heartbeat = setInterval(() => {
        void this.rpc('gateway.ping', {}, 15_000).catch(() => this.failConnection(new GatewayError(translate("The Gateway is not responding. Active request results are unknown.", "Koneksi Gateway tidak merespons. Hasil permintaan aktif belum diketahui."), true)));
      }, 15_000);
    } catch (error) {
      const failure = error instanceof GatewayError ? error : new GatewayError(this.safe(error instanceof Error ? error.message : String(error)));
      this.failConnection(failure);
      await this.disconnecting;
      throw failure;
    } finally { if (timer) clearTimeout(timer); this.ready = undefined; }
  }

  private rpc(method: string, params: Row, timeout = RPC_TIMEOUT, mutation = false): Promise<Row> {
    if (!this.connected || this.closed) return Promise.reject(new GatewayError(translate("The Gateway is not connected.", "Gateway belum terhubung.")));
    const id = ++this.nextId;
    return new Promise<Row>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new GatewayError(`${translate(`The Gateway has not replied to ${method}.`, `Gateway belum menjawab ${method}.`)} ${mutation ? translate("The result is unknown; do not resend automatically.", "Hasilnya belum diketahui; jangan kirim ulang otomatis.") : translate("Try again manually.", "Coba lagi secara manual.")}`, mutation));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer, mutation });
      void sendGateway(this.connectionId, JSON.stringify({ jsonrpc: '2.0', id, method, params })).catch(error => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id); clearTimeout(timer);
        reject(new GatewayError(this.safe(error instanceof Error ? error.message : String(error)), mutation));
      });
    });
  }

  private receive(event: GatewayTransportEvent): void {
    if (this.closed) return;
    if (event.type === 'closed') { this.failConnection(new GatewayError(this.safe(event.message || translate("The Gateway connection was lost.", "Koneksi Gateway terputus.")), true)); return; }
    let frames: unknown[];
    try { frames = [JSON.parse(event.text)]; } catch {
      // Official v0.22.4 sends one JSON object per text frame. Also accept bounded
      // NDJSON framing from a proxy; never partially apply an invalid batch.
      const lines = event.text.split('\n').filter(line => line.trim());
      if (lines.length < 2 || lines.length > 512) { this.failConnection(new GatewayError(translate("The Gateway sent an invalid JSON frame.", "Gateway mengirim frame JSON yang tidak valid."), true)); return; }
      try { frames = lines.map(line => JSON.parse(line)); } catch { this.failConnection(new GatewayError(translate("The Gateway sent an invalid JSON frame.", "Gateway mengirim frame JSON yang tidak valid."), true)); return; }
    }
    if (frames.some(frame => frame === null || typeof frame !== 'object' || Array.isArray(frame))) { this.failConnection(new GatewayError(translate("The Gateway frame format is not recognized.", "Format frame Gateway tidak dikenali."), true)); return; }
    for (const frame of frames) { if (this.closed) break; this.receiveFrame(row(frame)); }
  }

  private receiveFrame(frame: Row): void {
    if (typeof frame.method === 'string' && frame.id !== undefined && frame.id !== null) {
      // This version has no approval/clarify UI. Explicit -32601 withdraws the request;
      // it is not an approval and it avoids leaving the agent waiting for its deadline.
      void sendGateway(this.connectionId, JSON.stringify({ jsonrpc: '2.0', id: frame.id, error: { code: -32601, message: 'Warren belum mendukung permintaan interaktif ini. Gunakan klien Hermes yang mendukungnya.' } })).catch(() => {});
      return;
    }
    if (frame.type === 'tool_artifact') { this.handleEvent({...frame,payload:frame}); return; }
    if (frame.method === 'event') { this.handleEvent(row(frame.params)); return; }
    if (typeof frame.id !== 'number') return;
    const pending = this.pending.get(frame.id);
    if (!pending) return;
    this.pending.delete(frame.id); clearTimeout(pending.timer);
    if (frame.error) {
      const error = row(frame.error);
      pending.reject(new GatewayError(this.safe(str(error.message) || translate("The Gateway rejected the request.", "Gateway menolak permintaan.")), false, typeof error.code === 'number' ? error.code : undefined));
    } else if ('result' in frame) pending.resolve(row(frame.result));
    else pending.reject(new GatewayError(translate("The Gateway reply has no result.", "Balasan Gateway tidak memiliki hasil."), pending.mutation));
  }

  private handleEvent(params: Row): void {
    const type = str(params.type), payload = row(params.payload), sessionId = str(params.session_id);
    if (type === 'gateway.ready') { this.ready?.resolve(payload); return; }
    if (!sessionId) return;
    const epoch = str(params.replay_epoch);
    if (integer(params.seq) && epoch) {
      const key = `${sessionId}\u0000${epoch}`;
      if (params.seq <= (this.sequences.get(key) ?? -1)) return;
      this.sequences.set(key, params.seq);
      if (this.sequences.size > 512) this.sequences.delete(this.sequences.keys().next().value!);
    }
    const session = this.sessions.get(sessionId);
    if (session && type === 'session.info') {
      const previousProfile = this.getSessionProfile(sessionId);
      if (integer(payload.revision)) session.revision = payload.revision;
      if (integer(payload.execution_generation)) session.generation = payload.execution_generation;
      session.info = { ...session.info, ...payload };
      if (previousProfile !== this.getSessionProfile(sessionId)) this.notifySessionProfile(sessionId);
    }
    const turn = this.turns.get(sessionId);
    if (!turn || turn.ended) return;
    if (type === 'session.replay_gap') { this.finish(turn, new GatewayError(translate("Some Gateway events are missing. The final result is unknown; reopen the session to check.", "Sebagian peristiwa Gateway hilang. Hasil akhir belum diketahui; buka ulang sesi untuk memeriksa."), true)); return; }
    if (!turn.admissionId) {
      if (turn.buffer.length >= 2048) this.finish(turn, new GatewayError(translate("Too many events arrived before the Gateway receipt. The result is unknown.", "Terlalu banyak peristiwa sebelum tanda terima Gateway. Hasil belum diketahui."), true));
      else turn.buffer.push(params);
      return;
    }
    this.deliver(turn, params);
  }

  private emit(turn: Turn, event: HermesEvent): void { try { turn.onEvent({ ...event, agentProfile: turn.agentProfile }); } catch { /* UI callbacks do not alter wire accounting. */ } }

  private deliver(turn: Turn, params: Row): void {
    if (turn.ended || str(params.session_id) !== turn.sessionId) return;
    const payload = row(params.payload), type = str(params.type);
    if (str(params.admission_id || payload.admission_id) !== turn.admissionId) return;
    if (type === 'approval.request' || type === 'clarify.request') {
      const generation = params.execution_generation ?? payload.execution_generation;
      if (integer(generation)) void this.rpc('session.interrupt', { session_id: turn.sessionId, execution_generation: generation }, RPC_TIMEOUT, true).catch(() => {});
      this.finish(turn, new GatewayError(translate("Hermes requested an approval or interactive answer that Warren does not support yet. A stop was requested; check the session in a compatible Hermes client.", "Hermes meminta persetujuan atau jawaban interaktif yang belum didukung Warren. Penghentian diminta; periksa sesi di klien Hermes."), true));
    } else if (type === 'tool_artifact' || type === 'tool.artifact' || payload.type === 'tool_artifact') {
      const artifact=parseToolArtifact(payload);
      if(artifact)this.emit(turn,{type:'artifact',artifact});
    } else if (type === 'message.delta' && typeof payload.text === 'string') {
      this.emit(turn, { type: 'delta', text: payload.text });
    } else if (type === 'tool.start' || type === 'tool.complete' || type === 'tool.generating') {
      const label = str(payload.name) || 'tool';
      let args: Row | undefined;
      const rawArgs=payload.arguments??payload.args;
      try { const parsed=typeof rawArgs==='string'?JSON.parse(rawArgs):rawArgs; if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)) args=row(JSON.parse(this.safe(JSON.stringify(parsed)))); } catch { /* Missing or oversized arguments are not reconstructed. */ }
      const output=typeof payload.output==='string'?this.safe(payload.output):payload.output&&typeof payload.output==='object'?this.safe(JSON.stringify(payload.output)):undefined;
      const duration=typeof payload.duration_ms==='number'&&Number.isFinite(payload.duration_ms)&&payload.duration_ms>=0?`${(payload.duration_ms/1000).toFixed(1)}s`:'';
      const id=str(payload.tool_call_id)||str(payload.call_id)||str(payload.id)||crypto.randomUUID();
      const paramValue=args&&(args.command??args.pattern??args.path??args.url);
      const param=typeof paramValue==='string'?JSON.stringify(paramValue):'';
      this.emit(turn, { type: 'tool', text: this.safe(`${type === 'tool.complete' ? translate('Completed', 'Selesai') : translate('Running', 'Menjalankan')}: ${label}${str(payload.summary) ? ` — ${str(payload.summary)}` : ''}`), call:{id:this.safe(id),name:this.safe(label),param:this.safe(param),state:type==='tool.complete'?(payload.status==='error'||payload.is_error===true?'error':'done'):'running',duration,...(args?{args}:{}),...(output!==undefined?{output}:{})} });
    } else if (type === 'message.complete') {
      if (typeof payload.text === 'string') this.emit(turn, { type: 'replace', text: payload.text });
      else if (typeof payload.content === 'string') this.emit(turn, { type: 'replace', text: payload.content });
      const status = str(payload.status), outcome = str(payload.outcome);
      if (status === 'error' || outcome === 'failed') this.finish(turn, new GatewayError(this.safe(str(payload.error) || str(payload.failure_reason) || translate("The Hermes turn failed.", "Giliran Hermes gagal."))));
      else if (status === 'interrupted' || outcome === 'cancelled' || outcome === 'interrupted') this.finish(turn, undefined, 'interrupted');
      else if (status === 'complete' || outcome === 'completed') this.finish(turn);
      else this.finish(turn, new GatewayError(translate("The Gateway ended the turn with an unknown status. Check the session before resending.", "Gateway mengakhiri giliran tanpa status yang dikenali. Periksa sesi sebelum mengirim ulang."), true));
    }
  }

  private finish(turn: Turn, error?: GatewayError, reason = 'stop'): void {
    if (turn.ended) return;
    turn.ended = true; turn.terminalError = error; clearTimeout(turn.timer); turn.resolveAdmission();
    if (this.turns.get(turn.sessionId) === turn) this.turns.delete(turn.sessionId);
    if (error) { this.emit(turn, { type: 'error', message: this.safe(error.message), uncertain: error.uncertain }); turn.reject(error); }
    else { this.emit(turn, { type: 'done', finishReason: reason }); turn.resolve(); }
  }

  private failConnection(error: GatewayError): void {
    const wasClosed = this.closed;
    this.connected = false; this.closed = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.ready?.reject(error);
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new GatewayError(error.message, pending.mutation)); }
    this.pending.clear();
    for (const turn of this.turns.values()) this.finish(turn, new GatewayError(error.message, turn.dispatched));
    if (this.started) {
      this.started = false;
      this.disconnecting = disconnectGateway(this.connectionId).catch(() => {});
    }
    if (!wasClosed) { try { this.onDisconnect?.(); } catch { /* Display callbacks cannot interrupt transport cleanup. */ } }
  }

  private adopt(snapshot: Row): SessionState {
    const id = str(snapshot.session_id), info = row(snapshot.info);
    if (!id || info.desktop_protocol !== 'hermes-gateway-v1' || !integer(snapshot.revision) || !integer(snapshot.execution_generation)) throw new GatewayError(translate("The session snapshot does not match the Hermes Gateway 0.22.4 protocol.", "Snapshot sesi tidak sesuai protokol Hermes Gateway 0.22.4."));
    const state = { id, revision: snapshot.revision, generation: snapshot.execution_generation, info,
      busy: snapshot.running === true || (Array.isArray(snapshot.pending) && snapshot.pending.length > 0) || (Array.isArray(snapshot.prompts) && snapshot.prompts.length > 0) };
    this.sessions.set(id, state);
    this.notifySessionProfile(id);
    const epoch = str(snapshot.replay_epoch);
    if (epoch && integer(snapshot.last_sequence) && !this.turns.has(id)) this.sequences.set(`${id}\u0000${epoch}`, snapshot.last_sequence);
    return state;
  }

  private async refreshSession(sessionId: string): Promise<SessionState> {
    const snapshot = await this.rpc('session.resume', { session_id: sessionId });
    if (str(snapshot.session_id) !== sessionId) {
      const error = new GatewayError(translate("The session identity changed in Hermes. Reopen the session to save its new identity before continuing.", "Identitas sesi berubah di Hermes. Buka kembali sesi agar identitas baru disimpan sebelum melanjutkan."));
      this.failConnection(error);
      throw error;
    }
    return this.adopt(snapshot);
  }

  private async stopTurn(turn: Turn): Promise<string> {
    // /stop may arrive before prompt.submit replies. Do not interrupt a previous
    // generation while this message is still being admitted.
    await turn.admitted;
    if (turn.terminalError) throw turn.terminalError;
    if (turn.ended) return translate("Warren’s request has already ended. No other turn was stopped.", "Pengiriman Warren sudah berakhir. Tidak ada giliran lain yang dihentikan.");
    if (!turn.admissionId) throw new GatewayError(translate("The request identity is unknown. Check the Hermes session before trying to stop again.", "Identitas pengiriman belum diketahui. Periksa sesi Hermes sebelum mencoba berhenti lagi."), true);
    const params = { session_id: turn.sessionId, admission_id: turn.admissionId };
    const receipt = await this.rpc('prompt.receipt', params);
    if (str(receipt.admission_id) !== turn.admissionId || (str(row(receipt.ref).session_id) && str(row(receipt.ref).session_id) !== turn.sessionId)) throw new GatewayError(translate("The stop receipt does not match this request.", "Tanda terima penghentian tidak sesuai pengiriman."));
    if (turn.terminalError) throw turn.terminalError;
    if (turn.ended) return translate("Warren’s request has already ended.", "Pengiriman Warren sudah berakhir.");
    if (receipt.status === 'queued') {
      // A racing claim is refused by Hermes; never fall back to stopping whichever
      // generation happens to be current after that refusal.
      const cancelled = await this.rpc('prompt.cancel', params, RPC_TIMEOUT, true);
      if (cancelled.status !== 'terminal' || cancelled.outcome !== 'cancelled') throw new GatewayError(translate("The Gateway has not confirmed cancellation of the queued request. Check the Hermes session.", "Gateway belum memastikan pembatalan antrean. Periksa sesi Hermes."), true);
      if (!turn.ended) this.finish(turn, undefined, 'interrupted');
      return translate("The queued message was cancelled.", "Pesan dalam antrean dibatalkan.");
    }
    if (receipt.status === 'started' && integer(receipt.execution_generation)) {
      await this.rpc('session.interrupt', { session_id: turn.sessionId, execution_generation: receipt.execution_generation }, RPC_TIMEOUT, true);
      return translate("The stop request for Warren’s turn was accepted.", "Permintaan berhenti untuk giliran Warren diterima.");
    }
    if (receipt.status === 'terminal') return translate("The turn has ended in Hermes. Waiting for its final result.", "Giliran sudah berakhir di Hermes. Menunggu hasil akhirnya.");
    throw new GatewayError(translate("The request status is unknown. Check the Hermes session before stopping it.", "Status pengiriman belum diketahui. Periksa sesi Hermes sebelum menghentikannya."), true);
  }

  async ensureSession(storedId?: string): Promise<{ sessionId: string }> {
    await this.connect();
    const result = storedId
      ? await this.rpc('session.resume', { session_id: storedId })
      : await this.rpc('session.create', { request_id: crypto.randomUUID(), source: 'gui',
        ...(this.profile.model.trim() ? { model: this.profile.model.trim() } : {}) }, RPC_TIMEOUT, true);
    return { sessionId: this.adopt(result).id };
  }

  async catalog(sessionId: string): Promise<SlashCommand[]> {
    const result = await this.rpc('commands.catalog', { session_id: sessionId });
    const names = new Set<string>();
    const descriptions = new Map<string, string>();
    const add = (name: unknown) => { if (typeof name === 'string') names.add(name.replace(/^\//, '').toLowerCase()); };
    if (Array.isArray(result.pairs)) for (const pair of result.pairs) if (Array.isArray(pair)) { add(pair[0]); if (typeof pair[0] === 'string' && typeof pair[1] === 'string') descriptions.set(pair[0].replace(/^\//, ''), pair[1]); }
    for (const key of Object.keys(row(result.commands))) add(key);
    for (const [alias, canonical] of Object.entries(row(result.canon))) { add(alias); add(canonical); }
    const commands = routes().map(({ aliases, ...route }) => {
      const available = route.name === 'help' || route.name === 'new' || [route.name, ...(aliases ?? [])].some(name => names.has(name));
      return { ...route, description: descriptions.get(route.name) || route.description, available,
        ...(available ? {} : { reason: translate("This Gateway does not advertise this command.", "Perintah belum diiklankan oleh Gateway ini.") }) };
    });
    this.catalogs.set(sessionId, commands);
    return commands;
  }

  async command(sessionId: string, text: string): Promise<string> {
    const match = /^\/([^\s/]+)([\s\S]*)$/.exec(text.trim());
    if (!match) throw new GatewayError(translate("Invalid slash command.", "Perintah slash tidak valid."));
    const name = match[1].toLowerCase() === 'compress' ? 'compact' : match[1].toLowerCase(), arg = match[2].trim();
    if (!routes().some(route => route.name === name)) throw new GatewayError(translate("Warren does not support this command yet.", "Perintah ini belum didukung Warren."));
    if (this.catalogs.get(sessionId)?.find(command => command.name === name)?.available === false) throw new GatewayError(translate("The Gateway does not advertise this command.", "Perintah ini belum diiklankan Gateway."));
    if (name === 'status' || name === 'usage') {
      if (arg) throw new GatewayError(translate(`/${name} does not accept arguments in Warren.`, `/${name} tidak menerima argumen di Warren.`));
      const result = await this.rpc('slash.exec', { session_id: sessionId, command: `/${name}` });
      if (result.type && result.type !== 'exec' && result.type !== 'plugin') throw new GatewayError(translate("The Gateway returned a different action. It was not run automatically.", "Gateway mengembalikan aksi berbeda; tidak dijalankan otomatis."));
      return this.safe(str(result.output) || translate("The Gateway returned no report text.", "Gateway tidak mengembalikan teks laporan."));
    }
    if (name === 'help' || name === 'new') throw new GatewayError(translate(`/${name} is handled by Warren.`, `/${name} dijalankan oleh antarmuka Warren.`));
    if (name === 'stop' && arg) throw new GatewayError(translate("/stop does not accept arguments.", "/stop tidak menerima argumen."));
    const activeTurn = this.turns.get(sessionId);
    if (name === 'stop' && activeTurn) return this.stopTurn(activeTurn);
    // Fresh snapshot supplies the revision fence; a concurrent change is refused, never retried.
    const session = await this.refreshSession(sessionId);
    if (name === 'stop') {
      await this.rpc('session.interrupt', { session_id: session.id, execution_generation: session.generation }, RPC_TIMEOUT, true);
      const result = await this.rpc('process.stop', { session_id: session.id }, RPC_TIMEOUT, true);
      return `${translate("Stop request accepted.", "Permintaan berhenti diterima.")}${typeof result.killed === 'number' ? translate(` ${result.killed} processes stopped.`, ` ${result.killed} proses dihentikan.`) : ''}`;
    }
    if (name === 'model' && !arg) return `Model: ${str(session.info.model) || translate("unavailable", "tidak tersedia")}${str(session.info.provider) ? ` (${str(session.info.provider)})` : ''}`;
    const payload: Row = name === 'compact' ? (arg ? { focus: arg } : {}) : this.modelPayload(arg);
    const result = await this.rpc('session.mutate', { session_id: session.id, request_id: crypto.randomUUID(),
      expected_revision: session.revision, expected_generation: session.generation, operation: name === 'compact' ? 'compress' : 'model', payload }, name === 'compact' ? 660_000 : RPC_TIMEOUT, true);
    if (integer(result.revision)) session.revision = result.revision;
    if (result.confirm_required === true || result.status === 'confirmation_required') return this.safe(`${str(result.confirm_message) || translate("Hermes requires confirmation.", "Hermes memerlukan konfirmasi.")}\n${translate("Changes have not been applied. Confirm them in a compatible Hermes client.", "Perubahan belum diterapkan. Konfirmasi melalui klien Hermes yang mendukungnya.")}`);
    if (Array.isArray(result.lines)) return this.safe(result.lines.filter(line => typeof line === 'string').join('\n'));
    if (typeof result.output === 'string') return this.safe(result.output);
    if (typeof result.message === 'string') return this.safe(result.message);
    if (typeof result.status === 'string') return `Hermes: ${this.safe(result.status)}.`;
    return integer(result.revision) ? translate("Session changes saved in Hermes.", "Perubahan sesi tersimpan di Hermes.") : translate("The Gateway replied without a change summary. Check /status.", "Gateway menjawab tanpa ringkasan perubahan. Periksa /status.");
  }

  private modelPayload(arg: string): Row {
    const parts = arg.split(/\s+/); let model = '', provider = '';
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '--provider' && parts[i + 1] && !parts[i + 1].startsWith('--')) provider = parts[++i];
      else if (parts[i] === '--session') continue;
      else if (!model && !parts[i].startsWith('--')) model = parts[i];
      else throw new GatewayError(translate("Use /model MODEL [--provider PROVIDER]. Other flags are not supported yet.", "Gunakan /model MODEL [--provider PROVIDER]. Flag lain belum didukung."));
    }
    if (!model) throw new GatewayError(translate("A model name is required.", "Nama model diperlukan."));
    // Model IDs can contain colons (for example provider suffixes). Resolution
    // belongs to Hermes; only the explicit --provider flag chooses a provider here.
    if (!model || (arg.includes('--provider') && !provider)) throw new GatewayError(translate("The model or provider name is invalid.", "Nama model atau provider tidak valid."));
    return { model, ...(provider ? { provider } : {}) };
  }

  async send(sessionId: string, text: string, submissionId: string, onEvent: (event: HermesEvent) => void): Promise<void> {
    if (!this.sessions.has(sessionId)) throw new GatewayError(translate("This session has not been opened through the Gateway.", "Sesi belum dibuka melalui Gateway."));
    if (!text.trim() || !submissionId) throw new GatewayError(translate("A message and request identity are required.", "Pesan dan identitas pengiriman diperlukan."));
    if (this.turns.has(sessionId)) throw new GatewayError(translate("This session already has an active request.", "Masih ada pengiriman aktif untuk sesi ini."));
    let turn!: Turn;
    let resolveAdmission!: () => void;
    const admitted = new Promise<void>(resolve => { resolveAdmission = resolve; });
    const completion = new Promise<void>((resolve, reject) => {
      turn = { sessionId, buffer: [], ended: false, dispatched: false, admitted, resolveAdmission, onEvent, resolve, reject,
        timer: setTimeout(() => this.finish(turn, new GatewayError(translate("The turn timed out. Its result is unknown; check the session before resending.", "Batas waktu menunggu giliran terlewati. Hasil belum diketahui; periksa sesi sebelum mengirim ulang."), true)), TURN_TIMEOUT) };
    });
    // A native close may reject completion synchronously while admission RPC is still pending.
    void completion.catch(() => {});
    this.turns.set(sessionId, turn);
    try {
      const session = await this.refreshSession(sessionId);
      if (session.busy) throw new GatewayError(translate("The Hermes session is busy or has queued work. Wait for it to finish, then send again.", "Sesi sedang berjalan atau memiliki antrean di Hermes. Tunggu selesai lalu kirim lagi."));
      if (turn.ended) return await completion;
      // Identity comes from the already-refreshed canonical snapshot, never a model
      // identifier or raw profile_id (which may be a private filesystem path).
      turn.agentProfile = this.getSessionProfile(sessionId);
      turn.dispatched = true;
      const receipt = await this.rpc('prompt.submit', { session_id: sessionId, submission_id: submissionId, text, clarify_batch: true }, RPC_TIMEOUT, true);
      if (turn.ended) return await completion;
      const admissionId = str(receipt.admission_id);
      if (!admissionId || !['queued', 'started', 'unknown', 'terminal'].includes(str(receipt.status))) throw new GatewayError(translate("The Gateway did not return a valid request receipt. The result is unknown.", "Gateway tidak memberikan tanda terima pengiriman yang valid. Hasil belum diketahui."), true);
      if (str(row(receipt.ref).session_id) && str(row(receipt.ref).session_id) !== sessionId) throw new GatewayError(translate("The Gateway replied for another session. The result is unknown.", "Gateway membalas untuk sesi lain. Hasil belum diketahui."), true);
      turn.admissionId = admissionId;
      turn.resolveAdmission();
      for (const buffered of turn.buffer) this.deliver(turn, buffered);
      turn.buffer = [];
      if (!turn.ended && receipt.status === 'unknown') this.finish(turn, new GatewayError(translate("Hermes could not confirm this turn’s result. It was not resent automatically.", "Hermes tidak dapat memastikan hasil giliran ini. Tidak dikirim ulang otomatis."), true));
      if (!turn.ended && receipt.status === 'terminal') this.finish(turn, new GatewayError(translate("This request has already ended. Check Hermes history; the message was not resent.", "Pengiriman sudah berakhir sebelumnya. Periksa riwayat Hermes; pesan tidak dikirim ulang."), true));
    } catch (error) {
      this.finish(turn, error instanceof GatewayError ? error : new GatewayError(this.safe(error instanceof Error ? error.message : String(error)), true));
    }
    return completion;
  }

  async close(): Promise<void> {
    this.failConnection(new GatewayError(translate("The Gateway connection closed. Active request results are unknown.", "Koneksi Gateway ditutup. Hasil pengiriman aktif belum diketahui."), true));
    await this.disconnecting;
  }
}
