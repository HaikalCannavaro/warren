import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspace } from './useWorkspace';
import { emptyState } from '../lib/domain';
import { basicSlashCommands } from '../lib/slashCommands';
import { clearTerminalRegistry, registerTerminal } from '../lib/terminalBridge';
import { setLanguage } from '../lib/i18n';
import type { HermesEvent, HermesRequest, SavedState, SshEvent, SshRequest, VpsProfile } from '../types';

const f=vi.hoisted(()=>({
  state:undefined as SavedState|undefined,
  write:vi.fn(),close:vi.fn(),open:vi.fn(),probe:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),stream:vi.fn(),
  hermesHttp:vi.fn(),
  writeSsh:vi.fn(),resizeSsh:vi.fn(),onDesktopClose:vi.fn(),destroyWindow:vi.fn(),unlisten:vi.fn(),
  closeHandler:undefined as (()=>Promise<void>)|undefined,
  gatewayConnect:vi.fn(),gatewaySession:vi.fn(),gatewayCatalog:vi.fn(),gatewayCommand:vi.fn(),gatewaySend:vi.fn(),gatewayClose:vi.fn(),
  gatewayProfile:vi.fn(),gatewayObservers:[] as ((sessionId:string,profile:string|undefined)=>void)[],
  gatewayClosed:false,
  biometricStatus:vi.fn(),enrollBiometric:vi.fn(),unlockWithBiometric:vi.fn(),clearBiometric:vi.fn(),
}));
vi.mock('../lib/gatewayClient',()=>({GatewayClient:class {
  constructor(_profile:unknown,onProfile?:(sessionId:string,profile:string|undefined)=>void){f.gatewayClosed=false;if(onProfile)f.gatewayObservers.push(onProfile);}
  isClosed(){return f.gatewayClosed;}
  connect=f.gatewayConnect;ensureSession=f.gatewaySession;catalog=f.gatewayCatalog;command=f.gatewayCommand;send=f.gatewaySend;close=f.gatewayClose;
  getSessionProfile=f.gatewayProfile;
}}));
vi.mock('../lib/vault',()=>({WorkspaceVault:{open:f.open}}));
vi.mock('../lib/native',()=>({
  nativeAvailable:()=>true,probeSsh:f.probe,connectSsh:f.connect,disconnectSsh:f.disconnect,
  writeSsh:f.writeSsh,resizeSsh:f.resizeSsh,streamHermes:f.stream,probeHermes:vi.fn(),
  hermesHttp:f.hermesHttp,
  onDesktopClose:f.onDesktopClose,destroyWindow:f.destroyWindow,
  getBiometricStatus:f.biometricStatus,enrollBiometric:f.enrollBiometric,unlockWithBiometric:f.unlockWithBiometric,clearBiometric:f.clearBiometric,
}));
const profile:VpsProfile={id:'vps-1',name:'My VPS',host:'example.test',port:22,username:'deploy',auth:'password',password:'secret',privateKey:'',passphrase:''};
beforeEach(()=>{
  setLanguage('id');
  f.gatewayObservers=[];
  f.hermesHttp.mockReset();
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
  f.gatewayConnect.mockResolvedValue(undefined);f.gatewaySession.mockResolvedValue({sessionId:'canonical-1'});
  f.gatewayCatalog.mockResolvedValue(basicSlashCommands().map(c=>({...c,available:true,reason:undefined})));
  f.gatewayCommand.mockResolvedValue('Model diperbarui.');f.gatewayClose.mockResolvedValue(undefined);
  f.biometricStatus.mockResolvedValue({available:false,enrolled:false,enabled:false});
  f.enrollBiometric.mockResolvedValue(true);f.clearBiometric.mockResolvedValue(false);
  f.gatewaySend.mockImplementation(async(_id:string,_text:string,_submission:string,onEvent:(e:HermesEvent)=>void)=>{onEvent({type:'delta',text:'draft'});onEvent({type:'replace',text:'Final response'});onEvent({type:'done',finishReason:'stop'});});
});
afterEach(()=>cleanup());
async function opened(){const h=renderHook(()=>useWorkspace());await act(async()=>{await h.result.current.unlock('a long password');});return h;}
function deferred(){let resolve!:()=>void;let reject!:(reason:Error)=>void;const promise=new Promise<void>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

describe('Gateway workspace integration',()=>{
  const gateway=()=>{f.state!.hermes[0]={...f.state!.hermes[0],transport:'gateway',url:'wss://hermes.example/api/ws',model:''};};
  it('persists confirmed profile identity and snapshots it per reply without changing routing',async()=>{
    gateway();f.state!.hermes[0].agentProfile='Configured label';f.gatewayProfile.mockReturnValue('Leveret');
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Hello');});
    f.gatewaySend.mockImplementationOnce(async(_session:string,_text:string,_submission:string,onEvent:(e:HermesEvent)=>void)=>{
      expect((f.write.mock.calls.at(-1)![0] as SavedState).conversations[0].agentProfile).toBe('Leveret');
      onEvent({type:'delta',text:'First response',agentProfile:'Leveret'});onEvent({type:'done',finishReason:'stop',agentProfile:'Leveret'});
    });
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(h.result.current.state.conversations[0].messages.at(-1)?.agentProfile).toBe('Leveret');
    act(()=>{f.gatewayObservers[0]('canonical-1','Research');h.result.current.setDraft(id,'Next');});
    f.gatewaySend.mockImplementationOnce(async(_session:string,_text:string,_submission:string,onEvent:(e:HermesEvent)=>void)=>{
      onEvent({type:'delta',text:'Second response',agentProfile:'Research'});onEvent({type:'done',finishReason:'stop',agentProfile:'Research'});
    });
    await act(async()=>{await h.result.current.sendMessage(id);});
    const conversation=h.result.current.state.conversations[0];
    expect(conversation.agentProfile).toBe('Research');
    expect(conversation.messages.filter(m=>m.role==='assistant').map(m=>m.agentProfile)).toEqual(['Leveret','Research']);
    expect(f.gatewaySend.mock.calls.map(call=>call.slice(0,2))).toEqual([['canonical-1','Hello'],['canonical-1','Next']]);
    expect(f.state!.hermes[0].model).toBe('');
  });
  it('ignores profile metadata for another session or a closed workspace',async()=>{
    gateway();f.gatewayProfile.mockReturnValue('Leveret');
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});
    await act(async()=>{await h.result.current.loadCommands(id);});
    act(()=>f.gatewayObservers[0]('other-session','Other'));
    expect(h.result.current.state.conversations[0].agentProfile).toBe('Leveret');
    await act(async()=>{await h.result.current.lock();});
    act(()=>f.gatewayObservers[0]('canonical-1','Late profile'));
    expect(h.result.current.state.conversations).toEqual([]);
  });
  it('invalidates confirmed profile identity when credentials change and ignores the retired connection',async()=>{
    gateway();f.gatewayProfile.mockReturnValue('Leveret');
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});
    await act(async()=>{await h.result.current.loadCommands(id);});
    const retiredObserver=f.gatewayObservers[0];
    act(()=>{h.result.current.saveHermes({...h.result.current.state.hermes[0],token:'replacement-token'});retiredObserver('canonical-1','Late profile');});
    expect(h.result.current.state.conversations[0].agentProfile).toBeUndefined();
    f.gatewayProfile.mockReturnValue('Research');
    await act(async()=>{await h.result.current.loadCommands(id);});
    act(()=>retiredObserver('canonical-1','Late profile'));
    expect(h.result.current.state.conversations[0].agentProfile).toBe('Research');
  });
  it.each([undefined,'Configured profile'])('clears stale reply identity when a refreshed Gateway profile is missing (fallback %s)',async fallback=>{
    gateway();f.state!.hermes[0].agentProfile=fallback;
    f.state!.conversations=[{id:'saved',profileId:'hermes-1',title:'Chat',draft:'Next',createdAt:1,gatewaySessionId:'canonical-1',agentProfile:'Leveret',messages:[{id:'old',role:'assistant',content:'Previous reply',createdAt:1,status:'complete',agentProfile:'Leveret'}]}];
    f.gatewayProfile.mockReturnValue('Leveret');
    const h=await opened();await act(async()=>{await h.result.current.loadCommands('saved');});
    f.gatewaySend.mockImplementationOnce(async(_session:string,_text:string,_submission:string,onEvent:(e:HermesEvent)=>void)=>{
      // The per-send session.resume no longer confirms a profile, even though the
      // cached session from the prior catalog load did. Metadata must clear it.
      f.gatewayProfile.mockReturnValue(undefined);f.gatewayObservers[0]('canonical-1',undefined);
      onEvent({type:'delta',text:'New reply',agentProfile:undefined});onEvent({type:'done',finishReason:'stop',agentProfile:undefined});
    });
    await act(async()=>{await h.result.current.sendMessage('saved');});
    expect(h.result.current.state.conversations[0].agentProfile).toBeUndefined();
    expect(h.result.current.state.conversations[0].messages.filter(m=>m.role==='assistant').map(m=>m.agentProfile)).toEqual(['Leveret',fallback]);
  });
  it('releases idle connections before opening more conversations than the native limit',async()=>{
    gateway();const h=await opened();const ids:string[]=[];
    for(let index=0;index<8;index++){
      let id='';act(()=>{id=h.result.current.createConversation('hermes-1');ids.push(id);});
      await act(async()=>{await h.result.current.loadCommands(id);});
    }
    expect(f.gatewayClose).toHaveBeenCalled();
    expect(h.result.current.state.conversations.find(c=>c.id===ids[0])?.gatewaySessionId).toBe('canonical-1');
    await act(async()=>{await h.result.current.loadCommands(ids[0]);});
    expect(f.gatewaySession).toHaveBeenLastCalledWith('canonical-1');
  });
  it('reconnects a closed idle socket only on a manual action and resumes its stored session',async()=>{
    gateway();const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});
    await act(async()=>{await h.result.current.loadCommands(id);});
    f.gatewayClosed=true;
    expect(f.gatewayConnect).toHaveBeenCalledOnce();
    await act(async()=>{await h.result.current.loadCommands(id);});
    expect(f.gatewayConnect).toHaveBeenCalledTimes(2);
    expect(f.gatewaySession).toHaveBeenLastCalledWith('canonical-1');
  });
  it('shares one replacement connection when catalog retry overlaps a command',async()=>{
    gateway();const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});
    await act(async()=>{await h.result.current.loadCommands(id);});f.gatewayClosed=true;
    const closing=deferred();f.gatewayClose.mockReturnValueOnce(closing.promise);
    let loading!:Promise<void>,running!:Promise<void>;
    act(()=>{loading=h.result.current.loadCommands(id);running=h.result.current.runCommand(id,'/status');});
    await act(async()=>{closing.resolve();await Promise.all([loading,running]);});
    expect(f.gatewayConnect).toHaveBeenCalledTimes(2);
  });
  it('persists canonical identity before sending one prompt and reconciles final text',async()=>{
    gateway();const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Hello');});
    f.gatewaySend.mockImplementationOnce(async(_session:string,_text:string,_submission:string,onEvent:(event:HermesEvent)=>void)=>{
      expect((f.write.mock.calls.at(-1)![0] as SavedState).conversations[0].gatewaySessionId).toBe('canonical-1');
      onEvent({type:'delta',text:'partial'});onEvent({type:'replace',text:'Authoritative final'});onEvent({type:'done',finishReason:'stop'});
    });
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(f.gatewaySend.mock.calls[0].slice(0,2)).toEqual(['canonical-1','Hello']);expect(f.stream).not.toHaveBeenCalled();
    expect(h.result.current.state.conversations[0].messages.at(-1)).toMatchObject({content:'Authoritative final',status:'complete'});
  });
  it('resumes the saved identity and keeps controls outside model history',async()=>{
    gateway();f.state!.conversations=[{id:'saved',profileId:'hermes-1',title:'Saved',createdAt:1,messages:[],draft:'/status',gatewaySessionId:'stored-42'}];
    const h=await opened();await act(async()=>{await h.result.current.sendMessage('saved');});
    expect(f.gatewaySession).toHaveBeenCalledWith('stored-42');expect(f.gatewayCommand).toHaveBeenCalledWith('canonical-1','/status');
    expect(h.result.current.state.conversations[0].messages).toEqual([]);
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('complete');
  });
  it('does not dispatch when saving a newly created server identity fails',async()=>{
    gateway();const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Hello');});
    f.write.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(f.gatewaySend).not.toHaveBeenCalled();expect(f.gatewayClose).toHaveBeenCalled();
    expect(h.result.current.state.conversations[0].messages.at(-1)?.status).toBe('error');
  });
  it('keeps a running chat busy after a stop command completes and blocks vault lock',async()=>{
    gateway();const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Work');});
    const stream=deferred();f.gatewaySend.mockReturnValueOnce(stream.promise);let sending!:Promise<void>;
    await act(async()=>{sending=h.result.current.sendMessage(id);});
    await act(async()=>{await h.result.current.runCommand(id,'/stop');await h.result.current.lock();});
    expect(h.result.current.streamingIds.has(id)).toBe(true);expect(h.result.current.ready).toBe(true);expect(f.close).not.toHaveBeenCalled();
    await act(async()=>{stream.resolve();await sending;});
  });
  it('marks an interrupted command unknown and ignores late completion after window close',async()=>{
    gateway();const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});
    const command=deferred();f.gatewayCommand.mockImplementationOnce(async()=>{await command.promise;return 'late';});let running!:Promise<void>;
    await act(async()=>{running=h.result.current.runCommand(id,'/model example');});
    await act(async()=>{await f.closeHandler!();command.resolve();await running;});
    expect(f.gatewayClose).toHaveBeenCalled();expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('unknown');
  });
  it('prevents installation and duplicate controls while a command is pending',async()=>{
    gateway();const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});
    const command=deferred();f.gatewayCommand.mockImplementationOnce(async()=>{await command.promise;return 'done';});let running!:Promise<void>;
    await act(async()=>{running=h.result.current.runCommand(id,'/compact');});
    const install=vi.fn();await act(async()=>{await h.result.current.runCommand(id,'/compact');await expect(h.result.current.runUpdateInstallation(install)).rejects.toThrow();});
    expect(f.gatewayCommand).toHaveBeenCalledOnce();expect(install).not.toHaveBeenCalled();
    await act(async()=>{command.resolve();await running;});
  });
  it('preserves unresolved mutation state even after the display history is pruned',async()=>{
    gateway();const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');});
    f.gatewayCommand.mockRejectedValueOnce(Object.assign(new Error('Connection lost'),{uncertain:true}));
    await act(async()=>{await h.result.current.runCommand(id,'/model example');});
    for(let i=0;i<101;i++)await act(async()=>{await h.result.current.runCommand(id,'/help');});
    expect(h.result.current.state.conversations[0].commandResults).toHaveLength(100);
    act(()=>h.result.current.setDraft(id,'Do not start'));
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(f.gatewaySend).not.toHaveBeenCalled();
    expect(h.result.current.state.conversations[0].gatewayStateUncertain).toBe(true);
  });
});

