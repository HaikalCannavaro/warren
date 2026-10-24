import { expect, it } from 'vitest';
import { sanitizeToolCalls } from './toolExecution';
import { encodeTerminalKey } from './terminalKeys';
import { emptyState, recoverState } from './domain';
it('retains recorded tool output and marks interrupted calls unknown on recovery',()=>{
  const state=emptyState();state.conversations=[{id:'c',profileId:'p',title:'Task',draft:'',createdAt:1,messages:[{id:'m',role:'assistant',content:'',status:'streaming',createdAt:1,tools:[{id:'t',name:'terminal',param:'npm test',state:'running',duration:'',args:{command:'npm test'},group:2}]}]}];
  const recovered=recoverState(state).conversations[0].messages[0];expect(recovered.status).toBe('unknown');expect(recovered.tools?.[0]).toMatchObject({id:'t',state:'unknown',args:{command:'npm test'},group:2});
});
it('bounds and validates persisted tool metadata',()=>{
  expect(sanitizeToolCalls([null,{id:'bad',name:'x',state:'invalid'}])).toEqual([]);
  const result=sanitizeToolCalls([{id:'t',name:'terminal',state:'done',output:'x'.repeat(9000),args:{large:'x'.repeat(9000)}}]);expect(result?.[0].output).toHaveLength(4000);expect(result?.[0].args).toBeUndefined();
});
it('encodes actual terminal control and alt sequences without changing ordinary input',()=>{
  expect(encodeTerminalKey('c','ctrl')).toBe('\x03');expect(encodeTerminalKey('[','ctrl')).toBe('\x1b');expect(encodeTerminalKey('?','ctrl')).toBe('\x7f');expect(encodeTerminalKey('x','alt')).toBe('\x1bx');expect(encodeTerminalKey('猫',null)).toBe('猫');expect(encodeTerminalKey('paste\ntext','ctrl')).toBe('paste\ntext');
});
