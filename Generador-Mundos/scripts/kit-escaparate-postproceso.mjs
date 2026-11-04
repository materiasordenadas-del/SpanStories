// Fija en los GLB del kit lo que Blender no exporta con fiabilidad: alfa (BLEND/MASK), doble cara, roles ss_* y emisivo.
// Lee public/assets/kits-escaparate/kit.json (escrito por scripts/blender/construir_kit_escaparate.py), deja
// kit-escaparate.glb (fachada) y kit-interior.glb y anota tamaño y SHA-256 en kit.json. Sin dependencias nuevas.
import {readFile,writeFile,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {KHRMaterialsEmissiveStrength} from '@gltf-transform/extensions';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dir=join(root,'public','assets','kits-escaparate');
const kit=JSON.parse(await readFile(join(dir,'kit.json'),'utf8'));
const io=new NodeIO().registerExtensions([KHRMaterialsEmissiveStrength]);
const usados=new Set(),salida={};
for(const [base,clave] of [['kit-escaparate','archivo'],['kit-interior','archivo_interior']]){
  const raw=join(dir,base+'.raw.glb');if(!existsSync(raw))continue;
  const doc=await io.read(raw),emissive=doc.createExtension(KHRMaterialsEmissiveStrength);
  for(const m of doc.getRoot().listMaterials()){
    const def=kit.materiales[m.getName()];if(!def)throw Error('Material sin definición en kit.json: '+m.getName());
    usados.add(m.getName());
    const [r,g,b]=def.color,a=def.alfa??1;
    m.setBaseColorFactor([r,g,b,a]).setBaseColorTexture(null).setMetallicFactor(def.metal??0).setRoughnessFactor(.85).setDoubleSided(!!def.doble)
     .setAlphaMode(def.modo??'OPAQUE').setAlphaCutoff(.45);
    if(def.emisivo){const k=Math.max(1,def.emisivo);m.setEmissiveFactor(def.emisivo<1?[r*def.emisivo,g*def.emisivo,b*def.emisivo]:[r,g,b]);m.setExtension('KHR_materials_emissive_strength',emissive.createEmissiveStrength().setEmissiveStrength(k));}
    else m.setEmissiveFactor([0,0,0]);
    m.setExtras({ss_rol:def.rol,ss_tinte:def.tinte??0,...(def.slot?{ss_slot:def.slot}:{}),...(def.vcol?{ss_color_vertice:true}:{})});
  }
  await io.write(join(dir,base+'.glb'),doc);
  const bytes=await readFile(join(dir,base+'.glb'));
  kit[clave]={nombre:base+'.glb',bytes:bytes.byteLength,sha256:createHash('sha256').update(bytes).digest('hex')};
  await rm(raw);
  salida[clave]=kit[clave];
}
for(const name of Object.keys(kit.materiales))if(!usados.has(name))console.warn('Material definido y sin uso en ningún GLB:',name);
await writeFile(join(dir,'kit.json'),JSON.stringify(kit,null,1));
const por=a=>kit.modulos.filter(m=>(m.archivo??'fachada')===a);
console.log(JSON.stringify({modulos:kit.modulos.length,fachada:{modulos:por('fachada').length,triangulos:por('fachada').reduce((n,m)=>n+m.triangulos,0)},interior:{modulos:por('interior').length,triangulos:por('interior').reduce((n,m)=>n+m.triangulos,0)},...salida}));
