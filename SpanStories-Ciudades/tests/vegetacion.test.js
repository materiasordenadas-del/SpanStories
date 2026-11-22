import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as T from '../engine/three.js';
import {near} from '../engine/layout.js';
import {atlasEntity,AtlasAssets} from '../engine/AtlasPlaces.js';
import {CityStyle} from '../engine/CityStyle.js';
import {RegistroCiudad} from '../engine/CityRegistry.js';
import {CATALOGO_VEGETACION,validarCatalogoVegetacion,validarCambios,plantillaEspecie,sustituirEspecie,restaurarEspecie,
  agruparArboles,alturaNativa,factorEscala,especiesDeAnclas,mallasPorEspecie,VegetacionAtlas,leerPersistido} from '../engine/VegetacionAtlas.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),generador=path.resolve(root,'..','Generador-Mundos');
const catalogoReal=path.join(generador,'public','assets','arboles','catalogo.json');
const nearBox=(a,b,eps=.005)=>['x','y','z'].every(k=>near(a.min[k],b.min[k],eps)&&near(a.max[k],b.max[k],eps));
const tipo=(id,alturaM,extra={})=>({id,nombre:id,tipo:'arbol',origen:'ez-tree',alturaM,conjuntos:[],archivo:{generador:'/assets/'+id+'.glb',visor:'arboles-atlas/eztree/'+id+'.glb'},
  bytes:1,sha256:'0'.repeat(64),triangulos:2,partes:[{material:'corteza',rol:'tronco',triangulos:1},{material:'hojas',rol:'hojas',triangulos:1}],texturas:[],...extra});
function catalogo(destinoAltura=[12,16]){
  return validarCatalogoVegetacion({formato:CATALOGO_VEGETACION.formato,version:1,maxTiposPorLugar:4,conjuntos:{},otros:[],
    tipos:[tipo('anime',[8,12]),tipo('jabami',[8,12]),tipo('sakura',[5,7]),tipo('anime2',[6,9]),tipo('platano',destinoAltura),tipo('matorral',[2,3],{tipo:'arbusto'})]});
}
// Sector como lo exporta el generador: un InstancedMesh por parte, base en y=0 y matrices por ejemplar.
const ARBOLES=[{p:[10,1,-4],ry:.4,s:[1.1,.9,1]},{p:[-6,0,8],ry:2.1,s:[.8,.8,.85]},{p:[3,-.5,3],ry:-1,s:[1,1.2,1]}];
function sector({alturaA=10,especie='anime'}={}){
  const scene=new T.Group(),q=new T.Quaternion(),m=new T.Matrix4();
  const trunk=new T.BoxGeometry(.4,alturaA*.6,.4).translate(0,alturaA*.3,0),leaves=new T.BoxGeometry(4,alturaA*.6,4).translate(0,alturaA*.7,0);
  const parts=[['trunk_M',trunk,new T.MeshStandardMaterial(),[1,2,3],false],['Leaves_M',leaves,new T.MeshStandardMaterial({alphaTest:.45}),[4,5,6],true]];
  for(const [name,geometry,material,ids,leaf]of parts){
    const mesh=new T.InstancedMesh(geometry,material,ARBOLES.length),order=leaf?[2,1,0]:[0,1,2]; // las hojas, en otro orden
    order.forEach((k,i)=>{const a=ARBOLES[k];mesh.setMatrixAt(i,m.compose(new T.Vector3(...a.p),q.setFromAxisAngle(new T.Vector3(0,1,0),a.ry),new T.Vector3(...a.s)));if(leaf)mesh.setColorAt(i,new T.Color(.5+.1*k,.6,.4));});
    mesh.userData={prefab:'arbol:'+especie+':'+name,tipo:'arbol',instanceEntityIds:order.map(k=>ids[k]),atlasAlphaCutout:leaf};mesh.name='prefab_arbol_vegetacion_t1';scene.add(mesh);
  }
  scene.updateMatrixWorld(true);return scene;
}
const entities={1:'arbol:t1',2:'arbol:t2',3:'arbol:t3',4:'arbol:h1',5:'arbol:h2',6:'arbol:h3'};
// GLB del destino: fuera de origen y con base elevada, para comprobar que la plantilla se apoya y centra.
function glbDestino(){
  const scene=new T.Group(),trunk=new T.Mesh(new T.CylinderGeometry(.2,.3,3,6).translate(5,6.5,-2),new T.MeshStandardMaterial({name:'corteza'}));
  const leaves=new T.Mesh(new T.SphereGeometry(2.5,8,6).translate(5,9.5,-2),new T.MeshStandardMaterial({name:'hojas',alphaTest:.5,transparent:false}));
  scene.add(trunk,leaves);return scene;
}
function cajasPorArbol(meshes){const out=ARBOLES.map(()=>new T.Box3()),m=new T.Matrix4();
  for(const mesh of meshes){mesh.geometry.computeBoundingBox();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);const k=ARBOLES.findIndex(a=>near(a.p[0],m.elements[12])&&near(a.p[2],m.elements[14]));out[k].union(mesh.geometry.boundingBox.clone().applyMatrix4(m));}}
  return out;}

