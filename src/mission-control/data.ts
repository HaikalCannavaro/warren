export type NodeId = string;
export type Category = "Core Fleet" | "Security" | "Companions";
export type AgentId = string;
export type { ToolExecution as ToolCall } from "../types";
export const nodes = [
  {
    id: "vps" as const,
    name: "Hcnnvr-studio",
    role: "Ubuntu 22.04 Azure",
    host: "100.65.133.127",
    description: "Always-on orchestration",
    gatewayPort: 3450,
  },
  {
    id: "pc" as const,
    name: "haikalcannavaro",
    role: "Windows 11",
    host: "100.91.205.20",
    description: "Local execution via Tailscale",
  },
];
export const agents: {
  id: AgentId;
  role: string;
  color: string;
  initials: string;
  node: NodeId;
  category: Category;
}[] = [
  {
    id: "LEVERET",
    role: "Orchestrator",
    color: "#6be2c4",
    initials: "Lv",
    node: "vps",
    category: "Core Fleet",
  },
  {
    id: "FORGE",
    role: "Backend engineer",
    color: "#eab27b",
    initials: "Fg",
    node: "vps",
    category: "Core Fleet",
  },
  {
    id: "FRAME",
    role: "Frontend engineer",
    color: "#9ba7ff",
    initials: "Fr",
    node: "pc",
    category: "Core Fleet",
  },
  {
    id: "AURORA",
    role: "Design engineer",
    color: "#da9ac4",
    initials: "Au",
    node: "pc",
    category: "Core Fleet",
  },
  {
    id: "ATLAS",
    role: "Infrastructure & SRE",
    color: "#83b9ec",
    initials: "At",
    node: "vps",
    category: "Core Fleet",
  },
  {
    id: "PRISM",
    role: "Functional QA & Regression",
    color: "#d1bb83",
    initials: "Pr",
    node: "vps",
    category: "Core Fleet",
  },
  {
    id: "LENS",
    role: "Rendered Visual QA",
    color: "#a9b8eb",
    initials: "Ln",
    node: "vps",
    category: "Core Fleet",
  },
  {
    id: "SENTINEL",
    role: "Defensive Security & Vault",
    color: "#e5a0ab",
    initials: "Sn",
    node: "vps",
    category: "Security",
  },
  {
    id: "RADAR",
    role: "Web Research & Intel",
    color: "#8bbbd7",
    initials: "Rd",
    node: "vps",
    category: "Core Fleet",
  },
  {
    id: "QUANT",
    role: "Quantitative Engine",
    color: "#c7b5ed",
    initials: "Qt",
    node: "vps",
    category: "Core Fleet",
  },
];
