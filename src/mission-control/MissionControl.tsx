import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Box,
  ChevronDown,
  ChevronRight,
  Command,
  GitBranch,
  Monitor,
  Network,
  Plus,
  Radio,
  Rabbit,
  Server,
  Settings2,
  ShieldCheck,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { Dialog } from "../components/Dialog";
import { UpdatePanel } from "../components/UpdatePanel";
import { useAppUpdater } from "../hooks/useAppUpdater";
import { GatewayClient } from "../lib/gatewayClient";
import type { HermesProfile, Section, VpsProfile } from "../types";
import { useWorkspace } from "../hooks/useWorkspace";
import { useLiveCockpit } from "../hooks/useLiveCockpit";
import { CockpitConnections } from "./CockpitConnections";
import { MissionGraph, AgentStream } from "./MissionGraph";
import { AgentsPanel } from "./AgentsPanel";
import { NodesPanel } from "./NodesPanel";
import { TelemetryPanel } from "./TelemetryPanel";
import { HermesForm, VpsForm } from "../components/ProfileForms";
import { availableNodes, nodeProfile } from "./workspace";
import { agents, nodes, type AgentId, type NodeId } from "./data";
import { SettingsPanel } from "./SettingsPanel";
import { Badge, EmptyState, PanelTitle } from "./ui";
import "./mission-control.css";

const NativeWorkspace = lazy(() =>
  import("../App").then((module) => ({ default: module.WorkspaceApp })),
);
type Tab = "swarm" | "agents" | "nodes" | "telemetry" | "settings";
type Connection = "offline" | "connecting" | "connected";
const tabs = [
  { id: "swarm", name: "Swarm", icon: Workflow },
  { id: "agents", name: "Agents", icon: Box },
  { id: "nodes", name: "Nodes", icon: Server },
  { id: "telemetry", name: "Telemetry", icon: Activity },
  { id: "settings", name: "Settings", icon: Settings2 },
] as const;

