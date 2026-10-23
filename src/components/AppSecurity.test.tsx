// @vitest-environment jsdom
import { setLanguage } from '../lib/i18n';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../App';
import type { useWorkspace } from '../hooks/useWorkspace';

const hook = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useWorkspace', () => ({ useWorkspace: hook }));
vi.mock('./TerminalWorkspace', () => ({ TerminalWorkspace: () => <div/> }));
beforeEach(() => setLanguage('id'));

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

  it('offers fingerprint enrollment checkbox on first password unlock when biometric sensor is enrolled', () => {
    const unlock = vi.fn().mockResolvedValue(undefined);
    const workspace = {
      ready: false, preview: false, busy: false, error: null, saveError: null,
      biometric: { available: true, enrolled: true, enabled: false },
      autoPromptBiometric: true,
      state: { version: 1, deviceId: 'device-1', vps: [], hermes: [], conversations: [], settings: { fontSize: 14, scrollback: 5000 } },
      sessions: [], activeSessionId: null, activeConversationId: null, hostPrompt: null,
      streamingIds: new Set(), toolActivity: {}, unlock, unlockBiometric: vi.fn(),
      lock: vi.fn(), clearError: vi.fn(), saveVps: vi.fn(), saveHermes: vi.fn(),
    } as unknown as ReturnType<typeof useWorkspace>;
    hook.mockImplementation(() => workspace);
    render(<App/>);
    const checkbox = screen.getByRole('checkbox', { name: /Aktifkan buka kunci sidik jari/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.change(screen.getByLabelText('Master password'), { target: { value: 'super-secret-master-pass' } });
    fireEvent.click(screen.getByRole('button', { name: /Buka ruang kerja/i }));
    expect(unlock).toHaveBeenCalledWith('super-secret-master-pass', { enableBiometric: true });
  });

  it('auto-prompts fingerprint unlock on cold start and lets user tap fingerprint button or disable in Settings', () => {
    const unlockBiometric = vi.fn().mockResolvedValue(undefined);
    const disableBiometric = vi.fn().mockResolvedValue(undefined);
    const workspace = {
      ready: false, preview: false, busy: false, error: null, saveError: null,
      biometric: { available: true, enrolled: true, enabled: true },
      autoPromptBiometric: true,
      state: { version: 1, deviceId: 'device-1', vps: [], hermes: [], conversations: [], settings: { fontSize: 14, scrollback: 5000 } },
      sessions: [], activeSessionId: null, activeConversationId: null, hostPrompt: null,
      streamingIds: new Set(), toolActivity: {}, unlock: vi.fn(), unlockBiometric, disableBiometric,
      lock: vi.fn(), clearError: vi.fn(), saveVps: vi.fn(), saveHermes: vi.fn(),
    } as unknown as ReturnType<typeof useWorkspace>;
    hook.mockImplementation(() => workspace);
    const view = render(<App/>);
    expect(unlockBiometric).toHaveBeenCalledTimes(1);
    const bioBtn = screen.getByRole('button', { name: /Buka dengan sidik jari/i });
    fireEvent.click(bioBtn);
    expect(unlockBiometric).toHaveBeenCalledTimes(2);

    workspace.ready = true;
    view.rerender(<App/>);
    fireEvent.click(screen.getAllByRole('button', { name: 'Pengaturan' })[0]);
    const disableBtn = screen.getByRole('button', { name: /Nonaktifkan sidik jari/i });
    fireEvent.click(disableBtn);
    expect(disableBiometric).toHaveBeenCalledOnce();
  });
});
