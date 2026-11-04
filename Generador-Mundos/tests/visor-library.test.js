import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {VisorLibrary} from '../server/visor-library.js';
import {generateSchool,SCHOOL_DEFAULTS} from '../src/estudio/school/school.js';
import {encodeProject,decodeProject} from '../src/estudio/data/project.js';

const hash=b=>createHash('sha256').update(b).digest('hex');
async function fixture(){
  const parent=new URL('../.trabajo/',import.meta.url);await mkdir(parent,{recursive:true});const root=await mkdtemp(fileURLToPath(new URL('visor-test-',parent)));
  const library=new VisorLibrary({generatorRoot:root,viewerRoot:join(root,'viewer')}),dir=join(root,'exportaciones','prueba');await mkdir(dir,{recursive:true});
  const model=generateSchool('prueba',SCHOOL_DEFAULTS),state={model,mode:'school',place:{lat:40,lon:-3,size:300,name:'Colegio de prueba'},seed:'a',seeds:{alturas:'a',fachadas:'b',calle:'c',suelo:'d'},school:SCHOOL_DEFAULTS};
  const bodies={'proyecto.json':encodeProject(state),'entidades.json':JSON.stringify({entities:{1:model.buildings[0].id}}),'sectores.json':JSON.stringify({sectores:[{id:'S',archivo:'S.glb',bytes:4,caja:{min:[-100,0,-100],max:[100,50,100]},entityIds:[1]}]}),'S.glb':'test','lugar.json':JSON.stringify({relieve:{resolucion:2,ancho:300,fondo:300,alturas:[0,0,0,0]},edificios:model.buildings.map(b=>({id:b.id,nombre:b.name,huella:b.rings,altura:b.height}))})};
  const files=[];for(const [name,text]of Object.entries(bodies)){const bytes=Buffer.from(text);await writeFile(join(dir,name),bytes);files.push({path:name,bytes:bytes.length,sha256:hash(bytes)});}
  await writeFile(join(dir,'manifest.json'),JSON.stringify({format:'atlas-estudio-paquete',version:2,complete:true,files,project:'proyecto.json',entities:'entidades.json',sectors:'sectores.json'}));return {library,dir,model};
}
test('publicar, editar por ID y actualizar conserva fuentes, versiones e identidades ajenas',async()=>{
  const {library,dir,model}=await fixture(),first=await library.publish({carpeta:'prueba'}),snapshot=await library.project(first.id);
  assert.equal(first.history.length,1);assert.equal(snapshot.project.visorLink.id,first.id);decodeProject(JSON.stringify(snapshot.project));
  const id=model.buildings[0].id;await library.edit(first.id,{expectedHash:snapshot.sha256,changes:[{layer:'overrides',id,patch:{height:27,colour:'#123456'}}]});
  const draft=await library.project(first.id);assert.equal(draft.draft,true);assert.deepEqual(draft.project.overrides,{[id]:{height:27,colour:'#123456'}});assert.deepEqual(draft.project.model,snapshot.project.model);
  assert.equal((await library.project(first.id,{draft:false})).sha256,snapshot.sha256);
  await assert.rejects(library.edit(first.id,{expectedHash:snapshot.sha256,changes:[{layer:'overrides',id,patch:{height:8}}]}),/Conflicto/);
  await assert.rejects(library.edit(first.id,{expectedHash:draft.sha256,changes:[{layer:'overrides',id:'no-existe',patch:{height:8}}]}),/inválidos/);
  const second=await library.publish({carpeta:'prueba',id:first.id,expectedRevision:first.revision});assert.equal(second.id,first.id);assert.equal(second.history.length,2);assert.equal((await library.catalog()).places.length,1);assert.equal((await library.project(first.id)).draft,false);
  assert.equal(await readFile(join(library.root,first.id,'revisiones',first.revision,'proyecto.json'),'utf8'),await readFile(join(dir,'proyecto.json'),'utf8'));
  await assert.rejects(library.publish({carpeta:'prueba',id:first.id,expectedRevision:first.revision}),/Conflicto/);
  assert.equal((await library.project(first.id,{version:first.revision})).version,first.revision);
  await assert.rejects(library.project(first.id,{version:'no-existe'}),/Versión desconocida/);
});
test('un paquete corrupto o una ruta fuera de exportaciones no altera el catálogo',async()=>{
  const {library,dir}=await fixture();await writeFile(join(dir,'S.glb'),'corrupto');await assert.rejects(library.publish({carpeta:'prueba'}),/Integridad/);assert.deepEqual((await library.catalog()).places,[]);
  await assert.rejects(library.publish({carpeta:'../fuera'}),/Identificador/);
});
