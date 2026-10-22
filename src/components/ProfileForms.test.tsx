// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HermesForm } from './ProfileForms';

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
