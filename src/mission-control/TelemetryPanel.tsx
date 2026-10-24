import { useState } from "react";
import {
  Activity,
  ArrowUpRight,
  FileCode2,
  GitBranch,
  Globe2,
  Search,
  TerminalSquare,
} from "lucide-react";
import type { ExecutionLogEntry, ToolExecution } from "../types";
import type { Workspace } from "./workspace";
import { Badge, EmptyState, PanelTitle } from "./ui";
import { CopyButton, ToolCard } from "./ToolCard";
import { ArtifactPreview } from "./ArtifactPreview";
import { Dialog } from "../components/Dialog";

export function UnifiedDiff({ text }: { text: string }) {
  return (
    <div className="mc-diff-code">
      {text.split("\n").map((line, index) => (
        <div
          className={`mc-diff-line ${line.startsWith("+") && !line.startsWith("+++") ? "add" : line.startsWith("-") && !line.startsWith("---") ? "remove" : "context"}`}
          key={index}
        >
          <span>{index + 1}</span>
          <code>{line}</code>
        </div>
      ))}
    </div>
  );
}
export function BrowserSnapshot({ src, alt }: { src: string; alt: string }) {
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src))
    return (
      <p className="p-5 text-cockpit-muted">Snapshot data is unavailable.</p>
    );
  return (
    <div className="mc-browser-snapshot">
      <img className="h-full w-full object-contain" src={src} alt={alt} />
    </div>
  );
}
export function TelemetryPanel({ workspace }: { workspace: Workspace }) {
  const [view, setView] = useState<"audit" | "diff" | "browser">("audit");
  const [filter, setFilter] = useState("");
  const [trace, setTrace] = useState<ExecutionLogEntry | null>(null);
  const entries = workspace.state.conversations
    .flatMap((conversation) =>
      (conversation.executionLog ?? []).map((entry) => ({
        ...entry,
        conversation: conversation.title,
      })),
    )
    .sort((a, b) => b.timestamp - a.timestamp);
  const calls = workspace.state.conversations.flatMap((conversation) =>
    conversation.messages.flatMap((message) => message.tools ?? []),
  );
  const artifacts = workspace.state.conversations
    .flatMap((c) => c.messages.flatMap((m) => m.artifacts ?? []))
    .sort((a, b) => b.createdAt - a.createdAt);
  const patches = calls.filter(
    (tool) =>
      tool.state === "done" &&
      tool.output &&
      /^(diff --git |@@ )/m.test(tool.output),
  );
  const [patchIndex, setPatchIndex] = useState(0);
  const patch = patches[patchIndex];
  const matching = entries.filter((entry) =>
    `${entry.text} ${entry.kind} ${entry.requestId}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const toolFor = (entry: ExecutionLogEntry): ToolExecution | undefined =>
    workspace.state.conversations
      .flatMap((c) => c.messages)
      .filter((m) => m.requestId === entry.requestId)
      .flatMap((m) => m.tools ?? [])
      .find((tool) => entry.text.includes(tool.name));
  return (
    <>
      <div
        className="mc-segment-tabs"
        role="tablist"
        aria-label="Telemetry views"
      >
        {(
          [
            { id: "audit", label: "Tool audit", icon: TerminalSquare },
            { id: "diff", label: "File changes", icon: FileCode2 },
            { id: "browser", label: "Browser", icon: Globe2 },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            role="tab"
            aria-selected={view === id}
            key={id}
            onClick={() => setView(id)}
          >
            <Icon size={15} />
            {label}
            {id === "diff" && patches.length > 0 && (
              <span>{patches.length}</span>
            )}
          </button>
        ))}
      </div>
      <section className="mc-panel">
        <PanelTitle
          icon={
            view === "audit" ? (
              <Activity size={16} />
            ) : view === "diff" ? (
              <GitBranch size={16} />
            ) : (
              <Globe2 size={16} />
            )
          }
          title={
            view === "audit"
              ? "Execution audit"
              : view === "diff"
                ? "Unified patch"
                : "Browser snapshot"
          }
          extra={
            <Badge>
              {view === "audit"
                ? `${entries.length} EVENTS`
                : view === "diff"
                  ? `${patches.length} PATCHES`
                  : `${artifacts.length} CAPTURES`}
            </Badge>
          }
        />
        {view === "audit" ? (
          <>
            <div className="mc-audit-toolbar">
              <label>
                <Search size={15} />
                <input
                  aria-label="Filter tool audit"
                  placeholder="Filter tools, events, or request IDs…"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </label>
              <span>{matching.length} events</span>
            </div>
            {!matching.length ? (
              <EmptyState
                icon={<TerminalSquare size={28} />}
                title={
                  entries.length
                    ? "No matching events"
                    : "No tool executions yet"
                }
              >
                {entries.length
                  ? "Try another tool name or request ID."
                  : "Tool arguments, output, and status will appear after an agent runs a tool."}
              </EmptyState>
            ) : (
              <div className="mc-audit-rows">
                {matching.map((entry) => (
                  <div className="mc-audit-row" key={entry.id}>
                    <div>
                      <time className="mc-mono">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </time>
                      <strong>{entry.kind.toUpperCase()}</strong>
                      <span className="mc-audit-node">
                        {entry.conversation}
                      </span>
                    </div>
                    {entry.kind === "tool" && toolFor(entry) ? (
                      <ToolCard tool={toolFor(entry)!} />
                    ) : (
                      <p className="mt-3 text-xs leading-6 text-cockpit-muted">
                        {entry.text}
                      </p>
                    )}
                    <button
                      className="mc-trace-link"
                      onClick={() => setTrace(entry)}
                    >
                      Inspect request <ArrowUpRight size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : view === "diff" ? (
          patch ? (
            <>
              <div className="mc-diff-files">
                {patches.map((tool, index) => (
                  <button
                    key={tool.id}
                    className={index === patchIndex ? "active" : ""}
                    onClick={() => setPatchIndex(index)}
                  >
                    {tool.name} {tool.param}
                  </button>
                ))}
              </div>
              <div className="mc-diff-path">
                <span>Agent-reported patch</span>
                <CopyButton text={patch.output!} label="Copy patch" />
              </div>
              <UnifiedDiff text={patch.output!} />
            </>
          ) : (
            <EmptyState icon={<FileCode2 size={28} />} title="No file changes">
              Unified patches appear when a connected agent returns a diff in
              its tool output.
            </EmptyState>
          )
        ) : (
          <div className="mc-snapshot-body">
            {artifacts.length ? (
              artifacts.map((artifact) => (
                <ArtifactPreview key={artifact.id} artifact={artifact} />
              ))
            ) : (
              <div className="mc-browser-snapshot mc-snapshot-empty">
                <EmptyState
                  icon={<Globe2 size={28} />}
                  title="No browser snapshot"
                >
                  No browser capture has been received from an agent.
                </EmptyState>
              </div>
            )}
          </div>
        )}
      </section>
      {trace && (
        <Dialog
          title="Request trace"
          description={trace.requestId}
          wide
          onClose={() => setTrace(null)}
        >
          <div className="mc-trace">
            <span className="mc-eyebrow">RECORDED EVENTS</span>
            {entries
              .filter((entry) => entry.requestId === trace.requestId)
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((entry) => (
                <div className="mc-trace-record" key={entry.id}>
                  <time>{new Date(entry.timestamp).toLocaleTimeString()}</time>
                  <strong>{entry.kind}</strong>
                  <p>{entry.text}</p>
                </div>
              ))}
            <CopyButton
              text={JSON.stringify(
                entries.filter((entry) => entry.requestId === trace.requestId),
                null,
                2,
              )}
              label="Copy trace"
            />
          </div>
        </Dialog>
      )}
    </>
  );
}