test('el catálogo real es válido, está al día y coincide con TREE_CATALOG y con sus GLB',async t=>{
  if(!fs.existsSync(catalogoReal))return t.skip('Generador-Mundos no está junto al visor');
  const c=validarCatalogoVegetacion(JSON.parse(fs.readFileSync(catalogoReal,'utf8')));
  const {TREE_CATALOG,TREE_SETS,MAX_TREE_TYPES}=await import(pathToFileURL(path.join(generador,'src/estudio/data/tree-catalog.js')).href);
  assert.deepEqual(c.tipos.map(x=>x.id),TREE_CATALOG.map(x=>x.id));assert.equal(c.maxTiposPorLugar,MAX_TREE_TYPES);
  for(const x of c.tipos){const s=TREE_CATALOG.find(y=>y.id===x.id);assert.equal(x.nombre,s.name);assert.equal(x.tipo,s.kind);assert.deepEqual(x.alturaM,s.height);assert.equal(x.archivo.generador,s.url);
    // Ruta servible por el visor: copia idéntica existente o alias arboles-atlas/ de serve.py.
    const file=x.archivo.visor.startsWith('arboles-atlas/')?path.join(generador,'public/assets/arboles',x.archivo.visor.slice(14)):path.join(root,x.archivo.visor),bytes=fs.readFileSync(file);
    assert.equal(bytes.length,x.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),x.sha256);}
  for(const [id,ids]of Object.entries(TREE_SETS))assert.deepEqual(c.conjuntos[id].tipos,ids);
  assert.ok(c.tipos.some(x=>x.tipo==='arbusto'));assert.ok(c.otros.length>0);
  const {construirCatalogo}=await import('../scripts/catalogo_vegetacion.mjs');assert.deepEqual(construirCatalogo(),c,'Ejecuta node scripts/catalogo_vegetacion.mjs');
});
test('el validador rechaza catálogos que el visor no podría servir o que rompen el máximo de tipos',()=>{
  const ok=catalogo();
  assert.throws(()=>validarCatalogoVegetacion({...ok,tipos:[...ok.tipos,tipo('anime',[1,2])]}),/id anime/);
  assert.throws(()=>validarCatalogoVegetacion({...ok,tipos:[tipo('x',[1,2],{archivo:{generador:'/a.glb',visor:'../fuera.glb'}})]}),/ruta del visor/);
  assert.throws(()=>validarCatalogoVegetacion({...ok,conjuntos:{c:{tipos:['anime','jabami','sakura','anime2','platano']}}}),/conjunto c/);
  assert.throws(()=>validarCatalogoVegetacion({...ok,tipos:[tipo('x',[1,2],{triangulos:3})]}),/triángulos/);
});
test('los cambios son biyectivos y nunca superan 4 tipos',()=>{
  const c=catalogo(),origenes=['anime','jabami','sakura','anime2'];
  assert.deepEqual(validarCambios({anime:'platano',jabami:'jabami'},origenes,c),{anime:'platano'});
  assert.throws(()=>validarCambios({anime:'jabami'},origenes,c),/distinto/);
  assert.throws(()=>validarCambios({anime:'roble'},origenes,c),/catálogo/);
  assert.throws(()=>validarCambios({platano:'anime'},origenes,c),/desconocido/);
  assert.throws(()=>validarCambios({},[...origenes,'platano'],c),/máximo de 4|como máximo 4/);
  assert.deepEqual(validarCambios({anime:'jabami',jabami:'anime'},origenes,c),{anime:'jabami',jabami:'anime'});
});
test('cambiar un tipo conserva matrices, apoyo, centro e identidad por instancia',()=>{
  const c=catalogo(),root=sector(),antes=mallasPorEspecie(root).get('anime'),cajasA=cajasPorArbol(antes),alturaA=alturaNativa(antes);
  const plantilla=plantillaEspecie(glbDestino(),c.tipos.find(t=>t.id==='platano'));
  assert.equal(plantilla.partes.length,2);assert.deepEqual(plantilla.partes.map(p=>p.rol),['tronco','hojas']);
  const base=new T.Box3();for(const p of plantilla.partes){p.geometry.computeBoundingBox();base.union(p.geometry.boundingBox);}
  assert.ok(near(base.min.y,0)&&near((base.min.x+base.max.x)/2,0)&&near((base.min.z+base.max.z)/2,0),'plantilla apoyada y centrada');
  const f=factorEscala({alturaOrigen:alturaA,origen:c.tipos[0],destino:plantilla.entry,alturaDestinoNativa:plantilla.alturaNativa});
  const geometria=plantilla.partes.map(p=>p.geometry.clone().scale(f,f,f));
  const {mallas,limites}=sustituirEspecie(root,{origen:'anime',plantilla,geometria,style:null,entities});
  assert.equal(mallas.length,2,'un InstancedMesh por parte del destino');assert.ok(mallas.every(m=>m.isInstancedMesh&&m.count===3));
  assert.deepEqual(mallas.map(m=>m.userData.prefab),['arbol:platano:corteza','arbol:platano:hojas']);
  assert.ok(antes.every(m=>!m.visible));
  // Matrices idénticas a las del tronco original (posición, giro y escala).
  for(let i=0;i<3;i++)for(let k=0;k<16;k++)assert.ok(near(mallas[0].instanceMatrix.array[i*16+k],antes[0].instanceMatrix.array[i*16+k],1e-6));
  for(let i=0;i<3;i++)assert.deepEqual([...mallas[1].instanceMatrix.array.slice(i*16,i*16+16)],[...mallas[0].instanceMatrix.array.slice(i*16,i*16+16)]);
  const cajasB=cajasPorArbol(mallas),ratio=14/10;
  cajasB.forEach((b,k)=>{const a=cajasA[k],s=ARBOLES[k].s[1];
    assert.ok(near(b.min.y,a.min.y),'apoyo en el mismo suelo');
    assert.ok(near(b.max.y-b.min.y,(a.max.y-a.min.y)*ratio,.01),'altura proporcional al catálogo');
    assert.ok(near(b.max.y-b.min.y,10*s*ratio,.01));
    assert.ok(near((b.min.x+b.max.x)/2,(a.min.x+a.max.x)/2,.05)&&near((b.min.z+b.max.z)/2,(a.min.z+a.max.z)/2,.05),'mismo eje');});
  // El tronco del destino conserva los IDs del tronco y las hojas los de las hojas, en cada posición.
  ARBOLES.forEach((a,i)=>{assert.equal(atlasEntity({object:mallas[0],instanceId:i},entities),entities[1+i]);assert.equal(atlasEntity({object:mallas[1],instanceId:i},entities),entities[4+i]);});
  assert.equal(limites.size,6);for(let i=0;i<3;i++){assert.ok(nearBox(limites.get(entities[1+i]),cajasB[i]));assert.ok(nearBox(limites.get(entities[4+i]),cajasB[i]));}
  // Tono por ejemplar heredado de las hojas originales.
  const tonos=[0,1,2].map(i=>mallas[1].instanceColor.array[i*3]);assert.ok(tonos[0]<tonos[1]&&tonos[1]<tonos[2]);
  // Restablecer: vuelven las mallas y límites originales y no queda ninguna sustituta.
  const back=restaurarEspecie(root,{origen:'anime',entities});
  assert.ok(antes.every(m=>m.visible&&m.parent===root));let left=0;root.traverse(o=>{if(o.userData.vegetacionSustituto)left++;});assert.equal(left,0);
  assert.ok(nearBox(back.get(entities[1]),new T.Box3().copy(antes[0].geometry.boundingBox).applyMatrix4(new T.Matrix4().fromArray(antes[0].instanceMatrix.array,0))));
});
test('con medidas base diferentes las alturas siguen la regla, sin retocar el cambio',()=>{
  for(const [alturaA,destino]of [[6,[4,6]],[13.13,[20,28]],[2.9,[2,3]]]){
    const c=catalogo(destino),root=sector({alturaA}),plantilla=plantillaEspecie(glbDestino(),c.tipos.find(t=>t.id==='platano')),antes=mallasPorEspecie(root).get('anime'),cajasA=cajasPorArbol(antes);
    const f=factorEscala({alturaOrigen:alturaNativa(antes),origen:c.tipos[0],destino:plantilla.entry,alturaDestinoNativa:plantilla.alturaNativa});
    const {mallas}=sustituirEspecie(root,{origen:'anime',plantilla,geometria:plantilla.partes.map(p=>p.geometry.clone().scale(f,f,f)),entities});
    const ratio=(destino[0]+destino[1])/2/10;cajasPorArbol(mallas).forEach((b,k)=>{assert.ok(near(b.max.y-b.min.y,(cajasA[k].max.y-cajasA[k].min.y)*ratio,.01));assert.ok(near(b.min.y,cajasA[k].min.y));});
  }
});
test('el ejemplar se agrupa por posición aunque las partes lleguen en otro orden',()=>{
  const meshes=mallasPorEspecie(sector()).get('anime'),{arboles}=agruparArboles(meshes);
  assert.equal(arboles.length,3);assert.deepEqual(arboles.map(a=>a.ids),[[1,4],[2,5],[3,6]]);assert.deepEqual(arboles.map(a=>a.porRol),[{tronco:1,hojas:4},{tronco:2,hojas:5},{tronco:3,hojas:6}]);
});
test('el estilo del visor adapta las sustitutas con contorno instanciado solo en el tronco',()=>{
  const style=new CityStyle(),c=catalogo(),root=sector(),plantilla=plantillaEspecie(glbDestino(),c.tipos.find(t=>t.id==='platano'));
  const {mallas}=sustituirEspecie(root,{origen:'anime',plantilla,geometria:plantilla.partes.map(p=>p.geometry),style,entities});
  const shell=mallas[0].children.find(o=>o.userData.cityOutline);assert.equal(shell.isInstancedMesh,true);assert.equal(shell.instanceMatrix,mallas[0].instanceMatrix);
  assert.equal(mallas[1].children.length,0);assert.ok(mallas.every(m=>m.material.vertexShader.includes('instanceColor')));
  restaurarEspecie(root,{origen:'anime',entities});style.dispose();
});
test('el adaptador del lugar actualiza la caja de selección de un árbol cambiado',()=>{
  const objetos=new RegistroCiudad(),proxy=new T.Group(),a=new T.Box3(new T.Vector3(0,0,0),new T.Vector3(1,1,1)),b=new T.Box3(new T.Vector3(0,0,0),new T.Vector3(2,9,2));
  proxy.userData.atlasBounds=a.clone();objetos.registrar(proxy,{id:'arbol:t1',etiqueta:'Árbol'});
  const record={sector:{id:'s1'},entityBounds:new Map([['arbol:t1',a]])},fake={parts:new Map([['arbol:t1',new Map([['s1',a]])]]),objetos};
  AtlasAssets.prototype.actualizarLimites.call(fake,record,new Map([['arbol:t1',b]]));
  assert.ok(nearBox(proxy.userData.atlasBounds,b));assert.ok(nearBox(record.entityBounds.get('arbol:t1'),b));
});
test('el controlador lee el catálogo y las anclas, persiste por lugar y lo aplica al recargar un sector',async()=>{
  const c=catalogo(),saved=new Map(),store={load:async k=>saved.get(k),save:async(k,v)=>{saved.set(k,structuredClone(v));}};
  const anclas={anclas:[...ARBOLES.flatMap(a=>['trunk_M','Leaves_M'].map(p=>({tipo:'arbol',x:a.p[0],z:a.p[2],resource:'arbol:anime:'+p}))),{tipo:'arbol',x:0,z:0,resource:'arbol:jabami:x'}]};
  assert.deepEqual([...especiesDeAnclas(anclas)],[['anime',3],['jabami',1]]);
  const fetcher=async url=>({ok:true,status:200,json:async()=>String(url).endsWith('catalogo.json')?structuredClone(c):anclas});
  let cargas=0;const opciones=records=>({zoneId:'atlas-prueba',revision:'r1',manifestUrl:'http://localhost/Mundo/Generados/atlas-prueba/revisiones/r1/zona.json',baseUrl:'http://localhost/',
    entities,store,fetcher,cargarEspecie:async entry=>{cargas++;return plantillaEspecie(glbDestino(),entry);},records:()=>records});
  const r1={sector:{id:'s1'},root:sector(),entityBounds:new Map(),controller:new AbortController()},limites=[];
  const v=new VegetacionAtlas({...opciones([r1]),actualizarLimites:(r,b)=>limites.push(b.size)});
  assert.equal(await v.iniciar(),true);await v.sincronizar(r1);
  assert.deepEqual(v.tiposLugar().map(t=>[t.origen,t.actual,t.ejemplares]),[['anime','anime',3],['jabami','jabami',1]]);
  await v.cambiar('anime','platano');
  assert.equal(r1.root.children.filter(o=>o.userData.vegetacionSustituto==='anime').length,2);assert.deepEqual(limites,[6]);
  const record=saved.get('vegetacion:atlas-prueba');assert.deepEqual(leerPersistido(record,'atlas-prueba').cambios,{anime:'platano'});
  await assert.rejects(v.cambiar('jabami','platano'),/distinto/);
  assert.ok(v.retainedRoots()[0].children.length>=2,'recursos compartidos retenidos al descargar sectores');
  // Otra sesión: el sector recién cargado recibe el tipo guardado antes de registrarse.
  const r2={sector:{id:'s1'},root:sector(),entityBounds:new Map(),controller:new AbortController()},w=new VegetacionAtlas({...opciones([])});
  await w.sincronizar(r2);assert.equal(w.cambios.anime,'platano');assert.equal(r2.root.children.filter(o=>o.userData.vegetacionSustituto==='anime').length,2);
  assert.equal(r2.entityBounds.size,0,'sin actualizarLimites propio, el mapa se actualiza por el adaptador');
  await w.restablecer();assert.deepEqual(saved.get('vegetacion:atlas-prueba').cambios,{});
  assert.throws(()=>leerPersistido(record,'otro-lugar'),/otro lugar/);
  assert.equal(cargas,2,'una plantilla por especie y sesión');v.dispose();w.dispose();
});
test('el nivel de detalle es uno fijo por lugar: cambia la malla sin cambiar el tipo, matrices ni límite de 4',async()=>{
  const niveles={alto:'Alto',medio:'Medio',bajo:'Bajo',muyBajo:'Muy bajo'},lods=(id,ez)=>Object.fromEntries(Object.keys(niveles).map(n=>[n,{generador:'/a/'+id+'.glb',visor:ez&&n!=='medio'?'arboles-atlas/eztree/'+id+'-'+n.toLowerCase()+'.glb':'arboles-atlas/eztree/'+id+'.glb',bytes:1,sha256:'0'.repeat(64),triangulos:n==='alto'?4:2}]));
  const c=validarCatalogoVegetacion({formato:CATALOGO_VEGETACION.formato,version:1,maxTiposPorLugar:4,conjuntos:{},otros:[],niveles,nivelPorDefecto:'medio',
    tipos:[tipo('anime',[8,12],{niveles:lods('anime',false)}),tipo('encina',[8,12],{niveles:lods('encina',true)}),tipo('platano',[12,16],{niveles:lods('platano',true)})]});
  assert.throws(()=>validarCatalogoVegetacion({...c,tipos:[tipo('x',[1,2],{niveles:{...lods('x',true),medio:{...lods('x',true).alto}}})]}),/nivel por defecto/);
  const saved=new Map(),store={load:async k=>saved.get(k),save:async(k,v)=>{saved.set(k,structuredClone(v));}},cargas=[];
  const anclas={anclas:ARBOLES.flatMap(a=>[{tipo:'arbol',x:a.p[0],z:a.p[2],resource:'arbol:anime:trunk_M'},{tipo:'arbol',x:a.p[0]+1,z:a.p[2],especie:'encina',resource:'arbol:encina:corteza'}])};
  const fetcher=async url=>({ok:true,status:200,json:async()=>String(url).endsWith('catalogo.json')?structuredClone(c):anclas});
  const root=sector();const enc=sector({especie:'encina'});for(const o of [...enc.children]){o.instanceMatrix.array.forEach((v,i,a)=>{if(i%16===12)a[i]+=1;});root.add(o);}
  const record={sector:{id:'s'},root,entityBounds:new Map(),controller:new AbortController()};
  const v=new VegetacionAtlas({zoneId:'atlas-lod',manifestUrl:'http://localhost/z/zona.json',baseUrl:'http://localhost/',entities,store,fetcher,records:()=>[record],
    cargarEspecie:async(entry,nivel)=>{cargas.push(entry.id+'@'+nivel);return plantillaEspecie(glbDestino(),entry);}});
  await v.iniciar();assert.equal(v.detalle,'medio');await v.sincronizar(record);assert.equal(cargas.length,0,'lo exportado ya es el nivel medio');
  await v.cambiarDetalle('bajo');
  // El GLB original repite su modelo: no se sustituye. La encina pasa a su GLB bajo con su mismo tipo.
  const sust=o=>root.children.filter(x=>x.userData.vegetacionSustituto===o);
  assert.equal(sust('anime').length,0);assert.equal(sust('encina').length,2);assert.ok(sust('encina').every(m=>/^arbol:encina:/.test(m.userData.prefab)));
  assert.deepEqual(cargas,['encina@bajo']);
  const ref=mallasPorEspecie(root).get('encina')[0];for(let k=0;k<48;k++)assert.ok(near(sust('encina')[0].instanceMatrix.array[k],ref.instanceMatrix.array[k],1e-6));
  await v.cambiar('anime','platano');assert.deepEqual(cargas,['encina@bajo','platano@bajo']);assert.equal(sust('anime').length,2);
  assert.equal(new Set(v.tiposLugar().map(t=>t.actual)).size,2);assert.ok(v.tiposLugar().length<=4);
  assert.equal(saved.get('vegetacion:atlas-lod').detalle,'bajo');
  await assert.rejects(v.cambiarDetalle('ultra'),/desconocido/);
  await v.cambiarDetalle('medio');assert.equal(sust('encina').length,0,'volver al nivel exportado restaura los originales');assert.equal(sust('anime').length,2);
  await v.restablecer();assert.equal(sust('anime').length,0);assert.equal(saved.get('vegetacion:atlas-lod').detalle,'medio');v.dispose();
});
