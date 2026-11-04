// Versiones ligeras (LOD lejano) de las piezas más repetidas: misma silueta y colores, ~20 triángulos.
import * as THREE from 'three';
import {SURF} from '../geom/mesh.js';
import {registerBuilders,cube,pane,WHITE,TINT2,GLASS,GLASS_DARK} from './elements.js';

function frameRing(mb,x0,y0,x1,y1,t,z,col){
  pane(mb,x0-t,y0-t,x1+t,y0,z,col,SURF.trim);pane(mb,x0-t,y1,x1+t,y1+t,z,col,SURF.trim);
  pane(mb,x0-t,y0,x0,y1,z,col,SURF.trim);pane(mb,x1,y0,x1+t,y1,z,col,SURF.trim);
}

function windowProxy(mb,o){
  const {w,h}=o,sw=o.surround?.w??0,sd=o.surround?.depth??0;
  const top=o.arch?h:h;
  pane(mb,-w/2,0,w/2,top,.02,o.dark?GLASS_DARK:GLASS,SURF.glass);
  mb.setTint(1);frameRing(mb,-w/2+.06,.06,w/2-.06,top-.06,.06,.03,WHITE);if(w>.7)pane(mb,-.03,0,.03,top,.031,WHITE,SURF.trim);mb.setTint(0);
  if(o.surround)frameRing(mb,-w/2,0,w/2,top,sw,sd,TINT2);
  if(o.sill!==false&&!o.panelBottom)cube(mb,-w/2-(sw||.06)-.04,-.07,0,w/2+(sw||.06)+.04,-.005,(sd||.04)+.12,TINT2);
  if(o.panelBottom){mb.setTint(1);pane(mb,-w/2,0,w/2,Math.min(.95,h*.35),.025,WHITE,SURF.trim);mb.setTint(0);}
  if(o.blind!=null){const drop=Math.max(.08,h*o.blind);pane(mb,-w/2,h-drop,w/2,h,.026,new THREE.Color('#e9e4da'),SURF.trim);}
}

function balconyProxy(mb,o){
  const {w,depth:d}=o,rh=o.railH??1.0;
  cube(mb,-w/2,-.14,0,w/2,0,d,TINT2);
  if(o.rail==='solid'||o.rail==='balustre'){cube(mb,-w/2,0,d-.1,w/2,rh,d,TINT2);return;}
  mb.setTint(1);
  pane(mb,-w/2,.05,w/2,rh,d-.02,WHITE,SURF.metal);
  mb.quad([-w/2,.05,0],[-w/2,.05,d],[-w/2,rh,d],[-w/2,rh,0],WHITE,SURF.metal,[-1,0,0]);
  mb.quad([w/2,.05,d],[w/2,.05,0],[w/2,rh,0],[w/2,rh,d],WHITE,SURF.metal,[1,0,0]);
  mb.setTint(0);
}

registerBuilders({windowProxy,balconyProxy});
export const PROXY={window:'windowProxy',balcony:'balconyProxy'};
