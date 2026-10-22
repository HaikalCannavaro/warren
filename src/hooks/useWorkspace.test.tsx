import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspace } from './useWorkspace';
import { emptyState } from '../lib/domain';
import type { HermesEvent, HermesRequest, SavedState, SshEvent, SshRequest, VpsProfile } from '../types';

const f=vi.hoisted(()=>({
  state:undefined as SavedState|undefined,
  write:vi.fn(),close:vi.fn(),open:vi.fn(),probe:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),stream:vi.fn(),
  writeSsh:vi.fn(),resizeSsh:vi.fn(),onDesktopClose:vi.fn(),destroyWindow:vi.fn(),unlisten:vi.fn(),
  closeHandler:undefined as (()=>Promise<void>)|undefined,
}));
vi.mock('../lib/vault',()=>({WorkspaceVault:{open:f.open}}));
vi.mock('../lib/native',()=>({
  nativeAvailable:()=>true,probeSsh:f.probe,connectSsh:f.connect,disconnectSsh:f.disconnect,
  writeSsh:f.writeSsh,resizeSsh:f.resizeSsh,streamHermes:f.stream,probeHermes:vi.fn(),
  onDesktopClose:f.onDesktopClose,destroyWindow:f.destroyWindow,
}));
const profile:VpsProfile={id:'vps-1',name:'My VPS',host:'example.test',port:22,username:'deploy',auth:'password',password:'secret',privateKey:'',passphrase:''};
beforeEach(()=>{
  vi.resetAllMocks(); f.state=emptyState(); f.state.vps=[{...profile}];
  f.state.hermes=[{id:'hermes-1',name:'Hermes',url:'https://hermes.example/v1',token:'token',model:'hermes-agent'}];
  f.write.mockResolvedValue(undefined);f.close.mockResolvedValue(undefined);f.disconnect.mockResolvedValue(undefined);
  f.closeHandler=undefined;
  f.onDesktopClose.mockImplementation(async(handler:()=>Promise<void>)=>{f.closeHandler=handler;return f.unlisten;});
  f.destroyWindow.mockResolvedValue(undefined);f.writeSsh.mockResolvedValue(undefined);f.resizeSsh.mockResolvedValue(undefined);
  f.open.mockImplementation(async()=>({vault:{write:f.write,close:f.close},state:f.state}));
  f.probe.mockResolvedValue('SHA256:verified');
  f.connect.mockImplementation(async(_request:SshRequest,onEvent:(e:SshEvent)=>void)=>{onEvent({type:'status',status:'connected'});});
  f.stream.mockImplementation(async(_request:HermesRequest,onEvent:(e:HermesEvent)=>void)=>{onEvent({type:'delta',text:'Jawaban'});onEvent({type:'done',finishReason:'stop'});});
});
afterEach(()=>cleanup());
async function opened(){const h=renderHook(()=>useWorkspace());await act(async()=>{await h.result.current.unlock('a long password');});return h;}
function deferred(){let resolve!:()=>void;let reject!:(reason:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

describe('SSH and chat isolation',()=>{
  it('never authenticates a new host before explicit fingerprint trust',async()=>{
    const h=await opened();
    await act(async()=>{await h.result.current.connectVps('vps-1');});
    expect(f.connect).not.toHaveBeenCalled();expect(h.result.current.hostPrompt?.fingerprint).toBe('SHA256:verified');
    await act(async()=>{await h.result.current.acceptHost();});
    expect(f.connect.mock.calls[0][0].fingerprint).toBe('SHA256:verified');
    expect(h.result.current.sessions[0].status).toBe('connected');
    act(()=>{h.result.current.createConversation('hermes-1');});
    expect(h.result.current.sessions[0].status).toBe('connected');
    expect(f.disconnect).not.toHaveBeenCalled();
  });
  it('invalidates prior trust when a server address changes',async()=>{
    f.state!.vps[0].fingerprint='SHA256:old';const h=await opened();
    act(()=>h.result.current.saveVps({...profile,host:'another.test'}));
    expect(h.result.current.state.vps[0].fingerprint).toBeUndefined();
  });
  it('rejecting a discovered host does not save trust or connect',async()=>{
    const h=await opened();await act(async()=>{await h.result.current.connectVps('vps-1');});
    act(()=>h.result.current.rejectHost());
    expect(h.result.current.state.vps[0].fingerprint).toBeUndefined();expect(f.connect).not.toHaveBeenCalled();
  });
});

describe('workspace transitions and recoverable terminal errors',()=>{
  it('blocks new work and mutations synchronously while locking',async()=>{
    f.state!.vps[0].fingerprint='SHA256:verified';
    const h=await opened();let id='';
    act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Do work');});
    const saving=deferred();f.write.mockReturnValueOnce(saving.promise);let locking!:Promise<void>;
    act(()=>{
      locking=h.result.current.lock();
      h.result.current.saveVps({...profile,name:'Must not be saved'});
      h.result.current.setDraft(id,'Must not replace draft');
      h.result.current.createConversation('hermes-1');
    });
    await act(async()=>{await h.result.current.sendMessage(id);await h.result.current.connectVps('vps-1');});
    expect(h.result.current.state.vps[0].name).toBe('My VPS');
    expect(h.result.current.state.conversations).toHaveLength(1);
    expect(h.result.current.state.conversations[0].draft).toBe('Do work');
    expect(f.stream).not.toHaveBeenCalled();expect(f.connect).not.toHaveBeenCalled();
    await act(async()=>{saving.resolve();await locking;});
    expect(h.result.current.ready).toBe(false);expect(f.close).toHaveBeenCalledOnce();
  });

  it('keeps the workspace usable after a failed lock save',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});
    f.write.mockRejectedValueOnce(new Error('disk full'));
    await act(async()=>{await h.result.current.lock();});
    expect(h.result.current.ready).toBe(true);expect(h.result.current.busy).toBe(false);
    expect(f.close).not.toHaveBeenCalled();expect(h.result.current.error).toBeTruthy();
    act(()=>h.result.current.setDraft(id,'still editable'));
    expect(h.result.current.state.conversations[0].draft).toBe('still editable');
  });

  it('does not revive an old host probe after the vault locks',async()=>{
    const h=await opened();const probe=deferred();
    f.probe.mockImplementationOnce(async()=>{await probe.promise;return 'SHA256:verified';});
    let connecting!:Promise<void>;act(()=>{connecting=h.result.current.connectVps('vps-1');});
    await act(async()=>{await h.result.current.lock();});
    await act(async()=>{probe.resolve();await connecting;});
    expect(h.result.current.hostPrompt).toBeNull();expect(f.connect).not.toHaveBeenCalled();
  });

  it('keeps a connected terminal usable when a write or resize is rejected',async()=>{
    f.state!.vps[0].fingerprint='SHA256:verified';
    const h=await opened();await act(async()=>{await h.result.current.connectVps('vps-1');});
    const id=h.result.current.sessions[0].id;
    f.writeSsh.mockRejectedValueOnce(new Error('Terminal input exceeds 64 KiB.'));
    await act(async()=>{await h.result.current.writeTerminal(id,'large paste');});
    expect(h.result.current.sessions[0]).toMatchObject({status:'connected',error:'Terminal input exceeds 64 KiB.'});
    await act(async()=>{await h.result.current.writeTerminal(id,'\x03');});
    expect(f.writeSsh).toHaveBeenLastCalledWith(id,'\x03');
    f.resizeSsh.mockRejectedValueOnce(new Error('Terminal input queue is full.'));
    await act(async()=>{await h.result.current.resizeTerminal(id,100,30);});
    expect(h.result.current.sessions[0]).toMatchObject({status:'connected',error:'Terminal input queue is full.'});
    act(()=>{const handler=f.connect.mock.calls[0][1] as (event:SshEvent)=>void;handler({type:'status',status:'disconnected'});});
    expect(h.result.current.sessions[0].status).toBe('disconnected');
  });
});

