import { translate } from './i18n';
import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { BiometricStatus, HermesCapabilities, HermesEvent, HermesRequest, SshEvent, SshRequest } from '../types';

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
  if (!nativeAvailable()) throw new Error(translate("Use Warren on Windows or Android to connect to your servers.", "Koneksi asli tersedia di aplikasi Tauri. Browser ini hanya pratinjau tampilan."));
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
export async function hermesHttp(url:string,token:string,path:string,method:'GET'|'POST'='GET',body?:string):Promise<string> {
  if (nativeAvailable()) {
    return invoke('hermes_http',{url,token,endpointPath:path,method,body});
  }
  const cleanBase = url.replace(/\/+$/, '');
  let fullUrl: string;
  if (path.startsWith('/')) {
    if (path === '/health') {
      fullUrl = `${cleanBase.replace(/\/v1$/, '')}/health`;
    } else {
      fullUrl = `${cleanBase.endsWith('/v1') ? cleanBase : `${cleanBase}/v1`}${path.replace(/^\/v1/, '')}`;
    }
  } else {
    fullUrl = `${cleanBase}/${path}`;
  }
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(fullUrl, { method, headers, body });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error(translate("Hermes rejected the API credentials. Check the token and profile URL.", "Hermes menolak kredensial API. Periksa token dan URL profil."));
    if (response.status === 404) throw new Error(translate("The Hermes endpoint was not found. Check the API base URL and server configuration.", "Endpoint Hermes tidak ditemukan. Periksa base URL dan konfigurasi server."));
    throw new Error(`Hermes returned HTTP ${response.status}.`);
  }
  return response.text();
}
export async function streamHermes(request:HermesRequest,handler:(event:HermesEvent)=>void):Promise<void> {
  requireNative(); const onEvent=new Channel<HermesEvent>(); onEvent.onmessage=handler;
  return invoke('chat_stream',{request,onEvent});
}

export type GatewayTransportEvent = { type: 'message'; text: string } | { type: 'closed'; message: string };
export async function connectGateway(connectionId:string,url:string,token:string,handler:(event:GatewayTransportEvent)=>void):Promise<void> {
  requireNative(); const onEvent=new Channel<GatewayTransportEvent>(); onEvent.onmessage=handler;
  return invoke('gateway_connect',{connectionId,url,token,onEvent});
}
export async function sendGateway(connectionId:string,text:string):Promise<void> {
  requireNative(); return invoke('gateway_send',{connectionId,text});
}
export async function disconnectGateway(connectionId:string):Promise<void> {
  requireNative(); return invoke('gateway_disconnect',{connectionId});
}

export async function getBiometricStatus():Promise<BiometricStatus> {
  if (!nativeAvailable()) return { available: false, enrolled: false, enabled: false };
  try {
    return await invoke<BiometricStatus>('biometric_status');
  } catch {
    return { available: false, enrolled: false, enabled: false };
  }
}
export async function enrollBiometric(password:string):Promise<boolean> {
  requireNative();
  return invoke<boolean>('biometric_enroll',{password});
}
export async function unlockWithBiometric(labels?:{title?:string;subtitle?:string;cancelText?:string}):Promise<string> {
  requireNative();
  return invoke<string>('biometric_unlock',{
    title: labels?.title ?? translate("Unlock Warren", "Buka Warren"),
    subtitle: labels?.subtitle ?? translate("Verify your fingerprint to open your workspace", "Verifikasi sidik jari untuk membuka ruang kerja"),
    cancelText: labels?.cancelText ?? translate("Use password", "Gunakan password"),
  });
}
export async function clearBiometric():Promise<boolean> {
  if (!nativeAvailable()) return false;
  return invoke<boolean>('biometric_clear');
}

export async function queryGpuSnapshot(request:SshRequest):Promise<string> {
  requireNative(); return invoke('ssh_gpu_snapshot',{request});
}
