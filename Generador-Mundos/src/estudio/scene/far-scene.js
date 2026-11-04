// Entorno lejano: la ciudad que rodea la zona detallada (OpenFreeMap) sobre relieve público.
// Masas simples con ventanas dibujadas por el sombreador (superficie FARWIN), calles principales,
// parques y agua. Sin sombras propias; la bruma de la composición lo funde con el cielo.
import * as THREE from 'three';
import {MeshBuilder,SURF,shade,ringSignedArea} from '../geom/mesh.js';
import {offsetLines,union,difference,intersection,rectPath,toExPolygons,polygonPaths,pathsArea} from '../geom/clip.js';
import {GROUND,FACADE,ROOF} from '../geom/palette.js';
import {Terrain} from '../data/terrain.js';
import {fetchFarCity} from '../data/region.js';
import {hashString} from '../data/rng.js';
import {regionOf} from '../arq/styles.js';
import {createGMaterial} from '../render/gmaterial.js';

export const FARWIN=20;
const ROAD_W={motorway:22,trunk:18,primary:14,secondary:11,tertiary:9,minor:6.5,service:4,rail:5};

async function fetchRelief(lat,lon,side){
  const r=await fetch(`/api/estudio/relieve?lat=${lat}&lon=${lon}&lado=${side}`);const d=await r.json();if(!r.ok)throw Error(d.error);return d;
}

