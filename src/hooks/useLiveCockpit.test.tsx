import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_COCKPIT, type ServiceEvent } from "../lib/cockpit";
import { useLiveCockpit } from "./useLiveCockpit";
const mock = vi.hoisted(() => ({ get: vi.fn(), open: vi.fn(), stop: vi.fn() }));
vi.mock("../lib/cockpit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/cockpit")>()),
  cockpitGet: mock.get,
  openServiceEvents: mock.open,
}));
let handler: (event: ServiceEvent) => void;
beforeEach(() => {
  vi.useFakeTimers();
  mock.get.mockReset();
  mock.stop.mockReset();
  mock.open.mockReset().mockImplementation(async (_url, _token, listener) => {
    handler = listener;
    return mock.stop;
  });
  mock.get.mockImplementation(async (_base, path) =>
    path === "/board"
      ? {
          tasks: [
            {
              id: "task-1",
              title: "Build",
              status: "ready",
              assignee: "forge",
            },
          ],
        }
      : path === "/orchestration"
        ? { nodes: [] }
        : path === "/workers/active"
          ? { workers: [{ profile: "forge", task_id: "task-1" }] }
          : path === "/api/v1/swarm/feed"
            ? []
            : { id: "task-1", comments: ["Handoff ready"] },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("does not contact services until the saved connection is enabled and the vault is ready", async () => {
  const h = renderHook(() => useLiveCockpit(DEFAULT_COCKPIT, true));
  await act(async () => {});
  expect(mock.get).not.toHaveBeenCalled();
  h.rerender();
  expect(h.result.current.status).toBe("offline");
});
it("loads the documented routes, refreshes on transitions, and closes on lock", async () => {
  const config = { ...DEFAULT_COCKPIT, enabled: true, feedUrl: "" };
  const h = renderHook(({ ready }) => useLiveCockpit(config, ready), {
    initialProps: { ready: true },
  });
  await act(async () => {});
  expect(h.result.current.tasks[0]).toMatchObject({
    id: "task-1",
    lifecycle: "ready",
  });
  expect(h.result.current.workers[0].profile).toBe("forge");
  expect(mock.get.mock.calls.map((call) => call[1])).toEqual([
    "/board",
    "/orchestration",
    "/workers/active",
  ]);
  await act(async () =>
    handler({
      type: "message",
      text: JSON.stringify({
        event: "task_transition",
        task_id: "task-1",
        from_status: "ready",
        to_status: "running",
        assignee: "forge",
      }),
    }),
  );
  expect(h.result.current.tasks[0]).toMatchObject({
    status: "running",
    lifecycle: "running",
  });
  await act(async () => vi.advanceTimersByTime(800));
  expect(mock.get.mock.calls.length).toBe(6);
  let details: unknown;
  await act(async () => {
    details = await h.result.current.loadTask("task-1");
  });
  expect(details).toMatchObject({ comments: ["Handoff ready"] });
  h.rerender({ ready: false });
  await act(async () => {});
  expect(mock.stop).toHaveBeenCalledTimes(1);
  expect(h.result.current.tasks).toEqual([]);
  const count = mock.get.mock.calls.length;
  await act(async () => vi.advanceTimersByTime(20000));
  expect(mock.get).toHaveBeenCalledTimes(count);
});
it("keeps partial services usable and surfaces access errors", async () => {
  mock.get.mockImplementation(async (_base, path) => {
    if (path === "/api/v1/swarm/feed") throw new Error("HTTP 401");
    if (path === "/workers/active") return [];
    if (path === "/orchestration") return { nodes: [] };
    return { tasks: [] };
  });
  const config = { ...DEFAULT_COCKPIT, enabled: true };
  const h = renderHook(() => useLiveCockpit(config, true));
  await act(async () => {});
  expect(h.result.current.status).toBe("partial");
  expect(h.result.current.errors.feed).toBe("HTTP 401");
});
it("consumes a direct A2A WebSocket tailer without inventing a feed REST route", async () => {
  const config = {
    ...DEFAULT_COCKPIT,
    enabled: true,
    kanbanUrl: "",
    feedUrl: "",
    feedEventsUrl: "ws://100.65.133.127:3450/events",
  };
  const h = renderHook(() => useLiveCockpit(config, true));
  await act(async () => {});
  await act(async () => {
    handler({ type: "open" });
    handler({
      type: "message",
      text: JSON.stringify({
        ts: 1792839490.939,
        sender: "leveret",
        peer: "forge",
        task_id: "task-1",
        summary: "Handoff ready",
      }),
    });
  });
  expect(mock.get).not.toHaveBeenCalled();
  expect(h.result.current.feed[0]).toMatchObject({
    from: "leveret",
    to: "forge",
    text: "Handoff ready",
  });
  expect(h.result.current.status).toBe("connected");
});
