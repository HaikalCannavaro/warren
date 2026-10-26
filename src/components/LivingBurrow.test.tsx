// @vitest-environment jsdom
import { act,cleanup,render,screen,within } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { LivingBurrow } from './LivingBurrow';
import { FLEET_AGENTS,type FleetAgent } from '../lib/fleet';
import type { BurrowPose } from '../lib/burrowHabitat';
import { setLanguage } from '../lib/i18n';
import {rectInsideCavity} from '../lib/burrowGeometry';

let frames:Map<number,FrameRequestCallback>,serial:number,disconnect:ReturnType<typeof vi.fn>;
const poses=(forge:BurrowPose)=>Object.fromEntries(FLEET_AGENTS.map(agent=>[agent,agent==='Forge'?forge:'idle'])) as Record<FleetAgent,BurrowPose>;
const props=(forge:BurrowPose)=>({poses:poses(forge),statusFor:(pose:BurrowPose)=>pose.toUpperCase(),onSelect:vi.fn(),running:true,reducedMotion:false,stale:false});
const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON:()=>({})});
beforeEach(()=>{
  setLanguage('en');frames=new Map();serial=0;disconnect=vi.fn();
  vi.spyOn(Math,'random').mockReturnValue(.371);
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect=disconnect;});
  vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{frames.set(++serial,callback);return serial;});
  vi.spyOn(window,'cancelAnimationFrame').mockImplementation(id=>{frames.delete(id);});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    if(this.classList.contains('living-viewport'))return rect(0,0,320,450);
    const scene=this.closest<HTMLElement>('.living-world');
    const count=scene?.querySelectorAll('[data-room="meadow"] [data-slot]').length??0;
    const meadow=count?218+Math.ceil(count/7)*150+Math.max(0,Math.ceil(count/7)-1)*17:330;
    const waiting=scene?.querySelectorAll('[data-room="arrival"] [data-slot]').length??0;
    const porch=waiting?150+Math.ceil(waiting/7)*150+Math.max(0,Math.ceil(waiting/7)-1)*17:0,surface=meadow+porch;
    const height=(id:string)=>parseFloat(scene?.querySelector<HTMLElement>(`[data-room="${id}"]`)?.style.height??'')||300;
    const first=surface+80,second=Math.max(first+8+height('standby'),first+104+height('review'))+60;
    const third=Math.max(second+height('help'),second+92+height('sleep'))+60;
    const last=third+32+height('sleep-two')+60;
    if(this.classList.contains('living-world'))return rect(0,0,1040,last);
    const id=this.getAttribute('data-room');
    if(id==='meadow')return rect(0,porch,1040,meadow);
    const boxes:Record<string,ReturnType<typeof rect>>={standby:rect(20,first+8,470,height('standby')),review:rect(600,first+104,410,height('review')),help:rect(106,second,440,height('help')),arrival:rect(0,0,1040,porch),sleep:rect(675,second+92,335,height('sleep')),'sleep-two':rect(354,third+32,444,height('sleep-two'))};
    if(id)return boxes[id];
    if(this.classList.contains('living-room-content')){
      const room=this.closest<HTMLElement>('[data-room]')!,box=room.getBoundingClientRect();
      return rect(box.left+(room.dataset.room==='arrival'?20:parseFloat(this.style.left)||0),box.top+(room.dataset.room==='meadow'?148:room.dataset.room==='arrival'?20:parseFloat(this.style.top)||0),room.dataset.room==='arrival'?box.width-40:parseFloat(this.style.width)||box.width,parseFloat(this.style.height)||200);
    }
    if(this.classList.contains('living-room-sign')){
      const box=this.closest<HTMLElement>('.living-room-content')!.getBoundingClientRect();return rect(box.left,box.top,Math.min(190,box.width-28),60);
    }
    if(this.hasAttribute('data-slot')){
      const room=this.closest<HTMLElement>('[data-room]')!,box=room.getBoundingClientRect(),index=Array.from(room.querySelectorAll('[data-slot]')).indexOf(this);
      const content=this.closest<HTMLElement>('.living-room-content')!,bounds=content.getBoundingClientRect();
      const outside=room.dataset.room==='meadow'||room.dataset.room==='arrival',total=room.querySelectorAll('[data-slot]').length;
      const columns=outside?Math.min(7,total):+(content.style.getPropertyValue('--room-columns')||1),row=Math.floor(index/columns),inRow=outside?columns:Math.min(columns,total-row*columns),track=inRow*128+(inRow-1)*13;
      return rect(bounds.left+(bounds.width-track)/2+(index%columns)*141,room.dataset.room==='meadow'?box.top+178+row*167:bounds.top+82+row*167,128,150);
    }
    if(this.classList.contains('living-actor')){
      const match=this.style.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
      return rect(match?+match[1]:0,match?+match[2]:0,128,148);
    }
    return rect(0,0,0,0);
  });
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const step=(time:number)=>act(()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time));});
function assertInsideHomes(container:HTMLElement){
  const boxes:DOMRect[]=[];
  for(const actor of container.querySelectorAll<HTMLElement>('.living-actor')){
    const home=actor.dataset.zone!;if(home==='meadow')continue;
    const room=container.querySelector<HTMLElement>(`[data-room="${home}"]`)!,bounds=room.getBoundingClientRect();
    const box=actor.getBoundingClientRect();boxes.push(box);
    if(home==='arrival'){
      expect(box.left).toBeGreaterThanOrEqual(bounds.left+4);expect(box.right).toBeLessThanOrEqual(bounds.right-4);
      expect(box.top).toBeGreaterThanOrEqual(bounds.top+4);expect(box.bottom).toBeLessThanOrEqual(bounds.bottom-4);
    }else{
      const path=container.querySelector(`[data-cavity="${home}"] .cavity-inner-shadow`)!.getAttribute('d')!;
      // Independently sample the actual rendered SVG, at twice the packing resolution.
      const polygon:{x:number;y:number}[]=[];let x=0,y=0;
      const tokens=path.match(/[MQZ]|-?\d+(?:\.\d+)?/g)!;
      for(let i=0;i<tokens.length;){
        const command=tokens[i++];
        if(command==='M'){x=+tokens[i++];y=+tokens[i++];polygon.push({x,y});}
        else if(command==='Q'){
          const cx=+tokens[i++],cy=+tokens[i++],ex=+tokens[i++],ey=+tokens[i++];
          for(let step=1;step<=8;step++){const t=step/8,u=1-t;polygon.push({x:u*u*x+2*u*t*cx+t*t*ex,y:u*u*y+2*u*t*cy+t*t*ey});}
          x=ex;y=ey;
        }
      }
      expect(rectInsideCavity({left:box.left-bounds.left,top:box.top-bounds.top,width:box.width,height:box.height},polygon,4)).toBe(true);
    }
    expect(actor.dataset.walking).toBe('false');
  }
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
    const a=boxes[i],b=boxes[j];expect(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top).toBe(false);
  }
}