export default function MissionControl() {
  const workspace = useWorkspace();
  const updater = useAppUpdater({
    preview: workspace.preview,
    runInstall: workspace.runUpdateInstallation,
  });
  const updateBlockingReason = workspace.sessions.some(
    (session) => session.status === "connected" || session.status === "connecting",
  )
    ? "Close SSH sessions before installing an update."
    : workspace.streamingIds.size || workspace.commandBusyIds.size || workspace.commandsLoadingIds.size
      ? "Wait for Agent activity to finish before installing an update."
      : workspace.busy
        ? "Wait for workspace operations to finish before installing an update."
        : undefined;
  const live = useLiveCockpit(workspace.state.cockpit, workspace.ready);
  const deviceNodes = availableNodes(workspace.state.vps);
  const [agentForm, setAgentForm] = useState<{
    profile?: HermesProfile;
    initial?: Partial<HermesProfile>;
  } | null>(null);
  const [deviceForm, setDeviceForm] = useState<{
    profile?: VpsProfile;
    node: NodeId;
  } | null>(null);
  const [nodesVisited, setNodesVisited] = useState(false);
  const deviceCount = workspace.sessions
    .filter((s) => s.status === "connected")
    .reduce((ids, s) => ids.add(s.profileId), new Set<string>()).size;
  const toolCount = workspace.state.conversations.reduce(
    (sum, c) =>
      sum + c.messages.reduce((n, m) => n + (m.tools?.length ?? 0), 0),
    0,
  );
  useEffect(() => {
    if (!workspace.ready) {
      setAgentForm(null);
      setDeviceForm(null);
    }
  }, [workspace.ready]);
  const [tab, setTab] = useState<Tab>("swarm");
  const [activeAgent, setActiveAgent] = useState<AgentId>("LEVERET");
  const [target, setTarget] = useState<NodeId>("vps");
  useEffect(() => {
    if (!deviceNodes.some((node) => node.id === target)) setTarget("vps");
  }, [workspace.state.vps, target]);
  const [nativeSection, setNativeSection] = useState<Section | null>(null);
  const [notifications, setNotifications] = useState(false);
  const [notice, setNotice] = useState("");
  const [connection, setConnection] = useState<Connection>("offline");
  const [ping, setPing] = useState<number | null>(null);
  const gateway = useRef<GatewayClient | null>(null);
  useEffect(() => {
    if (!workspace.ready) {
      void gateway.current?.close();
      setConnection("offline");
      setPing(null);
    }
  }, [workspace.ready]);
  const connected = connection === "connected";
  const configure = () => setTab("settings");
  const openConnections = () =>
    setAgentForm({
      initial: {
        transport: "gateway",
        executionNode: target,
        category: "Core Fleet",
      },
    });
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(
    () => () => {
      void gateway.current?.close();
    },
    [],
  );
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const latency = await gateway.current!.ping();
        if (!cancelled) setPing(latency);
      } catch {
        if (!cancelled) {
          setConnection("offline");
          setPing(null);
          void gateway.current?.close();
        }
      }
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connected]);
  if (nativeSection || !workspace.ready)
    return (
      <div className="mc-native">
        <button className="mc-return" onClick={() => setNativeSection(null)}>
          <ArrowDownLeft size={14} /> Back to Mission Control
        </button>
        <Suspense
          fallback={<div className="mc-loading">Opening secure workspace…</div>}
        >
          <NativeWorkspace
            workspace={workspace}
            initialSection={nativeSection ?? "settings"}
            updater={updater}
          />
        </Suspense>
      </div>
    );
  return (
    <div className="mission-control font-sans antialiased">
      <aside className="mc-sidebar">
        <a
          className="mc-brand"
          href="#swarm"
          onClick={(event) => {
            event.preventDefault();
            setTab("swarm");
          }}
        >
          <span className="mc-brand-icon">
            <Rabbit size={26} strokeWidth={1.6} />
          </span>
          <span>
            warren<span className="mc-brand-dot">.</span>
            <small>MISSION CONTROL</small>
          </span>
        </a>
        <div className="mc-workspace-label">
          WORKSPACE <span>01</span>
        </div>
        <div className="mc-workspace-switch">
          <span className="mc-workspace-symbol">
            <Command size={17} />
          </span>
          <span>
            Personal swarm<small>Dual-node environment</small>
          </span>
          <ChevronDown size={13} />
        </div>
        <nav aria-label="Main navigation">
          {tabs.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                if (id === "nodes") setNodesVisited(true);
              }}
            >
              <Icon size={19} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="mc-sidebar-mission">
          <span className="mc-eyebrow">CURRENT MISSION</span>
          <div>
            <span className="mc-offline-dot" />
            {live.tasks.length
              ? `${live.tasks.length} tasks on board`
              : "No active mission"}
          </div>
          <p>
            {connected
              ? "Waiting for mission data from your Gateway."
              : "Connect your Gateway to get started."}
          </p>
          <button onClick={configure}>
            Connection settings <ArrowUpRight size={13} />
          </button>
        </div>
        <div className="mc-sidebar-bottom">
          <span>
            <ShieldCheck size={15} /> Your infrastructure. Your control.
          </span>
          <div>
            <span className="mc-user">
              <Rabbit size={15} />
            </span>
            <span>
              Personal workspace<small>Local device</small>
            </span>
            <button aria-label="Open settings" onClick={configure}>
              <Settings2 size={16} />
            </button>
          </div>
          <footer>
            WARREN v{updater.currentVersion}{" "}
            <span>
              HERMES POWERED <Zap size={9} />
            </span>
          </footer>
        </div>
      </aside>
      <div className="mc-main-shell">
        <header className="mc-topbar">
          <div className="mc-breadcrumb">
            <span className="mc-mobile-logo">
              <Rabbit size={24} />
            </span>
            <span className="mc-desktop-crumb">
              Workspace <ChevronRight size={12} />
            </span>
            <strong>{tabs.find((item) => item.id === tab)?.name}</strong>
          </div>
          <div className="mc-topbar-actions">
            <button
              className={`mc-connection ${connection}`}
              onClick={configure}
              title="Configure WebSocket Gateway"
            >
              <i />
              {connected
                ? `WS: Connected${ping !== null ? ` • ${ping}ms` : ""}`
                : connection === "connecting"
                  ? "WS: Connecting"
                  : "WS: Not connected"}
            </button>
            <span className="mc-top-divider" />
            <button
              className="mc-icon-btn"
              aria-label="View notifications"
              onClick={() => setNotifications(true)}
            >
              <Bell size={17} />
            </button>
            <span className="mc-user mc-top-user">
              <Rabbit size={15} />
            </span>
          </div>
        </header>
        <main className={`mc-content mc-page-${tab}`}>
          <div className="mc-page-heading">
            <div>
              <span className="mc-eyebrow">HERMES MULTI-AGENT SYSTEM</span>
              <h1>
                {tab === "swarm" ? (
                  <>
                    Your swarm, <span>in sync.</span>
                  </>
                ) : tab === "agents" ? (
                  <>
                    Meet your <span>crew.</span>
                  </>
                ) : tab === "nodes" ? (
                  <>
                    Two nodes. <span>One workspace.</span>
                  </>
                ) : tab === "telemetry" ? (
                  <>
                    Every action. <span>Full visibility.</span>
                  </>
                ) : (
                  <>
                    Built around <span>your control.</span>
                  </>
                )}
              </h1>
              <p>
                {tab === "swarm"
                  ? "Orchestrate the mission. Follow every handoff."
                  : tab === "agents"
                    ? "Specialized agents. Shared context. A direct line to each."
                    : tab === "nodes"
                      ? "Connect your VPS and PC to the same workspace."
                      : tab === "telemetry"
                        ? "Inspect tool calls, review patches, and trace the details."
                        : "Your gateway, credentials, and local security."}
              </p>
            </div>
            {tab === "swarm" ? (
              <button
                className="mc-button primary"
                disabled
                title={
                  connected
                    ? "Waiting for mission service availability"
                    : "Connect a Gateway and agent before starting a mission"
                }
              >
                <Plus size={16} /> New mission
              </button>
            ) : (
              <span className="mc-heading-meta">
                <span className="mc-offline-dot" />
                {tab === "agents"
                  ? `${workspace.state.hermes.length} profiles configured`
                  : tab === "nodes"
                    ? `${deviceCount} devices connected`
                    : tab === "telemetry"
                      ? `${toolCount} recorded tool calls`
                      : "Device preferences"}
              </span>
            )}
          </div>
          {tab === "swarm" && (
            <>
              <LiveConnectionSummary live={live} onSettings={configure} />
              <div className="mc-stat-grid">
                <Stat
                  icon={<Workflow size={18} />}
                  label="ACTIVE TASKS"
                  value={String(
                    live.tasks.filter((t) => t.status === "running").length,
                  )}
                  detail={
                    live.tasks.length
                      ? `${live.tasks.length} tasks on board`
                      : "No active mission"
                  }
                />
                <Stat
                  icon={<Box size={18} />}
                  label="CONFIGURED AGENTS"
                  value={String(workspace.state.hermes.length)}
                  detail={
                    workspace.state.hermes.length
                      ? "Profiles in your vault"
                      : "No agents configured"
                  }
                />
                <Stat
                  icon={<Server size={18} />}
                  label="CONNECTED NODES"
                  value={String(deviceCount)}
                  detail={
                    deviceCount
                      ? "Active SSH connections"
                      : "No devices connected"
                  }
                />
                <Stat
                  icon={<Zap size={18} />}
                  label="TOOL EXECUTIONS"
                  value={String(toolCount)}
                  detail={
                    toolCount ? "Recorded tool calls" : "No execution history"
                  }
                />
              </div>
              <div className="mc-dashboard-grid">
                <section className="mc-panel mc-mission-panel">
                  <PanelTitle
                    icon={<GitBranch size={16} />}
                    title="Mission graph"
                    extra={
                      <Badge
                        tone={live.status === "connected" ? "teal" : "neutral"}
                      >
                        {live.tasks.length
                          ? `${live.tasks.length} TASKS`
                          : "NO ACTIVE MISSION"}
                      </Badge>
                    }
                  />
                  <MissionGraph
                    tasks={live.tasks}
                    onConfigure={configure}
                    loadTask={live.loadTask}
                  />
                  <KanbanLifecycle tasks={live.tasks} />
                  <div className="mc-mission-footer">
                    <span>
                      {connected
                        ? "Waiting for mission data"
                        : "Gateway not connected"}
                    </span>
                    <ShieldCheck size={13} />
                  </div>
                </section>
                <aside className="mc-right-stack">
                  <section className="mc-panel">
                    <PanelTitle
                      icon={<Network size={16} />}
                      title="Execution nodes"
                      extra={
                        <button
                          className="mc-icon-btn"
                          aria-label="View all nodes"
                          onClick={() => {
                            setTab("nodes");
                            setNodesVisited(true);
                          }}
                        >
                          <ArrowUpRight size={15} />
                        </button>
                      }
                    />
                    {(["vps", "pc"] as const).map((node) => (
                      <button
                        className="mc-compact-node mc-named-node"
                        key={node}
                        onClick={() => {
                          setTab("nodes");
                          setNodesVisited(true);
                        }}
                      >
                        <span className={`mc-node-icon ${node}`}>
                          {node === "vps" ? (
                            <Server size={18} />
                          ) : (
                            <Monitor size={18} />
                          )}
                        </span>
                        <span>
                          <strong>
                            {nodes.find((n) => n.id === node)!.name}
                          </strong>
                          <small>
                            {workspace.sessions.some(
                              (s) =>
                                s.profileId ===
                                  nodeProfile(workspace.state.vps, node)?.id &&
                                s.status === "connected",
                            )
                              ? "SSH connected"
                              : "No device connected"}
                          </small>
                        </span>
                        <span className="mc-node-disconnected">
                          {workspace.sessions.some(
                            (s) =>
                              s.profileId ===
                                nodeProfile(workspace.state.vps, node)?.id &&
                              s.status === "connected",
                          )
                            ? "Connected"
                            : "Not connected"}
                        </span>
                      </button>
                    ))}
                    <div className="mc-node-link">
                      <ShieldCheck size={12} />
                      <span>Configure a device to enable execution</span>
                    </div>
                  </section>
                  <section className="mc-panel">
                    <PanelTitle
                      icon={<Box size={16} />}
                      title="Active workers"
                    />
                    {live.workers.length ? (
                      <div className="mc-worker-list">
                        {live.workers.map((worker) => (
                          <div key={`${worker.profile}:${worker.taskId}`}>
                            <strong>{worker.profile}</strong>
                            <small>
                              {worker.taskId ?? "Task not reported"}
                            </small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        icon={<Box size={24} />}
                        title="No active workers"
                        action={
                          <button
                            className="mc-button secondary"
                            onClick={openConnections}
                          >
                            Connect an agent <ArrowUpRight size={14} />
                          </button>
                        }
                      >
                        Worker task locks appear from the Kanban service.
                      </EmptyState>
                    )}
                  </section>
                </aside>
                <section className="mc-panel mc-stream-panel">
                  <PanelTitle
                    icon={<Radio size={16} />}
                    title="Inter-agent stream"
                    extra={
                      <Badge>
                        {live.feed.length
                          ? `${live.feed.length} EVENTS`
                          : "NO ACTIVITY"}
                      </Badge>
                    }
                  />
                  <AgentStream events={live.feed} />
                </section>
              </div>
            </>
          )}
          <div className="mc-agent-container" hidden={tab !== "agents"}>
            <AgentsPanel
              visible={tab === "agents"}
              active={activeAgent}
              onSelect={(id) => {
                setActiveAgent(id);
                setTarget(
                  agents.find((agent) => agent.id === id)?.node ??
                    workspace.state.hermes.find((p) => p.id === id)
                      ?.executionNode ??
                    "vps",
                );
              }}
              target={target}
              setTarget={setTarget}
              workspace={workspace}
              onConnect={(initial) => setAgentForm({ initial })}
              onEdit={(profile) => setAgentForm({ profile })}
            />
          </div>
          {nodesVisited && (
            <div hidden={tab !== "nodes"}>
              <NodesPanel
                workspace={workspace}
                visible={tab === "nodes"}
                onConfigure={(node, profile) =>
                  setDeviceForm({ node, profile })
                }
              />
            </div>
          )}
          {tab === "telemetry" && <TelemetryPanel workspace={workspace} />}
          {tab === "settings" && (
            <>
              <div className="mc-app-updates">
                <UpdatePanel updater={updater} blockingReason={updateBlockingReason} />
              </div>
              <CockpitConnections
                workspace={workspace}
                live={live}
                onRefresh={live.refresh}
              />
              <SettingsPanel
                connection={connection}
                setConnection={setConnection}
                setPing={setPing}
                gateway={gateway}
                onNative={() => setNativeSection("settings")}
                onNotice={setNotice}
              />
            </>
          )}
          <div className="mc-page-footer">
            <span>
              <span className={connected ? "mc-live-dot" : "mc-offline-dot"} />
              {connected ? "GATEWAY CONNECTED" : "GATEWAY NOT CONNECTED"}
            </span>
            <span>
              Warren / Hermes Mission Control{" "}
              <span className="mc-footer-cross">+</span>
            </span>
          </div>
        </main>
        <nav className="mc-bottom-nav" aria-label="Mobile navigation">
          {tabs.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                if (id === "nodes") setNodesVisited(true);
              }}
            >
              <span>
                <Icon size={21} />
              </span>
              <span>{name}</span>
            </button>
          ))}
        </nav>
      </div>
      {(workspace.error || workspace.saveError) && (
        <div className="mc-workspace-error" role="alert">
          <span>{workspace.saveError || workspace.error}</span>
          <button aria-label="Dismiss error" onClick={workspace.clearError}>
            <X size={16} />
          </button>
        </div>
      )}
      {agentForm && (
        <HermesForm
          profile={agentForm.profile}
          initialValues={agentForm.initial}
          nodeOptions={deviceNodes}
          onSave={workspace.saveHermes}
          onClose={() => setAgentForm(null)}
        />
      )}
      {deviceForm && (
        <VpsForm
          profile={deviceForm.profile}
          initialValues={{
            name: deviceNodes.find((n) => n.id === deviceForm.node)?.name ?? "",
            host: deviceNodes.find((n) => n.id === deviceForm.node)?.host ?? "",
            username: "",
            executionNode:
              deviceForm.node === "vps" || deviceForm.node === "pc"
                ? deviceForm.node
                : undefined,
          }}
          onSave={workspace.saveVps}
          onClose={() => setDeviceForm(null)}
        />
      )}
      {workspace.hostPrompt && (
        <Dialog
          title="Verify server identity"
          description="Compare this fingerprint with your server provider before authenticating."
          onClose={workspace.rejectHost}
        >
          <div className="mc-trace">
            <h3>{workspace.hostPrompt.host}</h3>
            <code className="mc-host-fingerprint">
              {workspace.hostPrompt.fingerprint}
            </code>
            <p>Accept only if the fingerprint matches your trusted source.</p>
            <div className="flex gap-3 mt-6">
              <button
                className="mc-button secondary"
                onClick={workspace.rejectHost}
              >
                Cancel connection
              </button>
              <button
                className="mc-button primary"
                disabled={workspace.busy}
                onClick={() => void workspace.acceptHost()}
              >
                Trust & connect
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {notice && (
        <div className="mc-toast" role="status">
          <ShieldCheck size={16} />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {notifications && (
        <Dialog title="Notifications" onClose={() => setNotifications(false)}>
          <EmptyState icon={<Bell size={27} />} title="No notifications yet">
            Connection and mission updates will appear here when available.
          </EmptyState>
        </Dialog>
      )}
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="mc-stat">
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </section>
  );
}

function LiveConnectionSummary({
  live,
  onSettings,
}: {
  live: ReturnType<typeof useLiveCockpit>;
  onSettings: () => void;
}) {
  return (
    <div className="mc-live-summary">
      <div>
        <Badge tone={live.status === "connected" ? "teal" : "neutral"}>
          {live.status === "offline"
            ? "SERVICES NOT CONNECTED"
            : live.status.toUpperCase()}
        </Badge>
        <span>
          {live.lastUpdated
            ? `Updated ${new Date(live.lastUpdated).toLocaleTimeString()}`
            : "Configure the Kanban and A2A endpoints in Settings."}
        </span>
      </div>
      <button className="mc-copy" onClick={onSettings}>
        Connections <ArrowUpRight size={12} />
      </button>
      {Object.entries(live.errors).map(([name, message]) => (
        <p className="mc-service-error" key={name}>
          {name}: {message}
        </p>
      ))}
    </div>
  );
}
function KanbanLifecycle({
  tasks,
}: {
  tasks: import("./MissionGraph").MissionTask[];
}) {
  if (!tasks.length) return null;
  return (
    <div className="mc-kanban-lifecycle">
      {["todo", "ready", "running", "blocked", "review", "done"].map(
        (status) => (
          <span key={status}>
            <b>{tasks.filter((task) => task.lifecycle === status).length}</b>
            {status}
          </span>
        ),
      )}
    </div>
  );
}
