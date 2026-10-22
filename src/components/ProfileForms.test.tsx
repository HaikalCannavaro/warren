// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HermesForm } from './ProfileForms';
import { setLanguage } from '../lib/i18n';

beforeEach(() => setLanguage('id'));
afterEach(cleanup);

describe('Hermes API token requirement', () => {
  it('requires a token and rejects whitespace-only input before saving', () => {
    const onSave = vi.fn();
    const { container } = render(<HermesForm profile={{ id: 'h-1', name: 'Hermes', url: 'https://example.com/v1', model: 'model', token: '   ' }} onSave={onSave} onClose={vi.fn()}/>);
    const input = screen.getByLabelText(/^API token/) as HTMLInputElement;
    expect(input.required).toBe(true);
    expect(input.type).toBe('password');
    fireEvent.submit(container.querySelector('form')!);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('API token Hermes wajib diisi');
  });

  it('saves a valid token with incidental surrounding whitespace removed', () => {
    const onSave = vi.fn();
    const { container } = render(<HermesForm profile={{ id: 'h-1', name: 'Hermes', url: 'https://example.com/v1', model: 'model', token: '  api-server-key  ' }} onSave={onSave} onClose={vi.fn()}/>);
    fireEvent.submit(container.querySelector('form')!);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ token: 'api-server-key' }));
  });
});

describe('Hermes Gateway connection', () => {
  it('keeps the named Hermes profile separate from the API model parameter', () => {
    setLanguage('en');
    const onSave = vi.fn();
    const { container } = render(<HermesForm profile={{ id: 'h-1', name: 'Personal VPS', url: 'https://example.com/p/Leveret/v1', model: 'configured-api-alias', token: 'api-key' }} onSave={onSave} onClose={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText(/^Profile/), { target: { value: ' Leveret ' } });
    fireEvent.submit(container.querySelector('form')!);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Personal VPS', agentProfile: 'Leveret', model: 'configured-api-alias', url: 'https://example.com/p/Leveret/v1' }));
  });

  it('reveals Advanced when the HTTP API model parameter is missing, without using Profile as its value', () => {
    setLanguage('en');
    const onSave = vi.fn();
    const { container } = render(<HermesForm profile={{ id: 'h-1', name: 'Personal VPS', url: 'https://example.com/v1', model: '', token: 'api-key' }} onSave={onSave} onClose={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText(/^Profile/), { target: { value: 'Leveret' } });
    const advanced = container.querySelector('details')!;
    advanced.open = false;
    fireEvent(advanced, new Event('toggle'));
    expect(advanced.open).toBe(false);
    fireEvent.invalid(screen.getByLabelText(/^Model/));
    expect(advanced.open).toBe(true);
    fireEvent.submit(container.querySelector('form')!);
    expect(container.querySelector('details')?.open).toBe(true);
    expect((screen.getByLabelText(/^Model/) as HTMLInputElement).value).toBe('');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('uses English connection labels and validates a missing Gateway token in English', () => {
    setLanguage('en');
    const onSave = vi.fn();
    const { container } = render(<HermesForm profile={{ id: 'h-1', name: 'Leveret', transport: 'gateway', url: 'wss://example.com/api/ws', model: '', token: ' ' }} onSave={onSave} onClose={vi.fn()}/>);
    expect(screen.getByLabelText('Connection type')).toBeTruthy();
    fireEvent.submit(container.querySelector('form')!);
    expect(screen.getByRole('alert').textContent).toBe('A Gateway session token is required.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('switches interface language without changing entered connection details', () => {
    setLanguage('en');
    render(<HermesForm profile={{ id: 'h-1', name: 'Nama server saya', transport: 'gateway', url: 'wss://example.com/api/ws', model: '', token: 'session-token' }} onSave={vi.fn()} onClose={vi.fn()}/>);
    const name = screen.getByLabelText('Connection name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Leveret pribadi' } });
    act(() => setLanguage('id'));
    expect((screen.getByLabelText('Nama koneksi') as HTMLInputElement).value).toBe('Leveret pribadi');
    expect((screen.getByLabelText(/^Token Gateway/) as HTMLInputElement).value).toBe('session-token');
    expect(screen.getByRole('button', { name: 'Tutup dialog' })).toBeTruthy();
  });

  it('keeps old profiles on HTTP and clears endpoint credentials when switching transport', () => {
    render(<HermesForm profile={{ id: 'h-1', name: 'Hermes', url: 'https://example.com/v1', model: 'model', token: 'api-key' }} onSave={vi.fn()} onClose={vi.fn()}/>);
    const transport = screen.getByLabelText('Jenis koneksi') as HTMLSelectElement;
    expect(transport.value).toBe('openai');
    fireEvent.change(transport, { target: { value: 'gateway' } });
    expect((screen.getByLabelText(/^URL server/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^Token Gateway/) as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/Mengganti jenis koneksi/)).toBeTruthy();
  });

  it('saves the full Gateway URL and session token with no model requirement', () => {
    const onSave = vi.fn();
    const { container } = render(<HermesForm profile={{ id: 'h-1', name: 'Hermes', transport: 'gateway', url: 'wss://example.com/api/ws', model: '', token: ' session-token ' }} onSave={onSave} onClose={vi.fn()}/>);
    expect((screen.getByLabelText(/^Model/) as HTMLInputElement).required).toBe(false);
    fireEvent.submit(container.querySelector('form')!);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ transport: 'gateway', url: 'wss://example.com/api/ws', token: 'session-token', model: '' }));
  });
});
