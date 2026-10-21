import {readFile,writeFile} from 'node:fs/promises';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {MeshoptDecoder} from '../vendor/meshopt_decoder.module.js';
import * as T from '../engine/three.js';
const zone=new URL('../Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('zona.json',zone),'utf8'));
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(parser=>({name:'measure-without-textures',beforeRoot(){parser.loadTexture=()=>Promise.resolve(null);}}));
const pits=[];
for(const sector of manifest.sectors){
 const file=await readFile(new URL(sector.url,zone));const gltf=await loader.parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');gltf.scene.updateMatrixWorld(true);
 gltf.scene.traverse(o=>{
  if(!o.isMesh||!o.name.includes('tierra_alcorques'))return;
  const position=o.geometry.getAttribute('position'),indices=o.geometry.index,points=[],unique=new Map(),remap=[];
  for(let i=0;i<position.count;i++){
   const p=new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(o.matrixWorld),key=p.toArray().map(v=>v.toFixed(3)).join(',');
   if(!unique.has(key)){unique.set(key,points.length);points.push(p);}remap.push(unique.get(key));
  }
  const parents=points.map((_,i)=>i);function find(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;}
  for(let i=0;i<indices.count;i+=3){const a=find(remap[indices.getX(i)]);parents[find(remap[indices.getX(i+1)])]=a;parents[find(remap[indices.getX(i+2)])]=a;}
  const groups=new Map();points.forEach((p,i)=>{const key=find(i);if(!groups.has(key))groups.set(key,new T.Box3());groups.get(key).expandByPoint(p);});
  for(const b of groups.values())if(Math.max(b.max.x-b.min.x,b.max.z-b.min.z)<4){const c=b.getCenter(new T.Vector3());pits.push({position:[c.x,b.max.y,c.z],min:b.min.toArray(),max:b.max.toArray()});}
 });
}
await writeFile(new URL('../reports/tree-pits.json',import.meta.url),JSON.stringify(pits));console.log(JSON.stringify({pits:pits.length}));