describe('desktop close durability',()=>{
  it('persists unfinished chats as unknown before closing and ignores late events',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Start work');});
    const stream=deferred();let onEvent!:(event:HermesEvent)=>void;
    f.stream.mockImplementation((_request:HermesRequest,handler:(event:HermesEvent)=>void)=>{onEvent=handler;return stream.promise;});
    let sending!:Promise<void>;await act(async()=>{sending=h.result.current.sendMessage(id);});
    act(()=>onEvent({type:'delta',text:'partial'}));
    const saving=deferred();f.write.mockReturnValueOnce(saving.promise);let closing!:Promise<void>;
    act(()=>{closing=f.closeHandler!();});
    const saved=f.write.mock.calls.at(-1)![0] as SavedState;
    expect(saved.conversations[0].messages.at(-1)).toMatchObject({status:'unknown',content:'partial'});
    expect(f.destroyWindow).not.toHaveBeenCalled();
    act(()=>{onEvent({type:'delta',text:' discarded'});onEvent({type:'done',finishReason:'stop'});h.result.current.setDraft(id,'blocked');});
    expect(h.result.current.state.conversations[0].messages.at(-1)).toMatchObject({status:'unknown',content:'partial'});
    expect(h.result.current.state.conversations[0].draft).toBe('');
    const saves=f.write.mock.calls.length;
    await act(async()=>{saving.resolve();await closing;stream.resolve();await sending;});
    expect(f.destroyWindow).toHaveBeenCalledOnce();expect(f.write).toHaveBeenCalledTimes(saves);
  });

  it('keeps the window open and restores editing if the close save fails',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});
    f.write.mockRejectedValueOnce(new Error('disk full'));
    await act(async()=>{await f.closeHandler!();});
    expect(f.destroyWindow).not.toHaveBeenCalled();expect(h.result.current.ready).toBe(true);
    expect(h.result.current.busy).toBe(false);expect(h.result.current.saveError).toBeTruthy();
    act(()=>h.result.current.setDraft(id,'saved after recovery'));
    expect(h.result.current.state.conversations[0].draft).toBe('saved after recovery');
  });

  it('does not dispatch a chat whose initial save finishes after close starts',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Do not send after closing');});
    const saving=deferred();f.write.mockReturnValueOnce(saving.promise);let sending!:Promise<void>;
    act(()=>{sending=h.result.current.sendMessage(id);});
    await act(async()=>{await f.closeHandler!();saving.resolve();await sending;});
    expect(f.stream).not.toHaveBeenCalled();
    expect(h.result.current.state.conversations[0].messages.at(-1)!.status).toBe('unknown');
  });

  it('unregisters the native close listener on unmount',async()=>{
    const h=await opened();h.unmount();expect(f.unlisten).toHaveBeenCalledOnce();
  });
});

