// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FleetHabitat, HABITAT_STALE_MS } from './FleetHabitat';
import { fleetRoster } from '../lib/observer';
import { setLanguage } from '../lib/i18n';

const roster = fleetRoster([
  {assignee:'forge',status:'running',title:'Build endpoint'},
  {assignee:'forge',status:'running',title:'Write migration'},
  {assignee:'atlas',status:'blocked',title:'Waiting for credentials'},
  {assignee:'prism',status:'review',title:'Review deployment'},
]);
const props = () => ({roster,sourceName:'Orchestrator VPS',connected:true,updatedAt:Date.now(),error:false,loading:false});
beforeEach(()=>{setLanguage('en');});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('shows one orchestrator and ten specialists in a shared habitat, with task-driven eating and sleeping poses',()=>{
  const view=render(<FleetHabitat {...props()}/>);
  expect(within(screen.getByRole('group',{name:'Fleet rabbits'})).getAllByRole('button')).toHaveLength(11);
  expect(view.container.querySelectorAll('.is-orchestrator')).toHaveLength(1);
  expect(view.container.querySelector('.is-orchestrator strong')?.textContent).toBe('LEVERET');
  expect(view.container.querySelectorAll('.is-specialist')).toHaveLength(10);
  expect(screen.getByRole('button',{name:'NEXUS · IDLE'})).toBeTruthy();
  expect(view.container.querySelectorAll('.pose-working')).toHaveLength(1);
  expect(view.container.querySelectorAll('.pose-idle')).toHaveLength(8);
  expect(view.container.querySelectorAll('.pose-review')).toHaveLength(1);
  expect(view.container.querySelectorAll('.pose-blocked')).toHaveLength(1);
  expect(view.container.querySelector('.fleet-habitat')?.getAttribute('data-motion')).toBe('running');
});

it('opens current tasks from a rabbit and follows status changes while the detail is open',()=>{
  const view=render(<FleetHabitat {...props()}/>);
  const rabbit=screen.getByRole('button',{name:'FORGE · WORKING'});
  rabbit.focus();
  fireEvent.click(rabbit);
  const dialog=screen.getByRole('dialog',{name:'FORGE'});
  expect(within(dialog).getByText('Build endpoint')).toBeTruthy();
  expect(within(dialog).getByText('Write migration')).toBeTruthy();
  expect(within(dialog).getByText('Orchestrator VPS')).toBeTruthy();
  view.rerender(<FleetHabitat {...props()} roster={fleetRoster([])}/>);
  expect(within(dialog).getByText('IDLE')).toBeTruthy();
  expect(within(dialog).queryByText('Build endpoint')).toBeNull();
  fireEvent.click(within(dialog).getByRole('button',{name:'Close dialog'}));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(rabbit);
});

it('never presents a disconnected or unconfirmed roster as sleeping idle agents',()=>{
  const view=render(<FleetHabitat {...props()} roster={null} connected={false} updatedAt={null}/>);
  const rabbits=screen.getByRole('group',{name:'Fleet rabbits'});
  expect(within(rabbits).getAllByRole('button',{name:/AWAITING DATA/})).toHaveLength(11);
  expect(view.container.querySelector('.pose-idle')).toBeNull();
  expect(view.container.querySelector('.fleet-habitat')?.getAttribute('data-motion')).toBe('paused');
});

it('keeps failed-poll data as last known status and pauses animation until a successful read',()=>{
  const view=render(<FleetHabitat {...props()} error/>);
  const habitat=view.container.querySelector('.fleet-habitat')!;
  expect(habitat.getAttribute('data-freshness')).toBe('stale');
  expect(habitat.getAttribute('data-motion')).toBe('paused');
  fireEvent.click(screen.getByRole('button',{name:'FORGE · WORKING · last known status'}));
  expect(within(screen.getByRole('dialog')).getByText('Build endpoint')).toBeTruthy();
  expect(within(screen.getByRole('dialog')).getByText(/Last known status/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Close dialog'}));
  view.rerender(<FleetHabitat {...props()}/>);
  expect(habitat.getAttribute('data-freshness')).toBe('current');
  expect(habitat.getAttribute('data-motion')).toBe('running');
});

it('marks snapshots stale after sixty seconds and cleans up its freshness timer',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-26T01:00:00Z'));
  const view=render(<FleetHabitat {...props()}/>);
  act(()=>{vi.advanceTimersByTime(HABITAT_STALE_MS);});
  expect(view.container.querySelector('.fleet-habitat')?.getAttribute('data-freshness')).toBe('stale');
  view.unmount();expect(vi.getTimerCount()).toBe(0);
});

it('respects manual pause and document visibility without losing the user choice',()=>{
  let hidden=false;
  vi.spyOn(document,'visibilityState','get').mockImplementation(()=>hidden?'hidden':'visible');
  const view=render(<FleetHabitat {...props()}/>);
  const habitat=view.container.querySelector('.fleet-habitat')!;
  hidden=true;fireEvent(document,new Event('visibilitychange'));
  expect(habitat.getAttribute('data-motion')).toBe('paused');
  hidden=false;fireEvent(document,new Event('visibilitychange'));
  expect(habitat.getAttribute('data-motion')).toBe('running');
  fireEvent.click(screen.getByRole('button',{name:'Pause motion'}));
  expect(screen.getByRole('button',{name:'Resume motion'}).getAttribute('aria-pressed')).toBe('true');
  hidden=true;fireEvent(document,new Event('visibilitychange'));hidden=false;fireEvent(document,new Event('visibilitychange'));
  expect(habitat.getAttribute('data-motion')).toBe('paused');
});

it('honors reduced motion and pauses when scrolled out of view',()=>{
  const media={matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()};
  vi.stubGlobal('matchMedia',()=>media);
  let intersection!:(entries:{isIntersecting:boolean}[])=>void;
  const disconnect=vi.fn();
  vi.stubGlobal('IntersectionObserver',class {constructor(callback:typeof intersection){intersection=callback;}observe(){}disconnect=disconnect;});
  const view=render(<FleetHabitat {...props()}/>);
  const habitat=view.container.querySelector('.fleet-habitat')!;
  expect((screen.getByRole('button',{name:'Reduced motion'}) as HTMLButtonElement).disabled).toBe(true);
  expect(habitat.getAttribute('data-motion')).toBe('paused');
  media.matches=false;act(()=>media.addEventListener.mock.calls[0][1]());
  expect(habitat.getAttribute('data-motion')).toBe('running');
  act(()=>intersection([{isIntersecting:false}]));expect(habitat.getAttribute('data-motion')).toBe('paused');
  view.unmount();expect(disconnect).toHaveBeenCalledOnce();expect(media.removeEventListener).toHaveBeenCalledOnce();
});
it('shows queued work without sleeping and opens the supplied Nexus role and task details',()=>{
  const view=render(<FleetHabitat {...props()} roster={fleetRoster([{assignee:'Nexus',status:'ready',title:'Prepare SOP'}])}/>);
  const nexus=screen.getByRole('button',{name:'NEXUS · QUEUED'});
  expect(nexus.querySelector('.rabbit-queue')).toBeTruthy();expect(nexus.querySelector('.rabbit-sleep')).toBeNull();
  expect(view.container.querySelectorAll('.is-specialist')).toHaveLength(10);
  fireEvent.click(nexus);
  const dialog=screen.getByRole('dialog',{name:'NEXUS'});
  expect(within(dialog).getByText('Operations, Documentation & Coordination')).toBeTruthy();
  expect(within(dialog).getByText('Prepare SOP')).toBeTruthy();
  expect(within(dialog).getByText('READY')).toBeTruthy();
});
