import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SchedulerWorkspace } from './SchedulerWorkspace';
import { setLanguage } from '../lib/i18n';
import type { CronJob, SchedulerSnapshot } from '../lib/scheduler';
import type { TerminalSession, VpsProfile } from '../types';

const f=vi.hoisted(()=>({command:vi.fn(),connect:vi.fn()}));
vi.mock('../lib/schedulerClient',()=>({schedulerCommand:f.command}));
const profiles:VpsProfile[]=[{id:'alpha',name:'Alpha VPS',host:'alpha.example',port:22,username:'deploy',auth:'password',password:'',privateKey:'',passphrase:''},
  {id:'beta',name:'Beta VPS',host:'beta.example',port:22,username:'ops',auth:'password',password:'',privateKey:'',passphrase:''}];
const sessions:TerminalSession[]=[{id:'ssh-alpha',profileId:'alpha',label:'Alpha',host:'deploy@alpha.example:22',status:'connected'},
  {id:'ssh-beta',profileId:'beta',label:'Beta',host:'ops@beta.example:22',status:'connected'}];
const job:CronJob={id:'job-a',name:'Daily backup',schedule:'0 0 * * *',command:'/opt/backup.sh',enabled:true};
const snapshot=(jobs:CronJob[]=[job],revision='revision-a'):SchedulerSnapshot=>({revision,username:'deploy',timezone:'UTC',jobs});
const mount=(props:Partial<Parameters<typeof SchedulerWorkspace>[0]>={})=>render(<SchedulerWorkspace profiles={profiles} sessions={sessions} onConnect={f.connect} {...props}/>);
const loaded=async()=>{await screen.findByRole('heading',{name:'Daily backup'});};
async function selectHost(name:string){fireEvent.click(screen.getByRole('combobox',{name:'Scheduler target host'}));fireEvent.click(screen.getByRole('option',{name:new RegExp(name)}));}
function editFields(name='Restart Hermes',schedule='0 4 * * *',command='/usr/bin/systemctl restart hermes.service'){
  fireEvent.change(screen.getByLabelText('Schedule name'),{target:{value:name}});
  fireEvent.change(screen.getByLabelText('Cron expression'),{target:{value:schedule}});
  fireEvent.change(screen.getByLabelText('Command'),{target:{value:command}});
}
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(cause:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
beforeEach(()=>{setLanguage('en');vi.resetAllMocks();f.connect.mockResolvedValue(undefined);f.command.mockResolvedValue(snapshot());});
afterEach(cleanup);

it('loads only the selected SSH user crontab and shows server timezone and command text',async()=>{
  mount();await loaded();
  expect(f.command).toHaveBeenCalledExactlyOnceWith('ssh-alpha',{action:'list'});
  expect(screen.getByText('/opt/backup.sh')).toBeTruthy();
  expect(screen.getAllByText(/UTC/).length).toBeGreaterThan(0);
  expect(screen.getByText(/Current SSH user only/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:/run now/i})).toBeNull();
});

it('creates a schedule on the displayed host using the current revision without executing it',async()=>{
  mount();await loaded();
  const added={id:'added',name:'Restart Hermes',schedule:'0 4 * * *',command:'/usr/bin/systemctl restart hermes.service',enabled:true};
  f.command.mockResolvedValueOnce(snapshot([job,added],'revision-b'));
  fireEvent.click(screen.getByRole('button',{name:'Add schedule'}));editFields();
  expect(within(screen.getByRole('dialog')).getByText('Changes apply to Alpha VPS · deploy')).toBeTruthy();
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Save schedule'}));});
  expect(f.command).toHaveBeenLastCalledWith('ssh-alpha',{action:'save',revision:'revision-a',job:{name:added.name,schedule:added.schedule,command:added.command,enabled:true}});
  expect(screen.queryByRole('dialog')).toBeNull();expect(screen.getByRole('heading',{name:'Restart Hermes'})).toBeTruthy();
});

it('preserves the existing job ID when editing and uses a real preset',async()=>{
  mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Edit schedule: Daily backup'}));
  fireEvent.click(screen.getByRole('combobox',{name:'Schedule preset'}));fireEvent.click(screen.getByRole('option',{name:'Every 5 minutes'}));
  expect((screen.getByLabelText('Cron expression') as HTMLInputElement).value).toBe('*/5 * * * *');
  f.command.mockResolvedValueOnce(snapshot([{...job,schedule:'*/5 * * * *'}],'next'));
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Save schedule'}));});
  expect(f.command).toHaveBeenLastCalledWith('ssh-alpha',{action:'save',revision:'revision-a',job:{...job,schedule:'*/5 * * * *'}});
});

it('disables a schedule and accepts the new server snapshot',async()=>{
  mount();await loaded();f.command.mockResolvedValueOnce(snapshot([{...job,enabled:false}],'next'));
  await act(async()=>{fireEvent.click(screen.getByRole('switch',{name:'Enable schedule: Daily backup'}));});
  expect(f.command).toHaveBeenLastCalledWith('ssh-alpha',{action:'toggle',revision:'revision-a',id:'job-a',enabled:false});
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');expect(screen.getByText('PAUSED')).toBeTruthy();
});

it('confirms deletion for the selected host and removes only the requested job',async()=>{
  mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Delete schedule: Daily backup'}));
  expect(screen.getByRole('dialog').textContent).toContain('Daily backup · Alpha VPS');
  expect(f.command).toHaveBeenCalledOnce();f.command.mockResolvedValueOnce(snapshot([],'empty'));
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Delete schedule'}));});
  expect(f.command).toHaveBeenLastCalledWith('ssh-alpha',{action:'delete',revision:'revision-a',id:'job-a'});
  expect(screen.getByRole('heading',{name:'No cron jobs yet'})).toBeTruthy();
});

