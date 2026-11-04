import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import {atlasEntity,atlasBounds,atlasGround,generatedZones,AtlasAssets,atlasInstanceColors,atlasInstanceOutlines} from '../engine/AtlasPlaces.js';
import {CityStyle} from '../engine/CityStyle.js';
import {RegistroCiudad} from '../engine/CityRegistry.js';

test('identidades fusionadas e instancias siguen siendo independientes',()=>{
  const root=new T.Group(),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,10,0,0,11,0,0,10,1,0],3));g.setAttribute('_entity_id',new T.Float32BufferAttribute([1,1,1,2,2,2],1));const mesh=new T.Mesh(g);root.add(mesh);
  const instances=new T.InstancedMesh(new T.BoxGeometry(),new T.MeshBasicMaterial(),2);instances.userData.instanceEntityIds=[1,2];instances.setMatrixAt(1,new T.Matrix4().makeTranslation(20,0,0));root.add(instances);
  const ids={1:'a',2:'b'};assert.equal(atlasEntity({object:mesh,face:{a:0}},ids),'a');assert.equal(atlasEntity({object:mesh,face:{a:3}},ids),'b');assert.equal(atlasEntity({object:instances,instanceId:1},ids),'b');
  const bounds=atlasBounds(root,ids);assert.equal(bounds.get('a').max.x,1);assert.equal(bounds.get('b').max.x,20.5);assert.equal(bounds.size,2);
  mesh.userData.ignorarSeleccion=true;assert.equal(atlasEntity({object:mesh,face:{a:0}},ids),null);
});
test('descargar un sector no elimina una identidad que todavía ocupa otro',()=>{
  const objetos=new RegistroCiudad(),root=new T.Group(),a=new T.Box3(new T.Vector3(0,0,0),new T.Vector3(1,1,1)),b=new T.Box3(new T.Vector3(10,0,0),new T.Vector3(11,1,1));root.userData.atlasBounds=a.clone().union(b);objetos.registrar(root,{id:'a',etiqueta:'A'});
  const fake={parts:new Map([['a',new Map([['s1',a],['s2',b]])]]),objetos};AtlasAssets.prototype.detach.call(fake,{sector:{id:'s1'},entityBounds:new Map([['a',a]])});assert.equal(objetos.obtener('a'),root);assert.deepEqual(root.userData.atlasBounds,b);AtlasAssets.prototype.detach.call(fake,{sector:{id:'s2'},entityBounds:new Map([['a',b]])});assert.equal(objetos.obtener('a'),null);
});
test('el relieve conserva pendientes, interpolación y bordes',()=>{const g={n:2,width:100,depth:100,h:[0,10,20,30]};assert.equal(atlasGround(g,0,0),15);assert.equal(atlasGround(g,-100,-100),0);assert.equal(atlasGround(g,50,50),30);});
test('el adaptador conserva el color de cada instancia sin cambiar el material de otras ciudades',()=>{
  const style=new CityStyle(),source=new T.MeshStandardMaterial({vertexColors:true}),base=style.material(source),mesh=new T.InstancedMesh(new T.BoxGeometry(),base,2);mesh.setColorAt(0,new T.Color('#123456'));mesh.setColorAt(1,new T.Color('#abcdef'));
  assert.ok(!base.vertexShader.includes('vCityColor.rgb *= instanceColor'));atlasInstanceColors(style,mesh);assert.ok(base.vertexShader.includes('vCityColor.rgb *= instanceColor'));
  const other=new CityStyle(),untouched=other.material(source);assert.ok(!untouched.vertexShader.includes('vCityColor.rgb *= instanceColor'));style.dispose();other.dispose();
});
test('los contornos de instancias conservan sus matrices y no dejan una malla en el origen',()=>{
  const style=new CityStyle(),g=new T.BoxGeometry(),mesh=new T.InstancedMesh(g,new T.MeshStandardMaterial(),2);mesh.setMatrixAt(0,new T.Matrix4().makeTranslation(50,0,0));mesh.setMatrixAt(1,new T.Matrix4().makeTranslation(80,0,0));style.adapt(mesh);atlasInstanceOutlines(mesh);
  const shell=mesh.children.find(c=>c.userData.cityOutline);assert.equal(shell.isInstancedMesh,true);assert.equal(shell.instanceMatrix,mesh.instanceMatrix);assert.equal(shell.count,2);assert.equal(new T.Box3().setFromObject(shell).min.x,49.5);
  mesh.userData.atlasAlphaCutout=true;atlasInstanceOutlines(mesh);assert.equal(mesh.children.length,0);style.dispose();
});
test('biblioteca opcional sin alterar Barcelona y rutas confinadas',async()=>{
  assert.deepEqual(await generatedZones('http://localhost/',async()=>({status:404})),[]);
  const fetcher=async()=>({ok:true,json:async()=>({format:'spanstories-lugares',version:1,places:[{id:'atlas-123',manifest:'atlas-123/revisiones/456/zona.json'}]})});const zones=await generatedZones('http://localhost/',fetcher);assert.equal(zones[0].manifestUrl,'http://localhost/Mundo/Generados/atlas-123/revisiones/456/zona.json');
  await assert.rejects(generatedZones('http://localhost/',async()=>({ok:true,json:async()=>({format:'spanstories-lugares',version:1,places:[{id:'atlas-123',manifest:'../../private'}]})})),/Ruta/);
});
