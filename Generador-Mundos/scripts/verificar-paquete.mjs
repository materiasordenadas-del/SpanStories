import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import {decodeProject} from '../src/estudio/data/project.js';

const manifestPath=resolve(process.argv[2]??'');if(!process.argv[2])throw Error('Uso: node scripts/verificar-paquete.mjs <manifest.json> [informe.json]');
const root=dirname(manifestPath),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
if(manifest.format!=='atlas-estudio-paquete'||manifest.version!==2||!manifest.complete)throw Error('Paquete incompleto');
const filePath=name=>{const path=resolve(root,name);if(relative(root,path).startsWith('..'))throw Error('Ruta fuera del paquete');return path;};
const entities=JSON.parse(await readFile(filePath(manifest.entities),'utf8')).entities,rendered=new Set(),extensions=new Set(),sectors=JSON.parse(await readFile(filePath(manifest.sectors),'utf8')).sectores;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});await MeshoptDecoder.ready;
let bytes=0,glbs=0,primitives=0,compressed=0,accessorBytes=0,textures=0,instanced=0;
for(const file of manifest.files){const data=await readFile(filePath(file.path));if(data.length!==file.bytes||createHash('sha256').update(data).digest('hex')!==file.sha256)throw Error('Integridad incorrecta: '+file.path);bytes+=data.length;
  if(file.path.endsWith('.glb')){const doc=await io.readBinary(data),root=doc.getRoot(),sectorIds=new Set();glbs++;textures+=root.listTextures().length;for(const e of root.listExtensionsUsed()){extensions.add(e.extensionName);if(e.extensionName==='EXT_meshopt_compression')compressed++;}
    for(const a of root.listAccessors()){const array=a.getArray();accessorBytes+=array.byteLength;for(const value of array)if(!Number.isFinite(value))throw Error('Atributo no finito');}
    for(const mesh of root.listMeshes())for(const p of mesh.listPrimitives()){primitives++;const owners=p.getAttribute('_ENTITY_ID');if(owners)for(const owner of owners.getArray()){if(owner&&!entities[owner])throw Error('Identidad geométrica desconocida');if(owner){rendered.add(entities[owner]);sectorIds.add(owner);}}}
    for(const node of root.listNodes()){const extra=node.getExtras();if(extra.entityId)rendered.add(extra.entityId);if(extra.instanceEntityIds){instanced++;for(const owner of extra.instanceEntityIds){if(owner&&!entities[owner])throw Error('Dueño de instancia desconocido');if(owner){rendered.add(entities[owner]);sectorIds.add(owner);}}}}
    for(const owner of sectors.find(s=>s.archivo===file.path)?.entityIds??[])if(!sectorIds.has(owner)&&!rendered.has(entities[owner]))throw Error('Se perdió un ID al exportar '+file.path+': '+entities[owner]);
  }
}
const project=decodeProject(await readFile(filePath(manifest.project),'utf8')),resources=JSON.parse(await readFile(filePath(manifest.resources),'utf8'));
if(!resources.embedded||resources.unresolved.length)throw Error('Recursos pendientes de resolver');
const report={paquete:root,archivos:manifest.files.length,bytes,glbs,glbsMeshopt:compressed,primitivas:primitives,texturasEmbebidas:textures,gruposInstanciados:instanced,entidadesDeclaradas:Object.keys(entities).length,entidadesConGeometria:rendered.size,edificiosConGeometria:project.model.buildings.filter(b=>rendered.has(b.id)).length,edificiosEnProyecto:project.model.buildings.length,geometriaDescomprimidaBytes:accessorBytes,extensiones:[...extensions],integridad:'SHA-256 de todos los archivos; GLB decodificados; IDs comprobados; proyecto reabierto',sinRecursosPendientes:true};
if(process.argv[3])await writeFile(resolve(process.argv[3]),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
