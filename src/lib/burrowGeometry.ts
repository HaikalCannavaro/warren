import type { BurrowPoint, BurrowZone } from './burrowHabitat';

export interface BurrowCavity { zone:BurrowZone; left:number; top:number; width:number; height:number }
interface Obstacle { left:number; right:number; top:number; bottom:number }
const distance=(a:BurrowPoint,b:BurrowPoint)=>Math.hypot(a.x-b.x,a.y-b.y);

function outlinePoints(width:number,height:number,seed:number,inset:number):BurrowPoint[]{
  if(!Number.isFinite(width+height)||width<=inset*2||height<=inset*2)return [];
  const raw=Array.from({length:48},(_,i)=>{
    const angle=i*Math.PI/24,c=Math.cos(angle),s=Math.sin(angle);
    const bulge=1+.07*Math.sin(angle*3+seed*1.7)+.04*Math.cos(angle*5-seed);
    return {x:Math.sign(c)*Math.abs(c)**.85*bulge,y:Math.sign(s)*Math.abs(s)**.93*(1+.06*Math.sin(angle*4+seed))};
  });
  const xs=raw.map(p=>p.x),ys=raw.map(p=>p.y),minX=Math.min(...xs),minY=Math.min(...ys);
  const spanX=Math.max(...xs)-minX,spanY=Math.max(...ys)-minY;
  return raw.map(p=>({x:Math.round((inset+(p.x-minX)/spanX*(width-inset*2))*100)/100,y:Math.round((inset+(p.y-minY)/spanY*(height-inset*2))*100)/100}));
}
const midpoint=(a:BurrowPoint,b:BurrowPoint):BurrowPoint=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
function cavityCurves(width:number,height:number,seed:number,inset:number){
  const points=outlinePoints(width,height,seed,inset);
  return points.map((control,i)=>({start:midpoint(points[(i+points.length-1)%points.length],control),control,end:midpoint(control,points[(i+1)%points.length])}));
}
/** Closed quadratic curves preserve each organic silhouette without pixel steps. */
export function cavityContour(width:number,height:number,seed:number,inset=0):string {
  const curves=cavityCurves(width,height,seed,inset);if(!curves.length)return '';
  const xy=(p:BurrowPoint)=>`${p.x} ${p.y}`;
  return `M${xy(curves[0].start)}`+curves.map(curve=>`Q${xy(curve.control)} ${xy(curve.end)}`).join('')+'Z';
}
/** Sample the exact rendered curves; the packing clearance also covers the tiny chord error. */
export function cavityPolygon(width:number,height:number,seed:number,inset=12):BurrowPoint[]{
  return cavityCurves(width,height,seed,inset).flatMap(({start,control,end})=>Array.from({length:4},(_,i)=>{
    const t=i/4,u=1-t;return{x:u*u*start.x+2*u*t*control.x+t*t*end.x,y:u*u*start.y+2*u*t*control.y+t*t*end.y};
  }));
}

function pointInCavity(x:number,y:number,polygon:BurrowPoint[]):boolean{
    let result=false;
    for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
      const a=polygon[i],b=polygon[j];
      if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)result=!result;
    }
    return result;
}

export interface CavityRect {left:number;top:number;width:number;height:number}
export function rectInsideCavity(rect:CavityRect,polygon:BurrowPoint[],clearance=0):boolean{
  if(polygon.length<3)return false;
  const left=rect.left-clearance,right=rect.left+rect.width+clearance,top=rect.top-clearance,bottom=rect.top+rect.height+clearance;

  if(![[left,top],[right,top],[right,bottom],[left,bottom]].every(([x,y])=>pointInCavity(x,y,polygon)))return false;
  // A concave wall can enter the rectangle between its corners. Clip every
  // segment against the rectangle, including diagonal samples of smooth curves.
  return !polygon.some((a,i)=>{
    const b=polygon[(i+1)%polygon.length];let near=0,far=1;
    for(const [start,delta,min,max] of [[a.x,b.x-a.x,left,right],[a.y,b.y-a.y,top,bottom]]){
      if(Math.abs(delta)<1e-9){if(start<min||start>max)return false;continue;}
      const first=(min-start)/delta,second=(max-start)/delta;
      near=Math.max(near,Math.min(first,second));far=Math.min(far,Math.max(first,second));
      if(near>far)return false;
    }
    return true;
  });
}

