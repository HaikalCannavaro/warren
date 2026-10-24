import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  Globe2,
  Layers3,
  Loader2,
  Monitor,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { agents, type AgentId, type Category, type NodeId } from "./data";
import { Avatar, Badge, EmptyState, PanelTitle } from "./ui";
import { agentProfiles, availableNodes, type Workspace } from "./workspace";
const MarkdownMessage = lazy(() =>
  import("./MarkdownMessage").then((module) => ({
    default: module.MarkdownMessage,
  })),
);
import { ArtifactPreview } from "./ArtifactPreview";
import { ToolChain } from "./ToolCard";
import type { HermesProfile, ToolExecution } from "../types";

function ToolGroups({ tools }: { tools: ToolExecution[] }) {
  const groups: ToolExecution[][] = [];
  for (const tool of tools) {
    const last = groups.at(-1);
    if (last && last[0].group === tool.group) last.push(tool);
    else groups.push([tool]);
  }
  return (
    <>
      {groups.map((group, index) => (
        <ToolChain tools={group} key={index} />
      ))}
    </>
  );
}
export function AgentsPanel({
  visible,
  active,
  onSelect,
  target,
  setTarget,
  workspace,
  onConnect,
  onEdit,
}: {
  visible: boolean;
  active: AgentId;
  onSelect: (id: AgentId) => void;
  target: NodeId;
  setTarget: (id: NodeId) => void;
  workspace: Workspace;
  onConnect: (values?: Partial<HermesProfile>) => void;
  onEdit: (profile: HermesProfile) => void;
}) {
  const nodes = availableNodes(workspace.state.vps);
  const [category, setCategory] = useState<Category>("Core Fleet");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [nodeMenu, setNodeMenu] = useState(false);
  const carousel = useRef<HTMLDivElement>(null),
    scroll = useRef<HTMLDivElement>(null);
  const predefined = agents.filter((agent) => agent.category === category);
  const custom = workspace.state.hermes
    .filter(
      (profile) =>
        (profile.category ?? "Core Fleet") === category &&
        !predefined.some(
          (agent) =>
            (profile.agentProfile ?? profile.name).toUpperCase() === agent.id,
        ),
    )
    .map((profile) => ({
      id: profile.id,
      role: profile.name,
      color: "#8b9ab0",
      initials: profile.name.slice(0, 2),
      node: profile.executionNode ?? "vps",
      category,
    }));
  const roster = [...predefined, ...custom];
  const agent =
    [...agents, ...custom].find((item) => item.id === active) ?? agents[0];
  const matching = agentProfiles(workspace.state.hermes, active).filter(
    (profile) => (profile.category ?? "Core Fleet") === category,
  );
  const profile = matching.find((profile) => profile.executionNode === target);
  const conversation = profile
    ? workspace.state.conversations
        .filter((c) => c.profileId === profile.id)
        .sort((a, b) => b.createdAt - a.createdAt)[0]
    : undefined;
  const busy =
    !!conversation &&
    (workspace.streamingIds.has(conversation.id) ||
      workspace.commandBusyIds.has(conversation.id));
  const draft = conversation?.draft ?? drafts[`${active}:${target}`] ?? "";
  const canSend =
    !!profile &&
    nodes.some((node) => node.id === target) &&
    !workspace.preview &&
    !workspace.busy &&
    !busy &&
    !!draft.trim();
  const status = busy ? "RESPONDING" : profile ? "CONFIGURED" : "NOT CONNECTED";
  useEffect(() => {
    if (!visible || !carousel.current) return;
    const card = carousel.current.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    if (card)
      carousel.current.scrollTo?.({
        left: card.offsetLeft - carousel.current.offsetLeft - 12,
        behavior: "smooth",
      });
  }, [active, visible]);
  const latestText = conversation?.messages.at(-1)?.content;
  useEffect(() => {
    if (visible && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [visible, active, target, latestText, conversation?.executionLog?.length]);
  const changeDraft = (text: string) => {
    if (conversation) workspace.setDraft(conversation.id, text);
    else setDrafts((old) => ({ ...old, [`${active}:${target}`]: text }));
  };
  const send = async () => {
    if (!canSend || !profile) return;
    setError("");
    try {
      const id = conversation?.id ?? workspace.createConversation(profile.id);
      if (!id) return;
      workspace.setDraft(id, draft);
      setDrafts((old) => ({ ...old, [`${active}:${target}`]: "" }));
      await workspace.sendMessage(id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Message could not be sent.",
      );
    }
  };
  const add = () =>
    onConnect({
      name: agent.id,
      agentProfile: agent.id,
      transport: "gateway",
      executionNode: target,
      category,
    });
  return (
    <>
      <div
        className="mc-category-tabs"
        role="tablist"
        aria-label="Agent categories"
      >
        {(["Core Fleet", "Security", "Companions"] as const).map((name) => (
          <button
            role="tab"
            aria-selected={category === name}
            key={name}
            onClick={() => {
              setCategory(name);
              setError("");
              setNodeMenu(false);
              const next =
                agents.find((a) => a.category === name) ??
                workspace.state.hermes.find((p) => p.category === name);
              if (next) onSelect(next.id);
            }}
          >
            {name === "Security" ? (
              <ShieldCheck size={13} />
            ) : name === "Companions" ? (
              <Globe2 size={13} />
            ) : (
              <Layers3 size={13} />
            )}{" "}
            {name}
          </button>
        ))}
      </div>
      {!roster.length ? (
        <div className="mc-panel mc-empty-category">
          <EmptyState
            icon={
              category === "Security" ? (
                <ShieldCheck size={24} />
              ) : (
                <Globe2 size={24} />
              )
            }
            title={`No ${category.toLowerCase()} agents configured`}
            action={
              <button
                className="mc-button secondary"
                onClick={() =>
                  onConnect({
                    category,
                    transport: "gateway",
                    executionNode: target,
                  })
                }
              >
                <Plus size={14} />
                Add agent
              </button>
            }
          >
            Add an agent profile to this category to start a conversation.
          </EmptyState>
        </div>
      ) : (
        <>
          <div
            className="mc-agent-carousel"
            aria-label="Agent roster"
            ref={carousel}
          >
            {roster.map((item) => (
              <button
                key={item.id}
                aria-pressed={active === item.id}
                className={`mc-agent-card ${active === item.id ? "selected" : ""}`}
                onClick={() => {
                  onSelect(item.id);
                  setTarget(item.node as NodeId);
                  setError("");
                }}
                style={{ "--agent": item.color } as CSSProperties}
              >
                <div>
                  <Avatar id={item.id} />
                  <span className="mc-agent-node">
                    {item.category === "Core Fleet" ? "CORE" : "AGENT"}
                  </span>
                </div>
                <strong>
                  {agents.some((a) => a.id === item.id) ? item.id : item.role}
                </strong>
                <span>{item.role}</span>
                <small className="mc-agent-offline">
                  <span className="mc-offline-dot" />
                  {agentProfiles(workspace.state.hermes, item.id).filter(
                    (p) => (p.category ?? "Core Fleet") === category,
                  ).length
                    ? "Configured"
                    : "Not connected"}
                </small>
              </button>
            ))}
          </div>
          <div className="mc-chat-layout">
            <section className="mc-panel mc-chat-panel">
              <div className="mc-chat-header">
                <Avatar id={active} />
                <span>
                  <strong>
                    {agents.some((a) => a.id === active) ? active : agent.role}
                    <Badge tone={busy ? "teal" : "neutral"}>{status}</Badge>
                  </strong>
                  <small>
                    {agent.role}
                    <span>·</span>
                    {profile
                      ? (nodes.find((n) => n.id === target)?.name ??
                        "Device unavailable")
                      : "No endpoint assigned"}
                  </small>
                </span>
                <button
                  className="mc-icon-btn"
                  aria-label={
                    profile
                      ? "Edit agent connection"
                      : "Configure agent connection"
                  }
                  onClick={() => (profile ? onEdit(profile) : add())}
                >
                  <Plus size={17} />
                </button>
              </div>
              <div className="mc-chat-scroll" ref={scroll}>
                {!conversation?.messages.length ? (
                  <EmptyState
                    icon={<Avatar id={active} />}
                    title={
                      profile
                        ? "Start a conversation"
                        : `${agents.some((a) => a.id === active) ? active : agent.role} is not connected`
                    }
                    action={
                      <button
                        className="mc-button secondary"
                        onClick={profile ? () => onEdit(profile) : add}
                      >
                        {profile
                          ? "Connection settings"
                          : `Connect ${agents.some((a) => a.id === active) ? active : "agent"}`}
                        <ArrowUpRight size={14} />
                      </button>
                    }
                  >
                    {profile
                      ? workspace.preview
                        ? "Open the installed app to connect to this agent."
                        : "Messages will be sent to the endpoint assigned to this node."
                      : `Assign an agent endpoint on ${nodes.find((n) => n.id === target)?.name ?? "Device unavailable"} to send messages and run tools.`}
                  </EmptyState>
                ) : (
                  conversation.messages.map((message) => (
                    <article
                      key={message.id}
                      className={`mc-chat-message ${message.role === "user" ? "user" : "agent"}`}
                    >
                      {message.role === "assistant" && (
                        <Avatar id={active} small />
                      )}
                      <div className="mc-message-bubble">
                        {message.role === "assistant" && (
                          <div
                            className="mc-message-byline"
                            style={{ color: agent.color }}
                          >
                            {message.agentProfile ??
                              profile?.agentProfile ??
                              agent.role}
                          </div>
                        )}
                        <Suspense fallback={<p>{message.content}</p>}>
                          <MarkdownMessage>{message.content}</MarkdownMessage>
                        </Suspense>
                        {message.tools && <ToolGroups tools={message.tools} />}
                        {message.artifacts?.map((artifact) => (
                          <ArtifactPreview
                            key={artifact.id}
                            artifact={artifact}
                          />
                        ))}{" "}
                        {message.status === "streaming" && !message.content && (
                          <p className="mc-waiting">
                            <Loader2 size={12} className="mc-spin" />
                            Waiting for the agent…
                          </p>
                        )}
                        {message.error && (
                          <p className="mc-form-error" role="alert">
                            {message.error}
                          </p>
                        )}
                        {message.status === "unknown" && (
                          <p className="mc-unknown">
                            Outcome unknown. Check the agent before sending
                            again.
                          </p>
                        )}
                        <div className="mc-message-time">
                          {new Intl.DateTimeFormat(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(message.createdAt))}
                          <span>
                            {message.status === "streaming"
                              ? "Receiving"
                              : message.status === "error"
                                ? "Error"
                                : message.status === "unknown"
                                  ? "Unknown"
                                  : ""}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <div className="mc-composer">
                {error && (
                  <p className="mc-form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="mc-composer-top">
                  <span>
                    <ArrowUpRight size={12} />
                    EXECUTE ON
                  </span>
                  <div className="mc-target-selector">
                    <button
                      className="mc-target-pill"
                      aria-expanded={nodeMenu}
                      onClick={() => setNodeMenu(!nodeMenu)}
                    >
                      {target === "vps" ? (
                        <Globe2 size={13} />
                      ) : (
                        <Monitor size={13} />
                      )}
                      <span>
                        {nodes.find((n) => n.id === target)?.name ??
                          "Device unavailable"}
                      </span>
                      <ChevronDown size={12} />
                    </button>
                    {nodeMenu && (
                      <div
                        className="mc-target-menu"
                        role="group"
                        aria-label="Execution node"
                      >
                        {nodes.map((node) => (
                          <button
                            key={node.id}
                            aria-pressed={target === node.id}
                            onClick={() => {
                              setTarget(node.id);
                              setNodeMenu(false);
                            }}
                          >
                            {node.id === "vps" ? (
                              <Globe2 size={13} />
                            ) : (
                              <Monitor size={13} />
                            )}
                            <span>
                              {node.name}
                              <small>
                                {matching.some(
                                  (p) => p.executionNode === node.id,
                                )
                                  ? "Endpoint configured"
                                  : "No endpoint configured"}
                              </small>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send();
                  }}
                >
                  <textarea
                    aria-label={`Message ${active}`}
                    placeholder={
                      profile
                        ? `Message ${profile.agentProfile ?? profile.name}…`
                        : "Connect an agent to send a message"
                    }
                    rows={1}
                    disabled={!profile || workspace.preview}
                    value={draft}
                    onChange={(event) => changeDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <button
                    className="mc-send"
                    type="submit"
                    aria-label="Send message"
                    disabled={!canSend}
                  >
                    {busy ? (
                      <Loader2 size={16} className="mc-spin" />
                    ) : (
                      <ArrowUp size={19} />
                    )}
                  </button>
                </form>
                <div className="mc-composer-note">
                  <span>
                    {profile
                      ? "Node selection uses its assigned agent endpoint"
                      : "No agent endpoint assigned to this node"}
                  </span>
                  <span>↵ send</span>
                </div>
              </div>
            </section>
            <aside className="mc-chat-context mc-panel">
              <PanelTitle icon={<Layers3 size={15} />} title="Shared context" />
              <EmptyState
                icon={<Layers3 size={24} />}
                title="No shared context"
              >
                Files and agent handoffs will appear when a mission supplies
                them.
              </EmptyState>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
