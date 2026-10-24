import { lazy, Suspense, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Cpu,
  HardDrive,
  Monitor,
  Network,
  Plus,
  Pause,
  Play,
  Server,
  TerminalSquare,
  Zap,
} from "lucide-react";
import { Badge, PanelTitle } from "./ui";
import { type NodeId } from "./data";
import { availableNodes, nodeProfile, type Workspace } from "./workspace";
import { useGpuTelemetry } from "../hooks/useGpuTelemetry";
import type { VpsProfile } from "../types";
import { ConfirmDialog } from "../components/Dialog";
const TerminalWorkspace = lazy(() =>
  import("../components/TerminalWorkspace").then((module) => ({
    default: module.TerminalWorkspace,
  })),
);
export function NodesPanel({
  workspace,
  visible,
  onConfigure,
}: {
  workspace: Workspace;
  visible: boolean;
  onConfigure: (node: NodeId, profile?: VpsProfile) => void;
}) {
  const nodes = availableNodes(workspace.state.vps);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const connect = async (id: string) => {
    setTerminalOpen(true);
    await workspace.connectVps(id);
  };
  return (
    <>
      <div className="mc-node-actions">
        <button
          className="mc-button secondary"
          onClick={() => onConfigure("new")}
        >
          <Plus size={14} />
          Add device connection
        </button>
      </div>
      <div className="mc-section-note">
        <Network size={14} />
        <span>
          {workspace.sessions.some((s) => s.status === "connected")
            ? "SSH status is live. Hardware telemetry appears when reported by your device."
            : "Connect a device over SSH. CPU, GPU, and memory data remain unavailable until reported."}
        </span>
      </div>
      <div className="mc-node-grid">
        {nodes.map((node) => {
          const profile = nodeProfile(workspace.state.vps, node.id);
          const sessions = workspace.sessions.filter(
            (s) => s.profileId === profile?.id,
          );
          const connected = sessions.some((s) => s.status === "connected"),
            connecting = sessions.some((s) => s.status === "connecting");
          return (
            <section
              className={`mc-panel mc-node-card ${node.id}`}
              key={node.id}
            >
              <div className="mc-node-card-header">
                <span className={`mc-node-icon ${node.id}`}>
                  {node.id === "vps" ? (
                    <Server size={25} />
                  ) : (
                    <Monitor size={25} />
                  )}
                </span>
                <span>
                  <h2>{node.name}</h2>
                  <small>{node.role}</small>
                </span>
                <Badge tone={connected ? "teal" : "neutral"}>
                  {connected
                    ? "CONNECTED"
                    : connecting
                      ? "CONNECTING"
                      : "NOT CONNECTED"}
                </Badge>
              </div>
              <div className="mc-node-os">
                {node.description}
                <span>{node.id === "vps" ? "VPS" : "PC"}</span>
              </div>
              <div className="mc-node-specs">
                <span>
                  <Network size={14} />
                  Host address
                  <strong>
                    {profile
                      ? `${profile.host}:${profile.port}`
                      : (node.host ?? "Not configured")}
                  </strong>
                </span>
                <span>
                  <Cpu size={14} />
                  Processor<strong>—</strong>
                </span>
                <span>
                  <HardDrive size={14} />
                  Memory<strong>—</strong>
                </span>
                {node.id === "pc" && (
                  <span>
                    <Zap size={14} />
                    GPU<strong>No GPU data</strong>
                  </span>
                )}
                {node.id === "vps" && (
                  <span>
                    <Network size={14} />
                    Gateway port<strong>3450 (default)</strong>
                  </span>
                )}
              </div>
              <div className="mc-node-meters">
                <div className="mc-metric-unavailable">
                  <Activity size={18} />
                  <span>
                    Awaiting device telemetry
                    <small>
                      No CPU, memory, temperature, or GPU values have been
                      received.
                    </small>
                  </span>
                </div>
              </div>
              {profile && (
                <GpuTelemetry
                  profile={profile}
                  visible={visible && !workspace.preview}
                />
              )}
              <div className="mc-node-assigned">
                <span>SSH SESSIONS</span>
                <small>
                  {sessions.filter((s) => s.status === "connected").length}{" "}
                  connected
                </small>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="mc-button secondary"
                  onClick={() => onConfigure(node.id, profile)}
                >
                  <Plus size={14} />
                  {profile ? "Edit device" : "Configure"}
                </button>
                <button
                  className="mc-button secondary"
                  disabled={!profile || workspace.preview || connecting}
                  onClick={() => {
                    if (!profile) return;
                    if (connected) {
                      workspace.setActiveSessionId(
                        sessions.find((s) => s.status === "connected")!.id,
                      );
                      setTerminalOpen(true);
                    } else void connect(profile.id);
                  }}
                >
                  <TerminalSquare size={14} />
                  {connected ? "Terminal" : "Connect SSH"}
                </button>
              </div>
            </section>
          );
        })}
      </div>
      <section className="mc-panel mc-mesh">
        <span className="mc-mesh-icon">
          <Network size={26} />
        </span>
        <div>
          <h3>Private connectivity. Explicit targets.</h3>
          <p>
            Use the device’s reachable Tailscale hostname or address for SSH.
            Connection status is shown after SSH succeeds; mesh reachability is
            not inferred from a saved hostname.
          </p>
        </div>
        <button
          className="mc-button secondary"
          onClick={() =>
            onConfigure("pc", nodeProfile(workspace.state.vps, "pc"))
          }
        >
          Configure Tailscale host <ArrowUpRight size={14} />
        </button>
      </section>
      {terminalOpen && (
        <section className="mc-panel mc-node-terminal">
          <PanelTitle
            icon={<TerminalSquare size={15} />}
            title="SSH terminal"
            extra={
              <span className="font-mono text-xs text-cockpit-muted">
                xterm.js
              </span>
            }
          />
          <Suspense
            fallback={
              <p className="p-5 text-cockpit-muted">Loading terminal…</p>
            }
          >
            <TerminalWorkspace
              sessions={workspace.sessions}
              activeSessionId={workspace.activeSessionId}
              profiles={workspace.state.vps}
              settings={workspace.state.settings}
              preview={workspace.preview}
              visible={visible}
              onAdd={() => onConfigure("vps")}
              onConnect={(id) => void connect(id)}
              onSelect={workspace.setActiveSessionId}
              onClose={(session) => setClosing(session.id)}
              subscribeTerminal={workspace.subscribeTerminal}
              writeTerminal={workspace.writeTerminal}
              resizeTerminal={workspace.resizeTerminal}
            />
          </Suspense>
        </section>
      )}
      {closing && (
        <ConfirmDialog
          title="Close SSH session?"
          description="This disconnects the session and clears its terminal buffer."
          confirmLabel="Disconnect"
          danger={false}
          onConfirm={async () => {
            await workspace.closeSession(closing);
          }}
          onClose={() => setClosing(null)}
        />
      )}
    </>
  );
}

