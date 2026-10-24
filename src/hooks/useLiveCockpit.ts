import { useCallback, useEffect, useRef, useState } from "react";
import {
  cockpitGet,
  kanbanEventsUrl,
  openServiceEvents,
  parseFeed,
  parseKanban,
  parseWorkers,
  type ActiveWorker,
} from "../lib/cockpit";
import type { CockpitConfig } from "../types";
import type {
  AgentActivity,
  MissionTask,
} from "../mission-control/MissionGraph";
export interface CockpitLiveState {
  tasks: MissionTask[];
  missionIds: string[];
  workers: ActiveWorker[];
  feed: AgentActivity[];
  status: "offline" | "connecting" | "connected" | "partial" | "error";
  errors: Record<string, string>;
  lastUpdated: number | null;
  streamStatus: Record<string, string>;
}
const empty = (): CockpitLiveState => ({
  tasks: [],
  missionIds: [],
  workers: [],
  feed: [],
  status: "offline",
  errors: {},
  lastUpdated: null,
  streamStatus: {},
});
export function useLiveCockpit(
  config: CockpitConfig | undefined,
  ready: boolean,
) {
  const [state, setState] = useState<CockpitLiveState>(empty),
    [revision, setRevision] = useState(0);
  const requestDetail = useRef<(id: string) => Promise<unknown>>(async () => {
    throw new Error("Kanban is not connected.");
  });
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    setState(empty());
    if (!ready || !config?.enabled) return;
    let eventTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false,
      busy = false,
      rerun = false;
    const controller = new AbortController();
    const stops: (() => void)[] = [];
    const errors: Record<string, string> = {};
    let board: unknown, orchestration: unknown;
    const safeError = (error: unknown) => {
      let text =
        error instanceof Error ? error.message : "Service connection failed.";
      for (const token of [config.kanbanToken, config.feedToken].filter(
        Boolean,
      ))
        text = text.split(token).join("[redacted]");
      return text.slice(0, 500);
    };
    setState((old) => ({ ...old, status: "connecting" }));
    requestDetail.current = async (id) => {
      if (!config.kanbanUrl)
        throw new Error("Configure a Kanban endpoint first.");
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(id))
        throw new Error("Invalid task ID.");
      return cockpitGet(
        config.kanbanUrl,
        `/tasks/${id}`,
        config.kanbanToken,
        controller.signal,
      );
    };
    const schedulePoll = () => {
      if (!eventTimer)
        eventTimer = setTimeout(() => {
          eventTimer = undefined;
          void poll();
        }, 750);
    };
    const poll = async () => {
      if (disposed) return;
      if (busy) {
        rerun = true;
        return;
      }
      busy = true;
      const jobs: { name: string; run: () => Promise<unknown> }[] = [];
      if (config.kanbanUrl) {
        jobs.push(
          {
            name: "board",
            run: () =>
              cockpitGet(
                config.kanbanUrl,
                "/board",
                config.kanbanToken,
                controller.signal,
              ),
          },
          {
            name: "orchestration",
            run: () =>
              cockpitGet(
                config.kanbanUrl,
                "/orchestration",
                config.kanbanToken,
                controller.signal,
              ),
          },
          {
            name: "workers",
            run: () =>
              cockpitGet(
                config.kanbanUrl,
                "/workers/active",
                config.kanbanToken,
                controller.signal,
              ),
          },
        );
      }
      if (config.feedUrl)
        jobs.push({
          name: "feed",
          run: () =>
            cockpitGet(
              config.feedUrl,
              "/api/v1/swarm/feed",
              config.feedToken,
              controller.signal,
            ),
        });
      if (!jobs.length) {
        busy = false;
        return;
      }
      let success = 0;
      const patch: Partial<CockpitLiveState> = {};
      await Promise.all(
        jobs.map(async (job) => {
          try {
            const value = await job.run();
            if (disposed) return;
            if (job.name === "board") board = value;
            else if (job.name === "orchestration") orchestration = value;
            else if (job.name === "workers")
              patch.workers = parseWorkers(value);
            else patch.feed = parseFeed(value).slice(-200);
            delete errors[job.name];
            success++;
          } catch (error) {
            if (!disposed) errors[job.name] = safeError(error);
          }
        }),
      );
      if (!disposed) {
        if (board !== undefined || orchestration !== undefined) {
          try {
            const parsed = parseKanban(board, orchestration);
            patch.tasks = parsed.tasks;
            patch.missionIds = parsed.missionIds;
            delete errors.schema;
          } catch (error) {
            errors.schema = safeError(error);
          }
        }
        setState((old) => ({
          ...old,
          ...patch,
          errors: { ...errors },
          status: success
            ? Object.keys(errors).length
              ? "partial"
              : "connected"
            : "error",
          lastUpdated: success ? Date.now() : old.lastUpdated,
        }));
      }
      busy = false;
      if (rerun && !disposed) {
        rerun = false;
        void poll();
      }
    };
    const subscribe = async (name: string, url: string, token: string) => {
      if (!url) return;
      try {
        const stop = await openServiceEvents(url, token, (event) => {
          if (disposed) return;
          if (event.type === "open")
            setState((old) => ({
              ...old,
              status:
                !config.kanbanUrl && !config.feedUrl ? "connected" : old.status,
              streamStatus: { ...old.streamStatus, [name]: "connected" },
            }));
          else if (event.type === "closed")
            setState((old) => ({
              ...old,
              streamStatus: {
                ...old.streamStatus,
                [name]: "disconnected; REST polling active",
              },
            }));
          else {
            try {
              const payload = JSON.parse(event.text);
              if (name === "kanban" && payload.event === "task_transition") {
                const taskId = payload.task_id;
                if (
                  typeof taskId === "string" &&
                  typeof payload.to_status === "string"
                )
                  setState((old) => ({
                    ...old,
                    tasks: old.tasks.map((task) =>
                      task.id === taskId
                        ? {
                            ...task,
                            lifecycle: payload.to_status,
                            status:
                              (
                                {
                                  todo: "queued",
                                  ready: "queued",
                                  running: "running",
                                  blocked: "error",
                                  review: "running",
                                  done: "complete",
                                } as const
                              )[payload.to_status as "todo"] ?? "unknown",
                            agent:
                              typeof payload.assignee === "string"
                                ? payload.assignee
                                : task.agent,
                          }
                        : task,
                    ),
                  }));
              }
              if (name === "a2a") {
                const received = parseFeed(
                  Array.isArray(payload)
                    ? payload
                    : Array.isArray(payload.events)
                      ? payload.events
                      : [payload],
                );
                setState((old) => ({
                  ...old,
                  feed: [
                    ...new Map(
                      [...old.feed, ...received].map((event) => [
                        event.id,
                        event,
                      ]),
                    ).values(),
                  ]
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, 200),
                  lastUpdated: Date.now(),
                }));
              }
              schedulePoll();
            } catch {
              setState((old) => ({
                ...old,
                streamStatus: {
                  ...old.streamStatus,
                  [name]: "invalid event; REST polling active",
                },
              }));
            }
          }
        });
        if (disposed) stop();
        else stops.push(stop);
      } catch (error) {
        if (!disposed)
          setState((old) => ({
            ...old,
            streamStatus: { ...old.streamStatus, [name]: safeError(error) },
          }));
      }
    };
    void poll();
    if (config.kanbanUrl) {
      try {
        void subscribe(
          "kanban",
          config.eventsUrl || kanbanEventsUrl(config.kanbanUrl),
          config.kanbanToken,
        );
      } catch {
        setState((old) => ({
          ...old,
          streamStatus: {
            ...old.streamStatus,
            kanban: "Invalid event URL. Check Settings.",
          },
        }));
      }
    }
    if (config.feedEventsUrl)
      void subscribe("a2a", config.feedEventsUrl, config.feedToken);
    const timer = setInterval(
      () => void poll(),
      Math.max(5000, Math.min(60000, Number.isFinite(config.pollInterval)?config.pollInterval:10000)),
    );
    return () => {
      disposed = true;
      controller.abort();
      clearInterval(timer);
      if (eventTimer) clearTimeout(eventTimer);
      stops.forEach((stop) => stop());
      requestDetail.current = async () => {
        throw new Error("Kanban is not connected.");
      };
    };
  }, [config, ready, revision]);
  return {
    ...state,
    refresh,
    loadTask: (id: string) => requestDetail.current(id),
  };
}
