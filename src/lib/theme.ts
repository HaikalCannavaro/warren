import { useSyncExternalStore } from 'react';
import type { ITheme } from '@xterm/xterm';

export type Theme = 'dark' | 'terracotta';
const storageKey = 'warren.theme';
const listeners = new Set<() => void>();
function readTheme(): Theme {
  try { return localStorage.getItem(storageKey) === 'terracotta' ? 'terracotta' : 'dark'; }
  catch { return 'dark'; }
}
let theme: Theme = readTheme();
function applyTheme(next: Theme) {
  theme = next;
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = next;
  listeners.forEach(listener => listener());
}
export function setTheme(next: Theme) {
  if (next !== 'dark' && next !== 'terracotta') return;
  try { localStorage.setItem(storageKey, next); } catch { /* A storage failure must not prevent changing the appearance. */ }
  applyTheme(next);
}
export const getTheme = (): Theme => theme;
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useTheme() { return useSyncExternalStore(subscribe, getTheme, () => 'dark' as const); }
if (typeof window !== 'undefined') {
  applyTheme(theme);
  window.addEventListener('storage', event => { if (event.key === storageKey || event.key === null) applyTheme(readTheme()); });
}
const darkTerminal: ITheme = {
  background: '#0b121d', foreground: '#d4dce8', cursor: '#6ee7cb', cursorAccent: '#0b121d', selectionBackground: '#27594f',
  black: '#17202d', red: '#f58b94', green: '#7adbb2', yellow: '#ead18d', blue: '#83adf2', magenta: '#c4a0ed', cyan: '#7ed3de', white: '#dce4f0',
  brightBlack: '#637086', brightRed: '#ff9da5', brightGreen: '#a3edc9', brightYellow: '#f1dfad', brightBlue: '#a5c6ff', brightMagenta: '#d8baf7', brightCyan: '#a4e8ef', brightWhite: '#f3f6fc',
};
const warmTerminal: ITheme = {
  background: '#F5EBDD', foreground: '#413333', cursor: '#315B8C', cursorAccent: '#F5EBDD', selectionBackground: '#315B8C33',
  black: '#413333', red: '#a83d2c', green: '#2d6b4f', yellow: '#8c641c', blue: '#315B8C', magenta: '#7f4c77', cyan: '#266e78', white: '#6b5750',
  brightBlack: '#927d72', brightRed: '#b64430', brightGreen: '#286647', brightYellow: '#946312', brightBlue: '#315B8C', brightMagenta: '#81447b', brightCyan: '#256775', brightWhite: '#413333',
};
export function terminalTheme(value: Theme): ITheme { return { ...(value === 'terracotta' ? warmTerminal : darkTerminal) }; }
