// Hornea las especies ez-tree del catálogo a GLB ligeros para la web (public/assets/arboles/eztree/).
// Uso: node scripts/hornear-arboles.mjs [--texturas]
//   --texturas  vuelve a dibujar las PNG de racimos (requiere Playwright con Chromium).
// Cada GLB: dos primitivas (tronco con color por vértice; hojas con color por vértice y una celda de
// racimo de 256 px), normales en int8 y uv/color normalizados (KHR_mesh_quantization), sin animación.
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {Document,NodeIO} from '@gltf-transform/core';
import {KHRMeshQuantization} from '@gltf-transform/extensions';
import {PNG} from 'pngjs';
import {EZTREE_SPECIES,LEAF_TEXTURES,buildSpecies} from './arboles/especies-eztree.mjs';
import {LEAF_ATLAS_SOURCE} from './arboles/racimos.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'public','assets','arboles','eztree');
await mkdir(out,{recursive:true});
const exists=p=>access(p).then(()=>true,()=>false);

// 1) Texturas de racimo (una PNG por celda), recortadas del atlas de la vista previa aprobada.
const texPath=t=>join(out,'racimo-'+t+'.png');
if(process.argv.includes('--texturas')||!(await Promise.all(LEAF_TEXTURES.map(t=>exists(texPath(t))))).every(Boolean)){
  let chromium;try{({chromium}=createRequire(import.meta.url)('playwright'));}catch{throw Error('Faltan las PNG de racimos y no hay Playwright para dibujarlas.');}
  const browser=await chromium.launch(),page=await browser.newPage();
  const url=await page.evaluate(src=>new Function(src+';return leafAtlas')()(512).toDataURL('image/png'),LEAF_ATLAS_SOURCE);
  await browser.close();
  const atlas=PNG.sync.read(Buffer.from(url.split(',')[1],'base64')),H=atlas.width/2;
  LEAF_TEXTURES.forEach((t,i)=>{const cell=new PNG({width:H,height:H}),ox=(i%2)*H,oy=Math.floor(i/2)*H;
    for(let y=0;y<H;y++)atlas.data.copy(cell.data,y*H*4,((oy+y)*atlas.width+ox)*4,((oy+y)*atlas.width+ox+H)*4);
    // Sin halo blanco en el mipmap: el color de los píxeles transparentes copia el del racimo.
    for(let p=0;p<cell.data.length;p+=4)if(cell.data[p+3]===0){cell.data[p]=cell.data[p+1]=cell.data[p+2]=200;}
    return writeFile(texPath(t),PNG.sync.write(cell,{colorType:6}));});
  await new Promise(r=>setTimeout(r,50));
}

// 2) GLB por especie.
const io=new NodeIO().registerExtensions([KHRMeshQuantization]);
const q8=v=>Math.max(-127,Math.min(127,Math.round(v*127)));
const report=[];
for(const sp of EZTREE_SPECIES){
  const {branches,leaves,tris}=buildSpecies(sp);
  const doc=new Document();doc.createExtension(KHRMeshQuantization).setRequired(true);
  const buffer=doc.createBuffer();
  const prim=(g,material,uv)=>{
    const P=g.attributes.position,N=g.attributes.normal,C=g.attributes.color,n=P.count;
    const pos=new Float32Array(P.array),nor=new Int8Array(n*3),col=new Uint8Array(n*3);
    for(let i=0;i<n*3;i++){nor[i]=q8(N.array[i]);col[i]=Math.round(Math.min(1,Math.max(0,C.array[i]))*255);}
    const p=doc.createPrimitive().setMaterial(material)
      .setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
      .setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(nor).setNormalized(true).setBuffer(buffer))
      .setAttribute('COLOR_0',doc.createAccessor().setType('VEC3').setArray(col).setNormalized(true).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(g.index.array)).setBuffer(buffer));
    if(uv){const U=g.attributes.uv,a=new Uint16Array(U.count*2);for(let i=0;i<a.length;i++)a[i]=Math.round(Math.min(1,Math.max(0,U.array[i]))*65535);
      p.setAttribute('TEXCOORD_0',doc.createAccessor().setType('VEC2').setArray(a).setNormalized(true).setBuffer(buffer));}
    return p;
  };
  const bark=doc.createMaterial('corteza').setBaseColorFactor([1,1,1,1]).setRoughnessFactor(1).setMetallicFactor(0);
  const tex=doc.createTexture('racimo-'+sp.tex).setImage(await readFile(texPath(sp.tex))).setMimeType('image/png').setURI('racimo-'+sp.tex+'.png');
  const leaf=doc.createMaterial('hojas').setBaseColorFactor([1,1,1,1]).setBaseColorTexture(tex).setAlphaMode('MASK').setAlphaCutoff(.5).setDoubleSided(true).setRoughnessFactor(1).setMetallicFactor(0);
  const mesh=doc.createMesh(sp.id).addPrimitive(prim(branches,bark,false)).addPrimitive(prim(leaves,leaf,true));
  const node=doc.createNode(sp.id).setMesh(mesh);doc.createScene(sp.id).addChild(node);
  doc.getRoot().getAsset().generator='Atlas · hornear-arboles (ez-tree 1.1.0, MIT, Daniel Greenheck)';
  doc.getRoot().getAsset().extras={especie:sp.id,triangulos:tris,altura:sp.height,textura:sp.tex};
  const glb=await io.writeBinary(doc);await writeFile(join(out,sp.id+'.glb'),glb);
  report.push({id:sp.id,triangulos:tris,bytes:glb.byteLength});
}
await writeFile(join(out,'informe.json'),JSON.stringify({generado:'scripts/hornear-arboles.mjs',fuente:'ez-tree 1.1.0 (MIT)',especies:report},null,2)+'\n');
console.table(report);
