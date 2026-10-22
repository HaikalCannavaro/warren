import { useEffect, useRef } from 'react';
import type { SlashCommand } from '../types';
import { useI18n } from '../lib/i18n';

export function commandName(command: SlashCommand): string { return command.name.replace(/^\//, ''); }

export function SlashCommandMenu({ id, commands, selectedIndex, loading, error, onSelect, onRetry }: {
  id: string; commands: SlashCommand[]; selectedIndex: number; loading: boolean; error?: string;
  onSelect: (command: SlashCommand) => void; onRetry?: () => void;
}) {
  const { t } = useI18n();
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const selected = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    selected?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedIndex]);
  return <div className="slash-menu">
    <div className="slash-menu-heading"><strong>{t('Agent commands', 'Perintah Agent')}</strong><span>{t('↑ ↓ select · Tab complete · Esc close', '↑ ↓ pilih · Tab lengkapi · Esc tutup')}</span></div>
    {loading && <p className="slash-menu-state" role="status">{t('Loading commands…', 'Memuat perintah…')}</p>}
    {error && <div className="slash-menu-error"><p role="alert">{error}</p>{onRetry && <button type="button" onClick={onRetry}>{t('Try again', 'Coba lagi')}</button>}</div>}
    <div ref={list} id={id} className="slash-menu-list" role="listbox" aria-label={t('Agent commands', 'Perintah Agent')}>
      {commands.map((command, index) => <button key={command.name} type="button" role="option" id={`${id}-${index}`} aria-selected={index === selectedIndex} aria-disabled={!command.available} disabled={!command.available} tabIndex={-1} onMouseDown={event => event.preventDefault()} onClick={() => onSelect(command)}>
        <span className="slash-menu-command"><strong>/{commandName(command)}</strong>{command.args && <span>{command.args}</span>}</span>
        <span className="slash-menu-description">{command.description}</span>
        {!command.available && <span className="slash-menu-reason">{command.reason || t('Commands are not available for this connection.', 'Perintah belum tersedia pada koneksi ini.')}</span>}
      </button>)}
    </div>
    {!commands.length && !loading && !error && <p className="slash-menu-state">{t('No matching commands. Use /help to see available commands.', 'Tidak ada perintah yang cocok. Gunakan /help untuk daftar perintah.')}</p>}
  </div>;
}
