// Biblioteca pintada compartida. Nueve elementos; ningún producto o mueble 3D.
import * as T from 'three';
import {SHOP_CATEGORIES} from '../data/shop-categories.js';
import {referenceBakery,referenceClothes} from './commerce-reference-paint.js';
import {kitAtlasCanvas} from './commerce-kit.js';

// Panadería y ropa conservan la pintura del ejemplo del usuario; el resto usa el kit modular.
export const REFERENCE_CATEGORIES=['panaderia','ropa'];
export const isReferenceCategory=c=>REFERENCE_CATEGORIES.includes(c);

export const TILE_W=768,TILE_H=640,ATLAS_W=1536,ATLAS_H=1408;
const atlases=new Map();
export function commerceAtlas(category='panaderia'){
  if(atlases.has(category))return atlases.get(category);
  if(typeof document==='undefined'){const texture=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.userData.libraryOwned=true;texture.needsUpdate=true;atlases.set(category,texture);return texture;}
  if(!isReferenceCategory(category)){const texture=new T.CanvasTexture(kitAtlasCanvas(category));texture.name='ss_comercios_kit_'+category;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;texture.generateMipmaps=true;texture.userData={libraryOwned:true,ssCommerceAtlas:true};atlases.set(category,texture);return texture;}
  const canvas=document.createElement('canvas');canvas.width=ATLAS_W;canvas.height=ATLAS_H;const g=canvas.getContext('2d'),c=SHOP_CATEGORIES.find(c=>c.id===category)??SHOP_CATEGORIES.at(-1);
  const reference=category==='panaderia'?referenceBakery():referenceClothes();
  for(let col=0;col<4;col++){const x=col%2*TILE_W,y=Math.floor(col/2)*TILE_H,image=[reference.back,reference.far,reference.counter,reference.near][col];g.drawImage(image,x,y,TILE_W,TILE_H);}
  // Suelo hidráulico, techo y persiana comparten una franja; sin mapas independientes por tienda.
  const bottom=TILE_H*2;g.save();g.translate(0,bottom);{const image=reference.floor;for(let y=0;y<128;y+=32)for(let x=0;x<512;x+=43)g.drawImage(image,x,y,43,32);}const ceiling=g.createLinearGradient(512,0,1024,0);ceiling.addColorStop(0,'#8c7760');ceiling.addColorStop(.45,c.paper);ceiling.addColorStop(1,'#b3a48d');g.fillStyle=ceiling;g.fillRect(512,0,512,128);g.fillStyle='#92979a';g.fillRect(1024,0,512,128);for(let y=0;y<128;y+=5){g.fillStyle='#b1b6b8';g.fillRect(1024,y,512,2);g.fillStyle='#626b70';g.fillRect(1024,y+4,512,1);}g.restore();
  const texture=new T.CanvasTexture(canvas);texture.name='ss_comercios_pintados_'+category;texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;texture.generateMipmaps=true;texture.userData={libraryOwned:true,ssCommerceAtlas:true};atlases.set(category,texture);return texture;
}
export function tileUV(row,col,mirror=false){const pad=3,x=row===17?col*512:col%2*TILE_W,y=row===17?TILE_H*2:Math.floor(col/2)*TILE_H,w=row===17?512:TILE_W,h=row===17?128:TILE_H,u0=(x+pad)/ATLAS_W,u1=(x+w-pad)/ATLAS_W,v0=1-(y+h-pad)/ATLAS_H,v1=1-(y+pad)/ATLAS_H;return mirror?[[u1,v0],[u0,v0],[u0,v1],[u1,v1]]:[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];}
export function signAtlas(list){
  if(typeof document==='undefined'){const texture=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);texture.needsUpdate=true;return {texture,uv:new Map(list.map(c=>[c.id,{sign:[[0,0],[1,0],[1,1],[0,1]],status:[[0,0],[1,0],[1,1],[0,1]],tagline:[[0,0],[1,0],[1,1],[0,1]]}]))};}
  const width=1024,cellW=512,cellH=128,rows=Math.max(1,Math.ceil(list.length/2)),height=2**Math.ceil(Math.log2(rows*cellH)),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const g=canvas.getContext('2d'),uv=new Map();
  list.forEach((c,i)=>{const x=i%2*cellW,y=Math.floor(i/2)*cellH;g.fillStyle=c.paper;g.fillRect(x,y,cellW,78);g.strokeStyle=c.frame;g.lineWidth=3;g.strokeRect(x+7,y+6,cellW-14,65);g.fillStyle=c.frame;g.textAlign='center';let size=42;g.font=`600 ${size}px Georgia,serif`;while(g.measureText(c.name).width>cellW-30&&size>16)g.font=`600 ${--size}px Georgia,serif`;g.fillText(c.name,x+cellW/2,y+51);g.fillStyle=c.closed?'#8d4d43':'#3f6b50';g.fillRect(x+6,y+84,138,34);g.fillStyle='#fff7e4';g.font='600 21px system-ui';g.fillText(c.closed?'CERRADO':'ABIERTO',x+75,y+108);g.textAlign='left';g.fillStyle=c.frame;g.font='18px system-ui';g.fillText(c.offers?c.vinyl:c.category==='panaderia'?'Pan recién hecho':c.horario||'Bienvenidos',x+155,y+107,350);
    const box=(lo,hi,left=2,right=cellW-2)=>[[(x+left)/width,1-(y+hi)/height],[(x+right)/width,1-(y+hi)/height],[(x+right)/width,1-(y+lo)/height],[(x+left)/width,1-(y+lo)/height]];uv.set(c.id,{sign:box(2,77),status:box(81,123,2,148),tagline:box(81,123,150,510)});
  });
  const texture=new T.CanvasTexture(canvas);texture.name='ss_rotulos_sector';texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;texture.userData.ssCommerceAtlas=true;return {texture,uv};
}
