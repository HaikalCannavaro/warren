import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ClipboardPaste, Command, CornerDownLeft, Plus, Server, ShieldCheck, TerminalSquare, X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import type { Settings, TerminalSession, VpsProfile } from '../types';
import { sanitizePaste } from '../lib/domain';
import { registerTerminal } from '../lib/terminalBridge';
import { Dialog } from './Dialog';
import { useI18n } from '../lib/i18n';

type TerminalActions = {
  subscribeTerminal: (id: string, callback: (bytes: Uint8Array) => void) => () => void;
  writeTerminal: (id: string, data: string) => Promise<void>;
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>;
};

export function TerminalWorkspace({ sessions, activeSessionId, profiles, settings, preview, visible, onAdd, onConnect, onSelect, onClose, ...actions }: TerminalActions & {
  sessions: TerminalSession[]; activeSessionId: string | null; profiles: VpsProfile[]; settings: Settings; preview: boolean; visible: boolean;
  onAdd: () => void; onConnect: (id: string) => void; onSelect: (id: string) => void; onClose: (session: TerminalSession) => void;
}) {
  const { t } = useI18n();
  return <section className="terminal-workspace panel" aria-label={t("Terminal workspace", "Workspace terminal")}>
    <div className="terminal-tabs" role="tablist" aria-label={t("Terminal sessions", "Sesi terminal")}>
      {sessions.length ? sessions.map((session) => <div className={`session-tab ${session.id === activeSessionId ? 'active' : ''}`} key={session.id}><button id={`session-tab-${session.id}`} role="tab" aria-selected={session.id === activeSessionId} aria-controls={`session-panel-${session.id}`} onClick={() => onSelect(session.id)}><span className={`status-dot ${session.status}`}/><span>{session.label}</span></button><button className="tab-close" aria-label={t(`Close session ${session.label}`, `Tutup sesi ${session.label}`)} onClick={() => onClose(session)}><X size={13}/></button></div>) : <div className="empty-tab"><TerminalSquare size={15}/><span>{t('Workspace', 'Ruang kerja')}</span></div>}
      <button className="icon-button add-session" onClick={onAdd} aria-label={t("Add VPS connection", "Tambahkan koneksi VPS")}><Plus size={17}/></button>
      <span className="terminal-tabs-meta">SSH</span>
    </div>
    {!sessions.length && <div className="terminal-empty">
      <div className="terminal-illustration" aria-hidden="true"><div className="illustration-top"><i/><i/><i/><span>warren / terminal</span></div><div className="illustration-body"><span className="terminal-prompt">›</span><span className="illustration-cursor"/><div className="illustration-lines"><i/><i/></div></div><span className="illustration-badge"><ShieldCheck size={15}/></span></div>
      <span className="eyebrow">{t("YOUR WORKSPACE IS READY", "RUANG KERJA ANDA, SIAP")}</span>
      <h2>{t("Your servers. One place.", "Server Anda. Satu tempat.")}</h2>
      <p>{t("Start a secure SSH session, switch between servers,", "Mulai sesi SSH yang aman, berpindah antar server,")}<br className="desktop-break"/> {t("and stay in control from your device.", "dan tetap pegang kendali dari perangkat Anda.")}</p>
      {profiles.length ? <div className="empty-connection-list">{profiles.slice(0, 3).map((profile) => <button key={profile.id} className="button secondary" disabled={preview} onClick={() => onConnect(profile.id)}><Server size={16}/>{profile.name}<ArrowRight size={15}/></button>)}</div> : <button className="button primary" onClick={onAdd}><Plus size={17}/> {t("Add your first VPS", "Tambahkan VPS pertama")}</button>}
      {preview && profiles.length > 0 && <p className="small-note">{t("Connect over SSH in the Windows or Android app.", "Koneksi SSH tersedia di aplikasi Windows dan Android.")}</p>}
      <div className="empty-features"><span><ShieldCheck size={14}/> {t("Host key verification", "Verifikasi host key")}</span><span><Command size={14}/> {t("Multiple sessions", "Banyak sesi")}</span><span><ClipboardPaste size={14}/> {t("Review before pasting", "Pratinjau paste")}</span></div>
    </div>}
    {sessions.map((session) => <TerminalPane key={session.id} session={session} settings={settings} visible={visible && session.id === activeSessionId} selected={session.id === activeSessionId} {...actions}/>)}
    <div className="terminal-statusbar"><span><span className={`status-dot ${sessions.some((session) => session.status === 'connected') ? 'connected' : ''}`}/>{sessions.filter((session) => session.status === 'connected').length} {t(sessions.filter(session => session.status === 'connected').length === 1 ? 'connected session' : 'connected sessions', 'sesi terhubung')}</span><span>UTF-8 <i/> xterm <i/> {settings.fontSize}px</span></div>
  </section>;
}

