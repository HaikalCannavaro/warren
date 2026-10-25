import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useObserver } from './useObserver';
import type { ObserverReadKind, ObserverResponse } from '../lib/native';
const mock=vi.hoisted(()=>({read:vi.fn()}));
vi.mock('../lib/native',()=>({readObserver:mock.read}));
const hardware:ObserverResponse={kind:'hardware',linux:null,gpu:'40, 1024, 8192, 50',warning:null};
beforeEach(()=>{mock.read.mockReset().mockImplementation(async(_id:string,kind:ObserverReadKind)=>kind==='hardware'?hardware:{kind,data:'[]'});});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('cancels old hardware reads on host changes and leaves the orchestrator source untouched',async()=>{
  let oldResolve!:(value:ObserverResponse)=>void;let oldSignal!:AbortSignal;
  mock.read.mockImplementation((id:string,kind:ObserverReadKind,signal:AbortSignal)=>{
    if(id==='old'&&kind==='hardware'){oldSignal=signal;return new Promise<ObserverResponse>(resolve=>{oldResolve=resolve;});}
    return Promise.resolve(kind==='hardware'?hardware:{kind,data:'[]'});
  });
  const {result,rerender}=renderHook(({host})=>useObserver(host,'orchestrator'),{initialProps:{host:'old'}});
  rerender({host:'new'});
  await waitFor(()=>expect(result.current.hardware.data?.gpus[0].utilization).toBe(40));
  expect(oldSignal.aborted).toBe(true);
  await act(async()=>{oldResolve({kind:'hardware',linux:null,gpu:'99, 8192, 8192, 90',warning:null});});
  expect(result.current.hardware.data?.gpus[0].utilization).toBe(40);
  expect(mock.read.mock.calls.filter(call=>call[1]==='fleet')).toHaveLength(1);
  expect(mock.read.mock.calls.filter(call=>call[1]==='tasks')).toHaveLength(1);
});
it('preserves a successful reading when a later poll fails rather than replacing it with idle data',async()=>{
  const {result}=renderHook(()=>useObserver('host','orchestrator'));
  await waitFor(()=>expect(result.current.fleet.data).toEqual([]));
  mock.read.mockImplementation(async(_id:string,kind:ObserverReadKind)=>kind==='fleet'?{kind,data:'broken'}:kind==='hardware'?hardware:{kind,data:'[]'});
  act(()=>result.current.refresh());
  await waitFor(()=>expect(result.current.fleet.error).toContain('JSON'));
  expect(result.current.fleet.data).toEqual([]);expect(result.current.fleet.updatedAt).not.toBeNull();
});
it('polls at ten seconds, skips overlapping reads and stops all work on unmount',async()=>{
  vi.useFakeTimers();const signals:AbortSignal[]=[];
  mock.read.mockImplementation((_id:string,_kind:ObserverReadKind,signal:AbortSignal)=>{signals.push(signal);return new Promise(()=>{});});
  const {result,unmount}=renderHook(()=>useObserver('host','orchestrator'));
  act(()=>result.current.setAutoPoll(true));
  const afterToggle=mock.read.mock.calls.length;
  act(()=>vi.advanceTimersByTime(30000));expect(mock.read).toHaveBeenCalledTimes(afterToggle);
  unmount();expect(signals.every(signal=>signal.aborted)).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
