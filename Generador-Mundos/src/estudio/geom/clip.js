// Operaciones de polígonos con Clipper (enteros en centímetros): uniones, diferencias,
// desplazamientos de ejes de calle y recorte por teselas. Anillos en el formato [[x,z],...].
import ClipperLib from 'clipper-lib';

const S=100;
const {Clipper,ClipperOffset,ClipType,PolyType,PolyFillType,JoinType,EndType,PolyTree}=ClipperLib;

export const toPath=ring=>ring.map(([x,z])=>({X:Math.round(x*S),Y:Math.round(z*S)}));
export const fromPath=path=>path.map(p=>[p.X/S,p.Y/S]);
export const toPaths=rings=>rings.filter(r=>r.length>=3).map(toPath);
// El sentido de los anillos de OSM/GeoJSON no está garantizado: huecos negativos
// y contorno positivo antes de cualquier unión no-cero.
export const polygonPaths=rings=>toPaths(rings.map((r,i)=>Clipper.Orientation(toPath(r))===(i===0)?r:r.slice().reverse()));

function run(type,subject,clip,fill=PolyFillType.pftNonZero){
  const c=new Clipper(),out=[];
  if(subject.length)c.AddPaths(subject,PolyType.ptSubject,true);
  if(clip?.length)c.AddPaths(clip,PolyType.ptClip,true);
  c.Execute(type,out,fill,fill);
  return out;
}
export const union=(paths,fill)=>run(ClipType.ctUnion,paths,null,fill);
export const difference=(a,b)=>b.length?run(ClipType.ctDifference,a,b):a;
export const intersection=(a,b)=>run(ClipType.ctIntersection,a,b);

// Polígonos de un conjunto de ejes (calles) con su ancho.
export function offsetLines(lines,{join='round',end='round'}={}){
  const out=[];
  for(const {points,width}of lines){
    if(points.length<2||!(width>0))continue;
    const co=new ClipperOffset(2,.25*S),res=[];
    co.AddPath(toPath(points),join==='round'?JoinType.jtRound:JoinType.jtMiter,end==='round'?EndType.etOpenRound:end==='square'?EndType.etOpenSquare:EndType.etOpenButt);
    co.Execute(res,width/2*S);
    out.push(...res);
  }
  return out;
}

export function offset(paths,delta,join='round'){
  if(!paths.length)return [];
  const co=new ClipperOffset(2,.25*S),res=[];
  co.AddPaths(paths,join==='round'?JoinType.jtRound:join==='square'?JoinType.jtSquare:JoinType.jtMiter,EndType.etClosedPolygon);
  co.Execute(res,delta*S);
  return res;
}

// Cierre morfológico: redondea las esquinas cóncavas (bordillos de los cruces).
export const closing=(paths,r)=>offset(offset(paths,r),-r);
export const opening=(paths,r)=>offset(offset(paths,-r),r);

export function cleanPaths(paths,dist=.05){return Clipper.CleanPolygons(paths,dist*S);}

// Paths -> [{outer:[[x,z]], holes:[[[x,z]]]}] con la jerarquía correcta.
export function toExPolygons(paths){
  if(!paths.length)return [];
  const c=new Clipper(),tree=new PolyTree();
  c.AddPaths(paths,PolyType.ptSubject,true);
  c.Execute(ClipType.ctUnion,tree,PolyFillType.pftNonZero,PolyFillType.pftNonZero);
  const out=[];
  const visit=node=>{for(const child of node.Childs()){
    if(!child.IsHole()){out.push({outer:fromPath(child.Contour()),holes:child.Childs().map(h=>fromPath(h.Contour()))});
      for(const h of child.Childs())visit(h);}}};
  visit(tree);
  return out;
}

export const rectPath=(x0,z0,x1,z1)=>toPath([[x0,z0],[x1,z0],[x1,z1],[x0,z1]]);

// Reparte un conjunto de polígonos en teselas cuadradas (sectores) para drapear y agrupar.
export function tiles(paths,size,W,D){
  const out=[];
  if(!paths.length)return out;
  const boxes=paths.map(p=>{let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;for(const q of p){if(q.X<a)a=q.X;if(q.X>c)c=q.X;if(q.Y<b)b=q.Y;if(q.Y>d)d=q.Y;}return [a/S,b/S,c/S,d/S];});
  for(let z0=-D/2;z0<D/2-1e-6;z0+=size)for(let x0=-W/2;x0<W/2-1e-6;x0+=size){
    const x1=Math.min(W/2,x0+size),z1=Math.min(D/2,z0+size);
    const subset=paths.filter((p,i)=>boxes[i][0]<=x1&&boxes[i][2]>=x0&&boxes[i][1]<=z1&&boxes[i][3]>=z0);
    if(!subset.length)continue;
    const part=intersection(subset,[rectPath(x0,z0,x1,z1)]);
    if(part.length)out.push({x0,z0,x1,z1,polys:toExPolygons(part)});
  }
  return out;
}

export function pathsArea(paths){let a=0;for(const p of paths)a+=Clipper.Area(p);return a/(S*S);}
export const ringOrientation=ring=>Clipper.Orientation(toPath(ring));
