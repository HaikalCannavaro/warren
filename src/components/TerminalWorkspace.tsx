import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ClipboardPaste, Command, CornerDownLeft, Plus, Server, ShieldCheck, TerminalSquare, X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import type { Settings, TerminalSession, VpsProfile } from '../types';
import { sanitizePaste } from '../lib/domain';
import { Dialog } from './Dialog';

type TerminalActions = {
  subscribeTerminal: (id: string, callback: (bytes: Uint8Array) => void) => () => void;
  writeTerminal: (id: string, data: string) => Promise<void>;
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>;
};
const statusLabels: Record<TerminalSession['status'], string> = { connecting: 'Menghubungkan', connected: 'Terhubung', disconnected: 'Terputus', error: 'Gagal terhubung' };

export function TerminalWorkspace({ sessions, activeSessionId, profiles, settings, preview, visible, onAdd, onConnect, onSelect, onClose, ...actions }: TerminalActions & {
  sessions: TerminalSession[]; activeSessionId: string | null; profiles: VpsProfile[]; settings: Settings; preview: boolean; visible: boolean;
  onAdd: () => void; onConnect: (id: string) => void; onSelect: (id: string) => void; onClose: (session: TerminalSession) => void;
}) {
  return <section className="terminal-workspace panel" aria-label="Workspace terminal">
    <div className="terminal-tabs" role="tablist" aria-label="Sesi terminal">
      {sessions.length ? sessions.map((session) => <div className={`session-tab ${session.id === activeSessionId ? 'active' : ''}`} key={session.id}><button id={`session-tab-${session.id}`} role="tab" aria-selected={session.id === activeSessionId} aria-controls={`session-panel-${session.id}`} onClick={() => onSelect(session.id)}><span className={`status-dot ${session.status}`}/><span>{session.label}</span></button><button className="tab-close" aria-label={`Tutup sesi ${session.label}`} onClick={() => onClose(session)}><X size={13}/></button></div>) : <div className="empty-tab"><TerminalSquare size={15}/><span>Workspace</span></div>}
      <button className="icon-button add-session" onClick={onAdd} aria-label="Tambahkan koneksi VPS"><Plus size={17}/></button>
      <span className="terminal-tabs-meta">SSH</span>
    </div>
    {!sessions.length && <div className="terminal-empty">
      <div className="terminal-illustration" aria-hidden="true"><div className="illustration-top"><i/><i/><i/><span>warren / terminal</span></div><div className="illustration-body"><span className="terminal-prompt">›</span><span className="illustration-cursor"/><div className="illustration-lines"><i/><i/></div></div><span className="illustration-badge"><ShieldCheck size={15}/></span></div>
      <span className="eyebrow">RUANG KERJA ANDA, SIAP</span>
      <h2>Server Anda. Satu tempat.</h2>
      <p>Mulai sesi SSH yang aman, berpindah antar server,<br className="desktop-break"/> dan tetap pegang kendali dari perangkat Anda.</p>
      {profiles.length ? <div className="empty-connection-list">{profiles.slice(0, 3).map((profile) => <button key={profile.id} className="button secondary" disabled={preview} onClick={() => onConnect(profile.id)}><Server size={16}/>{profile.name}<ArrowRight size={15}/></button>)}</div> : <button className="button primary" onClick={onAdd}><Plus size={17}/> Tambahkan VPS pertama</button>}
      {preview && profiles.length > 0 && <p className="small-note">Koneksi SSH tersedia di aplikasi Windows dan Android.</p>}
      <div className="empty-features"><span><ShieldCheck size={14}/> Verifikasi host key</span><span><Command size={14}/> Banyak sesi</span><span><ClipboardPaste size={14}/> Pratinjau paste</span></div>
    </div>}
    {sessions.map((session) => <TerminalPane key={session.id} session={session} settings={settings} visible={visible && session.id === activeSessionId} selected={session.id === activeSessionId} {...actions}/>)}
    <div className="terminal-statusbar"><span><span className={`status-dot ${sessions.some((session) => session.status === 'connected') ? 'connected' : ''}`}/>{sessions.filter((session) => session.status === 'connected').length} sesi terhubung</span><span>UTF-8 <i/> xterm <i/> {settings.fontSize}px</span></div>
  </section>;
}