export interface CavityMouth {point:BurrowPoint;wall:string;rim:string;air:string}
/** Flare each real crossing into the room, so its rim becomes one continuous tunnel shoulder. */
export function planCavityMouths(cave:BurrowCavity,seed:number,passages:readonly BurrowPoint[][]):CavityMouth[]{
  const polygon=cavityPolygon(cave.width,cave.height,seed),mouths:CavityMouth[]=[];
  const inside=(point:BurrowPoint)=>pointInCavity(point.x-cave.left,point.y-cave.top,polygon);
  for(const path of passages)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i];
    if(Math.max(a.x,b.x)<cave.left||Math.min(a.x,b.x)>cave.left+cave.width||Math.max(a.y,b.y)<cave.top||Math.min(a.y,b.y)>cave.top+cave.height)continue;
    const aInside=inside(a);if(aInside===inside(b))continue;
    let low=0,high=1;
    for(let step=0;step<20;step++){const t=(low+high)/2,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};if(inside(p)===aInside)low=t;else high=t;}
    const t=(low+high)/2,point={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    if(mouths.some(mouth=>distance(mouth.point,point)<22))continue;
    const length=distance(a,b),sign=aInside?-1:1,dx=(b.x-a.x)/length*sign,dy=(b.y-a.y)/length*sign;
    const xy=(along:number,side:number)=>`${Math.round((point.x+dx*along-dy*side)*100)/100} ${Math.round((point.y+dy*along+dx*side)*100)/100}`;
    const flare=(back:number,front:number,narrow:number,wide:number)=>`M${xy(-back,-narrow)}C${xy(-10,-narrow)} ${xy(-8,-wide)} ${xy(front,-wide)}L${xy(front,wide)}C${xy(-8,wide)} ${xy(-10,narrow)} ${xy(-back,narrow)}Z`;
    mouths.push({point,wall:flare(32,28,18,38),rim:flare(30,26,15,34),air:flare(28,24,9,26)});
  }
  return mouths;
}

export interface CavityPacking extends CavityRect {cavityHeight:number;columns:number}
const cavityPackingMemo=new Map<string,CavityPacking>();
/** Actual visible content, rather than the empty corners of its wrapper. */
export function cavityContentRects(plan:CavityPacking,count:number,headerHeight=60,headerWidth=200):CavityRect[]{
  const signWidth=Math.min(headerWidth,plan.width-28);
  const header={left:plan.left+(plan.width-signWidth)/2,top:plan.top,width:signWidth,height:headerHeight};
  const cells=Array.from({length:count},(_,i)=>{
    const row=Math.floor(i/plan.columns),residents=Math.min(plan.columns,count-row*plan.columns),trackWidth=residents*128+(residents-1)*13;
    return {left:plan.left+(plan.width-trackWidth)/2+(i%plan.columns)*141,top:plan.top+headerHeight+22+row*167,width:128,height:150};
  });
  const empty={left:plan.left+(plan.width-144)/2,top:plan.top+headerHeight+22,width:144,height:124};
  const bed={left:plan.left+plan.width*.29-4,top:plan.top+plan.height-32,width:plan.width*.34+16,height:28};
  return [header,...(count?cells:[empty]),bed];
}
/** Keep each sign, rabbit, label and bed inside the organic contour without inflating empty corners. */
export function packCavity(width:number,count:number,seed:number,headerHeight=60,headerWidth=200,minHeight=340):CavityPacking{
  const key=[width,count,seed,headerHeight,headerWidth,minHeight].join(':');
  const cached=cavityPackingMemo.get(key);if(cached)return cached;
  const maxColumns=Math.max(1,Math.min(2,Math.max(1,count),Math.floor((width-40-32+13)/141)));
  let best:CavityPacking|undefined;
  for(let columns=1;columns<=maxColumns;columns++){
    const contentWidth=Math.max(220,columns*128+(columns-1)*13+32);
    if(contentWidth+24>=width-24||contentWidth>width*.82)continue;
    const rows=Math.ceil(count/columns);
    const gridHeight=count?Math.max(182,rows*150+Math.max(0,rows-1)*17+58):182;
    const contentHeight=Math.ceil(headerHeight)+gridHeight;
    const fit=(height:number):CavityPacking|undefined=>{
      const polygon=cavityPolygon(width,height,seed);
      for(const shiftX of [0,-.025,.025])for(const shiftY of [0,-.035,.035,-.07]){
        const plan={left:Math.round((width-contentWidth)/2+width*shiftX),top:Math.round((height-contentHeight)/2+height*shiftY),width:contentWidth,height:contentHeight,cavityHeight:height,columns};
        if(cavityContentRects(plan,count,headerHeight,headerWidth).every(rect=>rectInsideCavity(rect,polygon,8)))return plan;
      }
    };
    let low=Math.max(minHeight,contentHeight+48),high=Math.max(low,Math.ceil(contentHeight*2)+128);
    while(!fit(high)&&high<8192)high+=256;
    while(high-low>4){const middle=Math.floor((high+low)/2);if(fit(middle))high=middle;else low=middle+1;}
    let result=fit(high);while(!result&&high<8192){high+=4;result=fit(high);}
    if(result&&(!best||result.cavityHeight<best.cavityHeight))best=result;
  }
  if(!best)throw new Error('The cavity is too narrow to contain its residents.');
  Object.freeze(best);cavityPackingMemo.set(key,best);
  if(cavityPackingMemo.size>256)cavityPackingMemo.delete(cavityPackingMemo.keys().next().value!);
  return best;
}

