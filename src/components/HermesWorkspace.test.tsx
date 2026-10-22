// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HermesWorkspace } from './HermesWorkspace';
import { Dialog } from './Dialog';
import type { Conversation, SlashCommand } from '../types';
import { setLanguage } from '../lib/i18n';
import { basicSlashCommands } from '../lib/slashCommands';

const originalWidth = window.innerWidth;
beforeEach(() => setLanguage('id'));
afterEach(() => { cleanup(); vi.restoreAllMocks(); Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth }); });

function viewport(width: number) { Object.defineProperty(window, 'innerWidth', { configurable: true, value: width }); }

function props(content = '') {
  const conversation: Conversation = { id: 'conversation-1', profileId: 'hermes-1', title: 'Test conversation', draft: '', createdAt: 1, messages: content ? [{ id: 'message-1', role: 'assistant', content, createdAt: 1, status: 'complete' }] : [] };
  return { profiles: [{ id: 'hermes-1', name: 'Configured Hermes', url: 'https://example.com/v1', token: '', model: 'my-model' }], conversations: [conversation], activeId: conversation.id, preview: false, streamingIds: new Set<string>(), toolActivity: {}, onAddProfile: vi.fn(), onCreate: vi.fn(() => 'new-id'), onSelect: vi.fn(), onDelete: vi.fn(), onRename: vi.fn(), onDraft: vi.fn(), onSend: vi.fn(async () => {}) };
}

function WorkspaceWithAppDialog() {
  const [dialogOpen, setDialogOpen] = useState(false);
  return <><button onClick={() => setDialogOpen(true)}>Koneksi Agent</button><HermesWorkspace {...props()}/>{dialogOpen && <Dialog title="Koneksi Agent" onClose={() => setDialogOpen(false)}><label>Connection name<input aria-label="Connection name"/></label><label>Connection endpoint<input aria-label="Connection endpoint"/></label></Dialog>}</>;
}

