// Parámetros de las especies ez-tree aprobadas (vista previa del 2026-11-05) y su mallado al estilo del
// creador de mundos: racimos planos teñidos por vértice, tronco liso, normales de copa esféricas y
// presupuesto web. Lo usa scripts/hornear-arboles.mjs; el generador solo carga los GLB resultantes.
import * as THREE from 'three';
import {Tree,TreePreset} from '../../src/vendor/ez-tree/index.js';

// Textura de racimo por especie (una celda de 256 px; ver scripts/arboles/racimos.js).
export const LEAF_TEXTURES=['ancha','menuda','aguja','pinnada'];
// Detalle reducido para la web: anillos y segmentos mínimos que conservan la silueta.
const WEB={sections:{0:5,1:3,2:2,3:1},segments:{0:6,1:4,2:3,3:3}};

export const EZTREE_SPECIES=[
  {id:'platano',base:'Ash Medium',seed:4101,height:13,bark:[0x8c8471,0xc7bd9c],leaf:[0x5f8f2e,0x8fb84a],tex:'ancha',mod:{leaves:{count:7,size:5.6,sizeVariance:.35,angle:40},branch:{children:{0:6,1:4,2:3},angle:{1:44}}}},
  {id:'encina',base:'Oak Medium',seed:5203,height:8,bark:[0x4e463c,0x7a6d5c],leaf:[0x3d5a2a,0x5f7d3a],tex:'menuda',mod:{branch:{length:{0:24,1:14,2:9,3:5},children:{0:6,1:4,2:3},angle:{1:62,2:50}},leaves:{count:6,size:6,sizeVariance:.3}}},
  {id:'pinonero',base:'Oak Medium',seed:7317,height:14,flat:[.6,.42],bark:[0x6b4a33,0x9c6e48],leaf:[0x3f6b2e,0x6b9440],tex:'aguja',mod:{branch:{levels:3,length:{0:44,1:16,2:8,3:4},start:{1:.66,2:.2,3:.1},angle:{1:58,2:48,3:40},children:{0:7,1:4,2:3},force:{strength:.03},gnarliness:{0:.04,1:.1}},leaves:{count:6,size:5.4,angle:70,sizeVariance:.25,start:.3}}},
  {id:'olivo',base:'Oak Small',seed:9001,height:6,bark:[0x5b5246,0x8a8070],leaf:[0x6f7d55,0x9aa682],tex:'menuda',mod:{branch:{gnarliness:{0:.18,1:.28,2:.25},twist:{0:.35},length:{0:16,1:12,2:7,3:4},children:{0:5,1:4,2:3},angle:{1:55}},leaves:{count:6,size:5,sizeVariance:.35}}},
  {id:'roble',base:'Oak Large',seed:1213,height:15,bark:[0x4f4335,0x7d6b54],leaf:[0x41702c,0x75a344],tex:'ancha',mod:{branch:{children:{0:7,1:4,2:3}},leaves:{count:6,size:8,sizeVariance:.35}}},
  {id:'abedul',leafK:.85,base:'Aspen Medium',seed:3307,height:14,bark:[0xd8d2c4,0xf2eee4],leaf:[0x7fa83e,0xb3cf5a],tex:'menuda',mod:{branch:{children:{0:9,1:3,2:3}},leaves:{count:6,size:5.2,sizeVariance:.4}}},
  {id:'pino',base:'Pine Medium',seed:2711,height:16,bark:[0x6a4630,0x9a6442],leaf:[0x2f5a33,0x4f8240],tex:'aguja',leafK:1,twig:0,mod:{branch:{children:{0:58,1:3}},leaves:{count:6,size:4.4,sizeVariance:.2,angle:30}}},
  {id:'eucalipto',leafK:.85,base:'Aspen Large',seed:6119,height:20,bark:[0xb7ad98,0xd9cfb6],leaf:[0x58776a,0x8aa597],tex:'pinnada',mod:{branch:{children:{0:8,1:3,2:3}},leaves:{count:6,size:5.5,sizeVariance:.4,angle:20}}},
  {id:'saman',base:'Oak Large',seed:8821,height:15,flat:[.42,.55],bark:[0x5a4a3a,0x857058],leaf:[0x3f7a2a,0x76ad3e],tex:'pinnada',mod:{branch:{length:{0:22,1:34,2:16,3:7},start:{1:.55},angle:{1:72,2:50,3:35},children:{0:6,1:4,2:3},force:{strength:.008}},leaves:{count:6,size:8.5,angle:75,sizeVariance:.3}}},
  {id:'jacaranda',base:'Ash Medium',seed:4477,height:11,bark:[0x5d5246,0x8b7c69],leaf:[0x7d5cc4,0xa98ae6],accent:[0x5b8a3a,.22],tex:'pinnada',mod:{branch:{children:{0:6,1:4,2:3},angle:{1:56}},leaves:{count:7,size:5.6,sizeVariance:.35}}},
  {id:'flamboyan',base:'Oak Large',seed:3391,height:10,flat:[.5,.5],bark:[0x6a5b4a,0x948168],leaf:[0xd8452b,0xf07a32],accent:[0x4f8a32,.35],tex:'pinnada',mod:{branch:{length:{0:30,1:26,2:13,3:6},start:{1:.6},angle:{1:74,2:48},children:{0:6,1:4,2:3}},leaves:{count:6,size:7.5,angle:72,sizeVariance:.3}}},
  {id:'laurel',base:'Oak Medium',seed:6603,height:12,bark:[0x7a7468,0xa59e8f],leaf:[0x2c5a26,0x4f8a34],tex:'menuda',mod:{branch:{length:{0:26,1:18,2:11,3:6},children:{0:7,1:4,2:3},angle:{1:60}},leaves:{count:7,size:6.5,sizeVariance:.3}}},
  {id:'mezquite',base:'Oak Small',seed:2029,height:6,flat:[.4,.6],bark:[0x4a3b2e,0x6f5a45],leaf:[0x7c8f3f,0xa9b860],tex:'pinnada',mod:{branch:{gnarliness:{0:.2,1:.3,2:.3},length:{0:10,1:20,2:9,3:4},start:{1:.3},angle:{1:62,2:50},children:{0:5,1:4,2:3},force:{strength:.006}},leaves:{count:4,size:5.5,angle:80,sizeVariance:.35}}},
  {id:'matorral',base:'Bush 1',seed:1777,height:2.4,bark:[0x5a4a38,0x7d6a50],leaf:[0x6b7a3a,0x98a858],tex:'menuda',mod:{leaves:{count:7,size:4.4,sizeVariance:.3}}},
];