function soften(points:BurrowPoint[],radius:number):BurrowPoint[]{
  if(points.length<3)return points;
  const result:BurrowPoint[]=[points[0]];
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],before=distance(a,b),after=distance(b,c);
    if(!before||!after||(a.x===b.x&&b.x===c.x)||(a.y===b.y&&b.y===c.y)){result.push(b);continue;}
    const reach=Math.min(radius,before*.35,after*.35);
    const enter={x:b.x+(a.x-b.x)*reach/before,y:b.y+(a.y-b.y)*reach/before};
    const leave={x:b.x+(c.x-b.x)*reach/after,y:b.y+(c.y-b.y)*reach/after};
    result.push(enter);
    for(let step=1;step<=12;step++){
      const t=step/12,u=1-t;result.push({x:u*u*enter.x+2*u*t*b.x+t*t*leave.x,y:u*u*enter.y+2*u*t*b.y+t*t*leave.y});
    }
  }
  result.push(points[points.length-1]);
  return result.map((p,i)=>{const precision=i===0||i===result.length-1?1:100;return{x:Math.round(p.x*precision)/precision,y:Math.round(p.y*precision)/precision};}).filter((p,i,list)=>!i||distance(p,list[i-1])>.1);
}

function clearSegment(a:BurrowPoint,b:BurrowPoint,obstacles:Obstacle[]):boolean {
  return !obstacles.some(o=>a.x===b.x?a.x>o.left+.01&&a.x<o.right-.01&&Math.max(a.y,b.y)>o.top+.01&&Math.min(a.y,b.y)<o.bottom-.01:
    a.y>o.top+.01&&a.y<o.bottom-.01&&Math.max(a.x,b.x)>o.left+.01&&Math.min(a.x,b.x)<o.right-.01);
}

function earthBends(points:BurrowPoint[],obstacles:Obstacle[],amplitude:number):BurrowPoint[]{
  const result:BurrowPoint[]=[];
  const free=(p:BurrowPoint)=>!obstacles.some(o=>p.x>o.left+.01&&p.x<o.right-.01&&p.y>o.top+.01&&p.y<o.bottom-.01);
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1];result.push(a);
    if(distance(a,b)<90)continue;
    const sign=(Math.round(a.x+a.y+b.x+b.y)%2)?1:-1;
    for(const direction of [sign,-sign]){
      const bends=[.25,.5,.75].map(t=>({x:a.x+(b.x-a.x)*t+(a.x===b.x?Math.sin(t*Math.PI)*amplitude*direction:0),y:a.y+(b.y-a.y)*t+(a.y===b.y?Math.sin(t*Math.PI)*amplitude*direction:0)}));
      if(bends.every(free)){result.push(...bends);break;}
    }
  }
  result.push(points[points.length-1]);return result;
}

