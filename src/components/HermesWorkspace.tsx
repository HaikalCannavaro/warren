import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Check, ChevronDown, Copy, Rabbit, LoaderCircle, MessageSquare, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import type { Conversation, HermesProfile } from '../types';
import { Dialog, ConfirmDialog } from './Dialog';

export function HermesWorkspace({ profiles, conversations, activeId, preview, streamingIds, toolActivity, onAddProfile, onCreate, onSelect, onDelete, onRename, onDraft, onSend }: {
  profiles: HermesProfile[]; conversations: Conversation[]; activeId: string | null; preview: boolean; streamingIds: Set<string>; toolActivity: Record<string, string>;
  onAddProfile: () => void; onCreate: (profileId: string) => string; onSelect: (id: string) => void; onDelete: (id: string) => void; onRename: (id: string, title: string) => void; onDraft: (id: string, text: string) => void; onSend: (id: string) => Promise<void>;
}) {
  const [newOpen, setNewOpen] = useState(false);
  const [rename, setRename] = useState<Conversation | null>(null);
  const [renameText, setRenameText] = useState('');
  const [remove, setRemove] = useState<Conversation | null>(null);
  const [localError, setLocalError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const active = conversations.find((conversation) => conversation.id === activeId);
  const profile = profiles.find((item) => item.id === active?.profileId);
  const streaming = !!active && streamingIds.has(active.id);
  const messages = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const lastContent = active?.messages.at(-1)?.content;
  useEffect(() => { if (follow.current && messages.current) messages.current.scrollTop = messages.current.scrollHeight; }, [lastContent, active?.messages.length]);
  useEffect(() => { follow.current = true; if (messages.current) messages.current.scrollTop = messages.current.scrollHeight; setLocalError(''); }, [activeId]);
  useEffect(() => { const field = composer.current; if (field) { field.style.height = 'auto'; field.style.height = `${Math.min(field.scrollHeight, 160)}px`; } }, [active?.draft]);
  const startNew = () => { if (!profiles.length) onAddProfile(); else if (profiles.length === 1) { onCreate(profiles[0].id); setHistoryOpen(false); } else setNewOpen(true); };
  const send = async () => { if (!active || !active.draft.trim() || streaming || preview || !profile) return; setLocalError(''); follow.current = true; try { await onSend(active.id); } catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'Pesan belum dapat dikirim.'); } };
  return <section className="hermes-workspace panel">
    <aside className={`conversation-sidebar ${historyOpen ? 'mobile-open' : ''}`} aria-label="Riwayat percakapan">
      <div className="conversation-list-title"><span>PERCAKAPAN</span><span className="count-badge">{conversations.length}</span></div>
      <button className="button secondary new-conversation" onClick={startNew}><Plus size={16}/> Percakapan baru</button>
      {conversations.length ? <div className="conversation-list">{[...conversations].sort((a, b) => b.createdAt - a.createdAt).map((conversation) => <button key={conversation.id} className={`conversation-item ${activeId === conversation.id ? 'selected' : ''}`} onClick={() => { onSelect(conversation.id); setHistoryOpen(false); }}><MessageSquare size={16}/><span><strong>{conversation.title}</strong><small>{profiles.find((item) => item.id === conversation.profileId)?.name ?? 'Koneksi tidak tersedia'}</small></span>{streamingIds.has(conversation.id) && <LoaderCircle className="spinning" size={13}/>}</button>)}</div> : <div className="conversation-empty"><MessageSquare size={23}/><p>Ruang untuk ide<br/>dan percakapan Anda.</p><span>Riwayat akan muncul di sini.</span></div>}
      <div className="conversation-bottom"><span className="status-dot"/>{profiles.length} koneksi Agent</div>
    </aside>
    <div className="chat-main">
      <div className="chat-topbar"><button className="mobile-history icon-button" aria-label="Tampilkan riwayat percakapan" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}><MessageSquare size={18}/><ChevronDown size={12}/></button><div className="chat-identity"><Rabbit size={18}/><span>{active?.title ?? 'Agent'}<small>{profile ? `${profile.name} · ${profile.model}` : 'Asisten dari server Anda'}</small></span></div>{active && <div className="chat-actions"><button className="icon-button" aria-label="Ganti nama percakapan" onClick={() => { setRename(active); setRenameText(active.title); }}><Pencil size={16}/></button><button className="icon-button danger-text" aria-label="Hapus percakapan" disabled={streaming} onClick={() => setRemove(active)}><Trash2 size={16}/></button></div>}</div>
      <div className="chat-messages" ref={messages} onScroll={() => { const area = messages.current; if (area) follow.current = area.scrollHeight - area.scrollTop - area.clientHeight < 100; }}>
        {!active?.messages.length ? <div className="chat-empty"><div className="hermes-mark"><Rabbit size={32} strokeWidth={1.4}/></div><span className="eyebrow">BERPIKIR LEBIH LELUASA</span><h2>Halo, ini ruang Agent.</h2><p>{profile ? `Mulai percakapan dengan ${profile.name}. Pesan Anda akan dikirim ke server yang Anda pilih.` : 'Hubungkan asisten Anda sendiri. Diskusikan ide, pahami masalah, dan simpan percakapan dalam satu ruang.'}</p>{!active && <button className="button primary" onClick={startNew}><Plus size={16}/>{profiles.length ? 'Mulai percakapan' : 'Hubungkan Agent'}</button>}<div className="chat-empty-foot"><span/><p>Terpisah dari terminal. Anda yang memutuskan<br/>kapan sebuah perintah dijalankan.</p></div></div> : active.messages.map((message) => <article key={message.id} className={`message message-${message.role}`}><div className="message-avatar">{message.role === 'user' ? <UserRound size={17}/> : <Rabbit size={18}/>}</div><div className="message-body"><div className="message-byline"><strong>{message.role === 'user' ? 'Anda' : 'Agent'}</strong><time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</time>{message.status === 'streaming' && <span className="stream-label"><LoaderCircle size={12} className="spinning"/> Menulis</span>}</div>{message.content ? <div className="markdown"><SafeMarkdown>{message.content}</SafeMarkdown></div> : message.status === 'streaming' ? <span className="waiting-text">Menunggu respons server…</span> : null}{message.error && <p className="message-error" role="alert">{message.error}</p>}{message.status === 'unknown' && <p className="message-error">Status pengiriman belum diketahui. Periksa server sebelum mengirim ulang.</p>}</div></article>)}
      </div>
      {active && <div className="composer-area">
        {toolActivity[active.id] && <div className="tool-activity"><LoaderCircle size={13} className={streaming ? 'spinning' : ''}/><span>{toolActivity[active.id]}</span></div>}
        {localError && <p className="inline-error" role="alert">{localError}</p>}
        {!profile && <p className="inline-warning">Koneksi percakapan ini sudah dihapus. Buat percakapan dengan koneksi yang tersedia.</p>}
        <form className={`chat-composer ${streaming ? 'is-streaming' : ''}`} onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea ref={composer} aria-label="Pesan untuk Agent" value={active.draft} onChange={(event) => onDraft(active.id, event.target.value)} rows={1} placeholder={preview ? 'Tulis draft · kirim dari aplikasi native' : 'Tulis pesan untuk Agent…'} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}/><button className="send-button" type="submit" aria-label={streaming ? 'Menunggu respons Agent' : 'Kirim pesan'} disabled={preview || streaming || !active.draft.trim() || !profile}>{streaming ? <LoaderCircle size={19} className="spinning"/> : <ArrowUp size={21}/>}</button></form>
        <div className="composer-caption"><span>{preview ? 'Mode pratinjau · pesan tidak dikirim' : 'Pesan dikirim ke endpoint Hermes Anda'}</span><span>Shift + Enter untuk baris baru</span></div>
      </div>}
    </div>
    {newOpen && <Dialog title="Pilih koneksi Agent" description="Percakapan baru menggunakan endpoint yang Anda pilih." onClose={() => setNewOpen(false)}><div className="profile-picker">{profiles.map((item) => <button className="profile-pick" key={item.id} onClick={() => { onCreate(item.id); setNewOpen(false); setHistoryOpen(false); }}><Rabbit size={20}/><span><strong>{item.name}</strong><small>{item.model}</small></span><Plus size={17}/></button>)}</div></Dialog>}
    {rename && <Dialog title="Ganti nama percakapan" onClose={() => setRename(null)}><form className="profile-form" onSubmit={(event) => { event.preventDefault(); if (renameText.trim()) { onRename(rename.id, renameText.trim()); setRename(null); } }}><label htmlFor="conversation-title">Nama percakapan<input id="conversation-title" value={renameText} onChange={(event) => setRenameText(event.target.value)} maxLength={80} required/></label><div className="dialog-actions"><button className="button secondary" type="button" onClick={() => setRename(null)}>Batal</button><button className="button primary" type="submit" disabled={!renameText.trim()}>Simpan</button></div></form></Dialog>}
    {remove && <ConfirmDialog title="Hapus percakapan?" description={`“${remove.title}” beserta semua pesan dan draft di perangkat ini akan dihapus.`} onConfirm={() => onDelete(remove.id)} onClose={() => setRemove(null)}/>}
  </section>;
}

