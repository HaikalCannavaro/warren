import type { FleetState } from '../lib/observer';

export type RabbitPose = FleetState['state'] | 'unknown' | 'walking';

const PALETTE: Record<string, string> = {
  o: 'var(--rabbit-outline)', f: 'var(--rabbit-fur)', l: 'var(--rabbit-light)', s: 'var(--rabbit-shade)',
  p: '#D99896', d: '#3D3944', w: '#FFF9F2', a: 'var(--agent-color)', c: '#F2765E', r: '#C45946', g: '#718F64',
};

// One character is one source pixel. Runs are merged into paths once at module load.
function sprite(rows: string[]) {
  const paths: Record<string, string> = {};
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const color = row[x]; let end = x + 1;
      while (end < row.length && row[end] === color) end++;
      if (PALETTE[color]) paths[color] = (paths[color] ?? '') + `M${x} ${y}h${end-x}v1h-${end-x}Z`;
      x = end;
    }
  });
  return Object.entries(paths);
}
type PixelSprite = ReturnType<typeof sprite>;
function Pixels({ art, x = 0, y = 0 }: { art: PixelSprite; x?: number; y?: number }) {
  return <g transform={`translate(${x} ${y})`}>{art.map(([color, d]) => <path key={color} d={d} fill={PALETTE[color]}/>)}</g>;
}
const HEAD = sprite([
  '     oooooooooo     ',
  '   oolllllllllloo   ',
  '  ollllllllllllffo  ',
  ' olllllllllllllfffo ',
  'ollllllllllllllffffo',
  'ollllllllllllllffffo',
  'olllllllllllllfffffo',
  'ollllllllllllffffffo',
  'olllllllllllffffffso',
  ' olllllllllffffffso ',
  '  ollllllllllfffso  ',
  '   oollllllllfsso   ',
  '     oooooooooss    ',
]);
const BODY = sprite([
  '        oooooooo       ',
  '      oollllllffoo     ',
  '     ollllllllffffo    ',
  '    olllllllllfffffo   ',
  '   ollllllllllfffffso  ',
  '   ollllllllllfffffso  ',
  '  olllllllllllfffffsso ',
  '  ollllllllllffffffsso ',
  '  olllllllllfffffffssso ',
  '  olllllllllfffffffssso ',
  '   ollllllllffffffssso  ',
  '    oollllllffffsssoo   ',
  '     oooooooooooooo    ',
]);
const SLEEP_BODY = sprite([
  '           ooooooooooo      ',
  '        ooollllllllllfoo    ',
  '      oolllllllllllllfffoo  ',
  '     olllllllllllllllfffffo ',
  '    olllllllllllllllffffffo ',
  '   olllllllllllllllfffffffo ',
  '   ollllllllllllllfffffffso ',
  '   ollllllllllllffffffffsso ',
  '   ollllllllllfffffffffssso ',
  '    olllllllffffffffffssso  ',
  '     ooolllffffffffssssoo   ',
  '        ooooooooooooooo     ',
]);
const SLEEP_HEAD = sprite([
  '   oooooooooo   ',
  ' oolllllllllfoo ',
  'ollllllllllffffo',
  'olllllllllfffffo',
  'ollllollolllllfo',
  'olllloddolllllfo',
  'ollllllllllllffo',
  'ollplllllllfffo ',
  ' ollllllffffso  ',
  '  oooooooooo    ',
]);
const CARROT = sprite([
  '   g g   ',
  '  gggg   ',
  '   gg    ',
  '  occo   ',
  '  occro  ',
  '  occro  ',
  '  orcro  ',
  '  occro  ',
  '  ocro   ',
  '   oo    ',
]);
const Z = sprite(['aaaaa','   aa','  aa ',' aa  ','aaaaa']);

