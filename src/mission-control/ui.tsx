import type { CSSProperties, ReactNode } from "react";
import { Rabbit } from "lucide-react";
import { agents, type AgentId } from "./data";

export function Avatar({
  id,
  small = false,
}: {
  id: AgentId;
  small?: boolean;
}) {
  const agent = agents.find((agent) => agent.id === id) ?? {
    color: "#8b9ab0",
    initials: id.slice(0, 2),
  };
  return (
    <span
      className={`mc-avatar ${small ? "small" : ""}`}
      style={{ "--agent": agent.color } as CSSProperties}
    >
      {id === "LEVERET" ? <Rabbit size={small ? 16 : 22} /> : agent.initials}
    </span>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`mc-badge ${tone}`}>
      <span />
      {children}
    </span>
  );
}
export function PanelTitle({
  icon,
  title,
  extra,
}: {
  icon: ReactNode;
  title: string;
  extra?: ReactNode;
}) {
  return (
    <div className="mc-panel-title">
      <h2>
        {icon}
        {title}
      </h2>
      {extra}
    </div>
  );
}
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mc-empty-state">
      <span className="mc-empty-symbol">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
