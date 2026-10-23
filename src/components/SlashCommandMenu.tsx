import { useEffect, useRef } from 'react';
import type { SlashCommand, CommandCategory } from '../types';
import { useI18n } from '../lib/i18n';

export function commandName(command: SlashCommand): string { return command.name.replace(/^\//, ''); }

function inferCategory(command: SlashCommand): CommandCategory {
  if (command.category) return command.category;
  const name = commandName(command).toLowerCase();
  if (['lastcmd', 'term'].includes(name)) return 'workspace';
  if (['new', 'fork', 'clear', 'retry', 'export', 'stop', 'compact'].includes(name)) return 'session';
  if (['models', 'model', 'skills', 'tools'].includes(name)) return 'intel';
  return 'system';
}

const categoryOrder: CommandCategory[] = ['workspace', 'session', 'intel', 'system'];

const categoryTitles: Record<CommandCategory, readonly [string, string]> = {
  workspace: ['WORKSPACE BRIDGE', 'JEMBATAN RUANG KERJA'],
  session: ['SESSION CONTROL', 'KONTROL SESI'],
  intel: ['HERMES INTEL', 'INTEL HERMES'],
  system: ['SYSTEM', 'SISTEM'],
};

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

  // Group commands by category while preserving their original indices
  const grouped = categoryOrder.map(cat => ({
    category: cat,
    title: t(categoryTitles[cat][0], categoryTitles[cat][1]),
    items: commands
      .map((cmd, idx) => ({ command: cmd, index: idx }))
      .filter(({ command }) => inferCategory(command) === cat),
  })).filter(group => group.items.length > 0);

  return <div className="slash-menu">
    <div className="slash-menu-heading">
      <strong>{t('Agent commands', 'Perintah Agent')}</strong>
      <span>{t('↑ ↓ select · Tab complete · Esc close', '↑ ↓ pilih · Tab lengkapi · Esc tutup')}</span>
    </div>
    {loading && <p className="slash-menu-state" role="status">{t('Loading commands…', 'Memuat perintah…')}</p>}
    {error && <div className="slash-menu-error"><p role="alert">{error}</p>{onRetry && <button type="button" onClick={onRetry}>{t('Try again', 'Coba lagi')}</button>}</div>}
    <div ref={list} id={id} className="slash-menu-list" role="listbox" aria-label={t('Agent commands', 'Perintah Agent')}>
      {grouped.map(group => (
        <div key={group.category} className="slash-menu-section" role="group" aria-label={group.title}>
          <div className="slash-menu-category-header" role="presentation">
            <span>{group.title}</span>
          </div>
          {group.items.map(({ command, index }) => (
            <button
              key={command.name}
              type="button"
              role="option"
              id={`${id}-${index}`}
              aria-selected={index === selectedIndex}
              aria-disabled={!command.available}
              disabled={!command.available}
              tabIndex={-1}
              onMouseDown={event => event.preventDefault()}
              onClick={() => onSelect(command)}
            >
              <span className="slash-menu-command">
                <strong>/{commandName(command)}</strong>
                {command.args && <span>{command.args}</span>}
              </span>
              <span className="slash-menu-description">{command.description}</span>
              {!command.available && (
                <span className="slash-menu-reason">
                  {command.reason || t('Commands are not available for this connection.', 'Perintah belum tersedia pada koneksi ini.')}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
    {!commands.length && !loading && !error && (
      <p className="slash-menu-state">
        {t('No matching commands. Use /help to see available commands.', 'Tidak ada perintah yang cocok. Gunakan /help untuk daftar perintah.')}
      </p>
    )}
  </div>;
}