export interface BurrowLink {from:BurrowZone;to:BurrowZone;points:BurrowPoint[]}
export interface BurrowNetwork {
  trunk:BurrowPoint[];
  branches:Partial<Record<BurrowZone,BurrowPoint[]>>;
  links:BurrowLink[];
  routes:Partial<Record<BurrowZone,Partial<Record<BurrowZone,BurrowPoint[]>>>>;
}

/** Route outside cavity bounds on a small visibility grid, then soften the bends. */
export function planBurrowCorridors(width:number,height:number,entrance:BurrowPoint,cavities:BurrowCavity[]):Partial<Record<BurrowZone,BurrowPoint[]>>{
  const margin=width<760?15:20;
  const obstacles=cavities.map(box=>({left:box.left-margin,right:box.left+box.width+margin,top:box.top-margin,bottom:box.top+box.height+margin}));
  const portals=cavities.map((box,index)=>{
    const o=obstacles[index];
    return box.zone==='arrival'?{x:box.left+box.width/2,y:o.top}:
      {x:box.left+box.width/2<width/2?o.right:o.left,y:box.top+box.height*.6};
  });
  const unique=(values:number[],min:number,max:number)=>[...new Set(values.filter(v=>v>=min&&v<=max))].sort((a,b)=>a-b);
  const xs=unique([margin,width-margin,entrance.x,...obstacles.flatMap(o=>[o.left,o.right]),...portals.map(p=>p.x)],0,width);
  const ys=unique([entrance.y,height-margin,...obstacles.flatMap(o=>[o.top,o.bottom]),...portals.map(p=>p.y)],0,height);
  const columns=xs.length,start=ys.indexOf(entrance.y)*columns+xs.indexOf(entrance.x);
  const point=(index:number)=>({x:xs[index%columns],y:ys[Math.floor(index/columns)]});
  const valid=(p:BurrowPoint)=>!obstacles.some(o=>p.x>o.left+.01&&p.x<o.right-.01&&p.y>o.top+.01&&p.y<o.bottom-.01);
  const output:Partial<Record<BurrowZone,BurrowPoint[]>>={};
  const shared=new Map<number,number[]>([[start,[start]]]);
  cavities.forEach((box,index)=>{
    const target=portals[index],end=ys.indexOf(target.y)*columns+xs.indexOf(target.x);
    if(!xs.includes(target.x)||!ys.includes(target.y)||!xs.includes(entrance.x)||!ys.includes(entrance.y)||end<0||start<0||!valid(entrance)||!valid(target)){output[box.zone]=[];return;}
    // Grow one connected burrow rather than laying parallel pipes to every room.
    const open=new Set(shared.keys()),cost=new Map([...shared.keys()].map(node=>[node,0])),parent=new Map<number,number>();
    let reached=false;
    while(open.size){
      let current=-1,score=Infinity;
      for(const candidate of open){const value=cost.get(candidate)!+distance(point(candidate),target);if(value<score){current=candidate;score=value;}}
      if(current===end){reached=true;break;}open.delete(current);
      const column=current%columns,row=Math.floor(current/columns),here=point(current);
      const neighbors=[column?current-1:-1,column<columns-1?current+1:-1,row?current-columns:-1,row<ys.length-1?current+columns:-1];
      for(const next of neighbors){
        if(next<0)continue;const there=point(next);
        if(!valid(there)||!clearSegment(here,there,obstacles))continue;
        const nextCost=cost.get(current)!+distance(here,there);
        if(nextCost<(cost.get(next)??Infinity)){cost.set(next,nextCost);parent.set(next,current);open.add(next);}
      }
    }
    if(!reached){output[box.zone]=[];return;}
    const branch=[end];let cursor=end;
    while(!shared.has(cursor)){cursor=parent.get(cursor)!;branch.unshift(cursor);}
    const nodes=[...shared.get(cursor)!,...branch.slice(1)];
    nodes.forEach((node,i)=>{if(!shared.has(node))shared.set(node,nodes.slice(0,i+1));});
    const route=nodes.map(point);
    route.push({x:box.left+box.width/2,y:box.top+box.height*.6});
    output[box.zone]=soften(earthBends(route,obstacles,width<760?4:7),width<760?12:20);
  });
  return output;
}