describe('single Agent chat space',()=>{
  const savedChat=(id:string,createdAt:number)=>({id,profileId:'hermes-1',title:id,createdAt,draft:'saved draft',messages:[]});
  it('restores the last selected chat when the vault opens',async()=>{
    f.state!.conversations=[savedChat('older-selected',1),savedChat('newer',2)];f.state!.activeConversationId='older-selected';
    const h=await opened();expect(h.result.current.activeConversationId).toBe('older-selected');
  });
  it('migrates older vaults to their latest existing chat without creating a session',async()=>{
    f.state!.conversations=[savedChat('old',1),savedChat('latest',3),savedChat('middle',2)];
    const h=await opened();expect(h.result.current.activeConversationId).toBe('latest');
    expect(h.result.current.state.conversations).toHaveLength(3);expect(f.gatewayConnect).not.toHaveBeenCalled();
  });
  it('opens the existing profile chat and only /new creates another session',async()=>{
    f.state!.conversations=[savedChat('existing',1)];const h=await opened();
    act(()=>{h.result.current.openConversation('hermes-1');});
    expect(h.result.current.state.conversations).toHaveLength(1);
    await act(async()=>{await h.result.current.runCommand('existing','/new Fresh');});
    expect(h.result.current.state.conversations).toHaveLength(2);
    expect(h.result.current.state.activeConversationId).toBe(h.result.current.activeConversationId);
    expect(h.result.current.state.conversations.find(c=>c.id==='existing')?.draft).toBe('saved draft');
  });
});

