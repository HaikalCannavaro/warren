import { beforeEach, describe, expect, it } from 'vitest';
import { captureTerminalBuffer, clearTerminalRegistry, registerTerminal } from './terminalBridge';
import type { Terminal } from '@xterm/xterm';

describe('terminal bridge and buffer capture', () => {
  beforeEach(() => {
    clearTerminalRegistry();
  });

  it('returns empty string when no session id or unregistered session is given', () => {
    expect(captureTerminalBuffer(null)).toBe('');
    expect(captureTerminalBuffer(undefined)).toBe('');
    expect(captureTerminalBuffer('non-existent')).toBe('');
  });

  it('captures lines from terminal buffer via test buffer fallback', () => {
    const mockTerm = {
      _testBuffer: ['line 1', 'line 2', 'line 3', 'line 4', 'line 5'],
    } as unknown as Terminal;

    const unregister = registerTerminal('sess-1', mockTerm);
    expect(captureTerminalBuffer('sess-1', 3)).toBe('line 3\nline 4\nline 5');
    expect(captureTerminalBuffer('sess-1', 10)).toBe('line 1\nline 2\nline 3\nline 4\nline 5');

    unregister();
    expect(captureTerminalBuffer('sess-1')).toBe('');
  });

  it('captures lines from active xterm buffer', () => {
    const lines = [
      'user@host:~$ ls -la',
      'total 24',
      'drwxr-xr-x 2 user user 4096 Oct 23 10:00 .',
      'drwxr-xr-x 4 user user 4096 Oct 23 09:59 ..',
      '-rw-r--r-- 1 user user  220 Oct 23 09:59 .bashrc',
      'user@host:~$ cat log.txt',
      'SUCCESS: Job complete',
    ];

    const mockTerm = {
      buffer: {
        active: {
          length: lines.length,
          getLine: (i: number) => ({
            translateToString: (trimRight?: boolean) => {
              const text = lines[i] ?? '';
              return trimRight ? text.trimEnd() : text;
            },
          }),
        },
      },
    } as unknown as Terminal;

    registerTerminal('sess-xterm', mockTerm);
    const captured2 = captureTerminalBuffer('sess-xterm', 2);
    expect(captured2).toBe('user@host:~$ cat log.txt\nSUCCESS: Job complete');

    const capturedDefault = captureTerminalBuffer('sess-xterm');
    expect(capturedDefault.split('\n')).toHaveLength(7);
  });

  it('handles empty lines and clamps lines request', () => {
    const mockTerm = {
      _testBuffer: ['', '  ', ''],
    } as unknown as Terminal;

    registerTerminal('sess-empty', mockTerm);
    expect(captureTerminalBuffer('sess-empty', 20)).toBe('');
  });
});
