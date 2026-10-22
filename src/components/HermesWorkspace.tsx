import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Activity, ArrowUp, Check, Copy, Rabbit, LoaderCircle, Plus, UserRound } from 'lucide-react';
import type { CommandResult, Conversation, HermesProfile, SlashCommand } from '../types';
import { Dialog } from './Dialog';
import { ToolActivityPanel } from './ToolActivityPanel';
import { commandName, SlashCommandMenu } from './SlashCommandMenu';
import { useI18n } from '../lib/i18n';
import { localizeSlashCommand } from '../lib/slashCommands';
import '../slash-commands.css';

const emptyIds = new Set<string>();

export function HermesWorkspace({ profiles, conversations, activeId, preview, visible = true, streamingIds, commands: suppliedCommands, commandBusyIds = emptyIds, commandsLoading = false, onCommand, onLoadCommands, onAddProfile, onCreate, onDraft, onSend }: {
  profiles: HermesProfile[]; conversations: Conversation[]; activeId: string | null; preview: boolean; visible?: boolean; streamingIds: Set<string>; toolActivity: Record<string, string>;
  commands?: SlashCommand[]; commandBusyIds?: Set<string>; commandsLoading?: boolean; onCommand?: (id: string, text: string) => Promise<void>; onLoadCommands?: (id: string) => Promise<void>;
  onAddProfile: () => void; onCreate: (profileId: string) => string; onDraft: (id: string, text: string) => void; onSend: (id: string) => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const commands: SlashCommand[] = suppliedCommands?.map(localizeSlashCommand) ?? [
    { name: 'help', description: t('See available commands.', 'Lihat perintah yang tersedia.'), available: true, allowWhileRunning: true },
    { name: 'new', description: t('Start a new conversation.', 'Mulai percakapan baru.'), available: true },
  ];
  const [newOpen, setNewOpen] = useState(false);
  const [localError, setLocalError] = useState('');
  const [composerFocused, setComposerFocused] = useState(false);
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const [selectedCommand, setSelectedCommand] = useState(0);
  const [catalogError, setCatalogError] = useState<{ id: string; message: string } | null>(null);
  const [loadingCatalogs, setLoadingCatalogs] = useState<Set<string>>(() => new Set());
  const loadedCatalogs = useRef(new Set<string>());
  const pendingCommands = useRef(new Set<string>());
  const commandMenuId = useId();
  const [activityOpen, setActivityOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1200);
  const activityPanelId = useId();
  const activityPanel = useRef<HTMLElement>(null);
  const activityToggle = useRef<HTMLButtonElement>(null);
  const active = conversations.find((conversation) => conversation.id === activeId);
  const profile = profiles.find((item) => item.id === active?.profileId);
  const agentProfile = active?.agentProfile || profile?.agentProfile || t('Default profile', 'Profil default');
  const streaming = !!active && streamingIds.has(active.id);
  const commandBusy = !!active && commandBusyIds.has(active.id);
  const draft = active?.draft ?? '';
  const commandText = draft.trim();
  const isCommand = commandText.startsWith('/') && !commandText.startsWith('//');
  const commandToken = commandText.split(/\s/, 1)[0].slice(1).toLowerCase();
  const exactCommand = commands.find(item => commandName(item).toLowerCase() === commandToken);
  const commandQuery = /^\/[\w-]*$/.test(draft.trimStart()) ? draft.trimStart().slice(1).toLowerCase() : null;
  const suggestions = commands.filter(item => commandName(item).toLowerCase().startsWith(commandQuery ?? '')).map(item => streaming && !item.allowWhileRunning ? { ...item, available: false, reason: t('Wait for the Agent to finish.', 'Tunggu pekerjaan Agent selesai.') } : item);
  const selectedIndex = suggestions[selectedCommand]?.available ? selectedCommand : suggestions.findIndex(item => item.available);
  const menuOpen = !!active && composerFocused && commandQuery !== null && dismissedQuery !== draft && visible;
  const commandAllowed = isCommand && (!exactCommand || exactCommand.available) && (!streaming || !!exactCommand?.allowWhileRunning);
  const sendDisabled = !visible || preview || commandBusy || !commandText || !profile || (isCommand ? !commandAllowed : streaming);
  const latestMessage = active?.messages.at(-1);
  const visiblyStreaming = streaming && latestMessage?.role === 'assistant' && latestMessage.status === 'streaming';
  const messages = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const lastContent = active?.messages.at(-1)?.content;
  const lastCommand = active?.commandResults?.at(-1);
  const timeline = active ? [
    ...active.messages.map(message => ({ kind: 'message' as const, value: message })),
    ...(active.commandResults ?? []).map(result => ({ kind: 'command' as const, value: result })),
  ].sort((a, b) => a.value.createdAt - b.value.createdAt) : [];
  const loadCommands = async (id: string) => {
    if (!onLoadCommands || preview || !visible) return;
    loadedCatalogs.current.add(id);
    setLoadingCatalogs(current => new Set(current).add(id));
    setCatalogError(current => current?.id === id ? null : current);
    try { await onLoadCommands(id); }
    catch (cause) { setCatalogError({ id, message: cause instanceof Error ? cause.message : t('Could not load commands.', 'Daftar perintah belum dapat dimuat.') }); }
    finally { setLoadingCatalogs(current => { const next = new Set(current); next.delete(id); return next; }); }
  };
  useEffect(() => {
    if (visible && active && isCommand && !loadedCatalogs.current.has(active.id)) void loadCommands(active.id);
  }, [activeId, isCommand, onLoadCommands, preview, visible]);
  useEffect(() => { setSelectedCommand(0); setDismissedQuery(null); }, [activeId, draft]);
  useEffect(() => { if (!visible) { setNewOpen(false); setComposerFocused(false); } }, [visible]);
  useEffect(() => { if (visible && follow.current && messages.current) messages.current.scrollTop = messages.current.scrollHeight; }, [lastContent, active?.messages.length, lastCommand?.content, lastCommand?.status, active?.commandResults?.length, visible]);
  useEffect(() => { follow.current = true; if (messages.current) messages.current.scrollTop = messages.current.scrollHeight; setLocalError(''); }, [activeId]);
  useEffect(() => { const field = composer.current; if (visible && field) { field.style.height = 'auto'; field.style.height = `${Math.min(field.scrollHeight, 160)}px`; } }, [active?.draft, visible]);
  const startChat = () => { if (!profiles.length) onAddProfile(); else if (profiles.length === 1) onCreate(profiles[0].id); else setNewOpen(true); };
  const selectCommand = (command: SlashCommand) => {
    if (!active || !command.available) return;
    onDraft(active.id, `/${commandName(command)} `);
    composer.current?.focus();
  };
  const send = async () => {
    if (!active || sendDisabled || pendingCommands.current.has(active.id)) return;
    setLocalError(''); follow.current = true;
    try {
      if (isCommand) {
        if (!onCommand) { setLocalError(t('Commands are not available for this connection.', 'Perintah belum tersedia pada koneksi ini.')); return; }
        pendingCommands.current.add(active.id);
        await onCommand(active.id, commandText);
      } else await onSend(active.id);
    } catch (cause) { setLocalError(cause instanceof Error ? cause.message : t('Could not send the request.', 'Permintaan belum dapat dikirim.')); }
    finally { pendingCommands.current.delete(active.id); }
  };
  return <section className={`hermes-workspace panel ${activityOpen ? 'activity-open' : ''}`}>
    <div className="agent-split-pane">
    <div className="chat-main">
      <div className="chat-topbar">
        <div className="chat-identity"><Rabbit size={22}/><div className="chat-identity-copy"><strong title={profile?.name}>{profile?.name ?? 'Agent'}</strong>{profile && <span className="chat-current-profile" title={agentProfile} aria-label={t(`Profile: ${agentProfile}`, `Profil: ${agentProfile}`)}><span className="chat-profile-label">{t('Profile', 'Profil')}</span><strong>{agentProfile}</strong></span>}</div>{visiblyStreaming && <span className="chat-status-dot status-dot" role="status" aria-label={t('Agent is responding', 'Agent sedang merespons')}/>}</div>
        <div className="chat-actions"><button ref={activityToggle} type="button" className="activity-toggle icon-button" aria-label={activityOpen ? t('Hide Tool Activity', 'Sembunyikan aktivitas tool') : t('Show Tool Activity', 'Tampilkan aktivitas tool')} aria-controls={activityPanelId} aria-expanded={activityOpen} onClick={() => setActivityOpen(!activityOpen)}><Activity size={18}/></button></div>
      </div>
      <div className="chat-messages" ref={messages} onScroll={() => { const area = messages.current; if (area) follow.current = area.scrollHeight - area.scrollTop - area.clientHeight < 100; }}>
        {!timeline.length ? <div className="chat-empty"><div className="hermes-mark"><Rabbit size={32} strokeWidth={1.4}/></div><span className="eyebrow">{t('ROOM TO THINK', 'BERPIKIR LEBIH LELUASA')}</span><h2>{t('A space for your Agent.', 'Halo, ini ruang Agent.')}</h2><p>{profile ? t(`Start a conversation with ${profile.name}. Messages go to your chosen server.`, `Mulai percakapan dengan ${profile.name}. Pesan Anda akan dikirim ke server yang Anda pilih.`) : t('Connect your own assistant. Explore ideas, work through problems, and keep the conversation in one place.', 'Hubungkan asisten Anda sendiri. Diskusikan ide, pahami masalah, dan simpan percakapan dalam satu ruang.')}</p>{!active && <button className="button primary" onClick={startChat}><Plus size={16}/>{profiles.length ? t('Start chat', 'Mulai chat') : t('Connect Agent', 'Hubungkan Agent')}</button>}<div className="chat-empty-foot"><span/><p>{t('Separate from your terminal. You decide when a command runs.', 'Terpisah dari terminal. Anda yang memutuskan kapan sebuah perintah dijalankan.')}</p></div></div> : timeline.map(item => {
          if (item.kind === 'command') return <CommandResultCard key={`command-${item.value.id}`} result={item.value}/>;
          const message = item.value;
          return <article key={`message-${message.id}`} className={`message message-${message.role}`}><div className="message-avatar">{message.role === 'user' ? <UserRound size={17}/> : <Rabbit size={18}/>}</div><div className="message-body"><div className="message-byline"><strong>{message.role === 'user' ? t('You', 'Anda') : (message.agentProfile || active?.agentProfile || profile?.agentProfile || 'Agent')}</strong><time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time>{streaming && message.status === 'streaming' && <span className="stream-label"><LoaderCircle size={12} className="spinning"/> {t('Writing', 'Menulis')}</span>}</div>{message.content ? <div className="markdown"><SafeMarkdown>{message.content}</SafeMarkdown></div> : message.status === 'streaming' ? <span className="waiting-text">{t('Waiting for the server…', 'Menunggu respons server…')}</span> : null}{message.error && <p className="message-error" role="alert">{message.error}</p>}{message.status === 'unknown' && <p className="message-error">{t('Delivery status is unknown. Check the server before sending again.', 'Status pengiriman belum diketahui. Periksa server sebelum mengirim ulang.')}</p>}</div></article>;
        })}
      </div>
      {active && <div className="composer-area">
        {localError && <p className="inline-error" role="alert">{localError}</p>}
        {!profile && <p className="inline-warning">{t('This connection was removed. Start a chat with an available connection.', 'Koneksi percakapan ini sudah dihapus. Buat percakapan dengan koneksi yang tersedia.')}</p>}
        {isCommand && !menuOpen && exactCommand && !exactCommand.available && <p className="inline-warning" role="status">{exactCommand.reason || t('Commands are not available for this connection.', 'Perintah belum tersedia pada koneksi ini.')}</p>}
        {isCommand && !menuOpen && streaming && exactCommand?.available && !exactCommand.allowWhileRunning && <p className="inline-warning" role="status">{t('Wait for the Agent to finish before running this command.', 'Tunggu pekerjaan Agent selesai sebelum menjalankan perintah ini.')}</p>}
        {menuOpen && <SlashCommandMenu id={commandMenuId} commands={suggestions} selectedIndex={selectedIndex} loading={commandsLoading || loadingCatalogs.has(active.id)} error={catalogError?.id === active.id ? catalogError.message : undefined} onSelect={selectCommand} onRetry={onLoadCommands ? () => { composer.current?.focus(); void loadCommands(active.id); } : undefined}/>}
        <form className={`chat-composer ${streaming ? 'is-streaming' : ''}`} onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <textarea ref={composer} aria-label={t('Message Agent', 'Pesan untuk Agent')} value={active.draft} onChange={(event) => onDraft(active.id, event.target.value)} onFocus={() => setComposerFocused(true)} onBlur={event => { if (!event.relatedTarget?.closest('.slash-menu')) setComposerFocused(false); }} aria-autocomplete="list" aria-controls={menuOpen ? commandMenuId : undefined} aria-expanded={menuOpen} aria-activedescendant={menuOpen && selectedIndex >= 0 ? `${commandMenuId}-${selectedIndex}` : undefined} rows={1} placeholder={t('Write a message or / for commands…', 'Tulis pesan atau / untuk perintah…')} onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.shiftKey) return;
            if (menuOpen) {
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDismissedQuery(draft); return; }
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const enabled = suggestions.map((item, index) => item.available ? index : -1).filter(index => index >= 0);
                if (enabled.length) { const current = enabled.indexOf(selectedIndex); setSelectedCommand(enabled[(current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length]); }
                return;
              }
              if ((event.key === 'Tab' || (event.key === 'Enter' && !exactCommand)) && selectedIndex >= 0) { event.preventDefault(); selectCommand(suggestions[selectedIndex]); return; }
            }
            if (event.key === 'Enter') { event.preventDefault(); void send(); }
          }}/>
          <button className="send-button" type="submit" aria-label={commandBusy ? t('Running command', 'Menjalankan perintah') : isCommand ? t('Run command', 'Jalankan perintah') : streaming ? t('Waiting for Agent', 'Menunggu respons Agent') : t('Send message', 'Kirim pesan')} title={preview ? t('Sending is available in the installed app', 'Pengiriman tersedia di aplikasi terpasang') : undefined} disabled={sendDisabled}>{commandBusy || (streaming && !commandAllowed) ? <LoaderCircle size={19} className="spinning"/> : <ArrowUp size={21}/>}</button>
        </form>
        <div className="composer-caption"><span>{t('/ for commands · /new for a new session', '/ untuk perintah · /new untuk sesi baru')}</span><span>{t('Shift + Enter for a new line', 'Shift + Enter untuk baris baru')}</span></div>
      </div>}
    </div>
    <ToolActivityPanel id={activityPanelId} panelRef={activityPanel} open={visible && activityOpen} conversationId={active?.id} entries={active?.executionLog} streaming={streaming} onClose={() => { setActivityOpen(false); activityToggle.current?.focus(); }}/>
    </div>
    {visible && newOpen && !active && <Dialog title={t('Choose an Agent connection', 'Pilih koneksi Agent')} description={t('Choose a connection to start chatting.', 'Pilih koneksi untuk memulai chat.')} onClose={() => setNewOpen(false)}><div className="profile-picker">{profiles.map((item) => <button className="profile-pick" key={item.id} onClick={() => { onCreate(item.id); setNewOpen(false); }}><Rabbit size={20}/><span><strong>{item.name}</strong><small>{item.agentProfile || t('Default profile', 'Profil default')}</small></span><Plus size={17}/></button>)}</div></Dialog>}
  </section>;
}

