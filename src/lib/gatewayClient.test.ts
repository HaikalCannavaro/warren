import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GatewayTransportEvent } from './native';
import type { HermesEvent, HermesProfile } from '../types';
import { GatewayClient } from './gatewayClient';
import { setLanguage } from './i18n';

const native = vi.hoisted(() => ({ connectGateway: vi.fn(), sendGateway: vi.fn(), disconnectGateway: vi.fn() }));
vi.mock('./native', () => native);
type Row = Record<string, unknown>;
let listener: (event: GatewayTransportEvent) => void;
let calls: Row[];
let handle: (request: Row) => void;
let client: GatewayClient;
const profile: HermesProfile = { id: 'p', name: 'Test', url: 'wss://example.invalid/api/ws', token: 'private-token', model: '' };
const snapshot = (extra: Row = {}) => ({ session_id: 'session-1', stored_session_id: 'session-1', revision: 7,
  execution_generation: 2, replay_epoch: 'epoch-1', last_sequence: 0, running: false, messages: [], pending: [], prompts: [],
  info: { desktop_protocol: 'hermes-gateway-v1', model: 'old-model' }, ...extra });
function frame(value: Row) { listener({ type: 'message', text: JSON.stringify(value) }); }
function reply(request: Row, result: unknown) { frame({ jsonrpc: '2.0', id: request.id, result }); }
function event(type: string, payload: Row = {}, extra: Row = {}) {
  frame({ jsonrpc: '2.0', method: 'event', params: { type, session_id: 'session-1', payload,
    replay_epoch: 'epoch-1', ...extra } });
}
function defaults(request: Row) {
  switch (request.method) {
    case 'client.capabilities': reply(request, { server_requests: ['approval', 'clarify'] }); break;
    case 'runtime.describe': reply(request, { capabilities: ['durable-admission-v1', 'event-replay-v1'] }); break;
    case 'session.create': case 'session.resume': reply(request, snapshot()); break;
    case 'gateway.ping': reply(request, { ok: true }); break;
    default: reply(request, {});
  }
}
async function ready() { await client.connect(); await client.ensureSession(); }

beforeEach(() => {
  setLanguage('id');
  vi.useFakeTimers(); calls = []; handle = defaults;
  native.connectGateway.mockImplementation(async (_id, _url, _token, callback) => {
    listener = callback;
    frame({ jsonrpc: '2.0', method: 'event', params: { type: 'gateway.ready', payload: { session_authority: true, heartbeat: true } } });
  });
  native.sendGateway.mockImplementation(async (_id, text: string) => { const request = JSON.parse(text) as Row; calls.push(request); if (request.method) handle(request); });
  native.disconnectGateway.mockResolvedValue(undefined);
  client = new GatewayClient(profile);
});
afterEach(async () => { await client.close(); vi.clearAllTimers(); vi.useRealTimers(); vi.clearAllMocks(); });

