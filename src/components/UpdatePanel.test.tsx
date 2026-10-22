// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdatePanel } from './UpdatePanel';
import type { AppUpdater } from '../hooks/useAppUpdater';

afterEach(cleanup);
function updater(overrides: Partial<AppUpdater> = {}): AppUpdater {
  return { phase: 'idle', info: { platform: 'android', configured: true, currentVersion: '0.2.0', message: '' }, release: null, currentVersion: '0.2.0', preview: false, busy: false, operation: null, downloaded: false, progress: null, error: null, errorStage: null, check: vi.fn(async () => {}), download: vi.fn(async () => {}), install: vi.fn(async () => {}), ...overrides };
}
describe('update settings panel', () => {
  it('labels unavailable browser updates honestly and disables checking', () => {
    render(<UpdatePanel updater={updater({ preview: true, phase: 'unconfigured', info: null })}/>);
    expect(screen.getByText(/pratinjau browser/i)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Cek pembaruan' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText('Versi ini yang terbaru')).toBeNull();
  });
  it('renders notes as plaintext and blocks installation while sessions are running', () => {
    const state = updater({ phase: 'ready', downloaded: true, release: { version: '0.3.0', notes: '<script>bad()</script>\n[release](https://example.com)' } });
    render(<UpdatePanel updater={state} blockingReason="Tutup sesi SSH sebelum memasang update."/>);
    expect(screen.getByText(/<script>bad\(\)<\/script>/)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    const button = screen.getByRole('button', { name: 'Pasang update' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(state.install).not.toHaveBeenCalled();
    expect(screen.getByText('Tutup sesi SSH sebelum memasang update.')).toBeTruthy();
  });
  it('offers installation retry after Android permission without a download button', () => {
    const state = updater({ phase: 'permissionRequired', downloaded: true, release: { version: '0.3.0', notes: '' } });
    render(<UpdatePanel updater={state}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Pasang update' }));
    expect(state.install).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Unduh update' })).toBeNull();
  });
});
