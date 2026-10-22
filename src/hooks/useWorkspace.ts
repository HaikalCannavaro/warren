import { useCallback, useEffect, useRef, useState } from 'react';
import type { Conversation, HermesProfile, Message, SavedState, Settings, TerminalSession, VpsProfile } from '../types';
import { conversationHistory, emptyState, errorText, normalizeHermesUrl, validateVps } from '../lib/domain';
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

  const canInteract=useCallback(()=>{
    if(transition.current || (!preview && !vault.current)) {
      setError(transition.current ? 'Tunggu proses penyimpanan, penguncian, atau pembaruan selesai.' : 'Buka brankas sebelum melanjutkan.');
      return false;
    }
    return true;
  },[preview]);

  const persist=useCallback(async()=>{
    if(saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current=null;
    if(vault.current) {
      try { await vault.current.write(stateRef.current); setSaveError(null); }
      catch { setSaveError('Perubahan belum tersimpan. Periksa ruang penyimpanan sebelum menutup aplikasi.'); throw new Error('Penyimpanan brankas gagal.'); }
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
    const snapshot:SavedState={...stateRef.current,conversations:stateRef.current.conversations.map(c=>({...c,messages:c.messages.map(m=>
      m.role==='assistant'&&m.status==='streaming' ? {...m,status:'unknown',error:'Jendela ditutup sebelum hasil dikonfirmasi. Hermes mungkin masih berjalan; tidak ada pembatalan atau pengiriman ulang.'} : m
    )}))};
    stateRef.current=snapshot;setState(snapshot);setToolActivity({});
    try {
      await persist();
      await native.destroyWindow();
    } catch(e) {
      transition.current=null;setBusy(false);
      setError(`Jendela tetap terbuka karena belum dapat ditutup dengan aman. ${errorText(e)}`);
    }
  },[persist]);

  useEffect(()=>{
    let disposed=false;let unlisten:(()=>void)|undefined;
    void native.onDesktopClose(closeDesktop).then(stop=>{if(disposed)stop();else unlisten=stop;})
      .catch(e=>{if(!disposed)setError(`Penyimpanan sebelum menutup jendela tidak dapat diaktifkan. ${errorText(e)}`);});
    return()=>{disposed=true;unlisten?.();};
  },[closeDesktop]);

  useEffect(()=>{
    const flush=()=>{ if(!transition.current && document.visibilityState==='hidden') void persist().catch(()=>{}); };
    document.addEventListener('visibilitychange',flush);
    return ()=>{ document.removeEventListener('visibilitychange',flush); if(saveTimer.current) clearTimeout(saveTimer.current); };
  },[persist]);

  const unlock=async(password:string)=>{
    if(transition.current) return; transition.current='unlocking';transitionVersion.current++;setBusy(true); setError(null);
    try { const opened=await WorkspaceVault.open(password); vault.current=opened.vault; stateRef.current=opened.state; setState(opened.state); setReady(true); }
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
    if(activeRequests.current.size) {setError('Tunggu respons Hermes selesai sebelum mengunci. Menutup tampilan tidak membatalkan tugas di server.');return;}
    transition.current='locking';transitionVersion.current++;setBusy(true);
    if(saveTimer.current)clearTimeout(saveTimer.current);
    saveTimer.current=null;
    try {
      for(const id of liveSessions.current.keys()) await native.disconnectSsh(id);
      await persist(); await vault.current?.close(); vault.current=null;
      liveSessions.current.clear(); buffers.current.clear(); setSessions([]); setActiveSessionId(null); setActiveConversationId(null); setHostPrompt(null);
      const blank=emptyState();stateRef.current=blank;setState(blank);setReady(false);
    } catch(e){setError(errorText(e));} finally {transition.current=null;setBusy(false);}
  };

  const runUpdateInstallation=useCallback(async <T,>(install:()=>Promise<T>):Promise<T>=>{
    if(!canInteract())throw new Error('Tunggu proses lain selesai dan buka brankas sebelum memasang update.');
    if(preview)throw new Error('Pemasangan update tersedia di aplikasi native.');
    if(activeRequests.current.size)throw new Error('Tunggu pekerjaan Hermes selesai sebelum memasang update.');
    if([...liveSessions.current.values()].some(s=>s.status==='connected'||s.status==='connecting'))throw new Error('Tutup sesi SSH aktif sebelum memasang update.');
    // Set before awaiting persistence: no new work may start between save and install.
    transition.current='updating';transitionVersion.current++;setBusy(true);setHostPrompt(null);
    try {
      await persist();
      return await install();
    } finally {
      // Android permission/installer dialogs return; Windows normally exits during installation.
      transition.current=null;setBusy(false);
    }
  },[canInteract,persist,preview]);

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
    if([...liveSessions.current.values()].some(s=>s.profileId===id && ['connected','connecting'].includes(s.status))) throw new Error('Tutup sesi VPS ini sebelum menghapus profil.');
    commit(s=>({...s,vps:s.vps.filter(p=>p.id!==id)}));
  };
  const saveHermes=(profile:HermesProfile)=>{
    if(!canInteract())return;
    if(!profile.name.trim()||!profile.model.trim()) throw new Error('Nama Hermes dan model wajib diisi.');
    const url=normalizeHermesUrl(profile.url);
    const old=stateRef.current.hermes.find(p=>p.id===profile.id);
    const changed=!!old && old.url!==url;
    const clean={...profile,id:changed?crypto.randomUUID():profile.id,url,name:profile.name.trim(),model:profile.model.trim()};
    commit(s=>({...s,hermes:[...s.hermes.filter(p=>p.id!==clean.id),clean]}));
  };
  const deleteHermes=(id:string)=>{
    if(!canInteract())return;
    if(stateRef.current.conversations.some(c=>c.profileId===id && activeRequests.current.has(c.id))) throw new Error('Tunggu pekerjaan Hermes selesai sebelum menghapus profil.');
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
    if(preview){setError('Jalankan aplikasi Tauri untuk membuka koneksi SSH.');return;}
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
    if(!profile || `${profile.host}:${profile.port}`!==pending.host){setError('Profil berubah saat pemeriksaan host. Hubungkan kembali.');return;}
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
    if(!stateRef.current.hermes.some(p=>p.id===profileId))throw new Error('Pilih profil Hermes terlebih dahulu.');
    const id=`${stateRef.current.deviceId}:${crypto.randomUUID()}`;
    const c:Conversation={id,profileId,title:'Percakapan baru',draft:'',createdAt:Date.now(),messages:[]};
    commit(s=>({...s,conversations:[c,...s.conversations]}));setActiveConversationId(id);return id;
  };
  const updateConversation=(id:string,fn:(c:Conversation)=>Conversation)=>commit(s=>({...s,conversations:s.conversations.map(c=>c.id===id?fn(c):c)}));
  const deleteConversation=(id:string)=>{
    if(!canInteract())return;
    if(activeRequests.current.has(id))throw new Error('Tunggu respons selesai sebelum menghapus percakapan.');
    commit(s=>({...s,conversations:s.conversations.filter(c=>c.id!==id)}));
    setActiveConversationId(current=>current===id?null:current);
  };
  const sendMessage=async(id:string)=>{
    if(!canInteract())return;
    if(preview){setError('Hubungkan melalui aplikasi Tauri untuk mengirim ke Hermes.');return;}
    if(activeRequests.current.has(id))return;
    const c=stateRef.current.conversations.find(c=>c.id===id);if(!c||!c.draft.trim())return;
    const profile=stateRef.current.hermes.find(p=>p.id===c.profileId);if(!profile){setError('Profil Hermes sudah dihapus. Percakapan ini merupakan arsip.');return;}
    if(c.messages.some(m=>m.status==='unknown')){setError('Percakapan memiliki tugas dengan hasil belum diketahui. Periksa Hermes lalu mulai percakapan baru agar tugas tidak dikirim ulang.');return;}
    const text=c.draft.trim();const requestId=crypto.randomUUID();const assistantId=crypto.randomUUID();let receivedTerminal=false;let dispatched=false;
    const user:Message={id:crypto.randomUUID(),role:'user',content:text,createdAt:Date.now(),status:'sent'};
    const assistant:Message={id:assistantId,role:'assistant',content:'',createdAt:Date.now(),status:'streaming',requestId};
    activeRequests.current.add(id);setStreamingIds(new Set(activeRequests.current));
    const next=updateConversation(id,current=>({...current,draft:'',title:current.messages.length?current.title:text.slice(0,45),messages:[...current.messages,user,assistant]}));
    const updateMessage=(patch:Partial<Message>,append?:string)=>updateConversation(id,current=>({...current,messages:current.messages.map(m=>m.id===assistantId?{...m,...patch,content:append===undefined?m.content:m.content+append}:m)}));
    try {
      await persist(); // Persist request identity before any network admission.
      if(transition.current || detachedRequests.current.has(id))return;
      dispatched=true;
      await native.streamHermes({requestId,conversationId:id,url:profile.url,token:profile.token,model:profile.model,messages:conversationHistory(next.conversations.find(c=>c.id===id)!)},event=>{
        if(transition.current==='closing' || detachedRequests.current.has(id))return;
        if(event.type==='delta')updateMessage({},event.text);
        else if(event.type==='tool')setToolActivity(s=>({...s,[id]:event.text}));
        else if(event.type==='done'){receivedTerminal=true;updateMessage({status:'complete'});}
        else{receivedTerminal=true;updateMessage({status:event.uncertain?'unknown':'error',error:event.message});}
      });
      if(!receivedTerminal && !detachedRequests.current.has(id))updateMessage({status:'unknown',error:'Koneksi berakhir tanpa konfirmasi hasil dari Hermes. Tidak dikirim ulang.'});
    } catch(e){if(!receivedTerminal && !detachedRequests.current.has(id))updateMessage({status:dispatched?'unknown':'error',error:dispatched?errorText(e):'Pesan tidak dikirim karena brankas belum tersimpan.'});}
    finally{activeRequests.current.delete(id);detachedRequests.current.delete(id);setStreamingIds(new Set(activeRequests.current));setToolActivity(s=>{const n={...s};delete n[id];return n;});if(!transition.current)await persist().catch(()=>{});}
  };

  return {
    ready,preview,busy,error,saveError,state,unlock,lock,runUpdateInstallation,clearError:()=>setError(null),
    saveVps,deleteVps,saveHermes,deleteHermes,
    updateSettings:(settings:Settings)=>commit(s=>({...s,settings:{fontSize:Math.min(24,Math.max(10,settings.fontSize)),scrollback:Math.min(20000,Math.max(1000,settings.scrollback))}})),
    sessions,activeSessionId,setActiveSessionId,connectVps,closeSession,hostPrompt,acceptHost,rejectHost:()=>setHostPrompt(null),
    subscribeTerminal,writeTerminal,resizeTerminal,
    activeConversationId,setActiveConversationId,createConversation,deleteConversation,
    renameConversation:(id:string,title:string)=>{if(title.trim())updateConversation(id,c=>({...c,title:title.trim().slice(0,80)}));},
    setDraft:(id:string,text:string)=>updateConversation(id,c=>({...c,draft:text})),
    sendMessage,streamingIds,toolActivity,
    testHermes:async(profileId:string)=>{if(!canInteract())throw new Error('Tunggu proses penyimpanan atau penguncian selesai.');const p=stateRef.current.hermes.find(p=>p.id===profileId);if(!p)throw new Error('Profil tidak ditemukan.');const r=await native.probeHermes(p.url,p.token);return r.detail;},
  };
}
