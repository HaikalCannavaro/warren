import { expect, it } from 'vitest';
import { emptyState, recoverState } from './domain';
import { mergeBackgroundJobs, type BackgroundJob } from './backgroundChat';

function pending() {
  const state=emptyState();
  state.conversations=[{id:'chat',profileId:'agent',title:'Task',draft:'',createdAt:1,messages:[{id:'reply',role:'assistant',content:'partial',createdAt:1,status:'streaming',background:true,requestId:'request',backgroundRequest:{deviceId:state.deviceId,conversationId:'chat',submissionId:'request',text:'hello'}}]}];
  return state;
}
const reply: BackgroundJob={submissionId:'request',conversationId:'chat',profileId:'agent',state:'complete',text:'Saved final',sessionId:'canonical-session',agentProfile:'Leveret'};
it('preserves a durable background intent through vault recovery while ordinary streams become unknown',()=>{
  const state=pending();state.conversations[0].messages.push({id:'ordinary',role:'assistant',content:'',createdAt:1,status:'streaming'});
  const restored=recoverState(state);
  expect(restored.conversations[0].messages.map(m=>m.status)).toEqual(['streaming','unknown']);
  expect(restored.conversations[0].messages[0].backgroundRequest?.submissionId).toBe('request');
});
it('matches results by submission, conversation and profile and retains the request until a final result',()=>{
  const state=pending();
  expect(mergeBackgroundJobs(state,[{...reply,profileId:'other'}]).state.conversations[0].messages[0].content).toBe('partial');
  const running=mergeBackgroundJobs(state,[{...reply,state:'running'}]);
  expect(running.acknowledge).toEqual([]);expect(running.state.conversations[0].messages[0].backgroundRequest).toBeTruthy();
  const final=mergeBackgroundJobs(state,[reply]);
  expect(final.acknowledge).toEqual(['request']);expect(final.state.conversations[0].gatewaySessionId).toBe('canonical-session');
  expect(final.state.conversations[0].messages[0]).toMatchObject({content:'Saved final',status:'complete',backgroundRequest:undefined});
});
it('refuses malformed native results and never regresses a completed response to a running state',()=>{
  expect(()=>mergeBackgroundJobs(pending(),[{...reply,state:'unexpected'}])).toThrow();
  const final=mergeBackgroundJobs(pending(),[reply]).state;
  expect(mergeBackgroundJobs(final,[{...reply,state:'running',text:'old partial'}]).state.conversations[0].messages[0]).toMatchObject({content:'Saved final',status:'complete'});
});
