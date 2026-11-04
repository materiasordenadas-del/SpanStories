// Kit modular de escaparates (Blender → GLB): contrato del paquete, geometría y ensamblador.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {KHRMaterialsEmissiveStrength} from '@gltf-transform/extensions';
import {crearCatalogo,ensamblar,elegirKit,variedadKit} from '../src/estudio/render/commerce-blender-kit-assembly.js';
import {SHOP_CATEGORIES} from '../src/estudio/data/shop-categories.js';

const dir=new URL('../public/assets/kits-escaparate/',import.meta.url);
const manifiesto=JSON.parse(await readFile(new URL('kit.json',dir),'utf8')),bytes=await readFile(new URL(manifiesto.archivo.nombre,dir)),bytesInt=await readFile(new URL(manifiesto.archivo_interior.nombre,dir));
const io=new NodeIO().registerExtensions([KHRMaterialsEmissiveStrength]),doc=await io.readBinary(bytes),docInt=await io.readBinary(bytesInt),catalogo=crearCatalogo(manifiesto);
const nodos=new Map([...doc.getRoot().listNodes(),...docInt.getRoot().listNodes()].map(n=>[n.getName(),n]));
const listaMateriales=()=>[...doc.getRoot().listMaterials(),...docInt.getRoot().listMaterials()];

function datos(node){ // triángulos y vértices por primitiva
  const out=[];for(const prim of node.getMesh().listPrimitives()){const pos=prim.getAttribute('POSITION'),nor=prim.getAttribute('NORMAL'),uv=prim.getAttribute('TEXCOORD_0'),idx=prim.getIndices();
    out.push({material:prim.getMaterial().getName(),pos:pos.getArray(),nor:nor.getArray(),uv:uv?.getArray(),idx:idx?idx.getArray():[...Array(pos.getCount()).keys()]});}
  return out;
}
const tri=(prim,i)=>[0,1,2].map(k=>{const v=prim.idx[i*3+k];return [prim.pos[v*3],prim.pos[v*3+1],prim.pos[v*3+2]];});
const normalGeom=([a,b,c])=>{const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],l=Math.hypot(...n)||1;return n.map(x=>x/l);};