function GpuTelemetry({
  profile,
  visible,
}: {
  profile: VpsProfile;
  visible: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const state = useGpuTelemetry(profile, enabled && visible);
  return (
    <section className="mc-live-gpu">
      <div className="mc-gpu-heading">
        <Zap size={14} />
        <strong>GPU telemetry</strong>
        <button
          className="mc-copy"
          disabled={!visible || !profile.fingerprint}
          title={
            !profile.fingerprint
              ? "Connect SSH and verify the host first"
              : "Read-only nvidia-smi query over a separate SSH exec channel"
          }
          onClick={() => setEnabled(!enabled)}
        >
          {enabled ? <Pause size={12} /> : <Play size={12} />}{" "}
          {enabled ? "Stop" : "Read GPU stats"}
        </button>
      </div>
      {state.loading && <p>Reading nvidia-smi…</p>}
      {state.error && (
        <p className="mc-service-error" role="status">
          {state.error}
          {state.updatedAt ? " Last reading is stale." : ""}
        </p>
      )}
      {state.gpus.map((gpu) => (
        <div key={gpu.index} className="mc-gpu">
          <div>
            <strong>GPU {gpu.index}</strong>
            <span>{gpu.temperature}°C</span>
          </div>
          <GpuMeter
            label="GPU usage"
            value={gpu.gpuUsage}
            detail={`${gpu.gpuUsage}%`}
          />
          <GpuMeter
            label="VRAM occupancy"
            value={(gpu.vramUsed / gpu.vramTotal) * 100}
            detail={`${(gpu.vramUsed / 1024).toFixed(2)} / ${(gpu.vramTotal / 1024).toFixed(2)} GiB`}
          />
          <span className="mc-gpu-memory-activity">
            Memory engine activity: {gpu.vramUsage}%
          </span>
        </div>
      ))}
      {!state.gpus.length && !state.error && !enabled && (
        <p>
          Read-only query. Verify this device’s SSH fingerprint before starting.
        </p>
      )}
      {state.updatedAt && (
        <small>Updated {new Date(state.updatedAt).toLocaleTimeString()}</small>
      )}
    </section>
  );
}
function GpuMeter({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="mc-meter">
      <div>
        <span>{label}</span>
        <strong>{detail}</strong>
      </div>
      <div>
        <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}
