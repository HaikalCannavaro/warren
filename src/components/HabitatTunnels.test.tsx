// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HabitatTunnels } from './HabitatTunnels';

afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('connects the rendered dens on the first commit, follows layout changes, and releases its observer',()=>{
  let rowTop=220;let resize!:()=>void;
  const observe=vi.fn(),disconnect=vi.fn();
  vi.stubGlobal('ResizeObserver',class {constructor(callback:()=>void){resize=callback;}observe=observe;disconnect=disconnect;});
  const rect=(x:number,y:number,width:number,height:number)=>({x,y,width,height,left:x,top:y,right:x+width,bottom:y+height,toJSON:()=>({})});
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockImplementation(function(this:Element){
    if(this.classList.contains('habitat-tunnels'))return rect(0,0,320,500);
    if(this.classList.contains('fleet-rabbit')){
      const index=Number(this.getAttribute('data-index'));
      return rect(index%2?188:20,index<2?20:rowTop,112,96);
    }
    return rect(0,0,320,500);
  });
  const view=render(<div className="habitat-earth"><HabitatTunnels/>{[0,1,2,3].map(index=><svg key={index} className="fleet-rabbit" data-index={index}/>)}</div>);
  const paths=view.container.querySelectorAll('.habitat-tunnels path');
  const initial=paths[0].getAttribute('d');
  expect(initial).toBeTruthy();expect(paths[1].getAttribute('d')).toBe(initial);
  expect(view.container.querySelector('.habitat-tunnels')?.getAttribute('viewBox')).toBe('0 0 320 500');
  expect(observe).toHaveBeenCalledWith(view.container.firstElementChild);
  rowTop=260;act(()=>resize());
  expect(paths[0].getAttribute('d')).not.toBe(initial);
  expect(paths[0].getAttribute('d')).toBe(paths[1].getAttribute('d'));
  view.unmount();expect(disconnect).toHaveBeenCalledOnce();
});