test('el GLB y el manifiesto coinciden: módulos, hash, triángulos y cajas',()=>{
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifiesto.archivo.sha256);assert.equal(createHash('sha256').update(bytesInt).digest('hex'),manifiesto.archivo_interior.sha256);
  assert.deepEqual([...nodos.keys()].sort(),manifiesto.modulos.map(m=>m.id).sort());
  for(const m of manifiesto.modulos){const prims=datos(nodos.get(m.id));let t=0;const lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];
    for(const p of prims){t+=p.idx.length/3;for(let i=0;i<p.pos.length;i+=3)for(let k=0;k<3;k++){assert.ok(Number.isFinite(p.pos[i+k]),m.id+' vértice no finito');lo[k]=Math.min(lo[k],p.pos[i+k]);hi[k]=Math.max(hi[k],p.pos[i+k]);}}
    assert.equal(t,m.triangulos,m.id+' triángulos');
    for(let k=0;k<3;k++){assert.ok(Math.abs(lo[k]-m.caja.min[k])<2e-3&&Math.abs(hi[k]-m.caja.max[k])<2e-3,`${m.id} caja eje ${k}`);}
    assert.deepEqual(prims.map(p=>p.material).sort(),[...m.materiales].sort(),m.id+' materiales');}
});
test('presupuesto: kit completo ligero y ninguna pieza pesada',()=>{
  const fach=manifiesto.modulos.filter(m=>m.archivo==='fachada'),inte=manifiesto.modulos.filter(m=>m.archivo==='interior');
  assert.ok(fach.reduce((n,m)=>n+m.triangulos,0)<2500);assert.ok(bytes.byteLength<300000,'bytes fachada '+bytes.byteLength);assert.ok(bytesInt.byteLength<4e6,'bytes interior '+bytesInt.byteLength);
  for(const m of fach)assert.ok(m.triangulos<=260,`${m.id} ${m.triangulos} triángulos`);
  for(const m of inte)assert.ok(m.triangulos<=1300,`${m.id} ${m.triangulos} triángulos`);
});
test('materiales: roles, alfa y sin texturas embebidas',()=>{
  assert.equal(doc.getRoot().listTextures().length+docInt.getRoot().listTextures().length,0);
  for(const m of listaMateriales()){const def=manifiesto.materiales[m.getName()];assert.ok(def,m.getName());assert.equal(m.getExtras().ss_rol,def.rol);assert.equal(m.getAlphaMode(),def.modo??'OPAQUE');assert.equal(m.getDoubleSided(),!!def.doble);}
  const vidrio=listaMateriales().find(m=>m.getName()==='ss_vidrio_escaparate');assert.equal(vidrio.getAlphaMode(),'BLEND');assert.ok(vidrio.getBaseColorFactor()[3]<.2);
  assert.equal(listaMateriales().find(m=>m.getName()==='ss_int_capa').getAlphaMode(),'MASK');
});
test('UV: las piezas con ranura de atlas llevan 0-1 por cara',()=>{
  for(const m of manifiesto.modulos)for(const p of datos(nodos.get(m.id)))if(manifiesto.materiales[p.material].slot){assert.ok(p.uv,m.id+' sin UV');for(const v of p.uv)assert.ok(v>=-1e-6&&v<=1+1e-6,`${m.id} UV fuera de 0-1: ${v}`);}
});
test('orientación: la caja mira hacia dentro y el resto de láminas hacia la calle',()=>{
  for(const m of manifiesto.modulos.filter(m=>m.familia==='caja'&&m.id!=='caja.cenefa')){
    const cx=(m.caja.min[0]+m.caja.max[0])/2,cy=(m.caja.min[1]+m.caja.max[1])/2,cz=(m.caja.min[2]+m.caja.max[2])/2;
    for(const p of datos(nodos.get(m.id)))for(let i=0;i<p.idx.length/3;i++){const t=tri(p,i),n=normalGeom(t),c=[0,1,2].map(k=>(t[0][k]+t[1][k]+t[2][k])/3);assert.ok(n[0]*(cx-c[0])+n[1]*(cy-c[1])+n[2]*(cz-c[2])>-1e-6,`${m.id} cara hacia fuera en ${c.map(x=>x.toFixed(2))}`);}}
  const frente=['ss_letrero','ss_vinilo_lema','ss_vinilo_estado','ss_vinilo_banda','ss_persiana'];
  for(const m of manifiesto.modulos)for(const p of datos(nodos.get(m.id)))if(frente.includes(p.material)&&!m.id.startsWith('rotulo')&&!m.id.startsWith('bandera'))for(let i=0;i<p.idx.length/3;i++)assert.ok(normalGeom(tri(p,i))[2]>.99,m.id+' lámina que no mira a +Z');
  for(const id of ['capa.plana','vidrio.pano'])for(const p of datos(nodos.get(id)))for(let i=0;i<p.idx.length/3;i++)assert.ok(normalGeom(tri(p,i))[2]>.99,id);
});
test('medidas nominales del kit (apéndice A y código del generador)',()=>{
  const M=manifiesto.medidas;assert.equal(M.vano,3.6);assert.equal(M.caja_fondo,1.4);assert.ok(M.remetido>=.2&&M.remetido<=.4,'remetido 0,20–0,40');assert.deepEqual(M.capas_z,[.3,.7,1.0]);assert.ok(M.profundidad_min>=1&&M.profundidad_max<=1.8);
  const caja=catalogo.modulo('caja.recta');assert.deepEqual(caja.escala_nominal,[3.6,3.0,1.4]);assert.deepEqual([caja.caja.min[2],caja.caja.max[2]],[-1,0]);
  for(const id of ['puerta.cristal','puerta.madera_vidrio']){const m=catalogo.modulo(id);assert.ok(Math.abs((m.caja.max[0]-m.caja.min[0])-1.1)<1e-3&&Math.abs(m.caja.max[1]-2.3)<1e-3,id);}
  assert.equal(catalogo.modulo('toldo.recto').caja.max[2],1.1);assert.equal(catalogo.modulo('zocalo.liso').caja.max[1],.5);
  for(const m of manifiesto.modulos.filter(m=>m.familia==='toldo'&&m.id!=='toldo.marquesina'))assert.ok(m.materiales.includes('ss_toldo_a')&&m.materiales.includes('ss_toldo_b'),m.id);
});
test('familias del kit (la utilería interior es parte del kit; sin marcas)',()=>{
  const permitidas=new Set(['piel','utileria','marco','hueco','zocalo','puerta','vidrio','rotulo','cornisa','bandera','toldo','persiana','caja','capa','nicho','vinilo','detalle']);
  for(const m of manifiesto.modulos)assert.ok(permitidas.has(m.familia),m.id);
  for(const m of manifiesto.modulos.filter(m=>m.familia==='caja'))assert.ok(m.caja.max[1]<=1.001&&m.caja.min[2]>=-1.2);
});

