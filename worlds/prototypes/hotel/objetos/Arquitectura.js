import * as T from '../engine/three.js';
import { caja,cilindro } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';
import { crearMaterialToon } from '../engine/Luz25D.js';
export function crearPisoHotel({ancho,fondo,color=C.stone}={}) {const r=new T.Group();caja(r,'losa',ancho,.18,fondo,color,0,-.09,0,false);return r;}
export function crearMuro({ancho=5,alto=3.4,fondo=.2,color=C.ivory}={}) {const r=new T.Group();caja(r,'muro',ancho,alto,fondo,color,0,alto/2,0,false);caja(r,'zócalo',ancho,.12,fondo+.04,C.wood,0,.06,0,false);return r;}
export function crearColumna({alto=3.4}={}) {const r=new T.Group();caja(r,'fuste',.36,alto,.36,C.stone);caja(r,'base',.48,.18,.48,C.ivory);caja(r,'capitel',.52,.18,.52,C.gold,0,alto-.09);return r;}
export function crearAlfombra({ancho=3,fondo=2,color=C.teal}={}) {const r=new T.Group();caja(r,'borde',ancho,.025,fondo,C.gold,0,.0125,0,false);caja(r,'tejido',ancho-.15,.027,fondo-.15,color,0,.017,0,false);return r;}
export function crearVentana({ancho=2,alto=2.2,vidrio=null}={}) {
  const r=new T.Group();
  if(vidrio){
    const material=crearMaterialToon({color:vidrio.color,opacidad:vidrio.opacity,transparente:true,doble:true,bandas:3});
    material.depthWrite=false;
    // Conserva transparencia y nombres: el optimizador de sólidos no debe fusionar el vidrio.
    material.userData.albedo=true;
    const glass=new T.Mesh(new T.PlaneGeometry(ancho,alto),material);glass.name='cristal';glass.position.y=alto/2;r.add(glass);
    const glintMaterial=crearMaterialToon({color:'#ffffff',opacidad:vidrio.highlightOpacity,transparente:true,doble:true,luzPropia:1});
    glintMaterial.depthWrite=false;glintMaterial.userData.albedo=true;
    const shape=new T.Shape();shape.moveTo(-ancho*.4,alto*.16);shape.lineTo(-ancho*.32,alto*.16);shape.lineTo(ancho*.15,alto*.86);shape.lineTo(ancho*.07,alto*.86);shape.closePath();
    const glint=new T.Mesh(new T.ShapeGeometry(shape),glintMaterial);glint.name='reflejo-sutil-vidrio';glint.position.z=.003;r.add(glint);
  }else caja(r,'cristal',ancho,alto,.06,C.blue,0,alto/2,0,false);
  for(const x of [-1,1])caja(r,'marco-'+x,.06,alto+.12,.11,C.darkWood,x*ancho/2,(alto+.12)/2);
  for(const y of [0,alto/2,alto])caja(r,'travesaño-'+y,ancho+.06,.055,.11,C.darkWood,0,y);
  return r;
}
export function crearLampara({alto=1.6,colgante=false}={}) {const r=new T.Group();cilindro(r,'pie',.035,alto-.32,C.gold,0,(alto-.32)/2);if(!colgante)cilindro(r,'base',.2,.035,C.gold);cilindro(r,'pantalla',.25,.28,C.ivory,0,alto-.18);return r;}
