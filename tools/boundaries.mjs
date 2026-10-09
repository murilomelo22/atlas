// Split date-line crossings before rendering or point-in-polygon lookup.
const close = (ring) => ring.length && (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) ? [...ring, [...ring[0]]] : ring;
function unwrap(ring, anchor) {
  const result = [];
  for (const [x,y] of ring) {
    let lng = x;
    const previous = result.at(-1)?.[0] ?? anchor ?? x;
    while (lng - previous > 180) lng -= 360;
    while (lng - previous < -180) lng += 360;
    result.push([lng,y]);
  }
  return result;
}
function clip(ring, edge, keepRight) {
  const points = ring.slice(0, -1), output = [];
  if (!points.length) return [];
  let previous = points.at(-1);
  const inside = (p) => keepRight ? p[0] >= edge : p[0] <= edge;
  for (const current of points) {
    if (inside(previous) !== inside(current)) {
      const t = (edge - previous[0]) / (current[0] - previous[0]);
      output.push([edge,previous[1]+t*(current[1]-previous[1])]);
    }
    if (inside(current)) output.push(current);
    previous = current;
  }
  return close(output);
}
const area = (ring) => Math.abs(ring.slice(1).reduce((sum,p,i)=>sum+ring[i][0]*p[1]-p[0]*ring[i][1],0))/2;
function splitPolygon(rings) {
  let outer = unwrap(rings[0]);
  const pole = Math.abs(outer.at(-1)[0] - outer[0][0]) > 180;
  if (pole) {
    const latitude = outer[0][1] < 0 ? -90 : 90;
    outer = close([...outer,[outer.at(-1)[0],latitude],[outer[0][0],latitude]]);
  } else outer = close(outer);
  const min = Math.min(...outer.map(p=>p[0])), max = Math.max(...outer.map(p=>p[0]));
  const holes = rings.slice(1).map(r=>close(unwrap(r,(min+max)/2)));
  const result = [];
  const width = pole ? 180 : 360;
  for (let band=Math.floor((min+180)/width);band<=Math.floor((max+180)/width);band++) {
    const west=band*width-180,east=west+width;
    const cropped=clip(clip(outer,west,true),east,false);
    if(cropped.length<4 || area(cropped)<1e-10)continue;
    const shift=Math.floor((west+180)/360)*360;
    const move=r=>r.map(([x,y])=>[Math.max(-180,Math.min(180,x-shift)),y]);
    result.push([move(cropped),...holes.map(r=>clip(clip(r,west,true),east,false)).filter(r=>r.length>=4&&area(r)>1e-10).map(move)]);
  }
  return result;
}
export function normalizeBoundaries(collection) {
  return { ...collection, features:collection.features.map(feature=>{
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    const coordinates=polygons.flatMap(splitPolygon);
    return {...feature,geometry:coordinates.length===1?{type:'Polygon',coordinates:coordinates[0]}:{type:'MultiPolygon',coordinates}};
  }) };
}
