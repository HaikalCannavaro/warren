# Warren v0.3.0

Warren Mobile — Hermes Multi-Agent Mission Control & Dual-Node Cockpit.

- Industrial dark interface with Swarm, Agents, Nodes, Telemetry, and Settings; mobile safe areas, bottom navigation, and a persistent chat composer.
- Categorized agent roster, manual agent/device connections, and explicit per-node chat routing for Hcnnvr-studio and haikalcannavaro. Credentials are entered in the app and stored in the existing encrypted vault.
- Inline tool execution cards with expandable JSON arguments, copyable output, measured status/duration, and grouped chains of three or more tools.
- Live read-only Kanban board, mission DAG, worker locks, task inspection, and A2A activity through configurable REST/WebSocket endpoints. Creating or moving tasks awaits a supported write API.
- SSH terminal with mobile ESC/TAB/CTRL/ALT/navigation keys. Windows GPU monitoring uses a separate, host-key-verified SSH query instead of writing commands into the active terminal.
- Telemetry with execution history, file patches, and session-scoped browser image artifacts with 16:9 previews and zoom.
- App updates are accessible directly from Mission Control Settings, with download state retained across navigation. Existing application ID, vault, updater public key, and update URLs are preserved. Android versionCode increases from 2003 to 3000.
- Release automation builds both platforms, signs with the existing production secrets, and verifies uploaded packages before activating the stable update feeds.

No device or agent connection is assumed. Configure reachable Tailscale addresses, credentials, and Hermes services in the app; unavailable data displays an explicit empty or disconnected state. Android requires the system installation confirmation. Physical-device connections and upgrade installation must still be verified on the target devices.