function safeUrl(value: string | undefined) { if (!value) return undefined; try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined; } catch { return undefined; } }

function SafeMarkdown({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    a: ({ href, children: linkChildren }) => { const url = safeUrl(href); return url ? <a href={url} target="_blank" rel="noopener noreferrer">{linkChildren}</a> : <span>{linkChildren}</span>; },
    img: ({ alt }) => <span className="blocked-image">Gambar eksternal tidak dimuat{alt ? `: ${alt}` : ''}</span>,
    pre: ({ children: codeChildren }) => <CodeBlock>{codeChildren}</CodeBlock>,
  }}>{children}</ReactMarkdown>;
}

function textContent(children: ReactNode): string { return Children.toArray(children).map((child) => typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textContent(child.props.children) : '').join(''); }

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  const child = Children.toArray(children).find((item) => isValidElement(item));
  const language = isValidElement<{ className?: string }>(child) ? child.props.className?.replace('language-', '') : undefined;
  return <div className="code-block"><div className="code-header"><span>{language || 'code'}</span><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(textContent(children).replace(/\n$/, '')); setCopied(true); setFailed(false); if (timeout.current) clearTimeout(timeout.current); timeout.current = setTimeout(() => setCopied(false), 2000); } catch { setFailed(true); } }}>{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? 'Tersalin' : failed ? 'Salin manual' : 'Salin'}</button></div><pre>{children}</pre></div>;
}
