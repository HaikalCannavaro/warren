import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MissionControl from "./MissionControl";
import { ToolCard, ToolChain } from "./ToolCard";
import { CodeBlock } from "./MarkdownMessage";
import type { Workspace } from "./workspace";
import type { HermesProfile, ToolExecution } from "../types";
import { emptyState } from "../lib/domain";
import { setLanguage } from "../lib/i18n";
const native = vi.hoisted(() => ({ available: false }));
const current = vi.hoisted(() => ({ workspace: null as unknown as Workspace }));
const gatewayMock = vi.hoisted(() => ({
  connect: vi.fn(),
  ping: vi.fn(),
  close: vi.fn(),
}));
const updates = vi.hoisted(() => ({
  getUpdateInfo: vi.fn(),
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
}));
vi.mock("../lib/updates", () => updates);
vi.mock("../hooks/useWorkspace", () => ({
  useWorkspace: () => current.workspace,
}));
vi.mock("../lib/gatewayClient", () => ({
  GatewayClient: class {
    connect = gatewayMock.connect;
    ping = gatewayMock.ping;
    close = gatewayMock.close;
  },
}));
vi.mock("../lib/native", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/native")>()),
  nativeAvailable: () => native.available,
  getBiometricStatus: async () => ({
    available: false,
    enrolled: false,
    enabled: false,
  }),
}));
const tools: ToolExecution[] = [
  "search_files",
  "read_file",
  "patch",
  "terminal",
].map((name, i) => ({
  id: `tool-${i}`,
  name,
  param: '"src/**/*.ts"',
  state: "done",
  duration: "0.4s",
  args: { pattern: "src/**/*.ts", start_line: 1 },
  output: `Output for ${name}`,
}));
const profile = (id: string, node: "vps" | "pc"): HermesProfile => ({
  id,
  name: "LEVERET",
  agentProfile: "LEVERET",
  url: `wss://${node}.example/api/ws`,
  token: "private-test-token",
  model: "",
  transport: "gateway",
  executionNode: node,
});
const navigate = (name: string) =>
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).getByRole("button", { name }),
  );
