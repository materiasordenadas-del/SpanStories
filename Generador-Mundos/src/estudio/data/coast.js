// Mar a partir de las líneas de costa de OSM (natural=coastline). En OSM el mar no es un polígono: cada vía
// de costa deja la tierra a su izquierda y el agua a su derecha (con el norte arriba). Aquí se recortan al
// cuadrado del lugar, se encadenan y se cierran recorriendo el borde del cuadrado para obtener la tierra;
// el mar es el resto del cuadrado. Coordenadas locales: X este, Z sur (por eso el sentido «mapa» invierte Z).
import {polygonPaths,union,difference,rectPath,toExPolygons,pathsArea} from '../geom/clip.js';

const EPS=1e-6,ON_EDGE=.02;

// Recorte de una polilínea al rectángulo (Liang–Barsky por segmento); devuelve los tramos interiores.
export function clipPolyline(points,hw,hd){
  const pieces=[];let current=null;
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[1]-a[1];let lo=0,hi=1,visible=true;
    for(const [p,q]of [[-dx,a[0]+hw],[dx,hw-a[0]],[-dz,a[1]+hd],[dz,hd-a[1]]]){
      if(Math.abs(p)<1e-12){if(q<0){visible=false;break;}continue;}
      const r=q/p;if(p<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);if(lo>hi){visible=false;break;}
    }
    if(!visible){current=null;continue;}
    const s=[a[0]+dx*lo,a[1]+dz*lo],e=[a[0]+dx*hi,a[1]+dz*hi];
    if(current&&lo<=EPS)current.push(e);else{current=[s,e];pieces.push(current);}
    if(hi<1-EPS)current=null;
  }
  return pieces.filter(p=>p.length>=2&&p.some((q,i)=>i&&Math.hypot(q[0]-p[0][0],q[1]-p[0][1])>1e-3));
}

const same=(a,b)=>Math.abs(a[0]-b[0])<1e-4&&Math.abs(a[1]-b[1])<1e-4;
function chainPieces(pieces){
  const open=pieces.map(p=>p.slice()),out=[];
  while(open.length){
    const chain=open.shift();let grown=true;
    while(grown&&!(chain.length>2&&same(chain[0],chain.at(-1)))){
      grown=false;
      for(let i=0;i<open.length;i++){const p=open[i];
        if(same(chain.at(-1),p[0])){chain.push(...p.slice(1));open.splice(i,1);grown=true;break;}
        if(same(p.at(-1),chain[0])){chain.unshift(...p.slice(0,-1));open.splice(i,1);grown=true;break;}}
    }
    out.push(chain);
  }
  return out;
}

// Posición sobre el perímetro en sentido antihorario del mapa (norte arriba), desde la esquina SE.
function perimeter(hw,hd){
  const P=4*hd+4*hw;
  const t=([x,z])=>{
    if(Math.abs(x-hw)<=ON_EDGE&&z>-hd+ON_EDGE)return hd-z;            // borde este, hacia el norte
    if(Math.abs(z+hd)<=ON_EDGE&&x>-hw+ON_EDGE)return 2*hd+(hw-x);      // borde norte, hacia el oeste
    if(Math.abs(x+hw)<=ON_EDGE&&z<hd-ON_EDGE)return 2*hd+2*hw+(z+hd);  // borde oeste, hacia el sur
    if(Math.abs(z-hd)<=ON_EDGE)return (4*hd+2*hw+(x+hw))%P;            // borde sur, hacia el este
    return null;
  };
  const corners=[[2*hd,[hw,-hd]],[2*hd+2*hw,[-hw,-hd]],[4*hd+2*hw,[-hw,hd]],[P,[hw,hd]]];
  return {P,t,corners};
}
// Área con signo en el sentido del mapa (Y = −Z): positiva = antihoraria = tierra a la izquierda dentro.
const mapArea=r=>{let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=r[j][0]*-r[i][1]-r[i][0]*-r[j][1];return s/2;};

export function buildSea(lines,width,depth){
  const hw=width/2,hd=depth/2;
  const pieces=lines.flatMap(points=>clipPolyline(points,hw,hd));
  if(!pieces.length)return {status:'sin-costa',polygons:[],area:0};
  const chains=chainPieces(pieces),{P,t,corners}=perimeter(hw,hd);
  const loops=[],open=[];
  for(const c of chains){
    if(c.length>3&&same(c[0],c.at(-1))){loops.push(c.slice(0,-1));continue;}
    const t0=t(c[0]),t1=t(c.at(-1));
    // Una costa que termina dentro del cuadrado indica datos incompletos: no se inunda la ciudad por suposición.
    if(t0==null||t1==null)return {status:'incompleta',polygons:[],area:0,warning:'Línea de costa incompleta dentro del lugar: no se dibuja el mar para no inventar su forma.'};
    open.push({points:c,t0,t1,used:false});
  }
  const land=[];
  for(const first of open){
    if(first.used)continue;
    const ring=[];let cur=first,guard=0;
    while(guard++<open.length+2){
      cur.used=true;ring.push(...cur.points);
      // Siguiente entrada a lo largo del borde, con la tierra a la izquierda (sentido antihorario del mapa).
      let best=null,gap=Infinity;
      for(const o of open){if(o.used&&o!==first)continue;let d=((o.t0-cur.t1)%P+P)%P;if(o===cur&&d<1e-6)d=P;if(d<gap){gap=d;best=o;}}
      // Esquinas del cuadrado entre la salida y la siguiente entrada, en orden de recorrido.
      ring.push(...corners.map(([ct,p])=>[((ct-cur.t1)%P+P)%P,p]).filter(([d])=>d>1e-6&&d<gap-1e-6).sort((a,b)=>a[0]-b[0]).map(([,p])=>p));
      if(best===first||!best)break;
      cur=best;
    }
    land.push(ring);
  }
  const islands=loops.filter(r=>mapArea(r)>0),lagoons=loops.filter(r=>mapArea(r)<0);
  const square=[rectPath(-hw,-hd,hw,hd)];
  let landPaths;
  if(open.length)landPaths=union([...land,...islands].flatMap(r=>polygonPaths([r])));
  else if(islands.length)landPaths=union(islands.flatMap(r=>polygonPaths([r])));
  else landPaths=square;
  if(lagoons.length)landPaths=difference(landPaths,union(lagoons.flatMap(r=>polygonPaths([r]))));
  const sea=difference(square,landPaths),area=pathsArea(sea);
  if(area<1)return {status:'sin-mar',polygons:[],area:0};
  return {status:'ok',polygons:toExPolygons(sea).map(p=>[p.outer,...p.holes]),area,chains:open.length,islands:islands.length,lagoons:lagoons.length};
}
