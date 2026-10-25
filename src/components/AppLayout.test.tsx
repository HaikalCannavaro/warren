// @vitest-environment jsdom
import { setLanguage } from '../lib/i18n';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import App from '../App';

const mock = vi.hoisted(() => ({ workspace: vi.fn(), disconnect: vi.fn(), lock: vi.fn() }));
vi.mock('../hooks/useWorkspace', () => ({ useWorkspace: mock.workspace }));
vi.mock('./TerminalWorkspace', () => ({ TerminalWorkspace: () => <textarea aria-label="Terminal test buffer" defaultValue="session output"/> }));
beforeEach(() => setLanguage('id'));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('hides and restores Warren navigation without replacing the active terminal or closing work', () => {
  mock.workspace.mockReturnValue({
    ready: true, preview: true, busy: false, error: null, saveError: null,
    state: { version: 1, deviceId: 'test', vps: [], hermes: [], conversations: [], settings: { fontSize: 14, scrollback: 5000 } },
    sessions: [{ id: 'session', profileId: 'server', label: 'VPS', host: 'test.example', status: 'connected' }],
    streamingIds: new Set(), toolActivity: {}, hostPrompt: null, closeSession: mock.disconnect, lock: mock.lock,
  });
  render(<App/>);
  expect(screen.getByRole('heading', { name: /^Observer\s*\.$/ })).toBeTruthy();
  for (const name of ['Navigasi utama', 'Navigasi seluler']) {
    const buttons = within(screen.getByRole('navigation', { name })).getAllByRole('button');
    expect(buttons[0].textContent).toBe('Observer');
    expect(buttons[0].getAttribute('aria-current')).toBe('page');
  }
  fireEvent.click(screen.getAllByRole('button', { name: /^Terminal/ })[0]);
  const terminal = screen.getByLabelText('Terminal test buffer');
  fireEvent.change(terminal, { target: { value: 'keep my terminal buffer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan sidebar Warren' }));
  expect(screen.queryByRole('navigation', { name: 'Navigasi utama' })).toBeNull();
  expect(screen.getByLabelText('Terminal test buffer')).toBe(terminal);
  expect((terminal as HTMLTextAreaElement).value).toBe('keep my terminal buffer');
  const restore = screen.getByRole('button', { name: 'Tampilkan sidebar Warren' });
  expect(restore.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(restore);
  expect(screen.getByRole('navigation', { name: 'Navigasi utama' })).toBeTruthy();
  expect(screen.getByLabelText('Terminal test buffer')).toBe(terminal);
  expect(mock.disconnect).not.toHaveBeenCalled();
  expect(mock.lock).not.toHaveBeenCalled();
});

it('switches the interface language in Settings without replacing terminal state or showing preview branding', () => {
  setLanguage('en');
  mock.workspace.mockReturnValue({
    ready: true, preview: true, busy: false, error: null, saveError: null,
    state: { version: 1, deviceId: 'test', vps: [], hermes: [], conversations: [], settings: { fontSize: 14, scrollback: 5000 } },
    sessions: [], streamingIds: new Set(), toolActivity: {}, hostPrompt: null,
    closeSession: mock.disconnect, lock: mock.lock,
  });
  render(<App/>);
  fireEvent.click(screen.getAllByRole('button', { name: 'Terminal' })[0]);
  const terminal = screen.getByLabelText('Terminal test buffer');
  fireEvent.change(terminal, { target: { value: 'keep session output' } });
  expect(screen.queryByText(/Personal workspace|Mode pratinjau|Browser preview|^PREVIEW$/)).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0]);
  const english = screen.getByRole('button', {name:'English'});
  expect(english.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('group', {name:'App language'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name:'Bahasa Indonesia'}));
  expect(screen.getByRole('heading', {name:'Bahasa'})).toBeTruthy();
  expect(screen.getByRole('group', {name:'Bahasa aplikasi'})).toBeTruthy();
  expect(document.documentElement.lang).toBe('id');
  expect(localStorage.getItem('warren.language')).toBe('id');
  fireEvent.click(screen.getAllByRole('button', {name:'Terminal'})[0]);
  expect(screen.getByLabelText('Terminal test buffer')).toBe(terminal);
  expect((terminal as HTMLTextAreaElement).value).toBe('keep session output');
  expect(mock.disconnect).not.toHaveBeenCalled();
  expect(mock.lock).not.toHaveBeenCalled();
});

it('retains the Agent composer and terminal through navigation links, both menus, and a language change', () => {
  setLanguage('en');
  const openConversation = vi.fn();
  mock.workspace.mockReturnValue({
    ready: true, preview: true, busy: false, error: null, saveError: null,
    state: { version: 1, deviceId: 'test', vps: [], hermes: [{ id: 'agent', name: 'Leveret', url: 'https://example.com/v1', model: 'hermes', token: 'test' }],
      conversations: [{ id: 'chat', profileId: 'agent', title: 'Current chat', draft: 'Keep this draft', messages: [], createdAt: 1 }],
      settings: { fontSize: 14, scrollback: 5000 } },
    sessions: [], activeConversationId: 'chat', streamingIds: new Set(), toolActivity: {}, hostPrompt: null,
    closeSession: mock.disconnect, lock: mock.lock, openConversation, setDraft: vi.fn(),
  });
  render(<App/>);
  fireEvent.click(screen.getAllByRole('button', { name: 'Terminal' })[0]);
  const terminal = screen.getByLabelText('Terminal test buffer');
  const page = screen.getByRole('main');
  fireEvent.change(terminal, { target: { value: 'Retained server output' } });
  fireEvent.click(screen.getByRole('button', { name: 'Open Agent' }));
  const composer = screen.getByRole('textbox', { name: 'Message Agent' }) as HTMLTextAreaElement;
  composer.setSelectionRange(4, 9);
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name: /^Connections/ }));
  expect(composer.isConnected).toBe(true);
  expect(composer.closest('[inert]')).not.toBeNull();
  expect(screen.queryByRole('textbox', { name: 'Message Agent' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open chat' }));
  expect(openConversation).toHaveBeenCalledWith('agent');
  expect(screen.getByRole('textbox', { name: 'Message Agent' })).toBe(composer);
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Mobile navigation' })).getByRole('button', { name: 'Settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Bahasa Indonesia' }));
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Navigasi utama' })).getByRole('button', { name: 'Agent' }));
  expect(screen.getByRole('textbox', { name: 'Pesan untuk Agent' })).toBe(composer);
  expect(composer.value).toBe('Keep this draft');
  expect([composer.selectionStart, composer.selectionEnd]).toEqual([4, 9]);
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Navigasi seluler' })).getByRole('button', { name: 'Terminal' }));
  expect(screen.getByLabelText('Terminal test buffer')).toBe(terminal);
  expect((terminal as HTMLTextAreaElement).value).toBe('Retained server output');
  expect(screen.getByRole('main')).toBe(page);
  expect(mock.disconnect).not.toHaveBeenCalled();
  expect(mock.lock).not.toHaveBeenCalled();
});
