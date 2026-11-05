// Disposición determinista del paisaje que comparten el suelo y los objetos 3D:
// cementerios (calles interiores, cuadros de tumbas, muros de nichos), humedales (charcas) y puertos.
// Datos puros: no inventa lo que OSM registra (tumbas o caminos mapeados mandan); rellena lo que falta.
import {polygonPaths,intersection,difference,union,offset,offsetLines,toExPolygons,rectPath,pathsArea} from '../geom/clip.js';
import {rng,range} from './rng.js';

const cache=new WeakMap();
const inRing=(x,z,ring)=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;};
export const insideRings=(x,z,rings)=>inRing(x,z,rings[0])&&!rings.slice(1).some(r=>inRing(x,z,r));
export const insideEx=(x,z,ex)=>ex.some(p=>inRing(x,z,p.outer)&&!p.holes.some(h=>inRing(x,z,h)));

// Eje principal: arista más larga del contorno exterior.
function mainAxis(ring){let best=0,ang=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l>best){best=l;ang=Math.atan2(b[1]-a[1],b[0]-a[0]);}}return ang;}
const rot=(p,c,s)=>[p[0]*c-p[1]*s,p[0]*s+p[1]*c];

export function landscapeLayout(model){
  if(cache.has(model))return cache.get(model);
  const seed=model.seed??'atlas',out={cemeteries:[],wetlands:[]};
  const W=model.size?.width??0,D=model.size?.depth??0,square=[rectPath(-W/2,-D/2,W/2,D/2)];
  const buildings=union((model.buildings??[]).flatMap(b=>polygonPaths(b.rings)));
  const roads=union(offsetLines((model.roads??[]).filter(r=>!r.tunnel&&!r.bridge).map(r=>({points:r.points,width:r.width+.6}))));
  for(const a of (model.areas??[]).filter(a=>a.kind==='cemetery')){
    const r=rng(seed+':cementerio:'+a.id),ang=mainAxis(a.rings[0]),c=Math.cos(ang),s=Math.sin(ang);
    const own=intersection(polygonPaths(a.rings),square);if(!own.length)continue;
    // Rejilla local alineada con el eje: calles principales cada ~22 m y secundarias cada ~11 m.
    const local=a.rings[0].map(p=>rot(p,c,-s)),xs=local.map(p=>p[0]),zs=local.map(p=>p[1]);
    const box=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)],paths=[];
    const main=range(r,20,24),minor=main/2;
    const line=(u0,v0,u1,v1,w)=>paths.push({points:[rot([u0,v0],c,s),rot([u1,v1],c,s)],width:w});
    for(let u=box[0]+main/2;u<box[2];u+=minor)line(u,box[1]-2,u,box[3]+2,Math.abs(((u-box[0]-main/2)/minor)%2)<.01?3.2:1.8);
    for(let v=box[1]+main/2;v<box[3];v+=main)line(box[0]-2,v,box[2]+2,v,3.2);
    const walkways=intersection(union(offsetLines(paths,{end:'butt'})),own);
    // Muro de nichos (España): banda perimetral interior de 1 m.
    const spanish=(model.bounds?.country?.code??null)==='ES'||(!model.bounds?.country&&(model.bounds?.centerLon??-3.7)>-10);
    const niches=spanish&&a.area>1500?difference(own,offset(own,-1.1,'miter')):[];
    const free=difference(difference(difference(own,offset(buildings,1.2)),union(walkways.concat(niches))),roads);
    out.cemeteries.push({id:a.id,angle:ang,paths:walkways,niches,free,area:pathsArea(own),spanish,pathLines:paths,latino:!spanish});
  }
  for(const a of (model.areas??[]).filter(a=>a.kind==='wetland')){
    const r=rng(seed+':humedal:'+a.id),own=intersection(polygonPaths(a.rings),square);if(!own.length)continue;
    const xs=a.rings[0].map(p=>p[0]),zs=a.rings[0].map(p=>p[1]),box=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)];
    // Charcas: manchas irregulares que ocupan ~25 % (no en manglares, que son agua somera con raíces).
    const ponds=[],target=a.area*(a.tags?.wetland==='mangrove'?.12:.25);let made=0;
    for(let t=0;t<60&&made<target;t++){const x=range(r,box[0],box[2]),z=range(r,box[1],box[3]);if(!insideRings(x,z,a.rings))continue;
      const R=range(r,3,Math.min(14,Math.sqrt(a.area)/4)),n=9,ring=Array.from({length:n},(_,i)=>{const q=i/n*Math.PI*2,k=R*(.7+.5*r());return [x+Math.cos(q)*k,z+Math.sin(q)*k*(.6+.5*r())];});
      ponds.push(ring);made+=Math.PI*R*R*.8;}
    const water=intersection(difference(union(ponds.flatMap(p=>polygonPaths([p]))),buildings),own);
    out.wetlands.push({id:a.id,water,mangrove:a.tags?.wetland==='mangrove'||a.tags?.wetland==='swamp',area:a.area,rings:a.rings});
  }
  cache.set(model,out);return out;
}
