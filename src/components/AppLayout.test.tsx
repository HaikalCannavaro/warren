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

it('keeps legacy Agent data private and out of navigation while retaining the terminal through remaining menus', () => {
  setLanguage('en');
  const legacy = { id: 'legacy-agent', name: 'Private old Agent', url: 'https://agent.example/v1', model: 'model', token: 'private-agent-token' };
  const state = { version: 1, deviceId: 'test', vps: [{ id: 'server', name: 'My VPS', host: 'server.example', port: 22, username: 'ops', auth: 'password', password: '', privateKey: '', passphrase: '' }], hermes: [legacy],
    conversations: [{ id: 'old-chat', profileId: legacy.id, title: 'Private old chat', draft: 'Retained draft', messages: [], createdAt: 1 }], settings: { fontSize: 14, scrollback: 5000 } };
  const before = JSON.stringify(state);
  const openConversation = vi.fn();
  mock.workspace.mockReturnValue({ ready: true, preview: true, busy: false, error: null, saveError: null, state,
    sessions: [], streamingIds: new Set(['old-chat']), commandBusyIds: new Set(['old-chat']), commandsLoadingIds: new Set(['old-chat']), toolActivity: {}, hostPrompt: null,
    notificationTarget: { conversationId: 'old-chat', receivedAt: 1 }, closeSession: mock.disconnect, lock: mock.lock, openConversation });
  render(<App/>);
  expect(screen.getByRole('heading', {name:/^Observer\s*\.$/})).toBeTruthy();
  for (const name of ['Main navigation', 'Mobile navigation']) {
    const nav = screen.getByRole('navigation',{name});
    expect(within(nav).queryByRole('button',{name:'Agent'})).toBeNull();
    expect(within(nav).getByRole('button',{name:'Scheduler'})).toBeTruthy();
    expect(within(nav).getAllByRole('button')).toHaveLength(5);
    expect(within(nav).queryByRole('button',{name:'Settings'})).toBeNull();
  }
  fireEvent.click(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('button',{name:'Terminal'}));
  const terminal=screen.getByLabelText('Terminal test buffer');fireEvent.change(terminal,{target:{value:'Retained server output'}});
  expect(screen.queryByRole('button',{name:'Open Agent'})).toBeNull();
  fireEvent.click(within(screen.getByRole('navigation',{name:'Main navigation'})).getByRole('button',{name:/^Connections/}));
  expect(screen.getByRole('heading',{name:'VPS & SSH'})).toBeTruthy();
  expect(screen.queryByText(legacy.name)).toBeNull();expect(screen.queryByText('private-agent-token')).toBeNull();
  expect(screen.queryByRole('button',{name:'Open chat'})).toBeNull();expect(screen.queryByRole('button',{name:'Connect Agent'})).toBeNull();
  fireEvent.click(screen.getAllByRole('button',{name:'Settings'})[0]);
  fireEvent.click(screen.getByRole('button',{name:'Bahasa Indonesia'}));
  fireEvent.click(within(screen.getByRole('navigation',{name:'Navigasi seluler'})).getByRole('button',{name:'Terminal'}));
  expect(screen.getByLabelText('Terminal test buffer')).toBe(terminal);expect((terminal as HTMLTextAreaElement).value).toBe('Retained server output');
  expect(openConversation).not.toHaveBeenCalled();expect(JSON.stringify(state)).toBe(before);
  expect(mock.disconnect).not.toHaveBeenCalled();expect(mock.lock).not.toHaveBeenCalled();
});

it('keeps gear Settings controls outside both main menus and marks them active', () => {
  setLanguage('en');
  mock.workspace.mockReturnValue({ready:true,preview:true,busy:false,error:null,saveError:null,
    state:{version:1,deviceId:'test',vps:[],hermes:[],conversations:[],settings:{fontSize:14,scrollback:5000}},
    sessions:[],streamingIds:new Set(),toolActivity:{},hostPrompt:null});
  render(<App/>);
  const settings = screen.getAllByRole('button',{name:'Settings'});
  expect(settings).toHaveLength(2);
  for (const control of settings) {
    expect(control.closest('nav')).toBeNull();
    expect(control.querySelector('.lucide-settings')).toBeTruthy();
  }
  fireEvent.click(settings[1]);
  expect(screen.getByRole('heading',{name:/^Settings\s*\.$/})).toBeTruthy();
  expect(settings.every(control=>control.getAttribute('aria-current')==='page')).toBe(true);
  for (const name of ['Main navigation','Mobile navigation']) {
    expect(within(screen.getByRole('navigation',{name})).queryByRole('button',{current:'page'})).toBeNull();
  }
});
