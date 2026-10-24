import type { ToolArtifact } from "../types";
const MAX_IMAGE_CHARS = 1800 * 1024;
export function parseToolArtifact(value: unknown): ToolArtifact | undefined {
  if (!value || typeof value !== "object") return;
  const input = value as Record<string, unknown>,
    data = input.data,
    type = input.artifact_type ?? input.type;
  if (
    typeof data !== "string" ||
    data.length > MAX_IMAGE_CHARS ||
    !["image/png", "image/jpeg", "image/webp"].includes(String(type))
  )
    return;
  if (
    !data.startsWith(`data:${type};base64,`) ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    return;
  const base64 = data.slice(data.indexOf(",") + 1);
  if (type === "image/png" && !base64.startsWith("iVBORw0KGgo")) return;
  if (type === "image/jpeg" && !base64.startsWith("/9j/")) return;
  if (type === "image/webp" && !base64.startsWith("UklGR")) return;
  return {
    id:
      typeof input.id === "string"
        ? input.id.slice(0, 256)
        : crypto.randomUUID(),
    type: type as ToolArtifact["type"],
    data,
    tool:
      typeof input.tool === "string" ? input.tool.slice(0, 80) : "browser_exec",
    createdAt:
      typeof input.createdAt === "number" && Number.isFinite(input.createdAt)
        ? input.createdAt
        : Date.now(),
  };
}
export function sanitizeArtifacts(value: unknown): ToolArtifact[] | undefined {
  if (!Array.isArray(value)) return;
  return value.slice(-2).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const artifact = parseToolArtifact({
      ...item,
      artifact_type: (item as ToolArtifact).type,
    });
    return artifact ? [artifact] : [];
  });
}