describe('SSH and chat isolation',()=>{
  it('routes a slash command to a separate result without calling the chat API',async()=>{
    const h=await opened();let id='';
    act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'/help');});
    await act(async()=>{await h.result.current.sendMessage(id);});
    const c=h.result.current.state.conversations[0];
    expect(c.messages).toEqual([]);
    expect(c.commandResults?.at(-1)).toMatchObject({command:'/help',status:'complete'});
    expect(c.commandResults?.at(-1)?.content).toContain('/new');
    expect(f.stream).not.toHaveBeenCalled();
  });
  it('starts a fresh conversation with /new while keeping previous history',async()=>{
    const h=await opened();let id='';
    act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'/new Investigasi');});
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(h.result.current.state.conversations).toHaveLength(2);
    expect(h.result.current.activeConversationId).not.toBe(id);
    expect(h.result.current.state.conversations[0].title).toBe('Investigasi');
    expect(h.result.current.state.conversations[0].gatewaySessionId).toBeUndefined();
    expect(f.stream).not.toHaveBeenCalled();
  });
  it('rejects unsupported controls without sending them as prompts',async()=>{
    const h=await opened();let id='';
    act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'/model other');});
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(h.result.current.state.conversations[0].messages).toEqual([]);
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)).toMatchObject({status:'error'});
    expect(f.stream).not.toHaveBeenCalled();
  });
  it('sends an escaped slash as literal chat text',async()=>{
    const h=await opened();let id='';
    act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'//path/example');});
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(f.stream.mock.calls[0][0].messages).toEqual([{role:'user',content:'/path/example'}]);
  });
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
    expect(saved.conversations[0].executionLog?.map(entry=>entry.kind)).toEqual(['request','response','unknown']);
    expect(f.destroyWindow).not.toHaveBeenCalled();
    act(()=>{onEvent({type:'delta',text:' discarded'});onEvent({type:'done',finishReason:'stop'});h.result.current.setDraft(id,'blocked');});
    expect(h.result.current.state.conversations[0].messages.at(-1)).toMatchObject({status:'unknown',content:'partial'});
    expect(h.result.current.state.conversations[0].executionLog?.map(entry=>entry.kind)).toEqual(['request','response','unknown']);
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

  it('does not revive an interrupted request from callbacks after a failed close has settled',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Start work');});
    const stream=deferred();let onEvent!:(event:HermesEvent)=>void;
    f.stream.mockImplementation((_request:HermesRequest,handler:(event:HermesEvent)=>void)=>{onEvent=handler;return stream.promise;});
    let sending!:Promise<void>;await act(async()=>{sending=h.result.current.sendMessage(id);});
    f.destroyWindow.mockRejectedValueOnce(new Error('window still open'));
    await act(async()=>{await f.closeHandler!();stream.resolve();await sending;});
    act(()=>{onEvent({type:'delta',text:'late response'});onEvent({type:'done',finishReason:'stop'});});
    const conversation=h.result.current.state.conversations[0];
    expect(conversation.messages.at(-1)).toMatchObject({status:'unknown',content:''});
    expect(conversation.executionLog?.map(entry=>entry.kind)).toEqual(['request','unknown']);
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
  it('persists truthful execution history after completion without logging credentials or message bodies',async()=>{
    const h=await opened();let id='';let other='';
    act(()=>{id=h.result.current.createConversation('hermes-1');other=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'private user request');});
    f.stream.mockImplementation(async(request:HermesRequest,onEvent:(e:HermesEvent)=>void)=>{
      const saved=f.write.mock.calls.at(-1)![0] as SavedState;
      expect(saved.conversations.find(c=>c.id===id)!.executionLog?.[0]).toMatchObject({requestId:request.requestId,kind:'request'});
      onEvent({type:'tool',text:'Running shell: pwd'});
      onEvent({type:'delta',text:'private assistant response'});
      onEvent({type:'delta',text:' continued'});
      onEvent({type:'done',finishReason:'stop'});
      onEvent({type:'done',finishReason:'stop'});
      onEvent({type:'error',message:'late duplicate terminal',uncertain:true});
    });
    await act(async()=>{await h.result.current.sendMessage(id);});
    const conversation=h.result.current.state.conversations.find(c=>c.id===id)!;
    const log=conversation.executionLog??[];
    expect(log.map(entry=>entry.kind)).toEqual(['request','tool','response','complete']);
    expect(log[1].text).toBe('Running shell: pwd');
    expect(new Set(log.map(entry=>entry.id)).size).toBe(4);
    expect(new Set(log.map(entry=>entry.requestId)).size).toBe(1);
    expect(log.every(entry=>Number.isFinite(entry.timestamp))).toBe(true);
    expect(JSON.stringify(log)).not.toMatch(/private user request|private assistant response|token|late duplicate/);
    expect(conversation.messages.at(-1)?.status).toBe('complete');
    expect(h.result.current.state.conversations.find(c=>c.id===other)?.executionLog??[]).toEqual([]);
    expect(h.result.current.activeConversationId).toBe(other);
    expect((f.write.mock.calls.at(-1)![0] as SavedState).conversations.find(c=>c.id===id)?.executionLog).toEqual(log);
    expect(h.result.current.streamingIds.size).toBe(0);
  });
  it.each(['disconnect','uncertain','error'] as const)('never reports tool success after %s',async(outcome)=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Start work');});
    f.stream.mockImplementation(async(_request:HermesRequest,onEvent:(e:HermesEvent)=>void)=>{
      onEvent({type:'tool',text:'Starting deployment'});
      if(outcome!=='disconnect')onEvent({type:'error',message:'Backend stopped',uncertain:outcome==='uncertain'});
    });
    await act(async()=>{await h.result.current.sendMessage(id);});
    const log=h.result.current.state.conversations[0].executionLog??[];
    expect(log.map(entry=>entry.kind)).toEqual(['request','tool',outcome==='error'?'error':'unknown']);
    expect(log[1].text).toBe('Starting deployment');
    expect(JSON.stringify(log)).not.toMatch(/success|succeeded|berhasil/i);
  });
  it('bounds a noisy tool stream while retaining the terminal outcome',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Start work');});
    f.stream.mockImplementation(async(_request:HermesRequest,onEvent:(e:HermesEvent)=>void)=>{
      for(let index=0;index<205;index++)onEvent({type:'tool',text:`${index}: ${'x'.repeat(5000)}`});
      onEvent({type:'done',finishReason:'stop'});
    });
    await act(async()=>{await h.result.current.sendMessage(id);});
    const log=h.result.current.state.conversations[0].executionLog??[];
    expect(log).toHaveLength(200);
    expect(log[0].text.startsWith('6: ')).toBe(true);
    expect(log.filter(entry=>entry.kind==='tool').every(entry=>entry.text.length===4000)).toBe(true);
    expect(log.at(-1)?.kind).toBe('complete');
  });
  it('records pre-dispatch save failure as an error and clears logs from memory on lock',async()=>{
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Start work');});
    f.write.mockRejectedValueOnce(new Error('disk full'));
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(h.result.current.state.conversations[0].executionLog?.map(entry=>entry.kind)).toEqual(['request','error']);
    expect(f.stream).not.toHaveBeenCalled();
    await act(async()=>{await h.result.current.lock();});
    expect(h.result.current.state.conversations).toEqual([]);
  });
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
  it('localizes controls without adding language instructions to Agent messages',async()=>{
    setLanguage('en');
    const h=await opened();let id='';
    act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Tolong jawab dalam bahasa Indonesia.');});
    expect(h.result.current.state.conversations[0].title).toBe('New conversation');
    await act(async()=>{await h.result.current.runCommand(id,'/help');});
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.content).toContain('Start a new conversation.');
    await act(async()=>{await h.result.current.sendMessage(id);});
    const request=f.stream.mock.calls[0][0] as HermesRequest;
    expect(request.messages).toEqual([{role:'user',content:'Tolong jawab dalam bahasa Indonesia.'}]);
    expect(h.result.current.state.conversations[0].messages.at(-1)?.content).toBe('Jawaban');
    act(()=>setLanguage('id'));
    expect(h.result.current.state.conversations[0].messages.at(-1)?.content).toBe('Jawaban');
    await act(async()=>{await h.result.current.runCommand(id,'/help');});
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.content).toContain('Mulai percakapan baru.');
  });
  it('records the configured HTTP profile label without using it as model or mutating old replies',async()=>{
    f.state!.hermes[0].agentProfile='Leveret';
    const h=await opened();let id='';act(()=>{id=h.result.current.createConversation('hermes-1');h.result.current.setDraft(id,'Hello');});
    await act(async()=>{await h.result.current.sendMessage(id);});
    act(()=>{h.result.current.saveHermes({...h.result.current.state.hermes[0],agentProfile:'Research'});h.result.current.setDraft(id,'Again');});
    await act(async()=>{await h.result.current.sendMessage(id);});
    expect(f.stream.mock.calls.map(call=>(call[0] as HermesRequest).model)).toEqual(['hermes-agent','hermes-agent']);
    expect(h.result.current.state.conversations[0].messages.filter(m=>m.role==='assistant').map(m=>m.agentProfile)).toEqual(['Leveret','Research']);
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

describe('Extended slash commands suite', () => {
  afterEach(() => {
    clearTerminalRegistry();
  });

  it('/lastcmd captures recent lines from active terminal and inserts into composer', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    // Error when no active terminal session
    await act(async () => {
      await h.result.current.runCommand(id, '/lastcmd');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)).toMatchObject({
      status: 'error',
    });

    // Connect VPS terminal session with verified fingerprint
    f.state!.vps[0].fingerprint = 'SHA256:verified';
    await act(async () => {
      await h.result.current.connectVps('vps-1');
    });
    const sessionId = h.result.current.activeSessionId!;
    expect(sessionId).toBeTruthy();

    // Register terminal with test buffer
    const mockTerm = {
      _testBuffer: ['line 1', 'line 2', '$ git status', 'On branch main'],
    } as any;
    registerTerminal(sessionId, mockTerm);

    // Run /lastcmd 2
    await act(async () => {
      await h.result.current.runCommand(id, '/lastcmd 2');
    });

    const conv = h.result.current.state.conversations[0];
    expect(conv.commandResults?.at(-1)?.status).toBe('complete');
    expect(conv.draft).toContain('```terminal\n$ git status\nOn branch main\n```');

    // Run alias /term with empty buffer returns error
    mockTerm._testBuffer = [];
    await act(async () => {
      await h.result.current.runCommand(id, '/term');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('error');
  });

  it('/clear visually clears messages without resetting server session or conversation title', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
      h.result.current.setDraft(id, 'Halo');
    });
    await act(async () => {
      await h.result.current.sendMessage(id);
    });
    expect(h.result.current.state.conversations[0].messages.length).toBeGreaterThan(0);
    const originalTitle = h.result.current.state.conversations[0].title;

    // Run /clear
    await act(async () => {
      await h.result.current.runCommand(id, '/clear');
    });

    const conv = h.result.current.state.conversations[0];
    expect(conv.messages).toEqual([]);
    expect(conv.title).toBe(originalTitle);
    expect(conv.commandResults?.at(-1)?.status).toBe('complete');

    // Rejects unexpected arguments
    await act(async () => {
      await h.result.current.runCommand(id, '/clear all');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('error');
  });

  it('/retry re-sends the last user message immediately', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    // Error when no user message exists yet
    await act(async () => {
      await h.result.current.runCommand(id, '/retry');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('error');

    // Send first message
    act(() => {
      h.result.current.setDraft(id, 'Analyze telemetry');
    });
    await act(async () => {
      await h.result.current.sendMessage(id);
    });
    expect(f.stream).toHaveBeenCalledTimes(1);

    // Call /retry
    await act(async () => {
      await h.result.current.runCommand(id, '/retry');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('complete');
  });

  it('/fork duplicates history into a new conversation tab', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
      h.result.current.setDraft(id, 'First turn');
    });
    await act(async () => {
      await h.result.current.sendMessage(id);
    });

    const beforeCount = h.result.current.state.conversations.length;
    await act(async () => {
      await h.result.current.runCommand(id, '/fork Experimental Branch');
    });

    expect(h.result.current.state.conversations.length).toBe(beforeCount + 1);
    const active = h.result.current.state.conversations.find(c => c.id === h.result.current.activeConversationId);
    expect(active?.title).toBe('Experimental Branch');
    expect(active?.messages.length).toBe(2);
    expect(active?.id).not.toBe(id);
  });

  it('/export exports conversation transcript to Markdown or JSON', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
      h.result.current.setDraft(id, 'Hello world');
    });
    await act(async () => {
      await h.result.current.sendMessage(id);
    });

    // Export markdown (default)
    await act(async () => {
      await h.result.current.runCommand(id, '/export');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('complete');

    // Export JSON
    await act(async () => {
      await h.result.current.runCommand(id, '/export json');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('complete');

    // Rejects invalid format
    await act(async () => {
      await h.result.current.runCommand(id, '/export xml');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('error');
  });

  it('/status queries Hermes server over HTTP and displays latency card', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    f.hermesHttp.mockResolvedValueOnce(JSON.stringify({ status: 'ok', features: ['Chat API'] }));
    f.hermesHttp.mockResolvedValueOnce(JSON.stringify({ data: [{ id: 'hermes-3' }] }));

    await act(async () => {
      await h.result.current.runCommand(id, '/status');
    });

    const result = h.result.current.state.conversations[0].commandResults?.at(-1);
    expect(result?.status).toBe('complete');
    expect(result?.content).toContain('Latency');
    expect(result?.content).toContain('Healthy / Online');
    expect(result?.content).toContain('Hermes');
    expect(result?.content).toContain('https://hermes.example/v1');
  });

  it('/models queries available models and /model switches active model', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    f.hermesHttp.mockResolvedValueOnce(JSON.stringify({
      data: [{ id: 'hermes-3-70b' }, { id: 'qwen-2.5-coder' }],
    }));

    await act(async () => {
      await h.result.current.runCommand(id, '/models');
    });

    const result = h.result.current.state.conversations[0].commandResults?.at(-1);
    expect(result?.status).toBe('complete');
    expect(result?.content).toContain('hermes-3-70b');
    expect(result?.content).toContain('qwen-2.5-coder');

    // Switch model with /model
    f.hermesHttp.mockResolvedValueOnce(JSON.stringify({
      data: [{ id: 'qwen-2.5-coder' }],
    }));
    await act(async () => {
      await h.result.current.runCommand(id, '/model qwen-2.5-coder');
    });

    const switchResult = h.result.current.state.conversations[0].commandResults?.at(-1);
    expect(switchResult?.status).toBe('complete');
    expect(switchResult?.content).toContain('qwen-2.5-coder');
    expect(h.result.current.state.conversations[0].model).toBe('qwen-2.5-coder');
  });

  it('/skills and /tools query loaded agent capabilities from server', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    // /skills
    f.hermesHttp.mockResolvedValueOnce(JSON.stringify({
      data: [
        { name: 'frontend-craftsmanship', description: 'Polished responsive UI' },
      ],
    }));
    await act(async () => {
      await h.result.current.runCommand(id, '/skills');
    });
    const skillsRes = h.result.current.state.conversations[0].commandResults?.at(-1);
    expect(skillsRes?.status).toBe('complete');
    expect(skillsRes?.content).toContain('frontend-craftsmanship');

    // /tools
    f.hermesHttp.mockResolvedValueOnce(JSON.stringify({
      toolsets: [
        { name: 'terminal', description: 'Execute shell commands', tools: ['exec'] },
      ],
    }));
    await act(async () => {
      await h.result.current.runCommand(id, '/tools');
    });
    const toolsRes = h.result.current.state.conversations[0].commandResults?.at(-1);
    expect(toolsRes?.status).toBe('complete');
    expect(toolsRes?.content).toContain('terminal');
  });

  it('/stop reports when no active task is running', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    await act(async () => {
      await h.result.current.runCommand(id, '/stop');
    });

    const stopRes = h.result.current.state.conversations[0].commandResults?.at(-1);
    expect(stopRes?.status).toBe('complete');
    expect(stopRes?.content).toContain('Tidak ada pekerjaan Agent yang sedang berjalan.');
  });

  it('/stop aborts active HTTP stream and marks message as stopped', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
      h.result.current.setDraft(id, 'Stream prompt');
    });

    const streamGate = deferred();
    f.stream.mockImplementationOnce(async (_request: HermesRequest, onEvent: (e: HermesEvent) => void) => {
      onEvent({ type: 'delta', text: 'Partial text...' });
      await streamGate.promise;
    });

    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = h.result.current.sendMessage(id);
    });

    expect(h.result.current.streamingIds.has(id)).toBe(true);

    // Call /stop while streaming
    await act(async () => {
      await h.result.current.runCommand(id, '/stop');
    });

    streamGate.resolve();
    await act(async () => {
      await sendPromise;
    });

    const conv = h.result.current.state.conversations[0];
    const assistantMsg = conv.messages.find(m => m.role === 'assistant');
    expect(assistantMsg?.status).toBe('error');
    expect(assistantMsg?.error).toBe('Dihentikan oleh pengguna.');
  });

  it('handles offline / unreachable server for /status, /skills, /tools gracefully', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    f.hermesHttp.mockRejectedValue(new Error('Connection timed out'));

    await act(async () => {
      await h.result.current.runCommand(id, '/status');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('error');

    await act(async () => {
      await h.result.current.runCommand(id, '/skills');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('error');

    await act(async () => {
      await h.result.current.runCommand(id, '/tools');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('error');
  });

  it('ignores rapid concurrent command dispatch while a command is pending', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    f.hermesHttp.mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 20));
      return JSON.stringify({ data: [{ id: 'hermes-3' }] });
    });

    let p1: Promise<void>;
    let p2: Promise<void>;
    act(() => {
      p1 = h.result.current.runCommand(id, '/models');
      p2 = h.result.current.runCommand(id, '/models');
    });

    await act(async () => {
      await Promise.all([p1, p2]);
    });

    // Only one command execution occurred
    expect(f.hermesHttp).toHaveBeenCalledTimes(1);
  });

  it('rejects unexpected arguments for /help', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    await act(async () => {
      await h.result.current.runCommand(id, '/help extra');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('error');
  });

  it('rejects unexpected arguments for /retry', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
      h.result.current.setDraft(id, 'First message');
    });
    await act(async () => {
      await h.result.current.sendMessage(id);
    });

    await act(async () => {
      await h.result.current.runCommand(id, '/retry now');
    });
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.status).toBe('error');
    expect(h.result.current.state.conversations[0].commandResults?.at(-1)?.content).toContain('Gunakan /retry tanpa argumen');
  });

  it('/fork without arguments uses default (Fork) suffix', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
      h.result.current.setDraft(id, 'Turn 1');
    });
    await act(async () => {
      await h.result.current.sendMessage(id);
    });

    const beforeCount = h.result.current.state.conversations.length;
    await act(async () => {
      await h.result.current.runCommand(id, '/fork');
    });

    expect(h.result.current.state.conversations.length).toBe(beforeCount + 1);
    const active = h.result.current.state.conversations.find(c => c.id === h.result.current.activeConversationId);
    expect(active?.title).toContain('Turn 1 (');
  });

  it('/model rejects unknown or unavailable model', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    f.hermesHttp.mockResolvedValueOnce(JSON.stringify({
      data: [{ id: 'hermes-3-70b' }],
    }));

    await act(async () => {
      await h.result.current.runCommand(id, '/model non-existent-model');
    });

    const result = h.result.current.state.conversations[0].commandResults?.at(-1);
    expect(result?.status).toBe('error');
    expect(result?.content).toContain('non-existent-model');
  });

  it('/models reports error when server is offline', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    f.hermesHttp.mockRejectedValue(new Error('Network unreachable'));

    await act(async () => {
      await h.result.current.runCommand(id, '/models');
    });

    const result = h.result.current.state.conversations[0].commandResults?.at(-1);
    expect(result?.status).toBe('error');
    expect(result?.content).toContain('Network unreachable');
  });

  it('/lastcmd with non-numeric argument falls back safely to default lines', async () => {
    const h = await opened();
    let id = '';
    act(() => {
      id = h.result.current.createConversation('hermes-1');
    });

    f.state!.vps[0].fingerprint = 'SHA256:verified';
    await act(async () => {
      await h.result.current.connectVps('vps-1');
    });
    const sessionId = h.result.current.activeSessionId!;

    const mockTerm = {
      _testBuffer: ['line 1', 'line 2', 'line 3'],
    } as any;
    registerTerminal(sessionId, mockTerm);

    await act(async () => {
      await h.result.current.runCommand(id, '/lastcmd not-a-number');
    });

    const conv = h.result.current.state.conversations[0];
    expect(conv.commandResults?.at(-1)?.status).toBe('complete');
    expect(conv.draft).toContain('```terminal\nline 1\nline 2\nline 3\n```');
  });

  it('enrolls, unlocks, handles cancel/error, and disables biometric unlock', async () => {
    f.biometricStatus.mockResolvedValue({ available: true, enrolled: true, enabled: false });
    const h = renderHook(() => useWorkspace());
    await act(async () => {});
    expect(h.result.current.biometric).toEqual({ available: true, enrolled: true, enabled: false });

    f.biometricStatus.mockResolvedValue({ available: true, enrolled: true, enabled: true });
    await act(async () => {
      await h.result.current.unlock('a long password', { enableBiometric: true });
    });
    expect(f.enrollBiometric).toHaveBeenCalledWith('a long password');
    expect(h.result.current.biometric.enabled).toBe(true);
    expect(h.result.current.ready).toBe(true);

    // Lock vault and test user cancel vs biometric unlock
    await act(async () => {
      await h.result.current.lock();
    });
    expect(h.result.current.ready).toBe(false);
    expect(h.result.current.autoPromptBiometric).toBe(false);

    f.unlockWithBiometric.mockRejectedValueOnce(new Error('Use password'));
    await act(async () => {
      await h.result.current.unlockBiometric();
    });
    expect(h.result.current.ready).toBe(false);
    expect(h.result.current.error).toBeNull();

    f.unlockWithBiometric.mockRejectedValueOnce(new Error('Biometric key expired. Unlock once with your master password.'));
    await act(async () => {
      await h.result.current.unlockBiometric();
    });
    expect(h.result.current.ready).toBe(false);
    expect(h.result.current.error).toContain('Biometric key expired');

    f.unlockWithBiometric.mockResolvedValueOnce('a long password');
    await act(async () => {
      await h.result.current.unlockBiometric();
    });
    expect(h.result.current.ready).toBe(true);

    f.biometricStatus.mockResolvedValue({ available: true, enrolled: true, enabled: false });
    await act(async () => {
      await h.result.current.disableBiometric();
    });
    expect(f.clearBiometric).toHaveBeenCalledOnce();
    expect(h.result.current.biometric.enabled).toBe(false);
  });
});
