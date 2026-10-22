export type Section = 'terminal' | 'hermes' | 'connections' | 'settings';
export interface VpsProfile {
  id: string; name: string; host: string; port: number; username: string;
  auth: 'password' | 'key'; password: string; privateKey: string; passphrase: string;
  fingerprint?: string; color?: string;
}
export interface HermesProfile {
  id: string; name: string; url: string; token: string; model: string;
}
export interface Message {
  id: string; role: 'user' | 'assistant'; content: string; createdAt: number;
  status: 'sent' | 'streaming' | 'complete' | 'error' | 'unknown';
  requestId?: string; error?: string;
}
export interface Conversation {
  id: string; profileId: string; title: string; messages: Message[]; draft: string; createdAt: number;
}
export interface Settings { fontSize: number; scrollback: number; }
export interface SavedState {
  version: 1; deviceId: string; vps: VpsProfile[]; hermes: HermesProfile[];
  conversations: Conversation[]; settings: Settings;
}
export interface SshRequest {
  sessionId: string; host: string; port: number; username: string;
  auth: 'password' | 'key'; password: string; privateKey: string; passphrase: string;
  fingerprint: string; cols: number; rows: number;
}
export type SshEvent =
  | { type: 'data'; data: number[] }
  | { type: 'status'; status: 'connected' | 'disconnected' | 'error'; message?: string };
export type HermesEvent =
  | { type: 'delta'; text: string }
  | { type: 'tool'; text: string }
  | { type: 'done'; finishReason: string }
  | { type: 'error'; message: string; uncertain: boolean };
export interface HermesRequest {
  requestId: string; conversationId: string; url: string; token: string; model: string;
  messages: {role: 'user' | 'assistant'; content: string}[];
}
export interface HermesCapabilities { reachable: boolean; streaming: boolean; detail: string; }
export interface TerminalSession {
  id: string; profileId: string; label: string; host: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error'; error?: string;
}
