import type { useWorkspace } from "../hooks/useWorkspace";
import type { HermesProfile, VpsProfile } from "../types";
import { nodes, type NodeId } from "./data";
export type Workspace = ReturnType<typeof useWorkspace>;
export function nodeProfile(profiles: VpsProfile[], node: NodeId) {
  if (node.startsWith("device:"))
    return profiles.find((p) => p.id === node.slice(7));
  const named = nodes.find((n) => n.id === node);
  return (
    profiles.find((profile) => profile.executionNode === node) ??
    profiles.find(
      (profile) => profile.name.toLowerCase() === named?.name.toLowerCase(),
    )
  );
}
export function availableNodes(profiles: VpsProfile[]) {
  const assigned = new Set(
    nodes.flatMap((node) => {
      const p = nodeProfile(profiles, node.id);
      return p ? [p.id] : [];
    }),
  );
  return [
    ...nodes,
    ...profiles
      .filter((p) => !assigned.has(p.id))
      .map((profile) => ({
        id: `device:${profile.id}`,
        name: profile.name,
        role: "SSH device",
        host: profile.host,
        description: "Manual connection",
        gatewayPort: undefined,
      })),
  ];
}
export function agentProfiles(profiles: HermesProfile[], agent: string) {
  return profiles.filter(
    (profile) =>
      profile.id === agent ||
      (profile.agentProfile ?? profile.name).toUpperCase() ===
        agent.toUpperCase(),
  );
}
