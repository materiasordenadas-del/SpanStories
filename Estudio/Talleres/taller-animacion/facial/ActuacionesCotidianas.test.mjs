import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DAILY_ACTINGS,PERFILES,perfilDeRuta,urlDeCuerpo} from './ActuacionesCotidianas.mjs';
import {ACTINGS} from './ActingLibrary.mjs';

const paquetes=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../biblioteca/paquetes');

/** Nombre del movimiento sin la marca «loop»: la versión Loop y la no-Loop del mismo movimiento comparten clave. */
const movimiento=ruta=>path.posix.basename(ruta).replace(/\.[^.]+$/,'').toLowerCase().replace(/[ _]?loop(?=\d|\b|_|\s|$)/g,'').replace(/[\s_]+/g,' ').trim();

test('hay 50 actuaciones cotidianas congeladas con los campos pedidos',()=>{
  assert.equal(DAILY_ACTINGS.length,50);
  assert.ok(Object.isFrozen(DAILY_ACTINGS));
  for(const a of DAILY_ACTINGS){
    assert.ok(Object.isFrozen(a),a.id);
    assert.match(a.id,/^daily-([1-9]|[1-4]\d|50)$/);
    for(const k of ['name','category','subcategory','faceNotes'])assert.ok(typeof a[k]==='string'&&a[k].trim().length>3,`${a.id}.${k}`);
    assert.equal(a.faceStatus,'listo');
    assert.ok(PERFILES.some(p=>p.id===a.perfil),a.id);
    assert.equal(a.body.raiz,'paquetes');
    assert.ok(!a.body.ruta.includes('\\')&&!a.body.ruta.startsWith('/'),a.id);
  }
  assert.deepEqual(DAILY_ACTINGS.map(a=>a.id),Array.from({length:50},(_,i)=>`daily-${i+1}`));
});

test('ids, nombres y rutas son únicos',()=>{
  for(const campo of [a=>a.id,a=>a.name,a=>a.body.ruta.toLowerCase()])assert.equal(new Set(DAILY_ACTINGS.map(campo)).size,50);
});

test('cada ruta existe en disco y el perfil es el de su subcarpeta',()=>{
  for(const a of DAILY_ACTINGS){
    const archivo=path.resolve(paquetes,a.body.ruta);
    assert.ok(archivo.startsWith(paquetes+path.sep),`${a.id}: la ruta sale de paquetes`);
    assert.ok(fs.statSync(archivo).isFile(),`${a.id}: no existe ${a.body.ruta}`);
    assert.equal(a.perfil,perfilDeRuta(a.body.ruta),a.id);
  }
  assert.equal(perfilDeRuta('Conversations Michael 8/Masculinas/x.fbx'),'male');
  assert.equal(perfilDeRuta('Church People/Femeninas/x.FBX'),'female');
  assert.equal(perfilDeRuta('100 Idle Animation Pack/x.fbx'),'unspecified');
});

test('no se repite el mismo movimiento en versión loop y no-loop',()=>{
  const vistos=new Map();
  for(const a of DAILY_ACTINGS){
    const clave=movimiento(a.body.ruta);
    assert.ok(!vistos.has(clave),`${a.id} repite el movimiento de ${vistos.get(clave)} («${clave}»)`);
    vistos.set(clave,a.id);
  }
});

test('ningún id choca con las actuaciones procedurales de ActingLibrary',()=>{
  const propios=new Set(ACTINGS.map(a=>a.id));
  assert.ok(propios.size>=50);
  for(const a of DAILY_ACTINGS)assert.ok(!propios.has(a.id),a.id);
});

test('la URL del clip sale de /api/biblioteca (el servidor llama «r0», «r1»… a sus raíces)',()=>{
  const a=DAILY_ACTINGS.find(x=>x.body.ruta.includes('Sin especificar'));
  const url='/bib/r0/'+a.body.ruta.split('/').map(encodeURIComponent).join('/');
  const lista={archivos:[{raiz:'local',ruta:a.body.ruta,url:'/bib/local/x'},{raiz:'r0',ruta:a.body.ruta,url}]};
  assert.equal(urlDeCuerpo(a.body,lista,'http://127.0.0.1:5189'),'http://127.0.0.1:5189'+url);
  assert.throws(()=>urlDeCuerpo({ruta:'no/existe.fbx'},lista),/no está en la biblioteca/);
});

