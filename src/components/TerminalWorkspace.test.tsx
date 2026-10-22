// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TerminalWorkspace } from './TerminalWorkspace';
import { setLanguage } from '../lib/i18n';

const terminals = vi.hoisted(() => [] as { write: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[]);
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  options = {}; cols = 80; rows = 24;
  write = vi.fn(); dispose = vi.fn(); focus = vi.fn();
  onDataCallback: (text: string) => void = () => {};
  constructor() { terminals.push(this); }
  loadAddon() {}
  open(element: HTMLElement) { const field = document.createElement('textarea'); field.setAttribute('aria-label', 'xterm input'); field.addEventListener('paste', (event) => this.onDataCallback(event.clipboardData?.getData('text/plain') ?? '')); element.appendChild(field); }
  onData(callback: (text: string) => void) { this.onDataCallback = callback; return { dispose: vi.fn() }; }
  onResize() { return { dispose: vi.fn() }; }
} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));

beforeEach(() => {
  setLanguage('id');
  terminals.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function setup(visible = true) {
  const writeTerminal = vi.fn(async () => {});
  const callbacks: ((bytes: Uint8Array) => void)[] = [];
  const unsubscribe = vi.fn();
  const props = {
    sessions: [{ id: 'session-1', profileId: 'server-1', label: 'My server', host: 'user@server:22', status: 'connected' as const }],
    activeSessionId: 'session-1', profiles: [], settings: { fontSize: 14, scrollback: 5000 }, preview: false, visible,
    onAdd: vi.fn(), onConnect: vi.fn(), onSelect: vi.fn(), onClose: vi.fn(),
    subscribeTerminal: vi.fn((_id: string, callback: (bytes: Uint8Array) => void) => { callbacks.push(callback); return unsubscribe; }),
    writeTerminal, resizeTerminal: vi.fn(async () => {}),
  };
  const view = render(<TerminalWorkspace {...props}/>);
  return { props, view, writeTerminal, callbacks, unsubscribe };
}

function pasteIntoTerminal(text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  fireEvent(screen.getByLabelText('xterm input'), event);
  return event;
}

describe('terminal paste safety and lifetime', () => {
  it('switches terminal controls and paste review without recreating the terminal or changing its text', () => {
    setLanguage('en');
    const { writeTerminal, callbacks, unsubscribe } = setup();
    expect(screen.getByText('Connected')).toBeTruthy();
    const bytes = new Uint8Array([104, 105]);
    callbacks[0](bytes);
    pasteIntoTerminal('echo Halo');
    expect(screen.getByRole('dialog', { name: 'Review before pasting' })).toBeTruthy();
    act(() => setLanguage('id'));
    expect(screen.getByRole('dialog', { name: 'Tinjau sebelum paste' })).toBeTruthy();
    expect(terminals).toHaveLength(1);
    expect(terminals[0].write).toHaveBeenCalledWith(bytes);
    expect(terminals[0].dispose).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Tempel ke terminal' }));
    expect(writeTerminal).toHaveBeenCalledExactlyOnceWith('session-1', 'echo Halo');
  });
  it('intercepts even a single-line paste before xterm receives bytes', () => {
    const { writeTerminal } = setup();
    const event = pasteIntoTerminal('echo hello');
    expect(event.defaultPrevented).toBe(true);
    expect(writeTerminal).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Tinjau sebelum paste' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tempel ke terminal' }));
    expect(writeTerminal).toHaveBeenCalledExactlyOnceWith('session-1', 'echo hello');
  });

  it('sends sanitized multiline text only after confirmation', () => {
    const { writeTerminal } = setup();
    pasteIntoTerminal('echo first\r\necho \x1bsecond\x00\tline');
    expect(writeTerminal).not.toHaveBeenCalled();
    expect(screen.getByText(/dapat langsung menjalankan perintah/)).toBeTruthy();
    expect(screen.getByText(/⟦ESC⟧/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tempel ke terminal' }));
    expect(writeTerminal).toHaveBeenCalledExactlyOnceWith('session-1', 'echo first\necho second\tline');
  });

  it('cancels paste without sending any bytes', () => {
    const { writeTerminal } = setup();
    pasteIntoTerminal('rm example');
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(writeTerminal).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('preserves the same terminal and subscription while hidden, and writes bytes directly', () => {
    const { props, view, callbacks, unsubscribe } = setup();
    const output = new Uint8Array([0xf0, 0x9f, 0x98, 0x80]);
    callbacks[0](output);
    expect(terminals[0].write).toHaveBeenCalledWith(output);
    view.rerender(<TerminalWorkspace {...props} visible={false}/>);
    expect(terminals).toHaveLength(1);
    expect(terminals[0].dispose).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
    view.rerender(<TerminalWorkspace {...props} visible sessions={[]}/>);
    expect(terminals[0].dispose).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