function CommandResultCard({ result }: { result: CommandResult }) {
  const { t, locale } = useI18n();
  const status = { pending: t('Waiting for command result…', 'Menunggu hasil perintah…'), complete: t('Complete', 'Selesai'), error: t('Command failed', 'Perintah gagal'), unknown: t('Outcome unknown. Check the server before trying again.', 'Hasil belum diketahui. Periksa server sebelum mencoba lagi.') }[result.status];
  return <article className={`command-result command-result-${result.status}`} aria-label={t(`Command result ${result.command}`, `Hasil perintah ${result.command}`)}>
    <div className="command-result-header"><span>{t('Command', 'Perintah')}</span><strong>{result.command}</strong><time dateTime={new Date(result.createdAt).toISOString()}>{new Date(result.createdAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time></div>
    {result.content && <p className="command-result-content">{result.content}</p>}
    <p className="command-result-state" role={result.status === 'pending' ? 'status' : undefined}>{status}</p>
  </article>;
}

function safeUrl(value: string | undefined) { if (!value) return undefined; try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined; } catch { return undefined; } }

function SafeMarkdown({ children }: { children: string }) {
  const { t } = useI18n();
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children: linkChildren }) => { const url = safeUrl(href); return url ? <a href={url} target="_blank" rel="noopener noreferrer">{linkChildren}</a> : <span>{linkChildren}</span>; },
    img: ({ alt }) => <span className="blocked-image">{t('External image not loaded', 'Gambar eksternal tidak dimuat')}{alt ? `: ${alt}` : ''}</span>,
    pre: ({ children: codeChildren }) => <CodeBlock>{codeChildren}</CodeBlock>,
  }}>{children}</ReactMarkdown>;
}

function textContent(children: ReactNode): string { return Children.toArray(children).map((child) => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textContent(child.props.children) : '').join(''); }

function CodeBlock({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  const child = Children.toArray(children).find((item) => isValidElement(item));
  const language = isValidElement<{ className?: string }>(child) ? child.props.className?.replace('language-', '') : undefined;
  return <div className="code-block"><div className="code-header"><span>{language || t('code', 'kode')}</span><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(textContent(children).replace(/\n$/, '')); setCopied(true); setFailed(false); if (timeout.current) clearTimeout(timeout.current); timeout.current = setTimeout(() => setCopied(false), 2000); } catch { setFailed(true); } }}>{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? t('Copied', 'Tersalin') : failed ? t('Copy manually', 'Salin manual') : t('Copy', 'Salin')}</button></div><pre>{children}</pre></div>;
}
