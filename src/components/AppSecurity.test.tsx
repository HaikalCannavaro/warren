// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import type { useWorkspace } from '../hooks/useWorkspace';

const hook = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useWorkspace', () => ({ useWorkspace: hook }));
vi.mock('./TerminalWorkspace', () => ({ TerminalWorkspace: () => <div/> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('vault UI state', () => {
  it('clears a credential-bearing edit form when the vault locks', () => {
    const workspace = {
      ready: true, preview: false, busy: false, error: null, saveError: null,
      state: { version: 1, deviceId: 'device-1', vps: [{ id: 'vps-1', name: 'Private server', host: 'server.example', port: 22, username: 'root', auth: 'password', password: 'private-test-secret', privateKey: '', passphrase: '' }], hermes: [], conversations: [], settings: { fontSize: 14, scrollback: 5000 } },
      sessions: [], activeSessionId: null, activeConversationId: null, hostPrompt: null,
      streamingIds: new Set(), toolActivity: {}, unlock: vi.fn(), lock: vi.fn(),
      clearError: vi.fn(), saveVps: vi.fn(), saveHermes: vi.fn(),
    } as unknown as ReturnType<typeof useWorkspace>;
    hook.mockImplementation(() => workspace);
    const view = render(<App/>);
    fireEvent.click(screen.getAllByRole('button', { name: 'Koneksi' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit VPS Private server' }));
    expect((screen.getByLabelText('Password SSH') as HTMLInputElement).value).toBe('private-test-secret');
    workspace.ready = false;
    view.rerender(<App/>);
    expect(screen.queryByRole('dialog')).toBeNull();
    workspace.ready = true;
    view.rerender(<App/>);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByLabelText('Password SSH')).toBeNull();
  });
});
