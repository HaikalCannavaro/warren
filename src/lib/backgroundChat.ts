import { invoke } from '@tauri-apps/api/core';
import { nativeAvailable } from './native';
import type { SavedState } from '../types';
import { normalizeAgentProfileName } from './domain';

export interface BackgroundStatus {
  supported: boolean; enabled: boolean; profileId?: string; relayUrl?: string;
  pushReady?: boolean; notificationsAllowed?: boolean; pendingCount?: number; lastError?: string;
}
export interface BackgroundRequest {
  deviceId: string; conversationId: string; submissionId: string; text: string; sessionId?: string; model?: string;
}
export interface BackgroundJob {
  submissionId: string; conversationId: string; profileId: string;
  state: 'queued' | 'running' | 'complete' | 'error' | 'unknown'; text: string;
  sessionId?: string | null; error?: string | null; agentProfile?: string | null;
}
export const isAndroidNative = () => nativeAvailable() && /Android/i.test(navigator.userAgent);
export async function backgroundCommand<T>(action: string, payload: object = {}): Promise<T> {
  return invoke<T>('background_chat', { action, payload });
}
export async function backgroundStatus(): Promise<BackgroundStatus> {
  return isAndroidNative() ? backgroundCommand('status') : { supported: false, enabled: false };
}
export function mergeBackgroundJobs(state: SavedState, input: unknown): { state: SavedState; acknowledge: string[] } {
  if (!Array.isArray(input)) throw new Error('Invalid native background result list.');
  const jobs = input as BackgroundJob[];
  if (jobs.some(job => !job || typeof job.submissionId !== 'string' || typeof job.conversationId !== 'string' || typeof job.profileId !== 'string' || !['queued','running','complete','error','unknown'].includes(job.state) || typeof job.text !== 'string')) throw new Error('Invalid native background result.');
  const acknowledge: string[] = [];
  const conversations = state.conversations.map(conversation => {
    let sessionId = conversation.gatewaySessionId;
    const messages = conversation.messages.map(message => {
      if (!message.background || message.role !== 'assistant') return message;
      const job = jobs.find(job => job.submissionId === message.requestId && job.conversationId === conversation.id && job.profileId === conversation.profileId);
      if (!job) return message;
      if (job.sessionId && typeof job.sessionId === 'string') sessionId = job.sessionId;
      if (['complete','error','unknown'].includes(job.state)) acknowledge.push(job.submissionId);
      if (message.status === 'complete' && (job.state === 'queued' || job.state === 'running')) return message;
      return { ...message, content: job.text, status: job.state === 'queued' || job.state === 'running' ? 'streaming' as const : job.state,
        delivery: job.state, agentProfile: normalizeAgentProfileName(job.agentProfile) ?? message.agentProfile,
        error: typeof job.error === 'string' ? job.error : undefined,
        backgroundRequest: ['complete','error','unknown'].includes(job.state) ? undefined : message.backgroundRequest };
    });
    return { ...conversation, gatewaySessionId: sessionId, messages };
  });
  return { state: { ...state, conversations }, acknowledge };
}