export async function buildFarScene(model,{radius=2000,sun,flat=false,sourceData=null}={}){
  const t0=performance.now();
  const b=model.bounds,{width:W,depth:D}=model.size,inner=Math.max(W,D)/2;
  const [far,dem]=sourceData?[sourceData.city,sourceData.dem]:await Promise.all([
    fetchFarCity({lat:b.centerLat,lon:b.centerLon,radius,inner}),
    flat?null:fetchRelief(b.centerLat,b.centerLon,radius*2+400).catch(()=>null),
  ]);
  const T=dem?new Terrain({width:dem.width,depth:dem.depth,resolution:dem.resolution,heights:dem.heights,origin:model.terrain.origin}):Terrain.flat(radius*2,radius*2);
  const near=model.terrain;
  // Altura combinada: dentro (y en una franja de transición) manda el relieve detallado.
  const H=(x,z)=>{const d=Math.max(Math.abs(x)/(W/2),Math.abs(z)/(D/2));if(d<=1)return near.height(x,z);const t=Math.min(1,(d-1)*inner/150);return near.height(x,z)*(1-t)+T.height(x,z)*t;};
  const region=regionOf(b);
  const R=radius;
  const ring=[rectPath(-R,-R,R,R)],hole=[rectPath(-W/2,-D/2,W/2,D/2)];
  const outer=difference(ring,hole);
  const mbGround=new MeshBuilder(),mbBld=new MeshBuilder();
  // Suelo urbano de fondo con huecos de agua y verde
  const water=intersection(union(far.water.flatMap(p=>polygonPaths([p.outer,...(p.holes??[])]))),outer);
  const green=difference(intersection(union(far.green.flatMap(p=>polygonPaths([p.outer,...(p.holes??[])]))),outer),water);
  const roads=intersection(union(offsetLines(far.roads.filter(r=>r.cls!=='rail'&&!r.brunnel?.includes('tunnel')).map(r=>({points:r.points,width:ROAD_W[r.cls]??6})))),outer);
  const rails=intersection(union(offsetLines(far.roads.filter(r=>r.cls==='rail'&&r.brunnel!=='tunnel').map(r=>({points:r.points,width:5})))),outer);
  let base=difference(outer,union(water.concat(green,roads,rails)));
  const lay=(paths,col,surf,dy,maxEdge=45)=>{for(const p of toExPolygons(paths))mbGround.polygon(p.outer,p.holes,(x,z)=>H(x,z)+dy,col,surf,{maxEdge});};
  lay(base,shade(GROUND.paving,.97),SURF.paving,-.25);
  lay(green,GROUND.park,SURF.grass,-.2);
  lay(water,GROUND.water,SURF.water,-1.2);
  lay(roads,GROUND.asphalt,SURF.asphalt,-.3);
  lay(rails,GROUND.gravel,SURF.paving,-.28);
  // Faldón exterior hasta el horizonte (suelo plano que se pierde en la bruma)
  const big=8000;
  const skirt=difference([rectPath(-big,-big,big,big)],ring);
  for(const p of toExPolygons(skirt))mbGround.polygon(p.outer,p.holes,(x,z)=>T.height(Math.max(-R,Math.min(R,x)),Math.max(-R,Math.min(R,z)))-.5,shade(GROUND.paving,.93),SURF.paving,{maxEdge:900});
  // Edificios lejanos
  const palette=region==='latam'?FACADE.colonial.concat(FACADE.moderno):region==='catalunya'?FACADE.eixample:region==='andalucia'?FACADE.andaluz.concat(FACADE.madrid):FACADE.madrid.concat(FACADE.ladrillo,FACADE.moderno);
  const detailed=union((model.buildings??[]).flatMap(b=>polygonPaths(b.rings)));
  let id=50000,count=0,duplicatesSkipped=0;
  for(const bd of far.buildings){
    let r=bd.ring;if(r.length<3)continue;
    const paths=polygonPaths([r,...(bd.holes??[])]),area=pathsArea(paths);
    if(pathsArea(intersection(paths,hole))>.01||detailed.length&&pathsArea(intersection(paths,detailed))>area*.5){duplicatesSkipped++;continue;}
    // anillo antihorario (sólido a la izquierda)
    let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=r[j][0]*r[i][1]-r[i][0]*r[j][1];
    if(Math.abs(a)<16)continue;if(a<0)r=r.slice().reverse();
    const hsh=hashString(r[0][0].toFixed(1)+':'+r[0][1].toFixed(1));
    const cx=r.reduce((s,p)=>s+p[0],0)/r.length,cz=r.reduce((s,p)=>s+p[1],0)/r.length;
    let gmin=Infinity;for(const p of r)gmin=Math.min(gmin,H(p[0],p[1]));
    const h=Math.max(3,bd.h),y0=gmin-1+bd.min,y1=gmin+h;
    let col;
    if(bd.colour){try{col=new THREE.Color(bd.colour);}catch{}}
    col??=new THREE.Color(palette[hsh%palette.length]);
    mbBld.setId(id++);
    const holes=(bd.holes??[]).map(h=>ringSignedArea(h)>0?h.slice().reverse():h);
    for(const wallRing of [r,...holes])for(let i=0;i<wallRing.length;i++){
      const p=wallRing[i],q=wallRing[(i+1)%wallRing.length],dx=q[0]-p[0],dz=q[1]-p[1],L=Math.hypot(dx,dz);if(L<.2)continue;
      mbBld.quad([q[0],y0,q[1]],[p[0],y0,p[1]],[p[0],y1,p[1]],[q[0],y1,q[1]],col,FARWIN,[dz/L,0,-dx/L]);
    }
    const roofC=new THREE.Color(h<10&&(hsh>>4)%3===0?ROOF.tile[hsh%ROOF.tile.length]:ROOF.flat[hsh%ROOF.flat.length]);
    try{mbBld.polygon(r,holes,y1,roofC,SURF.roof);}catch{}
    count++;
  }
  const group=new THREE.Group();group.name='entorno-lejano';
  const mat=createGMaterial({sun});mat.uniforms.uMeshId.value=.73;
  const g1=new THREE.Mesh(mbGround.build(),mat);g1.name='lejano:suelo';g1.receiveShadow=true;
  const g2=new THREE.Mesh(mbBld.build(),mat);g2.name='lejano:edificios';g2.receiveShadow=true;
  group.add(g1,g2);
  group.userData={kind:'far',buildings:count,attribution:far.attribution};
  return {group,stats:{buildings:count,duplicatesSkipped,ms:Math.round(performance.now()-t0)},terrain:T,sourceData:{city:far,dem}};
}