it.each([['61 * * * *','/opt/check.sh'],['* * * * *','echo one\necho two']])('blocks an invalid schedule or multiline command before writing: %s',async(schedule,command)=>{
  mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Add schedule'}));editFields('Test schedule',schedule,command);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Save schedule'}));});
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeTruthy();expect(f.command).toHaveBeenCalledOnce();
});

it('connects the selected profile without reading another host while offline',async()=>{
  mount({sessions:[]});
  expect(f.command).not.toHaveBeenCalled();expect((screen.getByRole('button',{name:'Add schedule'}) as HTMLButtonElement).disabled).toBe(true);
  await selectHost('Beta VPS');
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Connect SSH'}));});
  expect(f.connect).toHaveBeenCalledExactlyOnceWith('beta');expect(f.command).not.toHaveBeenCalled();
});

it('discards a late read from the previous host and routes subsequent edits to the new source',async()=>{
  const old=deferred<SchedulerSnapshot>();
  const betaJob={...job,id:'beta-job',name:'Beta task'};
  f.command.mockImplementation((sessionId:string)=>sessionId==='ssh-alpha'?old.promise:Promise.resolve(snapshot([betaJob],'beta-revision')));
  mount();await selectHost('Beta VPS');await screen.findByRole('heading',{name:'Beta task'});
  await act(async()=>{old.resolve(snapshot());});
  expect(screen.queryByRole('heading',{name:'Daily backup'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Edit schedule: Beta task'}));
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Save schedule'}));});
  expect(f.command).toHaveBeenLastCalledWith('ssh-beta',{action:'save',revision:'beta-revision',job:betaJob});
});

it('closes a stale editor when the selected SSH session is replaced',async()=>{
  const h=mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Edit schedule: Daily backup'}));
  editFields('Never apply this elsewhere');
  h.rerender(<SchedulerWorkspace profiles={profiles} sessions={[{...sessions[0],id:'ssh-alpha-new'},sessions[1]]} onConnect={f.connect}/>);
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(()=>expect(f.command).toHaveBeenLastCalledWith('ssh-alpha-new',{action:'list'}));
  expect(f.command.mock.calls.filter(call=>call[1].action==='save')).toHaveLength(0);
});
it('never reuses an old connected session after a saved profile changes its host or SSH account',async()=>{
  const h=mount();await loaded();fireEvent.click(screen.getByRole('button',{name:'Edit schedule: Daily backup'}));
  editFields('Must stay on original host');
  h.rerender(<SchedulerWorkspace profiles={[{...profiles[0],host:'new.example',username:'another-user'},profiles[1]]} sessions={sessions} onConnect={f.connect}/>);
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('heading',{name:'Connect to this host'})).toBeTruthy();
  expect(f.command).toHaveBeenCalledExactlyOnceWith('ssh-alpha',{action:'list'});
  expect((screen.getByRole('button',{name:'Add schedule'}) as HTMLButtonElement).disabled).toBe(true);
});

it('never retries an uncertain mutation and requires a successful explicit refresh before further writes',async()=>{
  mount();await loaded();f.command.mockRejectedValueOnce(new Error('SSH ended before confirmation'));
  await act(async()=>{fireEvent.click(screen.getByRole('switch'));});
  expect(screen.getByRole('alert').textContent).toContain('change was not confirmed');
  expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  expect(f.command).toHaveBeenCalledTimes(2);
  f.command.mockResolvedValueOnce(snapshot([job],'new-revision'));
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Refresh'}));});
  expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(false);
  f.command.mockResolvedValueOnce(snapshot([{...job,enabled:false}],'saved'));
  await act(async()=>{fireEvent.click(screen.getByRole('switch'));});
  expect(f.command).toHaveBeenLastCalledWith('ssh-alpha',{action:'toggle',revision:'new-revision',id:'job-a',enabled:false});
});

it('holds the editor open while saving and does not cancel its mutation on unmount',async()=>{
  mount();await loaded();const pending=deferred<SchedulerSnapshot>();f.command.mockReturnValueOnce(pending.promise);
  fireEvent.click(screen.getByRole('button',{name:'Add schedule'}));editFields();
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Save schedule'}));});
  fireEvent.click(screen.getByRole('button',{name:'Close dialog'}));fireEvent.keyDown(document,{key:'Escape'});
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect((screen.getByRole('button',{name:'Save schedule'}) as HTMLButtonElement).disabled).toBe(true);
  cleanup();await act(async()=>{pending.resolve(snapshot());});
  expect(f.command.mock.calls.filter(call=>call[1].action==='save')).toHaveLength(1);
});

it('shows a failed read without enabling edits and can recover via Refresh',async()=>{
  f.command.mockRejectedValueOnce(new Error('Python 3 is required'));mount();
  await screen.findByRole('alert');expect(screen.getByRole('alert').textContent).toContain('Python 3');
  expect((screen.getByRole('button',{name:'Add schedule'}) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Refresh'}));});
  expect((screen.getByRole('button',{name:'Add schedule'}) as HTMLButtonElement).disabled).toBe(false);
});

it('shows an honest empty source state when no VPS profiles exist',()=>{
  mount({profiles:[],sessions:[]});expect(screen.getByRole('heading',{name:'Choose a server for your schedules'})).toBeTruthy();
  expect(f.command).not.toHaveBeenCalled();expect((screen.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true);
});
