// Gacha de escuela: genera un recinto escolar completo como modelo de lugar (mismos datos que un
// lugar real), para que lo construya el mismo motor: edificio de aulas, pabellón, piscina, pistas,
// pista de atletismo, jardines, valla, entrada con mástiles y el barrio de alrededor.
// Tres tradiciones: instituto español (IES), colegio latinoamericano (galerías + patio cívico)
// y escuela de estilo japonés (bloque largo, pista oval, piscina, como el «conjunto» de haikeigacha).
import {Terrain} from '../data/terrain.js';
import {rng,pick,range} from '../data/rng.js';
import {FLOOR_HEIGHT} from '../data/place-model.js';

export const SCHOOL_DEFAULTS={estilo:'espana',nivel:'secundaria',plantas:3,gimnasio:true,piscina:false,pista:'auto',canchas:2,barrio:true};
const CENTERS={espana:{lat:40.4300,lon:-3.7000},latam:{lat:19.4000,lon:-99.1500},japon:{lat:35.6800,lon:139.7000}};

const rect=(x0,z0,x1,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2);

// Óvalo de pista de atletismo (rectas + curvas) centrado en (cx,cz), eje largo en X.
function stadium(cx,cz,straight,radius,seg=14){
  const pts=[];
  for(let i=0;i<=seg;i++){const a=-Math.PI/2+Math.PI*i/seg;pts.push([cx+straight/2+Math.cos(a)*radius,cz+Math.sin(a)*radius]);}
  for(let i=0;i<=seg;i++){const a=Math.PI/2+Math.PI*i/seg;pts.push([cx-straight/2+Math.cos(a)*radius,cz+Math.sin(a)*radius]);}
  return pts;
}

