import { SelectMenu } from './SelectMenu';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowRight, ArrowUpDown, ChevronRight, LoaderCircle, Radio, RefreshCw, ShieldCheck, TerminalSquare, Trash2 } from 'lucide-react';
import { useBurrow } from '../hooks/useBurrow';
import { SPECIALISTS, agentName, auditRoute, auditStatus, auditTimestamp, type A2AAuditEntry } from '../lib/burrow';
import { useI18n } from '../lib/i18n';
import type { TerminalSession, VpsProfile } from '../types';
import { BurrowIcon } from './BurrowIcon';
import '../burrow.css';

const BurrowTranscript = lazy(() => import('./BurrowTranscript').then(module => ({ default: module.BurrowTranscript })));
export function BurrowWorkspace({ profiles, sessions, activeSessionId, preview, onConnections, onConnect }: {
  profiles: VpsProfile[]; sessions: TerminalSession[]; activeSessionId: string | null; preview: boolean;
  onConnections: () => void; onConnect: (profileId: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const connected = sessions.filter(session => session.status === 'connected');
  const [selectedProfileId, setSelectedProfileId] = useState(() => sessions.find(item => item.id === activeSessionId)?.profileId ?? profiles[0]?.id ?? '');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const profile = profiles.find(item => item.id === selectedProfileId);
  const session = connected.find(item => item.profileId === selectedProfileId && item.id === activeSessionId) ?? connected.find(item => item.profileId === selectedProfileId);
  useEffect(() => { if (!selectedProfileId && profiles[0]) setSelectedProfileId(profiles[0].id); }, [profiles, selectedProfileId]);
  const stream = useBurrow(session?.id ?? null);
  const [filter, setFilter] = useState('All');
  const [autoScroll, setAutoScroll] = useState(true);
  const [selected, setSelected] = useState<A2AAuditEntry | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [overflowed, setOverflowed] = useState<Set<string>>(new Set());
  const bottom = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const source = `${selectedProfileId}:${session?.id ?? 'offline'}`;
  useEffect(() => { setSelected(null); setExpanded(new Set()); setConnectError(''); }, [source]);
  useEffect(() => {
    if (!autoScroll || selected || !bottom.current) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bottom.current.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'end' });
  }, [stream.messages, autoScroll, filter, selected]);
  // Expanded summary IDs expire as the bounded stream window advances.
  useEffect(() => {
    setExpanded(previous => {
      const live = new Set(stream.messages.map(message => message.id));
      const next = new Set([...previous].filter(id => live.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [stream.messages]);
  useEffect(() => {
    const pane = list.current;
    if (!pane) return;
    const measure = () => setOverflowed(previous => {
      const next = new Set<string>();
      pane.querySelectorAll<HTMLElement>('[data-burrow-summary]').forEach(element => {
        const id = element.dataset.burrowSummary!;
        if (element.closest('.expanded') ? previous.has(id) : element.scrollHeight > element.clientHeight + 1) next.add(id);
      });
      return next.size === previous.size && [...next].every(id => previous.has(id)) ? previous : next;
    });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [stream.messages, filter]);
  const messages = stream.messages.filter(item => filter === 'All' || agentName(item.peer) === filter);
  const live = stream.status === 'monitoring';
  const disconnected = stream.status === 'offline' || stream.status === 'error';
  const formatTime = (ts: number) => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(auditTimestamp(ts)).replace(/\./g, ':');
  const clear = () => { stream.clear(); setSelected(null); setExpanded(new Set()); };
  const retry = async () => {
    if (connecting) return;
    if (session) { stream.retry(); return; }
    if (!profile) { onConnections(); return; }
    setConnecting(true); setConnectError('');
    try { await onConnect(profile.id); }
    catch (cause) { setConnectError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setConnecting(false); }
  };
  return <section className="burrow-workspace" aria-label="Burrow — Inter-Agent Communication Log" inert={selected !== null}>
    <div className="burrow-console-header"><div className="burrow-console-title"><div className="burrow-sigil"><BurrowIcon size={29}/></div><div><span className="burrow-overline">{t('THE AGENTS’ MEETING PLACE', 'RUANG TEMU PARA AGEN')}</span><h1>Burrow<span>.</span></h1><p>{t('Where Leveret and specialists exchange context and coordinate their work.', 'Tempat Leveret dan para spesialis bertukar konteks dan mengoordinasikan pekerjaan.')}</p></div></div><div className={`burrow-monitor-pill ${live ? 'monitoring' : ''}`} role="status"><span/>{live ? 'MONITORING A2A TRAFFIC' : 'CONNECTING TO BURROW'}</div></div>
    <div className="burrow-toolbar"><div className="burrow-source-picker"><TerminalSquare size={15}/><label><span className="sr-only">{t('Log source connection', 'Koneksi sumber log')}</span><SelectMenu label={t('Log source connection', 'Koneksi sumber log')} value={selectedProfileId} disabled={!profiles.length} onValueChange={setSelectedProfileId} placeholder={t('No saved VPS connections', 'Belum ada koneksi VPS tersimpan')} minMenuWidth={300} options={[...(selectedProfileId && !profile ? [{ value: selectedProfileId, label: t('Source unavailable', 'Sumber tidak tersedia'), disabled: true }] : []), ...profiles.map(item => ({ value: item.id, label: item.name, detail: `${item.host} · ${sessions.some(open => open.profileId === item.id && open.status === 'connected') ? t('Connected', 'Tersambung') : t('Offline', 'Offline')}` }))]}/></label><span className="burrow-source-label">SSH BRIDGE</span></div><div className="burrow-actions"><label className="burrow-peer-filter"><span>{t('Filter Peer', 'Filter Peer')}</span><SelectMenu label="Filter Peer" value={filter} onValueChange={setFilter} minMenuWidth={180} options={[{ value: 'All', label: t('All agents', 'Semua agen') }, ...SPECIALISTS.map(peer => ({ value: peer, label: peer }))]}/></label><button className={`burrow-control ${autoScroll ? 'active' : ''}`} aria-label="Toggle Auto-Scroll" aria-pressed={autoScroll} onClick={() => setAutoScroll(value => !value)}><ArrowDown size={14}/><span>{t('Auto-scroll', 'Auto-scroll')}</span><small>{autoScroll ? 'ON' : 'OFF'}</small></button><button className="burrow-control" onClick={clear}><Trash2 size={14}/><span>{t('Clear Screen', 'Bersihkan Layar')}</span></button></div></div>
    <div className="burrow-stream-heading"><span><Radio size={12}/>{t('TRAFFIC STREAM', 'STREAM KOMUNIKASI')}</span><span>{messages.length} {t('events', 'event')}<i/>WIB · UTC+07:00</span></div>
    <div ref={list} className="burrow-stream" role="region" aria-label={t('Live A2A message stream', 'Stream pesan A2A langsung')} tabIndex={0}>
      {(disconnected || stream.status === 'connecting') && <div className="burrow-connection-state"><div className={`burrow-connection-orbit ${disconnected ? 'offline' : ''}`}><Radio size={27}/></div><span className="burrow-overline">A2A RELAY</span><h3>Connecting to Burrow...</h3><p>{connectError || stream.error || (preview ? t('Open the installed Warren app to connect your VPS and read live agent conversations.', 'Buka aplikasi Warren terpasang untuk menghubungkan VPS dan membaca percakapan agen langsung.') : session ? t('Opening a live channel to Leveret’s audit stream.', 'Membuka kanal langsung ke stream audit Leveret.') : profile ? t(`Source: ${profile.name} (${profile.host}). Connect this VPS to monitor its A2A traffic.`, `Sumber: ${profile.name} (${profile.host}). Hubungkan VPS ini untuk memantau komunikasi A2A.`) : t('Choose a saved VPS connection to monitor agent traffic.', 'Pilih koneksi VPS tersimpan untuk memantau komunikasi agen.'))}</p><div><button className="button secondary" disabled={connecting || sessions.some(item => item.profileId === selectedProfileId && item.status === 'connecting')} onClick={() => void retry()}><RefreshCw size={14} className={connecting ? 'burrow-spin' : ''}/>{t('Retry', 'Coba lagi')}</button>{!session && <button className="button primary" onClick={onConnections}>{t('Connections', 'Koneksi')}<ChevronRight size={14}/></button>}</div></div>}
      {messages.map(item => {
        const route = auditRoute(item); const peer = agentName(item.peer); const isExpanded = expanded.has(item.id); const long = overflowed.has(item.id) || item.summary.length > 240 || item.summary.split('\n').length > 3;
        return <article className={`burrow-log-item ${auditStatus(item.status)}`} key={item.id} onClick={event => { if (!(event.target as HTMLElement).closest('button')) setSelected(item); }}><div className="burrow-log-gutter"><span className={`burrow-event-dot peer-${peer.toLowerCase()}`}/><time dateTime={new Date(auditTimestamp(item.ts)).toISOString()}>{formatTime(item.ts)}</time><span className="burrow-event-direction">{route.known ? route.from === 'Leveret' ? 'TX' : 'RX' : 'A2A'}</span></div><div className="burrow-log-body"><button className="burrow-log-open" onClick={() => setSelected(item)} aria-label={t(`Open transcript for ${item.task_id}`, `Buka transkrip ${item.task_id}`)}><span className={`burrow-agent-badge peer-${route.from.toLowerCase()}`}>{route.from.toUpperCase()}</span>{route.known ? <ArrowRight size={13}/> : <ArrowUpDown size={13}/>}<span className={`burrow-agent-badge peer-${route.to.toLowerCase()}`}>{peer === 'Unknown' && route.to === 'Unknown' ? item.peer.toUpperCase() : route.to.toUpperCase()}</span><span className={`burrow-status ${auditStatus(item.status)}`}>{item.status || 'unknown'}</span><ChevronRight className="burrow-open-chevron" size={15}/></button><div className={`burrow-summary ${isExpanded ? 'expanded' : ''}`}><span className="burrow-summary-caption">SUMMARY / CONTEXT</span><p data-burrow-summary={item.id}>{item.summary || t('No summary provided.', 'Ringkasan tidak disertakan.')}</p></div><div className="burrow-log-meta"><code title={item.task_id}>{item.task_id || '—'}</code>{long && <button aria-expanded={isExpanded} onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>{isExpanded ? t('Collapse context', 'Ringkas konteks') : t('Expand context', 'Buka konteks')}</button>}<button className="burrow-deep-dive" onClick={() => setSelected(item)}>{t('Deep dive', 'Lihat transkrip')}<ArrowRight size={11}/></button></div></div></article>;
      })}
      {!messages.length && live && <div className="burrow-empty"><Radio size={30}/><h3>{filter === 'All' ? t('Listening for agent chatter.', 'Menunggu percakapan agen.') : t('No traffic from this peer yet.', 'Belum ada komunikasi dari agen ini.')}</h3><p>{t('New events will appear here as they arrive.', 'Event baru akan tampil di sini saat diterima.')}</p></div>}
      <div ref={bottom} className="burrow-stream-bottom"/>
    </div>
    <footer className="burrow-console-footer"><span><ShieldCheck size={12}/>{t('OBSERVER MODE', 'MODE PENGAMAT')}</span><span>{stream.skipped > 0 ? t(`${stream.skipped} invalid lines skipped`, `${stream.skipped} baris tidak valid dilewati`) : t('READ-ONLY CHANNEL', 'KANAL HANYA BACA')}{stream.dropped > 0 ? ` · ${t('Last 300 events', '300 event terakhir')}` : ''}</span><span className="burrow-footer-protocol"><span className={live ? 'live' : ''}/>A2A / SSH</span></footer>
    {selected && createPortal(<Suspense fallback={<div className="burrow-detail-loading" role="status"><LoaderCircle className="burrow-spin" size={25}/></div>}><BurrowTranscript key={`${source}:${selected.task_id}`} entry={selected} sessionId={session?.id ?? null} onClose={() => setSelected(null)}/></Suspense>, document.body)}
  </section>;
}
