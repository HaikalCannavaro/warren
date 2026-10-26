export interface HabitatAnchor { x: number; y: number; }

/** One connected network, with symmetric branches below an elevated orchestrator. */
export function habitatTunnelPath(anchors: HabitatAnchor[]): string {
  const points = anchors.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map(point => ({x:Math.round(point.x),y:Math.round(point.y)})).sort((a,b)=>a.y-b.y||a.x-b.x);
  if (points.length < 2) return '';
  const rows: {y:number;points:HabitatAnchor[]}[] = [];
  for (const point of points) {
    const row = rows.find(item=>Math.abs(item.y-point.y)<=2);
    if (row) row.points.push(point); else rows.push({y:point.y,points:[point]});
  }
  rows.forEach(row=>row.points.sort((a,b)=>a.x-b.x));
  if (rows[0].points.length===1 && rows.length>1 && rows[1].points.length>1) {
    const leader=rows[0].points[0];const children=rows.slice(1);const first=children[0].points;
    const lastY=children[children.length-1].y;const center=leader.x;
    if (first.length===2) {
      // Mobile: a single shaft leaves Leveret and stays between both label
      // columns. Each lower level branches horizontally into its dens.
      return `M${center} ${leader.y}V${lastY}`+
        children.map(row=>`M${Math.min(center,row.points[0].x)} ${row.y}H${Math.max(center,row.points[row.points.length-1].x)}`).join('');
    }
    // Wide layout: mirrored shafts run through the two central column gutters.
    const middle=Math.floor(first.length/2);
    const left=Math.round((first[middle-1].x+first[middle].x)/2);
    const right=Math.round(2*center-left);
    return `M${left} ${lastY}V${leader.y}H${right}V${lastY}`+
      children.map(row=>`M${Math.min(left,row.points[0].x)} ${row.y}H${Math.max(right,row.points[row.points.length-1].x)}`).join('');
  }
  const first = (rows.find(row=>row.points.length>1) ?? rows[0]).points;
  const middle = Math.floor(first.length/2);
  const spine = first.length === 1 ? first[0].x : Math.round((first[Math.max(0,middle-1)].x+first[middle].x)/2);
  const vertical = rows.length > 1 ? `M${spine} ${rows[0].y}V${rows[rows.length-1].y}` : '';
  return vertical + rows.map(row=>`M${Math.min(spine,row.points[0].x)} ${row.y}H${Math.max(spine,row.points[row.points.length-1].x)}`).join('');
}
