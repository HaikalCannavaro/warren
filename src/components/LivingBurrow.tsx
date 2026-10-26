import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ClipboardCheck, Flag, Hourglass, Leaf, Minus, Moon, Plus, Radio } from 'lucide-react';
import { FLEET_AGENTS, ORCHESTRATOR, type FleetAgent } from '../lib/fleet';
import { advanceBurrowTravel, burrowRoute, zoneForPose, type BurrowPoint, type BurrowPose, type BurrowRoom, type BurrowTravel, type BurrowZone } from '../lib/burrowHabitat';
import { useI18n } from '../lib/i18n';
import { cavityContour, corridorPath, packCavity, planBurrowNetwork, planCavityMouths, type BurrowCavity, type CavityPacking } from '../lib/burrowGeometry';
import { allocateIdleBurrows, type IdleAssignments } from '../lib/idleBurrows';
import { FleetRabbit } from './FleetRabbit';
import '../living-burrow.css';

const ZONES = [
  {id:'meadow',name:['Carrot Meadow','Padang Wortel'],status:'WORKING',icon:Leaf,seed:0,height:0},
  {id:'sleep',name:['Dream Burrow','Liang Mimpi'],status:'IDLE',icon:Moon,seed:5,height:365},
  {id:'sleep-two',name:['Quiet Burrow','Liang Teduh'],status:'IDLE',icon:Moon,seed:8,height:365},
  {id:'standby',name:['Standby Den','Liang Siaga'],status:'QUEUED',icon:Hourglass,seed:2,height:345},
  {id:'review',name:['Review Nook','Ruang Telaah'],status:'IN REVIEW',icon:ClipboardCheck,seed:3,height:360},
  {id:'help',name:['Help Hollow','Pos Bantuan'],status:'BLOCKED',icon:Flag,seed:4,height:365},
  {id:'arrival',name:['Signal Porch','Teras Koneksi'],status:'AWAITING DATA',icon:Radio,seed:0,height:0},
] as const;
interface Mover extends BurrowTravel { zone:BurrowZone; destination:BurrowZone; target:BurrowPoint; width:number; foot:number }
interface EarthDrawing {width:number;height:number;outerHeight:number;path:string;trunk:string;entrance:BurrowPoint;passages:BurrowPoint[][];cavities:BurrowCavity[];key:string}
export const BURROW_CANVAS_WIDTH=1040;

