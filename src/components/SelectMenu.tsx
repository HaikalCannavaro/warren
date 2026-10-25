import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import './select-menu.css';

export interface SelectOption { value: string; label: string; detail?: string; disabled?: boolean; }
interface MenuPosition { left: number; top: number; width: number; maxHeight: number; placement: 'top' | 'bottom'; }
export function selectPosition(rect: { left: number; top: number; right: number; bottom: number; width: number }, viewport: { left: number; top: number; width: number; height: number }, preferredWidth: number, desiredHeight: number): MenuPosition {
  const gap = 7, margin = 12;
  const width = Math.min(Math.max(rect.width, preferredWidth), Math.max(0, viewport.width - margin * 2));
  const below = viewport.top + viewport.height - rect.bottom - gap - margin;
  const above = rect.top - viewport.top - gap - margin;
  const placement = below >= Math.min(desiredHeight, 150) || below >= above ? 'bottom' : 'top';
  const maxHeight = Math.max(0, Math.min(desiredHeight, placement === 'bottom' ? below : above));
  return { width, maxHeight, placement,
    left: Math.max(viewport.left + margin, Math.min(rect.left, viewport.left + viewport.width - width - margin)),
    top: placement === 'bottom' ? rect.bottom + gap : rect.top - gap,
  };
}
export function SelectMenu({ id, label, value, options, onValueChange, disabled = false, placeholder = 'Select…', className = '', minMenuWidth = 220 }: {
  id?: string; label: string; value: string; options: SelectOption[]; onValueChange: (value: string) => void;
  disabled?: boolean; placeholder?: string; className?: string; minMenuWidth?: number;
}) {
  const generated = useId(); const listId = `${generated}-list`;
  const trigger = useRef<HTMLButtonElement>(null); const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false); const [active, setActive] = useState(0); const [position, setPosition] = useState<MenuPosition | null>(null);
  const search = useRef({ text: '', at: 0 });
  const selected = options.find(option => option.value === value);
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const show = () => {
    if (disabled || !enabled.length) return;
    const current = options.findIndex(option => option.value === value && !option.disabled);
    setActive(current >= 0 ? current : enabled[0]); setOpen(true);
  };
  const choose = (index: number) => { if (!options[index] || options[index].disabled) return; onValueChange(options[index].value); setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    if (!open || !trigger.current) return;
    const measure = () => {
      const rect = trigger.current?.getBoundingClientRect(); if (!rect) return;
      const view = window.visualViewport;
      const viewport = { left: view?.offsetLeft ?? 0, top: view?.offsetTop ?? 0, width: view?.width ?? window.innerWidth, height: view?.height ?? window.innerHeight };
      if (rect.bottom < viewport.top || rect.top > viewport.top + viewport.height) { setOpen(false); return; }
      setPosition(selectPosition(rect, viewport, minMenuWidth, Math.min(320, options.length * (options.some(option => option.detail) ? 55 : 38) + 14)));
    };
    measure();
    const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) measure(); };
    window.addEventListener('resize', measure); window.addEventListener('scroll', scroll, true);
    window.visualViewport?.addEventListener('resize', measure); window.visualViewport?.addEventListener('scroll', measure);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(trigger.current);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', scroll, true); window.visualViewport?.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('scroll', measure); observer?.disconnect(); };
  }, [open, options.length, minMenuWidth]);
  useEffect(() => { if (disabled || !enabled.length) setOpen(false); }, [disabled, enabled.length]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { const target = event.target as Node; if (!trigger.current?.contains(target) && !popup.current?.contains(target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (open) popup.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [open, active]);
  const keydown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); if (!open) { show(); return; }
      const index = enabled.indexOf(active);
      setActive(event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1)! : enabled[(index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]);
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (open) choose(active); else show(); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    else if (event.key === 'Tab') setOpen(false);
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now(); search.current = { text: (now - search.current.at < 700 ? search.current.text : '') + event.key.toLocaleLowerCase(), at: now };
      const match = enabled.find(index => options[index].label.toLocaleLowerCase().startsWith(search.current.text));
      if (match !== undefined) { event.preventDefault(); if (open) setActive(match); else onValueChange(options[match].value); }
    }
  };
  return <><button ref={trigger} id={id} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open ? `${listId}-${active}` : undefined} disabled={disabled} className={`select-trigger ${open ? 'is-open' : ''} ${className}`} onClick={() => open ? setOpen(false) : show()} onKeyDown={keydown}><span className="select-value">{selected?.label ?? placeholder}</span><ChevronDown size={14}/></button>{open && createPortal(<div ref={popup} id={listId} role="listbox" aria-label={label} className="select-popup" data-placement={position?.placement} style={position ? { left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight } : { visibility: 'hidden' }}>{options.map((option, index) => <button type="button" role="option" tabIndex={-1} key={option.value} id={`${listId}-${index}`} aria-selected={option.value === value} aria-disabled={option.disabled || undefined} disabled={option.disabled} data-active={index === active} className="select-option" onMouseDown={event => event.preventDefault()} onPointerMove={() => { if (!option.disabled) setActive(index); }} onClick={() => choose(index)}><span><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>{option.value === value && <Check size={14}/>}</button>)}</div>, document.body)}</>;
}
