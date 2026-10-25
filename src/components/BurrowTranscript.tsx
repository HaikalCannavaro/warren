import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ArrowRight, Check, Code2, Copy, FileCheck2, LoaderCircle, ShieldCheck, X } from 'lucide-react';
import { agentName, parseTranscript, type A2AAuditEntry, type A2ATranscript } from '../lib/burrow';
import { readBurrowTranscript } from '../lib/native';
import { useI18n } from '../lib/i18n';

function textContent(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textContent(child.props.children) : '').join('');
}
function SectionLabel({ children }: { children?: ReactNode }) {
  const text = textContent(children);
  return /evidence[ _-]+manifest/i.test(text) ? <span className="burrow-section-label evidence"><FileCheck2 size={15}/>{children}</span> : /verification|verifikasi/i.test(text) ? <span className="burrow-section-label verification"><ShieldCheck size={15}/>{children}</span> : <>{children}</>;
}
function TranscriptMarkdown({ content }: { content: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]} skipHtml components={{
    h1: ({ children }) => <h1><SectionLabel>{children}</SectionLabel></h1>,
    h2: ({ children }) => <h2><SectionLabel>{children}</SectionLabel></h2>,
    h3: ({ children }) => <h3><SectionLabel>{children}</SectionLabel></h3>,
    blockquote: ({ children }) => <blockquote className={/verif|\bPASS\b|\bFAIL\b/.test(textContent(children)) ? 'burrow-verification-block' : undefined}>{children}</blockquote>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
    img: ({ alt }) => <span>[{alt || 'Image'}]</span>,
    td: ({ children }) => <td><span className={/^(PASS|FAIL|REVIEW|VERIFIED|PENDING|COMPLETE)$/i.test(textContent(children).trim()) ? `burrow-inline-status ${/fail/i.test(textContent(children)) ? 'failed' : /review|pending/i.test(textContent(children)) ? 'running' : 'completed'}` : undefined}>{children}</span></td>,
  }}>{content}</ReactMarkdown>;
}
export function BurrowTranscript({ entry, sessionId, onClose }: { entry: A2AAuditEntry; sessionId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const [transcript, setTranscript] = useState<A2ATranscript | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState<'raw' | 'json' | null>(null);
  const [copyError, setCopyError] = useState('');
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const peer = agentName(entry.peer);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key === 'Tab') {
        const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]') ?? []);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keys);
    return () => { document.removeEventListener('keydown', keys); if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    let disposed = false;
    setTranscript(null); setCopied(null); setError(''); setCopyError(''); setResolvedPath(null); setNotFound(false);
    if (!sessionId) { setError('SSH is offline. Reconnect the VPS to read this transcript.'); setLoading(false); return; }
    setLoading(true);
    const request = readBurrowTranscript(sessionId, entry.task_id);
    void request.then(result => {
      if (disposed) return;
      if (!result.path) { setNotFound(true); return; }
      setResolvedPath(result.path);
      const parsed = parseTranscript(result.content, peer);
      if (result.content.trim() && !parsed.items.length) throw new Error('No supported message turns were found in this transcript.');
      setTranscript(parsed);
    }).catch(cause => { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [entry.task_id, sessionId, peer, attempt]);
  const copy = async (kind: 'raw' | 'json') => {
    if (!transcript) return;
    setCopied(null); setCopyError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error(t('Clipboard is unavailable on this device.', 'Clipboard tidak tersedia pada perangkat ini.'));
      await navigator.clipboard.writeText(kind === 'raw' ? transcript.raw : JSON.stringify(transcript.records, null, 2));
      setCopied(kind);
    } catch (cause) { setCopyError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <div className="burrow-detail-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="burrow-detail" ref={panel} role="dialog" aria-modal="true" aria-labelledby="burrow-detail-title" tabIndex={-1}>
      <header className="burrow-detail-heading"><div><span className="burrow-overline">{t('DEEP DIVE // TRANSCRIPT', 'DEEP DIVE // TRANSKRIP')}</span><h2 id="burrow-detail-title">Leveret <ArrowRight size={17}/> <span className={`peer-${peer.toLowerCase()}`}>{peer === 'Unknown' ? entry.peer : peer}</span></h2><p><code>{entry.task_id}</code><span>·</span>A2A</p></div><button className="icon-button" onClick={onClose} aria-label={t('Close transcript', 'Tutup transkrip')}><X size={20}/></button></header>
      <div className="burrow-detail-tools"><code title={resolvedPath ?? undefined}>{resolvedPath?.split('/').at(-1) ?? (notFound ? t('No matching transcript', 'Tidak ada transkrip yang cocok') : error ? t('Lookup failed', 'Pencarian gagal') : t('Resolving transcript…', 'Mencari transkrip…'))}</code><div><button className="icon-button" disabled={!transcript || loading} onClick={() => void copy('raw')}>{copied === 'raw' ? <Check size={14}/> : <Copy size={14}/>}<span>Copy Raw Transcript</span></button><button className="icon-button" disabled={!transcript || loading} onClick={() => void copy('json')}>{copied === 'json' ? <Check size={15}/> : <Code2 size={15}/>}<span>Copy JSON</span></button></div></div>
      {copied && <p className="burrow-copy-feedback" role="status">{t('Copied to clipboard.', 'Disalin ke clipboard.')}</p>}
      {copyError && <p className="burrow-error" role="alert">{copyError}</p>}
      {transcript && transcript.skipped > 0 && <p className="burrow-warning">{t(`${transcript.skipped} incomplete or non-message lines omitted. Raw copy preserves the original file.`, `${transcript.skipped} baris nonpesan atau belum lengkap dilewati. Salinan raw tetap memuat file asli.`)}</p>}
      <div className="burrow-detail-scroll" aria-busy={loading}>
        {notFound && <div className="burrow-empty"><FileCheck2 size={30}/><h3>{t('No transcript found', 'Transkrip tidak ditemukan')}</h3><p>{t('No conversation file contains this task ID yet. The transcript may still be waiting to be written.', 'Belum ada file percakapan yang memuat ID tugas ini. Transkrip mungkin masih menunggu untuk ditulis.')}</p><button className="button secondary" onClick={() => setAttempt(value => value + 1)}>{t('Retry', 'Coba lagi')}</button></div>}
        {loading && <div className="burrow-empty" role="status"><LoaderCircle className="burrow-spin" size={28}/><p>{t('Reading the transcript…', 'Membaca transkrip…')}</p></div>}
        {error && <div className="burrow-empty" role="alert"><p>{error}</p><button className="button secondary" onClick={() => setAttempt(value => value + 1)}>{t('Retry', 'Coba lagi')}</button></div>}
        {transcript && !transcript.items.length && <div className="burrow-empty"><p>{t('The transcript has no message turns yet.', 'Transkrip belum memiliki pesan.')}</p></div>}
        {transcript?.items.map(turn => <article key={turn.id} className={`burrow-turn ${turn.speaker === 'Leveret' ? 'orchestrator' : 'specialist'} ${turn.hasEvidence ? 'with-evidence' : ''}`}><div className="burrow-turn-byline"><span className={`burrow-agent-badge peer-${turn.speaker.toLowerCase()}`}>{turn.speaker}</span>{turn.timestamp !== null && <time>{new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(turn.timestamp).replace(/\./g, ':')} WIB</time>}</div><div className="burrow-bubble"><div className="burrow-markdown"><TranscriptMarkdown content={turn.content}/></div>{(turn.hasEvidence || turn.hasVerification) && <div className="burrow-message-tags">{turn.hasEvidence && <span><FileCheck2 size={12}/> EVIDENCE MANIFEST</span>}{turn.hasVerification && <span><ShieldCheck size={12}/> {t('Verification block', 'Blok verifikasi')}</span>}</div>}</div></article>)}
      </div>
      <footer className="burrow-detail-footer"><ShieldCheck size={13}/>{t('Read-only transcript', 'Transkrip hanya baca')}<span>{transcript?.items.length ?? 0} {t('turns', 'pesan')}</span></footer>
    </aside>
  </div>;
}