function EarthCutaway({drawing}:{drawing:EarthDrawing}){
  const uid=useId().replace(/[^a-zA-Z0-9_-]/g,'');
  const caves=useMemo(()=>drawing.cavities.map(box=>{
    const seed=ZONES.find(zone=>zone.id===box.zone)!.seed;
    return {...box,outer:cavityContour(box.width,box.height,seed),rim:cavityContour(box.width,box.height,seed,4),air:cavityContour(box.width,box.height,seed,12),floor:cavityContour(box.width,box.height,seed,21)};
  }),[drawing]);
  const mouths=useMemo(()=>caves.flatMap(cave=>planCavityMouths(cave,ZONES.find(zone=>zone.id===cave.zone)!.seed,drawing.passages)),[caves,drawing.passages]);
  return <svg className="living-tunnels" viewBox={`0 0 ${drawing.width} ${drawing.height}`} preserveAspectRatio="none" shapeRendering="geometricPrecision" aria-hidden="true">
    <defs>
      <linearGradient id={`${uid}-shell`} x1="0" y1="0" x2=".2" y2="1"><stop stopColor="var(--burrow-wall)"/><stop offset=".42" stopColor="var(--burrow-wall-dark)"/><stop offset="1" stopColor="#5b371e"/></linearGradient>
      <linearGradient id={`${uid}-rim`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#edc48e"/><stop offset=".38" stopColor="var(--burrow-wall)"/><stop offset="1" stopColor="var(--burrow-wall-dark)"/></linearGradient>
      <clipPath id={`${uid}-below-grass`}><rect y={drawing.entrance.y+2} width={drawing.width} height={drawing.height}/></clipPath>
      <mask id={`${uid}-ground-shell`} maskUnits="userSpaceOnUse" x="-10" y="-10" width={drawing.width+20} height={drawing.height+20}>
        {caves.map(cave=><path key={cave.zone} d={cave.outer} transform={`translate(${cave.left} ${cave.top})`} fill="white"/>)}
        <g clipPath={`url(#${uid}-below-grass)`}>
          <path className="living-tunnel-wall" d={drawing.path} stroke="white"/>
          {mouths.map((mouth,i)=><path key={i} data-cavity-mouth d={mouth.wall} fill="white"/>)}
        </g>
      </mask>
      <mask id={`${uid}-ground-rim`} maskUnits="userSpaceOnUse" x="-10" y="-10" width={drawing.width+20} height={drawing.height+20}>
        {caves.map(cave=><path key={cave.zone} d={cave.rim} transform={`translate(${cave.left} ${cave.top})`} fill="white"/>)}
        <g clipPath={`url(#${uid}-below-grass)`}>
          <path className="living-tunnel-rim" d={drawing.path} stroke="white"/>
          {mouths.map((mouth,i)=><path key={i} d={mouth.rim} fill="white"/>)}
        </g>
      </mask>
      <mask id={`${uid}-ground-air`} maskUnits="userSpaceOnUse" x="-10" y="-10" width={drawing.width+20} height={drawing.height+20}>
        {caves.map(cave=><g key={cave.zone} data-cavity={cave.zone} transform={`translate(${cave.left} ${cave.top})`}><path className="cavity-inner-shadow" d={cave.air} fill="white"/></g>)}
        <g clipPath={`url(#${uid}-below-grass)`}>
          <path className="living-tunnel-air" d={drawing.path} style={{stroke:'white'}}/>
          {mouths.map((mouth,i)=><path key={i} className="living-mouth-air" d={mouth.air} fill="white"/>)}
        </g>
      </mask>
      <mask id={`${uid}-floor-trim`} maskUnits="userSpaceOnUse" x="0" y="0" width={drawing.width} height={drawing.height}>
        <rect width={drawing.width} height={drawing.height} fill="white"/>
        <path d={drawing.path} fill="none" stroke="black" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round"/>
        {mouths.map((mouth,i)=><path key={i} d={mouth.air} fill="black" stroke="black" strokeWidth="14"/>)}
      </mask>
    </defs>
    {/* A shared union for each material: overlapping rooms and passages never paint separate seams. */}
    <g transform="translate(4 6)"><rect width={drawing.width} height={drawing.height} mask={`url(#${uid}-ground-shell)`} fill="#21140e" opacity=".4"/></g>
    <rect width={drawing.width} height={drawing.height} mask={`url(#${uid}-ground-shell)`} fill={`url(#${uid}-shell)`}/>
    <rect width={drawing.width} height={drawing.height} mask={`url(#${uid}-ground-rim)`} fill={`url(#${uid}-rim)`}/>
    <rect width={drawing.width} height={drawing.height} mask={`url(#${uid}-ground-air)`} fill="#23150f"/>
    <g mask={`url(#${uid}-ground-air)`}><g transform="translate(0 4)"><rect width={drawing.width} height={drawing.height} mask={`url(#${uid}-ground-air)`} fill="var(--burrow-room)"/></g></g>
    <g mask={`url(#${uid}-floor-trim)`}>{caves.map(cave=><g key={cave.zone} transform={`translate(${cave.left} ${cave.top})`}><svg y={cave.height*.7} width={cave.width} height={cave.height*.3} viewBox={`0 ${cave.height*.7} ${cave.width} ${cave.height*.3}`} overflow="hidden"><path className="cavity-floor" d={cave.floor}/></svg></g>)}</g>
    {drawing.path&&<g data-grass-entrance transform={`translate(${drawing.entrance.x} ${drawing.entrance.y})`}>
      <ellipse cy="5" rx="33" ry="13" fill="#214221" opacity=".45"/>
      <ellipse cy="2" rx="29" ry="13" fill="#426b29"/>
      <ellipse cy="3" rx="25" ry="11" fill={`url(#${uid}-rim)`}/>
      <path d="M-14 0Q0 12 14 0L9 20H-9Z" fill="var(--burrow-room)"/>
      <ellipse cy="0" rx="22" ry="9" fill="#1e130d"/>
      <path d="M-29 1C-24-14 24-14 29 1" fill="none" stroke="#8fc44a" strokeWidth="4" strokeLinecap="round"/>
      <path d="M-24 6Q-20 12-11 13M11 13Q20 12 24 6" fill="none" stroke="#c79a61" strokeWidth="3" strokeLinecap="round"/>
      <path d="M-29 1-34-7-27-3-28-9-21-3M21-3 25-10 26-3 33-6 29 1" fill="none" stroke="#639c36" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </g>}
  </svg>;
}

function WarrenTree(){return <svg className="living-tree" viewBox="0 0 240 180" aria-hidden="true" shapeRendering="crispEdges">
  <path d="M106 58h36v54l14 32 24 22H70l24-22 12-32Z" fill="#85532e"/>
  <path d="M111 64h9v61l-13 29H88l17-25Zm22 28h8v27l21 36h-13l-16-30Z" fill="#bd8546"/>
  <path d="M105 100 72 80l-6-28h12l6 22 27 13Zm35-11 28-28 3-25h12l-4 32-35 36Z" fill="#85532e"/>
  <path d="M34 31h16V18h38V8h61v10h33v13h24v16h14v38h-16v16h-38v11H76v-9H45V88H24V50h10Z" fill="#316a32"/>
  <path d="M40 31h19V20h34V12h49v9h31v13h24v15h15v25h-22v15h-39v10H80V87H50V73H32V48h8Z" fill="#65a93c"/>
  <path d="M53 32h35V20h48v12h33v13h-34V35H91v14H53Zm-15 23h26v13H38Zm118 5h35v17h-35Z" fill="#a1d45b"/>
  <path d="m99 137-17 21-23 9h42l21-24 15 19h47l-26-12-16-22" fill="#85532e"/>
  <path d="M113 142h21v30h-25v-20h4Z" fill="#2a2018"/>
  <path d="M20 166h28v5h18v7H5v-6h15Zm172 0h30v6h13v6h-57v-7h14Z" fill="#83c746"/>
</svg>;}

export function LivingBurrow({poses,statusFor,onSelect,running,reducedMotion,stale}:{
  poses:Record<FleetAgent,BurrowPose>;statusFor:(pose:BurrowPose)=>string;onSelect:(agent:FleetAgent)=>void;
  running:boolean;reducedMotion:boolean;stale:boolean;
}){
  const {t,locale}=useI18n();
  const viewport=useRef<HTMLDivElement>(null);
  const root=useRef<HTMLDivElement>(null);
  const actors=useRef(new Map<FleetAgent,HTMLElement>());
  const movers=useRef(new Map<FleetAgent,Mover>());
  const previousRooms=useRef<Record<string,BurrowRoom>>({});
  const packingCache=useRef(new Map<string,CavityPacking>());
  const previousIdle=useRef<IdleAssignments>({});
  const [idleSeed]=useState(Math.random);
  const [revision,setRevision]=useState(0);
  const [fitScale,setFitScale]=useState(1);
  const [zoom,setZoom]=useState<number|null>(null);
  const scale=zoom??fitScale;
  const [drawing,setDrawing]=useState<EarthDrawing>({width:1,height:1,outerHeight:1,path:'',trunk:'',entrance:{x:0,y:0},passages:[],cavities:[],key:''});
  const posesKey=FLEET_AGENTS.map(agent=>poses[agent]).join('|');
  const idleKey=FLEET_AGENTS.filter(agent=>poses[agent]==='idle').join('|');
  const idleAssignments=useMemo(()=>allocateIdleBurrows(FLEET_AGENTS.filter(agent=>poses[agent]==='idle'),previousIdle.current,idleSeed),[idleKey,idleSeed]);
  useLayoutEffect(()=>{previousIdle.current=idleAssignments;},[idleAssignments]);
  const homeFor=(agent:FleetAgent):BurrowZone=>poses[agent]==='idle'?(idleAssignments[agent]??'sleep'):zoneForPose(poses[agent]);
  const homesKey=FLEET_AGENTS.map(homeFor).join('|');
  const changeZoom=(value:number|null)=>{
    setZoom(value);
    viewport.current?.scrollIntoView?.({block:'start'});
  };
  useLayoutEffect(()=>{
    const element=viewport.current;if(!element)return;
    const fit=()=>{const width=element.getBoundingClientRect().width;if(width>0)setFitScale(Math.min(1,width/BURROW_CANVAS_WIDTH));};
    fit();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(fit);
    observer?.observe(element);window.addEventListener('resize',fit);
    return()=>{observer?.disconnect();window.removeEventListener('resize',fit);};
  },[]);
  const paint=(agent:FleetAgent,mover:Mover)=>{
    const node=actors.current.get(agent);if(!node)return;
    node.style.transform=`translate3d(${mover.position.x-mover.width/2}px,${mover.position.y-mover.foot}px,0)`;
    node.style.setProperty('--rabbit-facing',String(mover.facing));
    node.dataset.walking=String(mover.route.length>0);node.dataset.ready='true';
    node.dataset.destination=mover.destination;
  };
  useLayoutEffect(()=>{
    const scene=root.current;if(!scene)return;
    const measure=()=>{
      let bounds=scene.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
      // All geometry stays in desktop canvas coordinates, even when the whole
      // canvas is transformed to fit a phone. Zoom never changes a rabbit's route.
      const factor=bounds.width/BURROW_CANVAS_WIDTH;
      const logical=(value:number)=>Math.round(value/factor);
      const insetX=scene.clientLeft,insetY=scene.clientTop;
      const width=BURROW_CANVAS_WIDTH-insetX*2;
      // Fit the visible sign, cells and bedding against the stepped SVG outline.
      // Empty wrapper corners can overlap the rim, keeping the rooms broad and natural.
      for(const zone of ZONES){
        if(zone.id==='meadow'||zone.id==='arrival')continue;
        const node=scene.querySelector<HTMLElement>(`[data-room="${zone.id}"]`);if(!node)continue;
        const content=node.querySelector<HTMLElement>('.living-room-content')!,header=node.querySelector<HTMLElement>('.living-room-sign')!;
        const roomWidth=logical(node.getBoundingClientRect().width),count=node.querySelectorAll('[data-slot]').length;
        const seed=zone.seed;
        content.style.removeProperty('--room-header-height');
        // Browser zoom and scale transforms can report 60.000003 for a 60px sign.
        // Ignore subpixel noise so resizing never changes the canonical artwork.
        const roundUp=(value:number)=>Math.ceil(value/factor-.05);
        let headerHeight=Math.max(60,roundUp(header.getBoundingClientRect().height));
        let headerWidth=Math.max(180,roundUp(header.getBoundingClientRect().width));
        for(let attempt=0;attempt<3;attempt++){
          const cacheKey=`${roomWidth}:${count}:${seed}:${headerHeight}:${headerWidth}`;
          let plan=packingCache.current.get(cacheKey);
          if(!plan){plan=packCavity(roomWidth,count,seed,headerHeight,headerWidth,zone.height);packingCache.current.set(cacheKey,plan);if(packingCache.current.size>128)packingCache.current.delete(packingCache.current.keys().next().value!);}
          node.style.height=`${plan.cavityHeight}px`;
          content.style.left=`${plan.left}px`;content.style.top=`${plan.top}px`;
          content.style.width=`${plan.width}px`;content.style.height=`${plan.height}px`;
          content.style.setProperty('--room-columns',String(plan.columns));
          content.style.setProperty('--room-header-height',`${headerHeight}px`);content.dataset.columns=String(plan.columns);
          const measured=header.getBoundingClientRect(),h=roundUp(measured.height),w=roundUp(measured.width);
          if(h<=headerHeight&&w<=headerWidth)break;headerHeight=Math.max(headerHeight,h);headerWidth=Math.max(headerWidth,w);
        }
      }
      bounds=scene.getBoundingClientRect();
      const outerHeight=scene.offsetHeight||logical(bounds.height),height=outerHeight-insetY*2;
      const rooms:Record<string,BurrowRoom>={},cavities:BurrowCavity[]=[];
      for(const zone of ZONES){
        const node=scene.querySelector<HTMLElement>(`[data-room="${zone.id}"]`);if(!node)continue;
        const box=node.getBoundingClientRect();
        const center={x:logical(box.left+box.width/2-bounds.left)-insetX,y:logical(box.top+box.height*.6-bounds.top)-insetY};
        const portal={x:width/2,y:zone.id==='meadow'?logical(box.bottom-bounds.top)-insetY-14:center.y};
        rooms[zone.id]={zone:zone.id,center,portal};
        if(zone.id!=='meadow'&&zone.id!=='arrival')cavities.push({zone:zone.id,left:logical(box.left-bounds.left)-insetX,top:logical(box.top-bounds.top)-insetY,width:logical(box.width),height:logical(box.height)});
      }
      const network=planBurrowNetwork(width,height,rooms.meadow.portal,cavities);
      for(const room of Object.values(rooms))room.passages=network.routes[room.zone!]??{};
      const trunk=corridorPath(network.trunk);
      const passages=[...Object.values(network.branches),...network.links.map(link=>link.points)];
      const path=[network.trunk,...passages].map(corridorPath).join('');
      let changed=false;
      for(const agent of FLEET_AGENTS){
        const box=scene.querySelector<HTMLElement>(`[data-slot="${agent}"]`)!.getBoundingClientRect();
        const width=logical(box.width),foot=width*39/56;
        const target={x:logical(box.left+box.width/2-bounds.left)-insetX,y:logical(box.top-bounds.top)-insetY+foot};
        const zone=homeFor(agent),previous=movers.current.get(agent);
        if(previous&&!reducedMotion&&previous.destination===zone&&Math.hypot(previous.target.x-target.x,previous.target.y-target.y)<.5){paint(agent,previous);continue;}
        const sameHome=previous?.destination===zone&&!previous.route.length;
        const route=previous&&previous.destination!=='arrival'&&zone!=='arrival'&&!sameHome&&!reducedMotion?burrowRoute(previous.position,target,rooms[previous.zone]??previousRooms.current[previous.zone],rooms[zone],previous.zone===zone):[];
        const next:Mover={position:route.length?previous!.position:target,route,facing:previous?.facing??1,zone:route.length?previous!.zone:zone,destination:zone,target,width,foot};
        movers.current.set(agent,next);paint(agent,next);changed=true;
      }
      previousRooms.current=rooms;
      const key=JSON.stringify([width,height,outerHeight,cavities]);
      setDrawing(old=>old.key===key&&old.path===path?old:{width,height,outerHeight,path,trunk,entrance:rooms.meadow.portal,passages,cavities,key});
      if(changed)setRevision(value=>value+1);
    };
    measure();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
    observer?.observe(scene);scene.querySelectorAll('[data-room],.living-room-sign,.living-earth .living-slots').forEach(room=>observer?.observe(room));
    window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
    // Status changes remeasure the real room layout; repeated polls keep current motion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[posesKey,homesKey,reducedMotion,locale]);
  useEffect(()=>{
    if(!running||reducedMotion||!Array.from(movers.current.values()).some(item=>item.route.length))return;
    let frame=0,last:number|null=null;
    const tick=(time:number)=>{
      const delta=last===null?0:Math.min(50,Math.max(0,time-last));last=time;let moving=false;
      for(const [agent,mover] of movers.current){
        if(mover.route.length){
          const next={...mover,...advanceBurrowTravel(mover,delta*.17)};
          if(!next.route.length)next.zone=next.destination;
          movers.current.set(agent,next);paint(agent,next);moving||=next.route.length>0;
        }
      }
      if(moving)frame=window.requestAnimationFrame(tick);
    };
    frame=window.requestAnimationFrame(tick);
    return()=>window.cancelAnimationFrame(frame);
  },[running,reducedMotion,revision]);

  const room=(zone:typeof ZONES[number])=>{
    const residents=FLEET_AGENTS.filter(agent=>homeFor(agent)===zone.id);
    const Icon=zone.icon;
    return <section key={zone.id} className={`living-room room-${zone.id}`} data-room={zone.id} aria-label={`${t(zone.name[0],zone.name[1])} · ${zone.status}`}>
      {zone.id==='meadow'&&<WarrenTree/>}
      <div className="living-room-content">
      <header className="living-room-sign"><Icon size={16}/><div><h4>{t(zone.name[0],zone.name[1])}</h4><span>{zone.status}</span></div><b aria-label={t(`${residents.length} rabbits`,`${residents.length} kelinci`)}>{residents.length}</b></header>
      <div className="living-slots" aria-hidden="true">{residents.map(agent=><div key={agent} className="living-slot" data-slot={agent}/>)}{residents.length===0&&<span className="living-room-empty">{t('A quiet corner.','Sudut yang tenang.')}</span>}</div>
      {(zone.id==='sleep'||zone.id==='sleep-two')&&<span className="living-bed" aria-hidden="true"/>}
      </div>
    </section>;
  };
  return <div className="living-map">
    <div className="living-zoom" role="group" aria-label={t('Habitat zoom','Zoom habitat')}>
      <span>{t('Habitat scale','Skala habitat')}</span>
      <button type="button" aria-pressed={zoom===null} onClick={()=>changeZoom(null)}>{t('Fit','Pas layar')}</button>
      <button type="button" aria-label={t('Original habitat size','Ukuran asli habitat')} aria-pressed={Math.abs(scale-1)<.001} onClick={()=>changeZoom(1)}>1:1</button>
      <button type="button" aria-label={t('Zoom out','Perkecil')} disabled={scale<=fitScale+.001} onClick={()=>changeZoom(Math.max(fitScale,scale-.25))}><Minus size={15}/></button>
      <output aria-live="polite">{Math.round(scale*100)}%</output>
      <button type="button" aria-label={t('Zoom in','Perbesar')} disabled={scale>=1.5} onClick={()=>changeZoom(Math.min(1.5,scale+.25))}><Plus size={15}/></button>
    </div>
    <div ref={viewport} className={`living-viewport ${scale>fitScale+.001?'is-zoomed':''}`} tabIndex={0} role="region" aria-label={t('Burrow map; zoom in to read details','Peta sarang; perbesar untuk membaca detail')}>
    <div className="living-stage" style={{width:BURROW_CANVAS_WIDTH*scale,height:drawing.outerHeight*scale}}>
    <div className="living-world" ref={root} style={{width:BURROW_CANVAS_WIDTH,transform:`scale(${scale})`}}>
    <div className="living-surface">{FLEET_AGENTS.some(agent=>poses[agent]==='unknown')&&room(ZONES[6])}{room(ZONES[0])}</div>
    <div className="living-earth"><span className="living-roots" aria-hidden="true"/>{(['standby','review','help','sleep','sleep-two'] as const).map(id=>room(ZONES.find(zone=>zone.id===id)!))}</div>
    <EarthCutaway drawing={drawing}/>
    <div className="living-actors" role="group" aria-label={t('Fleet rabbits','Kelinci armada')}>{FLEET_AGENTS.map((agent,index)=>{
      const pose=poses[agent];return <article key={agent} ref={node=>{if(node)actors.current.set(agent,node);else actors.current.delete(agent);}} data-zone={homeFor(agent)} className={`living-actor habitat-resident peer-${agent.toLowerCase()} ${agent===ORCHESTRATOR?'is-orchestrator':'is-specialist'}`} style={{'--rabbit-delay':`${index*-.37}s`} as CSSProperties}>
        <button type="button" className="habitat-rabbit-button" aria-label={`${agent.toUpperCase()} · ${statusFor(pose)}${stale?` · ${t('last known status','status terakhir')}`:''}`} onClick={()=>onSelect(agent)}>
          <span className="living-arrived"><FleetRabbit pose={pose} miniature leader={agent===ORCHESTRATOR}/></span>
          <span className="living-walker" aria-hidden="true"><FleetRabbit pose="walking" miniature leader={agent===ORCHESTRATOR}/></span>
          <span className="habitat-nameplate"><strong>{agent.toUpperCase()}</strong><span className={`habitat-resident-status state-${pose}`}><i/>{statusFor(pose)}</span><span className="living-trip">{t('On the way','Di perjalanan')}</span></span>
        </button>
      </article>;
    })}</div>
  </div></div></div></div>;
}
