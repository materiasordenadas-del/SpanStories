// Relleno de manzanas: donde OSM no tiene edificios, frentes continuos de parcelas generadas a lo largo
// de las calles. Se apoya en una rejilla de ocupación (calles + aceras, edificios, áreas, líneas) para no
// invadir nada registrado. Cada parcela recibe un id estable derivado de su calle, lado y estación.
import {interpretBuilding} from './place-model.js';
import {rng,range} from './rng.js';
import {appearancePolicy} from './appearance-policy.js';
import {polygonPaths,intersection,pathsArea} from '../geom/clip.js';

const CELL=.5;
// Calles que tienen fachadas a los lados (las autopistas, servicios y sendas no).
const FRONTAGE={primary:2.6,secondary:2.4,tertiary:2.2,unclassified:1.8,residential:1.8,road:1.8,living_street:1.2,pedestrian:.6};
const LOTS={
  'historico-latam':{w:[8,15],d:[13,20],gate:2},
  latam:{w:[6,11],d:[10,16],gate:3},
  historico:{w:[6,11],d:[10,15],gate:3},
  general:{w:[7,13],d:[10,15],gate:4},
};
export const INFILL_LIMIT=3000;
const COVERED=.75;

export function buildInfill(model,{seed=model.seed,debug=false}={}){
  if(model.kind!=='real')return {buildings:[],stats:{lots:0}};
  const t0=performance.now();
  const W=model.size.width,D=model.size.depth,nx=Math.ceil(W/CELL),nz=Math.ceil(D/CELL);
  const grid=new Uint8Array(nx*nz);
  const ix=x=>Math.floor((x+W/2)/CELL),iz=z=>Math.floor((z+D/2)/CELL);
  const at=(x,z)=>{const i=ix(x),j=iz(z);return i<0||j<0||i>=nx||j>=nz?1:grid[j*nx+i];};
  // 1 = edificio o parcela, 2 = calle/acera/línea, 3 = área abierta (parque, plaza, agua…).
  let kind=1;
  const mark=(i,j)=>{if(i>=0&&j>=0&&i<nx&&j<nz&&!grid[j*nx+i])grid[j*nx+i]=kind;};
  const center=(i,j)=>[(i+.5)*CELL-W/2,(j+.5)*CELL-D/2];
  const fillCapsule=(a,b,rad)=>{
    for(let i=Math.max(0,ix(Math.min(a[0],b[0])-rad));i<=Math.min(nx-1,ix(Math.max(a[0],b[0])+rad));i++)for(let j=Math.max(0,iz(Math.min(a[1],b[1])-rad));j<=Math.min(nz-1,iz(Math.max(a[1],b[1])+rad));j++){
      const [x,z]=center(i,j);if(segDist(x,z,a,b)<rad)mark(i,j);}
  };
  // Relleno por barrido (par-impar: los patios quedan libres) y borde engrosado con cápsulas.
  const fillPoly=(rings,grow=0)=>{
    let z0=Infinity,z1=-Infinity;for(const p of rings[0]){z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]);}
    for(let j=Math.max(0,iz(z0));j<=Math.min(nz-1,iz(z1));j++){
      const z=center(0,j)[1],xs=[];
      for(const ring of rings)for(let k=0,m=ring.length-1;k<ring.length;m=k++){const a=ring[k],b=ring[m];if((a[1]>z)!==(b[1]>z))xs.push(a[0]+(z-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
      xs.sort((a,b)=>a-b);
      for(let q=0;q+1<xs.length;q+=2)for(let i=Math.max(0,Math.ceil((xs[q]+W/2)/CELL-.5));i<=Math.min(nx-1,Math.floor((xs[q+1]+W/2)/CELL-.5));i++)mark(i,j);
    }
    if(grow>0)for(const ring of rings)for(let k=0;k<ring.length;k++)fillCapsule(ring[k],ring[(k+1)%ring.length],grow);
  };

  const ctx=model.context?.profile??'general',L=LOTS[ctx]??LOTS.general;
  const sidewalk=r=>(FRONTAGE[r.cls]??.8)*(ctx==='historico-latam'?.75:1);
  const occupied=[];
  const remember=rings=>{const xs=rings[0].map(p=>p[0]),zs=rings[0].map(p=>p[1]);occupied.push({bbox:[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)],paths:polygonPaths(rings)});};
  for(const b of [...model.buildings,...(model.outlines??[])])remember(b.rings);
  const overlaps=ring=>{const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]),box=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)],paths=polygonPaths([ring]);
    return occupied.some(o=>o.bbox[0]<box[2]&&o.bbox[2]>box[0]&&o.bbox[1]<box[3]&&o.bbox[3]>box[1]&&pathsArea(intersection(paths,o.paths))>.0001);
  };
  // Ocupación: todo lo registrado bloquea; la parcela solo puede nacer en suelo libre.
  for(const b of model.buildings)fillPoly(b.rings,.25);
  for(const o of model.outlines??[])fillPoly(o.rings,.25);
  kind=3;for(const a of model.areas??[])fillPoly(a.rings);
  kind=2;
  const surfaceRoads=model.roads.filter(r=>!r.tunnel&&(r.layer??0)>=0);
  for(const r of surfaceRoads)for(let i=1;i<r.points.length;i++)fillCapsule(r.points[i-1],r.points[i],r.width/2+(FRONTAGE[r.cls]?sidewalk(r)-.3:.5));
  for(const l of model.lines??[])for(let i=1;i<l.points.length;i++)fillCapsule(l.points[i-1],l.points[i],l.kind==='barrier'?.6:Math.max(3,(l.width??0)/2+2));
  kind=3;for(const p of model.points??[])if(['tree','fountain','statue'].includes(p.kind))fillCapsule([p.x,p.z],[p.x,p.z],2);
  kind=1;
  // Solo donde ya hay ciudad: edificios registrados cerca de la parcela.
  const cells=new Map(),cc=40;
  for(const b of model.buildings){const k=Math.floor(b.bbox[0]/cc)+':'+Math.floor(b.bbox[1]/cc);cells.set(k,(cells.get(k)??0)+1);}
  const urban=(x,z)=>{let n=0;const i0=Math.floor(x/cc),j0=Math.floor(z/cc);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)n+=cells.get((i0+i)+':'+(j0+j))??0;return n>=L.gate;};
  // Cobertura de fachadas: muestras justo detrás de la acera de cada calle con frente. Donde OSM ya
  // dibuja casi todo el frente (Madrid, Barcelona…), un hueco es real (pasaje, solar, plaza) y se respeta.
  const cover=new Map(),cov=k=>cover.get(k)??cover.set(k,[0,0]).get(k);
  for(const r of surfaceRoads){if(FRONTAGE[r.cls]==null)continue;const off=r.width/2+sidewalk(r)+1;
    for(let i=1;i<r.points.length;i++){const a=r.points[i-1],b=r.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<1)continue;const d=[(b[0]-a[0])/len,(b[1]-a[1])/len];
      for(let t=1;t<len;t+=2)for(const sd of [1,-1]){const x=a[0]+d[0]*t-d[1]*sd*off,z=a[1]+d[1]*t+d[0]*sd*off;if(Math.abs(x)>W/2-2||Math.abs(z)>D/2-2)continue;
        // Primer obstáculo en 8 m tras la acera: edificio = frente cubierto; nada = frente vacío; calle/área = no cuenta.
        let g=0;for(let v=0;v<8&&!g;v+=.5)g=at(x-d[1]*sd*v,z+d[0]*sd*v);if(g>1)continue;cov(Math.floor(x/cc)+':'+Math.floor(z/cc))[g]++;}}}
  const coverage=(x,z)=>{let f=0,bt=0;const i0=Math.floor(x/cc),j0=Math.floor(z/cc);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const c=cover.get((i0+i)+':'+(j0+j));if(c){f+=c[0];bt+=c[1];}}return bt/(bt+f||1);};
  let built=0,open=0;for(const [f,b]of cover.values()){open+=f;built+=b;}
  // Parcela libre: muestreo interior (los vecinos pueden tocarse sin solaparse).
  const free=(A,d,n,w,d0,d1)=>{
    for(let v=d0+.3;v<=d1-.3;v+=.5)for(let u=.3;u<=w-.3;u+=.5){const x=A[0]+d[0]*u+n[0]*v,z=A[1]+d[1]*u+n[1]*v;if(Math.abs(x)>W/2-1.5||Math.abs(z)>D/2-1.5||at(x,z))return false;}
    return true;
  };
  const backKind=(A,d,n,w,dd,reach)=>{let worst=0;for(let u=.5;u<w;u+=1){for(let v=dd+.25;v<dd+reach;v+=.5){const x=A[0]+d[0]*u+n[0]*v,z=A[1]+d[1]*u+n[1]*v,i=ix(x),j=iz(z);const k=i<0||j<0||i>=nx||j>=nz?0:grid[j*nx+i];if(k){worst=Math.max(worst,k);break;}}}return worst;};
  const roads=surfaceRoads.filter(r=>FRONTAGE[r.cls]!=null&&!r.bridge).sort((a,b)=>(FRONTAGE[b.cls]-FRONTAGE[a.cls])||String(a.id).localeCompare(String(b.id)));
  const out=[],used=new Set(),rejected={urban:0,occupied:0,strip:0,covered:0};
  for(const road of roads)for(const side of [1,-1]){
    const r=rng(seed+':relleno:'+road.id+':'+side);
    const off=road.width/2+sidewalk(road)+.05;
    let station=0;
    for(let s=1;s<road.points.length;s++){
      const a=road.points[s-1],b=road.points[s],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(len<4){station+=len;continue;}
      const d=[(b[0]-a[0])/len,(b[1]-a[1])/len],n=[-d[1]*side,d[0]*side];
      let t=0;
      while(t<len-3.5&&out.length<INFILL_LIMIT){
        const want=range(r,...L.w),depth=range(r,...L.d);
        let placed=false;
        for(const w0 of [want,want*.6,4.5]){
          const w=Math.min(w0,len-t);if(w<3.5)break;
          const A=[a[0]+d[0]*t+n[0]*off,a[1]+d[1]*t+n[1]*off];
          if(!urban(A[0]+n[0]*5,A[1]+n[1]*5)){rejected.urban++;continue;}
          if(coverage(A[0],A[1])>=COVERED){rejected.covered++;break;}
          if(!free(A,d,n,w,0,6)){rejected.occupied++;continue;}
          let dd=6;while(dd<depth&&free(A,d,n,w,dd,Math.min(depth,dd+2)))dd=Math.min(depth,dd+2);
          // Un frente real se apoya en otra edificación o en el interior de manzana: si el fondo topa con
          // calle, sendero o espacio abierto (también a pocos metros tras el fondo), o tiene un parque/plaza justo detrás, es una franja de plaza o de acera ancha.
          if(backKind(A,d,n,w,dd,dd<depth?2.5:7)>1||backKind(A,d,n,w,dd,20)===3){rejected.strip++;break;}
          const B=[A[0]+d[0]*w,A[1]+d[1]*w],C=[B[0]+n[0]*dd,B[1]+n[1]*dd],E=[A[0]+n[0]*dd,A[1]+n[1]*dd];
          const ring=[A,B,C,E];
          if(overlaps(ring)){rejected.occupied++;continue;}
          let id=`gen:relleno:${road.id}:${side>0?'i':'d'}:${Math.round(station+t)}`;for(let k=2;used.has(id);k++)id=`gen:relleno:${road.id}:${side>0?'i':'d'}:${Math.round(station+t)}-${k}`;
          used.add(id);
          const bld=interpretBuilding({id,osmId:null},[ring],{building:'yes'});
          if(bld){Object.assign(bld,{inferred:true,origin:'relleno',sourceRef:'inferido:relleno',tags:{building:'yes'},heightSource:'estimado'});bld.appearance=appearancePolicy(bld);out.push(bld);remember([ring]);}
          fillPoly([ring]);
          t+=w;placed=true;break;
        }
        if(!placed)t+=1.5;
      }
      station+=len;
    }
  }
  return {buildings:out,...(debug?{grid,nx,nz}:{}),stats:{lots:out.length,ms:Math.round(performance.now()-t0),profile:ctx,frontageCoverage:Math.round(built/(built+open||1)*100)/100,rejected}};
}

function segDist(x,z,a,b){const dx=b[0]-a[0],dz=b[1]-a[1],L2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/L2));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);}
