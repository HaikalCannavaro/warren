import { expect, it } from 'vitest';
import { FLEET_AGENTS, FLEET_ROLES, FLEET_SPECIALISTS, ORCHESTRATOR } from './fleet';
import { fleetAgent, fleetRoster } from './observer';
import { agentName, auditRoute, parseTranscript } from './burrow';

it('defines one orchestrator and ten distinct specialists with the supplied roles',()=>{
  expect(ORCHESTRATOR).toBe('Leveret');expect(FLEET_AGENTS).toHaveLength(11);expect(FLEET_SPECIALISTS).toHaveLength(10);
  expect(new Set(FLEET_AGENTS).size).toBe(11);
  expect(FLEET_ROLES.Nexus.title[0]).toBe('Operations, Documentation & Coordination');
  expect(FLEET_ROLES.Lens.title[0]).toBe('Independent Rendered Visual QA');
  expect(FLEET_ROLES.Radar.title[0]).toBe('Technical Research & Intelligence');
});
it('recognizes Nexus assignments and preserves its real queued or running tasks',()=>{
  expect(fleetAgent('agent:NEXUS')).toBe('Nexus');
  const roster=fleetRoster([{assignee:'NEXUS',status:'ready',title:'Prepare SOP'},{assignee:'nexus',status:'running',title:'Document the release'}]);
  expect(roster.find(item=>item.agent==='Nexus')).toMatchObject({state:'working',tasks:[{title:'Prepare SOP'},{title:'Document the release'}]});
});
it('recognizes Frame and Nexus in Burrow routes and transcript speakers',()=>{
  expect(agentName('nexus')).toBe('Nexus');expect(agentName('frame')).toBe('Frame');
  expect(auditRoute({ts:1,direction:'inbound',peer:'nexus',task_id:'task-1',summary:'SOP',status:'done'}).from).toBe('Nexus');
  expect(parseTranscript(JSON.stringify({role:'agent',content:'Release notes'}),'Nexus').items[0].speaker).toBe('Nexus');
});
