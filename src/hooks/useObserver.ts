import { useEffect, useState } from 'react';
import { readObserver, type ObserverReadKind, type ObserverResponse } from '../lib/native';
import { parseFleetTasks, parseGpuTelemetry, parseKanbanTasks, parseLinuxTelemetry, type HardwareTelemetry } from '../lib/observer';

interface Reading<T> { source: string | null; scope: string | null; data: T | null; loading: boolean; error: string; updatedAt: number | null; }
function hardwareResponse(response: ObserverResponse): HardwareTelemetry {
  if (response.kind !== 'hardware') throw new Error('Unexpected hardware response.');
  let warning = response.warning; let gpus: HardwareTelemetry['gpus'] = [];
  try { gpus = response.gpu ? parseGpuTelemetry(response.gpu) : []; } catch (cause) { warning = cause instanceof Error ? cause.message : String(cause); }
  const linux = response.linux ? parseLinuxTelemetry(response.linux) : null;
  if (!linux && !gpus.length) throw new Error(warning || 'This host returned no supported Linux or NVIDIA telemetry.');
  return { linux, gpus, warning };
}
const fleetResponse = (response: ObserverResponse) => { if (response.kind !== 'fleet') throw new Error('Unexpected fleet response.'); return parseFleetTasks(response.data); };
const tasksResponse = (response: ObserverResponse) => { if (response.kind !== 'tasks') throw new Error('Unexpected task response.'); return parseKanbanTasks(response.data); };

function useReading<T>(sessionId: string | null, kind: ObserverReadKind, parse: (response: ObserverResponse) => T, refresh: number, autoPoll: boolean, includeArchived=false) {
  const scope = sessionId === null ? null : `${sessionId}:${includeArchived?'archived':'active'}`;
  const [reading, setReading] = useState<Reading<T>>({ source: null, scope:null, data: null, loading: false, error: '', updatedAt: null });
  useEffect(() => {
    let disposed = false; let active: AbortController | null = null;
    if (!sessionId) { setReading({ source: null, scope:null, data: null, loading: false, error: '', updatedAt: null }); return; }
    const fetch = async () => {
      if (active || disposed) return;
      const request = new AbortController(); active = request;
      setReading(previous => ({ source: sessionId, scope, data: previous.scope === scope ? previous.data : null, loading: true, error: '', updatedAt: previous.scope === scope ? previous.updatedAt : null }));
      try {
        const response = await readObserver(sessionId, kind, request.signal,includeArchived);
        const data = parse(response);
        if (!disposed && !request.signal.aborted) setReading({ source: sessionId, scope, data, loading: false, error: '', updatedAt: Date.now() });
      } catch (cause) {
        if (!disposed && !request.signal.aborted) setReading(previous => ({ ...previous, loading: false, error: cause instanceof Error ? cause.message : String(cause) }));
      } finally { if (active === request) active = null; }
    };
    void fetch();
    const poll = () => { if (document.visibilityState === 'visible') void fetch(); };
    const timer = autoPoll ? window.setInterval(poll, 10000) : undefined;
    if (autoPoll) document.addEventListener('visibilitychange', poll);
    return () => { disposed = true; active?.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [sessionId, kind, parse, refresh, autoPoll,scope,includeArchived]);
  return reading.scope === scope ? reading : { source: sessionId, scope, data: null, loading: !!sessionId, error: '', updatedAt: null } as Reading<T>;
}
export function useObserver(hardwareSession: string | null, orchestratorSession: string | null,includeArchived=false) {
  const [autoPoll, setAutoPoll] = useState(true); const [refresh, setRefresh] = useState(0);
  const hardware = useReading(hardwareSession, 'hardware', hardwareResponse, refresh, autoPoll);
  const fleet = useReading(orchestratorSession, 'fleet', fleetResponse, refresh, autoPoll);
  const tasks = useReading(orchestratorSession, 'tasks', tasksResponse, refresh, autoPoll,includeArchived);
  return { hardware, fleet, tasks, autoPoll, setAutoPoll, refresh: () => setRefresh(value => value + 1), loading: hardware.loading || fleet.loading || tasks.loading };
}
