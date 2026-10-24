import type {
  MissionTask,
  AgentActivity,
} from "../mission-control/MissionGraph";
import type { CockpitConfig } from "../types";
import { Channel, invoke } from "@tauri-apps/api/core";
import { nativeAvailable } from "./native";

type Row = Record<string, unknown>;
const row = (value: unknown): Row =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
const str = (value: unknown) => (typeof value === "string" ? value : "");
export const DEFAULT_COCKPIT: CockpitConfig = {
  enabled: false,
  kanbanUrl: "http://100.65.133.127:9119/api/plugins/kanban",
  kanbanToken: "",
  feedUrl: "http://100.65.133.127:3450",
  feedToken: "",
  eventsUrl: "",
  feedEventsUrl: "",
  pollInterval: 10000,
};
export function serviceUrl(raw: string, websocket = false): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Enter a valid service URL.");
  }
  const privateHost =
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(
      url.hostname,
    ) ||
    url.hostname === "[::1]" ||
    /^\[f[cd]/i.test(url.hostname) ||
    url.hostname.endsWith(".ts.net");
  const secure = websocket ? "wss:" : "https:",
    local = websocket ? "ws:" : "http:";
  if (url.protocol !== secure && !(url.protocol === local && privateHost))
    throw new Error(
      "Use HTTPS/WSS, or HTTP/WS on a private or Tailscale address.",
    );
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port === "0" ||
    /[\x00-\x20\\]/.test(raw.trim())
  )
    throw new Error(
      "Service URLs must not contain credentials, queries, fragments, or control characters.",
    );
  return url.href.replace(/\/$/, "");
}
export async function cockpitGet(
  base: string,
  path: string,
  token: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = serviceUrl(base);
  if (nativeAvailable()) {
    const text = await invoke<string>("cockpit_get", {
      baseUrl: url,
      path,
      token,
    });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return JSON.parse(text);
  }
  const timeout = AbortSignal.timeout(15000),
    combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const response = await fetch(`${url}${path}`, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    redirect: "error",
    signal: combined,
  });
  if (!response.ok)
    throw new Error(`Service returned HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Service returned an empty response.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Service response exceeded 4 MiB.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export type ServiceEvent =
  | { type: "open" }
  | { type: "message"; text: string }
  | { type: "closed"; message: string };
export async function openServiceEvents(
  url: string,
  token: string,
  onEvent: (event: ServiceEvent) => void,
): Promise<() => void> {
  const checked = serviceUrl(url, true);
  if (nativeAvailable()) {
    const id = crypto.randomUUID(),
      channel = new Channel<ServiceEvent>();
    channel.onmessage = onEvent;
    await invoke("cockpit_events_open", {
      connectionId: id,
      url: checked,
      token,
      onEvent: channel,
    });
    return () => {
      void invoke("cockpit_events_close", { connectionId: id }).catch(() => {});
    };
  }
  if (token)
    throw new Error(
      "Authenticated service WebSockets require the installed app. REST polling remains available in the browser.",
    );
  const socket = new WebSocket(checked);
  socket.onopen = () => onEvent({ type: "open" });
  socket.onmessage = (event) => {
    if (typeof event.data === "string" && event.data.length <= 4 * 1024 * 1024)
      onEvent({ type: "message", text: event.data });
  };
  socket.onerror = () => {
    socket.close();
  };
  socket.onclose = () =>
    onEvent({
      type: "closed",
      message: "Service event stream disconnected. REST polling continues.",
    });
  return () => {
    socket.onclose = null;
    socket.close();
  };
}
export function kanbanEventsUrl(base: string): string {
  const url = new URL(serviceUrl(base));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/events`;
  return url.href;
}
const statusMap: Record<string, MissionTask["status"]> = {
  todo: "queued",
  ready: "queued",
  queued: "queued",
  running: "running",
  blocked: "error",
  review: "running",
  done: "complete",
  complete: "complete",
  error: "error",
};
function taskRows(input: unknown): Row[] {
  if (Array.isArray(input)) return input.map(row);
  const body = row(input);
  if (body.board) return taskRows(body.board);
  const lifecycleColumns = [
    "todo",
    "ready",
    "running",
    "blocked",
    "review",
    "done",
  ];
  if (lifecycleColumns.some((key) => Array.isArray(body[key])))
    return lifecycleColumns.flatMap((status) =>
      Array.isArray(body[status])
        ? (body[status] as unknown[]).map((value) => ({
            ...row(value),
            status: row(value).status ?? status,
          }))
        : [],
    );
  for (const key of ["tasks", "cards", "nodes"])
    if (Array.isArray(body[key])) return (body[key] as unknown[]).map(row);
  if (body.columns) {
    const columns = Array.isArray(body.columns)
      ? body.columns.map(row)
      : Object.entries(row(body.columns)).map(([status, value]) =>
          Array.isArray(value)
            ? { status, tasks: value }
            : { ...row(value), status },
        );
    return columns.flatMap((column) =>
      taskRows(column).map((task) => ({
        ...task,
        status:
          task.status ??
          row(column).status ??
          row(column).id ??
          row(column).name,
      })),
    );
  }
  return [];
}
export function parseKanban(
  board: unknown,
  orchestration?: unknown,
): { tasks: MissionTask[]; missionIds: string[] } {
  const top = row(board),
    body = top.board ? row(top.board) : top,
    orch = row(orchestration);
  const source = [...taskRows(board), ...taskRows(orchestration)];
  if (Array.isArray(orch.missions))
    for (const mission of orch.missions)
      source.push(
        ...taskRows(mission).map((task) => ({
          ...task,
          mission_id: task.mission_id ?? row(mission).id,
        })),
      );
  if (
    !Array.isArray(board) &&
    ![
      "tasks",
      "cards",
      "nodes",
      "columns",
      "todo",
      "ready",
      "running",
      "blocked",
      "review",
      "done",
    ].some((k) => k in body) &&
    !Array.isArray(orchestration) &&
    !["tasks", "nodes", "missions"].some((k) => k in orch)
  )
    throw new Error(
      "Kanban response did not contain tasks, columns, or orchestration nodes.",
    );
  const links = [
    ...(Array.isArray(body.task_links) ? body.task_links : []),
    ...(Array.isArray(body.links) ? body.links : []),
    ...(Array.isArray(orch.mission_edges) ? orch.mission_edges : []),
    ...(Array.isArray(orch.edges) ? orch.edges : []),
  ].map(row);
  const merged = new Map<string, Row>();
  for (const task of source) {
    const id = str(task.id) || str(task.task_id);
    if (id) merged.set(id, { ...merged.get(id), ...task });
  }
  const missionIds = [
    ...new Set(
      [...merged.values()].map((task) => str(task.mission_id)).filter(Boolean),
    ),
  ];
  const tasks = [...merged].map(([id, task]) => {
    const dependencies = new Set<string>(
      (Array.isArray(task.dependencies) ? task.dependencies : [])
        .map((value) =>
          typeof value === "string" ? value : str(row(value).id),
        )
        .filter(Boolean),
    );
    if (typeof task.parent_id === "string") dependencies.add(task.parent_id);
    for (const link of links) {
      const child = str(link.child_id) || str(link.target) || str(link.to);
      const parent = str(link.parent_id) || str(link.source) || str(link.from);
      if (child === id && parent) dependencies.add(parent);
    }
    const lifecycle = str(task.status) || "unknown";
    return {
      id,
      agent: str(task.assignee) || str(task.agent) || "Unassigned",
      title: str(task.title) || str(task.name) || id,
      node: str(task.node) || str(task.node_id) || "Not reported",
      status: statusMap[lifecycle] ?? "unknown",
      lifecycle,
      dependencies: [...dependencies],
      requestId: str(task.request_id) || undefined,
      detail:
        typeof task.description === "string" ? task.description : undefined,
    } satisfies MissionTask;
  });
  return { tasks, missionIds };
}
export interface ActiveWorker {
  profile: string;
  taskId?: string;
}
export function parseWorkers(input: unknown): ActiveWorker[] {
  const body = row(input),
    items = Array.isArray(input) ? input : (body.workers ?? body.active);
  if (!Array.isArray(items))
    throw new Error("Active-worker response did not contain a worker list.");
  return items
    .map((value) => {
      const item = row(value);
      return {
        profile:
          typeof value === "string"
            ? value
            : str(item.profile) || str(item.assignee) || str(item.agent),
        taskId: str(item.task_id) || undefined,
      };
    })
    .filter((item) => !!item.profile);
}
export function parseFeed(input: unknown): AgentActivity[] {
  const body = row(input),
    items = Array.isArray(input)
      ? input
      : (body.events ?? body.feed ?? body.items);
  if (!Array.isArray(items))
    throw new Error("A2A response did not contain an event list.");
  return items
    .map((value) => {
      const item = row(value),
        timestamp =
          typeof item.ts === "number"
            ? item.ts
            : typeof item.timestamp === "number"
              ? item.timestamp
              : NaN;
      const from = str(item.sender) || str(item.from),
        to = str(item.peer) || str(item.to);
      return {
        id:
          str(item.id) ||
          `${timestamp}:${from}:${to}:${str(item.task_id)}:${str(item.summary)}`,
        timestamp: timestamp < 1e12 ? timestamp * 1000 : timestamp,
        from,
        to,
        text: str(item.summary) || str(item.text),
        requestId: str(item.task_id) || undefined,
      };
    })
    .filter(
      (item) =>
        Number.isFinite(item.timestamp) &&
        !!item.from &&
        !!item.to &&
        !!item.text,
    );
}
export interface GpuSnapshot {
  gpuUsage: number;
  vramUsage: number;
  vramTotal: number;
  vramUsed: number;
  temperature: number;
  index: number;
}
export function parseGpuCsv(text: string): GpuSnapshot[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) throw new Error("nvidia-smi returned no GPU data.");
  return lines.map((line, index) => {
    const parts = line.split(",").map((value) => value.trim());
    if (
      parts.length !== 5 ||
      parts.some((value) => !/^\d+(?:\.\d+)?$/.test(value))
    )
      throw new Error("GPU output was not the expected five-column CSV.");
    const [gpuUsage, vramUsage, vramTotal, vramUsed, temperature] =
      parts.map(Number);
    if (
      gpuUsage > 100 ||
      vramUsage > 100 ||
      vramTotal <= 0 ||
      vramUsed > vramTotal ||
      temperature > 150
    )
      throw new Error(
        "GPU telemetry contained values outside the expected range.",
      );
    return { gpuUsage, vramUsage, vramTotal, vramUsed, temperature, index };
  });
}
