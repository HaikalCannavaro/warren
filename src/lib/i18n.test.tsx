// @vitest-environment jsdom
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getLanguage, setLanguage, translate, useI18n } from './i18n';

function LanguageExample() {
  const { t, language, setLanguage } = useI18n();
  return <><h1>{t('Settings', 'Pengaturan')}</h1><button onClick={() => setLanguage(language === 'en' ? 'id' : 'en')}>Switch</button></>;
}
beforeEach(() => { localStorage.clear(); setLanguage('en'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('defaults to English and updates subscribers, document language, and the device preference immediately', () => {
  render(<LanguageExample/>);
  expect(screen.getByRole('heading', {name:'Settings'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name:'Switch'}));
  expect(screen.getByRole('heading', {name:'Pengaturan'})).toBeTruthy();
  expect(document.documentElement.lang).toBe('id');
  expect(localStorage.getItem('warren.language')).toBe('id');
  expect(translate('Close', 'Tutup')).toBe('Tutup');
});

it('restores a saved preference on another document and falls back to English for invalid or removed values', () => {
  render(<LanguageExample/>);
  act(() => { localStorage.setItem('warren.language', 'id'); window.dispatchEvent(new StorageEvent('storage', {key:'warren.language',newValue:'id'})); });
  expect(screen.getByRole('heading', {name:'Pengaturan'})).toBeTruthy();
  act(() => { localStorage.setItem('warren.language', 'invalid'); window.dispatchEvent(new StorageEvent('storage', {key:'warren.language',newValue:'invalid'})); });
  expect(getLanguage()).toBe('en');
  act(() => { setLanguage('id'); localStorage.clear(); window.dispatchEvent(new StorageEvent('storage', {key:null})); });
  expect(screen.getByRole('heading', {name:'Settings'})).toBeTruthy();
});

it('still switches language if device storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  render(<LanguageExample/>);
  fireEvent.click(screen.getByRole('button', {name:'Switch'}));
  expect(screen.getByRole('heading', {name:'Pengaturan'})).toBeTruthy();
  expect(document.documentElement.lang).toBe('id');
});
