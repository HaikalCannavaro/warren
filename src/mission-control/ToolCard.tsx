import { useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  FileCode2,
  FilePenLine,
  Globe2,
  Loader2,
  Search,
  TerminalSquare,
  X,
} from "lucide-react";
import type { ToolCall } from "./data";

export function CopyButton({
  text,
  label = "Copy Output",
}: {
  text: string;
  label?: string;
}) {
  const [status, setStatus] = useState("");
  return (
    <button
      className="mc-copy"
      type="button"
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setStatus("Copied");
        } catch {
          setStatus("Copy unavailable");
        }
      }}
    >
      {status === "Copied" ? <Check size={12} /> : <Copy size={12} />}
      <span aria-live="polite">{status || label}</span>
    </button>
  );
}

export function ToolCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const Icon = tool.name.includes("search")
    ? Search
    : tool.name.includes("patch") || tool.name.includes("edit")
      ? FilePenLine
      : tool.name.includes("file")
        ? FileCode2
        : tool.name.includes("web")
          ? Globe2
          : TerminalSquare;
  return (
    <div className={`mc-tool mc-tool-${tool.state}`}>
      <button
        className="mc-tool-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="mc-tool-icon">
          <Icon size={15} />
        </span>
        <code title={`${tool.name}(${tool.param})`}>
          <b>{tool.name}</b>
          <span>({tool.param})</span>
        </code>
        <span className={`mc-tool-status ${tool.state}`}>
          {tool.state === "running" ? (
            <>
              <Loader2 size={10} /> RUNNING
            </>
          ) : tool.state === "done" ? (
            <>
              <Check size={11} /> DONE {tool.duration}
            </>
          ) : tool.state === "error" ? (
            <>
              <X size={11} /> ERROR
            </>
          ) : (
            <span>UNKNOWN</span>
          )}
        </span>
        <ChevronDown size={13} className={open ? "mc-rotated" : ""} />
      </button>
      {open && (
        <div className="mc-tool-details">
          <div className="mc-code-label">
            ARGUMENTS <span>JSON</span>
          </div>
          <pre>
            {tool.args
              ? JSON.stringify(tool.args, null, 2)
              : "Arguments not provided by the agent."}
          </pre>
          <div className="mc-code-label">
            OUTPUT <CopyButton text={tool.output ?? ""} />
          </div>
          <pre className="mc-output">
            {tool.output ?? "Output not provided by the agent."}
          </pre>
        </div>
      )}
    </div>
  );
}

export function ToolChain({ tools }: { tools: ToolCall[] }) {
  const [open, setOpen] = useState(false);
  if (!tools.length) return null;
  if (tools.length < 3)
    return (
      <>
        {tools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </>
    );
  const running = tools.some((tool) => tool.state === "running");
  const unknown = tools.some((tool) => tool.state === "unknown");
  const hasDuration = tools.every((tool) => !!tool.duration);
  const failed = tools.some((tool) => tool.state === "error");
  const seconds = tools
    .reduce((sum, tool) => sum + (parseFloat(tool.duration) || 0), 0)
    .toFixed(1);
  return (
    <div className="mc-tool-chain">
      <button
        className="mc-chain-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronDown size={13} className={open ? "" : "mc-collapsed"} />
        <span>
          {tools.length} Tools{" "}
          {running
            ? "Running"
            : failed
              ? "· errors"
              : unknown
                ? "· outcome unknown"
                : "Executed"}
          <small>{tools.map((tool) => tool.name).join(", ")}</small>
        </span>
        <span>{hasDuration ? `${seconds}s` : "—"}</span>
        {!running && !failed && !unknown && <Check size={13} />}
      </button>
      {open && (
        <div className="mc-chain-items">
          {tools.map((tool) => (
            <ToolCard key={tool.id} tool={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