describe('update installation durability',()=>{
  it('saves and freezes all new work before invoking the installer',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'preserve this draft');});
    const saving=deferred();f.write.mockReturnValueOnce(saving.promise);
    const install=vi.fn().mockResolvedValue({status:'installerOpened'});let updating!:Promise<unknown>;
    act(()=>{updating=h.result.current.runUpdateInstallation(install);h.result.current.setDraft(id,'must not overwrite');});
    await act(async()=>{await h.result.current.connectVps('vps-1');await h.result.current.sendMessage(id);await f.closeHandler!();});
    expect(install).not.toHaveBeenCalled();expect(f.probe).not.toHaveBeenCalled();expect(f.stream).not.toHaveBeenCalled();expect(f.destroyWindow).not.toHaveBeenCalled();
    expect(h.result.current.state.conversations[0].draft).toBe('preserve this draft');
    await act(async()=>{saving.resolve();await updating;});
    expect(install).toHaveBeenCalledOnce();expect(h.result.current.busy).toBe(false);
    act(()=>h.result.current.setDraft(id,'editable after Android returns'));
    expect(h.result.current.state.conversations[0].draft).toBe('editable after Android returns');
  });
  it('refuses installation while SSH is connected or connecting',async()=>{
    f.state!.vps[0].fingerprint='SHA256:verified';const h=await opened();
    await act(async()=>{await h.result.current.connectVps('vps-1');});
    const install=vi.fn();await act(async()=>{await expect(h.result.current.runUpdateInstallation(install)).rejects.toThrow('SSH');});
    expect(install).not.toHaveBeenCalled();expect(f.disconnect).not.toHaveBeenCalled();
  });
  it('refuses installation while Hermes has a pending request',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'running task');});
    const stream=deferred();f.stream.mockReturnValueOnce(stream.promise);let sending!:Promise<void>;
    await act(async()=>{sending=h.result.current.sendMessage(id);});
    const install=vi.fn();await act(async()=>{await expect(h.result.current.runUpdateInstallation(install)).rejects.toThrow('Hermes');});
    expect(install).not.toHaveBeenCalled();await act(async()=>{stream.resolve();await sending;});
  });
  it('never launches installer after failed persistence and restores editing',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});
    f.write.mockRejectedValueOnce(new Error('disk full'));const install=vi.fn();
    await act(async()=>{await expect(h.result.current.runUpdateInstallation(install)).rejects.toThrow('Penyimpanan');});
    expect(install).not.toHaveBeenCalled();expect(h.result.current.busy).toBe(false);
    act(()=>h.result.current.setDraft(id,'still editable'));expect(h.result.current.state.conversations[0].draft).toBe('still editable');
  });
  it('prevents duplicate installations and releases the gate after native failure',async()=>{
    const h=await opened();const pending=deferred();const install=vi.fn().mockReturnValue(pending.promise);let updating!:Promise<unknown>;
    act(()=>{updating=h.result.current.runUpdateInstallation(install);});
    await act(async()=>{await expect(h.result.current.runUpdateInstallation(install)).rejects.toThrow('proses');});
    await act(async()=>{pending.reject(new Error('installer refused'));await expect(updating).rejects.toThrow('installer refused');});
    expect(install).toHaveBeenCalledOnce();expect(h.result.current.busy).toBe(false);
  });
});

