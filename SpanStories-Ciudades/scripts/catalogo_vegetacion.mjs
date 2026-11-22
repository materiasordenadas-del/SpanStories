// Catálogo único de vegetación (formato spanstories-catalogo-vegetacion v1).
// Fuente: TREE_CATALOG del generador; cifras medidas en los GLB reales (bytes, SHA-256, triángulos,
// partes y texturas). Escribe Generador-Mundos/public/assets/arboles/catalogo.json.
//   node scripts/catalogo_vegetacion.mjs           → escribe el catálogo
//   node scripts/catalogo_vegetacion.mjs --check   → solo comprueba que está al día (código 1 si no)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validarCatalogoVegetacion,CATALOGO_VEGETACION} from '../engine/VegetacionAtlas.js';

const visor=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const generador=path.resolve(visor,'..','Generador-Mundos');
const publico=path.join(generador,'public');
const destino=path.join(publico,'assets','arboles','catalogo.json');
const {TREE_CATALOG,TREE_SETS,TREE_SET_NAMES,MAX_TREE_TYPES,TREE_CATALOG_VERSION,TREE_DETAILS,DEFAULT_TREE_DETAIL}=await import(pathToFileURL(path.join(generador,'src/estudio/data/tree-catalog.js')).href);
const {URBAN_TREES}=await import(pathToFileURL(path.join(visor,'routes.js')).href);

