import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ObserverWorkspace } from './ObserverWorkspace';
import { setLanguage } from '../lib/i18n';
import type { VpsProfile, TerminalSession } from '../types';
const mock=vi.hoisted(()=>({dashboard:vi.fn(),refresh:vi.fn(),poll:vi.fn()}));
vi.mock('../hooks/useObserver',()=>({useObserver:mock.dashboard}));
const profiles:VpsProfile[]=['linux','windows'].map((id,index)=>({id,name:index?'PC Workstation':'Hcnnvr-studio',host:`${id}.example`,port:22,username:'user',auth:'key',password:'',privateKey:'',passphrase:''}));
const sessions:TerminalSession[]=profiles.map(profile=>({id:`ssh-${profile.id}`,profileId:profile.id,label:profile.name,host:`${profile.username}@${profile.host}:${profile.port}`,status:'connected'}));
const empty={source:'ssh-linux',loading:false,error:'',updatedAt:1792899720000};
function dashboard(){return{
  hardware:{...empty,data:{linux:{load:[0.5,0.3,0.2],cores:4,ramUsed:2048,ramTotal:8192,diskPercent:24,diskUsed:'19G',diskTotal:'80G',uptime:'3 days'},gpus:[],warning:null}},
  fleet:{...empty,data:[{assignee:'forge',status:'blocked',title:'Wait for dependency'},{assignee:'atlas',status:'running',title:'Deploy'}]},
  tasks:{...empty,data:[{id:'task-1',title:'Backend endpoint',assignee:'forge',status:'blocked',rawStatus:'blocked',priority:'high',createdAt:1792899720000,rawCreatedAt:null},{id:'task-2',title:'Deploy service',assignee:'atlas',status:'running',rawStatus:'running',priority:2,createdAt:1792899720000,rawCreatedAt:null}]},
  autoPoll:false,setAutoPoll:mock.poll,refresh:mock.refresh,loading:false,
};}
beforeEach(()=>{setLanguage('en');mock.dashboard.mockReset().mockReturnValue(dashboard());mock.refresh.mockClear();mock.poll.mockClear();});
afterEach(cleanup);
function setup(){return render(<ObserverWorkspace vpsProfiles={profiles} sessions={sessions} activeSessionId="ssh-linux" onConnect={vi.fn()} onConnections={vi.fn()}/>);}
it('renders hardware and eleven roster residents with task-derived work states',()=>{
  setup();
  expect(screen.getByRole('progressbar',{name:'RAM'}).getAttribute('aria-valuenow')).toBe('25');
  const roster=screen.getByRole('region',{name:'Fleet Roster'});
  expect(within(roster).getByText('FRAME')).toBeTruthy();
  expect(within(within(roster).getByText('FORGE').closest('article')!).getByText('BLOCKED')).toBeTruthy();
  expect(within(within(roster).getByText('ATLAS').closest('article')!).getByText('WORKING')).toBeTruthy();
  expect(within(roster).getAllByText('IDLE')).toHaveLength(9);
});
it('changes the hardware source independently from the orchestrator',()=>{
  setup();fireEvent.click(screen.getByRole('combobox',{name:'Target Host'}));
  fireEvent.click(screen.getByRole('option',{name:/PC Workstation/}));
  expect(mock.dashboard).toHaveBeenLastCalledWith('ssh-windows','ssh-linux',false);
});
it('filters task status and assignee and exposes explicit refresh and polling controls',()=>{
  setup();fireEvent.click(screen.getByRole('combobox',{name:'Filter task status'}));
  fireEvent.click(screen.getByRole('option',{name:'Blocked'}));
  expect(screen.queryByText('Deploy service')).toBeNull();expect(screen.getByText('Backend endpoint')).toBeTruthy();
  fireEvent.click(screen.getByRole('combobox',{name:'Filter task assignee'}));fireEvent.click(screen.getByRole('option',{name:'Atlas'}));
  expect(screen.getByText('No tasks match these filters.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Refresh Data'}));expect(mock.refresh).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('checkbox',{name:/Auto-poll/}));expect(mock.poll).toHaveBeenCalledWith(true);
});
it('does not represent unavailable fleet data as idle agents or zero hardware readings',()=>{
  const data=dashboard();mock.dashboard.mockReturnValue({...data,hardware:{...empty,data:null},fleet:{...empty,data:null},tasks:{...empty,data:null}});
  setup();expect(screen.queryByText('IDLE')).toBeNull();expect(within(screen.getByRole('group',{name:'Fleet rabbits'})).getAllByText('AWAITING DATA')).toHaveLength(11);
  expect(screen.queryByRole('progressbar',{name:'RAM'})).toBeNull();
});
it('does not read fleet data using an old SSH session after its profile endpoint was edited',()=>{
  render(<ObserverWorkspace vpsProfiles={profiles.map(profile=>({...profile,host:'new.example'}))} sessions={sessions} activeSessionId="ssh-linux" onConnect={vi.fn()} onConnections={vi.fn()}/>);
  expect(mock.dashboard).toHaveBeenLastCalledWith(null,null,false);
});
it('hides archived work by default and requests it explicitly when the operator enables the toggle',()=>{
  const data=dashboard();
  const archived={id:'old',title:'Archived release notes',assignee:'nexus',status:'archived',rawStatus:'archived',priority:'normal',createdAt:null,rawCreatedAt:null};
  mock.dashboard.mockReturnValue({...data,tasks:{...data.tasks,data:[...data.tasks.data,archived]}});
  setup();expect(screen.queryByText('Archived release notes')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox',{name:'Show archived'}));
  expect(mock.dashboard).toHaveBeenLastCalledWith('ssh-linux','ssh-linux',true);
  expect(screen.getByText('Archived release notes')).toBeTruthy();
  fireEvent.click(screen.getByRole('combobox',{name:'Filter task status'}));fireEvent.click(screen.getByRole('option',{name:'Archived'}));
  expect(screen.queryByText('Backend endpoint')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox',{name:'Show archived'}));
  expect(screen.queryByText('Archived release notes')).toBeNull();
  expect(screen.getByRole('combobox',{name:'Filter task status'}).textContent).toContain('All statuses');
});
