import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import {luz} from '../engine/Luz25D.js';
import {CityStyle} from '../engine/CityStyle.js';
import {GestorEstilos,ESTILOS} from '../engine/Estilos/index.js';
import {RenderMaterials} from '../engine/CityRenderOptimization.js';
import {readFileSync,statSync} from 'node:fs';
import {NUBES,TEXTURA_NUBES,TEXTURAS_NUBES} from '../engine/Estilos/StudioGhibli/Cielo.js';

function setup(){const estilos=new GestorEstilos({estilos:ESTILOS,luz,storage:null}),style=new CityStyle({estilos});return {estilos,style};}

test('three generated RGBA clouds keep the original bounded angular sizes',()=>{
  assert.equal(TEXTURAS_NUBES.length,3);
  assert.equal(new Set(TEXTURAS_NUBES.map(t=>t.archivo)).size,3);
  for(const {archivo} of TEXTURAS_NUBES){
    const url=new URL('../engine/Estilos/StudioGhibli/assets/'+archivo,import.meta.url),png=readFileSync(url);
    assert.equal(png.readUInt32BE(16),TEXTURA_NUBES.ancho);assert.equal(png.readUInt32BE(20),TEXTURA_NUBES.alto);
    assert.equal(png[25],6); // truecolor + alpha
    assert.ok(statSync(url).size<400*1024);
  }
  const aspect=TEXTURA_NUBES.ancho/TEXTURA_NUBES.alto;
  for(const cloud of NUBES){
    assert.ok(cloud.anchoGrados<=36);
    const [x,y,z]=cloud.direccion,elevation=Math.atan2(y,Math.hypot(x,z));
    const halfHeight=Math.atan(Math.tan(cloud.anchoGrados*Math.PI/360)/aspect);
    assert.ok(elevation-halfHeight>0,'cloud footprint must not reach the ground/horizon');
  }
});

test('Zelda and Trigun recover their exact shader programs after Ghibli',()=>{
  const {estilos,style}=setup(),source=new T.MeshStandardMaterial(),m=style.material(source);
  try{for(const id of ['Zelda','Trigun']){
    estilos.seleccionar(id);const original={vertex:m.vertexShader,fragment:m.fragmentShader};
    estilos.seleccionar('StudioGhibli');estilos.seleccionar(id);
    assert.equal(m.vertexShader,original.vertex);assert.equal(m.fragmentShader,original.fragment);
  }}finally{style.dispose();estilos.dispose();source.dispose();}
});

test('Ghibli retains surface coordinates, skin/morph and live GPU variants across extensions',()=>{
  const {estilos,style}=setup(),source=new T.MeshStandardMaterial({color:'#af6650'}),geometry=new T.BoxGeometry(),variants=new RenderMaterials();
  const m=style.material(source,'character',true),original=m.vertexShader;
  const batch=variants.get(m,geometry,'batched');
  try{
    estilos.seleccionar('StudioGhibli');assert.match(m.vertexShader,/vGhibliLocal=position/);assert.match(m.vertexShader,/skinning_vertex/);
    assert.match(m.fragmentShader,/#define GHIBLI_PERSONAJE 1.0/);assert.equal(batch.vertexShader,m.vertexShader);
    style.extendMaterial(m,{vertex:s=>'// extension\n'+s,fragment:s=>s.replace('vec3 hemi =','lit*=.85;\nvec3 hemi =')});
    assert.equal((m.vertexShader.match(/varying vec3 vGhibliLocal;/g)||[]).length,1);assert.match(m.fragmentShader,/lit\*=.85/);
    const uv=m.uniforms.cityAlbedoUV.value,version=batch.version;
    estilos.ajustar('uGPintura',.9);assert.equal(m.uniforms.uGPintura.value,.9);assert.equal(batch.version,version);assert.equal(m.uniforms.cityAlbedoUV.value,uv);
    estilos.seleccionar('Luz25D');assert.equal(m.vertexShader,'// extension\n'+original);assert.doesNotMatch(m.fragmentShader,/gCharacter/);
  }finally{variants.dispose();style.dispose();estilos.dispose();source.dispose();geometry.dispose();}
});

test('painted foliage keeps atlas sampling, alpha rejection and tree visibility',()=>{
  const {estilos,style}=setup(),source=new T.MeshStandardMaterial({alphaTest:.5}),m=style.material(source,'urban-tree');
  try{
    style.extendMaterial(m,{fragment:s=>'varying float vTreePart;\n'+s.replace('vec3 hemi =','float treeVisibility=.7;lit*=treeVisibility;\nvec3 hemi =')});
    estilos.seleccionar('StudioGhibli');
    assert.equal((m.fragmentShader.match(/varying float vTreePart;/g)||[]).length,1);
    assert.ok(m.fragmentShader.indexOf('varying float vTreePart;')<m.fragmentShader.indexOf('float gCategory()'));
    assert.match(m.fragmentShader,/mix\(5.0,1.0,step\(.5,vTreePart\)\)/);assert.match(m.fragmentShader,/if \(a < uCorte\) discard/);assert.match(m.fragmentShader,/lit\*=treeVisibility/);
  }finally{style.dispose();estilos.dispose();source.dispose();}
});

test('rain and sunset are Ghibli variants; other styles retain their own shading and common environments',()=>{
  const {estilos,style}=setup(),initial=luz.ambiente;
  try{
    estilos.seleccionar('StudioGhibli');assert.equal(estilos.usarAmbiente('lluvia'),true);
    assert.equal(luz.ambiente,'nublado');assert.equal(estilos.ambienteVisual,'lluvia');assert.equal(estilos.actual.uniformes.uGLluvia.value,1);
    estilos.seleccionar('Zelda');assert.equal(estilos.ambienteVisual,'nublado');assert.equal(estilos.actual.uniformes.uZAtmosfera.value,1);
    assert.equal(estilos.usarAmbiente('lluvia'),false);estilos.seleccionar('StudioGhibli');
    estilos.usarAmbiente('atardecer');assert.equal(luz.ambiente,'tarde');assert.equal(estilos.actual.uniformes.uGAtardecer.value,1);assert.equal(estilos.actual.uniformes.uGLluvia.value,0);
    estilos.usarAmbiente('noche');assert.equal(estilos.ambienteVisual,'noche');assert.equal(estilos.actual.uniformes.uGCieloLuz.value,.32);
  }finally{luz.usarAmbiente(initial);style.dispose();estilos.dispose();}
});

test('Ghibli rain survives a new viewer without mounting the development panel',()=>{
  const initial=luz.ambiente,data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const a=new GestorEstilos({estilos:ESTILOS,luz,storage,clave:'test-ghibli'});
  a.seleccionar('StudioGhibli');a.usarAmbiente('lluvia');a.dispose();
  luz.usarAmbiente('manana');
  const b=new GestorEstilos({estilos:ESTILOS,luz,storage,clave:'test-ghibli'});
  try{assert.equal(b.activo,'StudioGhibli');assert.equal(b.ambienteVisual,'lluvia');assert.equal(luz.ambiente,'nublado');assert.equal(b.actual.uniformes.uGLluvia.value,1);}
  finally{b.dispose();luz.usarAmbiente(initial);}
});
