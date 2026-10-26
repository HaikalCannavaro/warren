import { invoke, isTauri } from '@tauri-apps/api/core';
import { translate } from './i18n';
import { parseSchedulerSnapshot, validateCronDraft, validSchedulerId, type SchedulerRequest, type SchedulerSnapshot } from './scheduler';

export class SchedulerMutationError extends Error {
  readonly requiresRefresh = true;
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : translate('The SSH operation failed.', 'Operasi SSH gagal.');
    super(`${translate('The schedule change was not confirmed. Refresh this host before trying again.', 'Perubahan jadwal belum dikonfirmasi. Muat ulang host ini sebelum mencoba lagi.')} ${detail}`, {cause});
    this.name = 'SchedulerMutationError';
  }
}

export async function schedulerCommand(sessionId: string, request: SchedulerRequest): Promise<SchedulerSnapshot> {
  if (!isTauri()) throw new Error(translate('Open the Warren app and connect to a Linux host to manage cron schedules.', 'Buka aplikasi Warren dan hubungkan host Linux untuk mengelola jadwal cron.'));
  if (!validSchedulerId(sessionId)) throw new Error(translate('Select a connected SSH session.', 'Pilih sesi SSH yang tersambung.'));
  if (!request || !['list', 'save', 'toggle', 'delete'].includes(request.action)) throw new Error('Invalid Scheduler action.');
  if (request.action !== 'list') {
    if (!validSchedulerId(request.revision)) throw new Error(translate('Refresh this host before changing its schedules.', 'Muat ulang host ini sebelum mengubah jadwal.'));
    if (request.action === 'save') {
      validateCronDraft(request.job);
      if (request.job.id !== undefined && !validSchedulerId(request.job.id)) throw new Error('Invalid cron job identity.');
    } else {
      if (!validSchedulerId(request.id)) throw new Error('Invalid cron job identity.');
      if (request.action === 'toggle' && typeof request.enabled !== 'boolean') throw new Error('Invalid schedule state.');
    }
  }
  try {
    return parseSchedulerSnapshot(await invoke<unknown>('ssh_scheduler', {sessionId, request}));
  } catch (cause) {
    if (request.action !== 'list') throw new SchedulerMutationError(cause);
    throw cause;
  }
}
