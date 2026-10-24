# Warren Mobile — Hermes Mission Control & Dual-Node Cockpit

Warren opens into a mobile-first cockpit built with React 19, TypeScript, Tailwind CSS 4 and Lucide. Inter is bundled locally. Code and telemetry use Cascadia Code with monospace fallbacks. The five tabs use safe-area insets and independent conversation scrolling at 390–430px. Screenshots of the interface are saved under `docs/mockups/`.

## Release behavior

The application starts with real disconnected and empty states. No missions, messages, tool calls, GPU metrics, patches, snapshots, or successful connections are fabricated. Configured profiles are distinct from verified connections; a Gateway handshake does not imply that a device or every agent is connected.

- **Swarm:** reads the Kanban board, orchestration DAG, active worker locks, task details, and A2A feed from manually configured services. Task-transition events refresh the board; REST polling continues when a stream disconnects. Task mutation stays disabled because only read endpoints have been specified.
- **Agents:** Core Fleet includes LEVERET, FORGE, FRAME, AURORA, and ATLAS as configurable roles. Security includes the supplied SENTINEL role. Additional supplied profiles PRISM, LENS, RADAR and QUANT are available in Core Fleet; Companions shows saved profiles or an empty state. Add a profile in any category. No additional agent identity is invented.
- **Nodes:** Hcnnvr-studio (Linux VPS) and haikalcannavaro (Windows Workstation) are named device slots. Assign a saved SSH profile to either slot. Reachable Tailscale hosts can be entered as the host address. Port 3450 is a Gateway configuration default, not an observed listener. The supplied Ubuntu 22.04 Azure / Windows 11 platforms and Tailscale addresses prefill connection forms. GPU usage, memory and temperature can be queried through a separately authenticated read-only SSH exec channel. CPU/RAM metrics stay unavailable without a data source. Additional manual devices remain separate targets.
- **Telemetry:** audit and request inspectors display recorded workspace events. Unified patches are shown when an agent actually returns diff output. Gateway image artifacts appear inline in chat and in the Browser view with a 16:9 frame and Zoom. Invalid/external-image payloads are not loaded.
- **Settings:** native Gateway configuration, Stronghold vault management, and available biometric enrollment/unlock reuse the existing implementations.

Browser access can render and configure the interface in memory. Native SSH, authenticated Gateway transport, and encrypted storage require the installed Windows or Android app. Browser limitations are described where the affected action is performed. No credentials are written to browser storage.

## Explicit node selection

Assign each Hermes profile an **Execution node** and **Agent category** in its connection form. Give it the endpoint actually hosted on that device. For example, LEVERET can have one profile for Hcnnvr-studio and another for haikalcannavaro.

The named pill above the composer chooses the matching node-specific profile and conversation. There is no fallback to another node when a binding is missing. Sending stays disabled until an endpoint is assigned, and the installed app uses the existing persisted request identity / durable admission workflow. Changing an endpoint or node binding creates a separate connection so existing conversations retain their original destination.

This routes requests through explicitly configured endpoints. It does not relocate a running agent, enforce remote sandbox policy, or invent a node-routing RPC. SSH access is independently verified through a trusted host fingerprint before authentication.

## Inline tool execution

Gateway tool events retain provided names, identifiers, arguments, output, status and duration inside their assistant message. Events sharing a stable call ID update the same card. Missing arguments/output/durations are shown as unavailable. An incomplete tool outcome is marked unknown when a turn ends or the app restores interrupted work.

One or two tools render directly; three or more consecutive tools share a collapsible chain. Assistant text arriving between tool runs separates the groups. Running cards use a yellow-orange shimmer, done cards use teal checks, errors use the danger color, and unknown outcomes remain explicit. Expanded cards show formatted JSON and copyable output. Code blocks highlight TypeScript/JavaScript, JSON, shell, Python and CSS and copy the original text. Markdown images are not loaded automatically, and code markup is escaped by the highlighter.

## Native terminal

The Nodes tab opens the existing xterm.js terminal for real SSH sessions. The keybar includes ESC, TAB, CTRL, ALT, `|`, `/`, arrows, Ctrl+C, Enter and reviewed paste. CTRL and ALT apply once to the next key and then reset. Disconnected sessions cannot send keystrokes. Terminal instances remain mounted when switching cockpit tabs; switching a tab does not disconnect a session.

## Gateway and service status

The Settings connection uses the existing canonical Hermes Gateway transport, requiring `session_authority` and `durable-admission-v1`. Header latency measures a `gateway.ping` round trip every ten seconds. Transport closure clears status immediately. Incomplete Settings connections are cancelled on tab exit; locking the shared workspace closes this monitoring connection. There is no automatic prompt replay.

Kanban uses the supplied `/api/plugins/kanban` read routes and `/events` stream. A2A consumes `/api/v1/swarm/feed` or an optional configured JSONL WebSocket tailer. Rust provides bounded read-only HTTP and event-stream commands, preserving TLS verification and refusing redirects. HTTP/WS requires an explicit private/Tailscale host; public endpoints use HTTPS/WSS. Connection failures and stale readings remain visible; no service data is synthesized.

GPU telemetry runs only the fixed `nvidia-smi` query on a dedicated SSH exec channel with the existing fingerprint/authentication checks. Task creation, worker dispatch and status mutation need their actual write API before being enabled. The supplied read contract does not authorize inventing those routes.

See [Live connection setup](LIVE-CONNECTIONS.md) for the initial IPs, in-app SSH credentials, endpoint/token fields, GPU sampling, artifact limits, and validation scope.

## Development

```sh
npm ci
npm run dev
npm test -- --maxWorkers=2
npm run test:release
npm run build
```

`src/main.tsx` mounts `src/mission-control/MissionControl.tsx`. A single `useWorkspace` instance owns vault state, profiles, conversations and SSH sessions across the cockpit and secure workspace. The React entry imports local Inter fonts and the Tailwind theme. Tauri keeps its existing vault identity and native commands.

Tests cover disconnected states, actual profile forms, per-node endpoint dispatch, missing node bindings, persisted messages/tools, audit filtering, Gateway handshake/ping/cancellation, tool grouping, copy, syntax escaping, native key modifiers, and structured tool event recovery. No remote device, production credential, Windows installer, or physical Android hardware is implied by browser validation.
