import { setLanguage } from './i18n';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyState, normalizeHermesUrl, normalizeGatewayUrl, sanitizePaste, recoverState, validateVps, conversationHistory } from './domain';
import type { Conversation, VpsProfile } from '../types';

describe('Hermes endpoint boundaries', () => {
  it('normalizes a deployment prefix without duplicating v1', () => {
    expect(normalizeHermesUrl('https://agent.example/hermes/')).toBe('https://agent.example/hermes/v1');
    expect(normalizeHermesUrl('https://agent.example/v1/')).toBe('https://agent.example/v1');
  });
  it.each(['http://example.com', 'http://localhost:8642', 'http://localhost.evil:8642', 'https://user:pass@example.com', 'https://example.com/?token=secret', 'file:///etc/passwd', 'https://example.com/#token'])('rejects unsafe address %s', value => {
    expect(() => normalizeHermesUrl(value)).toThrow();
  });
  it.each(['http://127.0.0.1:8642','http://[::1]:8642'])('allows local development %s', value => {
    expect(normalizeHermesUrl(value)).toContain('/v1');
  });
});
describe('Gateway endpoint boundaries', () => {
  it('accepts secure endpoints with a reverse proxy prefix', () => {
    expect(normalizeGatewayUrl(' wss://agent.example/hermes/api/ws ')).toBe('wss://agent.example/hermes/api/ws');
    expect(normalizeGatewayUrl('ws://127.0.0.1:8080/api/ws')).toBe('ws://127.0.0.1:8080/api/ws');
    expect(normalizeGatewayUrl('ws://[::1]:8080/api/ws')).toBe('ws://[::1]:8080/api/ws');
  });
  it.each(['ws://example.com/api/ws','ws://localhost/api/ws','wss://user:pass@example.com/api/ws','wss://example.com/api/ws?token=x','wss://example.com/api/ws#x','https://example.com/api/ws','wss://example.com/v1','wss://exa\nmple.com/api/ws'])('rejects incompatible or unsafe Gateway endpoint %s', url => {
    expect(()=>normalizeGatewayUrl(url)).toThrow();
  });
});
describe('terminal paste', () => {
  it('removes escape/control injection and normalizes line endings', () => {
    expect(sanitizePaste('ls\r\necho hello\x1b[31m\x03\x00\x9b')).toBe('ls\necho hello[31m');
  });
  it('keeps Unicode, tab and line feed for explicit preview', () => {
    expect(sanitizePaste('猫\t🙂\n')).toBe('猫\t🙂\n');
  });
});
describe('persistent conversation state', () => {
  it('opens legacy conversations without requiring an execution log',()=>{
    const s=emptyState();s.conversations=[{id:'a',profileId:'p',title:'Legacy',draft:'',createdAt:1,messages:[]}];
    expect(recoverState(s).conversations[0].executionLog??[]).toEqual([]);
  });
  it('marks unfinished log requests unknown once on recovery, including legacy streaming messages',()=>{
    const s=emptyState();s.conversations=[{id:'a',profileId:'p',title:'Interrupted',draft:'',createdAt:1,messages:[
      {id:'m',role:'assistant',content:'partial',createdAt:2,status:'streaming',requestId:'legacy-request'},
    ],executionLog:[
      {id:'e1',requestId:'active-request',timestamp:1,kind:'request',text:'Request started'},
      {id:'e2',requestId:'active-request',timestamp:2,kind:'tool',text:'Deploying'},
      {id:'e3',requestId:'complete-request',timestamp:3,kind:'complete',text:'Response complete'},
    ]}];
    const recovered=recoverState(s);
    const log=recovered.conversations[0].executionLog??[];
    expect(log.map(entry=>entry.kind)).toEqual(['request','tool','complete','unknown','unknown']);
    expect(log.filter(entry=>entry.kind==='unknown').map(entry=>entry.requestId)).toEqual(['active-request','legacy-request']);
    expect(recoverState(recovered).conversations[0].executionLog).toEqual(log);
    expect(s.conversations[0].executionLog).toHaveLength(3);
  });
  it('sanitizes malformed history and caps saved log text and entries without mutating input',()=>{
    const valid={id:'entry',requestId:'request',timestamp:1,kind:'complete',text:'x'.repeat(5000)};
    const source={...emptyState(),conversations:[{id:'a',profileId:'p',title:'Saved',draft:'',createdAt:1,messages:[],executionLog:[
      null,{...valid,id:'bad-time',timestamp:NaN},{...valid,id:'bad-kind',kind:'invented'},
      {...valid,id:'bad-text',text:42},
      ...Array.from({length:205},(_,index)=>({...valid,id:`entry-${index}`,requestId:`request-${index}`})),
    ]}]};
    const log=recoverState(source).conversations[0].executionLog??[];
    expect(log).toHaveLength(200);
    expect(log[0].id).toBe('entry-5');
    expect(log.every(entry=>entry.text.length===4000)).toBe(true);
    expect(source.conversations[0].executionLog.at(-1)?.text).toHaveLength(5000);
    expect(recoverState({...source,conversations:[{...source.conversations[0],executionLog:'broken'}]}).conversations[0].executionLog??[]).toEqual([]);
  });
  it('creates isolated per-install state', () => {
    expect(emptyState().deviceId).not.toBe(emptyState().deviceId);
  });
  it('marks interrupted requests unknown without resending or losing ID', () => {
    const s=emptyState();
    s.conversations.push({id:'chat-a',profileId:'p',title:'Test',draft:'draft',createdAt:1,messages:[{id:'m',role:'assistant',content:'partial',createdAt:2,status:'streaming',requestId:'r'}]});
    const recovered=recoverState(s);
    expect(recovered.conversations[0].messages[0]).toMatchObject({status:'unknown',content:'partial',requestId:'r'});
    expect(recovered.conversations[0].draft).toBe('draft');
  });
  it('fails closed for unsupported or corrupted saved data', () => {
    expect(()=>recoverState({version:2})).toThrow();
    expect(()=>recoverState({...emptyState(),vps:'broken'})).toThrow();
  });
  it('does not send partial assistant messages as completed history', () => {
    const c:Conversation={id:'a',profileId:'p',title:'a',draft:'',createdAt:1,messages:[
      {id:'1',role:'user',content:'hello',createdAt:1,status:'sent'},
      {id:'2',role:'assistant',content:'partial',createdAt:2,status:'unknown'},
      {id:'3',role:'assistant',content:'done',createdAt:3,status:'complete'}]};
    expect(conversationHistory(c)).toEqual([{role:'user',content:'hello'},{role:'assistant',content:'done'}]);
  });
});
describe('SSH profiles', () => {
  const valid:VpsProfile={id:'p',name:'VPS',host:'example.com',port:22,username:'deploy',auth:'password',password:'secret',privateKey:'',passphrase:''};
  it('accepts valid profile and rejects invalid ports and empty credentials',()=>{
    expect(()=>validateVps(valid)).not.toThrow();
    expect(()=>validateVps({...valid,port:0})).toThrow();
    expect(()=>validateVps({...valid,password:''})).toThrow();
    expect(()=>validateVps({...valid,host:'https://host'})).toThrow();
  });
});

