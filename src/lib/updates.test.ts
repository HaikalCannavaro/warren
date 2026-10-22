import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUpdateInfo, checkForUpdate, downloadUpdate, installUpdate } from './updates';

const native = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn(), channels: [] as { onmessage?: (event: unknown) => void }[] }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, isTauri: native.isTauri, Channel: class { constructor() { native.channels.push(this); } } }));
beforeEach(() => { vi.clearAllMocks(); native.channels.length = 0; native.isTauri.mockReturnValue(true); native.invoke.mockResolvedValue(undefined); });

describe('native update adapter', () => {
  it('uses the specified commands and forwards download progress through a Channel', async () => {
    await getUpdateInfo(); await checkForUpdate();
    const progress = vi.fn(); await downloadUpdate(progress);
    const event = { event: 'progress', downloaded: 10, total: 20 };
    native.channels[0].onmessage?.(event);
    await installUpdate();
    expect(native.invoke).toHaveBeenNthCalledWith(1, 'get_update_info');
    expect(native.invoke).toHaveBeenNthCalledWith(2, 'check_for_update');
    expect(native.invoke).toHaveBeenNthCalledWith(3, 'download_update', { onEvent: native.channels[0] });
    expect(native.invoke).toHaveBeenNthCalledWith(4, 'install_update');
    expect(progress).toHaveBeenCalledWith(event);
  });
  it('rejects browser calls without invoking native update operations', async () => {
    native.isTauri.mockReturnValue(false);
    await expect(checkForUpdate()).rejects.toThrow('aplikasi native');
    expect(native.invoke).not.toHaveBeenCalled();
  });
});
