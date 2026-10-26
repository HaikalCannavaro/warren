import type { FleetState } from './observer';

export type BurrowPose = FleetState['state'] | 'unknown';
export type BurrowZone = 'meadow' | 'sleep' | 'sleep-two' | 'standby' | 'review' | 'help' | 'arrival';
export interface BurrowPoint { x: number; y: number }
export interface BurrowRoom { zone?:BurrowZone; center: BurrowPoint; portal: BurrowPoint; corridor?:BurrowPoint[]; passages?:Partial<Record<BurrowZone,BurrowPoint[]>> }
export interface BurrowTravel { position: BurrowPoint; route: BurrowPoint[]; facing: 1 | -1 }

export function zoneForPose(pose: BurrowPose): BurrowZone {
  return pose === 'working' ? 'meadow' : pose === 'idle' ? 'sleep' : pose === 'review' ? 'review' : pose === 'blocked' ? 'help' : pose === 'queued' ? 'standby' : 'arrival';
}

/** Move through room entrances and the shared tunnel, never across solid soil. */
export function burrowRoute(start: BurrowPoint, target: BurrowPoint, from: BurrowRoom, to: BurrowRoom, sameRoom: boolean): BurrowPoint[] {
  let tunnel:BurrowPoint[]=[from.portal,to.portal];
  if(from.passages&&to.zone){
    const passage=from.passages[to.zone];
    if(!passage?.length)return [];
    tunnel=passage;
  }else if(from.corridor&&to.corridor){
    if(!from.corridor.length||!to.corridor.length)return [];
    let shared=0;
    while(shared<Math.min(from.corridor.length,to.corridor.length)&&Math.hypot(from.corridor[shared].x-to.corridor[shared].x,from.corridor[shared].y-to.corridor[shared].y)<.5)shared++;
    tunnel=[...from.corridor.slice(Math.max(0,shared-1)).reverse(),...to.corridor.slice(shared)];
  }
  const points = sameRoom ? [target] : [
    {x:from.center.x,y:start.y},from.center,...tunnel,to.center,
    {x:to.center.x,y:target.y},target,
  ];
  let previous=start;
  return points.filter(point=>{
    if(Math.hypot(point.x-previous.x,point.y-previous.y)<.5)return false;
    previous=point;return true;
  });
}

/** Consume a distance budget, carrying unused distance through tunnel corners. */
export function advanceBurrowTravel(travel: BurrowTravel, distance: number): BurrowTravel {
  let position={...travel.position},facing=travel.facing;
  const route=[...travel.route];let remaining=Math.max(0,distance);
  while(route.length&&remaining>0){
    const next=route[0],dx=next.x-position.x,dy=next.y-position.y,length=Math.hypot(dx,dy);
    if(Math.abs(dx)>.1)facing=dx<0?-1:1;
    if(length<=remaining){position={...next};route.shift();remaining-=length;}
    else{position={x:position.x+dx/length*remaining,y:position.y+dy/length*remaining};remaining=0;}
  }
  return {position,route,facing};
}