const COMPONENT={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const NORMAL={5120:127,5121:255,5122:32767,5123:65535};
const SIZE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
const LEAF=/leav|leaf|hoja|sakura|follaje/i;

export function leerGLB(buffer){
  const view=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength),length=view.getUint32(12,true);
  const json=JSON.parse(new TextDecoder().decode(buffer.subarray(20,20+length)));
  const bin=buffer.subarray(28+length);return {json,bin};
}
function accessor({json,bin},index){
  const a=json.accessors[index],view=json.bufferViews[a.bufferView],Type=COMPONENT[a.componentType],k=SIZE[a.type];
  const stride=view.byteStride??Type.BYTES_PER_ELEMENT*k,start=(view.byteOffset??0)+(a.byteOffset??0),out=new Float64Array(a.count*k);
  const data=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),read={5120:'getInt8',5121:'getUint8',5122:'getInt16',5123:'getUint16',5125:'getUint32',5126:'getFloat32'}[a.componentType];
  for(let i=0;i<a.count;i++)for(let c=0;c<k;c++){let v=data[read](start+i*stride+c*Type.BYTES_PER_ELEMENT,true);if(a.normalized)v=Math.max(v/NORMAL[a.componentType],-1);out[i*k+c]=v;}
  return out;
}
function local(node){
  if(node.matrix)return node.matrix;
  const [x,y,z,w]=node.rotation??[0,0,0,1],[sx,sy,sz]=node.scale??[1,1,1],[tx,ty,tz]=node.translation??[0,0,0];
  return [(1-2*(y*y+z*z))*sx,2*(x*y+z*w)*sx,2*(x*z-y*w)*sx,0,2*(x*y-z*w)*sy,(1-2*(x*x+z*z))*sy,2*(y*z+x*w)*sy,0,2*(x*z+y*w)*sz,2*(y*z-x*w)*sz,(1-2*(x*x+y*y))*sz,0,tx,ty,tz,1];
}
const multiply=(a,b)=>{const o=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;};
function imageSize(bytes){
  if(bytes[0]===0x89&&bytes[1]===0x50)return [new DataView(bytes.buffer,bytes.byteOffset).getUint32(16),new DataView(bytes.buffer,bytes.byteOffset).getUint32(20)];
  if(bytes[0]===0xff&&bytes[1]===0xd8)for(let i=2;i<bytes.length;){const m=bytes[i+1],l=bytes[i+2]*256+bytes[i+3];if(m>=0xc0&&m<=0xc2)return [bytes[i+7]*256+bytes[i+8],bytes[i+5]*256+bytes[i+6]];i+=2+l;}
  return [null,null];
}
// Mide un GLB: triángulos por parte, rol (tronco/hojas, misma regla que el generador), texturas y altura nativa.
export function medirGLB(buffer){
  const glb=leerGLB(buffer),{json,bin}=glb,partes=[];let minY=Infinity,maxY=-Infinity;
  const walk=(index,parent)=>{const node=json.nodes[index],world=multiply(parent,local(node));
    if(node.mesh!=null)for(const p of json.meshes[node.mesh].primitives){
      const material=json.materials?.[p.material]??{},positions=accessor(glb,p.attributes.POSITION);
      for(let i=0;i<positions.length;i+=3){const y=world[1]*positions[i]+world[5]*positions[i+1]+world[9]*positions[i+2]+world[13];minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      const count=p.indices!=null?json.accessors[p.indices].count:json.accessors[p.attributes.POSITION].count;
      partes.push({material:material.name??'',rol:material.alphaMode==='MASK'||material.alphaMode==='BLEND'||LEAF.test(material.name??'')?'hojas':'tronco',triangulos:count/3});
    }
    for(const child of node.children??[])walk(child,world);
  };
  for(const root of json.scenes[json.scene??0].nodes)walk(root,[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const texturas=(json.images??[]).map(image=>{const view=json.bufferViews[image.bufferView],bytes=bin.subarray(view.byteOffset??0,(view.byteOffset??0)+view.byteLength),[ancho,alto]=imageSize(bytes);
    return {nombre:image.name??null,formato:(image.mimeType??'').split('/').pop(),ancho,alto,bytes:view.byteLength};});
  return {triangulos:partes.reduce((s,p)=>s+p.triangulos,0),partes,texturas,alturaNativa:+(maxY-minY).toFixed(4),extensiones:json.extensionsUsed??[]};
}
// Recuento de árboles por especie en las exportaciones reales del visor (solo lectura).
function usoExportado(){
  const raiz=path.join(visor,'Mundo','Generados'),catalogo=path.join(raiz,'catalogo.json'),uso={};
  if(!fs.existsSync(catalogo))return uso;
  for(const place of JSON.parse(fs.readFileSync(catalogo,'utf8')).places??[]){
    const anclas=path.join(raiz,path.dirname(place.manifest),'anclas.json');if(!fs.existsSync(anclas))continue;
    const vistos=new Map();
    for(const a of JSON.parse(fs.readFileSync(anclas,'utf8')).anclas??[]){if(a.tipo!=='arbol')continue;const especie=a.especie??/^arbol:([^:]+):/.exec(a.resource??'')?.[1];if(!especie)continue;
      // Cada parte de un árbol es un ancla; se cuenta el ejemplar una vez por posición.
      const key=especie+'|'+a.x.toFixed(2)+'|'+a.z.toFixed(2);if(!vistos.has(key))vistos.set(key,especie);}
    for(const especie of vistos.values()){uso[especie]??={};uso[especie][place.label??place.id]=(uso[especie][place.label??place.id]??0)+1;}
  }
  return uso;
}
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const relativo=file=>path.relative(path.resolve(visor,'..'),file).split(path.sep).join('/');

export function construirCatalogo(){
  const exportado=usoExportado(),decor=path.join(visor,'assets','barcelona-decor');
  // Sin duplicar: los GLB originales ya existen idénticos (mismo SHA-256) en la decoración del visor;
  // las especies ez-tree se sirven desde el generador por el alias arboles-atlas/ de serve.py.
  const archivo=url=>{const file=path.join(publico,url.replace(/^\//,'')),bytes=fs.readFileSync(file),hash=sha(bytes),copia=path.join(decor,path.basename(file));
    const visor=fs.existsSync(copia)&&sha(fs.readFileSync(copia))===hash?'assets/barcelona-decor/'+path.basename(file):'arboles-atlas/'+path.relative(path.join(publico,'assets','arboles'),file).split(path.sep).join('/');
    return {file,bytes,hash,visor,medida:medirGLB(bytes)};};
  const tipos=TREE_CATALOG.map(t=>{
    const {file,bytes,hash,visor:visorUrl,medida}=archivo(t.url);
    // Un nivel de detalle fijo por lugar; los GLB originales repiten su único modelo en los cuatro niveles.
    const niveles=Object.fromEntries(Object.keys(TREE_DETAILS).map(nivel=>{const url=t.lods?.[nivel]??t.url,a=archivo(url);
      return [nivel,{generador:url,visor:a.visor,bytes:a.bytes.length,sha256:a.hash,triangulos:a.medida.triangulos,texturas:a.medida.texturas.map(x=>x.ancho+'×'+x.alto)}];}));
    const urban=URBAN_TREES.models.find(m=>m.file===path.basename(file));
    const uso=[...(urban?['Visor · Barcelona (decoración, modelo '+urban.id+')']:[]),
      ...Object.entries(TREE_SETS).filter(([,ids])=>ids.includes(t.id)).map(([set])=>'Generador · conjunto '+TREE_SET_NAMES[set]),
      ...Object.entries(exportado[t.id]??{}).map(([lugar,n])=>'Exportado · '+lugar+' ('+n+' ejemplares)')];
    return {id:t.id,nombre:t.name,cientifico:t.sci??null,tipo:t.kind,origen:t.origin,alturaM:t.height,peso:t.weight,calle:t.street,
      conjuntos:Object.keys(TREE_SETS).filter(set=>TREE_SETS[set].includes(t.id)),
      archivo:{generador:t.url,visor:visorUrl,fuente:relativo(file)},bytes:bytes.length,sha256:hash,
      triangulos:medida.triangulos,alturaNativa:medida.alturaNativa,partes:medida.partes,texturas:medida.texturas,extensiones:medida.extensiones,
      niveles,
      procedencia:t.origin==='ez-tree'?'ez-tree 1.1.0 (MIT, Daniel Greenheck), horneado con Generador-Mundos/scripts/hornear-arboles.mjs':'GLB original de SpanStories (prototipos/arbol-urbano)',
      uso};
  });
  return {formato:CATALOGO_VEGETACION.formato,version:CATALOGO_VEGETACION.version,generado:'SpanStories-Ciudades/scripts/catalogo_vegetacion.mjs',
    fuente:'Generador-Mundos/src/estudio/data/tree-catalog.js (TREE_CATALOG v'+TREE_CATALOG_VERSION+')',maxTiposPorLugar:MAX_TREE_TYPES,
    niveles:TREE_DETAILS,nivelPorDefecto:DEFAULT_TREE_DETAIL,
    rutas:{generador:'URL del servidor del generador (public/)',visor:'relativa a la raíz de SpanStories-Ciudades; arboles-atlas/ la sirve serve.py desde Generador-Mundos/public/assets/arboles/ sin copiar archivos'},
    conjuntos:Object.fromEntries(Object.entries(TREE_SETS).map(([id,ids])=>[id,{nombre:TREE_SET_NAMES[id],tipos:ids}])),
    tipos,otros:OTROS};
}
// Vegetación del programa que no es un tipo intercambiable por instancias (procedural, imposta o prototipo).
const OTROS=[
  {id:'ez-spreading',nombre:'Copa extendida (ez-tree procedural)',tipo:'arbol',origen:'procedural',archivo:'SpanStories-Ciudades/objetos/ProceduralTree.js',triangulos:2828,uso:['Sin uso: perfil heredado de TREE_VARIETY (routes.js); ningún módulo importa ProceduralTree.js']},
  {id:'ez-oval',nombre:'Copa ovalada (ez-tree procedural)',tipo:'arbol',origen:'procedural',archivo:'SpanStories-Ciudades/objetos/ProceduralTree.js',triangulos:2828,uso:['Sin uso: perfil heredado de TREE_VARIETY']},
  {id:'ez-asymmetric',nombre:'Ramas asimétricas (ez-tree procedural)',tipo:'arbol',origen:'procedural',archivo:'SpanStories-Ciudades/objetos/ProceduralTree.js',triangulos:2874,uso:['Sin uso: perfil heredado de TREE_VARIETY']},
  {id:'ez-vase',nombre:'Copa abierta (ez-tree procedural)',tipo:'arbol',origen:'procedural',archivo:'SpanStories-Ciudades/objetos/ProceduralTree.js',triangulos:2818,uso:['Sin uso: perfil heredado de TREE_VARIETY']},
  {id:'atlas-lejano',nombre:'Imposta lejana de los 4 originales',tipo:'imposta 2D',origen:'generado en tiempo de ejecución',archivo:'SpanStories-Ciudades/objetos/TreeAtlas.js',triangulos:2,uso:['Visor · Barcelona: LOD lejano de la decoración (atlas de siluetas)']},
  {id:'cesped',nombre:'Césped procedural (James)',tipo:'césped',origen:'procedural',archivo:'Generador-Mundos/src/estudio/render/grass.js',triangulos:null,uso:['Generador · suelo ajardinado (no es árbol ni arbusto)']},
  {id:'palmera-3d',nombre:'Palmera 3D (aeropuerto)',tipo:'palmera',origen:'prototipo',archivo:'worlds/prototypes/airport/assets/palm-tree-3d.glb',triangulos:19992,bytes:1875976,texturas:'3 JPEG (color, normal, rugosidad)',uso:['Prototipo del aeropuerto; no lo sirve el visor de ciudades']},
  {id:'palmera-frontal',nombre:'Palmera del frente (aeropuerto)',tipo:'palmera',origen:'prototipo',archivo:'worlds/prototypes/airport/assets/palma-frontal.glb',triangulos:320,bytes:1614860,texturas:'1 PNG',uso:['Prototipo del aeropuerto (EntrancePalms.js)']},
  {id:'planta-tropical',nombre:'Planta tropical en maceta (aeropuerto)',tipo:'planta en maceta',origen:'prototipo',archivo:'worlds/prototypes/airport/assets/planta-tropical.glb',triangulos:20318,bytes:2086588,texturas:'2 PNG',uso:['Prototipo del aeropuerto (TropicalPlants.js)']},
  {id:'bromelia',nombre:'Bromelia (aeropuerto)',tipo:'planta',origen:'prototipo',archivo:'worlds/prototypes/airport/assets/bromelia.glb',triangulos:15840,bytes:2416116,texturas:'3 PNG',uso:['Prototipo del aeropuerto']},
  {id:'siluetas-aeropuerto',nombre:'Árboles y arbustos 2D (tree-1…4, bush-1…5)',tipo:'imposta 2D',origen:'prototipo',archivo:'worlds/prototypes/airport/assets/trees/',triangulos:null,texturas:'9 PNG + capas',uso:['Prototipo del aeropuerto (fondos planos)']},
  {id:'palma-hotel',nombre:'Palma en maceta (hotel)',tipo:'palmera',origen:'procedural',archivo:'worlds/prototypes/hotel/objetos/Palma.js',triangulos:null,uso:['Prototipo del hotel']},
  {id:'planta-hotel',nombre:'Planta en maceta (hotel)',tipo:'planta en maceta',origen:'procedural',archivo:'worlds/prototypes/hotel/objetos/Planta.js',triangulos:null,uso:['Prototipo del hotel']},
].map(o=>({...o,intercambiable:false}));

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const catalogo=validarCatalogoVegetacion(construirCatalogo()),texto=JSON.stringify(catalogo,null,1)+'\n';
  if(process.argv.includes('--check')){
    const actual=fs.existsSync(destino)?fs.readFileSync(destino,'utf8'):'';
    if(actual!==texto){console.error('El catálogo no está al día: ejecuta node scripts/catalogo_vegetacion.mjs');process.exit(1);}
    console.log('Catálogo al día: '+catalogo.tipos.length+' tipos.');
  }else{fs.writeFileSync(destino,texto);console.log('Escrito '+path.relative(process.cwd(),destino)+' · '+catalogo.tipos.length+' tipos, '+catalogo.otros.length+' otros.');}
}
