// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppUpdater } from './useAppUpdater';
import type { InstallResult, UpdateProgress } from '../lib/updates';
import { setLanguage } from '../lib/i18n';

const native = vi.hoisted(() => ({ getUpdateInfo: vi.fn(), checkForUpdate: vi.fn(), downloadUpdate: vi.fn(), installUpdate: vi.fn() }));
vi.mock('../lib/updates', () => native);
const release = { version: '0.3.0', notes: 'A verified release.', publishedAt: '2026-10-22T00:00:00Z' };
const runInstall = vi.fn((action: () => Promise<InstallResult>) => action());
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function setup() { const hook = renderHook(() => useAppUpdater({ preview: false, runInstall })); await waitFor(() => expect(hook.result.current.phase).toBe('idle')); return hook; }
async function prepared() { const hook = await setup(); await act(() => hook.result.current.check()); await act(() => hook.result.current.download()); return hook; }

beforeEach(() => {
  setLanguage('id');
  vi.clearAllMocks();
  native.getUpdateInfo.mockResolvedValue({ platform: 'android', configured: true, currentVersion: '0.2.0', message: '' });
  native.checkForUpdate.mockResolvedValue(release);
  native.downloadUpdate.mockResolvedValue(undefined);
  native.installUpdate.mockResolvedValue({ status: 'installerOpened' });
  runInstall.mockImplementation((action) => action());
});
afterEach(cleanup);

describe('manual updater state machine', () => {
  it('does not call native update APIs in browser preview or claim latest', async () => {
    const { result } = renderHook(() => useAppUpdater({ preview: true, runInstall }));
    await act(() => result.current.check());
    expect(result.current.phase).toBe('unconfigured');
    expect(native.getUpdateInfo).not.toHaveBeenCalled();
    expect(native.checkForUpdate).not.toHaveBeenCalled();
  });

  it('does not check an unconfigured release source or claim latest', async () => {
    native.getUpdateInfo.mockResolvedValue({ platform: 'windows', configured: false, currentVersion: '0.2.0', message: 'Repositori rilis belum dikonfigurasi.' });
    const { result } = renderHook(() => useAppUpdater({ preview: false, runInstall }));
    await waitFor(() => expect(result.current.phase).toBe('unconfigured'));
    await act(() => result.current.check());
    expect(native.checkForUpdate).not.toHaveBeenCalled();
    expect(result.current.info?.currentVersion).toBe('0.2.0');
  });

  it('only reports latest after a successful explicit check', async () => {
    native.checkForUpdate.mockResolvedValue(null);
    const { result } = await setup();
    expect(native.checkForUpdate).not.toHaveBeenCalled();
    await act(() => result.current.check());
    expect(result.current.phase).toBe('latest');
  });

  it('serializes duplicate check clicks and does not convert network errors to latest', async () => {
    const request = deferred<typeof release>(); native.checkForUpdate.mockReturnValue(request.promise);
    const { result } = await setup();
    let first!: Promise<void>;
    act(() => { first = result.current.check(); void result.current.check(); });
    expect(native.checkForUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('checking');
    await act(async () => { request.reject(new Error('Network unavailable')); await first; });
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toBe('Network unavailable');
  });

  it('does not offer installation after a download or signature verification error', async () => {
    native.downloadUpdate.mockRejectedValue(new Error('Signature verification failed'));
    const { result } = await setup();
    await act(() => result.current.check());
    await act(() => result.current.download());
    expect(result.current.phase).toBe('error');
    expect(result.current.downloaded).toBe(false);
    await act(() => result.current.install());
    expect(runInstall).not.toHaveBeenCalled();
    expect(native.installUpdate).not.toHaveBeenCalled();
  });

  it('retries Android permission without downloading the package again', async () => {
    native.installUpdate.mockResolvedValueOnce({ status: 'permissionRequired' }).mockResolvedValueOnce({ status: 'installerOpened' });
    const { result } = await prepared();
    expect(result.current.phase).toBe('ready');
    await act(() => result.current.install());
    expect(result.current.phase).toBe('permissionRequired');
    await act(() => result.current.install());
    expect(result.current.phase).toBe('installerOpened');
    expect(native.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(native.installUpdate).toHaveBeenCalledTimes(2);
    expect(runInstall).toHaveBeenCalledTimes(2);
  });

  it('serializes download/install clicks and ignores late download progress', async () => {
    const transfer = deferred<void>(); let progress!: (event: UpdateProgress) => void;
    native.downloadUpdate.mockImplementation((onProgress) => { progress = onProgress; return transfer.promise; });
    const { result } = await setup(); await act(() => result.current.check());
    let first!: Promise<void>;
    act(() => { first = result.current.download(); void result.current.download(); });
    expect(native.downloadUpdate).toHaveBeenCalledTimes(1);
    act(() => progress({ event: 'progress', downloaded: 50, total: 100 }));
    expect(result.current.progress).toEqual({ downloaded: 50, total: 100 });
    await act(async () => { transfer.resolve(); await first; });
    act(() => progress({ event: 'progress', downloaded: 999, total: 1000 }));
    expect(result.current.phase).toBe('ready');
    expect(result.current.progress).toEqual({ downloaded: 50, total: 100 });
    const installation = deferred<InstallResult>(); native.installUpdate.mockReturnValue(installation.promise);
    act(() => { first = result.current.install(); void result.current.install(); });
    expect(runInstall).toHaveBeenCalledTimes(1);
    await act(async () => { installation.resolve({ status: 'installerOpened' }); await first; });
  });

  it('surfaces installation exceptions and requires a fresh check before retrying', async () => {
    runInstall.mockRejectedValueOnce(new Error('Tutup sesi SSH sebelum memasang update.'));
    const { result } = await prepared();
    await act(() => result.current.install());
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toContain('Tutup sesi SSH');
    expect(result.current.downloaded).toBe(false);
    expect(result.current.release).toBeNull();
    expect(result.current.progress).toBeNull();
    expect(native.installUpdate).not.toHaveBeenCalled();
    await act(() => result.current.install());
    expect(native.installUpdate).not.toHaveBeenCalled();
    await act(() => result.current.check());
    await act(() => result.current.download());
    await act(() => result.current.install());
    expect(native.installUpdate).toHaveBeenCalledTimes(1);
    expect(native.downloadUpdate).toHaveBeenCalledTimes(2);
  });

  it('invalidates an installer package consumed by a failed native installation', async () => {
    native.installUpdate.mockRejectedValueOnce(new Error('Installer launch failed'));
    const { result } = await prepared();
    await act(() => result.current.install());
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toContain('Installer launch failed');
    expect(result.current.error).toContain('Cek pembaruan lagi');
    expect(result.current.downloaded).toBe(false);
    expect(result.current.release).toBeNull();
    await act(() => result.current.install());
    expect(native.installUpdate).toHaveBeenCalledTimes(1);
  });
});
