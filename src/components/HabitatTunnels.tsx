import { useLayoutEffect, useRef, useState } from 'react';
import { habitatTunnelPath } from '../lib/habitat';

export function HabitatTunnels() {
  const canvas = useRef<SVGSVGElement>(null);
  const [layout, setLayout] = useState({width:1,height:1,path:'',unit:2});
  useLayoutEffect(()=>{
    // The SVG's own ref is attached before this layout effect. Its parent's
    // React ref may not be attached yet on the first commit.
    const earth = canvas.current?.parentElement;
    if (!earth) return;
    const measure = () => {
      const bounds = canvas.current?.getBoundingClientRect();
      if (!bounds?.width || !bounds.height) return;
      const sprites = Array.from(earth.querySelectorAll<SVGSVGElement>('.fleet-rabbit'));
      const boxes = sprites.map(sprite=>sprite.getBoundingClientRect()).filter(box=>box.width>0);
      const next = {
        width:Math.round(bounds.width),height:Math.round(bounds.height),
        path:habitatTunnelPath(boxes.map(box=>({x:box.left+box.width/2-bounds.left,y:box.top+box.height*39/48-bounds.top}))),
        unit:boxes[0] ? Math.max(2,Math.min(3,Math.round(boxes[0].width/56))) : 2,
      };
      setLayout(previous=>previous.width===next.width&&previous.height===next.height&&previous.path===next.path&&previous.unit===next.unit?previous:next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(earth);
    window.addEventListener('resize',measure);
    return ()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  return <svg ref={canvas} className="habitat-tunnels" viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    <path className="tunnel-outer" d={layout.path} strokeWidth={layout.unit*8}/>
    <path className="tunnel-inner" d={layout.path} strokeWidth={layout.unit*5}/>
  </svg>;
}
