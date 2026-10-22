import { translate } from '../lib/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CommandResult, Conversation, ExecutionLogEntry, HermesEvent, HermesProfile, Message, SavedState, Settings, SlashCommand, TerminalSession, VpsProfile } from '../types';
import { conversationHistory, emptyState, errorText, normalizeAgentProfileName, normalizeGatewayUrl, normalizeHermesUrl, validateVps } from '../lib/domain';
import { appendExecutionLog, interruptExecutionLog, MAX_LOG_TEXT } from '../lib/executionLog';
import { basicSlashCommands, formatCommandHelp, parseSlashCommand, sanitizeCommandResults } from '../lib/slashCommands';
import { GatewayClient } from '../lib/gatewayClient';
import * as native from '../lib/native';
import { WorkspaceVault } from '../lib/vault';

type HostPrompt={profileId:string;fingerprint:string;host:string};
type TerminalBuffer={chunks:Uint8Array[];size:number;listener?:((bytes:Uint8Array)=>void)};
const MAX_PENDING_BYTES=1024*1024;

export function useWorkspace() {
  const [preview]=useState(()=>!native.nativeAvailable());
  const [ready,setReady]=useState(preview);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [saveError,setSaveError]=useState<string|null>(null);
  const [state,setState]=useState<SavedState>(emptyState);
  const stateRef=useRef(state);
  const vault=useRef<WorkspaceVault|null>(null);
  const transition=useRef<'unlocking'|'locking'|'closing'|'updating'|null>(null);
  const transitionVersion=useRef(0);
  const saveTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [sessions,setSessions]=useState<TerminalSession[]>([]);
  const liveSessions=useRef(new Map<string,TerminalSession>());
  const buffers=useRef(new Map<string,TerminalBuffer>());
  const [activeSessionId,setActiveSessionId]=useState<string|null>(null);
  const [hostPrompt,setHostPrompt]=useState<HostPrompt|null>(null);
  const [activeConversationId,setActiveConversationId]=useState<string|null>(null);
  const [streamingIds,setStreamingIds]=useState<Set<string>>(new Set());
  const activeRequests=useRef(new Set<string>());
  const detachedRequests=useRef(new Set<string>());
  const [toolActivity,setToolActivity]=useState<Record<string,string>>({});
  const [commandBusyIds,setCommandBusyIds]=useState<Set<string>>(new Set());
  const pendingCommands=useRef(new Set<string>());
  const [commandCatalog,setCommandCatalog]=useState<Record<string,SlashCommand[]>>({});
  const pendingCatalogs=useRef(new Map<string,Promise<void>>());
  const [commandsLoadingIds,setCommandsLoadingIds]=useState<Set<string>>(new Set());
  const gatewayClients=useRef(new Map<string,{client:GatewayClient;ready:Promise<string>}>());
  const reserveGatewaySlot=()=>{
    // Keep one native slot spare; retain durable IDs so evicted idle sessions can resume.
    if(gatewayClients.current.size<7)return Promise.resolve();
    const idle=[...gatewayClients.current].find(([id])=>!id.startsWith('probe:')&&!activeRequests.current.has(id)&&!pendingCommands.current.has(id)&&!pendingCatalogs.current.has(id));
    if(!idle)throw new Error(translate("All Agent connections are in use. Wait for active work to finish.", "Batas koneksi Agent sedang digunakan. Tunggu pekerjaan aktif selesai."));
    gatewayClients.current.delete(idle[0]);
    return idle[1].client.close();
  };
  const closeGateways=useCallback(async()=>{
    const clients=[...gatewayClients.current.values()];gatewayClients.current.clear();
    await Promise.allSettled(clients.map(({client})=>client.close()));
  },[]);
  useEffect(()=>()=>{transitionVersion.current++;void closeGateways();},[closeGateways]);

  const canInteract=useCallback(()=>{
    if(transition.current || (!preview && !vault.current)) {
      setError(transition.current ? translate("Wait for saving, locking, or updating to finish.", "Tunggu proses penyimpanan, penguncian, atau pembaruan selesai.") : translate("Unlock the vault to continue.", "Buka brankas sebelum melanjutkan."));
      return false;
    }
    return true;
  },[preview]);

  const persist=useCallback(async()=>{
    if(saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current=null;
    if(vault.current) {
      try { await vault.current.write(stateRef.current); setSaveError(null); }
      catch { setSaveError(translate("Changes have not been saved. Check device storage before closing Warren.", "Perubahan belum tersimpan. Periksa ruang penyimpanan sebelum menutup aplikasi.")); throw new Error(translate("Could not save the vault.", "Penyimpanan brankas gagal.")); }
    }
  },[]);

  const commit=useCallback((fn:(s:SavedState)=>SavedState)=>{
    if(!canInteract())return stateRef.current;
    const next=fn(stateRef.current); stateRef.current=next; setState(next);
    if(saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>{void persist().catch(()=>{});},350);
    return next;
  },[persist,canInteract]);

  const closeDesktop=useCallback(async()=>{
    if(transition.current)return;
    transition.current='closing';transitionVersion.current++;setBusy(true);
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=null;
    for(const id of activeRequests.current)detachedRequests.current.add(id);
    // A saved unknown result remains unknown if closing fails after events were ignored.
    const interruption=translate("The window closed before the result was confirmed. Hermes may still be working; nothing was cancelled or resent.", "Jendela ditutup sebelum hasil dikonfirmasi. Hermes mungkin masih berjalan; tidak ada pembatalan atau pengiriman ulang.");
    const snapshot:SavedState={...stateRef.current,conversations:stateRef.current.conversations.map(c=>({...c,gatewayStateUncertain:c.gatewayStateUncertain||c.commandResults?.some(r=>(r.status==='pending'||r.status==='unknown')&&['model','compact'].includes(parseSlashCommand(r.command)?.name??'')),commandResults:sanitizeCommandResults(c.commandResults,interruption),executionLog:interruptExecutionLog(c,interruption),messages:c.messages.map(m=>
      m.role==='assistant'&&m.status==='streaming' ? {...m,status:'unknown',error:interruption} : m
    )}))};
    stateRef.current=snapshot;setState(snapshot);setToolActivity({});
    try {
      await persist();
      await closeGateways();
      await native.destroyWindow();
    } catch(e) {
      transition.current=null;setBusy(false);
      setError(`${translate("The window remains open because it could not be closed safely.", "Jendela tetap terbuka karena belum dapat ditutup dengan aman.")} ${errorText(e)}`);
    }
  },[persist,closeGateways]);

  useEffect(()=>{
    let disposed=false;let unlisten:(()=>void)|undefined;
    void native.onDesktopClose(closeDesktop).then(stop=>{if(disposed)stop();else unlisten=stop;})
      .catch(e=>{if(!disposed)setError(`${translate("Saving before closing the window could not be enabled.", "Penyimpanan sebelum menutup jendela tidak dapat diaktifkan.")} ${errorText(e)}`);});
    return()=>{disposed=true;unlisten?.();};
  },[closeDesktop]);

  useEffect(()=>{
    const flush=()=>{ if(!transition.current && document.visibilityState==='hidden') void persist().catch(()=>{}); };
    document.addEventListener('visibilitychange',flush);
    return ()=>{ document.removeEventListener('visibilitychange',flush); if(saveTimer.current) clearTimeout(saveTimer.current); };
  },[persist]);

  const unlock=async(password:string)=>{
    if(transition.current) return; transition.current='unlocking';transitionVersion.current++;setBusy(true); setError(null);
    try {
      const opened=await WorkspaceVault.open(password);vault.current=opened.vault;
      const chats=opened.state.conversations.filter(c=>opened.state.hermes.some(p=>p.id===c.profileId));
      const selected=chats.find(c=>c.id===opened.state.activeConversationId)??[...chats].sort((a,b)=>b.createdAt-a.createdAt)[0];
      const restored={...opened.state,activeConversationId:selected?.id};
      stateRef.current=restored;setState(restored);setActiveConversationId(selected?.id??null);setReady(true);
    }
    catch(e){setError(errorText(e));} finally {transition.current=null;setBusy(false);}
  };

  const updateSession=useCallback((id:string,patch:Partial<TerminalSession>)=>{
    const current=liveSessions.current.get(id); if(!current)return;
    liveSessions.current.set(id,{...current,...patch}); setSessions([...liveSessions.current.values()]);
  },[]);

  const closeSession=useCallback(async(id:string)=>{
    if(!canInteract())return;
    try { if(!preview) await native.disconnectSsh(id); }
    catch(e){setError(errorText(e));return;}
    liveSessions.current.delete(id); buffers.current.delete(id);
    setSessions([...liveSessions.current.values()]);
    setActiveSessionId(current=>current===id ? [...liveSessions.current.keys()].at(-1)??null : current);
  },[preview,canInteract]);

  const lock=async()=>{
    if(!canInteract())return;
    if(activeRequests.current.size || pendingCommands.current.size || pendingCatalogs.current.size) {setError(translate("Wait for the Hermes response or command to finish before locking. Closing this view does not cancel work on the server.", "Tunggu respons atau perintah Hermes selesai sebelum mengunci. Menutup tampilan tidak membatalkan tugas di server."));return;}
    transition.current='locking';transitionVersion.current++;setBusy(true);
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=null;
    try {
      for(const id of liveSessions.current.keys()) await native.disconnectSsh(id);
      await persist(); await closeGateways(); await vault.current?.close(); vault.current=null;
      liveSessions.current.clear(); buffers.current.clear(); setSessions([]); setActiveSessionId(null); setActiveConversationId(null); setHostPrompt(null);
      const blank=emptyState();stateRef.current=blank;setState(blank);setReady(false);
      setCommandCatalog({});setCommandBusyIds(new Set());setCommandsLoadingIds(new Set());
    } catch(e){setError(errorText(e));} finally {transition.current=null;setBusy(false);}
  };

  const runUpdateInstallation=useCallback(async <T,>(install:()=>Promise<T>):Promise<T>=>{
    if(!canInteract())throw new Error(translate("Wait for other work to finish and unlock the vault before installing an update.", "Tunggu proses lain selesai dan buka brankas sebelum memasang update."));
    if(preview)throw new Error(translate("Install updates from the Windows or Android app.", "Pemasangan update tersedia di aplikasi native."));
    if(activeRequests.current.size || pendingCommands.current.size || pendingCatalogs.current.size)throw new Error(translate("Wait for Hermes to finish before installing an update.", "Tunggu pekerjaan Hermes selesai sebelum memasang update."));
    if([...liveSessions.current.values()].some(s=>s.status==='connected'||s.status==='connecting'))throw new Error(translate("Close active SSH sessions before installing an update.", "Tutup sesi SSH aktif sebelum memasang update."));
    // Set before awaiting persistence: no new work may start between save and install.
    transition.current='updating';transitionVersion.current++;setBusy(true);setHostPrompt(null);
    try {
      await persist();
      await closeGateways();
      return await install();
    } finally {
      // Android permission/installer dialogs return; Windows normally exits during installation.
      transition.current=null;setBusy(false);
    }
  },[canInteract,persist,preview,closeGateways]);

  const saveVps=(profile:VpsProfile)=>{
    if(!canInteract())return;
    validateVps(profile);
    const previous=stateRef.current.vps.find(p=>p.id===profile.id);
    const changedHost=previous && (previous.host!==profile.host || previous.port!==profile.port);
    const clean={...profile,name:profile.name.trim(),host:profile.host.trim(),username:profile.username.trim(),fingerprint:changedHost?undefined:previous?.fingerprint??profile.fingerprint};
    commit(s=>({...s,vps:[...s.vps.filter(p=>p.id!==profile.id),clean]}));
  };
  const deleteVps=(id:string)=>{
    if(!canInteract())return;
    if([...liveSessions.current.values()].some(s=>s.profileId===id && ['connected','connecting'].includes(s.status))) throw new Error(translate("Close this VPS session before deleting its connection.", "Tutup sesi VPS ini sebelum menghapus profil."));
    commit(s=>({...s,vps:s.vps.filter(p=>p.id!==id)}));
  };
  const saveHermes=(profile:HermesProfile)=>{
    if(!canInteract())return;
    if(!profile.name.trim() || (profile.transport!=='gateway'&&!profile.model.trim())) throw new Error(translate("Enter an Agent name and an API model.", "Nama Agent dan model API wajib diisi."));
    if(profile.agentProfile?.trim()&&!normalizeAgentProfileName(profile.agentProfile))throw new Error(translate('Use a profile name of up to 80 characters, without paths or control characters.', 'Gunakan nama profil maksimal 80 karakter, tanpa path atau karakter kontrol.'));
    if(stateRef.current.conversations.some(c=>c.profileId===profile.id&&(activeRequests.current.has(c.id)||pendingCommands.current.has(c.id)||pendingCatalogs.current.has(c.id))))throw new Error(translate("Wait for the Agent to finish before changing this connection.", "Tunggu pekerjaan Agent selesai sebelum mengubah koneksi."));
    const url=profile.transport==='gateway'?normalizeGatewayUrl(profile.url):normalizeHermesUrl(profile.url);
    const old=stateRef.current.hermes.find(p=>p.id===profile.id);
    const changed=!!old && (old.url!==url || (old.transport??'openai')!==(profile.transport??'openai'));
    const clean={...profile,id:changed?crypto.randomUUID():profile.id,url,name:profile.name.trim(),model:profile.model.trim(),agentProfile:normalizeAgentProfileName(profile.agentProfile)};
    commit(s=>({...s,hermes:[...s.hermes.filter(p=>p.id!==clean.id),clean],conversations:old&&!changed&&old.token!==clean.token?s.conversations.map(c=>c.profileId===clean.id?{...c,agentProfile:undefined}:c):s.conversations}));
    if(old&&!changed)for(const c of stateRef.current.conversations.filter(c=>c.profileId===profile.id)){
      const cached=gatewayClients.current.get(c.id);gatewayClients.current.delete(c.id);void cached?.client.close();
      setCommandCatalog(current=>{const next={...current};delete next[c.id];return next;});
    }
  };
  const deleteHermes=(id:string)=>{
    if(!canInteract())return;
    if(stateRef.current.conversations.some(c=>c.profileId===id && (activeRequests.current.has(c.id)||pendingCommands.current.has(c.id)||pendingCatalogs.current.has(c.id)))) throw new Error(translate("Wait for Hermes to finish before deleting this connection.", "Tunggu pekerjaan Hermes selesai sebelum menghapus profil."));
    for(const c of stateRef.current.conversations.filter(c=>c.profileId===id)){const cached=gatewayClients.current.get(c.id);gatewayClients.current.delete(c.id);void cached?.client.close();}
    commit(s=>({...s,hermes:s.hermes.filter(p=>p.id!==id)}));
  };

  const startSsh=async(profile:VpsProfile)=>{
    if(!canInteract())return;
    const id=crypto.randomUUID();
    const session:TerminalSession={id,profileId:profile.id,label:profile.name,host:`${profile.username}@${profile.host}:${profile.port}`,status:'connecting'};
    liveSessions.current.set(id,session);buffers.current.set(id,{chunks:[],size:0});setSessions([...liveSessions.current.values()]);setActiveSessionId(id);
    try {
      await native.connectSsh({sessionId:id,host:profile.host,port:profile.port,username:profile.username,auth:profile.auth,password:profile.password,privateKey:profile.privateKey,passphrase:profile.passphrase,fingerprint:profile.fingerprint!,cols:100,rows:30},event=>{
        if(!liveSessions.current.has(id))return;
        if(event.type==='status') updateSession(id,{status:event.status,error:event.message});
        else {
          const b=buffers.current.get(id);if(!b)return;
          const bytes=new Uint8Array(event.data);
          if(b.listener)b.listener(bytes);
          else { b.chunks.push(bytes);b.size+=bytes.byteLength;while(b.size>MAX_PENDING_BYTES&&b.chunks.length>1)b.size-=b.chunks.shift()!.byteLength; }
        }
      });
    } catch(e){updateSession(id,{status:'error',error:errorText(e)});}
  };
  const connectVps=async(profileId:string)=>{
    if(!canInteract())return;
    if(preview){setError(translate("Open Warren on Windows or Android to connect through SSH.", "Jalankan aplikasi Tauri untuk membuka koneksi SSH."));return;}
    const version=transitionVersion.current;
    const profile=stateRef.current.vps.find(p=>p.id===profileId);if(!profile)return;
    try {
      validateVps(profile);
      if(!profile.fingerprint){ setBusy(true);const fingerprint=await native.probeSsh(profile.host,profile.port);if(version===transitionVersion.current && canInteract())setHostPrompt({profileId,fingerprint,host:`${profile.host}:${profile.port}`}); }
      else await startSsh(profile);
    } catch(e){if(version===transitionVersion.current)setError(errorText(e));} finally{if(!transition.current)setBusy(false);}
  };
  const acceptHost=async()=>{
    if(!canInteract())return;
    if(!hostPrompt)return;
    const version=transitionVersion.current;
    const pending=hostPrompt;setHostPrompt(null);
    const profile=stateRef.current.vps.find(p=>p.id===pending.profileId);
    if(!profile || `${profile.host}:${profile.port}`!==pending.host){setError(translate("The connection changed during host verification. Connect again.", "Profil berubah saat pemeriksaan host. Hubungkan kembali."));return;}
    const trusted={...profile,fingerprint:pending.fingerprint};
    commit(s=>({...s,vps:s.vps.map(p=>p.id===profile.id?trusted:p)}));
    try{await persist();if(version===transitionVersion.current)await startSsh(trusted);}catch(e){if(version===transitionVersion.current)setError(errorText(e));}
  };
  const subscribeTerminal=useCallback((id:string,listener:(bytes:Uint8Array)=>void)=>{
    const b=buffers.current.get(id);if(!b)return()=>{};
    b.listener=listener;for(const chunk of b.chunks)listener(chunk);b.chunks=[];b.size=0;
    return()=>{if(b.listener===listener)b.listener=undefined;};
  },[]);
  const writeTerminal=useCallback(async(id:string,data:string)=>{
    if(!canInteract())return;
    if(liveSessions.current.get(id)?.status!=='connected')return;
    try{await native.writeSsh(id,data);}catch(e){updateSession(id,{error:errorText(e)});}
  },[updateSession,canInteract]);
  const resizeTerminal=useCallback(async(id:string,cols:number,rows:number)=>{
    if(!canInteract())return;
    if(liveSessions.current.get(id)?.status!=='connected')return;
    try{await native.resizeSsh(id,cols,rows);}catch(e){updateSession(id,{error:errorText(e)});}
  },[updateSession,canInteract]);

  const createConversation=(profileId:string)=>{
    if(!canInteract())return '';
    if(!stateRef.current.hermes.some(p=>p.id===profileId))throw new Error(translate("Choose an Agent connection first.", "Pilih profil Hermes terlebih dahulu."));
    const id=`${stateRef.current.deviceId}:${crypto.randomUUID()}`;
    const c:Conversation={id,profileId,title:translate("New conversation", "Percakapan baru"),draft:'',createdAt:Date.now(),messages:[]};
    commit(s=>({...s,conversations:[c,...s.conversations],activeConversationId:id}));setActiveConversationId(id);return id;
  };
  const selectConversation=(id:string|null)=>{
    if(!canInteract())return;
    if(id&&!stateRef.current.conversations.some(c=>c.id===id))return;
    commit(s=>({...s,activeConversationId:id??undefined}));setActiveConversationId(id);
  };
  const openConversation=(profileId:string)=>{
    if(!canInteract())return '';
    const candidates=stateRef.current.conversations.filter(c=>c.profileId===profileId);
    const current=candidates.find(c=>c.id===stateRef.current.activeConversationId)??[...candidates].sort((a,b)=>b.createdAt-a.createdAt)[0];
    if(current){selectConversation(current.id);return current.id;}
    return createConversation(profileId);
  };
  const updateConversation=(id:string,fn:(c:Conversation)=>Conversation)=>commit(s=>({...s,conversations:s.conversations.map(c=>c.id===id?fn(c):c)}));
  const deleteConversation=(id:string)=>{
    if(!canInteract())return;
    if(activeRequests.current.has(id)||pendingCommands.current.has(id)||pendingCatalogs.current.has(id))throw new Error(translate("Wait for the response or command to finish before deleting this conversation.", "Tunggu respons atau perintah selesai sebelum menghapus percakapan."));
    const cached=gatewayClients.current.get(id);gatewayClients.current.delete(id);void cached?.client.close();
    commit(s=>({...s,conversations:s.conversations.filter(c=>c.id!==id),activeConversationId:s.activeConversationId===id?undefined:s.activeConversationId}));
    setActiveConversationId(current=>current===id?null:current);
  };
  const gatewaySession=async(id:string)=>{
    const existing=gatewayClients.current.get(id);
    if(existing&&!existing.client.isClosed())return {client:existing.client,sessionId:await existing.ready};
    if(existing)gatewayClients.current.delete(id);
    const previousClose=existing?.client.close().catch(()=>{});
    const conversation=stateRef.current.conversations.find(c=>c.id===id);
    const profile=stateRef.current.hermes.find(p=>p.id===conversation?.profileId);
    if(!conversation||!profile||profile.transport!=='gateway')throw new Error(translate("This conversation requires a Gateway connection.", "Percakapan ini memerlukan koneksi Gateway."));
    const version=transitionVersion.current;
    const slot=reserveGatewaySlot();
    const client=new GatewayClient(profile,(sessionId,agentProfile)=>{
      if(version!==transitionVersion.current||transition.current||gatewayClients.current.get(id)?.client!==client)return;
      updateConversation(id,c=>c.gatewaySessionId===sessionId?{...c,agentProfile}:c);
    });
    const ready=(async()=>{
      try {
        await Promise.all([slot,previousClose]);
        if(version!==transitionVersion.current)throw new Error(translate("The workspace has changed.", "Ruang kerja telah berubah."));
        await client.connect();
        if(version!==transitionVersion.current)throw new Error(translate("The workspace has changed. Connect again manually.", "Ruang kerja telah berubah. Hubungkan kembali secara manual."));
        const session=await client.ensureSession(conversation.gatewaySessionId);
        if(version!==transitionVersion.current)throw new Error(translate("The workspace has changed. Connect again manually.", "Ruang kerja telah berubah. Hubungkan kembali secara manual."));
        updateConversation(id,c=>({...c,gatewaySessionId:session.sessionId,agentProfile:client.getSessionProfile(session.sessionId)}));
        await persist(); // The server session identity must survive before any prompt or command.
        if(version!==transitionVersion.current)throw new Error(translate("The workspace has changed.", "Ruang kerja telah berubah."));
        return session.sessionId;
      }catch(cause){if(gatewayClients.current.get(id)?.client===client)gatewayClients.current.delete(id);await client.close().catch(()=>{});throw cause;}
    })();
    gatewayClients.current.set(id,{client,ready});
    return {client,sessionId:await ready};
  };
  const loadCommands=async(id:string)=>{
    if(!canInteract())return;
    const existing=pendingCatalogs.current.get(id);if(existing)return existing;
    const conversation=stateRef.current.conversations.find(c=>c.id===id);
    const profile=stateRef.current.hermes.find(p=>p.id===conversation?.profileId);
    if(!profile || preview || profile.transport!=='gateway') {setCommandCatalog(current=>({...current,[id]:basicSlashCommands()}));return;}
    const version=transitionVersion.current;
    const loading=(async()=>{
      try {
        const {client,sessionId}=await gatewaySession(id);
        const commands=await client.catalog(sessionId);
        if(version===transitionVersion.current)setCommandCatalog(current=>({...current,[id]:commands}));
      }finally{pendingCatalogs.current.delete(id);setCommandsLoadingIds(new Set(pendingCatalogs.current.keys()));}
    })();
    pendingCatalogs.current.set(id,loading);setCommandsLoadingIds(new Set(pendingCatalogs.current.keys()));
    return loading;
  };
  const runCommand=async(id:string,text:string)=>{
    if(!canInteract())return;
    if(preview){setError(translate("Open Warren on Windows or Android to use Agent commands.", "Jalankan aplikasi Tauri untuk menggunakan perintah Agent."));return;}
    if(pendingCommands.current.has(id))return;
    const conversation=stateRef.current.conversations.find(c=>c.id===id);if(!conversation)return;
    const profile=stateRef.current.hermes.find(p=>p.id===conversation.profileId);
    if(!profile){setError(translate("This conversation’s connection has been deleted.", "Koneksi percakapan sudah dihapus."));return;}
    const parsed=parseSlashCommand(text);
    const base=basicSlashCommands().find(c=>c.name===parsed?.name);
    if(activeRequests.current.has(id)&&!base?.allowWhileRunning){setError(translate("Wait for the Agent to finish before running this command.", "Tunggu pekerjaan Agent selesai sebelum menjalankan perintah ini."));return;}
    const version=transitionVersion.current;
    const resultId=crypto.randomUUID();
    const entry:CommandResult={id:resultId,command:text.slice(0,500),content:translate("Running command…", "Menjalankan perintah…"),createdAt:Date.now(),status:'pending'};
    pendingCommands.current.add(id);setCommandBusyIds(new Set(pendingCommands.current));
    updateConversation(id,c=>({...c,draft:c.draft.trim()===text.trim()?'':c.draft,commandResults:sanitizeCommandResults([...(c.commandResults??[]),entry])}));
    const complete=(status:CommandResult['status'],content:string)=>{
      if(version!==transitionVersion.current)return;
      updateConversation(id,c=>({...c,gatewayStateUncertain:c.gatewayStateUncertain||(status==='unknown'&&['model','compact'].includes(parsed?.name??'')),commandResults:sanitizeCommandResults((c.commandResults??[]).map(item=>item.id===resultId?{...item,status,content}:item))}));
    };
    try {
      await persist();
      if(version!==transitionVersion.current)return;
      if(!parsed||!base)throw new Error(translate("Warren does not support this command yet. Type /help for the list. Use // to send text starting with /.", "Perintah belum didukung Warren. Ketik /help untuk melihat daftar. Gunakan // untuk teks berawalan /."));
      if(parsed.name==='help') {
        if(parsed.args)throw new Error(translate("Use /help without arguments.", "Gunakan /help tanpa argumen."));
        complete('complete',formatCommandHelp(commandCatalog[id]??basicSlashCommands()));
      } else if(parsed.name==='new') {
        const newId=createConversation(profile.id);
        if(parsed.args)updateConversation(newId,c=>({...c,title:parsed.args.slice(0,80)}));
        complete('complete',translate("New conversation created. Your previous history is still saved.", "Percakapan baru dibuat. Riwayat sebelumnya tetap tersimpan."));
      } else {
        if(profile.transport!=='gateway')throw new Error(translate("This command requires a Hermes Gateway connection. Chat API endpoints do not run slash commands.", "Perintah ini memerlukan koneksi Gateway Hermes. Endpoint chat API tidak menjalankan slash command."));
        if(['model','compact'].includes(parsed.name)&&(conversation.gatewayStateUncertain||conversation.commandResults?.some(r=>r.status==='unknown'&&['model','compact'].includes(parseSlashCommand(r.command)?.name??''))))throw new Error(translate("The previous command’s result is unknown. Check Hermes and start a new conversation before changing this session.", "Hasil perintah sebelumnya belum diketahui. Periksa Hermes dan mulai percakapan baru sebelum mengubah sesi."));
        const {client,sessionId}=await gatewaySession(id);
        const commands=await client.catalog(sessionId);
        if(version!==transitionVersion.current)return;
        setCommandCatalog(current=>({...current,[id]:commands}));
        const command=commands.find(c=>c.name.replace(/^\//,'')===parsed.name);
        if(!command?.available)throw new Error(command?.reason??translate("The Gateway does not support this command.", "Gateway tidak mendukung perintah ini."));
        complete('complete',await client.command(sessionId,`/${parsed.name}${parsed.args?` ${parsed.args}`:''}`));
      }
    }catch(cause){complete(!!cause&&typeof cause==='object'&&'uncertain' in cause&&cause.uncertain?'unknown':'error',errorText(cause));}
    finally{pendingCommands.current.delete(id);setCommandBusyIds(new Set(pendingCommands.current));if(version===transitionVersion.current)await persist().catch(()=>{});}
  };
  const sendMessage=async(id:string)=>{
    if(!canInteract())return;
    if(preview){setError(translate("Open Warren on Windows or Android to send messages to Hermes.", "Hubungkan melalui aplikasi Tauri untuk mengirim ke Hermes."));return;}
    const c=stateRef.current.conversations.find(c=>c.id===id);if(!c||!c.draft.trim())return;
    if(c.draft.trim().startsWith('/')&&!c.draft.trim().startsWith('//'))return runCommand(id,c.draft.trim());
    if(activeRequests.current.has(id)||pendingCommands.current.has(id))return;
    const profile=stateRef.current.hermes.find(p=>p.id===c.profileId);if(!profile){setError(translate("The Agent connection has been deleted. This conversation is archived.", "Profil Hermes sudah dihapus. Percakapan ini merupakan arsip."));return;}
    if(c.messages.some(m=>m.status==='unknown')){setError(translate("A task in this conversation has an unknown result. Check Hermes, then start a new conversation to avoid resending the task.", "Percakapan memiliki tugas dengan hasil belum diketahui. Periksa Hermes lalu mulai percakapan baru agar tugas tidak dikirim ulang."));return;}
    if(c.gatewayStateUncertain||c.commandResults?.some(r=>r.status==='unknown'&&['model','compact'].includes(parseSlashCommand(r.command)?.name??''))){setError(translate("A session change has an unknown result. Check Hermes, then start a new conversation.", "Status perubahan sesi belum diketahui. Periksa Hermes lalu mulai percakapan baru."));return;}
    const draft=c.draft.trim();const text=draft.startsWith('//')?draft.slice(1):draft;const requestId=crypto.randomUUID();const assistantId=crypto.randomUUID();let receivedTerminal=false;let dispatched=false;let receivedResponse=false;
    const user:Message={id:crypto.randomUUID(),role:'user',content:text,createdAt:Date.now(),status:'sent'};
    const assistant:Message={id:assistantId,role:'assistant',content:'',createdAt:Date.now(),status:'streaming',requestId,agentProfile:normalizeAgentProfileName(profile.transport==='gateway'?c.agentProfile??profile.agentProfile:profile.agentProfile)};
    activeRequests.current.add(id);setStreamingIds(new Set(activeRequests.current));
    const next=updateConversation(id,current=>({...current,draft:'',title:current.messages.length?current.title:text.slice(0,45),messages:[...current.messages,user,assistant],executionLog:appendExecutionLog(current.executionLog,requestId,'request',translate("Request started.", "Permintaan dimulai."))}));
    const updateMessage=(patch:Partial<Message>,append?:string,log?:{kind:ExecutionLogEntry['kind'];text:string})=>updateConversation(id,current=>({...current,
      messages:current.messages.map(m=>m.id===assistantId?{...m,...patch,content:append===undefined?(patch.content??m.content):m.content+append}:m),
      executionLog:log?appendExecutionLog(current.executionLog,requestId,log.kind,log.text):current.executionLog,
    }));
    const finish=(status:'complete'|'error'|'unknown',message?:string)=>{
      if(receivedTerminal)return;
      receivedTerminal=true;
      updateMessage({status,...(message?{error:message}:{})},undefined,{kind:status,text:message??translate("Hermes response complete.", "Respons Hermes selesai diterima.")});
    };
    try {
      await persist(); // Persist request identity before any network admission.
      if(transition.current || detachedRequests.current.has(id))return;
      const onEvent=(event:HermesEvent)=>{
        if(transition.current==='closing' || detachedRequests.current.has(id) || receivedTerminal)return;
        if('agentProfile' in event)updateMessage({agentProfile:normalizeAgentProfileName(event.agentProfile)??normalizeAgentProfileName(profile.agentProfile)});
        if(event.type==='delta') {
          const firstResponse=!receivedResponse&&!!event.text;
          receivedResponse=receivedResponse||!!event.text;
          updateMessage({},event.text,firstResponse?{kind:'response',text:translate("Receiving Hermes response.", "Respons Hermes mulai diterima.")}:undefined);
        }
        else if(event.type==='replace')updateMessage({content:event.text});
        else if(event.type==='tool') {
          setToolActivity(s=>({...s,[id]:event.text.slice(0,MAX_LOG_TEXT)}));
          updateConversation(id,current=>({...current,executionLog:appendExecutionLog(current.executionLog,requestId,'tool',event.text)}));
        }
        else if(event.type==='done')event.finishReason==='interrupted'||event.finishReason==='cancelled'?finish('error',translate("Hermes stopped the task.", "Pekerjaan dihentikan oleh Hermes.")):finish('complete');
        else finish(event.uncertain?'unknown':'error',event.message);
      };
      if(profile.transport==='gateway'){
        const {client,sessionId}=await gatewaySession(id);
        if(transition.current||detachedRequests.current.has(id))return;
        const confirmedProfile=client.getSessionProfile(sessionId);
        updateMessage({agentProfile:confirmedProfile??normalizeAgentProfileName(profile.agentProfile)});
        dispatched=true;
        await client.send(sessionId,text,requestId,onEvent);
      }else{
        dispatched=true;
        await native.streamHermes({requestId,conversationId:id,url:profile.url,token:profile.token,model:profile.model,messages:conversationHistory(next.conversations.find(c=>c.id===id)!)},onEvent);
      }
      if(!receivedTerminal && !detachedRequests.current.has(id))finish('unknown',translate("The connection ended without a confirmed result from Hermes. The request was not resent.", "Koneksi berakhir tanpa konfirmasi hasil dari Hermes. Tidak dikirim ulang."));
    } catch(e){if(!receivedTerminal && !detachedRequests.current.has(id))finish(dispatched&&!(e&&typeof e==='object'&&'uncertain' in e&&e.uncertain===false)?'unknown':'error',profile.transport==='gateway'||dispatched?errorText(e):translate("The message was not sent because the vault could not be saved.", "Pesan tidak dikirim karena brankas belum tersimpan."));}
    finally{receivedTerminal=true;activeRequests.current.delete(id);detachedRequests.current.delete(id);setStreamingIds(new Set(activeRequests.current));setToolActivity(s=>{const n={...s};delete n[id];return n;});if(!transition.current)await persist().catch(()=>{});}
  };

  return {
    ready,preview,busy,error,saveError,state,unlock,lock,runUpdateInstallation,clearError:()=>setError(null),
    saveVps,deleteVps,saveHermes,deleteHermes,
    updateSettings:(settings:Settings)=>commit(s=>({...s,settings:{fontSize:Math.min(24,Math.max(10,settings.fontSize)),scrollback:Math.min(20000,Math.max(1000,settings.scrollback))}})),
    sessions,activeSessionId,setActiveSessionId,connectVps,closeSession,hostPrompt,acceptHost,rejectHost:()=>setHostPrompt(null),
    subscribeTerminal,writeTerminal,resizeTerminal,
    activeConversationId,setActiveConversationId:selectConversation,createConversation,openConversation,deleteConversation,
    renameConversation:(id:string,title:string)=>{if(title.trim())updateConversation(id,c=>({...c,title:title.trim().slice(0,80)}));},
    setDraft:(id:string,text:string)=>updateConversation(id,c=>({...c,draft:text})),
    sendMessage,streamingIds,toolActivity,runCommand,loadCommands,commandBusyIds,commandCatalog,commandsLoadingIds,
    testHermes:async(profileId:string)=>{
      if(!canInteract())throw new Error(translate("Wait for saving or locking to finish.", "Tunggu proses penyimpanan atau penguncian selesai."));
      const p=stateRef.current.hermes.find(p=>p.id===profileId);if(!p)throw new Error(translate("Connection not found.", "Profil tidak ditemukan."));
      if(p.transport==='gateway'){
        const slot=reserveGatewaySlot();const version=transitionVersion.current;
        const client=new GatewayClient(p);const key=`probe:${crypto.randomUUID()}`;
        const ready=slot.then(()=>{if(version!==transitionVersion.current)throw new Error(translate("The workspace has changed.", "Ruang kerja telah berubah."));return client.connect();}).then(()=>'');gatewayClients.current.set(key,{client,ready});
        try{await ready;return translate("Gateway connected with a compatible session protocol.", "Gateway terhubung dan protokol sesi kompatibel.");}
        finally{gatewayClients.current.delete(key);await client.close().catch(()=>{});}
      }
      const r=await native.probeHermes(p.url,p.token);return r.detail;
    },
  };
}