beforeEach(() => {
  setLanguage("en");
  native.available = false;
  gatewayMock.connect.mockReset().mockResolvedValue(undefined);
  gatewayMock.ping.mockReset().mockResolvedValue(14);
  gatewayMock.close.mockReset().mockResolvedValue(undefined);
  updates.getUpdateInfo.mockReset().mockResolvedValue({ platform: "android", configured: true, currentVersion: "0.3.0", message: "" });
  updates.checkForUpdate.mockReset().mockResolvedValue({ version: "0.3.1", notes: "A signed update" });
  updates.downloadUpdate.mockReset().mockResolvedValue(undefined);
  updates.installUpdate.mockReset().mockResolvedValue({ status: "installerOpened" });
  current.workspace = {
    ready: true,
    preview: true,
    busy: false,
    error: null,
    saveError: null,
    state: emptyState(),
    sessions: [],
    streamingIds: new Set(),
    commandBusyIds: new Set(),
    commandsLoadingIds: new Set(),
    activeConversationId: null,
    activeSessionId: null,
    hostPrompt: null,
    biometric: { available: false, enrolled: false, enabled: false },
    clearError: vi.fn(),
    updateCockpit: vi.fn(),
    saveHermes: vi.fn(),
    saveVps: vi.fn(),
    createConversation: vi.fn().mockReturnValue("new-conversation"),
    setDraft: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    setActiveSessionId: vi.fn(),
    connectVps: vi.fn(),
    rejectHost: vi.fn(),
    acceptHost: vi.fn(),
    closeSession: vi.fn(),
    subscribeTerminal: vi.fn().mockReturnValue(() => {}),
    writeTerminal: vi.fn(),
    resizeTerminal: vi.fn(),
    runUpdateInstallation: vi.fn().mockImplementation((action: () => Promise<unknown>) => action()),
  } as unknown as Workspace;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("release connection and empty states", () => {
  it("keeps an in-app update ready when navigating between Mission Control tabs", async () => {
    current.workspace.preview = false;
    await act(async () => { render(<MissionControl />); });
    navigate("Settings");
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(await screen.findByText("Version 0.3.1 available")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Download update" })); });
    expect(screen.getByText("Ready to install")).toBeTruthy();
    navigate("Swarm");
    navigate("Settings");
    expect(screen.getByText("Ready to install")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Install update" })); });
    expect(current.workspace.runUpdateInstallation).toHaveBeenCalledOnce();
    expect(updates.installUpdate).toHaveBeenCalledOnce();
    expect(updates.getUpdateInfo).toHaveBeenCalledOnce();
    expect(screen.getByText("System installer opened")).toBeTruthy();
  });
  it("starts disconnected with no seeded activity, metrics, or tool executions", () => {
    render(<MissionControl />);
    expect(screen.getByText("WS: Not connected")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "No mission yet" }),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "New mission" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(document.body.textContent).not.toMatch(
      /demo|simulat|MSN|14ms|RTX 4090|100%/i,
    );
    expect(screen.getByText("No execution history")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View notifications" }));
    expect(
      screen.getByRole("heading", { name: "No notifications yet" }),
    ).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("shows categorized roles, named node targets, and disables chat without an endpoint", () => {
    render(<MissionControl />);
    navigate("Agents");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Message LEVERET",
        }) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Send message",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Hcnnvr-studio" }));
    fireEvent.click(screen.getByRole("button", { name: /haikalcannavaro/ }));
    expect(
      screen.getByRole("button", { name: "haikalcannavaro" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Security" }));
    expect(
      screen.getByRole("heading", { name: "SENTINEL is not connected" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Companions" }));
    expect(
      screen.getByRole("heading", { name: "No companions agents configured" }),
    ).toBeTruthy();
  });
  it("keeps a saved role in its assigned category", () => {
    current.workspace.state.hermes = [
      { ...profile("security-profile", "vps"), category: "Security" },
    ];
    render(<MissionControl />);
    navigate("Agents");
    fireEvent.click(screen.getByRole("tab", { name: "Security" }));
    expect(
      screen.queryByRole("heading", { name: "No security agents configured" }),
    ).toBeNull();
    fireEvent.click(
      within(screen.getByLabelText("Agent roster")).getByRole("button", {
        name: /LEVERET/,
      }),
    );
    expect(
      screen.getByRole("textbox", { name: "Message security-profile" }),
    ).toBeTruthy();
  });
  it("opens the actual profile form with the selected node assignment", () => {
    render(<MissionControl />);
    navigate("Agents");
    fireEvent.click(screen.getByRole("button", { name: "Connect LEVERET" }));
    expect(screen.getByRole("dialog", { name: "Connect Agent" })).toBeTruthy();
    expect(
      (
        screen.getByRole("combobox", {
          name: /^Execution node/,
        }) as HTMLSelectElement
      ).value,
    ).toBe("vps");
    expect(
      (screen.getByLabelText("Agent category") as HTMLSelectElement).value,
    ).toBe("Core Fleet");
    expect(
      (screen.getByRole("textbox", { name: /^Server URL/ }) as HTMLInputElement)
        .value,
    ).toBe("");
  });
  it("selects separate node-specific endpoints and never dispatches through the other node", async () => {
    current.workspace.preview = false;
    current.workspace.state.hermes = [
      profile("vps-agent", "vps"),
      profile("pc-agent", "pc"),
    ];
    render(<MissionControl />);
    navigate("Agents");
    fireEvent.click(screen.getByRole("button", { name: "Hcnnvr-studio" }));
    fireEvent.click(screen.getByRole("button", { name: /haikalcannavaro/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Message LEVERET" }), {
      target: { value: "Check the build" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    });
    expect(
      current.workspace.createConversation,
    ).toHaveBeenCalledExactlyOnceWith("pc-agent");
    expect(current.workspace.setDraft).toHaveBeenCalledWith(
      "new-conversation",
      "Check the build",
    );
    expect(current.workspace.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "new-conversation",
    );
  });
  it("does not send to an unassigned endpoint", () => {
    current.workspace.preview = false;
    current.workspace.state.hermes = [
      { ...profile("old-profile", "vps"), executionNode: undefined },
    ];
    render(<MissionControl />);
    navigate("Agents");
    expect(
      (
        screen.getByRole("textbox", {
          name: "Message LEVERET",
        }) as HTMLTextAreaElement
      ).disabled,
    ).toBe(true);
    expect(current.workspace.sendMessage).not.toHaveBeenCalled();
  });
  it("uses saved messages and tool data without injecting canned chat", () => {
    current.workspace.state.hermes = [profile("vps-agent", "vps")];
    current.workspace.state.conversations = [
      {
        id: "c",
        profileId: "vps-agent",
        title: "Actual task",
        draft: "",
        createdAt: 1,
        messages: [
          {
            id: "m",
            role: "assistant",
            content: "Verified build result.",
            status: "complete",
            createdAt: 1,
            tools,
          },
        ],
      },
    ];
    render(<MissionControl />);
    navigate("Agents");
    expect(screen.getByText("Verified build result.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /4 Tools Executed/ }),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/demo|simulat/i);
  });
  it("shows actual SSH counts and no fabricated CPU or GPU data", () => {
    render(<MissionControl />);
    navigate("Nodes");
    expect(screen.getByRole("heading", { name: "Hcnnvr-studio" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "haikalcannavaro" }),
    ).toBeTruthy();
    expect(screen.getByText("No GPU data")).toBeTruthy();
    expect(screen.queryByText(/RTX|48°C|67%|Ubuntu 24/)).toBeNull();
    expect(
      screen
        .getAllByRole("button", { name: "Connect SSH" })
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Configure" })[1]);
    expect(
      (screen.getByLabelText("Connection name") as HTMLInputElement).value,
    ).toBe("haikalcannavaro");
  });
  it("renders empty audit, patch and snapshot views until data is received", () => {
    render(<MissionControl />);
    navigate("Telemetry");
    expect(screen.getByText("0 events")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "No tool executions yet" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "File changes" }));
    expect(
      screen.getByRole("heading", { name: "No file changes" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Copy patch" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Browser" }));
    expect(
      screen.getByRole("heading", { name: "No browser snapshot" }),
    ).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("filters recorded audit events and inspects their real request IDs", () => {
    current.workspace.state.conversations = [
      {
        id: "c",
        profileId: "p",
        title: "Recorded run",
        draft: "",
        createdAt: 1,
        messages: [],
        executionLog: [
          {
            id: "entry",
            requestId: "request-123",
            timestamp: 1,
            kind: "error",
            text: "Permission denied",
          },
        ],
      },
    ];
    render(<MissionControl />);
    navigate("Telemetry");
    fireEvent.click(screen.getByRole("button", { name: "Inspect request" }));
    expect(screen.getByRole("dialog").textContent).toContain("request-123");
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Filter tool audit" }),
      { target: { value: "missing" } },
    );
    expect(
      screen.getByRole("heading", { name: "No matching events" }),
    ).toBeTruthy();
  });
  it("does not persist credentials or claim browser connectivity", () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    render(<MissionControl />);
    navigate("Settings");
    fireEvent.change(screen.getByLabelText("Gateway endpoint"), {
      target: { value: "wss://hermes.example/api/ws" },
    });
    fireEvent.change(screen.getByLabelText(/Session token/), {
      target: { value: "test-credential-not-to-persist" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect gateway" }));
    expect(screen.getByRole("alert").textContent).toContain("Tauri transport");
    expect(screen.getByText("WS: Not connected")).toBeTruthy();
    expect(
      storage.mock.calls.some((call) =>
        call.some((value) =>
          String(value).includes("test-credential-not-to-persist"),
        ),
      ),
    ).toBe(false);
  });
});
describe("native Gateway state", () => {
  function prepare() {
    native.available = true;
    render(<MissionControl />);
    navigate("Settings");
    fireEvent.change(screen.getByLabelText("Gateway endpoint"), {
      target: { value: "wss://hermes.example:3450/api/ws" },
    });
    fireEvent.change(screen.getByLabelText(/Session token/), {
      target: { value: "test-session-token" },
    });
  }
  it("measures ping after handshake without inventing agents or devices", async () => {
    prepare();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect gateway" }));
    });
    expect(screen.getByText("WS: Connected • 14ms")).toBeTruthy();
    expect(
      (screen.getByLabelText(/Session token/) as HTMLInputElement).value,
    ).toBe("");
    navigate("Agents");
    expect(
      screen.getByRole("heading", { name: "LEVERET is not connected" }),
    ).toBeTruthy();
    navigate("Settings");
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Disconnect gateway" }),
      );
    });
    expect(screen.getByText("WS: Not connected")).toBeTruthy();
  });
  it("reports rejection without a fake successful state", async () => {
    gatewayMock.connect.mockRejectedValueOnce(
      new Error("Missing durable-admission-v1"),
    );
    prepare();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect gateway" }));
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Missing durable-admission-v1",
    );
    expect(screen.getByText("WS: Not connected")).toBeTruthy();
    expect(gatewayMock.ping).not.toHaveBeenCalled();
  });
  it("cancels pending connections on tab exit", async () => {
    let finish!: () => void;
    gatewayMock.connect.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    prepare();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect gateway" }));
    });
    navigate("Nodes");
    await act(async () => finish());
    expect(screen.getByText("WS: Not connected")).toBeTruthy();
    expect(gatewayMock.close).toHaveBeenCalled();
  });
});
describe("tool cards and code blocks", () => {
  it("only groups chains of at least three tools", () => {
    const view = render(<ToolChain tools={tools.slice(0, 2)} />);
    expect(screen.queryByRole("button", { name: /Tools Executed/ })).toBeNull();
    view.rerender(<ToolChain tools={tools} />);
    expect(
      screen.getByRole("button", { name: /4 Tools Executed/ }),
    ).toBeTruthy();
  });
  it("expands actual JSON and copies output", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ToolChain tools={tools} />);
    fireEvent.click(screen.getByRole("button", { name: /4 Tools Executed/ }));
    fireEvent.click(screen.getByRole("button", { name: /^read_file/ }));
    expect(screen.getByText(/"start_line": 1/)).toBeTruthy();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Copy Output" })),
    );
    expect(writeText).toHaveBeenCalledWith(tools[1].output);
  });
  it("keeps missing metadata and unknown outcomes explicit", () => {
    render(
      <ToolCard
        tool={{
          id: "unknown",
          name: "terminal",
          param: "",
          duration: "",
          state: "unknown",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /UNKNOWN/ }));
    expect(
      screen.getByText("Arguments not provided by the agent."),
    ).toBeTruthy();
    expect(screen.getByText("Output not provided by the agent.")).toBeTruthy();
  });
  it("highlights code while escaping markup and preserves copy content", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <CodeBlock
        code={'const x = "<img src=x onerror=alert(1)>";'}
        language="typescript"
      />,
    );
    expect(document.querySelector(".hljs-keyword")).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Copy code" })),
    );
    expect(writeText).toHaveBeenCalledWith(
      'const x = "<img src=x onerror=alert(1)>";',
    );
  });
});
