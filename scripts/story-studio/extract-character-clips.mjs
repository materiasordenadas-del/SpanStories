import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';

// Extract existing animations only. The source character and the viewer's existing GLB stay intact.
const source=resolve('D:/Español/imagen para animación/Animación 3D/personajes/samuel/Samuel_con_rostro_manos.glb');
const output=resolve('SpanStories-Ciudades/assets/avatar/Samuel-story-actions.glb');
const input=readFileSync(source),jsonLength=input.readUInt32LE(12),original=JSON.parse(input.subarray(20,20+jsonLength).toString());
const binStart=20+jsonLength+8,bin=input.subarray(binStart,binStart+input.readUInt32LE(binStart-8));
const names=['Catching_Breath','Slap_Reaction','Excited_Walk_M'];
const animations=original.animations.filter(a=>names.includes(a.name));
if(animations.length!==names.length)throw Error('The requested source clips are missing.');
const accessors=[],bufferViews=[],chunks=[],accessorIds=new Map(),viewIds=new Map();let byteLength=0;
function view(index){
  if(viewIds.has(index))return viewIds.get(index);
  const old=original.bufferViews[index];if(old.buffer!==0)throw Error('External animation buffer unsupported.');
  const padding=(4-byteLength%4)%4;if(padding){chunks.push(Buffer.alloc(padding));byteLength+=padding;}
  const next=bufferViews.length;viewIds.set(index,next);
  chunks.push(bin.subarray(old.byteOffset??0,(old.byteOffset??0)+old.byteLength));
  bufferViews.push({...old,buffer:0,byteOffset:byteLength});byteLength+=old.byteLength;return next;
}
function accessor(index){
  if(accessorIds.has(index))return accessorIds.get(index);
  const old=original.accessors[index];if(old.sparse)throw Error('Sparse animation data needs explicit support.');
  const next=accessors.length;accessorIds.set(index,next);accessors.push({...old,bufferView:view(old.bufferView)});return next;
}
for(const animation of animations)for(const sampler of animation.samplers){sampler.input=accessor(sampler.input);sampler.output=accessor(sampler.output);}
const nodes=original.nodes.map(({name,children,translation,rotation,scale,matrix})=>({name,children,translation,rotation,scale,matrix}));
const result={asset:{version:'2.0',generator:'SpanStories: lossless source animation extraction'},scene:original.scene??0,scenes:original.scenes.map(({nodes,name})=>({nodes,name})),nodes,animations,accessors,bufferViews,buffers:[{byteLength}]};
let json=Buffer.from(JSON.stringify(result));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
let binary=Buffer.concat(chunks);binary=Buffer.concat([binary,Buffer.alloc((4-binary.length%4)%4)]);
const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(binary.length,0);binHeader.writeUInt32LE(0x004e4942,4);
writeFileSync(output,Buffer.concat([header,json,binHeader,binary]));
console.log(JSON.stringify({output,bytes:28+json.length+binary.length,clips:names,sourceUnchanged:createHash('sha256').update(readFileSync(source)).digest('hex')===createHash('sha256').update(input).digest('hex')}));