// ---------------------------------------------------------------- ensamblador
const CATEGORIAS=SHOP_CATEGORIES.map(c=>c.id);
const vano=(i,extra={})=>({w:2.6+(i%9)*.2,h:2.9+(i%4)*.15,depth:1.0+(i%7)*.1,seed:'v'+i,category:CATEGORIAS[i%CATEGORIAS.length],region:i%2?'latam':'espana',estado:'abierto',...extra});
test('toda categoría tiene kit y la elección es estable por semilla',()=>{
  for(const c of CATEGORIAS){const k=elegirKit(catalogo,{category:c,seed:'x'});assert.ok(k);assert.equal(elegirKit(catalogo,{category:c,seed:'x'}).id,k.id);}
  assert.ok(new Set(Array.from({length:60},(_,i)=>elegirKit(catalogo,{category:'panaderia',seed:'p'+i}).id)).size>=2,'dos panaderías vecinas pueden diferir de kit');
});
test('ensamblado determinista, módulos existentes, sin escalas negativas y dentro del vano',()=>{
  for(let i=0;i<400;i++){const v=vano(i),a=ensamblar(catalogo,v),b=ensamblar(catalogo,v);assert.deepEqual(a,b,'determinista');
    for(const c of a.colocaciones){catalogo.modulo(c.modulo);assert.ok(c.escala.every(s=>s>0),`${c.modulo} escala ${c.escala}`);assert.ok(c.posicion.every(Number.isFinite));
      if(c.familia==='caja'||c.familia==='capa')assert.ok(c.posicion[2]<=-catalogo.medidas.remetido+1e-6,c.modulo+' fuera de la caja');}
    const D=a.interior.profundidad;assert.ok(D<=catalogo.medidas.profundidad_max+1e-9);
    for(const c of a.colocaciones.filter(c=>c.familia==='capa'))assert.ok(c.posicion[2]>=a.interior.zVidrio-D-1e-6&&c.posicion[2]<=a.interior.zVidrio,'capa fuera de la profundidad');}
});
test('el zócalo y la puerta no se cruzan; el toldo no baja de 1,95 m',()=>{
  for(let i=0;i<400;i++){const a=ensamblar(catalogo,vano(i,{toldo:true})),puerta=a.colocaciones.find(c=>c.familia==='puerta');if(!puerta)continue;
    const m=catalogo.modulo(puerta.modulo),dw=(m.caja.max[0]-m.caja.min[0]),x0=puerta.posicion[0]-dw/2,x1=puerta.posicion[0]+dw/2;
    for(const z of a.colocaciones.filter(c=>c.familia==='zocalo')){const zx0=z.posicion[0]-z.escala[0]/2,zx1=z.posicion[0]+z.escala[0]/2;assert.ok(zx1<=x0+1e-6||zx0>=x1-1e-6,`${a.kit}: zócalo cruza la puerta`);}
    for(const t of a.colocaciones.filter(c=>c.familia==='toldo')){const mm=catalogo.modulo(t.modulo);assert.ok(t.posicion[1]+mm.caja.min[1]>=1.95-1e-6);}}
});
test('persiana: cerrar añade cajón, guías y panel; abrir añade carteles de vidrio',()=>{
  const cerrada=ensamblar(catalogo,vano(5,{estado:'cerrado'})),abierta=ensamblar(catalogo,vano(5));
  assert.deepEqual(cerrada.colocaciones.filter(c=>c.familia==='persiana').map(c=>c.modulo).sort(),['persiana.cajon','persiana.guia','persiana.guia','persiana.panel']);
  assert.ok(!abierta.colocaciones.some(c=>c.familia==='persiana')&&abierta.colocaciones.some(c=>c.familia==='vinilo'));
});
test('profundidad limitada: nunca más caja que la huella permite',()=>{
  const a=ensamblar(catalogo,vano(3,{depth:.62}));assert.equal(a.interior.profundidad,.62);const b=ensamblar(catalogo,vano(3,{depth:9}));assert.equal(b.interior.profundidad,catalogo.medidas.profundidad_max);
  assert.deepEqual(ensamblar(catalogo,{...vano(1),w:1.0}).colocaciones,[]);
});
test('variedad: varias combinaciones y presupuesto de triángulos por vano',()=>{
  const v=variedadKit(catalogo,Array.from({length:600},(_,i)=>vano(i)));
  assert.ok(v.combinaciones>=60,'combinaciones '+v.combinaciones);assert.ok(v.modulosUsados>=45,'módulos usados '+v.modulosUsados);assert.ok(v.trianguloMedio<6000,'triángulos medios '+v.trianguloMedio);
});

