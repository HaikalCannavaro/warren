import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  AgentStream,
  layoutMission,
  MissionGraph,
  type MissionTask,
} from "./MissionGraph";
const tasks: MissionTask[] = [
  {
    id: "plan",
    agent: "LEVERET",
    title: "Plan work",
    node: "Hcnnvr-studio",
    status: "complete",
    dependencies: [],
  },
  {
    id: "build",
    agent: "FRAME",
    title: "Build interface",
    node: "haikalcannavaro",
    status: "running",
    dependencies: ["plan"],
    requestId: "request-1",
  },
];
afterEach(cleanup);
it("lays out dependency layers and rejects cycles or missing dependencies", () => {
  expect(
    layoutMission(tasks)?.map((layer) => layer.map((task) => task.id)),
  ).toEqual([["plan"], ["build"]]);
  expect(
    layoutMission([{ ...tasks[0], dependencies: ["build"] }, tasks[1]]),
  ).toBeNull();
  expect(
    layoutMission([{ ...tasks[0], dependencies: ["missing"] }]),
  ).toBeNull();
});
it("inspects task data supplied by an orchestrator without constructing a trace", () => {
  render(<MissionGraph tasks={tasks} onConfigure={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Build interface/ }));
  expect(screen.getByRole("dialog").textContent).toContain("request-1");
  expect(
    screen.getByText("No additional trace details were supplied."),
  ).toBeTruthy();
});
it("renders provided A2A handoffs and keeps IDs in the inspector", () => {
  render(
    <AgentStream
      events={[
        {
          id: "event-1",
          timestamp: 1,
          from: "FORGE",
          to: "FRAME",
          text: "API schema ready",
          requestId: "request-2",
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /API schema ready/ }));
  expect(screen.getByRole("dialog").textContent).toContain("request-2");
});
