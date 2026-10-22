import { useCallback, useEffect, useRef, useState } from 'react';
import packageInfo from '../../package.json';
import { checkForUpdate, downloadUpdate, getUpdateInfo, installUpdate, type AppRelease, type InstallResult, type UpdateInfo } from '../lib/updates';

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'permissionRequired' | 'installerOpened' | 'error' | 'latest' | 'unconfigured';
type UpdateOperation = 'metadata' | 'check' | 'download' | 'install';
interface UpdaterState {
  phase: UpdatePhase;
  info: UpdateInfo | null;
  release: AppRelease | null;
  error: string | null;
  errorStage: UpdateOperation | null;
  operation: UpdateOperation | null;
  downloaded: boolean;
  progress: { downloaded: number; total?: number } | null;
}
export type RunInstallation = (action: () => Promise<InstallResult>) => Promise<InstallResult>;
const asMessage = (error: unknown) => error instanceof Error ? error.message : typeof error === 'string' ? error : 'Pembaruan belum dapat diproses. Coba lagi secara manual.';

export function useAppUpdater({ preview, runInstall }: { preview: boolean; runInstall: RunInstallation }) {
  const [state, setState] = useState<UpdaterState>(() => ({ phase: preview ? 'unconfigured' : 'checking', info: null, release: null, error: null, errorStage: null, operation: preview ? null : 'metadata', downloaded: false, progress: null }));
  const current = useRef(state);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);
  const installation = useRef(runInstall);
  installation.current = runInstall;
  const patch = useCallback((next: Partial<UpdaterState>) => {
    current.current = { ...current.current, ...next };
    if (mounted.current) setState(current.current);
  }, []);

  useEffect(() => {
    mounted.current = true;
    const id = ++epoch.current;
    inFlight.current = !preview;
    if (preview) patch({ phase: 'unconfigured', info: null, operation: null });
    else {
      patch({ phase: 'checking', operation: 'metadata', error: null, errorStage: null });
      void getUpdateInfo().then((info) => {
        if (mounted.current && epoch.current === id) patch({ info, phase: info.configured && info.platform !== 'unsupported' ? 'idle' : 'unconfigured' });
      }).catch((error: unknown) => {
        if (mounted.current && epoch.current === id) patch({ phase: 'error', error: asMessage(error), errorStage: 'metadata' });
      }).finally(() => {
        if (mounted.current && epoch.current === id) { inFlight.current = false; patch({ operation: null }); }
      });
    }
    return () => { mounted.current = false; if (epoch.current === id) { epoch.current++; inFlight.current = false; } };
  }, [preview, patch]);

  const begin = (operation: UpdateOperation) => {
    if (preview || !mounted.current || inFlight.current || current.current.phase === 'installing') return null;
    inFlight.current = true;
    const id = ++epoch.current;
    patch({ operation, error: null, errorStage: null });
    return id;
  };
  const active = (id: number) => mounted.current && epoch.current === id;
  const finish = (id: number) => { if (active(id)) { inFlight.current = false; patch({ operation: null }); } };

  const check = async () => {
    if (current.current.info && (!current.current.info.configured || current.current.info.platform === 'unsupported')) return;
    const id = begin('check'); if (id === null) return;
    patch({ phase: 'checking', downloaded: false, release: null, progress: null });
    try {
      const info = current.current.info ?? await getUpdateInfo();
      if (!active(id)) return;
      patch({ info });
      if (!info.configured || info.platform === 'unsupported') { patch({ phase: 'unconfigured' }); return; }
      const release = await checkForUpdate();
      if (active(id)) patch({ release, phase: release ? 'available' : 'latest' });
    } catch (error) { if (active(id)) patch({ phase: 'error', error: asMessage(error), errorStage: 'check' }); }
    finally { finish(id); }
  };

  const download = async () => {
    if (!current.current.release || current.current.downloaded || !current.current.info?.configured) return;
    const id = begin('download'); if (id === null) return;
    patch({ phase: 'downloading', downloaded: false, progress: { downloaded: 0 } });
    try {
      await downloadUpdate((event) => {
        if (!active(id) || !inFlight.current || current.current.phase !== 'downloading' || event.event !== 'progress') return;
        const downloaded = Number.isFinite(event.downloaded) ? Math.max(0, event.downloaded) : 0;
        const total = typeof event.total === 'number' && Number.isFinite(event.total) && event.total > 0 ? event.total : undefined;
        patch({ progress: { downloaded, ...(total ? { total } : {}) } });
      });
      if (active(id)) patch({ phase: 'ready', downloaded: true });
    } catch (error) { if (active(id)) patch({ phase: 'error', error: asMessage(error), errorStage: 'download', downloaded: false }); }
    finally { finish(id); }
  };

  const install = async () => {
    if (!current.current.downloaded || !current.current.release) return;
    const id = begin('install'); if (id === null) return;
    patch({ phase: 'installing' });
    try {
      const result = await installation.current(installUpdate);
      if (active(id)) patch({ phase: result.status === 'relaunching' ? 'installing' : result.status });
    } catch (error) { if (active(id)) patch({ phase: 'error', error: `Cek pembaruan lagi sebelum mencoba memasang. ${asMessage(error)}`, errorStage: 'install', downloaded: false, release: null, progress: null }); }
    finally { finish(id); }
  };

  return { ...state, preview, currentVersion: state.info?.currentVersion ?? packageInfo.version, busy: state.operation !== null || state.phase === 'installing', check, download, install };
}
export type AppUpdater = ReturnType<typeof useAppUpdater>;
