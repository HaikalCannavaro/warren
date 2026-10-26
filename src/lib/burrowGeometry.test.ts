import {expect,it} from 'vitest';
import {cavityContour,cavityPolygon,cavityContentRects,packCavity,rectInsideCavity,planBurrowNetwork,planBurrowCorridors,planCavityMouths,type BurrowCavity} from './burrowGeometry';
import {burrowRoute,type BurrowPoint} from './burrowHabitat';

const desktop:BurrowCavity[]=[
  {zone:'standby',left:24,top:390,width:470,height:345},
  {zone:'review',left:600,top:494,width:410,height:360},
  {zone:'help',left:106,top:950,width:440,height:365},
  {zone:'sleep',left:675,top:1042,width:335,height:365},
  {zone:'sleep-two',left:354,top:1520,width:444,height:365},
];
function avoidsOtherCaves(route:BurrowPoint[],boxes:BurrowCavity[],allowed:string[]){
  for(let i=1;i<route.length;i++)for(let step=0;step<=20;step++){
    const a=route[i-1],b=route[i],t=step/20,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    expect(boxes.some(other=>!allowed.includes(other.zone)&&p.x>other.left&&p.x<other.left+other.width&&p.y>other.top&&p.y<other.top+other.height)).toBe(false);
  }
}
it('draws stable organic cavities with closed smooth curves instead of pixel steps',()=>{
  const paths=[1,2,3,4].map(seed=>cavityContour(400,330,seed));
  expect(new Set(paths).size).toBe(4);expect(paths[0]).toBe(cavityContour(400,330,1));
  for(const path of paths){expect(path.endsWith('Z')).toBe(true);expect((path.match(/Q/g)??[]).length).toBe(48);expect(path).not.toMatch(/[HV]|NaN|Infinity/);}
  expect(cavityContour(0,100,1)).toBe('');expect(cavityContour(12,12,1,12)).toBe('');
});
it('preserves the original four-cave tunnel paths and their winding shared junctions',()=>{
  const root={x:518,y:300},primary=desktop.slice(0,4),original=planBurrowCorridors(1036,2050,root,primary);
  const network=planBurrowNetwork(1036,2050,root,desktop);
  expect(network.branches).toEqual(original);expect(network.trunk).toEqual([]);
  expect(Object.keys(network.branches)).toHaveLength(4);
  for(const box of primary){
    const route=network.branches[box.zone]!;
    expect(route[0]).toEqual(root);expect(route.at(-1)).toEqual({x:Math.round(box.left+box.width/2),y:Math.round(box.top+box.height*.6)});
    avoidsOtherCaves(route,desktop,[box.zone]);
  }
});
it('joins the centered lower idle cave to both the upper idle cave and Help Hollow',()=>{
  const network=planBurrowNetwork(1036,2050,{x:518,y:300},desktop);
  expect(network.links).toHaveLength(2);expect(network.links.map(link=>[link.from,link.to])).toEqual([['sleep','sleep-two'],['help','sleep-two']]);
  expect(network.branches['sleep-two']).toBeUndefined();
  for(const link of network.links){
    avoidsOtherCaves(link.points,desktop,[link.from,link.to]);
    expect(network.routes[link.from]![link.to]).toEqual(link.points);
    expect(network.routes[link.to]![link.from]).toEqual([...link.points].reverse());
  }
  const link=network.links[0];
  expect(network.routes.sleep!['sleep-two']).toEqual(link.points);
  expect(network.routes['sleep-two']!.sleep).toEqual([...link.points].reverse());
});
it('walks the added downward passage in both directions without returning to the main tunnel',()=>{
  const network=planBurrowNetwork(1036,2050,{x:518,y:300},desktop),link=network.links[0];
  const from={zone:'sleep' as const,center:link.points[0],portal:link.points[0],passages:network.routes.sleep};
  const to={zone:'sleep-two' as const,center:link.points.at(-1)!,portal:link.points.at(-1)!};
  expect(burrowRoute(from.center,to.center,from,to,false)).toEqual(link.points.slice(1));
});
it('chooses the shorter visible entrance route to the lower idle cave',()=>{
  const network=planBurrowNetwork(1036,2050,{x:518,y:300},desktop);
  for(const box of desktop)expect(network.routes.meadow![box.zone]!.length).toBeGreaterThan(1);
  const length=(points:BurrowPoint[])=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
  const candidates=network.links.map(link=>[...network.branches[link.from]!,...link.points.slice(1)]);
  expect(length(network.routes.meadow!['sleep-two']!)).toBeCloseTo(Math.min(...candidates.map(length)));
});
it('does not invent a downward connection when the new cave is above its parent',()=>{
  const boxes=desktop.map(box=>box.zone==='sleep-two'?{...box,top:800}:box);
  const network=planBurrowNetwork(1036,2050,{x:518,y:300},boxes);
  expect(network.links).toEqual([]);expect(network.routes.meadow!['sleep-two']).toEqual([]);
});
it('uses the same sampled bends for walking and joins at the shared corridor',()=>{
  const entrance={x:250,y:0},junction={x:260,y:110};
  const a={center:{x:60,y:220},portal:{x:200,y:220},corridor:[entrance,junction,{x:255,y:205},{x:240,y:220},{x:60,y:220}]};
  const b={center:{x:400,y:370},portal:{x:300,y:370},corridor:[entrance,junction,{x:270,y:330},{x:290,y:370},{x:400,y:370}]};
  const route=burrowRoute(a.center,b.center,a,b,false);
  expect(route).toContainEqual(junction);expect(route).toContainEqual(a.corridor[2]);expect(route).toContainEqual(b.corridor[2]);
  expect(route).not.toContainEqual(entrance);expect(route.at(-1)).toEqual(b.center);
});
it('does not invent a path when the layout has no usable entrance',()=>{
  const network=planBurrowNetwork(320,600,{x:-1,y:200},[{zone:'sleep',left:10,top:300,width:200,height:250}]);
  expect(network.trunk).toEqual([]);expect(network.routes.meadow!.sleep).toEqual([]);
});
it.each([[470,2],[409,3],[419,4],[335,5],[470,3],[470,8]])('contains the complete resident grid inside the real cave contour at width %i / seed %i',(width,seed)=>{
  for(let count=0;count<=11;count++){
    const plan=packCavity(width,count,seed,60),polygon=cavityPolygon(width,plan.cavityHeight,seed);
    for(const rect of cavityContentRects(plan,count))expect(rectInsideCavity(rect,polygon,8)).toBe(true);
    const cells=cavityContentRects(plan,count).slice(1,count+1);
    for(const cell of cells)expect(rectInsideCavity(cell,polygon,4)).toBe(true);
    for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){
      const a=cells[i],b=cells[j];expect(a.left<b.left+b.width&&a.left+a.width>b.left&&a.top<b.top+b.height&&a.top+a.height>b.top).toBe(false);
    }
  }
});
it('rejects a rectangle spanning an inward notch even when all four corners appear inside',()=>{
  const polygon=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:60,y:100},{x:60,y:40},{x:40,y:40},{x:40,y:100},{x:0,y:100}];
  expect(rectInsideCavity({left:20,top:20,width:60,height:60},polygon)).toBe(false);
});

