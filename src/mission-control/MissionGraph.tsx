import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Loader2,
  Radio,
  Workflow,
} from "lucide-react";
import { Dialog } from "../components/Dialog";
import { Badge, EmptyState } from "./ui";
import { CopyButton } from "./ToolCard";
export interface MissionTask {
  id: string;
  agent: string;
  title: string;
  node: string;
  status: "queued" | "running" | "complete" | "error" | "unknown";
  dependencies: string[];
  lifecycle?: string;
  requestId?: string;
  detail?: string;
}
export interface AgentActivity {
  id: string;
  timestamp: number;
  from: string;
  to: string;
  text: string;
  requestId?: string;
}
export function layoutMission(tasks: MissionTask[]): MissionTask[][] | null {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (
    byId.size !== tasks.length ||
    tasks.some((task) => task.dependencies.some((id) => !byId.has(id)))
  )
    return null;
  const pending = new Set(tasks.map((task) => task.id)),
    complete = new Set<string>(),
    layers: MissionTask[][] = [];
  while (pending.size) {
    const layer = tasks.filter(
      (task) =>
        pending.has(task.id) &&
        task.dependencies.every((id) => complete.has(id)),
    );
    if (!layer.length) return null;
    layers.push(layer);
    for (const task of layer) {
      pending.delete(task.id);
      complete.add(task.id);
    }
  }
  return layers;
}
/** Receives actual orchestrator data. An absent service is an empty state. */
export function MissionGraph({
  tasks = [],
  onConfigure,
  loadTask,
}: {
  tasks?: MissionTask[];
  onConfigure: () => void;
  loadTask?: (id: string) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState<MissionTask | null>(null);
  const [details, setDetails] = useState<unknown>(null),
    [detailError, setDetailError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setDetails(null);
    setDetailError("");
    if (selected && loadTask)
      void loadTask(selected.id)
        .then((value) => {
          if (!cancelled) setDetails(value);
        })
        .catch(() => {
          if (!cancelled)
            setDetailError(
              "Task details could not be loaded. Check the Kanban connection.",
            );
        });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);
  const layers = layoutMission(tasks);
  if (!tasks.length)
    return (
      <div className="mc-empty-graph">
        <EmptyState
          icon={<Workflow size={34} />}
          title="No mission yet"
          action={
            <button className="mc-button secondary" onClick={onConfigure}>
              Configure gateway <ArrowRight size={14} />
            </button>
          }
        >
          Connect your Gateway and agents. The mission graph will appear when
          the orchestrator supplies task data.
        </EmptyState>
      </div>
    );
  if (!layers)
    return (
      <EmptyState
        icon={<Workflow size={30} />}
        title="Mission graph unavailable"
      >
        The received task dependencies contain a cycle or an unknown task.
      </EmptyState>
    );
  const width = Math.max(
      360,
      Math.max(...layers.map((layer) => layer.length)) * 180,
    ),
    height = layers.length * 130;
  const positions = new Map(
    layers.flatMap((layer, row) =>
      layer.map(
        (task, column) =>
          [
            task.id,
            {
              x: (width * (column + 1)) / (layer.length + 1),
              y: row * 130 + 15,
            },
          ] as const,
      ),
    ),
  );
  return (
    <>
      <div className="mc-dag-scroll">
        <div className="mc-dag-canvas" style={{ width, height }}>
          <svg width={width} height={height} aria-hidden="true">
            {tasks.flatMap((task) =>
              task.dependencies.map((id) => {
                const start = positions.get(id)!,
                  end = positions.get(task.id)!;
                return (
                  <path
                    key={`${id}:${task.id}`}
                    d={`M ${start.x} ${start.y + 78} C ${start.x} ${start.y + 110}, ${end.x} ${end.y - 30}, ${end.x} ${end.y}`}
                    fill="none"
                    stroke="#456e69"
                    strokeWidth="1.2"
                  />
                );
              }),
            )}
          </svg>
          {tasks.map((task) => {
            const point = positions.get(task.id)!;
            return (
              <button
                key={task.id}
                className={`mc-dag-task ${task.status}`}
                style={{ left: point.x - 72, top: point.y }}
                onClick={() => setSelected(task)}
              >
                <strong>
                  {task.agent}
                  {task.status === "complete" ? (
                    <Check size={12} />
                  ) : task.status === "running" ? (
                    <Loader2 size={12} className="mc-spin" />
                  ) : (
                    <Clock3 size={12} />
                  )}
                </strong>
                <span>{task.title}</span>
                <small>
                  {task.lifecycle ?? task.status}
                  <span>{task.node}</span>
                </small>
              </button>
            );
          })}
        </div>
      </div>
      {selected && (
        <Dialog
          title={selected.title}
          description={selected.requestId ?? selected.id}
          wide
          onClose={() => setSelected(null)}
        >
          <div className="mc-trace">
            <Badge tone={selected.status === "complete" ? "teal" : "neutral"}>
              {selected.status.toUpperCase()}
            </Badge>
            <div className="mc-trace-fields">
              <span>
                Agent<strong>{selected.agent}</strong>
              </span>
              <span>
                Node<strong>{selected.node}</strong>
              </span>
              <span>
                Task ID<strong>{selected.id}</strong>
              </span>
              <span>
                Dependencies
                <strong>{selected.dependencies.join(", ") || "None"}</strong>
              </span>
            </div>
            <p>
              {selected.detail ?? "No additional trace details were supplied."}
            </p>
            {detailError && <p className="mc-service-error">{detailError}</p>}
            {details !== null && (
              <pre className="mc-task-detail-json">
                {JSON.stringify(details, null, 2)}
              </pre>
            )}
            <CopyButton
              text={JSON.stringify(details ?? selected, null, 2)}
              label="Copy trace"
            />
          </div>
        </Dialog>
      )}
    </>
  );
}
export function AgentStream({ events = [] }: { events?: AgentActivity[] }) {
  const [selected, setSelected] = useState<AgentActivity | null>(null);
  if (!events.length)
    return (
      <EmptyState icon={<Radio size={27} />} title="No agent activity yet">
        Agent messages, handoffs, and execution events will appear here when
        received.
      </EmptyState>
    );
  return (
    <>
      <div className="mc-event-list">
        {[...events]
          .sort((a, b) => b.timestamp - a.timestamp)
          .map((event) => (
            <button
              key={event.id}
              className="mc-chatter-event"
              onClick={() => setSelected(event)}
            >
              <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
              <strong>
                {event.from}
                <ArrowRight size={12} />
                {event.to}
              </strong>
              <p>{event.text}</p>
            </button>
          ))}
      </div>
      {selected && (
        <Dialog
          title="Agent handoff"
          description={selected.requestId ?? selected.id}
          onClose={() => setSelected(null)}
        >
          <div className="mc-trace">
            <p>{selected.text}</p>
            <CopyButton
              text={JSON.stringify(selected, null, 2)}
              label="Copy event"
            />
          </div>
        </Dialog>
      )}
    </>
  );
}
