import { beforeEach, expect, it } from 'vitest';
import { setLanguage } from './i18n';
import { parseSchedulerSnapshot, validateCronDraft, validateCronSchedule, type CronJobDraft } from './scheduler';

beforeEach(() => setLanguage('en'));
const draft: CronJobDraft = {name: 'Check service logs', schedule: '*/5 * * * *', command: 'journalctl -u hermes -n 60 --no-pager', enabled: true};

it.each(['* * * * *', '*/5 0-23/2 1,15 JAN-MAR MON-FRI', '0 8 * * 0,7', '0 0 1 1 *', '@reboot', '@hourly', '@daily', '@weekly', '@monthly', '@yearly', '@annually', '@midnight', ' 0\t8 * * MON ', '000000001 0 1 JAN MON', '*/000000001 * * * *'])('accepts supported cron expression %s', schedule => {
  expect(() => validateCronSchedule(schedule)).not.toThrow();
});
it.each(['', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8', '*/0 * * * *', '*/-1 * * * *', '1-0 * * * *', '1,,2 * * * *', '0 0 * * MOON', '* * * * *\n@reboot', '@every 1h', '*/2/3 * * * *', '0 0 * JAN-FEB-MAR *', '0000000000 * * * *', '*/1000000000 * * * *'])('rejects invalid cron expression %s', schedule => {
  expect(() => validateCronSchedule(schedule)).toThrow(/valid five-field/);
});
it('preserves shell quoting, percent handling and literal command text', () => {
  const job = {...draft, command: "printf 'hello\\%world' >> /tmp/report.log"};
  expect(() => validateCronDraft(job)).not.toThrow();
  expect(job.command).toBe("printf 'hello\\%world' >> /tmp/report.log");
});
it.each(['echo ok\nreboot', 'echo ok\rreboot', 'echo\vbad', 'echo \x1b[31m', 'echo \0'])('refuses command control characters without executing or cleaning them', command => {
  expect(() => validateCronDraft({...draft, command})).toThrow(/one command line/);
});
it('accepts TAB shell whitespace without replacing it in the command', () => {
  const job = {...draft, command: 'printf\tvalue'};
  expect(() => validateCronDraft(job)).not.toThrow();
  expect(job.command).toBe('printf\tvalue');
});
it('preserves a trailing escaped space in both an existing snapshot and an edit draft', () => {
  const command = 'printf value\\ ';
  const snapshot = parseSchedulerSnapshot({revision:'revision', username:'deploy', timezone:'UTC', jobs:[{...draft,id:'line-1',command}]});
  const editing = {...snapshot.jobs[0], name:'Renamed schedule'};
  expect(() => validateCronDraft(editing)).not.toThrow();
  expect(snapshot.jobs[0].command).toBe(command);
  expect(editing.command).toBe(command);
  expect(editing.command.endsWith('\\ ')).toBe(true);
});
it('uses UTF-8 bytes for commands and Unicode code points for names', () => {
  expect(() => validateCronDraft({...draft, name: '🐇'.repeat(120)})).not.toThrow();
  expect(() => validateCronDraft({...draft, name: '🐇'.repeat(121)})).toThrow(/1–120/);
  expect(() => validateCronDraft({...draft, command: 'é'.repeat(16385)})).toThrow(/32 KiB/);
});
it('validates the response without altering existing job text', () => {
  const snapshot = {revision: 'a'.repeat(64), username: 'deploy', timezone: 'UTC', jobs: [{...draft, id: 'line-4', command: 'echo\tkept'}], warning: null};
  expect(parseSchedulerSnapshot(snapshot)).toEqual(snapshot);
});
it.each([
  null,
  {revision: '', username: 'deploy', timezone: 'UTC', jobs: []},
  {revision: 'revision', username: 'deploy', timezone: 'UTC', jobs: [{...draft, id:'one'}, {...draft, id:'one'}]},
  {revision: 'revision', username: 'deploy', timezone: 'UTC', jobs: [{...draft, id:'one', enabled:'true'}]},
  {revision: 'revision', username: 'deploy', timezone: 'UTC', jobs: [{...draft, id:'one', command:'echo bad\nextra'}]},
])('refuses malformed or duplicate job responses', snapshot => {
  expect(() => parseSchedulerSnapshot(snapshot)).toThrow(/invalid Scheduler response/);
});
