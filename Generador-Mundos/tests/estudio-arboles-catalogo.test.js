import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {KHRMeshQuantization} from '@gltf-transform/extensions';
import {TREE_CATALOG,TREE_SETS,MAX_TREE_TYPES,treeSetOf,validTreeSet,treeCatalogExport,treeEntry} from '../src/estudio/data/tree-catalog.js';
import {CLIMATES} from '../src/estudio/data/climate.js';
import {validateSettings} from '../src/estudio/data/quality.js';
import {EZTREE_SPECIES} from '../scripts/arboles/especies-eztree.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=url=>resolve(root,'public'+url);

test('catálogo de árboles: GLB originales conservados, especies ez-tree horneadas y conjuntos de 4 como máximo', ()=>{
  for(const id of ['anime','anime2','jabami','sakura'])assert.equal(treeEntry(id).origin,'original',id);
  assert.deepEqual(TREE_SETS.clasico,['anime','anime2','jabami','sakura']);
  for(const t of TREE_CATALOG)assert.ok(existsSync(file(t.url)),t.url);
  assert.deepEqual(TREE_CATALOG.filter(t=>t.origin==='ez-tree').map(t=>t.id).sort(),EZTREE_SPECIES.map(s=>s.id).sort());
  for(const climate of Object.keys(CLIMATES))assert.ok(TREE_SETS[climate],climate);
  for(const [name,ids] of Object.entries(TREE_SETS)){assert.ok(ids.length<=MAX_TREE_TYPES,name);assert.equal(new Set(ids).size,ids.length,name);for(const id of ids)assert.ok(treeEntry(id),id);}
});

test('conjunto del lugar: clima por defecto, elección manual válida y recorte a 4 tipos', ()=>{
  const model={kind:'real',bounds:{centerLat:10.42,centerLon:-75.55,country:{code:'CO'}},climate:{id:'tropical',variant:'tropical:humedo'}};
  assert.deepEqual(treeSetOf(model),{ids:TREE_SETS.tropical,source:'clima:tropical'});
  assert.deepEqual(treeSetOf({...model,treeSetOverride:'clasico'}).ids,TREE_SETS.clasico);
  assert.equal(treeSetOf({...model,treeSetOverride:'clasico'}).source,'manual');
  assert.deepEqual(validTreeSet(['pino','pino','olivo','roble','abedul','encina','x']),['pino','olivo','roble','abedul']);
  assert.equal(validTreeSet(['x']),null);
  const out=treeCatalogExport(model);
  assert.equal(out.formato,'spanstories-arboles');assert.equal(out.maxTipos,4);assert.deepEqual(out.conjunto,TREE_SETS.tropical);
  assert.equal(out.especies.length,TREE_CATALOG.length);
});

test('ajustes: el conjunto de árboles solo se guarda si se elige a mano', ()=>{
  assert.equal('trees' in validateSettings({}),false);
  assert.equal(validateSettings({trees:'auto'}).trees,undefined);
  assert.equal(validateSettings({trees:'arido'}).trees,'arido');
  assert.throws(()=>validateSettings({trees:'selva'}),/árboles/);
});

test('GLB ez-tree: tronco y hojas, cuantizados, dentro del presupuesto web', async ()=>{
  const io=new NodeIO().registerExtensions([KHRMeshQuantization]);
  for(const sp of EZTREE_SPECIES){
    const path=file('/assets/arboles/eztree/'+sp.id+'.glb');
    assert.ok(statSync(path).size<=260_000,sp.id+' pesa demasiado');
    const doc=await io.read(path),meshes=doc.getRoot().listMeshes();
    assert.equal(meshes.length,1,sp.id);
    const prims=meshes[0].listPrimitives();assert.equal(prims.length,2,sp.id);
    assert.deepEqual(prims.map(p=>p.getMaterial().getName()),['corteza','hojas']);
    assert.equal(prims[1].getMaterial().getAlphaMode(),'MASK');
    assert.ok(prims[1].getMaterial().getBaseColorTexture(),sp.id+' sin racimo');
    for(const p of prims)assert.ok(p.getAttribute('COLOR_0'),sp.id+' sin color por vértice');
    const tris=prims.reduce((s,p)=>s+p.getIndices().getCount()/3,0);
    assert.ok(tris<=4500,sp.id+' '+tris+' triángulos');
    assert.ok(doc.getRoot().listExtensionsUsed().some(e=>e.extensionName==='KHR_mesh_quantization'));
  }
});