describe('persisted command recovery', () => {
  it.each([
    ['/model next:model', 'unknown'], ['/model next:model', 'pending'],
    ['/compact focus', 'unknown'], ['/compact focus', 'pending'],
  ])('retains uncertainty from %s (%s) after its result card is pruned', (command, status) => {
    const source = { ...emptyState(), conversations: [{ id: 'conversation-1', profileId: 'profile-1', title: 'Chat', draft: '', createdAt: 1, messages: [], commandResults: [
      { id: 'uncertain-mutation', command, content: 'No confirmation', createdAt: 1, status },
      ...Array.from({ length: 100 }, (_, index) => ({ id: `help-${index}`, command: '/help', content: 'Help', createdAt: index + 2, status: 'complete' })),
    ] }] };
    const first = recoverState(source);
    expect(first.conversations[0].commandResults).toHaveLength(100);
    expect(first.conversations[0].commandResults?.some(result => result.id === 'uncertain-mutation')).toBe(false);
    expect(first.conversations[0]).toMatchObject({ gatewayStateUncertain: true });
    expect(recoverState(first).conversations[0]).toMatchObject({ gatewayStateUncertain: true });
  });
  it('preserves only a true saved uncertainty flag and ignores malformed mutation records', () => {
    const conversation = { id: 'conversation-1', profileId: 'profile-1', title: 'Chat', draft: '', createdAt: 1, messages: [], commandResults: [
      null, { command: '/model next', status: 'unknown' },
      { id: 'bad-content', command: '/compact', content: null, createdAt: 1, status: 'pending' },
      { id: 'read-only', command: '/status', content: 'Unknown read', createdAt: 2, status: 'unknown' },
      { id: 'known-model', command: '/model next', content: 'Done', createdAt: 3, status: 'complete' },
    ] };
    expect(recoverState({ ...emptyState(), conversations: [{ ...conversation, gatewayStateUncertain: true }] }).conversations[0]).toMatchObject({ gatewayStateUncertain: true });
    for (const flag of [undefined, false, 'true', 1]) {
      expect(recoverState({ ...emptyState(), conversations: [{ ...conversation, gatewayStateUncertain: flag }] }).conversations[0]).toMatchObject({ gatewayStateUncertain: undefined });
    }
  });

  it('recovers pending command results separately from assistant history', () => {
    const state = emptyState();
    state.conversations = [{ id: 'conversation-1', profileId: 'profile-1', title: 'Chat', draft: '', createdAt: 1, gatewaySessionId: 'server-session-1', messages: [
      { id: 'user-1', role: 'user', content: 'Hello', createdAt: 1, status: 'sent' },
      { id: 'assistant-1', role: 'assistant', content: 'Hi', createdAt: 2, status: 'complete' },
    ], commandResults: [
      { id: 'command-1', command: '/status', content: 'Waiting', createdAt: 3, status: 'pending' },
      { id: 'command-2', command: '/usage', content: 'Private usage details', createdAt: 4, status: 'complete' },
    ] }];
    const conversation = recoverState(state).conversations[0];
    expect(conversation.gatewaySessionId).toBe('server-session-1');
    expect(conversation.commandResults?.[0].status).toBe('unknown');
    expect(conversation.commandResults?.[0].content).toContain('Tidak dikirim ulang');
    expect(conversationHistory(conversation)).toEqual([{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi' }]);
    expect(state.conversations[0].commandResults?.[0].status).toBe('pending');
  });
  it.each([undefined, null, '', '   ', 123, 'x'.repeat(513)])('discards invalid saved Gateway session IDs (%s)', gatewaySessionId => {
    const source = { ...emptyState(), conversations: [{ id: 'conversation-1', profileId: 'profile-1', title: 'Chat', draft: '', createdAt: 1, messages: [], gatewaySessionId, commandResults: [null, { id: 'bad', content: 'Wrong shape' }] }] };
    const conversation = recoverState(source).conversations[0];
    expect(conversation.gatewaySessionId).toBeUndefined();
    expect(conversation.commandResults).toEqual([]);
  });
  it('restores profile identity separately for connections, sessions, and replies',()=>{
    const source={...emptyState(),hermes:[{id:'p',url:'https://example.test/v1',name:'Connection',model:'brain',token:'',agentProfile:' Configured '}],conversations:[{id:'c',profileId:'p',title:'Chat',draft:'',createdAt:1,agentProfile:'Leveret',messages:[{id:'u',role:'user',content:'Hello',createdAt:1,status:'sent',agentProfile:'Wrong user identity'},{id:'a',role:'assistant',content:'Hi',createdAt:2,status:'complete',agentProfile:'Older profile'}]}]};
    const restored=recoverState(source);
    expect(restored.hermes[0].agentProfile).toBe('Configured');expect(restored.hermes[0].model).toBe('brain');
    expect(restored.conversations[0].agentProfile).toBe('Leveret');
    expect(restored.conversations[0].messages.map(m=>m.agentProfile)).toEqual([undefined,'Older profile']);
    expect(conversationHistory(restored.conversations[0])).toEqual([{role:'user',content:'Hello'},{role:'assistant',content:'Hi'}]);
  });
  it.each([null,123,'x'.repeat(81),'/private/profile','C:\\private\\profile','bad\nprofile'])('discards malformed profile labels (%s)',agentProfile=>{
    const source={...emptyState(),hermes:[{id:'p',url:'https://example.test/v1',agentProfile}],conversations:[{id:'c',profileId:'p',title:'Chat',draft:'',createdAt:1,agentProfile,messages:[{id:'a',role:'assistant',content:'Hi',createdAt:2,status:'complete',agentProfile}]}]};
    const restored=recoverState(source);expect(restored.hermes[0].agentProfile).toBeUndefined();expect(restored.conversations[0].agentProfile).toBeUndefined();expect(restored.conversations[0].messages[0].agentProfile).toBeUndefined();
  });
});

beforeEach(() => setLanguage('id'));
