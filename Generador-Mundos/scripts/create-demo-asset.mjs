import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {mkdir,writeFile} from 'node:fs/promises';
// Original static fixture; never derived from the researched applications.
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(value=>{this.result='data:'+blob.type+';base64,'+Buffer.from(value).toString('base64');this.onloadend?.();});}};
const root=new T.Group();root.name='Atlas original tower';
function box(name,size,position,color){const mesh=new T.Mesh(new T.BoxGeometry(...size),new T.MeshStandardMaterial({color,roughness:.9}));mesh.position.set(...position);mesh.name=name;root.add(mesh);}
box('Basamento',[10,1,10],[0,.5,0],'#a69f8b');box('Cuerpo',[8,14,8],[0,8,0],'#e4d5b7');box('Cornisa',[9,1,9],[0,15,0],'#69759c');const roof=new T.Mesh(new T.ConeGeometry(6,5,4),new T.MeshStandardMaterial({color:'#b4634e'}));roof.position.y=18;roof.rotation.y=Math.PI/4;root.add(roof);box('Puerta',[2,3,.2],[0,2.5,4.1],'#4e667d');
const binary=await new GLTFExporter().parseAsync(root,{binary:true});await mkdir('examples',{recursive:true});await writeFile('examples/torre-atlas.glb',Buffer.from(binary));console.log(`Original demo GLB: ${binary.byteLength} bytes`);
