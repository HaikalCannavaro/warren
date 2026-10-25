import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SelectMenu, selectPosition } from './SelectMenu';
afterEach(cleanup);
const options = [{ value: 'forge', label: 'Forge', detail: 'Backend' }, { value: 'atlas', label: 'Atlas', disabled: true }, { value: 'sentinel', label: 'Sentinel', detail: 'Security' }];
it('supports keyboard navigation without choosing disabled options', () => {
  const changed = vi.fn();
  function Example() { const [value, setValue] = useState('forge'); return <SelectMenu label="Peer" value={value} options={options} onValueChange={next => { changed(next); setValue(next); }}/>; }
  render(<Example/>);
  const combo = screen.getByRole('combobox', { name: 'Peer' });
  fireEvent.keyDown(combo, { key: 'ArrowDown' });
  expect(screen.getByRole('listbox')).toBeTruthy();
  fireEvent.keyDown(combo, { key: 'ArrowDown' }); fireEvent.keyDown(combo, { key: 'Enter' });
  expect(changed).toHaveBeenCalledWith('sentinel'); expect(combo.textContent).toContain('Sentinel');
  expect(screen.queryByRole('listbox')).toBeNull();
});
it('closes on Escape or an outside press and keeps Escape inside a surrounding modal', () => {
  const documentKey = vi.fn(); document.addEventListener('keydown', documentKey);
  render(<SelectMenu label="Peer" value="forge" options={options} onValueChange={vi.fn()}/>);
  const combo = screen.getByRole('combobox'); combo.focus(); fireEvent.click(combo);
  fireEvent.keyDown(combo, { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull(); expect(documentKey).not.toHaveBeenCalled(); expect(document.activeElement).toBe(combo);
  fireEvent.click(combo); fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('listbox')).toBeNull(); document.removeEventListener('keydown', documentKey);
});
it('uses a portal so scroll containers cannot clip the option list and never submits its form', () => {
  const submit = vi.fn(); const change = vi.fn();
  render(<form onSubmit={submit} style={{ overflow: 'hidden' }}><SelectMenu label="Peer" value="forge" options={options} onValueChange={change}/></form>);
  fireEvent.click(screen.getByRole('combobox'));
  expect(screen.getByRole('listbox').parentElement).toBe(document.body);
  fireEvent.click(screen.getByRole('option', { name: /Sentinel/ }));
  expect(change).toHaveBeenCalledWith('sentinel'); expect(submit).not.toHaveBeenCalled();
});
it('supports typeahead and leaves a disabled control closed', () => {
  const change = vi.fn(); const view = render(<SelectMenu label="Peer" value="forge" options={options} onValueChange={change}/>);
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 's' }); expect(change).toHaveBeenCalledWith('sentinel');
  view.rerender(<SelectMenu label="Peer" value="forge" options={options} onValueChange={change} disabled/>);
  fireEvent.click(screen.getByRole('combobox')); expect(screen.queryByRole('listbox')).toBeNull();
});
it('keeps wide lists on a narrow screen and opens above controls near the bottom', () => {
  const rect = { left: 340, right: 380, top: 700, bottom: 738, width: 40 };
  const viewport = { left: 0, top: 0, width: 390, height: 844 };
  const result = selectPosition(rect, viewport, 300, 320);
  expect(result.placement).toBe('top'); expect(result.left).toBeGreaterThanOrEqual(12);
  expect(result.left + result.width).toBeLessThanOrEqual(378); expect(result.top).toBeLessThan(rect.top);
  expect(result.top - result.maxHeight).toBeGreaterThanOrEqual(12);
});
it('anchors below a control when space is available and respects visual viewport offsets', () => {
  const rect = { left: 100, right: 280, top: 100, bottom: 140, width: 180 };
  const result = selectPosition(rect, { left: 0, top: 40, width: 800, height: 500 }, 220, 180);
  expect(result.placement).toBe('bottom'); expect(result.top).toBeGreaterThan(rect.bottom);
  expect(result.top + result.maxHeight).toBeLessThanOrEqual(528);
});
