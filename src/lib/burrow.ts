import { FLEET_SPECIALISTS } from './fleet';
export const SPECIALISTS = FLEET_SPECIALISTS;
export type A2ASpecialist = typeof SPECIALISTS[number];
export type A2AAgent = 'Leveret' | A2ASpecialist | 'Unknown';
export type A2AStatus = 'completed' | 'running' | 'failed' | 'unknown';
export interface A2AAuditItem {
  ts: number;
  direction: string;
  peer: string;
  task_id: string;
  summary: string;
  status: string;
  context_id?: string;
}
export interface A2AAuditEntry extends A2AAuditItem { id: string; raw: Record<string, unknown>; }
export interface A2AMessageTurn {
  id: string;
  speaker: A2AAgent;
  timestamp: number | null;
  content: string;
  status: A2AStatus;
  hasEvidence: boolean;
  hasVerification: boolean;
  raw: Record<string, unknown>;
}
export interface A2ATranscript {
  items: A2AMessageTurn[];
  skipped: number;
  raw: string;
  records: Record<string, unknown>[];
}
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const field = (record: Record<string, unknown>, ...keys: string[]): unknown => keys.map(key => record[key]).find(value => value !== undefined && value !== null);
const text = (value: unknown): string => typeof value === 'string' ? value : '';
export const validContextId = (value: string): boolean => /^[a-zA-Z0-9_-]{1,160}$/.test(value);
export function agentName(value: unknown): A2AAgent {
  const name = text(value).trim().toLowerCase().replace(/^agent[:/_-]/, '');
  return (['Leveret', ...SPECIALISTS] as const).find(agent => agent.toLowerCase() === name) ?? 'Unknown';
}
export function auditTimestamp(ts: number): number { return ts < 1e11 ? ts * 1000 : ts; }
function timestamp(value: unknown): number | null {
  const parsed = typeof value === 'number' ? auditTimestamp(value) : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) && Math.abs(parsed) <= 8.64e15 ? parsed : null;
}
export function auditStatus(value: string): A2AStatus {
  const name = value.toLowerCase();
  if (/error|fail|reject|cancel/.test(name)) return 'failed';
  if (/complete|finish|success|done|respond|result|response/.test(name)) return 'completed';
  if (/start|running|pending|submit|request|sent|working/.test(name)) return 'running';
  return 'unknown';
}
export function auditRoute(item: A2AAuditItem): { from: A2AAgent; to: A2AAgent; known: boolean } {
  const peer = agentName(item.peer);
  const value = item.direction.toLowerCase();
  if (/^(inbound|incoming|in|rx|recv|receive|received|response|from)(?:$|[_ -])/.test(value)) return { from: peer, to: 'Leveret', known: true };
  if (/^(outbound|outgoing|out|tx|send|sent|request|to)(?:$|[_ -])/.test(value)) return { from: 'Leveret', to: peer, known: true };
  return { from: 'Leveret', to: peer, known: false };
}
export function parseAuditLine(line: string): A2AAuditItem | null {
  let record: Record<string, unknown> | undefined;
  try { record = object(JSON.parse(line)); } catch { return null; }
  if (!record || typeof record.ts !== 'number' || !Number.isFinite(record.ts) || timestamp(record.ts) === null) return null;
  if (['direction', 'peer', 'task_id', 'summary', 'status'].some(key => typeof record[key] !== 'string')) return null;
  if (!text(record.peer).trim() || !text(record.direction).trim()) return null;
  // context_id is optional in the audit contract. Never guess it from task_id.
  const context = text(field(record, 'context_id', 'contextId') ?? object(record.metadata)?.context_id);
  return {
    ts: record.ts, direction: text(record.direction), peer: text(record.peer), task_id: text(record.task_id),
    summary: text(record.summary), status: text(record.status),
    ...(validContextId(context) ? { context_id: context } : {}),
  };
}
/** Incremental UTF-8 + JSONL decoder. A TCP/IPC chunk is never assumed to be a line. */
export class A2AStreamParser {
  private readonly decoder = new TextDecoder('utf-8', { fatal: false });
  private pending = '';
  private discarding = false;
  static readonly MAX_LINE_CHARS = 256 * 1024;
  push(bytes: Uint8Array): { items: { item: A2AAuditItem; raw: Record<string, unknown> }[]; skipped: number } {
    const chunks = this.decoder.decode(bytes, { stream: true }).split('\n');
    const items: { item: A2AAuditItem; raw: Record<string, unknown> }[] = [];
    let skipped = 0;
    for (let index = 0; index < chunks.length; index++) {
      if (!this.discarding) {
        if (this.pending.length + chunks[index].length > A2AStreamParser.MAX_LINE_CHARS) { this.discarding = true; this.pending = ''; }
        else this.pending += chunks[index];
      }
      if (index === chunks.length - 1) continue;
      if (this.discarding) skipped++;
      else if (this.pending.trim()) {
        const item = parseAuditLine(this.pending);
        if (item) items.push({ item, raw: JSON.parse(this.pending) as Record<string, unknown> });
        else skipped++;
      }
      this.pending = ''; this.discarding = false;
    }
    return { items, skipped };
  }
}
function content(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(part => typeof part === 'string' ? part : text(object(part)?.text)).filter(Boolean).join('\n\n');
  const item = object(value);
  return item ? text(item.text) || content(item.parts) || text(item.content) : '';
}
export function parseTranscript(raw: string, specialist: A2AAgent): A2ATranscript {
  const items: A2AMessageTurn[] = [];
  const records: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let record: Record<string, unknown> | undefined;
    try { record = object(JSON.parse(line)); } catch { skipped++; continue; }
    if (!record) { skipped++; continue; }
    records.push(record);
    const message = object(record.message) ?? object(record.payload) ?? record;
    const body = content(field(message, 'content', 'text', 'parts', 'message', 'body'));
    if (!body) { skipped++; continue; }
    const explicit = agentName(field(message, 'from_agent', 'sender', 'from', 'agent', 'source_agent', 'speaker') ?? field(record, 'from_agent', 'sender', 'from', 'agent', 'speaker'));
    const role = text(message.role).toLowerCase();
    const speaker = explicit !== 'Unknown' ? explicit : ['user', 'orchestrator', 'master'].includes(role) ? 'Leveret' : ['assistant', 'agent', 'specialist'].includes(role) ? specialist : 'Unknown';
    items.push({ id: `${text(field(record, 'message_id', 'id')) || 'turn'}-${index}`, speaker,
      timestamp: timestamp(field(record, 'timestamp', 'ts', 'created_at', 'time') ?? message.timestamp), content: body,
      status: auditStatus(text(field(record, 'status', 'state'))),
      hasEvidence: /^\s*(?:#{1,6}\s*)?(?:\*\*)?evidence[ _-]+manifest(?:\*\*)?\s*:?\s*$/im.test(body),
      hasVerification: /^\s*(?:#{1,6}\s*)?(?:\*\*)?(verification|verified|verifikasi)(?:\*\*)?\s*:?\s*$/im.test(body), raw: record,
    });
  }
  return { items, skipped, raw, records };
}
