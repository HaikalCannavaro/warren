import { expect, it } from 'vitest';
import { fleetRoster, metricSeverity, parseFleetTasks, parseGpuTelemetry, parseKanbanTasks, parseLinuxTelemetry } from './observer';

const linux = '0.48 0.35 0.29 2/144 1234\n total used free shared buff/cache available\nMem: 8192 2654 1550 200 3988 5000\nSwap: 0 0 0\nFilesystem Size Used Avail Use% Mounted on\n/dev/vda1 80G 19G 61G 24% /\nup 3 days, 14 hours\n__WARREN_CORES__\n4\n';
it('parses Linux load, reported RAM, root disk and uptime without turning load into CPU utilization', () => {
  expect(parseLinuxTelemetry(linux)).toEqual({ load: [0.48,0.35,0.29], cores: 4, ramTotal: 8192, ramUsed: 2654, diskPercent: 24, diskUsed: '19G', diskTotal: '80G', uptime: '3 days, 14 hours' });
  expect(parseLinuxTelemetry(linux.replace('__WARREN_CORES__\n4', '')).cores).toBeNull();
  expect(() => parseLinuxTelemetry('permission denied')).toThrow(/incomplete/);
  expect(() => parseLinuxTelemetry(linux.replace('8192 2654', '100 2654'))).toThrow(/exceeds/);
});
it('parses multiple NVIDIA devices and keeps unavailable values explicit', () => {
  expect(parseGpuTelemetry('78, 11000, 12000, 74\nN/A, 0, 8192, N/A')).toEqual([{ index: 0, utilization: 78, memoryUsed: 11000, memoryTotal: 12000, temperature: 74 }, { index: 1, utilization: null, memoryUsed: 0, memoryTotal: 8192, temperature: null }]);
  expect(parseGpuTelemetry('')).toEqual([]);
  expect(() => parseGpuTelemetry('No devices found')).toThrow();
  expect(() => parseGpuTelemetry('50, 9000, 8000, 60')).toThrow(/exceeds/);
});
it('marks severity at the requested 70/85 boundaries', () => {
  expect([null,69.99,70,85,85.01,120].map(metricSeverity)).toEqual(['unknown','normal','warning','warning','critical','critical']);
});
it('derives all ten roster states and keeps blocked work ahead of review and running work', () => {
  const tasks = parseFleetTasks(JSON.stringify([{assignee:'FORGE',status:'running',title:'API'},{assignee:'forge',status:'blocked',title:'Dependency'},{assignee:'PRISM',status:'review',title:'Release gate'}]));
  const roster = fleetRoster(tasks);
  expect(roster).toHaveLength(10);
  expect(roster.find(agent=>agent.agent==='Forge')).toMatchObject({state:'blocked'});
  expect(roster.find(agent=>agent.agent==='Forge')?.tasks).toHaveLength(2);
  expect(roster.find(agent=>agent.agent==='Prism')?.state).toBe('review');
  expect(roster.find(agent=>agent.agent==='Frame')?.state).toBe('idle');
  expect(() => parseFleetTasks('not-json')).toThrow(/JSON/);
  expect(() => parseFleetTasks('[{"assignee":"forge","status":"todo","title":"wrong query"}]')).toThrow(/unsupported/);
});
it('preserves task priorities and interprets SQLite datetime output as UTC', () => {
  const tasks = parseKanbanTasks('[{"id":"task-1","title":"Investigate","assignee":"atlas","status":"running","priority":2,"created_at":"2026-10-25 01:30:00"},{"id":12,"title":"Queued","assignee":null,"status":"custom","priority":"high","created_at":null}]');
  expect(tasks[0]).toMatchObject({id:'task-1',priority:2,createdAt:Date.parse('2026-10-25T01:30:00Z')});
  expect(tasks[1]).toMatchObject({id:'12',assignee:null,status:'unknown',rawStatus:'custom',priority:'high',createdAt:null});
  expect(() => parseKanbanTasks('{}')).toThrow(/unsupported/);
});