describe('Hermes v0.22.4 canonical gateway', () => {
  it('reads only confirmed profile_name and preserves the profile for each admitted reply',async()=>{
    const observer=vi.fn();client=new GatewayClient({...profile,agentProfile:'Configured fallback'},observer);
    handle=req=>req.method==='session.create'||req.method==='session.resume'?reply(req,snapshot({info:{desktop_protocol:'hermes-gateway-v1',profile_name:'Leveret',profile_id:'/private/profiles/Leveret',model:'brain-model'}})):defaults(req);
    await ready();expect(client.getSessionProfile('session-1')).toBe('Leveret');expect(observer).toHaveBeenLastCalledWith('session-1','Leveret');
    const events:HermesEvent[]=[];
    handle=req=>{
      if(req.method==='session.resume')return reply(req,snapshot({info:{desktop_protocol:'hermes-gateway-v1',profile_name:'Leveret'}}));
      if(req.method!=='prompt.submit')return defaults(req);
      event('session.info',{profile_name:'Research'},{seq:1});
      event('message.complete',{text:'Hello',status:'complete'},{admission_id:'a',seq:2});
      reply(req,{admission_id:'a',status:'started'});
    };
    await client.send('session-1','Hi','input',e=>events.push(e));
    expect(client.getSessionProfile('session-1')).toBe('Research');
    expect(events).toEqual([{type:'replace',text:'Hello',agentProfile:'Leveret'},{type:'done',finishReason:'stop',agentProfile:'Leveret'}]);
    expect(calls.find(req=>req.method==='prompt.submit')?.params).toEqual({session_id:'session-1',submission_id:'input',text:'Hi',clarify_batch:true});
    expect(JSON.stringify(events)).not.toMatch(/private\/profiles|brain-model/);
    await client.close();event('session.info',{profile_name:'Late'});expect(client.getSessionProfile('session-1')).toBe('Research');
  });
  it.each([undefined,null,'',123,'/private/profiles/leveret','C:\\profiles\\leveret','x'.repeat(81),'bad\nname'])('rejects malformed profile_name without exposing profile_id (%s)',async profileName=>{
    handle=req=>req.method==='session.create'?reply(req,snapshot({info:{desktop_protocol:'hermes-gateway-v1',profile_name:profileName,profile_id:'/private/profiles/leveret',model:'brain-model'}})):defaults(req);
    await ready();expect(client.getSessionProfile('session-1')).toBeUndefined();
  });
  it('explicitly clears per-turn profile metadata when the refreshed snapshot has no profile name',async()=>{
    handle=req=>req.method==='session.create'?reply(req,snapshot({info:{desktop_protocol:'hermes-gateway-v1',profile_name:'Leveret'}})):defaults(req);
    await ready();expect(client.getSessionProfile('session-1')).toBe('Leveret');
    handle=req=>{
      if(req.method==='prompt.submit'){
        event('message.complete',{text:'Reply',status:'complete'},{admission_id:'a',seq:1});
        return reply(req,{admission_id:'a',status:'started'});
      }
      defaults(req); // The session.resume snapshot has no profile_name.
    };
    const events:HermesEvent[]=[];await client.send('session-1','Hi','input',e=>events.push(e));
    expect(client.getSessionProfile('session-1')).toBeUndefined();
    expect(events.length).toBeGreaterThan(0);
    expect(events.every(e=>Object.hasOwn(e,'agentProfile')&&e.agentProfile===undefined)).toBe(true);
  });
  it('localizes catalog fallbacks on demand without changing server descriptions or command payloads', async () => {
    setLanguage('en');
    await ready();
    handle = req => req.method === 'commands.catalog' ? reply(req, { pairs: [['/status', 'Status dari server']], commands: {'/usage':{}} }) : req.method === 'slash.exec' ? reply(req,{type:'exec',output:''}) : defaults(req);
    let catalog=await client.catalog('session-1');
    expect(catalog.find(c=>c.name==='help')?.description).toBe('View commands and their availability.');
    expect(catalog.find(c=>c.name==='status')?.description).toBe('Status dari server');
    expect(await client.command('session-1','/status')).toBe('The Gateway returned no report text.');
    setLanguage('id');
    catalog=await client.catalog('session-1');
    expect(catalog.find(c=>c.name==='help')?.description).toBe('Lihat perintah dan ketersediaannya.');
    expect(catalog.find(c=>c.name==='status')?.description).toBe('Status dari server');
    expect(await client.command('session-1','/status')).toBe('Gateway tidak mengembalikan teks laporan.');
    const commands=calls.filter(request=>request.method==='slash.exec');
    expect(commands.map(request=>request.params)).toEqual([{session_id:'session-1',command:'/status'},{session_id:'session-1',command:'/status'}]);
  });
  it('advertises request handling and creates with the verified canonical shape', async () => {
    await ready();
    expect(calls.find(r => r.method === 'client.capabilities')?.params).toEqual({ server_requests: true });
    expect(calls.find(r => r.method === 'session.create')?.params).toMatchObject({ source: 'gui', request_id: expect.any(String) });
    expect(native.connectGateway).toHaveBeenCalledWith(expect.any(String), profile.url, profile.token, expect.any(Function));
  });
  it('refuses a standalone/unknown handshake without creating or sending a prompt', async () => {
    native.connectGateway.mockImplementation(async (_id, _url, _token, callback) => {
      listener = callback; frame({ method: 'event', params: { type: 'gateway.ready', payload: {} } });
    });
    await expect(client.connect()).rejects.toMatchObject({ uncertain: false });
    expect(calls.some(r => r.method === 'session.create' || r.method === 'prompt.submit')).toBe(false);
  });
  it('resumes the stored ID and adopts the canonical returned ID', async () => {
    await client.connect();
    expect(await client.ensureSession('stored-tip')).toEqual({ sessionId: 'session-1' });
    expect(calls.find(r => r.method === 'session.resume')?.params).toEqual({ session_id: 'stored-tip' });
  });
  it('enables only known routes actually present in the server catalog', async () => {
    await ready();
    handle = req => req.method === 'commands.catalog' ? reply(req, { pairs: [['/model', 'Choose model'], ['/status', 'Status'], ['/danger', 'Unknown']], canon: { '/compact': '/compress' }, commands: { '/compress': {} } }) : defaults(req);
    const catalog = await client.catalog('session-1');
    expect(catalog.find(c => c.name === 'model')?.available).toBe(true);
    expect(catalog.find(c => c.name === 'compact')?.available).toBe(true);
    expect(catalog.find(c => c.name === 'usage')?.available).toBe(false);
    expect(catalog.find(c => c.name === 'danger')?.available).not.toBe(true);
  });
  it('buffers early frames, filters foreign admissions, deduplicates and reconciles final text', async () => {
    await ready(); const events: HermesEvent[] = [];
    handle = req => {
      if (req.method !== 'prompt.submit') return defaults(req);
      event('message.delta', { text: 'foreign' }, { admission_id: 'other', seq: 1 });
      event('message.delta', { text: 'Hel' }, { admission_id: 'admit-1', seq: 2 });
      event('message.delta', { text: 'Hel' }, { admission_id: 'admit-1', seq: 2 });
      reply(req, { admission_id: 'admit-1', status: 'started', ref: { session_id: 'session-1' } });
      event('message.complete', { text: 'Hello', status: 'complete' }, { admission_id: 'admit-1', seq: 3 });
    };
    await client.send('session-1', 'Hi', 'input-id', e => events.push(e));
    expect(events).toEqual([{ type: 'delta', text: 'Hel' }, { type: 'replace', text: 'Hello' }, { type: 'done', finishReason: 'stop' }]);
    expect(calls.find(r => r.method === 'prompt.submit')?.params).toMatchObject({ submission_id: 'input-id', text: 'Hi' });
  });
  it('uses session and epoch when deduplicating, and does not append final content twice', async () => {
    await ready(); const events: HermesEvent[] = [];
    handle = req => {
      if (req.method !== 'prompt.submit') return defaults(req);
      reply(req, { admission_id: 'a', status: 'started' });
      event('message.delta', { text: 'other' }, { session_id: 'another', admission_id: 'a', seq: 2 });
      event('message.delta', { text: 'A' }, { admission_id: 'a', seq: 2 });
      event('message.complete', { text: 'A', status: 'interrupted' }, { admission_id: 'a', seq: 3 });
    };
    await client.send('session-1', 'Hi', 'in', e => events.push(e));
    expect(events).toEqual([{ type: 'delta', text: 'A' }, { type: 'replace', text: 'A' }, { type: 'done', finishReason: 'interrupted' }]);
  });
  it('reports disconnect after dispatch as uncertain without retrying', async () => {
    await ready(); handle = req => { if (req.method === 'prompt.submit') listener({ type: 'closed', message: 'connection lost private-token' }); else defaults(req); };
    const events: HermesEvent[] = [];
    await expect(client.send('session-1', 'Hi', 'input-id', e => events.push(e))).rejects.toMatchObject({ uncertain: true });
    expect(calls.filter(r => r.method === 'prompt.submit')).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('private-token');
  });
  it('distinguishes an exact RPC refusal from an unknown admission', async () => {
    await ready(); handle = req => req.method === 'prompt.submit' ? frame({ id: req.id, error: { code: 4001, message: 'permission_denied' } }) : defaults(req);
    await expect(client.send('session-1', 'Hi', 'input-id', () => {})).rejects.toMatchObject({ uncertain: false });
  });
  it('times out a request once without retrying or exposing auth', async () => {
    await ready(); handle = req => { if (req.method !== 'prompt.submit') defaults(req); };
    const promise = client.send('session-1', 'Hi', 'input-id', () => {});
    const check = expect(promise).rejects.toMatchObject({ uncertain: true });
    await vi.advanceTimersByTimeAsync(31_000); await check;
    expect(calls.filter(r => r.method === 'prompt.submit')).toHaveLength(1);
  });
  it('refreshes revision/generation before model mutation and never auto-confirms', async () => {
    await ready(); handle = req => {
      if (req.method === 'session.resume') reply(req, snapshot({ revision: 19, execution_generation: 6 }));
      else if (req.method === 'session.mutate') reply(req, { status: 'confirmation_required', confirm_required: true, confirm: 'do-not-apply', confirm_message: 'Cost approval needed' });
      else defaults(req);
    };
    const output = await client.command('session-1', '/model new-model --provider nous');
    expect(output).toContain('Cost approval needed');
    expect(calls.filter(r => r.method === 'session.mutate')).toHaveLength(1);
    expect(calls.find(r => r.method === 'session.mutate')?.params).toMatchObject({ expected_revision: 19, expected_generation: 6, operation: 'model', payload: { model: 'new-model', provider: 'nous' } });
  });
  it('routes compact, status, usage and stop through their real owner methods', async () => {
    await ready(); handle = req => req.method === 'slash.exec' ? reply(req, { type: 'exec', output: 'report' }) : req.method === 'session.mutate' ? reply(req, { operation: 'compress', status: 'compressed', lines: ['Compressed.'] }) : defaults(req);
    expect(await client.command('session-1', '/status')).toBe('report');
    expect(await client.command('session-1', '/usage')).toBe('report');
    await client.command('session-1', '/compact focus here');
    await client.command('session-1', '/stop');
    expect(calls.find(r => r.method === 'session.mutate')?.params).toMatchObject({ operation: 'compress', payload: { focus: 'focus here' } });
    expect(calls.find(r => r.method === 'session.interrupt')?.params).toMatchObject({ session_id: 'session-1', execution_generation: 2 });
    expect(calls.some(r => r.method === 'process.stop')).toBe(true);
    expect(calls.filter(r => r.method === 'slash.exec').map(r => (r.params as Row).command)).toEqual(['/status', '/usage']);
  });
  it('answers unsupported server requests with -32601, never approval consent', async () => {
    await ready(); frame({ jsonrpc: '2.0', id: 'srq-1', method: 'approval', params: { session_id: 'session-1', request_id: 'q', command: 'example' } });
    await Promise.resolve();
    expect(calls.find(r => r.id === 'srq-1')).toMatchObject({ error: { code: -32601 } });
    expect(calls.some(r => r.method === 'approval.respond')).toBe(false);
  });
  it('closes the native socket on malformed data and exposes closed state', async () => {
    await ready(); listener({ type: 'message', text: '{broken' });
    await Promise.resolve();
    expect(native.disconnectGateway).toHaveBeenCalledTimes(1);
    expect(client.isClosed()).toBe(true);
  });
  it('accepts a bounded newline batch of JSON-RPC events', async () => {
    await ready(); const events: HermesEvent[] = [];
    handle = req => {
      if (req.method !== 'prompt.submit') return defaults(req);
      reply(req, { admission_id: 'a', status: 'started' });
      listener({ type: 'message', text: [
        { method: 'event', params: { type: 'message.delta', session_id: 'session-1', admission_id: 'a', replay_epoch: 'epoch-1', seq: 1, payload: { text: 'Hello' } } },
        { method: 'event', params: { type: 'message.complete', session_id: 'session-1', admission_id: 'a', replay_epoch: 'epoch-1', seq: 2, payload: { text: 'Hello', status: 'complete' } } },
      ].map(value => JSON.stringify(value)).join('\n') });
    };
    await client.send('session-1', 'Hi', 'input', e => events.push(e));
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'stop' });
  });
  it('interrupts an unsupported canonical approval without approving or denying it', async () => {
    await ready(); handle = req => {
      if (req.method !== 'prompt.submit') return defaults(req);
      reply(req, { admission_id: 'a', status: 'started' });
      event('approval.request', { prompt_id: 'approval-1', execution_generation: 3, choices: ['once', 'deny'] }, { admission_id: 'a', seq: 1 });
    };
    await expect(client.send('session-1', 'Hi', 'input', () => {})).rejects.toMatchObject({ uncertain: true });
    expect(calls.find(r => r.method === 'session.interrupt')?.params).toMatchObject({ execution_generation: 3 });
    expect(calls.some(r => r.method === 'approval.respond')).toBe(false);
  });
  it('never claims success for an unrecognized terminal status', async () => {
    await ready(); const events: HermesEvent[] = [];
    handle = req => {
      if (req.method !== 'prompt.submit') return defaults(req);
      reply(req, { admission_id: 'a', status: 'started' });
      event('message.complete', { text: 'partial', status: 'new-unrecognized-status' }, { admission_id: 'a', seq: 1 });
    };
    await expect(client.send('session-1', 'Hi', 'input', e => events.push(e))).rejects.toMatchObject({ uncertain: true });
    expect(events.some(e => e.type === 'done')).toBe(false);
  });
  it('never creates a replacement if resume is refused', async () => {
    await client.connect(); handle = req => req.method === 'session.resume' ? frame({ id: req.id, error: { code: 4001, message: 'not_found' } }) : defaults(req);
    await expect(client.ensureSession('existing')).rejects.toMatchObject({ uncertain: false });
    expect(calls.some(r => r.method === 'session.create')).toBe(false);
  });
  it('preserves colon-containing model IDs for server-side model resolution', async () => {
    await ready();
    await client.command('session-1', '/model vendor/model:free');
    expect(calls.find(r => r.method === 'session.mutate')?.params).toMatchObject({ payload: { model: 'vendor/model:free' } });
    expect(((calls.find(r => r.method === 'session.mutate')?.params as Row).payload as Row).provider).toBeUndefined();
  });
  it('applies a configured model only when creating, never when resuming', async () => {
    client = new GatewayClient({ ...profile, model: ' selected-model ' });
    await ready(); await client.ensureSession('saved-session');
    expect(calls.find(r => r.method === 'session.create')?.params).toMatchObject({ model: 'selected-model' });
    expect(calls.find(r => r.method === 'session.resume')?.params).toEqual({ session_id: 'saved-session' });
  });
  it('refuses a command-time session retarget before any mutation', async () => {
    await ready(); handle = req => req.method === 'session.resume' ? reply(req, snapshot({ session_id: 'new-target' })) : defaults(req);
    await expect(client.command('session-1', '/model changed')).rejects.toMatchObject({ uncertain: false });
    expect(calls.some(r => r.method === 'session.mutate')).toBe(false);
    expect(client.isClosed()).toBe(true);
  });
  it('refuses to submit into a session already running elsewhere', async () => {
    await ready(); handle = req => req.method === 'session.resume' ? reply(req, snapshot({ running: true })) : defaults(req);
    await expect(client.send('session-1', 'Hi', 'input', () => {})).rejects.toMatchObject({ uncertain: false });
    expect(calls.some(r => r.method === 'prompt.submit')).toBe(false);
  });
  it('reports a pre-submit identity change as definitely not sent', async () => {
    await ready(); handle = req => req.method === 'session.resume' ? reply(req, snapshot({ session_id: 'new-target' })) : defaults(req);
    await expect(client.send('session-1', 'Hi', 'input', () => {})).rejects.toMatchObject({ uncertain: false });
    expect(calls.some(r => r.method === 'prompt.submit')).toBe(false);
  });
  it('waits for admission before stopping and cancels only its queued message', async () => {
    await ready(); const events: HermesEvent[] = []; let submitted!: Row;
    handle = req => {
      if (req.method === 'prompt.submit') submitted = req;
      else if (req.method === 'prompt.receipt') reply(req, { admission_id: 'own', status: 'queued', ref: { session_id: 'session-1' } });
      else if (req.method === 'prompt.cancel') {
        reply(req, { admission_id: 'own', status: 'terminal', outcome: 'cancelled', ref: { session_id: 'session-1' } });
        event('message.complete', { text: '', outcome: 'cancelled' }, { admission_id: 'own', seq: 1 });
      } else defaults(req);
    };
    const sent = client.send('session-1', 'Hi', 'input', e => events.push(e));
    await Promise.resolve(); await Promise.resolve();
    const stopped = client.command('session-1', '/stop');
    await Promise.resolve();
    expect(calls.some(r => r.method === 'session.interrupt')).toBe(false);
    reply(submitted, { admission_id: 'own', status: 'queued' });
    await stopped; await sent;
    expect(calls.find(r => r.method === 'prompt.cancel')?.params).toEqual({ session_id: 'session-1', admission_id: 'own' });
    expect(calls.some(r => r.method === 'session.interrupt' || r.method === 'process.stop')).toBe(false);
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'interrupted' });
  });
  it('stops a running own admission with its receipt generation', async () => {
    await ready(); handle = req => {
      if (req.method === 'prompt.submit') reply(req, { admission_id: 'own', status: 'started' });
      else if (req.method === 'prompt.receipt') reply(req, { admission_id: 'own', status: 'started', execution_generation: 12, ref: { session_id: 'session-1' } });
      else if (req.method === 'session.interrupt') {
        reply(req, {}); event('message.complete', { text: '', outcome: 'cancelled' }, { admission_id: 'own', seq: 1 });
      } else defaults(req);
    };
    const sent = client.send('session-1', 'Hi', 'input', () => {});
    await Promise.resolve(); await Promise.resolve();
    await client.command('session-1', '/stop'); await sent;
    expect(calls.find(r => r.method === 'session.interrupt')?.params).toEqual({ session_id: 'session-1', execution_generation: 12 });
  });
  it('never reports Stop succeeded when the admission result is unknown', async () => {
    await ready(); handle = req => { if (req.method !== 'prompt.submit') defaults(req); };
    const sent = expect(client.send('session-1', 'Hi', 'input', () => {})).rejects.toMatchObject({ uncertain: true });
    const stopped = expect(client.command('session-1', '/stop')).rejects.toMatchObject({ uncertain: true });
    await vi.advanceTimersByTimeAsync(31_000);
    await sent; await stopped;
    expect(calls.some(r => r.method === 'session.interrupt' || r.method === 'process.stop')).toBe(false);
  });
});