it('places all eleven identifiable rabbits in rooms matching their real statuses',()=>{
  const view=render(<LivingBurrow {...props('working')}/>);
  expect(within(screen.getByRole('group',{name:'Fleet rabbits'})).getAllByRole('button')).toHaveLength(11);
  const forge=view.container.querySelector('.peer-forge')!;
  expect(forge.getAttribute('data-zone')).toBe('meadow');
  expect(view.container.querySelector('[data-room="meadow"] [data-slot="Forge"]')).toBeTruthy();
  expect(['sleep','sleep-two']).toContain(view.container.querySelector('[data-slot="Leveret"]')!.closest<HTMLElement>('[data-room]')!.dataset.room);
  expect(forge.getAttribute('data-walking')).toBe('false');
  expect(view.container.querySelector('.living-tunnel-air')!.getAttribute('d')).toMatch(/^M520 /);
});
it('keeps each named room, status badge and resident assignment consistent for all five states',()=>{
  const states:BurrowPose[]=['working','idle','queued','review','blocked'];
  const current=Object.fromEntries(FLEET_AGENTS.map((agent,index)=>[agent,states[index%states.length]])) as Record<FleetAgent,BurrowPose>;
  const view=render(<LivingBurrow {...props('working')} poses={current}/>);
  const expected={working:'meadow',idle:'sleep',queued:'standby',review:'review',blocked:'help'};
  for(const agent of FLEET_AGENTS){
    const state=current[agent] as keyof typeof expected;
    if(state==='idle')expect(['sleep','sleep-two']).toContain(view.container.querySelector(`[data-slot="${agent}"]`)!.closest<HTMLElement>('[data-room]')!.dataset.room);
    else expect(view.container.querySelector(`[data-room="${expected[state]}"] [data-slot="${agent}"]`)).toBeTruthy();
    expect(screen.getByRole('button',{name:`${agent.toUpperCase()} · ${state.toUpperCase()}`})).toBeTruthy();
  }
});
it('walks a changed status from the current position, pauses/resumes, and cleans up frames',()=>{
  const view=render(<LivingBurrow {...props('working')}/>);
  const forge=view.container.querySelector<HTMLElement>('.peer-forge')!,start=forge.style.transform;
  view.rerender(<LivingBurrow {...props('idle')}/>);
  expect(forge.style.transform).toBe(start);expect(forge.dataset.walking).toBe('true');
  step(0);step(50);expect(forge.style.transform).not.toBe(start);
  view.rerender(<LivingBurrow {...props('idle')} running={false}/>);
  const paused=forge.style.transform;expect(frames.size).toBe(0);step(1000);expect(forge.style.transform).toBe(paused);
  view.rerender(<LivingBurrow {...props('blocked')}/>);
  expect(forge.style.transform).toBe(paused);expect(forge.dataset.destination).toBe('help');
  act(()=>{for(let time=0;time<30000&&frames.size;time+=50){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time));}});
  expect(forge.dataset.walking).toBe('false');expect(forge.dataset.zone).toBe('help');
  view.unmount();expect(frames.size).toBe(0);expect(disconnect).toHaveBeenCalled();
},15000); // Runs a complete 30s simulated journey plus multiple SVG layout changes in jsdom.
it('snaps to the correct destination with reduced motion and never invents an idle status',()=>{
  const view=render(<LivingBurrow {...props('working')} reducedMotion/>);
  view.rerender(<LivingBurrow {...props('unknown')} reducedMotion/>);
  expect(view.container.querySelector('[data-room="arrival"] [data-slot="Forge"]')).toBeTruthy();
  expect(view.container.querySelector('.peer-forge')?.getAttribute('data-walking')).toBe('false');
  expect(frames.size).toBe(0);
});
it('shows the first confirmed snapshot in its real room without inventing a trip from missing data',()=>{
  const view=render(<LivingBurrow {...props('unknown')}/>);
  view.rerender(<LivingBurrow {...props('working')}/>);
  const forge=view.container.querySelector<HTMLElement>('.peer-forge')!;
  expect(forge.dataset.walking).toBe('false');expect(forge.dataset.destination).toBe('meadow');
  expect(frames.size).toBe(0);
});
it('fits the same desktop canvas and provides an original-size view without rearranging rabbits',()=>{
  const view=render(<LivingBurrow {...props('working')}/>);
  const world=view.container.querySelector<HTMLElement>('.living-world')!,stage=view.container.querySelector<HTMLElement>('.living-stage')!;
  expect(world.style.width).toBe('1040px');expect(+stage.style.width.replace('px','')).toBeCloseTo(320);
  expect(screen.getByRole('button',{name:'Zoom out'}).hasAttribute('disabled')).toBe(true);
  const path=view.container.querySelector('.living-tunnel-air')!.getAttribute('d');
  act(()=>{screen.getByRole('button',{name:'Original habitat size'}).click();});
  expect(stage.style.width).toBe('1040px');expect(world.style.transform).toBe('scale(1)');
  expect(view.container.querySelector('.living-tunnel-air')!.getAttribute('d')).toBe(path);
  expect(view.container.querySelector('.living-viewport')!.classList.contains('is-zoomed')).toBe(true);
  act(()=>{screen.getByRole('button',{name:'Fit'}).click();});
  expect(+stage.style.width.replace('px','')).toBeCloseTo(320);expect(frames.size).toBe(0);
});
it('preserves an ongoing journey when the user changes zoom',()=>{
  const view=render(<LivingBurrow {...props('working')}/>);
  view.rerender(<LivingBurrow {...props('idle')}/>);
  const forge=view.container.querySelector<HTMLElement>('.peer-forge')!,position=forge.style.transform;
  act(()=>{screen.getByRole('button',{name:'Original habitat size'}).click();});
  expect(forge.style.transform).toBe(position);expect(forge.dataset.walking).toBe('true');
  step(0);step(50);expect(forge.style.transform).not.toBe(position);
  const moved=forge.style.transform;
  act(()=>{screen.getByRole('button',{name:'Fit'}).click();});
  expect(forge.style.transform).toBe(moved);expect(forge.dataset.walking).toBe('true');
});
it('contains eleven idle rabbits in two balanced sleeping caves without shuffling on polls',()=>{
  const current=Object.fromEntries(FLEET_AGENTS.map(agent=>[agent,'idle'])) as Record<FleetAgent,BurrowPose>;
  const view=render(<LivingBurrow {...props('idle')} poses={current}/>);
  const counts=['sleep','sleep-two'].map(home=>view.container.querySelectorAll(`[data-room="${home}"] [data-slot]`).length).sort();
  expect(counts).toEqual([5,6]);assertInsideHomes(view.container);
  const homes=Array.from(view.container.querySelectorAll<HTMLElement>('.living-actor')).map(node=>node.dataset.zone);
  view.rerender(<LivingBurrow {...props('idle')} poses={{...current}}/>);
  expect(Array.from(view.container.querySelectorAll<HTMLElement>('.living-actor')).map(node=>node.dataset.zone)).toEqual(homes);
  expect(frames.size).toBe(0);assertInsideHomes(view.container);
});
it.each(['blocked','review','queued','unknown'] as const)('contains all eleven residents when the %s room is crowded',(state)=>{
  const current=Object.fromEntries(FLEET_AGENTS.map(agent=>[agent,state])) as Record<FleetAgent,BurrowPose>;
  const view=render(<LivingBurrow {...props(state)} poses={current}/>);
  expect(within(screen.getByRole('group',{name:'Fleet rabbits'})).getAllByRole('button')).toHaveLength(11);
  assertInsideHomes(view.container);
});

it('always draws exactly five underground caves and keeps missing-data rabbits on the surface porch',()=>{
  const view=render(<LivingBurrow {...props('working')}/>);
  expect(view.container.querySelectorAll('[data-cavity]')).toHaveLength(5);
  const current=Object.fromEntries(FLEET_AGENTS.map(agent=>[agent,'unknown'])) as Record<FleetAgent,BurrowPose>;
  view.rerender(<LivingBurrow {...props('unknown')} poses={current}/>);
  expect(view.container.querySelectorAll('[data-cavity]')).toHaveLength(5);
  expect(view.container.querySelector('[data-cavity="arrival"]')).toBeNull();
  expect(view.container.querySelectorAll('.living-surface [data-room="arrival"] [data-slot]')).toHaveLength(11);
  expect(view.container.querySelectorAll('.living-earth [data-slot]')).toHaveLength(0);
  assertInsideHomes(view.container);
});
