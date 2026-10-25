import { describe, expect, it } from 'vitest';
import { A2AStreamParser, auditRoute, parseAuditLine, parseTranscript } from './burrow';

const line = (extra: Record<string, unknown> = {}) => JSON.stringify({ ts: 1792899720, direction: 'outbound', peer: 'forge', task_id: 'task-123', summary: 'Café 🌌', status: 'working', ...extra });
describe('Burrow JSONL streaming boundary', () => {
  it('reassembles every UTF-8 byte split, CRLF and multiple records without emitting partial lines', () => {
    const parser = new A2AStreamParser();
    const bytes = new TextEncoder().encode(`${line()}\r\n${line({ direction: 'inbound', summary: '完成' })}\n`);
    const received = [];
    for (const byte of bytes) received.push(...parser.push(new Uint8Array([byte])).items);
    expect(received.map(value => value.item.summary)).toEqual(['Café 🌌', '完成']);
    expect(received[0].raw.task_id).toBe('task-123');
    expect(parser.push(new TextEncoder().encode(line())).items).toEqual([]);
    expect(parser.push(new TextEncoder().encode('\n')).items).toHaveLength(1);
  });
  it('skips malformed and unsupported lines, then resynchronizes at the next newline', () => {
    const parser = new A2AStreamParser();
    const result = parser.push(new TextEncoder().encode(`broken\n{}\n[]\n\n${line()}\n`));
    expect(result.skipped).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(parseAuditLine(line({ ts: '2026-10-25' }))).toBeNull();
    expect(parseAuditLine(line({ ts: 1e30 }))).toBeNull();
  });
  it('bounds an unfinished oversized line and keeps the next record', () => {
    const parser = new A2AStreamParser();
    expect(parser.push(new TextEncoder().encode('x'.repeat(A2AStreamParser.MAX_LINE_CHARS + 1))).items).toEqual([]);
    const result = parser.push(new TextEncoder().encode(`discarded\n${line()}\n`));
    expect(result.skipped).toBe(1);
    expect(result.items).toHaveLength(1);
  });
  it('supports the actual audit schema without guessing a context filename from task_id', () => {
    const item = parseAuditLine(line());
    expect(item?.context_id).toBeUndefined();
    expect(item?.task_id).toBe('task-123');
    expect(auditRoute(item!)).toEqual({ from: 'Leveret', to: 'Forge', known: true });
    expect(auditRoute({ ...item!, direction: 'inbound', peer: 'sentinel' })).toEqual({ from: 'Sentinel', to: 'Leveret', known: true });
    expect(auditRoute({ ...item!, direction: 'unrecognized' }).known).toBe(false);
  });
});
it('parses messenger and A2A parts transcripts while preserving original audit copies', () => {
  const raw = [JSON.stringify({ role: 'user', content: 'Inspect this change.' }), JSON.stringify({ message: { role: 'agent', parts: [{ kind: 'text', text: '## EVIDENCE MANIFEST\n\n### Verification\nPASS' }] } }), 'bad-json'].join('\n');
  const transcript = parseTranscript(raw, 'Forge');
  expect(transcript.items.map(turn => turn.speaker)).toEqual(['Leveret', 'Forge']);
  expect(transcript.items[1].hasEvidence).toBe(true);
  expect(transcript.items[1].hasVerification).toBe(true);
  expect(transcript.skipped).toBe(1);
  expect(transcript.records).toHaveLength(2);
  expect(transcript.raw).toBe(raw);
});
it('reserves evidence and verification badges for sections rather than ordinary mentions', () => {
  const transcript = parseTranscript(JSON.stringify({ role: 'user', content: 'Please share the evidence manifest and verification checklist.' }), 'Forge');
  expect(transcript.items[0].hasEvidence).toBe(false);
  expect(transcript.items[0].hasVerification).toBe(false);
});
