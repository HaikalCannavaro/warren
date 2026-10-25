import { useEffect, useState } from 'react';
import { A2AStreamParser, type A2AAuditEntry } from '../lib/burrow';
import { listenBurrow, stopBurrow } from '../lib/native';

export type BurrowStreamStatus = 'connecting' | 'monitoring' | 'offline' | 'error';
export const MAX_BURROW_MESSAGES = 300;
export function useBurrow(sessionId: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ source: string; messages: A2AAuditEntry[]; skipped: number; dropped: number; status: BurrowStreamStatus; error: string }>({ source: '', messages: [], skipped: 0, dropped: 0, status: 'connecting', error: '' });
  const source = `${sessionId ?? 'offline'}:${attempt}`;
  useEffect(() => {
    let disposed = false;
    let sequence = 0;
    const listenerId = crypto.randomUUID();
    const parser = new A2AStreamParser();
    setState({ source, messages: [], skipped: 0, dropped: 0, status: sessionId ? 'connecting' : 'offline', error: '' });
    const receive = (bytes: Uint8Array) => {
      if (disposed) return;
      const parsed = parser.push(bytes);
      if (!parsed.items.length && !parsed.skipped) return;
      const entries = parsed.items.map(({ item, raw }) => ({ ...item, id: `${listenerId}:${sequence++}`, raw }));
      setState(previous => {
        if (previous.source !== source) return previous;
        const next = [...previous.messages, ...entries];
        return { ...previous, messages: next.slice(-MAX_BURROW_MESSAGES), skipped: previous.skipped + parsed.skipped, dropped: previous.dropped + Math.max(0, next.length - MAX_BURROW_MESSAGES) };
      });
    };
    if (!sessionId) return () => { disposed = true; };
    void listenBurrow(sessionId, listenerId, event => {
      if (disposed) return;
      if (event.type === 'data') receive(new Uint8Array(event.data));
      else setState(previous => previous.source === source ? { ...previous, status: event.status === 'closed' ? 'offline' : event.status, error: event.message ?? '' } : previous);
    }).then(() => {
      // Cleanup may have run before the asynchronous start command was admitted.
      if (disposed) void stopBurrow(listenerId).catch(() => {});
    }).catch(cause => {
      if (!disposed) setState(previous => previous.source === source ? { ...previous, status: 'error', error: cause instanceof Error ? cause.message : String(cause) } : previous);
    });
    return () => { disposed = true; void stopBurrow(listenerId).catch(() => {}); };
  }, [sessionId, source]);
  const current = state.source === source ? state : { messages: [], skipped: 0, dropped: 0, status: 'connecting' as const, error: '' };
  return {
    ...current, retry: () => setAttempt(value => value + 1),
    clear: () => setState(previous => previous.source === source ? { ...previous, messages: [], skipped: 0, dropped: 0 } : previous),
  };
}