describe('chat request durability and routing',()=>{
  it('persists request identity before dispatch and streams only to its conversation',async()=>{
    const h=await opened();let id='';let other='';
    act(()=>{id=h.result.current.createConversation('hermes-1');other=h.result.current.createConversation('hermes-1');});
    act(()=>h.result.current.setDraft(id,'Halo'));
    f.stream.mockImplementation(async(request:HermesRequest,onEvent:(e:HermesEvent)=>void)=>{
      expect(f.write).toHaveBeenCalled();
      const saved=f.write.mock.calls.at(-1)![0] as SavedState;
      expect(saved.conversations.find(c=>c.id===id)!.messages.at(-1)!.requestId).toBe(request.requestId);
      expect(request.conversationId).toBe(id);expect(request.messages.at(-1)?.content).toBe('Halo');
      onEvent({type:'delta',text:'Halo juga'});onEvent({type:'done',finishReason:'stop'});
    });
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(h.result.current.activeConversationId).toBe(other);
    expect(h.result.current.state.conversations.find(c=>c.id===other)!.messages).toHaveLength(0);
    expect(h.result.current.state.conversations.find(c=>c.id===id)!.messages.at(-1)).toMatchObject({content:'Halo juga',status:'complete'});
  });
  it('does not dispatch when request identity cannot be saved',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});act(()=>h.result.current.setDraft(id,'Halo'));
    f.write.mockRejectedValue(new Error('disk full'));
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(f.stream).not.toHaveBeenCalled();expect(h.result.current.saveError).not.toBeNull();
  });
  it('marks incomplete responses uncertain and refuses silent replay',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});act(()=>h.result.current.setDraft(id,'Mulai tugas'));
    f.stream.mockImplementation(async(_request:HermesRequest,onEvent:(e:HermesEvent)=>void)=>{onEvent({type:'delta',text:'partial'});});
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(h.result.current.state.conversations[0].messages.at(-1)!.status).toBe('unknown');
    act(()=>h.result.current.setDraft(id,'lagi'));
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(f.stream).toHaveBeenCalledTimes(1);
  });
  it('changing Hermes endpoint creates a profile without moving history',async()=>{
    const h=await opened();act(()=>{h.result.current.createConversation('hermes-1');});
    act(()=>h.result.current.saveHermes({...f.state!.hermes[0],url:'https://new.example'}));
    expect(h.result.current.state.hermes).toHaveLength(2);
    expect(h.result.current.state.conversations[0].profileId).toBe('hermes-1');
  });
});
