// @vitest-environment jsdom
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ExecutionLogEntry } from '../types';
import { ToolActivityPanel } from './ToolActivityPanel';
import { setLanguage } from '../lib/i18n';

beforeEach(() => setLanguage('en'));
afterEach(cleanup);

function props(entries: ExecutionLogEntry[] = []) {
  return { id: 'test-activity', panelRef: createRef<HTMLElement>(), open: true, overlay: false, obscured: false, conversationId: 'conversation-1', entries, streaming: false, onClose: vi.fn() };
}

describe('Tool activity log', () => {
  it('orders actual events by timestamp, labels request completion separately, and renders unsafe content as plain text', () => {
    const unsafe = '<img src="https://tracker.example" onerror="alert(1)"><script>alert(2)</script> [Run](javascript:alert(3))';
    render(<ToolActivityPanel {...props([
      { id: 'complete', requestId: 'request-1', timestamp: 3, kind: 'complete', text: 'Response stream ended' },
      { id: 'tool', requestId: 'request-1', timestamp: 2, kind: 'tool', text: unsafe },
      { id: 'request', requestId: 'request-1', timestamp: 1, kind: 'request', text: 'Request sent to server' },
    ])}/>);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.execution-entry-kind')?.textContent)).toEqual(['Request started', 'Tool update', 'Request complete']);
    expect(rows[0].querySelector('time')?.getAttribute('datetime')).toBe(new Date(1).toISOString());
    expect(within(rows[1]).getByText(unsafe)).toBeTruthy();
    expect(rows[1].querySelector('img, script, a, button')).toBeNull();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.queryByText(/^(Tool complete|Tool succeeded)$/i)).toBeNull();
    expect(document.querySelector('.execution-status-dot')).toBeNull();
  });

  it('only shows active status while a real stream is running and reports uncertain or failed endings', () => {
    const callbacks = props([{ id: 'tool', requestId: 'request-1', timestamp: 1, kind: 'tool', text: 'Server progress only' }]);
    const { rerender } = render(<ToolActivityPanel {...callbacks} streaming/>);
    expect(screen.getByText('Running')).toBeTruthy();
    expect(document.querySelector('.execution-status-dot')).toBeTruthy();
    rerender(<ToolActivityPanel {...callbacks}/>);
    expect(within(screen.getByRole('status')).getByText('Status unknown')).toBeTruthy();
    expect(document.querySelector('.execution-status-dot')).toBeNull();
    rerender(<ToolActivityPanel {...callbacks} entries={[...callbacks.entries, { id: 'error', requestId: 'request-1', timestamp: 2, kind: 'error', text: 'Server rejected request' }]}/>);
    expect(within(screen.getByRole('status')).getByText('Error')).toBeTruthy();
  });

  it.each([
    ['unknown', 'Status unknown'],
    ['error', 'Error'],
    ['complete', 'Ready'],
  ] as const)('prioritizes a terminal %s event over a still-pending native invocation', (kind, status) => {
    render(<ToolActivityPanel {...props([{ id: 'terminal', requestId: 'request-1', timestamp: 2, kind, text: 'Terminal event' }])} streaming/>);
    expect(within(screen.getByRole('status')).getByText(status)).toBeTruthy();
    expect(screen.queryByText('Running')).toBeNull();
    expect(document.querySelector('.execution-status-dot')).toBeNull();
  });

  it('still reports a known running stream before the first log event is available', () => {
    render(<ToolActivityPanel {...props()} streaming/>);
    expect(screen.getByText('Running')).toBeTruthy();
    expect(document.querySelector('.execution-status-dot')).toBeTruthy();
  });

  it('follows new events only while the reader is at the end, including after hiding and reopening', () => {
    const callbacks = props([{ id: 'request', requestId: 'request-1', timestamp: 1, kind: 'request', text: 'First event' }]);
    const { rerender } = render(<ToolActivityPanel {...callbacks} streaming/>);
    const list = screen.getByRole('list', { name: 'Execution log entries' });
    Object.defineProperties(list, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 200 } });
    list.scrollTop = 100;
    fireEvent.scroll(list);
    const next = [...callbacks.entries, { id: 'tool-1', requestId: 'request-1', timestamp: 2, kind: 'tool' as const, text: 'Second event' }];
    rerender(<ToolActivityPanel {...callbacks} entries={next} streaming/>);
    expect(list.scrollTop).toBe(100);
    rerender(<ToolActivityPanel {...callbacks} entries={next} streaming open={false}/>);
    rerender(<ToolActivityPanel {...callbacks} entries={next} streaming/>);
    expect(list.scrollTop).toBe(100);
    list.scrollTop = 800;
    fireEvent.scroll(list);
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 1200 });
    rerender(<ToolActivityPanel {...callbacks} entries={[...next, { id: 'tool-2', requestId: 'request-1', timestamp: 3, kind: 'tool', text: 'Third event' }]} streaming/>);
    expect(list.scrollTop).toBe(1200);
  });
});
