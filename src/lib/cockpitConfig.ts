import type { CockpitConfig } from "../types";
export function sanitizeCockpitConfig(
  value: unknown,
): CockpitConfig | undefined {
  if (!value || typeof value !== "object") return;
  const input = value as Record<string, unknown>;
  const field = (name: string, max = 4096) =>
    typeof input[name] === "string"
      ? (input[name] as string).slice(0, max)
      : "";
  const interval =
    typeof input.pollInterval === "number" &&
    Number.isFinite(input.pollInterval)
      ? input.pollInterval
      : 10000;
  return {
    enabled: input.enabled === true,
    kanbanUrl: field("kanbanUrl"),
    kanbanToken: field("kanbanToken", 8192),
    feedUrl: field("feedUrl"),
    feedToken: field("feedToken", 8192),
    eventsUrl: field("eventsUrl"),
    feedEventsUrl: field("feedEventsUrl"),
    pollInterval: Math.max(5000, Math.min(60000, interval)),
  };
}
