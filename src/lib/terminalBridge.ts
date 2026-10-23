import type { Terminal } from '@xterm/xterm';

// Registry of active xterm instances by session id
const terminals = new Map<string, Terminal>();

export function registerTerminal(sessionId: string, term: Terminal): () => void {
  terminals.set(sessionId, term);
  return () => {
    if (terminals.get(sessionId) === term) {
      terminals.delete(sessionId);
    }
  };
}

export function getRegisteredTerminal(sessionId: string): Terminal | undefined {
  return terminals.get(sessionId);
}

export function clearTerminalRegistry(): void {
  terminals.clear();
}

/**
 * Capture the last N lines (default 20) from the active xterm terminal buffer.
 */
export function captureTerminalBuffer(sessionId: string | null | undefined, requestedLines = 20): string {
  if (!sessionId) return '';
  const term = terminals.get(sessionId);
  if (!term) return '';

  const lines = Math.max(1, Math.min(requestedLines || 20, 500));

  // 1. Inspect real xterm buffer
  if (term.buffer?.active) {
    const buf = term.buffer.active;
    const totalLines = buf.length;
    const startLine = Math.max(0, totalLines - lines);
    const extracted: string[] = [];
    for (let i = startLine; i < totalLines; i++) {
      const line = buf.getLine(i);
      if (line) {
        extracted.push(line.translateToString(true));
      }
    }
    // Trim empty trailing lines from the end of terminal scrollback
    while (extracted.length && !extracted[extracted.length - 1].trim()) {
      extracted.pop();
    }
    return extracted.join('\n');
  }

  // 2. Fallback for test harness / mocked terminals with `_testBuffer`
  if ((term as any)._testBuffer && Array.isArray((term as any)._testBuffer)) {
    const buf = (term as any)._testBuffer as string[];
    const start = Math.max(0, buf.length - lines);
    const extracted = buf.slice(start);
    while (extracted.length && !extracted[extracted.length - 1].trim()) {
      extracted.pop();
    }
    return extracted.join('\n');
  }

  return '';
}
