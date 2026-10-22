// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { useWorkspace } from '../hooks/useWorkspace';

const workspaceHook = vi.hoisted(() => vi.fn());
const updates = vi.hoisted(() => ({ getUpdateInfo: vi.fn(), checkForUpdate: vi.fn(), downloadUpdate: vi.fn(), installUpdate: vi.fn() }));
vi.mock('../hooks/useWorkspace', () => ({ useWorkspace: workspaceHook }));
vi.mock('../lib/updates', () => updates);
vi.mock('./TerminalWorkspace', () => ({ TerminalWorkspace: () => <div/> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('updater workspace lifetime', () => {
  it('keeps the download and verified package when navigating away from Settings', async () => {
    workspaceHook.mockReturnValue({ ready: true, preview: false, busy: false, error: null, saveError: null, state: { version: 1, deviceId: 'device', vps: [], hermes: [], conversations: [], settings: { fontSize: 14, scrollback: 5000 } }, sessions: [], activeSessionId: null, activeConversationId: null, hostPrompt: null, streamingIds: new Set(), toolActivity: {}, unlock: vi.fn(), lock: vi.fn(), clearError: vi.fn(), runUpdateInstallation: vi.fn() } as unknown as ReturnType<typeof useWorkspace>);
    updates.getUpdateInfo.mockResolvedValue({ platform: 'android', configured: true, currentVersion: '0.2.0', message: '' });
    updates.checkForUpdate.mockResolvedValue({ version: '0.3.0', notes: 'Update notes' });
    let finishDownload!: () => void;
    updates.downloadUpdate.mockImplementation(() => new Promise<void>((resolve) => { finishDownload = resolve; }));
    render(<App/>);
    fireEvent.click(screen.getAllByRole('button', { name: 'Pengaturan' })[0]);
    await waitFor(() => expect((screen.getByRole('button', { name: 'Cek pembaruan' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Cek pembaruan' }));
    await screen.findByRole('button', { name: 'Unduh update' });
    fireEvent.click(screen.getByRole('button', { name: 'Unduh update' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Terminal' })[0]);
    expect(screen.queryByLabelText('Progres unduhan pembaruan')).toBeNull();
    await act(async () => finishDownload());
    fireEvent.click(screen.getAllByRole('button', { name: 'Pengaturan' })[0]);
    expect(screen.getByText('Unduhan siap dipasang')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pasang update' })).toBeTruthy();
    expect(updates.downloadUpdate).toHaveBeenCalledOnce();
    expect(updates.getUpdateInfo).toHaveBeenCalledOnce();
  });
});
