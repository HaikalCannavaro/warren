import { translate } from './i18n';

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
}
export type CronJobDraft = Omit<CronJob, 'id'> & { id?: string };
export interface SchedulerSnapshot {
  revision: string;
  username: string;
  timezone: string;
  jobs: CronJob[];
  warning?: string | null;
}
export type SchedulerRequest =
  | { action: 'list' }
  | { action: 'save'; revision: string; job: CronJobDraft }
  | { action: 'toggle'; revision: string; id: string; enabled: boolean }
  | { action: 'delete'; revision: string; id: string };

const macros = new Set(['@reboot', '@hourly', '@daily', '@weekly', '@monthly', '@yearly', '@annually', '@midnight']);
const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const controls = /[\x00-\x1f\x7f-\x9f]/;
const commandControls = /[\x00-\x08\x0a-\x1f\x7f-\x9f]/;
const fields = [
  { min: 0, max: 59, names: [] },
  { min: 0, max: 23, names: [] },
  { min: 1, max: 31, names: [] },
  { min: 1, max: 12, names: months },
  { min: 0, max: 7, names: weekdays },
];

export function validateCronSchedule(schedule: string): void {
  const invalid = () => new Error(translate('Enter a valid five-field cron schedule or supported @ preset.', 'Isi jadwal cron lima kolom yang valid atau preset @ yang didukung.'));
  if (typeof schedule !== 'string' || !schedule.trim() || /[\r\n\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(schedule) || schedule.length > 256) throw invalid();
  const value = schedule.trim();
  if (macros.has(value)) return;
  const parts = value.split(/[ \t]+/);
  if (parts.length !== 5) throw invalid();
  parts.forEach((field, index) => {
    const { min, max, names } = fields[index];
    const number = (text: string): number => {
      if (/^[0-9]{1,9}$/.test(text)) {
        const result = Number(text);
        if (Number.isSafeInteger(result) && result >= min && result <= max) return result;
      }
      const named = names.indexOf(text.toUpperCase());
      if (named >= 0) return named + min;
      throw invalid();
    };
    for (const item of field.split(',')) {
      const stepped = item.split('/');
      if (stepped.length > 2 || !stepped[0]) throw invalid();
      if (stepped.length === 2 && (!/^[0-9]{1,9}$/.test(stepped[1]) || !Number.isSafeInteger(Number(stepped[1])) || Number(stepped[1]) < 1)) throw invalid();
      if (stepped[0] === '*') continue;
      const range = stepped[0].split('-');
      if (range.length === 1) number(range[0]);
      else if (range.length !== 2 || number(range[0]) > number(range[1])) throw invalid();
    }
  });
}

export function validateCronDraft(job: CronJobDraft): void {
  if (typeof job.name !== 'string' || !job.name.trim() || Array.from(job.name).length > 120 || controls.test(job.name)) {
    throw new Error(translate('Give this schedule a name of 1–120 characters without control characters.', 'Beri nama jadwal sepanjang 1–120 karakter tanpa karakter kontrol.'));
  }
  validateCronSchedule(job.schedule);
  if (typeof job.command !== 'string' || !job.command.trim() || commandControls.test(job.command)) {
    throw new Error(translate('Enter one command line without line breaks or control characters.', 'Isi satu baris perintah tanpa baris baru atau karakter kontrol.'));
  }
  if (new TextEncoder().encode(job.command).byteLength > 32 * 1024) {
    throw new Error(translate('The command exceeds 32 KiB.', 'Perintah melebihi 32 KiB.'));
  }
  if (typeof job.enabled !== 'boolean') throw new Error(translate('Choose whether this schedule is enabled.', 'Pilih apakah jadwal ini aktif.'));
}

export function validSchedulerId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128 && !controls.test(value);
}

export function parseSchedulerSnapshot(input: unknown): SchedulerSnapshot {
  const invalid = () => new Error(translate('The server returned an invalid Scheduler response. Refresh this host.', 'Server mengembalikan respons Scheduler yang tidak valid. Muat ulang host ini.'));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid();
  const value = input as Partial<SchedulerSnapshot>;
  if (!validSchedulerId(value.revision) || !validSchedulerId(value.username) || !validSchedulerId(value.timezone) || !Array.isArray(value.jobs) || value.jobs.length > 10000 || (value.warning !== undefined && value.warning !== null && (typeof value.warning !== 'string' || value.warning.length > 8192))) throw invalid();
  const ids = new Set<string>();
  const jobs = value.jobs.map(candidate => {
    if (!candidate || typeof candidate !== 'object' || !validSchedulerId(candidate.id) || ids.has(candidate.id) || typeof candidate.name !== 'string' || Array.from(candidate.name).length > 120 || controls.test(candidate.name) || typeof candidate.schedule !== 'string' || candidate.schedule.length > 256 || /[\r\n\0]/.test(candidate.schedule) || typeof candidate.command !== 'string' || new TextEncoder().encode(candidate.command).byteLength > 32 * 1024 || commandControls.test(candidate.command) || typeof candidate.enabled !== 'boolean') throw invalid();
    ids.add(candidate.id);
    return { id: candidate.id, name: candidate.name, schedule: candidate.schedule, command: candidate.command, enabled: candidate.enabled };
  });
  return { revision: value.revision, username: value.username, timezone: value.timezone, jobs, ...(value.warning !== undefined ? {warning: value.warning} : {}) };
}
