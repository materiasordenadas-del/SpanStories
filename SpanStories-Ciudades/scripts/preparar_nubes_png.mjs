// Lossless alpha preservation and proportional downscaling of generated PNG assets.
import sharp from 'sharp';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const assets=path.join(root,'engine/Estilos/StudioGhibli/assets');
const reports=path.join(root,'reports/nubes-png');
await mkdir(path.join(reports,'originales'),{recursive:true});
const source='C:/Users/AdrielPereira/.codex/generated_images/01a1665d-a11d-7b01-9695-8fb4f22d504a';
const variants=[['alta','exec-ba7a9452-3d3e-4716-974c-81f21792caf6.png'],['compacta','exec-fcb3a655-cac6-4e07-bfff-d7a4fa35e7ab.png'],['alargada','exec-c63825b8-0c8f-49d0-b7ad-44700fb82324.png']];
const proof=[];
for(const [id,file] of variants){
  const input=path.join(source,file),name=`nube-ghibli-${id}.png`;
  await copyFile(input,path.join(reports,'originales',name));
  // A transparent margin keeps all lobes clear of the sampler/image boundary.
  await sharp(input).resize({width:736,height:506,fit:'contain',background:'#00000000'}).extend({top:16,bottom:16,left:16,right:16,background:'#00000000'}).png({compressionLevel:9,adaptiveFiltering:true}).toFile(path.join(assets,name));
  const {data,info}=await sharp(path.join(assets,name)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparent=0,opaque=0,edgeAlpha=0;
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const alpha=data[(y*info.width+x)*4+3];
    if(!alpha)transparent++;if(alpha===255)opaque++;
    if(x===0||y===0||x===info.width-1||y===info.height-1)edgeAlpha+=alpha;
  }
  if(!transparent||!opaque||edgeAlpha)throw Error('Invalid transparent silhouette: '+id);
  proof.push({id,file:name,width:info.width,height:info.height,transparent,opaque,edgeAlpha});
}
await writeFile(path.join(reports,'verificacion-png.json'),JSON.stringify(proof,null,2));
console.log(JSON.stringify(proof));