function TerminalPane({ session, settings, visible, selected, subscribeTerminal, writeTerminal, resizeTerminal }: TerminalActions & { session: TerminalSession; settings: Settings; visible: boolean; selected: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const latest = useRef({ subscribeTerminal, writeTerminal, resizeTerminal, status: session.status });
  latest.current = { subscribeTerminal, writeTerminal, resizeTerminal, status: session.status };
  const [paste, setPaste] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const term = new Terminal({ cursorBlink: true, fontSize: settings.fontSize, fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace', scrollback: settings.scrollback, convertEol: false, allowProposedApi: false, theme: { background: '#0b121d', foreground: '#d4dce8', cursor: '#6ee7cb', cursorAccent: '#0b121d', selectionBackground: '#27594f', black: '#17202d', red: '#f58b94', green: '#7adbb2', yellow: '#ead18d', blue: '#83adf2', magenta: '#c4a0ed', cyan: '#7ed3de', white: '#dce4f0', brightBlack: '#637086', brightRed: '#ff9da5', brightGreen: '#a3edc9', brightYellow: '#f1dfad', brightBlue: '#a5c6ff', brightMagenta: '#d8baf7', brightCyan: '#a4e8ef', brightWhite: '#f3f6fc' } });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(element);
    terminal.current = term;
    fit.current = fitAddon;
    const incoming = latest.current.subscribeTerminal(session.id, (bytes) => term.write(bytes));
    const outgoing = term.onData((data) => { if (latest.current.status === 'connected') void latest.current.writeTerminal(session.id, data).catch((cause) => setError(String(cause))); });
    const resize = term.onResize(({ cols, rows }) => { if (latest.current.status === 'connected') void latest.current.resizeTerminal(session.id, cols, rows).catch((cause) => setError(String(cause))); });
    const resizeObserver = new ResizeObserver(() => { if (element.clientWidth > 0 && element.clientHeight > 0) fitAddon.fit(); });
    resizeObserver.observe(element);
    const interceptPaste = (event: ClipboardEvent) => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); const value = event.clipboardData?.getData('text/plain'); if (value) setPaste(value); };
    element.addEventListener('paste', interceptPaste, true);
    return () => { incoming(); outgoing.dispose(); resize.dispose(); resizeObserver.disconnect(); element.removeEventListener('paste', interceptPaste, true); term.dispose(); terminal.current = null; fit.current = null; };
    // A terminal lives for its session, including while hidden. Callback refs avoid resetting its buffer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);
  useEffect(() => { if (terminal.current) { terminal.current.options.fontSize = settings.fontSize; terminal.current.options.scrollback = settings.scrollback; } if (visible && container.current?.clientWidth) fit.current?.fit(); }, [settings.fontSize, settings.scrollback, visible]);
  useEffect(() => { if (!visible) return; const frame = requestAnimationFrame(() => { if (container.current?.clientWidth) { fit.current?.fit(); terminal.current?.focus(); if (session.status === 'connected' && terminal.current) void latest.current.resizeTerminal(session.id, terminal.current.cols, terminal.current.rows).catch((cause) => setError(String(cause))); } }); return () => cancelAnimationFrame(frame); }, [visible, session.status, session.id]);
  const sendKey = (data: string) => { if (session.status === 'connected') void writeTerminal(session.id, data).catch((cause) => setError(String(cause))); terminal.current?.focus(); };
  return <div id={`session-panel-${session.id}`} role="tabpanel" aria-labelledby={`session-tab-${session.id}`} className="terminal-pane" style={{ display: selected ? 'flex' : 'none' }}>
    <div className="session-info"><span className={`status-dot ${session.status}`}/><span>{statusLabels[session.status]}</span><span className="session-host">{session.host}</span></div>
    {session.error && <p className="terminal-error" role="alert">{session.error}</p>}
    {error && <div className="terminal-error" role="alert">{error}<button className="icon-button" aria-label="Tutup pesan kesalahan" onClick={() => setError('')}><X size={14}/></button></div>}
    <div className="xterm-container" ref={container} aria-label={`Terminal ${session.label}`}/>
    <div className="terminal-keybar" aria-label="Tombol pintasan terminal">
      <button disabled={session.status !== 'connected'} onClick={() => sendKey('\x03')}>Ctrl C</button><button disabled={session.status !== 'connected'} onClick={() => sendKey('\x1b')}>Esc</button><button disabled={session.status !== 'connected'} onClick={() => sendKey('\t')}>Tab</button>
      <span className="keybar-divider"/>
      <button disabled={session.status !== 'connected'} aria-label="Panah kiri" onClick={() => sendKey('\x1b[D')}><ArrowLeft size={15}/></button><button disabled={session.status !== 'connected'} aria-label="Panah atas" onClick={() => sendKey('\x1b[A')}><ArrowUp size={15}/></button><button disabled={session.status !== 'connected'} aria-label="Panah bawah" onClick={() => sendKey('\x1b[B')}><ArrowDown size={15}/></button><button disabled={session.status !== 'connected'} aria-label="Panah kanan" onClick={() => sendKey('\x1b[C')}><ArrowRight size={15}/></button>
      <button disabled={session.status !== 'connected'} aria-label="Enter" onClick={() => sendKey('\r')}><CornerDownLeft size={15}/></button>
      <button className="paste-key" disabled={session.status !== 'connected'} onClick={async () => { try { const text = await navigator.clipboard.readText(); if (text) setPaste(text); } catch { setError('Akses clipboard tidak tersedia. Gunakan pintasan paste perangkat.'); } }}><ClipboardPaste size={14}/><span>Paste</span></button>
    </div>
    {paste !== null && <Dialog title="Tinjau sebelum paste" description="Belum ada teks yang dikirim ke server. Periksa seluruh isi sebelum melanjutkan." onClose={() => { setPaste(null); terminal.current?.focus(); }} wide>
      <div className="paste-review"><span className="field-label">Isi clipboard · karakter kontrol ditampilkan</span><pre className="paste-preview">{visibleControls(paste)}</pre>{paste !== sanitizePaste(paste) && <p className="form-note">Karakter kontrol yang tidak aman akan dibuang; akhir baris dinormalisasi.</p>}<span className="field-label">Teks yang akan dikirim</span><pre className="paste-preview sanitized">{visibleControls(sanitizePaste(paste)) || '(kosong setelah dibersihkan)'}</pre>{sanitizePaste(paste).includes('\n') && <p className="inline-warning">Teks berisi baris baru. Menempelkan teks ini dapat langsung menjalankan perintah di server.</p>}<div className="dialog-actions"><button className="button secondary" onClick={() => { setPaste(null); terminal.current?.focus(); }}>Batal</button><button className="button primary" disabled={session.status !== 'connected' || !sanitizePaste(paste)} onClick={() => { sendKey(sanitizePaste(paste)); setPaste(null); }}>Tempel ke terminal</button></div></div>
    </Dialog>}
  </div>;
}

function visibleControls(value: string) {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, (character) => {
    if (character === '\n') return '↵\n';
    if (character === '\t') return '⇥';
    if (character === '\r') return '⟦CR⟧';
    if (character === '\x1b') return '⟦ESC⟧';
    return `⟦0x${character.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}⟧`;
  });
}