const deep=(t,s)=>{for(const k in s){if(s[k]&&typeof s[k]==='object'&&!Array.isArray(s[k])){t[k]=t[k]||{};deep(t[k],s[k]);}else t[k]=s[k];}return t;};
function hash(n){let a=n>>>0;return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}

// Malla de una especie: {branches, leaves} con posición, normal y color (y uv en las hojas), base en el suelo.
export function buildSpecies(sp){
  const tree=new Tree();tree.options.copy(JSON.parse(JSON.stringify(TreePreset[sp.base])));
  deep(tree.options,{branch:WEB});deep(tree.options,sp.mod||{});tree.options.seed=sp.seed;
  // Menos racimos y más grandes: la copa se lee como masas (y cuesta menos).
  const K=sp.leafK??.45,L=tree.options.leaves;L.count=Math.max(2,Math.round(L.count*K));L.size*=1.08/Math.sqrt(K);L.billboard='double';
  tree.createGeometry({});
  // Ramitas finales ocultas dentro de la copa: no se mallan (las hojas siguen en su sitio).
  const cut=tree.skeleton.branches[0].baseRadius*(sp.twig??.09);
  tree.skeleton.branches=tree.skeleton.branches.filter((b,i)=>i===0||b.baseRadius>=cut);
  const {branches,leaves}=tree.createGeometry({});
  branches.computeBoundingBox();leaves.computeBoundingBox();
  const box=branches.boundingBox.clone().union(leaves.boundingBox),k=sp.height/(box.max.y-box.min.y);
  const cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
  for(const g of [branches,leaves]){g.translate(-cx,-box.min.y,-cz);g.scale(k,k,k);g.computeBoundingBox();}
  // Copa aplanada (parasol): por encima de h0 la altura se comprime; el ancho se conserva.
  if(sp.flat){const h0=sp.height*sp.flat[0],f=sp.flat[1];for(const g of [branches,leaves]){const P=g.attributes.position;
      for(let i=0;i<P.count;i++){const y=P.getY(i);if(y>h0)P.setY(i,h0+(y-h0)*f);}g.computeBoundingBox();}
    const kk=sp.height/Math.max(branches.boundingBox.max.y,leaves.boundingBox.max.y);for(const g of [branches,leaves]){g.scale(kk,kk,kk);g.computeBoundingBox();}}
  // Tronco: degradado de la base (oscura) a las ramas (clara), sin textura.
  const C=x=>new THREE.Color(x),tmp=new THREE.Color(),b0=C(sp.bark[0]),b1=C(sp.bark[1]),bp=branches.attributes.position,bc=new Float32Array(bp.count*3);
  for(let i=0;i<bp.count;i++){tmp.copy(b0).lerp(b1,Math.min(1,bp.getY(i)/(sp.height*.45))*.85);bc.set([tmp.r,tmp.g,tmp.b],i*3);}
  branches.setAttribute('color',new THREE.BufferAttribute(bc,3));branches.deleteAttribute('uv');
  // Copa: normales esféricas (elipsoide de las hojas), oclusión hacia el interior y tono por racimo.
  const c=leaves.boundingBox.getCenter(new THREE.Vector3()),R=leaves.boundingBox.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const lp=leaves.attributes.position,ln=leaves.attributes.normal,lc=new Float32Array(lp.count*3);
  const l0=C(sp.leaf[0]),l1=C(sp.leaf[1]),acc=sp.accent?C(sp.accent[0]):null,rnd=hash(sp.seed),n=new THREE.Vector3(),d=new THREE.Vector3();
  let card=null;
  for(let i=0;i<lp.count;i++){
    if(i%4===0){const isAcc=acc&&rnd()<sp.accent[1];card={base:isAcc?acc.clone():l0.clone().lerp(l1,rnd()*.5),j:.92+.16*rnd()};}
    d.set((lp.getX(i)-c.x)/R.x,(lp.getY(i)-c.y)/R.y,(lp.getZ(i)-c.z)/R.z);const r=d.length();
    n.set(ln.getX(i),ln.getY(i),ln.getZ(i)).multiplyScalar(.12).add(d.clone().normalize().multiplyScalar(.88)).normalize();ln.setXYZ(i,n.x,n.y,n.z);
    const ao=.62+.38*Math.min(1,Math.max(0,(r-.25)/.75)),top=.5+.5*Math.min(1,Math.max(0,d.y*.5+.5));
    tmp.copy(card.base).lerp(l1,top*.6).multiplyScalar(ao*card.j);lc.set([tmp.r,tmp.g,tmp.b],i*3);
  }
  leaves.setAttribute('color',new THREE.BufferAttribute(lc,3));
  return {branches,leaves,tris:(branches.index.count+leaves.index.count)/3};
}
