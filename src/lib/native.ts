import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { HermesCapabilities, HermesEvent, HermesRequest, SshEvent, SshRequest } from '../types';

export const nativeAvailable = () => isTauri();
export async function onDesktopClose(handler:()=>Promise<void>):Promise<()=>void> {
  if (!nativeAvailable() || /Android/i.test(navigator.userAgent)) return ()=>{};
  return getCurrentWindow().onCloseRequested(async event=>{
    event.preventDefault();
    await handler();
  });
}
export async function destroyWindow():Promise<void> {
  requireNative(); await getCurrentWindow().destroy();
}
function requireNative() {
  if (!nativeAvailable()) throw new Error('Koneksi asli tersedia di aplikasi Tauri. Browser ini hanya pratinjau tampilan.');
}
export async function probeSsh(host:string,port:number):Promise<string> {
  requireNative(); return invoke('ssh_probe',{host,port});
}
export async function connectSsh(request:SshRequest, handler:(event:SshEvent)=>void):Promise<void> {
  requireNative(); const onEvent=new Channel<SshEvent>(); onEvent.onmessage=handler;
  return invoke('ssh_connect',{request,onEvent});
}
export async function writeSsh(sessionId:string,data:string):Promise<void> {
  requireNative(); return invoke('ssh_write',{sessionId,data});
}
export async function resizeSsh(sessionId:string,cols:number,rows:number):Promise<void> {
  requireNative(); return invoke('ssh_resize',{sessionId,cols,rows});
}
export async function disconnectSsh(sessionId:string):Promise<void> {
  requireNative(); return invoke('ssh_disconnect',{sessionId});
}
export async function probeHermes(url:string,token:string):Promise<HermesCapabilities> {
  requireNative(); return invoke('probe_hermes',{url,token});
}
export async function streamHermes(request:HermesRequest,handler:(event:HermesEvent)=>void):Promise<void> {
  requireNative(); const onEvent=new Channel<HermesEvent>(); onEvent.onmessage=handler;
  return invoke('chat_stream',{request,onEvent});
}