export function generateSchool(seed='escuela',opts={}){
  const o={...SCHOOL_DEFAULTS,...opts};
  const r=rng('escuela:'+seed+':'+o.estilo+':'+o.nivel);
  const jp=o.estilo==='japon',la=o.estilo==='latam';
  const pista=o.pista==='auto'?(jp?'atletismo':la?'futbol':o.nivel==='primaria'?'ninguna':'futbol'):o.pista;
  const W=o.plot?.W??Math.round(range(r,jp?175:150,jp?200:185)),D=o.plot?.D??Math.round(range(r,jp?118:110,jp?140:135));
  const M=o.insitu?0:48; // margen de calles y barrio (no hace falta sobre un mapa real)
  const size={width:W+2*M,depth:D+2*M};
  const b={centerLat:CENTERS[o.estilo]?.lat??40.43,centerLon:CENTERS[o.estilo]?.lon??-3.7,width:size.width,depth:size.depth};
  const buildings=[],areas=[],roads=[],points=[],lines=[];
  let id=0;const nid=p=>`gen:${p}:${id++}`;
  const style=jp?'escuela_jp':la?'escuela_latam':'escuela';
  const plinthLevel=0;
  const addB=(ring,levels,{use='school',style:fs=style,height=null,roof=null,name=null,gallerySides=null,mainSide=null,tags={}}={})=>{
    const xs=ring.map(p=>p[0]),zs=ring.map(p=>p[1]);
    const h=height??levels*FLOOR_HEIGHT*(use==='school'?1.12:1);
    buildings.push({id:nid('edificio'),osmId:null,name,rings:[ring],area:area(ring),use,bbox:[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)],
      minHeight:0,isPart:false,knownHeight:h,knownLevels:levels,heightSource:'generado',roof:{shape:roof,colour:null,material:null,height:null},
      colour:null,material:null,shops:[],groundCommercial:false,tags:{...tags,amenity:use==='school'?'school':undefined},
      forceStyle:fs,gallerySides,mainSide,height:h,levels,estimated:false});
  };
  const x0=-W/2,x1=W/2,z0=-D/2,z1=D/2;
  // Recinto (suelo de patio) y entrada al sur
  areas.push({id:nid('recinto'),kind:'school',rings:[rect(x0,z0,x1,z1)],name:'Recinto escolar',area:W*D,c:[0,0]});
  const gateX=jp?x0+W*.18:la?0:x0+W*range(r,.25,.4),gateW=7;

  // --- Edificio principal
  const plantas=Math.max(2,Math.min(5,o.plantas|0||3));
  const bd=jp?range(r,15,17):range(r,15,18);
  if(jp){
    const L=W*range(r,.55,.62),bx0=x0+W*.28;
    addB(rect(bx0,z0+8,bx0+L,z0+8+bd),plantas,{name:'Edificio principal',mainSide:2});
    // escalera/torre de reloj central más alta
    const cx=bx0+L/2;addB(rect(cx-4,z0+8+bd-6,cx+4,z0+8+bd+1.5),plantas+1,{name:'Torre de escalera'});
  }else if(la){
    // En U alrededor del patio cívico (abierto al sur)
    const px0=x0+W*.18,px1=x0+W*.68,pz0=z0+8,pz1=z0+D*.62;
    addB(rect(px0,pz0,px1,pz0+bd),plantas,{name:'Pabellón norte',gallerySides:[2],mainSide:2});
    addB(rect(px0,pz0+bd,px0+bd,pz1),plantas,{name:'Pabellón oeste',gallerySides:[1]});
    addB(rect(px1-bd,pz0+bd,px1,pz1),plantas,{name:'Pabellón este',gallerySides:[3]});
    // patio cívico con cancha y mástil
    const cpx=(px0+px1)/2,cpz=(pz0+bd+pz1)/2;
    areas.push({id:nid('cancha'),kind:'pitch',sport:'basketball',tags:{sport:'basketball'},rings:[rect(cpx-14,cpz-8,cpx+14,cpz+8)],area:28*16,c:[cpx,cpz]});
    points.push({id:nid('mastil'),kind:'flag',x:cpx,z:pz1-3,tags:{}});
  }else{
    // IES: bloque en L (norte + oeste)
    const L=W*range(r,.5,.6);
    addB(rect(x0+8,z0+8,x0+8+L,z0+8+bd),plantas,{name:'Aulario',mainSide:2});
    addB(rect(x0+8,z0+8+bd,x0+8+bd,z0+8+bd+D*range(r,.32,.42)),Math.max(2,plantas-1),{name:'Ala oeste'});
  }

  // --- Pabellón deportivo (gimnasio)
  const gymW=o.nivel==='primaria'?24:range(r,30,38),gymD=o.nivel==='primaria'?16:range(r,20,24);
  let gym=null;
  if(o.gimnasio){
    if(jp){gym=[x0+6,z0+8,x0+6+gymD,z0+8+gymW];}
    else if(la){gym=[x1-6-gymW,z0+8,x1-6,z0+8+gymD];}
    else{gym=[x1-6-gymW,z0+8,x1-6,z0+8+gymD];}
    addB(rect(...gym),1,{use:'school',style:'gimnasio',height:range(r,8.5,10.5),roof:r()<.6?'barrel':'gabled',name:'Gimnasio',mainSide:2});
  }
  // --- Piscina
  if(o.piscina){
    const px=jp?x0+6+gymD+6:gym?gym[0]-33:x1-40,pz=z0+12;
    const deck=rect(px-2,pz-2,px+27,pz+14);
    areas.push({id:nid('playa'),kind:'plaza',rings:[deck],area:area(deck),c:[px+12,pz+6]});
    areas.push({id:nid('piscina'),kind:'pool',rings:[rect(px,pz,px+25,pz+12.5)],area:312,c:[px+12.5,pz+6]});
    lines.push({id:nid('valla'),kind:'fence',points:[[px-2.5,pz-2.5],[px+27.5,pz-2.5],[px+27.5,pz+14.5],[px-2.5,pz+14.5],[px-2.5,pz-2.5]],height:1.8});
  }
  // --- Pista de atletismo / campo de fútbol / pistas
  const fieldZ0=jp?z0+8+bd+10:la?z0+D*.66:z0+8+bd+12;
  if(pista==='atletismo'){
    const cx=jp?x0+W*.6:x0+W*.58,cz=(fieldZ0+z1-8)/2,R=Math.min(18,(z1-8-fieldZ0)/2-1),S=Math.min(W*.42,60);
    const outer=stadium(cx,cz,S,R),inner=stadium(cx,cz,S,R-7.5);
    areas.push({id:nid('pista'),kind:'track',rings:[outer,inner.slice().reverse()],area:area(outer)-area(inner),c:[cx,cz]});
    areas.push({id:nid('campo'),kind:'pitch',sport:'soccer',tags:{sport:'soccer'},rings:[inner],area:area(inner),c:[cx,cz]});
    // gradas junto a la recta
    points.push({id:nid('gradas'),kind:'bleachers',x:cx,z:cz-R-3.5,tags:{w:S*.6,yaw:0}});
  }else if(pista==='futbol'){
    const fw=Math.min(W*.5,la?70:60),fd=Math.min(z1-6-fieldZ0,la?45:38),cx=la?x0+W*.4:x0+W*.62,cz=fieldZ0+fd/2;
    areas.push({id:nid('campo'),kind:'pitch',sport:'soccer',tags:{sport:'soccer'},rings:[rect(cx-fw/2,cz-fd/2,cx+fw/2,cz+fd/2)],area:fw*fd,c:[cx,cz]});
  }
  // canchas de baloncesto / pista polideportiva
  const nC=Math.max(0,Math.min(3,o.canchas|0));
  for(let k=0;k<nC;k++){
    const cw=28,cd=15,cx=jp?x1-22:x1-20,cz=(jp?z1-16:fieldZ0+cd/2+2)-k*(cd+4)*(jp?1:-1);
    if(cz-cd/2<z0+30||cz+cd/2>z1-4)continue;
    areas.push({id:nid('cancha'),kind:'pitch',sport:k%2&&!jp?'multi':'basketball',tags:{sport:k%2&&!jp?'basketball':'basketball'},rings:[rect(cx-cw/2,cz-cd/2,cx+cw/2,cz+cd/2)],area:cw*cd,c:[cx,cz]});
  }
  // patio infantil y huerto (primaria)
  if(o.nivel==='primaria'){
    const px=x0+W*.1,pz=z1-30;
    areas.push({id:nid('juegos'),kind:'playground',rings:[rect(px,pz,px+18,pz+12)],area:216,c:[px+9,pz+6]});
    areas.push({id:nid('huerto'),kind:'farmland',rings:[rect(px+22,pz,px+36,pz+10)],area:140,c:[px+29,pz+5]});
  }
  // jardines con árboles junto a la valla sur y oeste
  const gardens=[];
  gardens.push(rect(x0+2,z1-9,gateX-gateW/2-2,z1-2));
  gardens.push(rect(gateX+gateW/2+2,z1-9,x0+W*(jp?.42:.5),z1-2));
  if(jp)gardens.push(rect(x0+6,z0+8+gymW+4,x0+28,z1-12));
  for(const g of gardens){if(area(g)<30)continue;areas.push({id:nid('jardin'),kind:'grass',rings:[g],area:area(g),c:[(g[0][0]+g[2][0])/2,(g[0][1]+g[2][1])/2]});
    for(let x=g[0][0]+3;x<g[1][0]-2;x+=range(r,7,10))points.push({id:nid('arbol'),kind:'tree',x,z:(g[0][1]+g[2][1])/2+range(r,-1,1),tags:{}});}
  // árboles a lo largo de la valla norte y este
  for(let z=z0+6;z<z1-6;z+=range(r,8,11))points.push({id:nid('arbol'),kind:'tree',x:x1-3,z,tags:{}});
  for(let x=x0+30;x<x1-6;x+=range(r,9,12))if(!gym||x<gym[0]-3||x>gym[2]+3)points.push({id:nid('arbol'),kind:'tree',x,z:z0+3,tags:{}});
  // entrada: mástiles, aparcabicis, bancos, rótulo
  for(let k=-1;k<=1;k++)points.push({id:nid('mastil'),kind:'flag',x:gateX+k*2.2,z:z1-12,tags:{}});
  points.push({id:nid('bicis'),kind:'bikes',x:gateX+gateW/2+5,z:z1-11,tags:{}});
  for(let k=0;k<4;k++)points.push({id:nid('banco'),kind:'bench',x:x0+W*(.3+k*.12),z:fieldZ0-4,tags:{}});
  // valla: muro con verja a la calle, muro ciego a los vecinos, con hueco de entrada
  lines.push({id:nid('valla-sur'),kind:'wall_fence',points:[[x0,z1],[gateX-gateW/2,z1]]});
  lines.push({id:nid('valla-sur2'),kind:'wall_fence',points:[[gateX+gateW/2,z1],[x1,z1]]});
  lines.push({id:nid('valla-este'),kind:'wall_fence',points:[[x1,z1],[x1,z0]]});
  lines.push({id:nid('muro-norte'),kind:'wall',points:[[x1,z0],[x0,z0]],height:2.4});
  lines.push({id:nid('muro-oeste'),kind:'wall',points:[[x0,z0],[x0,z1]],height:2.4});
  // pilares de la puerta con rótulo
  addB(rect(gateX-gateW/2-1.2,z1-.6,gateX-gateW/2,z1+.6),1,{use:'small',style:'pequeno',height:2.8,name:'Pilar de la puerta'});
  addB(rect(gateX+gateW/2,z1-.6,gateX+gateW/2+1.2,z1+.6),1,{use:'small',style:'pequeno',height:2.8,name:'Pilar de la puerta'});

  if(o.insitu){
    return {buildings,areas,points,lines,size,school:{...o,pista,W,D,gate:[gateX,z1],style}};
  }
  // --- Calles alrededor (calle principal al sur, secundaria al este y callejón al norte)
  const road=(pts,cls,width,name)=>roads.push({id:nid('calle'),cls,type:'vehicle',width,points:pts,name,lanes:null,oneway:false,bridge:false,layer:0,surface:null,sidewalk:'both'});
  road([[-size.width/2,z1+13],[size.width/2,z1+13]],'residential',9,jp?'Calle de la Escuela':'Calle del Colegio');
  road([[x1+11,-size.depth/2],[x1+11,size.depth/2]],'residential',7.5,'Calle del Parque');
  road([[-size.width/2,z0-11],[size.width/2,z0-11]],'residential',6.5,'Calle Trasera');
  road([[x0-11,-size.depth/2],[x0-11,size.depth/2]],'residential',6.5,'Calle Poniente');
  for(const [x,z]of [[gateX-30,z1+18.5],[gateX+30,z1+18.5]])points.push({id:nid('farola'),kind:'lamp',x,z,tags:{}});
  points.push({id:nid('cruce'),kind:'crossing',x:gateX,z:z1+13,tags:{}});

  // --- Barrio alrededor
  if(o.barrio){
    const resStyle=la?'latam_moderno':jp?'madrid_moderno':'madrid_moderno';
    const row=(xa,xb,za,zb,dir)=>{let x=xa;while(x<xb-6){const w=range(r,8,16),d=range(r,10,16);const lv=jp?1+Math.floor(r()*3):la?1+Math.floor(r()*3):2+Math.floor(r()*5);
      const ring=dir>0?rect(x,za,Math.min(xb,x+w),za+d):rect(x,zb-d,Math.min(xb,x+w),zb);
      addB(ring,lv,{use:lv<=2?'house':'residential',style:lv<=2?(la?'colonial':'casa'):resStyle});x+=w;}};
    row(-size.width/2+2,size.width/2-2,z1+19,z1+40,1);
    row(-size.width/2+2,size.width/2-2,z0-40,z0-17,-1);
    // columnas este y oeste
    const col=(xa,xb,za,zb)=>{let z=za;while(z<zb-6){const d=range(r,9,15),lv=2+Math.floor(r()*4);addB(rect(xa,z,xb,Math.min(zb,z+d)),lv,{use:'residential',style:resStyle});z+=d;}};
    col(x1+17,x1+34,z0-6,z1+6);col(x0-34,x0-17,z0-6,z1+6);
  }

  const terrain=Terrain.flat(size.width,size.depth);
  const model={format:'atlas-estudio-lugar',version:1,kind:'school',seed:String(seed),label:'Escuela generada',bounds:b,size,terrain,
    buildings,roads,areas,points,lines,pois:[],warnings:[],attribution:[],retrievedAt:null,
    school:{...o,pista,W,D,gate:[gateX,z1],style}};
  for(const bd of buildings){bd.seedKey=0;}
  model.stats={buildings:buildings.length,roads:roads.length,areas:areas.length,points:points.length};
  return model;
}
