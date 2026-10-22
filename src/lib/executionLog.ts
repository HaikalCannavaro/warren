import type { Conversation, ExecutionLogEntry } from '../types';

const MAX_LOG_ENTRIES=200;
export const MAX_LOG_TEXT=4000;
const kinds=new Set<ExecutionLogEntry['kind']>(['request','tool','response','complete','error','unknown']);
const terminalKinds=new Set<ExecutionLogEntry['kind']>(['complete','error','unknown']);

export function appendExecutionLog(entries:ExecutionLogEntry[]|undefined,requestId:string,kind:ExecutionLogEntry['kind'],text:string):ExecutionLogEntry[] {
  const current=entries??[];
  // A request has one terminal outcome; late callbacks cannot turn uncertainty into success.
  if(current.some(entry=>entry.requestId===requestId&&terminalKinds.has(entry.kind)))return current;
  const entry:ExecutionLogEntry={id:crypto.randomUUID(),requestId,timestamp:Date.now(),kind,text:text.slice(0,MAX_LOG_TEXT)};
  return [...current.slice(-(MAX_LOG_ENTRIES-1)),entry];
}

export function sanitizeExecutionLog(input:unknown):ExecutionLogEntry[] {
  if(!Array.isArray(input))return [];
  const entries:ExecutionLogEntry[]=[];
  const ids=new Set<string>();
  const ended=new Set<string>();
  for(const candidate of input) {
    if(!candidate||typeof candidate!=='object')continue;
    const entry=candidate as Partial<ExecutionLogEntry>;
    if(typeof entry.id!=='string'||!entry.id||typeof entry.requestId!=='string'||!entry.requestId||
      typeof entry.timestamp!=='number'||!Number.isFinite(entry.timestamp)||entry.timestamp<0||
      !entry.kind||!kinds.has(entry.kind)||typeof entry.text!=='string'||ids.has(entry.id)||ended.has(entry.requestId))continue;
    ids.add(entry.id);
    if(terminalKinds.has(entry.kind))ended.add(entry.requestId);
    entries.push({id:entry.id,requestId:entry.requestId,timestamp:entry.timestamp,kind:entry.kind,text:entry.text.slice(0,MAX_LOG_TEXT)});
  }
  return entries.slice(-MAX_LOG_ENTRIES);
}

export function interruptExecutionLog(conversation:Conversation,reason:string):ExecutionLogEntry[] {
  let entries=sanitizeExecutionLog(conversation.executionLog);
  const pending=new Set<string>();
  const ended=new Set(entries.filter(entry=>terminalKinds.has(entry.kind)).map(entry=>entry.requestId));
  for(const entry of entries)if(!ended.has(entry.requestId))pending.add(entry.requestId);
  for(const message of conversation.messages) {
    if(message.role==='assistant'&&message.status==='streaming'&&message.requestId&&!ended.has(message.requestId))pending.add(message.requestId);
  }
  for(const requestId of pending)entries=appendExecutionLog(entries,requestId,'unknown',reason);
  return entries;
}
