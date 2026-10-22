# Warren Slash Commands Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement these tasks.

**Goal:** Execute supported Hermes commands from Warren's Agent composer without sending them as ordinary AI prompts.

**Architecture:** Preserve the existing OpenAI-compatible connection. Add a separate native WebSocket connection to the Hermes session gateway, with capability checks and durable session IDs. Keep command results separate from model conversation history.

**Tech Stack:** React 19, TypeScript, Tauri 2, Rust tokio-tungstenite.

**Spec:** User's request for slash commands; Hermes v0.22.4 source at `4d04303818b61bf3aa09278af48356315515965b`.

## Global Constraints

- Windows and Android remain supported targets; browser is a preview.
- Preserve all existing panel, execution-log, vault, and updater behavior.
- No automatic retry of prompts or commands after an uncertain result.
- No tokens in URLs shown to the user, logs, or generated documentation.
- Initially support help, new, status, usage, model, compact, and stop; reject unsupported commands explicitly.
- Require the advertised canonical session protocol; do not infer compatibility from version alone.
- User refinement: remove the conversation list/sidebar; use one chat space, restore the last selected conversation, and create subsequent sessions through `/new`.

## Review Focus

- Connection loss after dispatch: show unknown outcome and prevent silent replay.
- Server events arriving before prompt admission: buffer and match the correct admission.
- Lock, update, or close during preparation: block new work and preserve pending outcomes.
- Slash text and command output: never mix command control with model history.
- Credentials or transport changed: preserve existing session identity and isolate new connections.

### Task 1: Composer and profile UI

Files: `src/components/HermesWorkspace.tsx`, `SlashCommandMenu.tsx`, `ProfileForms.tsx`, their tests, `src/slash-commands.css`.

- [x] Add failing tests for keyboard selection, dedicated command routing, busy-session rules, result cards, and connection modes.
- [x] Implement typed menu props, optional command callbacks, and Gateway connection form.
- [x] Run component tests and preserve existing layout and focus behavior.

### Task 2: Native transport and protocol client

Files: `src-tauri/src/gateway.rs`, `src-tauri/src/lib.rs`, Cargo dependencies, `src/lib/native.ts`, `src/lib/gatewayClient.ts` and tests.

Interface: `GatewayClient(profile)` with `connect()`, `ensureSession(storedId?)`, `catalog(sessionId)`, `command(sessionId,text)`, `send(sessionId,text,submissionId,onEvent)`, `close()`.

- [x] Add bounded native transport and loopback/policy tests.
- [x] Add protocol tests for handshake, admission races, current mutation revisions, errors, and final response replacement.
- [x] Implement capability-gated canonical routing from the verified Hermes release.
- [x] Run available checks and report native build prerequisites if unavailable.

### Task 3: Workspace orchestration and deliverable

Files: `src/hooks/useWorkspace.ts`, tests, `src/lib/slashCommands.ts`, `src/lib/domain.ts`, `src/types.ts`, `src/App.tsx`, user guide.

- [x] Add failing hook tests for local commands, literal slash, session persistence before dispatch, and lifecycle cleanup.
- [x] Wire commands and normal chat to the selected transport; persist command outcomes independently.
- [x] Check frontend tests and production build; inspect the UI in browser using a labelled simulation.
- [x] Package verified source ZIP, documenting exact setup and limits; omit a patch to avoid carrying deleted credential context. Do not publish or change the running VPS.

### Task 4: Single chat space refinement

Files: `src/components/HermesWorkspace.tsx`, layout CSS and tests, `src/hooks/useWorkspace.ts`, `src/types.ts`, `src/App.tsx`.

- [x] Remove conversation list, its toggle/drawer, and new-conversation buttons from the active chat. Retain Tool Activity and its accessible drawer.
- [x] Persist selection; restore the last selected or latest existing chat on vault unlock without network work.
- [x] Make connection entry open the existing chat; `/new` creates and selects a fresh conversation while preserving saved history.
- [x] Verify desktop layout and single-space navigation, rebuild and package the final source.


### Task 5: Interface language and visual refinement

- [x] English default with a persistent English / Bahasa Indonesia control in Settings.
- [x] Translate interface copy without changing Agent messages, terminal output, or request payloads.
- [x] Remove redundant preview/workspace branding; keep browser limitations in Settings.
- [x] Verify locale switching, reload persistence, desktop and mobile layout, and preserve session state.
- [x] Run all 205 frontend tests, 25 release tests, TypeScript, and production build; document native linker limitation.

