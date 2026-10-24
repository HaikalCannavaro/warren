import { useState } from "react";
import { Activity, Radio, Save, Square, RotateCw } from "lucide-react";
import type { Workspace } from "./workspace";
import type { CockpitConfig } from "../types";
import { DEFAULT_COCKPIT, serviceUrl } from "../lib/cockpit";
import { Badge, PanelTitle } from "./ui";
import type { CockpitLiveState } from "../hooks/useLiveCockpit";
export function CockpitConnections({
  workspace,
  live,
  onRefresh,
}: {
  workspace: Workspace;
  live: CockpitLiveState;
  onRefresh: () => void;
}) {
  const [value, setValue] = useState<CockpitConfig>(
      workspace.state.cockpit ?? DEFAULT_COCKPIT,
    ),
    [error, setError] = useState("");
  const update = (key: keyof CockpitConfig, text: string) =>
    setValue((old) => ({ ...old, [key]: text }));
  const save = () => {
    try {
      if (!value.kanbanUrl && !value.feedUrl && !value.feedEventsUrl)
        throw new Error("Add a Kanban or A2A endpoint first.");
      const next = {
        ...value,
        enabled: true,
        kanbanUrl: value.kanbanUrl ? serviceUrl(value.kanbanUrl) : "",
        feedUrl: value.feedUrl ? serviceUrl(value.feedUrl) : "",
        eventsUrl: value.eventsUrl ? serviceUrl(value.eventsUrl, true) : "",
        feedEventsUrl: value.feedEventsUrl
          ? serviceUrl(value.feedEventsUrl, true)
          : "",
        pollInterval: 10000,
      };
      workspace.updateCockpit(next);
      setValue(next);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Invalid service configuration.",
      );
    }
  };
  return (
    <section className="mc-panel mc-service-settings">
      <PanelTitle
        icon={<Radio size={16} />}
        title="Kanban & A2A connections"
        extra={
          <Badge tone={live.status === "connected" ? "teal" : "neutral"}>
            {live.status.toUpperCase()}
          </Badge>
        }
      />
      <form
        className="mc-settings-inner"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <h3>Your orchestration endpoints.</h3>
        <p>
          Use a reachable Tailscale address. A localhost URL refers to the
          device running Warren, not to your VPS.
        </p>
        <label>
          Kanban base URL
          <input
            type="url"
            placeholder="http://100.65.133.127:9119/api/plugins/kanban"
            value={value.kanbanUrl}
            onChange={(e) => update("kanbanUrl", e.target.value)}
          />
        </label>
        <label>
          Kanban token <span>OPTIONAL · VAULT</span>
          <input
            type="password"
            autoComplete="off"
            value={value.kanbanToken}
            onChange={(e) => update("kanbanToken", e.target.value)}
            placeholder="If your plugin requires authentication"
          />
        </label>
        <label>
          A2A Cockpit base URL
          <input
            type="url"
            placeholder="http://100.65.133.127:3450"
            value={value.feedUrl}
            onChange={(e) => update("feedUrl", e.target.value)}
          />
        </label>
        <label>
          A2A token <span>OPTIONAL · VAULT</span>
          <input
            type="password"
            autoComplete="off"
            value={value.feedToken}
            onChange={(e) => update("feedToken", e.target.value)}
            placeholder="If your aggregator requires authentication"
          />
        </label>
        <details className="mc-service-advanced">
          <summary>Event stream overrides</summary>
          <label>
            Kanban WebSocket
            <input
              type="url"
              placeholder="Derived from the Kanban base URL"
              value={value.eventsUrl}
              onChange={(e) => update("eventsUrl", e.target.value)}
            />
          </label>
          <label>
            A2A WebSocket
            <input
              type="url"
              placeholder="Optional; leave empty to use REST polling"
              value={value.feedEventsUrl}
              onChange={(e) => update("feedEventsUrl", e.target.value)}
            />
          </label>
        </details>
        {error && (
          <p className="mc-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-5">
          <button className="mc-button primary" type="submit">
            <Save size={14} />
            Save & connect
          </button>
          {workspace.state.cockpit?.enabled && (
            <button
              className="mc-button secondary"
              type="button"
              onClick={() => {
                const next = { ...value, enabled: false };
                workspace.updateCockpit(next);
                setValue(next);
              }}
            >
              <Square size={13} />
              Disconnect
            </button>
          )}
          <button
            className="mc-button secondary"
            type="button"
            disabled={!workspace.state.cockpit?.enabled}
            onClick={onRefresh}
          >
            <RotateCw size={13} />
            Refresh
          </button>
        </div>
        <div className="mc-settings-foot">
          <Activity size={13} />
          {workspace.preview
            ? "Browser settings stay in memory. Native settings are saved in the local encrypted vault."
            : "Saved in your local encrypted vault. REST refresh: every 10 seconds."}
        </div>
        {Object.entries(live.errors).map(([name, message]) => (
          <p className="mc-service-error" role="status" key={name}>
            <strong>{name}</strong> {message}
          </p>
        ))}
        {Object.entries(live.streamStatus).map(([name, status]) => (
          <p className="mc-service-error" key={name}>
            {name} events: {status}
          </p>
        ))}
      </form>
    </section>
  );
}
