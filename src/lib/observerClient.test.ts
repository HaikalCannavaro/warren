import { beforeEach, expect, it, vi } from 'vitest';
import { readObserver } from './native';
const mock = vi.hoisted(() => ({ invoke: vi.fn(), channels: [] as {onmessage: (event: unknown)=>void}[] }));
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>true,invoke:mock.invoke,Channel:class {onmessage=(_event:unknown)=>{};constructor(){mock.channels.push(this);}}}));
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:vi.fn()}));
beforeEach(()=>{mock.channels.length=0;mock.invoke.mockReset().mockResolvedValue(undefined);});
it('receives data only for the requested Observer category', async()=>{
  const promise=readObserver('ssh-linux','fleet');
  mock.channels[0].onmessage({type:'result',result:{kind:'fleet',data:'[]'}});
  await expect(promise).resolves.toEqual({kind:'fleet',data:'[]'});
  const mismatched=readObserver('ssh-linux','tasks');
  mock.channels[1].onmessage({type:'result',result:{kind:'fleet',data:'[]'}});
  await expect(mismatched).rejects.toThrow(/different request type/);
});
it('cancels both before and after start admission when abort races the native command',async()=>{
  let admit!:()=>void;
  mock.invoke.mockImplementation((command:string)=>command==='ssh_observer_start'?new Promise<void>(resolve=>{admit=resolve;}):Promise.resolve());
  const controller=new AbortController();const promise=readObserver('ssh-linux','hardware',controller.signal);
  controller.abort();await expect(promise).rejects.toMatchObject({name:'AbortError'});
  admit();await Promise.resolve();await Promise.resolve();
  expect(mock.invoke.mock.calls.filter(call=>call[0]==='ssh_observer_cancel')).toHaveLength(2);
});
it('forwards the archive option only to task ledger requests',async()=>{
  const tasks=readObserver('ssh-host','tasks',undefined,true);
  expect(mock.invoke).toHaveBeenLastCalledWith('ssh_observer_start',expect.objectContaining({kind:'tasks',includeArchived:true}));
  mock.channels[0].onmessage({type:'result',result:{kind:'tasks',data:'[]'}});await tasks;
  const hardware=readObserver('ssh-host','hardware',undefined,true);
  expect(mock.invoke).toHaveBeenLastCalledWith('ssh_observer_start',expect.objectContaining({kind:'hardware',includeArchived:false}));
  mock.channels[1].onmessage({type:'result',result:{kind:'hardware',linux:null,gpu:'1, 1, 10, 30',warning:null}});await hardware;
});
