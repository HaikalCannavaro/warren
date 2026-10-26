import { expect, it } from 'vitest';
import { habitatTunnelPath, type HabitatAnchor } from './habitat';

function segments(path:string) {
  const lines:{x1:number;y1:number;x2:number;y2:number}[]=[];let x=0,y=0;
  for(const match of path.matchAll(/([MHV])(-?\d+)(?: (-?\d+))?/g)){
    const command=match[1],value=+match[2];
    if(command==='M'){x=value;y=+match[3];continue;}
    const nextX=command==='H'?value:x,nextY=command==='V'?value:y;
    lines.push({x1:x,y1:y,x2:nextX,y2:nextY});x=nextX;y=nextY;
  }
  return lines;
}
function assertConnected(anchors:HabitatAnchor[]) {
  const lines=segments(habitatTunnelPath(anchors));
  const inside=(value:number,a:number,b:number)=>value>=Math.min(a,b)&&value<=Math.max(a,b);
  const touches=(a:typeof lines[number],b:typeof lines[number])=>
    Math.max(Math.min(a.x1,a.x2),Math.min(b.x1,b.x2))<=Math.min(Math.max(a.x1,a.x2),Math.max(b.x1,b.x2))&&
    Math.max(Math.min(a.y1,a.y2),Math.min(b.y1,b.y2))<=Math.min(Math.max(a.y1,a.y2),Math.max(b.y1,b.y2));
  const visited=new Set([0]);
  for(let step=0;step<lines.length;step++) lines.forEach((line,index)=>{if([...visited].some(other=>touches(line,lines[other])))visited.add(index);});
  expect(visited.size).toBe(lines.length);
  for(const anchor of anchors) expect(lines.some(line=>inside(Math.round(anchor.x),line.x1,line.x2)&&inside(Math.round(anchor.y),line.y1,line.y2))).toBe(true);
  return lines;
}
it('joins all five mobile rows to one open central shaft without a top stub',()=>{
  const points=[78,258,452,642,836].flatMap(y=>[{x:64,y},{x:224,y}]);
  const lines=assertConnected(points);
  const shaft=lines.find(line=>line.y1!==line.y2)!;
  expect(shaft.x1).toBeGreaterThan(64);expect(shaft.x1).toBeLessThan(224);
  expect(Math.min(shaft.y1,shaft.y2)).toBe(78);expect(Math.max(shaft.y1,shaft.y2)).toBe(836);
});
it('connects ten desktop dens while routing the vertical shaft between resident columns',()=>{
  const points=[116,364].flatMap(y=>[90,270,450,630,810].map(x=>({x,y})));
  const lines=assertConnected(points);
  const shaft=lines.find(line=>line.y1!==line.y2)!;
  expect(shaft.x1).toBeGreaterThan(270);expect(shaft.x1).toBeLessThan(450);
});
it('follows changed row heights and connects a final row containing one resident',()=>{
  assertConnected([{x:60,y:70},{x:200,y:70},{x:60,y:310},{x:200,y:310},{x:60,y:580}]);
});
it('does not draw invalid geometry before layout is available',()=>{
  expect(habitatTunnelPath([])).toBe('');
  expect(habitatTunnelPath([{x:NaN,y:1},{x:Infinity,y:1},{x:30,y:80}])).toBe('');
});
it('uses one central shaft from Leveret on mobile with symmetric branches below',()=>{
  const points=[{x:144,y:80},...[260,440,620,800,980].flatMap(y=>[{x:64,y},{x:224,y}])];
  const lines=assertConnected(points);const shafts=lines.filter(line=>line.x1===line.x2&&line.y1!==line.y2);
  expect(shafts).toEqual([{x1:144,y1:80,x2:144,y2:980}]);
  expect(lines.filter(line=>line.y1===line.y2)).toHaveLength(5);
});
it('routes two mirrored wide-layout shafts through column gutters below Leveret',()=>{
  const lines=assertConnected([{x:450,y:80},...[300,550].flatMap(y=>[90,270,450,630,810].map(x=>({x,y})))]);
  const arms=lines.filter(line=>line.x1===line.x2&&Math.min(line.y1,line.y2)===80&&Math.max(line.y1,line.y2)===550);
  expect(arms).toHaveLength(2);expect(arms[0].x1+arms[1].x1).toBe(900);
  for(const arm of arms)expect([90,270,450,630,810]).not.toContain(arm.x1);
});
it('keeps the top two elbow joins in one continuous subpath so miter borders fill the outer corners',()=>{
  const path=habitatTunnelPath([{x:450,y:80},...[300,550].flatMap(y=>[90,270,450,630,810].map(x=>({x,y})))]);
  const first=path.split('M').filter(Boolean)[0];
  expect(first.match(/[HV]/g)).toEqual(['V','H','V']);
});
