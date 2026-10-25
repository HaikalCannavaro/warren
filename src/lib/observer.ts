export const FLEET_AGENTS = ['Leveret', 'Forge', 'Atlas', 'Frame', 'Aurora', 'Prism', 'Lens', 'Sentinel', 'Radar', 'Quant'] as const;
export type FleetAgent = typeof FLEET_AGENTS[number];
export type ActiveTaskStatus = 'running' | 'blocked' | 'review';
export type KanbanStatus = 'todo' | ActiveTaskStatus | 'done' | 'unknown';
export interface LinuxTelemetry {
  load: [number, number, number]; cores: number | null;
  ramUsed: number; ramTotal: number; diskPercent: number; diskUsed: string; diskTotal: string; uptime: string;
}
export interface GpuTelemetry { index: number; utilization: number | null; memoryUsed: number; memoryTotal: number; temperature: number | null; }
export interface HardwareTelemetry { linux: LinuxTelemetry | null; gpus: GpuTelemetry[]; warning: string | null; }
export interface FleetTask { assignee: string | null; status: ActiveTaskStatus; title: string; }
export interface KanbanTask {
  id: string; title: string; assignee: string | null; status: KanbanStatus; rawStatus: string;
  priority: string | number | null; createdAt: number | null; rawCreatedAt: string | null;
}
export interface FleetState { agent: FleetAgent; state: 'working' | 'review' | 'blocked' | 'idle'; tasks: FleetTask[]; }
export function fleetAgent(value: string | null): FleetAgent | null {
  const name = value?.trim().toLowerCase().replace(/^agent[:/_-]/, '');
  return FLEET_AGENTS.find(agent => agent.toLowerCase() === name) ?? null;
}
function finite(value: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value); if (!value.trim() || !Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error('The telemetry contains an invalid numeric value.'); return parsed;
}
export function parseLinuxTelemetry(raw: string): LinuxTelemetry {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const load = lines.find(line => /^\d+(\.\d+)?\s+\d+(\.\d+)?\s+\d+(\.\d+)?\s/.test(line))?.split(/\s+/);
  const memory = lines.find(line => /^Mem:/i.test(line))?.split(/\s+/);
  const disk = lines.find(line => /\d+%\s+\/$/.test(line))?.split(/\s+/);
  const uptime = lines.find(line => /^up\s/.test(line));
  if (!load || !memory || memory.length < 3 || !disk || disk.length < 6 || !uptime) throw new Error('Linux telemetry is incomplete. Check /proc, free, df and uptime on this host.');
  const ramTotal = finite(memory[1], 1), ramUsed = finite(memory[2]);
  if (ramUsed > ramTotal) throw new Error('The RAM reading exceeds its reported capacity.');
  const coreLine = lines.indexOf('__WARREN_CORES__');
  const coreValue = coreLine >= 0 ? Number(lines[coreLine + 1]) : NaN;
  return { load: [finite(load[0]), finite(load[1]), finite(load[2])], cores: Number.isInteger(coreValue) && coreValue > 0 ? coreValue : null,
    ramUsed, ramTotal, diskPercent: finite(disk.at(-2)!.replace('%', ''), 0, 100), diskUsed: disk.at(-4)!, diskTotal: disk.at(-5)!, uptime: uptime.replace(/^up\s+/, '') };
}
export function parseGpuTelemetry(raw: string): GpuTelemetry[] {
  if (!raw.trim()) return [];
  return raw.trim().split(/\r?\n/).map((line, index) => {
    const fields = line.split(',').map(value => value.trim());
    if (fields.length !== 4) throw new Error('The NVIDIA response is not the expected four-column CSV.');
    const optional = (value: string, min: number, max: number) => /^(N\/?A|\[Not Supported\])$/i.test(value) ? null : finite(value, min, max);
    const memoryUsed = finite(fields[1]), memoryTotal = finite(fields[2], 1);
    if (memoryUsed > memoryTotal) throw new Error('The VRAM reading exceeds its reported capacity.');
    return { index, utilization: optional(fields[0], 0, 100), memoryUsed, memoryTotal, temperature: optional(fields[3], -30, 150) };
  });
}
function rows(raw: string): Record<string, unknown>[] {
  let value: unknown;
  try { value = JSON.parse(raw.trim() || '[]'); } catch { throw new Error('The orchestrator did not return valid SQLite JSON.'); }
  if (!Array.isArray(value) || value.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('The orchestrator returned an unsupported task list.');
  return value as Record<string, unknown>[];
}
function assignee(value: unknown): string | null { if (value === null || value === undefined || value === '') return null; if (typeof value !== 'string') throw new Error('A task has an invalid assignee.'); return value; }
export function parseFleetTasks(raw: string): FleetTask[] {
  return rows(raw).map(row => {
    if (typeof row.title !== 'string' || !['running', 'blocked', 'review'].includes(String(row.status))) throw new Error('The fleet query returned an unsupported active task.');
    return { assignee: assignee(row.assignee), status: row.status as ActiveTaskStatus, title: row.title };
  });
}
export function fleetRoster(tasks: FleetTask[]): FleetState[] {
  return FLEET_AGENTS.map(agent => {
    const assigned = tasks.filter(task => fleetAgent(task.assignee) === agent);
    return { agent, tasks: assigned, state: assigned.some(task => task.status === 'blocked') ? 'blocked' : assigned.some(task => task.status === 'review') ? 'review' : assigned.length ? 'working' : 'idle' };
  });
}
export function parseKanbanTasks(raw: string): KanbanTask[] {
  return rows(raw).map(row => {
    if (!['number', 'string'].includes(typeof row.id) || typeof row.title !== 'string' || typeof row.status !== 'string') throw new Error('A Kanban task is missing its ID, title or status.');
    const rawCreatedAt = typeof row.created_at === 'string' ? row.created_at : null;
    const parsed = rawCreatedAt ? Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(rawCreatedAt) ? `${rawCreatedAt.replace(' ', 'T')}Z` : rawCreatedAt) : NaN;
    return { id: String(row.id), title: row.title, assignee: assignee(row.assignee),
      status: ['todo', 'running', 'blocked', 'review', 'done'].includes(row.status) ? row.status as KanbanStatus : 'unknown', rawStatus: row.status,
      priority: typeof row.priority === 'string' || typeof row.priority === 'number' && Number.isFinite(row.priority) ? row.priority : null,
      createdAt: Number.isFinite(parsed) ? parsed : null, rawCreatedAt };
  });
}
export function metricSeverity(percent: number | null): 'normal' | 'warning' | 'critical' | 'unknown' {
  return percent === null ? 'unknown' : percent < 70 ? 'normal' : percent <= 85 ? 'warning' : 'critical';
}
