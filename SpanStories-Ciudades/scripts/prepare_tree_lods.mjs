import {readFile,writeFile} from 'node:fs/promises';
import {MeshoptSimplifier} from 'meshoptimizer';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
await MeshoptSimplifier.ready;
const loader=new GLTFLoader();loader.register(parser=>({name:'geometry-only',beforeRoot(){parser.loadTexture=()=>Promise.resolve(null);}}));
const result={};
for(const file of ['anime_nature_tree_01.glb','anime_tree_2.glb','jabami_anime_tree_v1.glb','sakura_tree_01.glb']){
 const b=await readFile(new URL('../assets/barcelona-decor/'+file,import.meta.url));const gltf=await loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');const entries=[];
 gltf.scene.traverse(o=>{
  if(!o.isMesh)return;const g=o.geometry,indices=Uint32Array.from(g.index.array),pos=Float32Array.from(g.getAttribute('position').array);
  // Preserve all leaf-card boundaries. Only the solid trunk is simplified.
  let simplified=indices,error=0;
  if(!o.material.alphaTest&&!o.material.transparent){[simplified,error]=MeshoptSimplifier.simplify(indices,pos,3,Math.floor(indices.length*.45/3)*3,.025,['LockBorder']);}
  entries.push({name:o.name,indices:[...simplified],error,nearTriangles:indices.length/3,mediumTriangles:simplified.length/3});
 });result[file]=entries;
}
await writeFile(new URL('../assets/barcelona-decor/tree-lods.json',import.meta.url),JSON.stringify(result));console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k,v])=>[k,v.map(({nearTriangles,mediumTriangles,error})=>({nearTriangles,mediumTriangles,error}))]))));
