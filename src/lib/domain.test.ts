import { describe, expect, it } from 'vitest';
import { emptyState, normalizeHermesUrl, sanitizePaste, recoverState, validateVps, conversationHistory } from './domain';
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
describe('terminal paste', () => {
  it('removes escape/control injection and normalizes line endings', () => {
    expect(sanitizePaste('ls\r\necho hello\x1b[31m\x03\x00\x9b')).toBe('ls\necho hello[31m');
  });
  it('keeps Unicode, tab and line feed for explicit preview', () => {
    expect(sanitizePaste('猫\t🙂\n')).toBe('猫\t🙂\n');
  });
});
describe('persistent conversation state', () => {
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
