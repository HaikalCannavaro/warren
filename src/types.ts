export type Section = 'terminal' | 'hermes' | 'connections' | 'settings';
export interface VpsProfile {
  id: string; name: string; host: string; port: number; username: string;
  auth: 'password' | 'key'; password: string; privateKey: string; passphrase: string;
  fingerprint?: string; color?: string;
}
export interface HermesProfile {
  id: string; name: string; url: string; token: string; model: string;
  transport?: 'openai' | 'gateway';
  agentProfile?: string;
}
export interface SlashCommand {
  name: string; description: string; args?: string; available: boolean;
  reason?: string; allowWhileRunning?: boolean;
}
export interface CommandResult {
  id: string; command: string; content: string; createdAt: number;
  status: 'pending' | 'complete' | 'error' | 'unknown';
}
export interface Message {
  id: string; role: 'user' | 'assistant'; content: string; createdAt: number;
  status: 'sent' | 'streaming' | 'complete' | 'error' | 'unknown';
  requestId?: string; error?: string;
  agentProfile?: string;
}
export interface ExecutionLogEntry {
  id: string; requestId: string; timestamp: number;
  kind: 'request' | 'tool' | 'response' | 'complete' | 'error' | 'unknown';
  text: string;
}
export interface Conversation {
  id: string; profileId: string; title: string; messages: Message[]; draft: string; createdAt: number;
  executionLog?: ExecutionLogEntry[];
  commandResults?: CommandResult[];
  gatewaySessionId?: string;
  gatewayStateUncertain?: boolean;
  agentProfile?: string;
}
export interface Settings { fontSize: number; scrollback: number; }
export interface SavedState {
  version: 1; deviceId: string; vps: VpsProfile[]; hermes: HermesProfile[];
  conversations: Conversation[]; settings: Settings;
  activeConversationId?: string;
}
export interface SshRequest {
  sessionId: string; host: string; port: number; username: string;
  auth: 'password' | 'key'; password: string; privateKey: string; passphrase: string;
  fingerprint: string; cols: number; rows: number;
}
export type SshEvent =
  | { type: 'data'; data: number[] }
  | { type: 'status'; status: 'connected' | 'disconnected' | 'error'; message?: string };
export type HermesEvent = (
  | { type: 'delta'; text: string }
  | { type: 'replace'; text: string }
  | { type: 'tool'; text: string }
  | { type: 'done'; finishReason: string }
  | { type: 'error'; message: string; uncertain: boolean }
) & { agentProfile?: string };
export interface HermesRequest {
  requestId: string; conversationId: string; url: string; token: string; model: string;
  messages: {role: 'user' | 'assistant'; content: string}[];
}
export interface HermesCapabilities { reachable: boolean; streaming: boolean; detail: string; }
export interface TerminalSession {
  id: string; profileId: string; label: string; host: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error'; error?: string;
}
