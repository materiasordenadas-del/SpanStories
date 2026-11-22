import fs from 'node:fs';
import path from 'node:path';
import { BoxGeometry } from '../engine/three.js';
const geometry=new BoxGeometry(1,1,1),binary=[],views=[],accessors=[];
let offset=0;
for(const [semantic,attribute] of [['POSITION',geometry.attributes.position],['NORMAL',geometry.attributes.normal],['TEXCOORD_0',geometry.attributes.uv],['INDICES',geometry.index]]){
  const array=attribute.array,chunk=Buffer.from(array.buffer,array.byteOffset,array.byteLength);const padded=Buffer.alloc(Math.ceil(chunk.length/4)*4);chunk.copy(padded);binary.push(padded);
  views.push({buffer:0,byteOffset:offset,byteLength:chunk.length,target:semantic==='INDICES'?34963:34962});offset+=padded.length;
  accessors.push({bufferView:views.length-1,componentType:array instanceof Uint16Array?5123:5126,count:attribute.count,type:attribute.itemSize===1?'SCALAR':attribute.itemSize===2?'VEC2':'VEC3',...(semantic==='POSITION'?{min:[-.5,-.5,-.5],max:[.5,.5,.5]}:{})});
}
const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'QA_GLBCube',mesh:0,translation:[0,.5,0]}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0}]}],materials:[{name:'QA_Azul',pbrMetallicRoughness:{baseColorFactor:[.06,.24,.65,1],metallicFactor:0,roughnessFactor:1}}],buffers:[{byteLength:offset}],bufferViews:views,accessors};
const encoded=Buffer.from(JSON.stringify(json)),jsonChunk=Buffer.alloc(Math.ceil(encoded.length/4)*4,32);encoded.copy(jsonChunk);const bin=Buffer.concat(binary),out=Buffer.alloc(28+jsonChunk.length+bin.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jsonChunk.length,12);out.writeUInt32LE(0x4e4f534a,16);jsonChunk.copy(out,20);const b=20+jsonChunk.length;out.writeUInt32LE(bin.length,b);out.writeUInt32LE(0x004e4942,b+4);bin.copy(out,b+8);
fs.mkdirSync('tests/fixtures',{recursive:true});fs.writeFileSync(path.join('tests/fixtures','editor-probe.glb'),out);console.log('Fixture GLB:',out.length,'bytes');
