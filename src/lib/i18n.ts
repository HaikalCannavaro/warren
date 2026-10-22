import { useSyncExternalStore } from 'react';

export type Language = 'en' | 'id';
const storageKey = 'warren.language';
const listeners = new Set<() => void>();

function readLanguage(): Language {
  try { return localStorage.getItem(storageKey) === 'id' ? 'id' : 'en'; }
  catch { return 'en'; }
}

let language: Language = readLanguage();
function applyLanguage(next: Language) {
  language = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  listeners.forEach(listener => listener());
}

export function setLanguage(next: Language) {
  if (next !== 'en' && next !== 'id') return;
  try { localStorage.setItem(storageKey, next); } catch { /* Remain usable when storage is unavailable. */ }
  applyLanguage(next);
}

export function getLanguage(): Language { return language; }
export function translate(english: string, indonesian: string): string { return language === 'id' ? indonesian : english; }

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

if (typeof window !== 'undefined') {
  applyLanguage(language);
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) applyLanguage(readLanguage());
  });
}

export function useI18n() {
  const current = useSyncExternalStore(subscribe, getLanguage, () => 'en' as const);
  return {
    language: current,
    locale: current === 'id' ? 'id-ID' : 'en-US',
    setLanguage,
    t: (english: string, indonesian: string) => current === 'id' ? indonesian : english,
  };
}
