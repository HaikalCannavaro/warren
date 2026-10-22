import { Channel, invoke, isTauri } from '@tauri-apps/api/core';

export interface UpdateInfo {
  platform: 'windows' | 'android' | 'unsupported';
  configured: boolean;
  currentVersion: string;
  message: string;
}
export interface AppRelease { version: string; notes: string; publishedAt?: string; }
export interface UpdateProgress { event: 'progress'; downloaded: number; total?: number; }
export interface InstallResult { status: 'permissionRequired' | 'installerOpened' | 'relaunching'; }

function requireNative() {
  if (!isTauri()) throw new Error('Pembaruan hanya tersedia di aplikasi native Windows atau Android.');
}
export async function getUpdateInfo(): Promise<UpdateInfo> {
  requireNative();
  return invoke<UpdateInfo>('get_update_info');
}
export async function checkForUpdate(): Promise<AppRelease | null> {
  requireNative();
  return invoke<AppRelease | null>('check_for_update');
}
export async function downloadUpdate(handler: (event: UpdateProgress) => void): Promise<void> {
  requireNative();
  const onEvent = new Channel<UpdateProgress>();
  onEvent.onmessage = handler;
  await invoke('download_update', { onEvent });
}
export async function installUpdate(): Promise<InstallResult> {
  requireNative();
  return invoke<InstallResult>('install_update');
}