function TerminalPane({ session, settings, visible, selected, subscribeTerminal, writeTerminal, resizeTerminal }: TerminalActions & { session: TerminalSession; settings: Settings; visible: boolean; selected: boolean }) {
  const { t } = useI18n();
  const statusLabels: Record<TerminalSession['status'], string> = { connecting: t('Connecting', 'Menghubungkan'), connected: t('Connected', 'Terhubung'), disconnected: t('Disconnected', 'Terputus'), error: t('Connection failed', 'Gagal terhubung') };
  const container = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const latest = useRef({ subscribeTerminal, writeTerminal, resizeTerminal, status: session.status });
  latest.current = { subscribeTerminal, writeTerminal, resizeTerminal, status: session.status };
  const [paste, setPaste] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fitTerminal = useCallback(() => {
    const element = container.current;
    const term = terminal.current;
    const fitAddon = fit.current;
    if (!element || !term || !fitAddon) return;
    if (element.clientWidth <= 0 || element.clientHeight <= 0) return;
    fitAddon.fit();
    const cell = (term as unknown as {
      _core?: { _renderService?: { dimensions?: { css?: { cell?: { width?: number; height?: number } } } } };
    })._core?._renderService?.dimensions?.css?.cell;
    if (cell && cell.width && cell.width > 0 && cell.height && cell.height > 0) {
      const maxCols = Math.max(2, Math.floor((element.clientWidth - 2) / cell.width));
      const maxRows = Math.max(1, Math.floor((element.clientHeight - 2) / cell.height));
      if (term.cols > maxCols || term.rows > maxRows) {
        term.resize?.(Math.min(term.cols, maxCols), Math.min(term.rows, maxRows));
      }
    }
    const activeBuffer = (term as unknown as { buffer?: { active?: { baseY: number; viewportY: number } } }).buffer?.active;
    if (activeBuffer && activeBuffer.baseY - activeBuffer.viewportY <= 2) {
      (term as unknown as { scrollToBottom?: () => void }).scrollToBottom?.();
    }
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const term = new Terminal({ cursorBlink: true, fontSize: settings.fontSize, fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", monospace', scrollback: settings.scrollback, convertEol: false, allowProposedApi: false, theme: { background: '#0b121d', foreground: '#d4dce8', cursor: '#6ee7cb', cursorAccent: '#0b121d', selectionBackground: '#27594f', black: '#17202d', red: '#f58b94', green: '#7adbb2', yellow: '#ead18d', blue: '#83adf2', magenta: '#c4a0ed', cyan: '#7ed3de', white: '#dce4f0', brightBlack: '#637086', brightRed: '#ff9da5', brightGreen: '#a3edc9', brightYellow: '#f1dfad', brightBlue: '#a5c6ff', brightMagenta: '#d8baf7', brightCyan: '#a4e8ef', brightWhite: '#f3f6fc' } });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(element);
    terminal.current = term;
    fit.current = fitAddon;
    const unregisterTerminal = registerTerminal(session.id, term);
    const incoming = latest.current.subscribeTerminal(session.id, (bytes) => term.write(bytes));
    const outgoing = term.onData((data) => { if (latest.current.status === 'connected') void latest.current.writeTerminal(session.id, data).catch((cause) => setError(String(cause))); });
    const resize = term.onResize(({ cols, rows }) => { if (latest.current.status === 'connected') void latest.current.resizeTerminal(session.id, cols, rows).catch((cause) => setError(String(cause))); });
    const resizeObserver = new ResizeObserver(() => { fitTerminal(); });
    resizeObserver.observe(element);
    const handleViewportResize = () => { fitTerminal(); };
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
    viewport?.addEventListener('resize', handleViewportResize);
    const interceptPaste = (event: ClipboardEvent) => { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); const value = event.clipboardData?.getData('text/plain'); if (value) setPaste(value); };
    element.addEventListener('paste', interceptPaste, true);
    return () => {
      unregisterTerminal();
      incoming();
      outgoing.dispose();
      resize.dispose();
      resizeObserver.disconnect();
      viewport?.removeEventListener('resize', handleViewportResize);
      element.removeEventListener('paste', interceptPaste, true);
      term.dispose();
      terminal.current = null;
      fit.current = null;
    };
    // A terminal lives for its session, including while hidden. Callback refs avoid resetting its buffer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);
  useEffect(() => { if (terminal.current) { terminal.current.options.fontSize = settings.fontSize; terminal.current.options.scrollback = settings.scrollback; } if (visible && container.current?.clientWidth) fitTerminal(); }, [settings.fontSize, settings.scrollback, visible, fitTerminal]);
  useEffect(() => { if (!visible) return; const frame = requestAnimationFrame(() => { if (container.current?.clientWidth) { fitTerminal(); terminal.current?.focus(); if (session.status === 'connected' && terminal.current) void latest.current.resizeTerminal(session.id, terminal.current.cols, terminal.current.rows).catch((cause) => setError(String(cause))); } }); return () => cancelAnimationFrame(frame); }, [visible, session.status, session.id, fitTerminal]);
  const sendKey = (data: string) => { if (session.status === 'connected') void writeTerminal(session.id, data).catch((cause) => setError(String(cause))); terminal.current?.focus(); };
  return <div id={`session-panel-${session.id}`} role="tabpanel" aria-labelledby={`session-tab-${session.id}`} className="terminal-pane" style={{ display: selected ? 'flex' : 'none' }}>
    <div className="session-info"><span className={`status-dot ${session.status}`}/><span>{statusLabels[session.status]}</span><span className="session-host">{session.host}</span></div>
    {session.error && <p className="terminal-error" role="alert">{session.error}</p>}
    {error && <div className="terminal-error" role="alert">{error}<button className="icon-button" aria-label={t("Dismiss error", "Tutup pesan kesalahan")} onClick={() => setError('')}><X size={14}/></button></div>}
    <div className="xterm-shell"><div className="xterm-container" ref={container} aria-label={`Terminal ${session.label}`}/></div>
    <div className="terminal-keybar" aria-label={t("Terminal shortcuts", "Tombol pintasan terminal")}>
      <button disabled={session.status !== 'connected'} onClick={() => sendKey('\x03')}>Ctrl C</button><button disabled={session.status !== 'connected'} onClick={() => sendKey('\x1b')}>Esc</button><button disabled={session.status !== 'connected'} onClick={() => sendKey('\t')}>Tab</button>
      <span className="keybar-divider"/>
      <button disabled={session.status !== 'connected'} aria-label={t("Left arrow", "Panah kiri")} onClick={() => sendKey('\x1b[D')}><ArrowLeft size={15}/></button><button disabled={session.status !== 'connected'} aria-label={t("Up arrow", "Panah atas")} onClick={() => sendKey('\x1b[A')}><ArrowUp size={15}/></button><button disabled={session.status !== 'connected'} aria-label={t("Down arrow", "Panah bawah")} onClick={() => sendKey('\x1b[B')}><ArrowDown size={15}/></button><button disabled={session.status !== 'connected'} aria-label={t("Right arrow", "Panah kanan")} onClick={() => sendKey('\x1b[C')}><ArrowRight size={15}/></button>
      <button disabled={session.status !== 'connected'} aria-label="Enter" onClick={() => sendKey('\r')}><CornerDownLeft size={15}/></button>
      <button className="paste-key" disabled={session.status !== 'connected'} onClick={async () => { try { const text = await navigator.clipboard.readText(); if (text) setPaste(text); } catch { setError(t("Clipboard access is unavailable. Use your device’s paste shortcut.", "Akses clipboard tidak tersedia. Gunakan pintasan paste perangkat.")); } }}><ClipboardPaste size={14}/><span>{t('Paste', 'Tempel')}</span></button>
    </div>
    {paste !== null && <Dialog title={t("Review before pasting", "Tinjau sebelum paste")} description={t("Nothing has been sent to the server. Review the full text before continuing.", "Belum ada teks yang dikirim ke server. Periksa seluruh isi sebelum melanjutkan.")} onClose={() => { setPaste(null); terminal.current?.focus(); }} wide>
      <div className="paste-review"><span className="field-label">{t("Clipboard text · control characters shown", "Isi clipboard · karakter kontrol ditampilkan")}</span><pre className="paste-preview">{visibleControls(paste)}</pre>{paste !== sanitizePaste(paste) && <p className="form-note">{t("Unsafe control characters will be removed and line endings normalized.", "Karakter kontrol yang tidak aman akan dibuang; akhir baris dinormalisasi.")}</p>}<span className="field-label">{t("Text to send", "Teks yang akan dikirim")}</span><pre className="paste-preview sanitized">{visibleControls(sanitizePaste(paste)) || t("(empty after cleaning)", "(kosong setelah dibersihkan)")}</pre>{sanitizePaste(paste).includes('\n') && <p className="inline-warning">{t("This text contains line breaks. Pasting it may immediately run commands on the server.", "Teks berisi baris baru. Menempelkan teks ini dapat langsung menjalankan perintah di server.")}</p>}<div className="dialog-actions"><button className="button secondary" onClick={() => { setPaste(null); terminal.current?.focus(); }}>{t("Cancel", "Batal")}</button><button className="button primary" disabled={session.status !== 'connected' || !sanitizePaste(paste)} onClick={() => { sendKey(sanitizePaste(paste)); setPaste(null); }}>{t("Paste into terminal", "Tempel ke terminal")}</button></div></div>
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