it('keeps normal one- and two-rabbit caves broad like the reference while preserving containment',()=>{
  for(const [width,count,seed] of [[470,2,3],[419,1,4],[335,1,5],[470,1,2],[470,1,8]]){
    const plan=packCavity(width,count,seed);
    expect(plan.cavityHeight).toBeLessThanOrEqual(390);
    const polygon=cavityPolygon(width,plan.cavityHeight,seed);
    expect(cavityContentRects(plan,count).every(rect=>rectInsideCavity(rect,polygon,8))).toBe(true);
  }
});

it('rejects inward diagonal wall notches even when every rectangle corner is inside',()=>{
  const polygon=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:60,y:100},{x:50,y:40},{x:40,y:100},{x:0,y:100}];
  expect(rectInsideCavity({left:20,top:20,width:60,height:60},polygon)).toBe(false);
});
it('flares actual tunnel crossings into the room and merges repeated shared passages',()=>{
  const cave:BurrowCavity={zone:'review',left:100,top:100,width:400,height:350};
  const passage=[{x:0,y:310},{x:300,y:310}];
  const mouths=planCavityMouths(cave,3,[passage,passage]);
  expect(mouths).toHaveLength(1);
  expect(mouths[0].point.x).toBeGreaterThan(100);expect(mouths[0].point.x).toBeLessThan(180);
  expect(mouths[0].point.y).toBe(310);
  for(const path of [mouths[0].wall,mouths[0].rim,mouths[0].air]){expect(path).toContain('C');expect(path.endsWith('Z')).toBe(true);expect(path).not.toMatch(/NaN|Infinity/);}
});
it('never cuts a mouth when a path stays entirely inside or outside a cave',()=>{
  const cave:BurrowCavity={zone:'review',left:100,top:100,width:400,height:350};
  expect(planCavityMouths(cave,3,[[{x:0,y:0},{x:40,y:40}],[{x:250,y:250},{x:300,y:310}]])).toEqual([]);
});
