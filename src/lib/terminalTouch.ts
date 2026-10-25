interface TouchScrollableTerminal {
  rows: number;
  options: { fontSize?: number };
  buffer: { active: { type: string; baseY: number } };
  scrollLines(lines: number): void;
}

/** xterm 6 uses a virtual viewport. Touch panning must update its buffer, not DOM scrollTop. */
export function attachTerminalTouchScroll(element: HTMLElement, terminal: TouchScrollableTerminal): () => void {
  let gesture: { id: number; startX: number; startY: number; lastY: number; remainder: number; dragging: boolean } | null = null;
  const start = (event: TouchEvent) => {
    if (event.touches.length !== 1) { gesture = null; return; }
    const touch = event.touches[0];
    gesture = { id: touch.identifier, startX: touch.clientX, startY: touch.clientY, lastY: touch.clientY, remainder: 0, dragging: false };
  };
  const move = (event: TouchEvent) => {
    if (!gesture || event.touches.length !== 1) { gesture = null; return; }
    const touch = Array.from(event.touches).find(item => item.identifier === gesture!.id);
    if (!touch || terminal.buffer.active.type !== 'normal' || terminal.buffer.active.baseY <= 0) { gesture = null; return; }
    if (!gesture.dragging) {
      const vertical = Math.abs(touch.clientY - gesture.startY), horizontal = Math.abs(touch.clientX - gesture.startX);
      if (vertical < 6 || vertical <= horizontal) return;
      gesture.dragging = true;
    }
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    const screenHeight = element.querySelector('.xterm-screen')?.getBoundingClientRect().height ?? 0;
    const lineHeight = screenHeight > 0 && terminal.rows > 0 ? screenHeight / terminal.rows : Math.max(1, (terminal.options.fontSize ?? 14) * 1.2);
    gesture.remainder += gesture.lastY - touch.clientY;
    gesture.lastY = touch.clientY;
    const lines = Math.trunc(gesture.remainder / lineHeight);
    if (lines !== 0) { terminal.scrollLines(lines); gesture.remainder -= lines * lineHeight; }
  };
  const end = (event: TouchEvent) => {
    // A swipe should not synthesize a click that opens the keyboard; a tap still can.
    if (gesture?.dragging) { if (event.cancelable) event.preventDefault(); event.stopPropagation(); }
    gesture = null;
  };
  const cancel = () => { gesture = null; };
  element.addEventListener('touchstart', start, { capture: true, passive: true });
  element.addEventListener('touchmove', move, { capture: true, passive: false });
  element.addEventListener('touchend', end, { capture: true, passive: false });
  element.addEventListener('touchcancel', cancel, { capture: true, passive: true });
  return () => {
    gesture = null;
    element.removeEventListener('touchstart', start, true);
    element.removeEventListener('touchmove', move, true);
    element.removeEventListener('touchend', end, true);
    element.removeEventListener('touchcancel', cancel, true);
  };
}
