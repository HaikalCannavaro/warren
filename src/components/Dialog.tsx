import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({ title, description, children, onClose, wide = false }: {
  title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []);
    (focusables().find((element) => element.tagName === 'INPUT') ?? panel.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const elements = focusables();
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, []);
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className={`dialog ${wide ? 'dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
      <div className="dialog-heading"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button className="icon-button" aria-label="Tutup dialog" onClick={onClose}><X size={19}/></button></div>
      {children}
    </div>
  </div>;
}

export function ConfirmDialog({ title, description, confirmLabel = 'Hapus', onConfirm, onClose, danger = true }: {
  title: string; description: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; onClose: () => void; danger?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!busy) onClose(); };
  const confirm = async () => { if (busy) return; setBusy(true); setError(''); try { await onConfirm(); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tindakan belum dapat diselesaikan.'); } finally { setBusy(false); } };
  return <Dialog title={title} description={description} onClose={close}>{error && <p className="inline-error confirmation-error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button secondary" onClick={close} disabled={busy}>Batal</button><button className={`button ${danger ? 'danger' : 'primary'}`} disabled={busy} onClick={() => void confirm()}>{busy ? 'Memproses…' : confirmLabel}</button></div></Dialog>;
}