// ---------------------------------------------------------------- interiores con volumen
import {RECETAS} from '../src/estudio/render/commerce-blender-interior-assembly.js';
const caja3=(c)=>{const m=catalogo.modulo(c.modulo),[sx,sy,sz]=c.escala,pts=[];
  for(const x of [m.caja.min[0],m.caja.max[0]])for(const y of [m.caja.min[1],m.caja.max[1]])for(const z of [m.caja.min[2],m.caja.max[2]]){const lx=x*sx,ly=y*sy,lz=z*sz,co=Math.cos(c.giro??0),si=Math.sin(c.giro??0);pts.push([c.posicion[0]+lx*co+lz*si,c.posicion[1]+ly,c.posicion[2]-lx*si+lz*co]);}
  return {x0:Math.min(...pts.map(p=>p[0])),x1:Math.max(...pts.map(p=>p[0])),y0:Math.min(...pts.map(p=>p[1])),y1:Math.max(...pts.map(p=>p[1])),z0:Math.min(...pts.map(p=>p[2])),z1:Math.max(...pts.map(p=>p[2]))};};
test('las 17 categorías tienen receta y todos sus módulos existen',()=>{
  for(const c of CATEGORIAS){const r=RECETAS[c];assert.ok(r,'receta '+c);
    for(const it of [...r.pared,...r.libre,...r.colgantes])for(const id of (it.m.includes('$')?[it.m.replace('$','a'),it.m.replace('$','b')]:[it.m]))catalogo.modulo(id);
    for(const k of ['suelo','fondo','techo'])for(const id of r.skins[k])catalogo.modulo(id);
    for(const it of r.libre)for(const s of it.sobre??[])catalogo.modulo(s);}
});
test('interior en volumen: dentro de la caja, sin solapes y con la puerta libre',()=>{
  for(let i=0;i<340;i++){const v=vano(i,{depth:1.1+(i%6)*.1,w:3.0+(i%5)*.25,seed:'int'+i}),e=ensamblar(catalogo,v);if(e.interior?.modo!=='volumen')continue;
    const L=e.interior.limpio,zg=e.interior.zVidrio,zb=zg-e.interior.profundidad,H=e.interior.alto,puerta=e.colocaciones.find(c=>c.familia==='puerta'),pm=catalogo.modulo(puerta.modulo),dw=pm.caja.max[0]-pm.caja.min[0];
    const libres=[];
    for(const c of e.colocaciones.filter(c=>['piel','utileria'].includes(c.familia))){const b=caja3(c);
      assert.ok(b.x0>=-L/2-.02&&b.x1<=L/2+.02,`${v.category}:${c.modulo} sale en X ${b.x0.toFixed(2)}..${b.x1.toFixed(2)} (L=${L})`);
      assert.ok(b.z0>=zb-.03&&b.z1<=zg+.03,`${v.category}:${c.modulo} sale en Z ${b.z0.toFixed(2)}..${b.z1.toFixed(2)} (${zb}..${zg})`);
      assert.ok(b.y0>=-.01&&b.y1<=H+.01,`${v.category}:${c.modulo} sale en Y ${b.y1.toFixed(2)} > ${H}`);
      if(c.libre)libres.push({c,b});}
    for(const {c,b} of libres){const delante=zg-b.z1<.85*.99&&b.z1>zb;
      if(zg-b.z1<Math.min(.85,e.interior.profundidad*.62)-1e-6)assert.ok(b.x1<=puerta.posicion[0]-dw/2-.1+1e-6||b.x0>=puerta.posicion[0]+dw/2+.1-1e-6,`${v.category}:${c.modulo} bloquea la puerta`);void delante;}
    for(let a=0;a<libres.length;a++)for(let b=a+1;b<libres.length;b++){const p=libres[a].b,q=libres[b].b;assert.ok(p.x1<=q.x0+1e-6||q.x1<=p.x0+1e-6||p.z1<=q.z0+1e-6||q.z1<=p.z0+1e-6,`${v.category}: ${libres[a].c.modulo} solapa con ${libres[b].c.modulo}`);}
    assert.ok(e.triangulos<9000,`${v.category} ${e.triangulos} triángulos`);}
});
test('color de vértice presente en toda la utilería',()=>{
  for(const m of manifiesto.modulos.filter(m=>m.archivo==='interior'))for(const prim of nodos.get(m.id).getMesh().listPrimitives())if(prim.getMaterial().getName()==='ss_in')assert.ok(prim.getAttribute('COLOR_0'),m.id+' sin COLOR_0');
});
test('las recetas dan interiores distintos: pieles y piezas varían por semilla',()=>{
  const firmas=new Set();for(let i=0;i<60;i++)firmas.add(ensamblar(catalogo,vano(0,{category:'panaderia',seed:'pan'+i,w:3.4,h:3.1,depth:1.4})).colocaciones.map(c=>c.modulo).join('|'));
  assert.ok(firmas.size>=8,'variantes de panadería '+firmas.size);
  assert.notEqual(ensamblar(catalogo,vano(0,{category:'libreria',seed:'a'})).interior.receta,ensamblar(catalogo,vano(0,{category:'farmacia',seed:'a'})).interior.receta);
});
