import { afterEach, expect, it, vi } from 'vitest';
import { attachTerminalTouchScroll } from './terminalTouch';
afterEach(() => { document.body.innerHTML = ''; });
function setup() {
  const element = document.createElement('div'); document.body.append(element);
  const terminal = { rows: 10, options: { fontSize: 10 }, buffer: { active: { type: 'normal', baseY: 100 } }, scrollLines: vi.fn() };
  const detach = attachTerminalTouchScroll(element, terminal);
  const touch = (type: string, y: number, x = 20, count = 1) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: Array.from({ length: count }, (_, id) => ({ identifier: id, clientY: y, clientX: x })) });
    element.dispatchEvent(event); return event;
  };
  return { terminal, detach, touch };
}
it('pans existing scrollback in both directions and consumes vertical swipes', () => {
  const { terminal, touch } = setup();
  touch('touchstart', 100);
  expect(touch('touchmove', 148).defaultPrevented).toBe(true);
  expect(terminal.scrollLines).toHaveBeenLastCalledWith(-4);
  touch('touchend', 148);
  touch('touchstart', 148); touch('touchmove', 100);
  expect(terminal.scrollLines).toHaveBeenLastCalledWith(4);
});
it('preserves taps, horizontal gestures and pinch gestures', () => {
  const { terminal, touch } = setup();
  touch('touchstart', 100); expect(touch('touchend', 100).defaultPrevented).toBe(false);
  touch('touchstart', 100); expect(touch('touchmove', 102, 60).defaultPrevented).toBe(false);
  touch('touchstart', 100); expect(touch('touchmove', 150, 20, 2).defaultPrevented).toBe(false);
  expect(terminal.scrollLines).not.toHaveBeenCalled();
});
it('accumulates small movements and leaves alternate screens or empty scrollback alone', () => {
  const { terminal, touch } = setup();
  touch('touchstart', 100); touch('touchmove', 107); touch('touchmove', 114);
  expect(terminal.scrollLines).toHaveBeenLastCalledWith(-1);
  terminal.scrollLines.mockClear(); terminal.buffer.active.type = 'alternate';
  touch('touchstart', 100); expect(touch('touchmove', 148).defaultPrevented).toBe(false);
  terminal.buffer.active.type = 'normal'; terminal.buffer.active.baseY = 0;
  touch('touchstart', 100); expect(touch('touchmove', 148).defaultPrevented).toBe(false);
  expect(terminal.scrollLines).not.toHaveBeenCalled();
});
it('removes the listeners on disposal', () => {
  const { terminal, detach, touch } = setup();
  detach(); touch('touchstart', 100); touch('touchmove', 148);
  expect(terminal.scrollLines).not.toHaveBeenCalled();
});
