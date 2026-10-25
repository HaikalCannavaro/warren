import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MAX_BURROW_MESSAGES, useBurrow } from './useBurrow';
import type { BurrowStreamEvent } from '../lib/native';

const mock = vi.hoisted(() => ({ listen: vi.fn(), stop: vi.fn(), handlers: new Map<string, (event: BurrowStreamEvent) => void>() }));
vi.mock('../lib/native', () => ({
  listenBurrow: mock.listen, stopBurrow: mock.stop,
}));
beforeEach(() => {
  mock.handlers.clear(); mock.listen.mockReset(); mock.stop.mockReset().mockResolvedValue(undefined);
  mock.listen.mockImplementation(async (_session: string, listener: string, handler: (event: BurrowStreamEvent) => void) => { mock.handlers.set(listener, handler); });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function emit(listener: string, content: string) { mock.handlers.get(listener)!({ type: 'data', data: [...new TextEncoder().encode(content)] }); }
function record(index: number) { return JSON.stringify({ ts: 1792899720, direction: 'inbound', peer: 'forge', task_id: `task-${index}`, summary: `Message ${index}`, status: 'completed' }); }
it('starts one listener, accepts a live status and clears the view without restarting tail', async () => {
  const { result, unmount } = renderHook(() => useBurrow('ssh-1'));
  await waitFor(() => expect(mock.listen).toHaveBeenCalledTimes(1));
  const listener = mock.listen.mock.calls[0][1] as string;
  act(() => {
    mock.handlers.get(listener)!({ type: 'status', status: 'monitoring' });
    emit(listener, `${record(1)}\n${record(2)}`);
  });
  expect(result.current.status).toBe('monitoring');
  expect(result.current.messages).toHaveLength(1);
  act(() => result.current.clear());
  expect(result.current.messages).toHaveLength(0);
  act(() => emit(listener, '\n'));
  expect(result.current.messages[0].task_id).toBe('task-2');
  expect(mock.listen).toHaveBeenCalledTimes(1);
  unmount(); expect(mock.stop).toHaveBeenCalledWith(listener);
});
it('stops the old source and ignores its late events when switching VPS', async () => {
  const { result, rerender } = renderHook(({ session }) => useBurrow(session), { initialProps: { session: 'ssh-1' } });
  const first = mock.listen.mock.calls[0][1] as string;
  rerender({ session: 'ssh-2' });
  await waitFor(() => expect(mock.listen).toHaveBeenCalledTimes(2));
  const second = mock.listen.mock.calls[1][1] as string;
  act(() => { emit(first, `${record(1)}\n`); emit(second, `${record(2)}\n`); });
  expect(result.current.messages.map(item => item.task_id)).toEqual(['task-2']);
  expect(mock.stop).toHaveBeenCalledWith(first);
});
it('cleans up a listener even if unmount races its start response', async () => {
  let admitted!: () => void;
  mock.listen.mockReturnValue(new Promise<void>(resolve => { admitted = resolve; }));
  const { unmount } = renderHook(() => useBurrow('ssh-1'));
  const listener = mock.listen.mock.calls[0][1] as string;
  unmount();
  expect(mock.stop).toHaveBeenCalledWith(listener);
  await act(async () => { admitted(); });
  expect(mock.stop.mock.calls.filter(call => call[0] === listener)).toHaveLength(2);
});
it('bounds the live window and retries with a new listener', () => {
  const { result } = renderHook(() => useBurrow('ssh-1'));
  const listener = mock.listen.mock.calls[0][1] as string;
  act(() => emit(listener, Array.from({ length: MAX_BURROW_MESSAGES + 7 }, (_, index) => record(index)).join('\n') + '\n'));
  expect(result.current.messages).toHaveLength(MAX_BURROW_MESSAGES);
  expect(result.current.dropped).toBe(7);
  act(() => result.current.retry());
  expect(mock.stop).toHaveBeenCalledWith(listener);
  expect(mock.listen).toHaveBeenCalledTimes(2);
});
it('keeps offline state honest without starting a listener', () => {
  const offline = renderHook(() => useBurrow(null));
  expect(offline.result.current.status).toBe('offline');
  expect(offline.result.current.messages).toHaveLength(0);
  expect(mock.listen).not.toHaveBeenCalled();
});
it('reports listener failures and retries explicitly without inserting fictional traffic', async () => {
  mock.listen.mockRejectedValueOnce(new Error('SSH offline'));
  const { result } = renderHook(() => useBurrow('ssh-1'));
  await waitFor(() => expect(result.current.status).toBe('error'));
  expect(result.current.messages).toHaveLength(0);
  expect(result.current.error).toBe('SSH offline');
  act(() => result.current.retry());
  expect(mock.listen).toHaveBeenCalledTimes(2);
});
