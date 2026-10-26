import { expect,it } from 'vitest';
import { advanceBurrowTravel,burrowRoute,zoneForPose } from './burrowHabitat';

it('maps every real state to one named place and keeps missing data out of idle/queued rooms',()=>{
  expect(['working','idle','queued','review','blocked','unknown'].map(state=>zoneForPose(state as Parameters<typeof zoneForPose>[0])))
    .toEqual(['meadow','sleep','standby','review','help','arrival']);
});
it('routes a status change through both room entrances and the shared shaft',()=>{
  const start={x:60,y:50},target={x:290,y:460};
  const from={center:{x:100,y:100},portal:{x:200,y:100}},to={center:{x:300,y:400},portal:{x:200,y:400}};
  const path=burrowRoute(start,target,from,to,false);
  expect(path).toContainEqual(from.portal);expect(path).toContainEqual(to.portal);
  let previous=start;for(const point of path){expect(point.x===previous.x||point.y===previous.y).toBe(true);previous=point;}
  expect(path.at(-1)).toEqual(target);
});
it('walks progressively through corners and arrives exactly without overshoot',()=>{
  const initial={position:{x:0,y:0},route:[{x:30,y:0},{x:30,y:40}],facing:1 as const};
  const halfway=advanceBurrowTravel(initial,50);
  expect(halfway.position).toEqual({x:30,y:20});expect(initial.position).toEqual({x:0,y:0});
  const arrived=advanceBurrowTravel(halfway,100);
  expect(arrived.position).toEqual({x:30,y:40});expect(arrived.route).toEqual([]);
  expect(advanceBurrowTravel(initial,-5).position).toEqual(initial.position);
});
it('retargets from the actual in-flight position, preserving facing and avoiding a teleport',()=>{
  const moving=advanceBurrowTravel({position:{x:100,y:0},route:[{x:0,y:0}],facing:1},15);
  expect(moving.position.x).toBe(85);expect(moving.facing).toBe(-1);
  const room={center:{x:40,y:40},portal:{x:200,y:40}};
  const path=burrowRoute(moving.position,{x:50,y:60},room,room,true);
  const next=advanceBurrowTravel({...moving,route:path},5);
  expect(Math.hypot(next.position.x-moving.position.x,next.position.y-moving.position.y)).toBeCloseTo(5);
});
it('uses the neighbor passage chosen by the rendered tunnel network',()=>{
  const passage=[{x:100,y:200},{x:105,y:360},{x:120,y:500}];
  const from={zone:'standby' as const,center:passage[0],portal:{x:520,y:200},passages:{help:passage}};
  const to={zone:'help' as const,center:passage[2],portal:{x:520,y:500}};
  const path=burrowRoute(from.center,to.center,from,to,false);
  expect(path).toEqual(passage.slice(1));expect(path).not.toContainEqual(from.portal);
});
it('does not invent travel through solid soil when the network has no connecting passage',()=>{
  const from={zone:'standby' as const,center:{x:100,y:200},portal:{x:520,y:200},passages:{}};
  const to={zone:'help' as const,center:{x:100,y:500},portal:{x:520,y:500}};
  expect(burrowRoute(from.center,to.center,from,to,false)).toEqual([]);
});
