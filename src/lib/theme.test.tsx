import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemePicker } from '../components/ThemePicker';
import { getTheme, setTheme, terminalTheme } from './theme';
import { setLanguage } from './i18n';

beforeEach(() => { setLanguage('en'); setTheme('dark'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); setTheme('dark'); });
it('switches the workspace palette, saves the choice and restores it from device storage', () => {
  render(<ThemePicker/>);
  expect(screen.getByRole('button', { name: /Warren Dark/ }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: /Terracotta/ }));
  expect(document.documentElement.dataset.theme).toBe('terracotta');
  expect(localStorage.getItem('warren.theme')).toBe('terracotta');
  expect(screen.getByRole('button', { name: /Terracotta/ }).getAttribute('aria-pressed')).toBe('true');
  localStorage.setItem('warren.theme', 'dark');
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'warren.theme' })); });
  expect(getTheme()).toBe('dark');
});
it('rejects unsupported stored themes and still changes appearance if storage is unavailable', () => {
  localStorage.setItem('warren.theme', 'invalid');
  window.dispatchEvent(new StorageEvent('storage', { key: 'warren.theme' }));
  expect(getTheme()).toBe('dark');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  setTheme('terracotta');
  expect(getTheme()).toBe('terracotta');
  expect(document.documentElement.dataset.theme).toBe('terracotta');
});
it('keeps terminal colors aligned with the selected palette', () => {
  expect(terminalTheme('dark').background).toBe('#0b121d');
  expect(terminalTheme('terracotta')).toMatchObject({ background: '#F5EBDD', foreground: '#413333', cursor: '#315B8C' });
});