/** Keep the reference tunnels and join the centered Quiet Burrow to both neighboring rooms. */
export function planBurrowNetwork(width:number,height:number,entrance:BurrowPoint,cavities:BurrowCavity[]):BurrowNetwork{
  const primary=cavities.filter(box=>box.zone!=='sleep-two');
  const corridors=planBurrowCorridors(width,height,entrance,primary);
  const network:BurrowNetwork={trunk:[],branches:{...corridors},links:[],routes:{}};
  const child=cavities.find(box=>box.zone==='sleep-two');
  for(const zone of ['sleep','help'] as const){
    const parent=cavities.find(box=>box.zone===zone);
    if(!parent||!child||!corridors[zone]?.length)continue;
    const gap=child.top-(parent.top+parent.height),middle=Math.round(parent.top+parent.height+gap/2);
    const start={x:Math.round(parent.left+parent.width/2),y:Math.round(parent.top+parent.height*.6)};
    const end={x:Math.round(child.left+child.width/2),y:Math.round(child.top+child.height*.6)};
    const raw=[start,{x:start.x,y:middle},{x:end.x,y:middle},end];
    const others=cavities.filter(box=>box!==parent&&box!==child).map(box=>({left:box.left-16,right:box.left+box.width+16,top:box.top-16,bottom:box.top+box.height+16}));
    if(gap>=16&&raw.slice(1).every((point,i)=>clearSegment(raw[i],point,others))){
      const points=soften(earthBends(raw,others,7),Math.min(18,gap/3));
      network.links.push({from:zone,to:'sleep-two',points});
    }
  }
  type Edge={to:BurrowZone;points:BurrowPoint[];cost:number};
  const graph=new Map<BurrowZone,Edge[]>();
  const addEdge=(from:BurrowZone,to:BurrowZone,points:BurrowPoint[])=>{
    if(points.length<2)return;
    const cost=points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
    graph.set(from,[...(graph.get(from)??[]),{to,points,cost}]);
    graph.set(to,[...(graph.get(to)??[]),{to:from,points:[...points].reverse(),cost}]);
  };
  const base:BurrowZone[]=['meadow',...primary.map(box=>box.zone)];
  const paths:Partial<Record<BurrowZone,BurrowPoint[]>>={meadow:[entrance],...corridors};
  for(let i=0;i<base.length;i++)for(let j=i+1;j<base.length;j++){
    const a=paths[base[i]]??[],b=paths[base[j]]??[];if(!a.length||!b.length)continue;
    let shared=0;while(shared<Math.min(a.length,b.length)&&distance(a[shared],b[shared])<.5)shared++;
    addEdge(base[i],base[j],[...a.slice(Math.max(0,shared-1)).reverse(),...b.slice(shared)]);
  }
  for(const link of network.links)addEdge(link.from,link.to,link.points);
  const zones:BurrowZone[]=['meadow',...cavities.map(box=>box.zone)];
  for(const source of zones){
    const open=new Set([source]),cost=new Map([[source,0]]),paths=new Map<BurrowZone,BurrowPoint[]>([[source,[]]]);
    while(open.size){
      const current=[...open].reduce((a,b)=>cost.get(a)!<=cost.get(b)!?a:b);open.delete(current);
      for(const edge of graph.get(current)??[]){
        const next=cost.get(current)!+edge.cost;if(next>=(cost.get(edge.to)??Infinity))continue;
        cost.set(edge.to,next);const prefix=paths.get(current)!;
        paths.set(edge.to,prefix.length?[...prefix,...edge.points.slice(1)]:edge.points);open.add(edge.to);
      }
    }
    network.routes[source]=Object.fromEntries(zones.filter(zone=>zone!==source).map(zone=>[zone,paths.get(zone)??[]]));
  }
  return network;
}

export const corridorPath=(points:BurrowPoint[])=>points.map((point,index)=>`${index?'L':'M'}${point.x} ${point.y}`).join('');
