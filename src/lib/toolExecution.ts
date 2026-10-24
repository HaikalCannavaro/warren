import type { ToolExecution } from "../types";
export function sanitizeToolCalls(input: unknown): ToolExecution[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.slice(-64).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const t = value as Partial<ToolExecution>;
    if (
      typeof t.id !== "string" ||
      typeof t.name !== "string" ||
      !["running", "done", "error", "unknown"].includes(t.state ?? "")
    )
      return [];
    let args: Record<string, unknown> | undefined;
    if (t.args && typeof t.args === "object" && !Array.isArray(t.args)) {
      try {
        const encoded = JSON.stringify(t.args);
        if (encoded.length <= 4000) args = JSON.parse(encoded);
      } catch {
        /* Invalid argument metadata is omitted. */
      }
    }
    return [
      {
        id: t.id.slice(0, 256),
        name: t.name.slice(0, 80),
        param: typeof t.param === "string" ? t.param.slice(0, 300) : "",
        state: t.state === "running" ? "unknown" : t.state!,
        duration: typeof t.duration === "string" ? t.duration.slice(0, 30) : "",
        args,
        output:
          typeof t.output === "string" ? t.output.slice(0, 4000) : undefined,
        group:
          typeof t.group === "number" &&
          Number.isSafeInteger(t.group) &&
          t.group >= 0
            ? t.group
            : 0,
      },
    ];
  });
}
