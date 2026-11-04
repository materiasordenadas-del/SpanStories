// Real viewer loader in Node: structural import only, without browser/GPU rendering.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'evidence','web-auto-0.1.21');
globalThis.self=globalThis;
globalThis.ProgressEvent=class extends Event {constructor(type,options={}){super(type);Object.assign(this,options);}};
// The browser's ImageBitmap implementation is unavailable in this test environment.
// Read actual codec dimensions so GLTFLoader can build materials, without claiming decoding/rendering.
globalThis.createImageBitmap=async blob=>{
  const b=Buffer.from(await blob.arrayBuffer());let width,height;
  if(b.subarray(1,4).toString()==='PNG'){width=b.readUInt32BE(16);height=b.readUInt32BE(20);}
  else if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'){
    const kind=b.subarray(12,16).toString();
    if(kind==='VP8L'){const n=b.readUInt32LE(21);width=1+(n&16383);height=1+((n>>>14)&16383);}
    else if(kind==='VP8X'){width=1+b.readUIntLE(24,3);height=1+b.readUIntLE(27,3);}
    else throw Error('Unrecognised WebP header');
  }else throw Error('Unrecognised image container');
  return {width,height,close(){}};
};
const {GLTFLoader}=await import(pathToFileURL('D:/Español/SpanStories-worktrees/visor-mundo-20261021/SpanStories-Ciudades/vendor/GLTFLoader.js'));
const rows=[];
for(const file of ['automatic.glb','with-attachment.glb','Hama_web.glb']){
  const bytes=await fs.readFile(path.join(out,file));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  let meshes=0,textured=0,vertexColored=0,morphTargets=0;const textures=[];
  gltf.scene.traverse(o=>{
    if(!o.isMesh)return;meshes++;morphTargets+=o.morphTargetInfluences?.length??0;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(m.vertexColors)vertexColored++;
      if(m.map){textured++;if(m.map.colorSpace!=='srgb'||m.map.flipY!==false)throw Error('Texture setup mismatch');textures.push([m.map.image.width,m.map.image.height]);}
    }
  });
  if(!meshes)throw Error('No meshes loaded');
  if(file!=='automatic.glb'&&!vertexColored)throw Error('Procedural attachment has no vertex colors');
  rows.push({file,bytes:bytes.length,meshes,textured,vertexColored,morphTargets,textures});
}
const report={passed:true,loader:'Unmodified GLTFLoader from the current viewer',browser_rendered:false,image_bitmap:'metadata shim, not a browser decode test',files:rows};
await fs.writeFile(path.join(out,'loader-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