test('la interfaz agrupa por categoría › subcategoría y filtra por texto y perfil',async()=>{
  const {agruparActuaciones,filtrarActuaciones}=await import('./ActuacionesCotidianas.mjs');
  const grupos=agruparActuaciones(DAILY_ACTINGS);
  assert.equal(grupos.reduce((n,g)=>n+g.lista.length,0),50);
  assert.ok(grupos.every(g=>g.titulo.includes(' › ')));
  assert.equal(new Set(DAILY_ACTINGS.map(a=>a.category)).size,7);
  assert.equal(filtrarActuaciones(DAILY_ACTINGS).length,50);
  for(const p of PERFILES){const n=filtrarActuaciones(DAILY_ACTINGS,'',p.id);assert.ok(n.length>0&&n.every(a=>a.perfil===p.id),p.id);}
  assert.ok(filtrarActuaciones(DAILY_ACTINGS,'cafe').some(a=>/café/.test(a.name)));
  assert.deepEqual(filtrarActuaciones(DAILY_ACTINGS,'zzzz'),[]);
});

test('el tiempo del cuerpo da la vuelta en bucle y se queda al final si no repite',async()=>{
  const {tiempoDeCuerpo}=await import('./CuerpoBiblioteca.mjs');
  assert.equal(tiempoDeCuerpo(1000,1000,4,true),0);
  assert.ok(Math.abs(tiempoDeCuerpo(6000,1000,4,true)-1)<1e-9);
  assert.equal(tiempoDeCuerpo(9000,1000,4,false),4);
  assert.equal(tiempoDeCuerpo(500,1000,4,true),0);
});

// ---------- Base: que ningún clip cotidiano se trabe (pose T en los extremos, congelado al final o tirón al repetir) ----------
function clipFalso(frames,fn,hips=null){
  const tracks={upperArmL:new Float32Array(frames*4)};
  for(let i=0;i<frames;i++){const a=fn(i)/2;tracks.upperArmL.set([Math.sin(a),0,0,Math.cos(a)],i*4);}
  return {fps:30,frames,duration:(frames-1)/30,loop:false,tracks,hips:hips||new Float32Array(frames*3)};
}
const grados=(t,i,j)=>2*Math.acos(Math.min(1,Math.abs(t[i*4]*t[j*4]+t[i*4+1]*t[j*4+1]+t[i*4+2]*t[j*4+2]+t[i*4+3]*t[j*4+3])))*180/Math.PI;

test('recortarSaltos quita los fotogramas de pose de enlace del principio y del final',async()=>{
  const {recortarSaltos}=await import('./CuerpoBiblioteca.mjs');
  // fotogramas 0 y 1 en pose T (90°), luego movimiento suave; último fotograma de nuevo en pose T
  const c=recortarSaltos(clipFalso(60,i=>i<2||i===59?Math.PI/2:.01*i));
  assert.deepEqual(c.recorte,[2,1]);
  assert.equal(c.frames,57);
  for(let i=1;i<c.frames;i++)assert.ok(grados(c.tracks.upperArmL,i-1,i)<5,`salto en ${i}`);
});

test('cerrarBucle deja todos los clips en bucle, sin tirón al volver al principio y sin cambiar de camino',async()=>{
  const {cerrarBucle}=await import('./CuerpoBiblioteca.mjs');
  // termina casi a 180° del principio: el fundido no debe saltar entre los dos caminos cortos
  const c=cerrarBucle(clipFalso(120,i=>i*(Math.PI*.99)/119));
  assert.equal(c.loop,true);
  const t=c.tracks.upperArmL;
  assert.ok(grados(t,0,c.frames-1)<.5,'el último fotograma vuelve al primero');
  for(let i=1;i<c.frames;i++)assert.ok(grados(t,i-1,i)<25,`salto de ${grados(t,i-1,i).toFixed(0)}° en ${i}`);
  // un clip que ya cierra no se toca
  const quieto=clipFalso(40,()=>.3);assert.equal(cerrarBucle(quieto).tracks,quieto.tracks);
});

test('forzarEscritura obliga a three.js a reescribir los huesos aunque el valor no cambie',async()=>{
  const T=await import('three');const {forzarEscritura}=await import('./CuerpoBiblioteca.mjs');
  const hueso=new T.Bone();hueso.name='b';const raiz=new T.Object3D();raiz.add(hueso);
  const clip=new T.AnimationClip('c',1,[new T.QuaternionKeyframeTrack('b.quaternion',[0,1],[0,0,.7071,.7071,0,0,.7071,.7071])]);
  const mixer=new T.AnimationMixer(raiz);mixer.clipAction(clip).play();
  mixer.update(0);mixer.update(0);
  hueso.quaternion.identity();                 // la vida devuelve el hueso a reposo
  mixer.update(0);assert.ok(hueso.quaternion.z<.1,'sin forzar, three.js no reescribe (el fallo original)');
  forzarEscritura(mixer);mixer.update(0);
  assert.ok(Math.abs(hueso.quaternion.z-.7071)<1e-3,'forzado, el hueso vuelve a la pose del clip');
});
