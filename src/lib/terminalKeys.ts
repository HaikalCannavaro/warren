export type TerminalModifier = "ctrl" | "alt" | null;
export function encodeTerminalKey(
  data: string,
  modifier: TerminalModifier,
): string {
  if (modifier === "alt") return `\x1b${data}`;
  if (modifier === "ctrl" && data.length === 1) {
    if (data === "?") return "\x7f";
    const code = data.toUpperCase().charCodeAt(0);
    if (code >= 64 && code <= 95) return String.fromCharCode(code & 31);
  }
  return data;
}
