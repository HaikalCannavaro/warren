import { beforeEach, expect, it, vi } from 'vitest';
import { setLanguage } from './i18n';
import { schedulerCommand, SchedulerMutationError } from './schedulerClient';

const mock = vi.hoisted(() => ({invoke:vi.fn(), native:vi.fn()}));
vi.mock('@tauri-apps/api/core', () => ({invoke:mock.invoke, isTauri:mock.native}));
const snapshot = {revision:'revision', username:'deploy', timezone:'UTC', jobs:[]};
const job = {name:'Inspect service', schedule:'*/5 * * * *', command:'systemctl status hermes --no-pager', enabled:true};
beforeEach(() => {setLanguage('en');mock.native.mockReturnValue(true);mock.invoke.mockReset().mockResolvedValue(snapshot);});
it('routes requests to exactly the selected SSH session and returns the validated snapshot', async () => {
  await expect(schedulerCommand('ssh-selected', {action:'list'})).resolves.toEqual(snapshot);
  expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('ssh_scheduler', {sessionId:'ssh-selected', request:{action:'list'}});
});
it('does not invoke a native action when browsing outside Warren', async () => {
  mock.native.mockReturnValue(false);
  await expect(schedulerCommand('ssh-selected', {action:'list'})).rejects.toThrow(/Open the Warren app/);
  expect(mock.invoke).not.toHaveBeenCalled();
});
it('rejects invalid command input before any server mutation', async () => {
  await expect(schedulerCommand('ssh-selected', {action:'save', revision:'revision', job:{...job, command:'echo first\necho second'}})).rejects.toThrow(/one command line/);
  expect(mock.invoke).not.toHaveBeenCalled();
});
it('keeps an existing job ID and revision intact during edits', async () => {
  const request = {action:'save' as const, revision:'old-revision', job:{...job, id:'existing-line-4'}};
  await schedulerCommand('ssh-selected', request);
  expect(mock.invoke).toHaveBeenCalledExactlyOnceWith('ssh_scheduler', {sessionId:'ssh-selected', request});
});
it('never retries an uncertain mutation and requires a refresh even if the response is malformed', async () => {
  mock.invoke.mockRejectedValueOnce(new Error('SSH ended without confirmation'));
  await expect(schedulerCommand('ssh-selected', {action:'delete', revision:'revision', id:'job'})).rejects.toMatchObject({name:'SchedulerMutationError', requiresRefresh:true});
  expect(mock.invoke).toHaveBeenCalledTimes(1);
  mock.invoke.mockResolvedValueOnce({});
  await expect(schedulerCommand('ssh-selected', {action:'toggle', revision:'revision', id:'job', enabled:false})).rejects.toBeInstanceOf(SchedulerMutationError);
  expect(mock.invoke).toHaveBeenCalledTimes(2);
});
it('passes read failures through without a retry', async () => {
  const error = new Error('Connect this host first');mock.invoke.mockRejectedValueOnce(error);
  await expect(schedulerCommand('ssh-selected', {action:'list'})).rejects.toBe(error);
  expect(mock.invoke).toHaveBeenCalledTimes(1);
});
