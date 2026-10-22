import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Activity, X } from 'lucide-react';
import type { ExecutionLogEntry } from '../types';
import { useI18n } from '../lib/i18n';

const EMPTY_LOG: ExecutionLogEntry[] = [];

export function ToolActivityPanel({ id, panelRef, open, conversationId, entries = EMPTY_LOG, streaming, onClose }: {
  id: string;
  panelRef: RefObject<HTMLElement | null>;
  open: boolean;
  conversationId?: string;
  entries?: ExecutionLogEntry[];
  streaming: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const labels: Record<ExecutionLogEntry['kind'], string> = {
    request: t('Request started', 'Permintaan dimulai'),
    tool: t('Tool update', 'Pembaruan tool'),
    response: t('Response started', 'Respons dimulai'),
    complete: t('Request complete', 'Permintaan selesai'),
    error: t('Error', 'Kesalahan'),
    unknown: t('Status unknown', 'Status belum diketahui'),
  };
  const list = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  const ordered = useMemo(() => [...entries].sort((a, b) => a.timestamp - b.timestamp), [entries]);
  const latest = ordered.at(-1);
  const terminal = latest?.kind === 'error' || latest?.kind === 'unknown' || latest?.kind === 'complete';
  const visibleRunning = streaming && !terminal;
  const state = visibleRunning ? 'running' : latest?.kind === 'error' ? 'error'
    : latest && latest.kind !== 'complete' ? 'unknown' : 'ready';
  const status = { running: t('Running', 'Berjalan'), ready: t('Ready', 'Siap'), unknown: labels.unknown, error: labels.error }[state];
  useEffect(() => { follow.current = true; if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [conversationId]);
  useEffect(() => {
    if (open && follow.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [open, ordered, conversationId]);

  return <aside id={id} ref={panelRef} className="execution-panel-shell" aria-labelledby={`${id}-title`}
    aria-hidden={!open} inert={!open} tabIndex={-1} onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('.dialog-backdrop [role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}>
    <div className="execution-panel-inner">
      <header className="execution-header">
        <div className="execution-heading"><Activity size={17} aria-hidden="true"/><div><h2 id={`${id}-title`}>{t('Tool Activity', 'Aktivitas tool')}</h2><p>{t('Execution log', 'Log eksekusi')}</p></div></div>
        <button type="button" className="execution-close icon-button" aria-label={t('Close Tool Activity', 'Tutup aktivitas tool')} onClick={onClose}><X size={16}/></button>
      </header>
      <div className={`execution-status status-${state}`} role="status">
        {visibleRunning && <span className="execution-status-dot" aria-hidden="true"/>}<span>{status}</span>
      </div>
      <ol className="execution-list" ref={list} tabIndex={ordered.length ? 0 : -1} aria-label={t('Execution log entries', 'Daftar log eksekusi')} onScroll={() => {
        const area = list.current;
        if (open && area) follow.current = area.scrollHeight - area.scrollTop - area.clientHeight < 64;
      }}>
        {ordered.map((entry) => {
          const time = new Date(entry.timestamp);
          const validTime = Number.isFinite(time.getTime());
          return <li className={`execution-entry kind-${entry.kind}`} key={entry.id}>
            <div className="execution-entry-meta"><span className="execution-entry-kind">{labels[entry.kind]}</span>
              <time dateTime={validTime ? time.toISOString() : undefined}>{validTime ? time.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</time></div>
            <p className="execution-entry-text">{entry.text}</p>
          </li>;
        })}
      </ol>
      {!ordered.length && <div className="execution-empty"><Activity size={24} aria-hidden="true"/><p>{t('No activity yet', 'Belum ada aktivitas')}</p><span>{t('Requests and tool updates from your server appear here.', 'Aktivitas permintaan dan pembaruan tool dari server akan muncul di sini.')}</span></div>}
      <p className="execution-footnote">{t('Reported by your server. A completed request does not confirm every tool succeeded.', 'Log mengikuti laporan server. Selesainya permintaan tidak memastikan setiap tool berhasil.')}</p>
    </div>
  </aside>;
}
