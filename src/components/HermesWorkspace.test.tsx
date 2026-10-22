// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HermesWorkspace } from './HermesWorkspace';
import type { Conversation } from '../types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function props(content = '') {
  const conversation: Conversation = { id: 'conversation-1', profileId: 'hermes-1', title: 'Test conversation', draft: '', createdAt: 1, messages: content ? [{ id: 'message-1', role: 'assistant', content, createdAt: 1, status: 'complete' }] : [] };
  return { profiles: [{ id: 'hermes-1', name: 'Configured Hermes', url: 'https://example.com/v1', token: '', model: 'my-model' }], conversations: [conversation], activeId: conversation.id, preview: false, streamingIds: new Set<string>(), toolActivity: {}, onAddProfile: vi.fn(), onCreate: vi.fn(() => 'new-id'), onSelect: vi.fn(), onDelete: vi.fn(), onRename: vi.fn(), onDraft: vi.fn(), onSend: vi.fn(async () => {}) };
}

describe('Hermes UI boundaries', () => {
  it('does not fetch remote images and only makes http/https links navigable', () => {
    render(<HermesWorkspace {...props('[Safe link](https://example.com/docs)\n\n[Unsafe](javascript:alert%281%29)\n\n![External image](https://example.com/tracker.png)')}/>);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://example.com/docs');
    expect(links[0].getAttribute('rel')).toBe('noopener noreferrer');
    expect(screen.getByText('Gambar eksternal tidak dimuat: External image')).toBeTruthy();
  });

  it('copies code as text without sending a message or invoking terminal execution', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const callbacks = props('```sh\necho reviewed\n```');
    render(<HermesWorkspace {...callbacks}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Salin' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith('echo reviewed'));
    expect(callbacks.onSend).not.toHaveBeenCalled();
  });

  it('keeps preview drafts editable while disabling network sends', () => {
    const callbacks = props();
    callbacks.conversations[0].draft = 'Existing draft';
    render(<HermesWorkspace {...callbacks} preview/>);
    fireEvent.change(screen.getByLabelText('Pesan untuk Agent'), { target: { value: 'Edited draft' } });
    expect(callbacks.onDraft).toHaveBeenCalledWith('conversation-1', 'Edited draft');
    expect((screen.getByRole('button', { name: 'Kirim pesan' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Pesan untuk Agent'), { key: 'Enter' });
    expect(callbacks.onSend).not.toHaveBeenCalled();
  });
});