describe('Hermes UI boundaries', () => {
  it('switches interface language without translating messages, drafts, command output or server logs', () => {
    setLanguage('en');
    viewport(1440);
    const callbacks = props('Balasan Agent tetap dalam bahasa percakapan.');
    callbacks.conversations[0].draft = 'Tolong jelaskan ini.';
    callbacks.conversations[0].commandResults = [{ id: 'status', command: '/status', content: 'Sesi server tetap aktif', createdAt: 2, status: 'complete' }];
    callbacks.conversations[0].executionLog = [{ id: 'log', requestId: 'request', timestamp: 3, kind: 'complete', text: 'Server telah menyelesaikan permintaan.' }];
    render(<HermesWorkspace {...callbacks}/>);
    const composer = screen.getByLabelText('Message Agent') as HTMLTextAreaElement;
    expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide Tool Activity' })).toBeTruthy();
    expect(screen.getByLabelText('Command result /status')).toBeTruthy();
    act(() => setLanguage('id'));
    expect(screen.getByLabelText('Pesan untuk Agent')).toBe(composer);
    expect(composer.value).toBe('Tolong jelaskan ini.');
    expect(screen.getByRole('button', { name: 'Kirim pesan' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sembunyikan aktivitas tool' })).toBeTruthy();
    expect(screen.getByLabelText('Hasil perintah /status')).toBeTruthy();
    expect(screen.getByText('Balasan Agent tetap dalam bahasa percakapan.')).toBeTruthy();
    expect(screen.getByText('Sesi server tetap aktif')).toBeTruthy();
    expect(screen.getByText('Server telah menyelesaikan permintaan.')).toBeTruthy();
    expect(callbacks.onSend).not.toHaveBeenCalled();
    expect(callbacks.onDraft).not.toHaveBeenCalled();
  });

  it.each([1440, 390])('shows one chat space with no history or new/delete controls at %s px', width => {
    viewport(width);
    const callbacks = props('Current session response');
    callbacks.conversations.push({ id: 'older-session', profileId: 'hermes-1', title: 'Hidden archive', draft: '', createdAt: 0, messages: [] });
    const { container } = render(<HermesWorkspace {...callbacks}/>);
    expect(container.querySelector('.conversation-sidebar')).toBeNull();
    expect(screen.queryByRole('button', { name: /riwayat percakapan/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Percakapan baru|Hapus percakapan|Mulai chat|Ganti nama percakapan/i })).toBeNull();
    expect(screen.queryByText('Hidden archive')).toBeNull();
    expect(screen.getByText('Current session response')).toBeTruthy();
    expect(screen.getByLabelText('Pesan untuk Agent')).toBeTruthy();
    expect(callbacks.onCreate).not.toHaveBeenCalled();
    expect(callbacks.onSelect).not.toHaveBeenCalled();
    expect(callbacks.onDelete).not.toHaveBeenCalled();
  });

  it('offers connection selection only when starting the first chat', () => {
    const callbacks = props();
    const profiles = [...callbacks.profiles, { ...callbacks.profiles[0], id: 'hermes-2', name: 'Second connection' }];
    const { rerender } = render(<HermesWorkspace {...callbacks} profiles={profiles} activeId={null} conversations={[]}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai chat' }));
    const picker = screen.getByRole('dialog', { name: 'Pilih koneksi Agent' });
    fireEvent.click(within(picker).getByRole('button', { name: /Second connection/ }));
    expect(callbacks.onCreate).toHaveBeenCalledExactlyOnceWith('hermes-2');
    rerender(<HermesWorkspace {...callbacks} profiles={profiles}/>);
    expect(screen.queryByRole('button', { name: 'Mulai chat' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Pilih koneksi Agent' })).toBeNull();
  });

  it('starts the initial chat directly for one connection and requests setup when none exists', () => {
    const callbacks = props();
    const { rerender } = render(<HermesWorkspace {...callbacks} activeId={null} conversations={[]}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Mulai chat' }));
    expect(callbacks.onCreate).toHaveBeenCalledExactlyOnceWith('hermes-1');
    rerender(<HermesWorkspace {...callbacks} profiles={[]} activeId={null} conversations={[]}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Hubungkan Agent' }));
    expect(callbacks.onAddProfile).toHaveBeenCalledOnce();
  });

  it('shows the agent connection prominently without a conversation title or rename action', () => {
    const callbacks = props();
    const { container } = render(<HermesWorkspace {...callbacks}/>);
    const header = container.querySelector('.chat-identity')!;
    expect(header.querySelector('strong')?.textContent).toBe('Configured Hermes');
    expect(header.textContent).not.toContain('Test conversation');
    expect(screen.queryByRole('button', { name: 'Ganti nama percakapan' })).toBeNull();
  });

  it('shows the Hermes configuration profile independently from the connection and brain model', () => {
    setLanguage('en');
    const callbacks = props();
    const profile = { ...callbacks.profiles[0], name: 'My VPS', model: 'brain-model-123', agentProfile: 'Leveret' };
    const { container, rerender } = render(<HermesWorkspace {...callbacks} profiles={[profile]}/>);
    const header = container.querySelector('.chat-identity')!;
    expect(header.querySelector('.chat-identity-copy > strong')?.textContent).toBe('My VPS');
    expect(within(header as HTMLElement).getByLabelText('Profile: Leveret')).toBeTruthy();
    expect(header.textContent).not.toContain('brain-model-123');
    rerender(<HermesWorkspace {...callbacks} profiles={[profile]} conversations={[{ ...callbacks.conversations[0], agentProfile: 'Research' }]}/>);
    expect(within(header as HTMLElement).getByLabelText('Profile: Research')).toBeTruthy();
    rerender(<HermesWorkspace {...callbacks} profiles={[{ ...profile, agentProfile: undefined }]}/>);
    expect(within(header as HTMLElement).getByLabelText('Profile: Default profile')).toBeTruthy();
    expect(header.textContent).not.toContain('brain-model-123');
  });

  it('labels replies with their saved Agent profile and keeps brain models out of sender names', () => {
    const callbacks = props('First reply');
    callbacks.conversations[0].messages[0].agentProfile = 'Earlier profile';
    callbacks.conversations[0].messages.push({ id: 'legacy-reply', role: 'assistant', content: 'Reply without saved identity', createdAt: 2, status: 'complete' });
    const profile = { ...callbacks.profiles[0], agentProfile: 'Leveret', model: 'brain-model-123' };
    const { container, rerender } = render(<HermesWorkspace {...callbacks} profiles={[profile]}/>);
    const senderNames = () => Array.from(container.querySelectorAll('.message-byline strong')).map(element => element.textContent);
    expect(senderNames()).toEqual(['Earlier profile', 'Leveret']);
    rerender(<HermesWorkspace {...callbacks} profiles={[profile]} conversations={[{ ...callbacks.conversations[0], agentProfile: 'Research' }]}/>);
    expect(senderNames()).toEqual(['Earlier profile', 'Research']);
    rerender(<HermesWorkspace {...callbacks} profiles={[{ ...profile, agentProfile: undefined }]}/>);
    expect(senderNames()).toEqual(['Earlier profile', 'Agent']);
    expect(senderNames()).not.toContain('brain-model-123');
  });

  it('uses configuration profiles in connection choices without relabeling model identifiers', () => {
    setLanguage('en');
    const callbacks = props();
    const profiles = [
      { ...callbacks.profiles[0], name: 'VPS One', agentProfile: 'Leveret', model: 'brain-model-123' },
      { ...callbacks.profiles[0], id: 'second', name: 'VPS Two', model: 'different-brain-model' },
    ];
    render(<HermesWorkspace {...callbacks} activeId={null} conversations={[]} profiles={profiles}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Start chat' }));
    const picker = screen.getByRole('dialog', { name: 'Choose an Agent connection' });
    expect(within(picker).getByRole('button', { name: /VPS One Leveret/ })).toBeTruthy();
    expect(within(picker).getByRole('button', { name: /VPS Two Default profile/ })).toBeTruthy();
    expect(picker.textContent).not.toContain('brain-model');
  });

  it('does not fetch remote images and only makes http/https links navigable', () => {
    render(<HermesWorkspace {...props('[Safe link](https://example.com/docs)\n\n[Unsafe](javascript:alert%281%29)\n\n![External image](https://example.com/tracker.png)')}/>);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://example.com/docs');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('Gambar eksternal tidak dimuat: External image')).toBeTruthy();
  });

  it('copies code as text without sending a message or invoking terminal execution', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const callbacks = props('```sh\necho reviewed\n```');
    render(<HermesWorkspace {...callbacks}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Salin' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith('echo reviewed'));
    expect(callbacks.onSend).not.toHaveBeenCalled();
  });

  it('keeps preview drafts editable while disabling network sends', () => {
    const callbacks = props();
    callbacks.conversations[0].draft = 'Existing draft';
    render(<HermesWorkspace {...callbacks} preview/>);
    expect(screen.queryByText(/mode pratinjau|browser preview/i)).toBeNull();
    expect(screen.getByPlaceholderText('Tulis pesan atau / untuk perintah…')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Pesan untuk Agent'), { target: { value: 'Edited draft' } });
    expect(callbacks.onDraft).toHaveBeenCalledWith('conversation-1', 'Edited draft');
    expect((screen.getByRole('button', { name: 'Kirim pesan' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Pesan untuk Agent'), { key: 'Enter' });
    expect(callbacks.onSend).not.toHaveBeenCalled();
  });

  it('collapses Aktivitas tool without remounting chat or interrupting a stream', () => {
    viewport(1440);
    const callbacks = props('The response is still arriving');
    callbacks.conversations[0].draft = 'Draft kept while streaming';
    callbacks.conversations[0].messages[0].status = 'streaming';
    callbacks.conversations[0].executionLog = [{ id: 'log-1', requestId: 'request-1', timestamp: 1, kind: 'tool', text: 'Server reported: reading a file' }];
    callbacks.streamingIds.add('conversation-1');
    const { rerender } = render(<HermesWorkspace {...callbacks}/>);
    const composer = screen.getByLabelText('Pesan untuk Agent') as HTMLTextAreaElement;
    const activityToggle = screen.getByRole('button', { name: 'Sembunyikan aktivitas tool' });
    const activityPanel = document.getElementById(activityToggle.getAttribute('aria-controls')!)!;
    fireEvent.click(activityToggle);
    expect(activityPanel.getAttribute('aria-hidden')).toBe('true');
    expect(activityPanel.hasAttribute('inert')).toBe(true);
    expect(activityPanel.textContent).toContain('Server reported: reading a file');
    expect(screen.getByLabelText('Pesan untuk Agent')).toBe(composer);
    expect(composer.value).toBe('Draft kept while streaming');
    expect(screen.getByLabelText('Agent sedang merespons')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Menunggu respons Agent' }) as HTMLButtonElement).disabled).toBe(true);
    const updated = { ...callbacks.conversations[0], messages: [{ ...callbacks.conversations[0].messages[0], content: 'More streamed text arrived while hidden' }], executionLog: [...callbacks.conversations[0].executionLog!, { id: 'log-2', requestId: 'request-1', timestamp: 2, kind: 'tool' as const, text: 'Server reported: reading another file' }] };
    rerender(<HermesWorkspace {...callbacks} conversations={[updated]}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan aktivitas tool' }));
    expect(activityPanel.getAttribute('aria-hidden')).toBe('false');
    expect(activityPanel.hasAttribute('inert')).toBe(false);
    expect(within(activityPanel).getByText('Server reported: reading another file')).toBeTruthy();
    expect(screen.getByText('More streamed text arrived while hidden')).toBeTruthy();
    expect(callbacks.onSend).not.toHaveBeenCalled();
    expect(callbacks.onDelete).not.toHaveBeenCalled();
    expect(callbacks.onDraft).not.toHaveBeenCalled();
  });

  it('retains the activity panel choice when the active session changes and isolates its log', () => {
    viewport(1440);
    const callbacks = props('First response');
    callbacks.conversations[0].executionLog = [{ id: 'first-log', requestId: 'first-request', timestamp: 1, kind: 'tool', text: 'Only first conversation activity' }];
    const second: Conversation = { id: 'conversation-2', profileId: 'hermes-1', title: 'Second conversation', draft: 'Second draft', createdAt: 2, messages: [], executionLog: [{ id: 'second-log', requestId: 'second-request', timestamp: 2, kind: 'complete', text: 'Only second conversation activity' }] };
    callbacks.conversations.push(second);
    const { rerender } = render(<HermesWorkspace {...callbacks}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan aktivitas tool' }));
    rerender(<HermesWorkspace {...callbacks} activeId="conversation-2"/>);
    expect(screen.getByRole('button', { name: 'Tampilkan aktivitas tool' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan aktivitas tool' }));
    expect(screen.getByText('Only second conversation activity')).toBeTruthy();
    expect(screen.queryByText('Only first conversation activity')).toBeNull();
    expect((screen.getByLabelText('Pesan untuk Agent') as HTMLTextAreaElement).value).toBe('Second draft');
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });

  it.each([1440, 1024, 390])('keeps activity beside an interactive chat with no overlay at %s px', width => {
    viewport(width);
    const callbacks = props('Persistent Agent message');
    callbacks.conversations[0].draft = 'Draft stays editable';
    callbacks.conversations[0].messages.push({ id: 'user-message', role: 'user', content: 'Persistent user message', createdAt: 2, status: 'complete' });
    const { container } = render(<HermesWorkspace {...callbacks}/>);
    const composer = screen.getByLabelText('Pesan untuk Agent');
    const assistantBubble = container.querySelector('.message-assistant');
    const userBubble = container.querySelector('.message-user');
    const toggle = screen.getByRole('button', { name: /^(Sembunyikan|Tampilkan) aktivitas tool$/i });
    if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
    const panel = screen.getByRole('complementary', { name: 'Aktivitas tool' });
    expect(panel.parentElement).toBe(container.querySelector('.chat-main')?.parentElement);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelector('.panel-backdrop')).toBeNull();
    expect(container.querySelector('.chat-main')?.hasAttribute('inert')).toBe(false);
    composer.focus();
    fireEvent.change(composer, { target: { value: 'Still typing beside the log' } });
    expect(callbacks.onDraft).toHaveBeenCalledWith('conversation-1', 'Still typing beside the log');
    fireEvent.click(within(panel).getByRole('button', { name: 'Tutup aktivitas tool' }));
    expect(document.activeElement).toBe(toggle);
    expect(panel.hasAttribute('inert')).toBe(true);
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Pesan untuk Agent')).toBe(composer);
    expect(container.querySelector('.message-assistant')).toBe(assistantBubble);
    expect(container.querySelector('.message-user')).toBe(userBubble);
    expect(callbacks.onSend).not.toHaveBeenCalled();
  });

  it('preserves the activity choice across resizing and temporarily hidden navigation', () => {
    viewport(1440);
    const callbacks = props();
    const { rerender } = render(<HermesWorkspace {...callbacks}/>);
    const toggle = screen.getByRole('button', { name: 'Sembunyikan aktivitas tool' });
    fireEvent.click(toggle);
    viewport(390);
    fireEvent(window, new Event('resize'));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    viewport(1024);
    fireEvent(window, new Event('resize'));
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    rerender(<HermesWorkspace {...callbacks} visible={false}/>);
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)?.hasAttribute('inert')).toBe(true);
    rerender(<HermesWorkspace {...callbacks}/>);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('complementary', { name: 'Aktivitas tool' }).hasAttribute('inert')).toBe(false);
  });

  it('closes activity with Escape only from inside the panel and never traps Tab', async () => {
    viewport(390);
    const user = userEvent.setup();
    const callbacks = props();
    callbacks.conversations[0].draft = '/';
    callbacks.conversations[0].executionLog = [{ id: 'log', requestId: 'request', timestamp: 1, kind: 'tool', text: 'Server progress' }];
    render(<><HermesWorkspace {...callbacks}/><button>Outside activity</button></>);
    const toggle = screen.getByRole('button', { name: 'Tampilkan aktivitas tool' });
    fireEvent.click(toggle);
    const composer = screen.getByLabelText('Pesan untuk Agent');
    fireEvent.focus(composer);
    expect(screen.getByRole('listbox', { name: 'Perintah Agent' })).toBeTruthy();
    fireEvent.keyDown(composer, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const panel = screen.getByRole('complementary', { name: 'Aktivitas tool' });
    const list = within(panel).getByRole('list', { name: 'Daftar log eksekusi' });
    list.focus();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Outside activity' }));
    list.focus();
    fireEvent.keyDown(list, { key: 'Escape' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('leaves App dialog focus and Escape independent of the activity panel', () => {
    viewport(390);
    render(<WorkspaceWithAppDialog/>);
    const toggle = screen.getByRole('button', { name: 'Tampilkan aktivitas tool' });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Koneksi Agent' }));
    const appDialog = screen.getByRole('dialog', { name: 'Koneksi Agent' });
    expect(document.activeElement).toBe(within(appDialog).getByRole('textbox', { name: 'Connection name' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('complementary', { name: 'Aktivitas tool' })).toBeTruthy();
  });

  it('shows an empty log without inferring events from assistant text or the legacy activity summary', () => {
    viewport(1440);
    const callbacks = props('I successfully executed every command.');
    render(<HermesWorkspace {...callbacks} toolActivity={{ 'conversation-1': 'Invented legacy tool result' }}/>);
    expect(screen.getByText('Belum ada aktivitas')).toBeTruthy();
    expect(screen.getByText('Siap')).toBeTruthy();
    expect(screen.queryByText('Permintaan selesai')).toBeNull();
    expect(screen.queryByText('Invented legacy tool result')).toBeNull();
    expect(screen.queryByLabelText('Agent sedang merespons')).toBeNull();
    expect(document.querySelectorAll('.execution-entry')).toHaveLength(0);
    expect(document.querySelector('.message-byline strong')?.textContent).toBe('Agent');
  });

  it('hides the active chat dot after an uncertain ending while keeping duplicate sends disabled', () => {
    viewport(1440);
    const callbacks = props('Partial response before close');
    callbacks.conversations[0].draft = 'Do not send twice';
    callbacks.conversations[0].messages[0].status = 'unknown';
    callbacks.conversations[0].executionLog = [{ id: 'unknown', requestId: 'request-1', timestamp: 2, kind: 'unknown', text: 'Request outcome is uncertain' }];
    callbacks.streamingIds.add('conversation-1');
    render(<HermesWorkspace {...callbacks}/>);
    expect(screen.queryByLabelText('Agent sedang merespons')).toBeNull();
    expect(screen.queryByText('Berjalan')).toBeNull();
    expect(document.querySelector('.execution-status-dot')).toBeNull();
    expect((screen.getByRole('button', { name: 'Menunggu respons Agent' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Pesan untuk Agent'), { key: 'Enter' });
    expect(callbacks.onSend).not.toHaveBeenCalled();
  });
});

const slashCommands: SlashCommand[] = [
  { name: 'help', description: 'Daftar perintah', available: true, allowWhileRunning: true },
  { name: 'model', description: 'Pilih model', args: '[nama model]', available: true },
  { name: 'stop', description: 'Hentikan pekerjaan', available: true, allowWhileRunning: true },
];

function EditableWorkspace({ initialDraft = '', ...overrides }: Partial<Parameters<typeof HermesWorkspace>[0]> & { initialDraft?: string }) {
  const [draft, setDraft] = useState(initialDraft);
  const defaults = props();
  const conversations = overrides.conversations ?? defaults.conversations;
  return <HermesWorkspace {...defaults} commands={slashCommands} {...overrides} conversations={conversations.map(item => ({ ...item, draft }))} onDraft={(id, text) => { setDraft(text); overrides.onDraft?.(id, text); }}/>;
}

describe('slash command composer', () => {
  it('refreshes cached built-in command descriptions when the interface language changes', () => {
    const commands = basicSlashCommands();
    render(<EditableWorkspace initialDraft="/new" commands={commands}/>);
    fireEvent.focus(screen.getByLabelText('Pesan untuk Agent'));
    expect(screen.getByText('Mulai percakapan baru.')).toBeTruthy();
    act(() => setLanguage('en'));
    expect(screen.getByText('Start a new conversation.')).toBeTruthy();
    expect(screen.queryByText('Mulai percakapan baru.')).toBeNull();
  });

  it('localizes command controls while preserving server descriptions and command text', () => {
    setLanguage('en');
    const serverDescription = 'Deskripsi khusus dari server Agent';
    render(<EditableWorkspace initialDraft="/" commands={[{ name: 'custom-command', description: serverDescription, available: true }]}/>);
    const composer = screen.getByLabelText('Message Agent') as HTMLTextAreaElement;
    fireEvent.focus(composer);
    expect(screen.getByRole('listbox', { name: 'Agent commands' })).toBeTruthy();
    expect(screen.getByText(serverDescription)).toBeTruthy();
    act(() => setLanguage('id'));
    expect(screen.getByRole('listbox', { name: 'Perintah Agent' })).toBeTruthy();
    expect(screen.getByText(serverDescription)).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /\/custom-command/ }));
    expect(composer.value).toBe('/custom-command ');
  });

  it('shows the new-session command hint and routes /new through commands only', async () => {
    const onCommand = vi.fn(async () => {}), onSend = vi.fn(async () => {}), onCreate = vi.fn(() => 'new-id');
    render(<EditableWorkspace initialDraft="/new Rencana berikutnya" commands={undefined} onCommand={onCommand} onSend={onSend} onCreate={onCreate}/>);
    expect(screen.getByText(/\/new untuk sesi baru/)).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('Pesan untuk Agent'), { key: 'Enter' });
    await waitFor(() => expect(onCommand).toHaveBeenCalledExactlyOnceWith('conversation-1', '/new Rencana berikutnya'));
    expect(onSend).not.toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('completes a partial command with the keyboard before executing its exact text', async () => {
    const onCommand = vi.fn(async () => {}), onSend = vi.fn(async () => {});
    render(<EditableWorkspace initialDraft="/mo" onCommand={onCommand} onSend={onSend}/>);
    const composer = screen.getByLabelText('Pesan untuk Agent') as HTMLTextAreaElement;
    fireEvent.focus(composer);
    expect(screen.getByRole('option', { name: /\/model/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /\/stop/ })).toBeNull();
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(composer.value).toBe('/model ');
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: '/model provider/model with args' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(onCommand).toHaveBeenCalledWith('conversation-1', '/model provider/model with args'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('supports touch selection, Escape dismissal, and reopens after the query changes', () => {
    viewport(390);
    render(<EditableWorkspace initialDraft="/"/>);
    const composer = screen.getByLabelText('Pesan untuk Agent') as HTMLTextAreaElement;
    fireEvent.focus(composer);
    fireEvent.keyDown(composer, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /\/model/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(composer, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(composer.value).toBe('/');
    fireEvent.change(composer, { target: { value: '/st' } });
    fireEvent.click(screen.getByRole('option', { name: /\/stop/ }));
    expect(composer.value).toBe('/stop ');
    expect(document.activeElement).toBe(composer);
  });

  it('completes with Tab and skips commands that are unavailable', () => {
    render(<EditableWorkspace initialDraft="/" commands={[
      { name: 'model', description: 'Pilih model', available: false, reason: 'Gateway diperlukan.' },
      { name: 'help', description: 'Lihat bantuan', available: true },
    ]}/>);
    const composer = screen.getByLabelText('Pesan untuk Agent') as HTMLTextAreaElement;
    fireEvent.focus(composer);
    expect(screen.getByRole('option', { name: /\/model/ }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('option', { name: /\/help/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(composer, { key: 'Tab' });
    expect(composer.value).toBe('/help ');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('routes unknown slash commands separately and leaves escaped slashes as chat', async () => {
    const onCommand = vi.fn(async () => {}), onSend = vi.fn(async () => {});
    render(<EditableWorkspace initialDraft="/unknown secret args" onCommand={onCommand} onSend={onSend}/>);
    const composer = screen.getByLabelText('Pesan untuk Agent');
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(onCommand).toHaveBeenCalledWith('conversation-1', '/unknown secret args'));
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.change(composer, { target: { value: '//literal slash' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('conversation-1'));
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it('allows stop during a stream while preserving the chat and command busy gates', async () => {
    const onCommand = vi.fn(async () => {}), onSend = vi.fn(async () => {});
    const { rerender } = render(<EditableWorkspace initialDraft="/stop" streamingIds={new Set(['conversation-1'])} onCommand={onCommand} onSend={onSend}/>);
    const composer = screen.getByLabelText('Pesan untuk Agent');
    fireEvent.keyDown(composer, { key: 'Enter' });
    await waitFor(() => expect(onCommand).toHaveBeenCalledWith('conversation-1', '/stop'));
    fireEvent.change(composer, { target: { value: '/model another' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    fireEvent.change(composer, { target: { value: 'More chat' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    rerender(<EditableWorkspace streamingIds={new Set(['conversation-1'])} commandBusyIds={new Set(['conversation-1'])} onCommand={onCommand} onSend={onSend}/>);
    fireEvent.change(composer, { target: { value: '/stop' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledTimes(1);
  });

  it('keeps preview, composition and multiline input from running commands', () => {
    const onCommand = vi.fn(async () => {});
    const { rerender } = render(<EditableWorkspace initialDraft="/help" onCommand={onCommand}/>);
    const composer = screen.getByLabelText('Pesan untuk Agent');
    fireEvent.keyDown(composer, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true });
    expect(onCommand).not.toHaveBeenCalled();
    rerender(<EditableWorkspace preview onCommand={onCommand}/>);
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('loads the catalog once per conversation and offers explicit retry after failure', async () => {
    const onLoadCommands = vi.fn().mockRejectedValueOnce(new Error('Gateway unavailable')).mockResolvedValue(undefined);
    render(<EditableWorkspace initialDraft="/" onLoadCommands={onLoadCommands}/>);
    const composer = screen.getByLabelText('Pesan untuk Agent');
    fireEvent.focus(composer);
    await waitFor(() => expect(screen.getByText('Gateway unavailable')).toBeTruthy());
    fireEvent.change(composer, { target: { value: '/mo' } });
    expect(onLoadCommands).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await waitFor(() => expect(onLoadCommands).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Gateway unavailable')).toBeNull();
    expect(document.activeElement).toBe(composer);
  });

  it('does not duplicate a pending command even before busy props update', async () => {
    let finish!: () => void;
    const onCommand = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    render(<EditableWorkspace initialDraft="/help" onCommand={onCommand}/>);
    const composer = screen.getByLabelText('Pesan untuk Agent');
    fireEvent.keyDown(composer, { key: 'Enter' });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Jalankan perintah' }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('loads each conversation catalog once and never requests it in preview', async () => {
    const onLoadCommands = vi.fn(async () => {});
    const base = props();
    const second: Conversation = { id: 'conversation-2', profileId: 'hermes-1', title: 'Second', draft: '/', createdAt: 2, messages: [] };
    const { rerender } = render(<EditableWorkspace initialDraft="/" onLoadCommands={onLoadCommands}/>);
    await waitFor(() => expect(onLoadCommands).toHaveBeenCalledTimes(1));
    rerender(<EditableWorkspace activeId="conversation-2" conversations={[...base.conversations, second]} onLoadCommands={onLoadCommands}/>);
    await waitFor(() => expect(onLoadCommands).toHaveBeenCalledWith('conversation-2'));
    rerender(<EditableWorkspace onLoadCommands={onLoadCommands}/>);
    expect(onLoadCommands).toHaveBeenCalledTimes(2);
    rerender(<EditableWorkspace activeId="preview-conversation" conversations={[{ ...second, id: 'preview-conversation' }]} preview onLoadCommands={onLoadCommands}/>);
    expect(onLoadCommands).toHaveBeenCalledTimes(2);
  });

  it('shows why an unavailable command cannot run after arguments are entered', () => {
    const onCommand = vi.fn(async () => {}), onSend = vi.fn(async () => {});
    render(<EditableWorkspace initialDraft="/model fast" commands={[{ name: 'model', description: 'Ganti model', available: false, reason: 'Gateway diperlukan.' }]} onCommand={onCommand} onSend={onSend}/>);
    expect(screen.getByText('Gateway diperlukan.')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('Pesan untuk Agent'), { key: 'Enter' });
    expect(onCommand).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders command output as escaped command cards in chronological order', () => {
    const callbacks = props('Assistant answer');
    callbacks.conversations[0].messages[0].createdAt = 2;
    callbacks.conversations[0].commandResults = [
      { id: 'command-1', command: '/status', content: '<img src=x onerror=alert(1)>', createdAt: 1, status: 'complete' },
      { id: 'command-2', command: '/model', content: 'Not available', createdAt: 3, status: 'error' },
    ];
    const { container } = render(<HermesWorkspace {...callbacks}/>);
    const timeline = container.querySelector('.chat-messages')!;
    const cards = Array.from(timeline.querySelectorAll('article'));
    expect(cards).toHaveLength(3);
    expect(cards[0].classList.contains('command-result')).toBe(true);
    expect(cards[0].textContent).toContain('<img src=x onerror=alert(1)>');
    expect(cards[0].querySelector('img')).toBeNull();
    expect(cards[1].classList.contains('message-assistant')).toBe(true);
    expect(cards[2].classList.contains('command-result')).toBe(true);
    expect(cards[2].textContent).toContain('Not available');
    expect(cards[0].querySelector('.message-avatar')).toBeNull();
  });
});