/** Crisp, grid-drawn sprites: no gradients, smoothing, filters or raster assets. */
export function FleetRabbit({ pose, miniature = false, leader = false }: { pose: RabbitPose; miniature?: boolean; leader?: boolean }) {
  const sleeping = pose === 'idle';
  return <svg className={`fleet-rabbit pose-${pose} ${miniature ? 'is-miniature' : ''}`} viewBox="0 0 56 48" width="168" height="144" fill="none" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
    {!miniature && <g className="rabbit-den">
      <path d="M8 35V18h2v-5h3v-3h5V8h20v2h5v3h3v5h2v17Z" fill="var(--habitat-arch)"/>
      <path d="M12 35V19h2v-4h5v-3h18v3h5v4h2v16Z" fill="var(--habitat-tunnel)"/>
      <path d="M10 18v-4h4v-3h5V9h18v2h5v3h3v4h-2v-3h-6v-3H19v3h-5v3Z" fill="var(--habitat-edge)"/>
      <path d="M11 20h2v6h-2zm-2 8h3v7H9zm33-8h3v5h-3zm2 8h3v7h-3zM20 9h2v3h-2zm13 0h2v3h-2z" fill="var(--habitat-shelf)"/>
      <path d="M5 39h46v4h-3v2H8v-2H5Z" fill="var(--habitat-shadow)" opacity=".35"/>
      <path d="M5 37h46v5h-3v2H8v-2H5Z" fill="var(--habitat-shelf)"/>
      <path d="M8 35h40v2h3v3H5v-3h3Z" fill="var(--habitat-floor)"/>
      <path d="M8 35h40v1H8zM5 37h4v2H5zm42 0h4v2h-4z" fill="var(--habitat-grass)"/>
      <path d="M9 41h6v1H9zm13 2h4v1h-4zm17-2h7v1h-7z" fill="var(--habitat-edge)"/>
    </g>}
    <path className="rabbit-ground-shadow" d={sleeping ? 'M13 38h30v3H13Z' : 'M17 38h23v3H17Z'} fill="var(--habitat-shadow)" opacity=".4"/>
    {sleeping ? <g className="rabbit-sleep">
      <g className="rabbit-breathe"><Pixels art={SLEEP_BODY} x={17} y={25}/></g>
      <path d="M44 30h4v1h2v4h-2v1h-4v-1h-1v-4h1Z" fill="var(--rabbit-light)"/>
      <g className="rabbit-sleep-head">
        <path d="M11 25H6v-2H4v-3h6v1h5v2h3v5h-7Z" fill="var(--rabbit-outline)"/>
        <path d="M7 21h3v1h4v2h3v2h-6v-2H7Z" fill="var(--rabbit-fur)"/>
        <path d="M11 23h5v2h-5Z" fill="#D99896"/>
        <path d="M17 27v-8h-2v-2h-4v5h1v4h2v3Z" fill="var(--rabbit-outline)"/>
        <path d="M12 18h2v3h2v5h-2v-4h-2Z" fill="var(--rabbit-light)"/>
        <Pixels art={SLEEP_HEAD} x={9} y={28}/>
        <path d="M20 38h5v2h-6v-1h1Z" fill="var(--rabbit-light)"/>
        <path d="M27 25h7v2h-7v1h-2v-2h2Z" fill="var(--agent-color)"/>
      </g>
      <g className="rabbit-zzz"><Pixels art={Z} x={37} y={22}/><Pixels art={Z} x={43} y={14}/><Pixels art={Z} x={47} y={6}/></g>
    </g> : <g className="rabbit-awake">
      <path d="M37 30h4v1h2v5h-2v1h-4v-2h-1v-3h1Z" fill="var(--rabbit-shade)"/>
      <path d="M38 31h3v1h1v3h-4Z" fill="var(--rabbit-light)"/>
      <Pixels art={BODY} x={15} y={25}/>
      <g className="rabbit-foot-front"><path d="M18 38h8v1h1v2H16v-2h2Z" fill="var(--rabbit-outline)"/><path d="M18 38h6v2h-7v-1h1Z" fill="var(--rabbit-light)"/></g>
      <g className="rabbit-foot-back"><path d="M31 38h7v1h2v2H29v-2h2Z" fill="var(--rabbit-outline)"/><path d="M31 38h6v1h2v1H30v-1h1Z" fill="var(--rabbit-light)"/></g>
      <path d="M22 27h13v2h-4v2h-4v-2h-5Z" fill="var(--agent-color)"/><path d="M32 29h3v5h-2v-3h-1Z" fill="var(--agent-color)"/>
      <g className="rabbit-head">
        <g className="rabbit-ear rabbit-ear-back"><path d="M31 17V4h1V2h4v2h1v12h-2v3Z" fill="var(--rabbit-outline)"/><path d="M32 4h4v11h-2v2h-2Z" fill="var(--rabbit-fur)"/><path d="M33 5h2v9h-2Z" fill="#D99896"/></g>
        <g className="rabbit-ear rabbit-ear-front"><path d="M20 18V5h-1V2h1V1h4v2h1v14h-2v2Z" fill="var(--rabbit-outline)"/><path d="M20 3h3v2h1v11h-3V5h-1Z" fill="var(--rabbit-light)"/><path d="M21 5h2v10h-2Z" fill="#D99896"/></g>
        <Pixels art={HEAD} x={17} y={15}/>
        <g className="rabbit-eyes" fill="#3D3944"><path d="M22 21h2v3h-2Zm10 0h2v3h-2Z"/><path d="M22 21h1v1h-1Zm10 0h1v1h-1Z" fill="#FFF9F2"/></g>
        <path d="M20 25h3v1h-3Zm14 0h2v1h-2Z" fill="#D99896"/>
        <path d="M27 24h3v1h-1v1h-1v-1h-1Z" fill="#B97D83"/>
        <path className="rabbit-mouth" d="M28 26h1v1h1v1h-2v-1h-1v-1Z" fill="#82716D"/>
        {leader && <path d="M25 10h2v2h2v-3h2v3h2v-2h2v6H25Z" fill="#E5C780"/>}
      </g>
      {pose === 'working' && <g className="rabbit-carrot"><Pixels art={CARROT} x={26} y={27}/><path d="M24 33h4v3h-4Zm10-1h3v3h-3Z" fill="var(--rabbit-light)"/></g>}
      {pose === 'review' && <g className="rabbit-review"><path d="M22 31h13v10H22Z" fill="var(--rabbit-outline)"/><path d="M23 32h11v8H23Z" fill="#E9D5AD"/><path d="M25 33h7v1h-7Zm0 3h6v1h-6Z" fill="#9B8563"/><path d="M21 34h3v3h-3Zm13-1h3v3h-3Z" fill="var(--rabbit-light)"/></g>}
      {pose === 'queued' && <g className="rabbit-queue"><path d="M39 26h10v2h-1v3h-2v2h2v3h1v2H39v-2h1v-3h2v-2h-2v-3h-1Z" fill="var(--rabbit-outline)"/><path d="M40 26h8v2h-8Zm0 10h8v2h-8Z" fill="#8EB8D0"/><path d="M42 28h4v2h-1v4h-2v-4h-1Zm0 6h4v2h-4Z" fill="#E9D5AD"/></g>}
      {pose === 'blocked' && <g className="rabbit-blocked"><path d="M43 27h2v14h-2Z" fill="var(--habitat-edge)"/><path d="M40 20h8v1h1v8h-1v1h-8v-1h-1v-8h1Z" fill="#A34236"/><path d="M43 22h2v4h-2Zm0 5h2v1h-2Z" fill="#FFF9F2"/></g>}
      {pose === 'unknown' && <g><path d="M43 16h9v10h-9Z" fill="var(--habitat-arch)"/><path d="M45 18h5v3h-2v2h-1v-3h2v-1h-4Zm2 6h1v1h-1Z" fill="var(--rabbit-light)"/></g>}
    </g>}
    {!miniature && <g className="rabbit-den-plants"><path d="M8 37v-6H6v-3H5v6h1v3Zm40 0v-7h1v-2h2v3h-1v6Z" fill="var(--habitat-grass)"/><path d="M48 28h2v2h-2Z" fill="var(--agent-color)"/></g>}
  </svg>;
}
