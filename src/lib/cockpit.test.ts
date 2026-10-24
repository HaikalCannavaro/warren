import { describe, expect, it } from "vitest";
import {
  kanbanEventsUrl,
  parseFeed,
  parseGpuCsv,
  parseKanban,
  parseWorkers,
  serviceUrl,
} from "./cockpit";
import { availableNodes, nodeProfile } from "../mission-control/workspace";
import type { VpsProfile } from "../types";
describe("live cockpit adapters", () => {
  it("normalizes the documented Kanban columns, DAG links, and orchestration nodes", () => {
    const result = parseKanban(
      {
        columns: {
          done: [
            {
              id: "parent",
              title: "Plan",
              assignee: "leveret",
              mission_id: "mission-1",
            },
          ],
          running: [
            {
              id: "child",
              title: "Build",
              assignee: "forge",
              mission_id: "mission-1",
            },
          ],
        },
        task_links: [{ parent_id: "parent", child_id: "child" }],
      },
      { nodes: [{ id: "child", node_id: "vps" }] },
    );
    expect(result.tasks.find((task) => task.id === "child")).toMatchObject({
      agent: "forge",
      status: "running",
      lifecycle: "running",
      node: "vps",
      dependencies: ["parent"],
    });
    expect(result.tasks.find((task) => task.id === "parent")?.status).toBe(
      "complete",
    );
    expect(result.missionIds).toEqual(["mission-1"]);
  });
  it("accepts empty boards and rejects unrelated successful JSON responses", () => {
    expect(parseKanban({ tasks: [], task_links: [] }).tasks).toEqual([]);
    expect(() => parseKanban({ message: "Welcome" })).toThrow(
      /did not contain/,
    );
    expect(() => parseWorkers({ status: "ok" })).toThrow();
    expect(
      parseWorkers({ workers: [{ profile: "forge", task_id: "task-1" }] }),
    ).toEqual([{ profile: "forge", taskId: "task-1" }]);
  });
  it("parses A2A JSONL entries using the server timestamps and stable identities", () => {
    const item = {
      ts: 1792839490.939,
      direction: "outbound",
      sender: "leveret",
      peer: "forge",
      task_id: "task-1",
      summary: "Review API",
      status: "completed",
    };
    const first = parseFeed([item])[0],
      second = parseFeed({ feed: [item] })[0];
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      timestamp: 1792839490939,
      from: "leveret",
      to: "forge",
      text: "Review API",
      requestId: "task-1",
    });
    expect(parseFeed([{ ...item, ts: "invalid" }])).toEqual([]);
  });
  it("parses actual nvidia-smi units and multiple GPUs, rejecting errors and N/A", () => {
    expect(parseGpuCsv("14, 8, 8192, 655, 48\r\n")).toEqual([
      {
        gpuUsage: 14,
        vramUsage: 8,
        vramTotal: 8192,
        vramUsed: 655,
        temperature: 48,
        index: 0,
      },
    ]);
    expect(parseGpuCsv("14,8,8192,655,48\n0,0,24576,0,36")).toHaveLength(2);
    for (const text of [
      "",
      "N/A, 0, 8192, 0, 30",
      "101, 0, 8192, 0, 30",
      "0,0,8192,9000,30",
      "NVIDIA driver error",
    ])
      expect(() => parseGpuCsv(text)).toThrow();
  });
  it("supports explicit private/Tailscale HTTP while rejecting public plaintext and credential URLs", () => {
    expect(serviceUrl("http://100.65.133.127:9119/api/plugins/kanban/")).toBe(
      "http://100.65.133.127:9119/api/plugins/kanban",
    );
    expect(
      kanbanEventsUrl("http://100.65.133.127:9119/api/plugins/kanban"),
    ).toBe("ws://100.65.133.127:9119/api/plugins/kanban/events");
    for (const url of [
      "http://example.com",
      "https://user:secret@example.com",
      "https://example.com?token=secret",
      "file:///root/.hermes/kanban/kanban.db",
    ])
      expect(() => serviceUrl(url)).toThrow();
  });
  it("retains manually added devices without assigning them to a different target", () => {
    const profile = {
      id: "manual-node",
      name: "Another PC",
      host: "100.90.2.3",
      port: 22,
      username: "user",
      auth: "password",
      password: "",
      privateKey: "",
      passphrase: "",
    } satisfies VpsProfile;
    const nodes = availableNodes([profile]);
    expect(nodes).toHaveLength(3);
    expect(nodes[2]).toMatchObject({
      id: "device:manual-node",
      name: "Another PC",
    });
    expect(nodeProfile([profile], "device:manual-node")).toBe(profile);
    expect(nodeProfile([profile], "pc")).toBeUndefined();
  });
});
it("accepts lifecycle-keyed boards used without a columns wrapper", () => {
  const result = parseKanban({
    todo: [{ id: "t", title: "Task" }],
    running: [],
    done: [],
  });
  expect(result.tasks[0]).toMatchObject({
    id: "t",
    status: "queued",
    lifecycle: "todo",
  });
});
