import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import { CityStyle } from '../engine/CityStyle.js';
import { luz } from '../engine/Luz25D.js';
import { GestorEstilos, ESTILOS } from '../engine/Estilos/index.js';
import { RenderMaterials } from '../engine/CityRenderOptimization.js';
import { categoriaMaterial } from '../engine/StyleShader.js';

function manager(options={}) {return new GestorEstilos({estilos:ESTILOS,luz,storage:null,...options});}

test('Luz25D keeps exact shaders, materials and environment across a round trip',()=>{
  const estilos=manager(),style=new CityStyle({estilos}),legacy=new CityStyle();
  const source=new T.MeshStandardMaterial({color:'#c17c63'}),m=style.material(source),reference=legacy.material(source);
  const outline=style.outline(m),originalOutline=outline.vertexShader,original=m.fragmentShader;
  const light=luz.estado(),count=style.owned.size;
  try{
    assert.equal(original,reference.fragmentShader);assert.equal(m.vertexShader,reference.vertexShader);
    for(const name of ['Zelda','Trigun','StudioGhibli','Zelda','Luz25D'])assert.equal(estilos.seleccionar(name),true);
    assert.equal(m.fragmentShader,original);assert.equal(outline.vertexShader,originalOutline);
    assert.equal(style.material(source),m);assert.equal(style.owned.size,count);assert.deepEqual(luz.estado(),light);
    assert.equal(estilos.seleccionar('missing'),false);assert.equal(estilos.activo,'Luz25D');
  }finally{style.dispose();legacy.dispose();estilos.dispose();source.dispose();}
});

test('batched/instanced variants, surface extensions and tree shadow hooks change together',()=>{
  const estilos=manager(),style=new CityStyle({estilos}),source=new T.MeshStandardMaterial();
  const m=style.material(source),variants=new RenderMaterials(),geometry=new T.BoxGeometry();
  const batch=variants.get(m,geometry,'batched'),instance=variants.get(m,geometry,'instanced');
  try{
    style.extendMaterial(m,{fragment:s=>s.replace('vec3 hemi =','lit*=.75;\nvec3 hemi =')});
    const original=m.fragmentShader;
    for(const id of ['Zelda','Trigun']){
      estilos.seleccionar(id);assert.match(m.fragmentShader,/estiloLuz/);assert.match(m.fragmentShader,/lit\*=.75/);
      assert.equal(batch.fragmentShader,m.fragmentShader);assert.equal(instance.fragmentShader,m.fragmentShader);
      assert.equal(batch.uniforms,m.uniforms);
      const version=batch.version,control=estilos.actual.controles[0];
      estilos.ajustar(control.clave,control.min);assert.equal(m.uniforms[control.clave].value,control.min);assert.equal(batch.version,version);
    }
    estilos.seleccionar('Luz25D');assert.equal(m.fragmentShader,original);assert.equal(batch.fragmentShader,original);
  }finally{variants.dispose();style.dispose();estilos.dispose();source.dispose();geometry.dispose();}
});

test('switching preserves source textures, UV transforms, vertex alpha, skin/morph and identity',()=>{
  const estilos=manager(),style=new CityStyle({estilos}),texture=new T.Texture();texture.channel=1;texture.offset.set(.2,.3);texture.repeat.set(2,3);
  const source=new T.MeshStandardMaterial({map:texture,vertexColors:true,transparent:true,opacity:.65,alphaTest:.3});
  const m=style.material(source,'rigged',true),vertex=m.vertexShader,uv=m.uniforms.cityAlbedoUV.value.clone();
  try{
    for(const id of ['Trigun','Zelda','Luz25D']){
      estilos.seleccionar(id);assert.equal(m.uniforms.uAlbedo.value,texture);assert.equal(m.vertexShader,vertex);
      assert.ok(m.uniforms.cityAlbedoUV.value.equals(uv));assert.match(m.vertexShader,/morphtarget_vertex/);assert.match(m.vertexShader,/skinning_vertex/);
      assert.match(m.vertexShader,/uv1/);assert.match(m.fragmentShader,/vCityColor.a/);assert.equal(m.uniforms.uOpacidad.value,.65);assert.equal(m.uniforms.uCorte.value,.3);
    }
  }finally{style.dispose();estilos.dispose();source.dispose();texture.dispose();}
});

test('style preferences are independent, validated and restored without changing legacy storage',()=>{
  const values=new Map([['legacy','unchanged']]),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const a=manager({storage,clave:'test'});a.seleccionar('Zelda');a.ajustar('uZSol',1.3);a.seleccionar('Trigun');a.ajustar('uTTinte','#766c93');
  assert.equal(a.ajustar('uTTinte','not-a-color'),false);assert.equal(a.ajustar('uTContraste',NaN),false);a.dispose();
  const b=manager({storage,clave:'test'});
  try{assert.equal(b.activo,'Trigun');assert.equal(b.actual.uniformes.uTTinte.value.getHexString(),'766c93');
    b.seleccionar('Zelda');assert.equal(b.actual.uniformes.uZSol.value,1.3);assert.equal(values.get('legacy'),'unchanged');
  }finally{b.dispose();}
});

test('semantic metadata wins, and new styles register without editing CityStyle',()=>{
  assert.equal(categoriaMaterial({name:'wood',userData:{ssCategory:'piel'}}),'piel');
  assert.equal(categoriaMaterial({name:'follaje'}),'vegetacion');assert.equal(categoriaMaterial({name:'unknown',metalness:1}),'metal');
  const estilos=manager(),style=new CityStyle({estilos}),source=new T.MeshBasicMaterial(),m=style.material(source);
  try{
    estilos.registrar({id:'Nuevo',nombre:'Nuevo',crearUniformes:()=>({}),fragmento:s=>'// nuevo\n'+s});
    estilos.seleccionar('Nuevo');assert.match(m.fragmentShader,/^\/\/ nuevo/);assert.equal(estilos.listar().length,ESTILOS.length+1);
  }finally{style.dispose();estilos.dispose();source.dispose();}
});

test('sky lifecycle and atmosphere remain separate from the environment',(t)=>{
  const scene=new T.Scene(),estilos=manager({scene}),camera=new T.PerspectiveCamera();
  try{
    assert.equal(estilos.sky.mesh.visible,false);estilos.seleccionar('Zelda');assert.equal(estilos.sky.mesh.visible,true);
    t.mock.method(performance,'now',()=>1000);estilos.update(camera);
    assert.equal(estilos.sky.uniforms.uSkyTime.value,1);
    t.mock.method(performance,'now',()=>3500);estilos.update(camera);
    assert.equal(estilos.sky.uniforms.uSkyTime.value,3.5);
    const original=luz.ambiente;luz.usarAmbiente('noche');assert.equal(estilos.activo,'Zelda');assert.equal(estilos.sky.uniforms.uSkyTop.value.getHexString(),'12223e');
    estilos.seleccionar('Luz25D');assert.equal(luz.ambiente,'noche');assert.equal(estilos.sky.mesh.visible,false);estilos.update(camera);luz.usarAmbiente(original);
  }finally{estilos.dispose();assert.equal(scene.children.length,0);}
});
