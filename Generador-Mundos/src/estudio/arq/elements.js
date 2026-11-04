// Biblioteca de elementos arquitectónicos paramétricos (se instancian por tipo y medida).
// Sistema local: X a lo largo de la fachada, Y arriba, Z hacia fuera; origen en el centro
// inferior del hueco sobre el plano del muro. Las piezas con tinte (aTint=1) van en blanco
// y toman el color de cada instancia (carpintería, forja, lona, rótulo...).
import * as THREE from 'three';
import {MeshBuilder,SURF} from '../geom/mesh.js';

const C=hex=>new THREE.Color(hex);
const WHITE=C('#ffffff');
// Color centinela: blanco que toma el segundo tinte de la instancia (piedra, losa, recercado).
const TINT2=Object.assign(C('#ffffff'),{__tint:2});
const GLASS=C('#3e5470'),GLASS_SHOP=C('#4a6680'),GLASS_DARK=C('#2c3a4c');
const IRON=C('#2f3237');

// Caja por esquinas (sin giro). caps=false omite tapas superior/inferior (barrotes).
function cube(mb,x0,y0,z0,x1,y1,z1,col,surf=SURF.trim,caps=true){
  const cx=(x0+x1)/2,cy=(y0+y1)/2,cz=(z0+z1)/2,hx=Math.abs(x1-x0)/2,hy=Math.abs(y1-y0)/2,hz=Math.abs(z1-z0)/2;
  if(caps){mb.box(cx,cy,cz,hx,hy,hz,0,col,surf);return;}
  const v=[[cx-hx,cy-hy,cz-hz],[cx+hx,cy-hy,cz-hz],[cx+hx,cy+hy,cz-hz],[cx-hx,cy+hy,cz-hz],[cx-hx,cy-hy,cz+hz],[cx+hx,cy-hy,cz+hz],[cx+hx,cy+hy,cz+hz],[cx-hx,cy+hy,cz+hz]];
  mb.quad(v[4],v[5],v[6],v[7],col,surf);mb.quad(v[1],v[0],v[3],v[2],col,surf);mb.quad(v[5],v[1],v[2],v[6],col,surf);mb.quad(v[0],v[4],v[7],v[3],col,surf);
}
const tinted=(mb,fn)=>{mb.setTint(1);fn();mb.setTint(0);};
// Plano vertical frontal (mirando +Z).
function pane(mb,x0,y0,x1,y1,z,col,surf){mb.quad([x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z],col,surf,[0,0,1]);}

// Arco de medio punto (corona del hueco) como abanico de cajas.
function archRing(mb,cx,cy,r,thick,depth,z0,col,seg=8){
  for(let i=0;i<seg;i++){
    const a0=Math.PI*i/seg,a1=Math.PI*(i+1)/seg;
    const p=(a,rr)=>[cx+Math.cos(a)*rr,cy+Math.sin(a)*rr];
    const A=p(a0,r),B=p(a1,r),Cc=p(a1,r+thick),D=p(a0,r+thick);
    const z1=z0+depth;
    mb.quad([A[0],A[1],z1],[D[0],D[1],z1],[Cc[0],Cc[1],z1],[B[0],B[1],z1],col,SURF.trim,[0,0,1]);
    mb.quad([Cc[0],Cc[1],z0],[Cc[0],Cc[1],z1],[D[0],D[1],z1],[D[0],D[1],z0],col,SURF.trim);
    mb.quad([A[0],A[1],z0],[A[0],A[1],z1],[B[0],B[1],z1],[B[0],B[1],z0],col,SURF.trim);
  }
}
function archPane(mb,cx,cy,r,z,col,surf,seg=10){
  for(let i=0;i<seg;i++){const a0=Math.PI*i/seg,a1=Math.PI*(i+1)/seg;
    mb.tri([cx,cy,z],[cx+Math.cos(a0)*r,cy+Math.sin(a0)*r,z],[cx+Math.cos(a1)*r,cy+Math.sin(a1)*r,z],col,surf,[0,0,1]);}
}

// ---------------------------------------------------------------- Ventanas
// opts: surround {w,depth,color,kind:'simple'|'pediment'|'keystone'|'ears'}, sill, mullion, transom, arch,
// shutters ('open'|'louvre'), blind (fracción bajada), grille ('flat'|'box'), panelBottom (balconera)
export function window_(mb,o){
  const {w,h}=o,sw=o.surround?.w??0,sd=o.surround?.depth??0,stone=TINT2;
  const recess=o.recess??.1; // carpintería retranqueada respecto al frente del recercado
  const fz=o.surround?Math.max(.02,sd-recess):.04;
  // Recercado
  if(o.surround){
    cube(mb,-w/2-sw,o.sillLess?0:-.02,0,-w/2,h+(o.arch?0:sw),sd,stone);
    cube(mb,w/2,o.sillLess?0:-.02,0,w/2+sw,h+(o.arch?0:sw),sd,stone);
    if(o.arch)archRing(mb,0,h-w/2,w/2,sw,sd,0,stone);
    else cube(mb,-w/2-sw,h,0,w/2+sw,h+sw,sd+.01,stone);
    // intradós (retranqueo visible)
    cube(mb,-w/2,h-.001,0,w/2,h+.001,fz,stone,SURF.trim,false);
    const kind=o.surround.kind;
    if(kind==='pediment'){cube(mb,-w/2-sw-.12,h+sw,0,w/2+sw+.12,h+sw+.09,sd+.14,stone);cube(mb,-w/2-sw-.05,h+sw+.09,0,w/2+sw+.05,h+sw+.16,sd+.08,stone);}
    else if(kind==='keystone'){cube(mb,-.12,h-.05,0,.12,h+sw+.08,sd+.04,stone);}
    else if(kind==='ears'){cube(mb,-w/2-sw-.07,h+sw-.22,0,-w/2-sw,h+sw,sd,stone);cube(mb,w/2+sw,h+sw-.22,0,w/2+sw+.07,h+sw,sd,stone);}
    else if(kind==='cornice'){cube(mb,-w/2-sw-.08,h+sw,0,w/2+sw+.08,h+sw+.12,sd+.1,stone);}
  }
  // Alféizar
  if(o.sill!==false&&!o.panelBottom){
    const sc=TINT2;
    cube(mb,-w/2-(sw||.06)-.04,-.07,0,w/2+(sw||.06)+.04,-.005,(sd||.04)+.12,sc);
  }
  // Vidrio y carpintería
  if(o.arch){pane(mb,-w/2,0,w/2,h-w/2,fz-.012,GLASS,SURF.glass);archPane(mb,0,h-w/2,w/2,fz-.012,GLASS,SURF.glass);}
  else pane(mb,-w/2,0,w/2,h,fz-.012,o.dark?GLASS_DARK:GLASS,SURF.glass);
  tinted(mb,()=>{
    const ft=o.frame??.055,fd=.045,top=o.arch?h-w/2:h;
    cube(mb,-w/2,0,fz-fd,-w/2+ft,top,fz,WHITE,SURF.trim);
    cube(mb,w/2-ft,0,fz-fd,w/2,top,fz,WHITE,SURF.trim);
    cube(mb,-w/2+ft,top-ft,fz-fd,w/2-ft,top,fz,WHITE,SURF.trim);
    cube(mb,-w/2+ft,0,fz-fd,w/2-ft,ft,fz,WHITE,SURF.trim);
    if(o.mullion!==false&&w>.7)cube(mb,-ft*.45,0,fz-fd,ft*.45,top,fz-.005,WHITE,SURF.trim);
    if(o.transom){const ty=top*o.transom;cube(mb,-w/2,ty-ft*.4,fz-fd,w/2,ty+ft*.4,fz-.005,WHITE,SURF.trim);}
    if(o.panes){ // cuarterones de vidrio (ventanas antiguas)
      for(let k=1;k<o.panes;k++){const y=top*k/o.panes;cube(mb,-w/2,y-.012,fz-.03,w/2,y+.012,fz-.008,WHITE,SURF.trim,false);}
    }
    if(o.panelBottom){ // balconera: panel ciego inferior
      const ph=Math.min(.95,h*.35);
      pane(mb,-w/2+ft,ft,w/2-ft,ph,fz-.009,WHITE,SURF.trim);
      cube(mb,-w/2,ph-ft*.5,fz-fd,w/2,ph+ft*.5,fz-.004,WHITE,SURF.trim);
    }
    if(o.arch&&!o.noFanBars){for(let k=-1;k<=1;k++){const a=Math.PI/2+k*.6;cube(mb,Math.cos(a)*.02-.012,h-w/2,fz-.03,Math.cos(a)*.02+.012,h-w/2+w/2*.95,fz-.01,WHITE,SURF.trim,false);}}
  });
  // Persiana enrollable (cajón + lamas bajadas)
  if(o.blind!=null){
    const bc=C(o.blindColor??'#e9e4da');
    cube(mb,-w/2-.03,h-.02,0,w/2+.03,h+.2,(sd||.02)+.06,bc);
    const drop=Math.max(.08,h*o.blind);
    pane(mb,-w/2+.01,h-drop,w/2-.01,h,fz-.004,bc,SURF.trim);
    for(let y=h-drop+.1;y<h;y+=.16)cube(mb,-w/2+.01,y,fz-.004,w/2-.01,y+.015,fz+.004,C('#cfc8bb'),SURF.trim,false);
  }
  // Contraventanas abiertas (lamas)
  if(o.shutters){
    tinted(mb,()=>{for(const sg of [-1,1]){
      const x0=sg<0?-w/2-sw-w/2:w/2+sw,x1=x0+w/2,zf=(sd||0)+.045;
      cube(mb,x0+.01,0,(sd||0)+.005,x1-.01,h,zf,WHITE,SURF.trim);
      if(o.shutters==='louvre')for(let y=.12;y<h-.08;y+=.13)cube(mb,x0+.05,y,zf,x1-.05,y+.025,zf+.012,WHITE,SURF.trim,false);
    }});
  }
  // Reja
  if(o.grille){
    const box=o.grille==='box',zf=box?.26:(sd||0)+.07,gw=w+(box?.16:.02),gh=h+(box?.1:0),y0=box?-.1:0;
    tinted(mb,()=>{
      for(let x=-gw/2+.06;x<=gw/2-.05;x+=.12)cube(mb,x-.011,y0,zf-.022,x+.011,y0+gh,zf,WHITE,SURF.metal,false);
      for(const y of [y0+.05,y0+gh*.5,y0+gh-.04])cube(mb,-gw/2,y-.015,zf-.03,gw/2,y+.015,zf+.004,WHITE,SURF.metal);
      if(box){for(const sx of [-gw/2,gw/2])for(const y of [y0+.04,y0+gh-.04])cube(mb,sx-.015,y-.015,0,sx+.015,y+.015,zf,WHITE,SURF.metal);
        // remate superior curvo simplificado
        cube(mb,-gw/2,y0+gh,zf-.24,gw/2,y0+gh+.03,zf,WHITE,SURF.metal);}
    });
  }
}

// ---------------------------------------------------------------- Balcones
// rail: 'iron' | 'balustre' | 'glass' | 'solid'. Origen al nivel del suelo de la planta.
export function balcony(mb,o){
  const {w,depth:d}=o,slab=TINT2,rh=o.railH??1.0;
  cube(mb,-w/2,-.14,0,w/2,0,d,slab);
  cube(mb,-w/2+.06,-.22,0,w/2-.06,-.14,d-.08,slab); // moldura inferior
  if(o.corbels){for(const x of [-w/2+.18,w/2-.18])cube(mb,x-.07,-.42,0,x+.07,-.14,Math.min(.3,d*.6),slab);}
  if(o.rail==='solid'){
    const wc=TINT2;
    cube(mb,-w/2,0,d-.1,w/2,rh,d,wc);cube(mb,-w/2,0,0,-w/2+.1,rh,d-.1,wc);cube(mb,w/2-.1,0,0,w/2,rh,d-.1,wc);
    cube(mb,-w/2-.02,rh,-.0,w/2+.02,rh+.05,d+.02,slab);
    return;
  }
  if(o.rail==='balustre'){
    const st=TINT2;
    cube(mb,-w/2,rh-.08,d-.18,w/2,rh,d,st);cube(mb,-w/2,0,d-.16,w/2,.08,d-.02,st);
    for(let x=-w/2+.12;x<w/2-.06;x+=.2){mb.cylinder(x,.08,d-.09,.045,rh-.16,6,st,SURF.trim,{r2:.03,top:false});}
    for(const sx of [-1,1]){cube(mb,sx*w/2-.07,0,0,sx*w/2+.07*(-sx)+0,rh,d,st);}
    return;
  }
  if(o.rail==='glass'){
    pane(mb,-w/2+.02,.05,w/2-.02,rh-.04,d-.02,C('#8fb3c4'),SURF.glass);
    tinted(mb,()=>{cube(mb,-w/2,rh-.04,d-.05,w/2,rh,d,WHITE,SURF.metal);for(const sx of [-w/2,w/2])cube(mb,sx-.02,0,d-.05,sx+.02,rh,d,WHITE,SURF.metal);});
    return;
  }
  // Forja
  tinted(mb,()=>{
    cube(mb,-w/2,rh-.035,d-.05,w/2,rh,d,WHITE,SURF.metal);
    cube(mb,-w/2,.09,d-.035,w/2,.12,d-.005,WHITE,SURF.metal,false);
    for(const sx of [-w/2,w/2]){cube(mb,sx-.02,rh-.035,0,sx+.02,rh,d,WHITE,SURF.metal);cube(mb,sx-.015,.09,0,sx+.015,.12,d,WHITE,SURF.metal,false);}
    const step=o.dense?.11:.14;
    for(let x=-w/2+step/2;x<w/2;x+=step)cube(mb,x-.009,.0,d-.03,x+.009,rh-.03,d-.012,WHITE,SURF.metal,false);
    for(const sx of [-w/2,w/2])for(let z=step;z<d-.05;z+=step)cube(mb,sx-.009,0,z-.009,sx+.009,rh-.03,z+.009,WHITE,SURF.metal,false);
    if(o.ornament){ // friso de forja bajo el pasamanos
      cube(mb,-w/2,rh-.2,d-.03,w/2,rh-.17,d-.01,WHITE,SURF.metal,false);
      for(let x=-w/2+.07;x<w/2;x+=.14)cube(mb,x-.04,rh-.17,d-.028,x+.04,rh-.15,d-.012,WHITE,SURF.metal,false);
    }
  });
}

// Mirador / tribuna acristalada que vuela sobre la fachada.
export function mirador(mb,o){
  const {w,h,depth:d}=o,base=TINT2;
  cube(mb,-w/2-.05,-.18,0,w/2+.05,0,d+.05,base);
  cube(mb,-w/2-.08,h,0,w/2+.08,h+.16,d+.1,base);
  cube(mb,-w/2-.02,h+.16,0,w/2+.02,h+.26,d+.02,base);
  pane(mb,-w/2+.04,.9,w/2-.04,h-.05,d-.04,GLASS,SURF.glass);
  mb.quad([-w/2+.03,.9,0],[-w/2+.03,.9,d-.04],[-w/2+.03,h-.05,d-.04],[-w/2+.03,h-.05,0],GLASS,SURF.glass,[-1,0,0]);
  mb.quad([w/2-.03,.9,d-.04],[w/2-.03,.9,0],[w/2-.03,h-.05,0],[w/2-.03,h-.05,d-.04],GLASS,SURF.glass,[1,0,0]);
  tinted(mb,()=>{
    cube(mb,-w/2,0,d-.06,w/2,.9,d,WHITE,SURF.trim);
    cube(mb,-w/2,0,0,-w/2+.06,.9,d,WHITE,SURF.trim);cube(mb,w/2-.06,0,0,w/2,.9,d,WHITE,SURF.trim);
    for(const x of [-w/2,-w/6,w/6,w/2])cube(mb,x-.035,.9,d-.07,x+.035,h,d-.01,WHITE,SURF.trim);
    for(const z of [.04,d-.04])for(const sx of [-1,1])cube(mb,sx*(w/2-.03)-.03,.9,z-.03,sx*(w/2-.03)+.03,h,z+.03,WHITE,SURF.trim);
    cube(mb,-w/2,.88,d-.07,w/2,.94,d-.01,WHITE,SURF.trim);cube(mb,-w/2,h-.45,d-.06,w/2,h-.4,d-.02,WHITE,SURF.trim);
  });
}

// Balcón de cajón de madera (Lima, Cartagena, Canarias).
export function colonialBalcony(mb,o){
  const {w,h,depth:d}=o;
  tinted(mb,()=>{
    cube(mb,-w/2-.06,-.25,0,w/2+.06,0,d+.06,WHITE,SURF.trim);
    for(let x=-w/2+.15;x<w/2;x+=.45)cube(mb,x-.05,-.6,0,x+.05,-.25,Math.min(.5,d*.7),WHITE,SURF.trim);
    cube(mb,-w/2,0,d-.06,w/2,.95,d,WHITE,SURF.trim);
    cube(mb,-w/2,0,0,-w/2+.06,.95,d,WHITE,SURF.trim);cube(mb,w/2-.06,0,0,w/2,.95,d,WHITE,SURF.trim);
    for(let x=-w/2+.25;x<w/2-.1;x+=.5)cube(mb,x-.15,.25,d-.075,x+.15,.75,d-.055,WHITE,SURF.trim,false);
    for(let x=-w/2;x<=w/2+.01;x+=w/Math.max(2,Math.round(w/.7)))cube(mb,x-.04,.95,d-.08,x+.04,h,d,WHITE,SURF.trim);
    for(let y=1.25;y<h-.15;y+=.16)cube(mb,-w/2,y-.01,d-.06,w/2,y+.01,d-.03,WHITE,SURF.trim,false);
    for(let x=-w/2+.08;x<w/2;x+=.16)cube(mb,x-.01,.95,d-.06,x+.01,h,d-.03,WHITE,SURF.trim,false);
    cube(mb,-w/2-.12,h,0,w/2+.12,h+.12,d+.16,WHITE,SURF.trim);
  });
  pane(mb,-w/2+.06,.97,w/2-.06,h,d-.09,GLASS_DARK,SURF.glass);
  // tejadillo
  const roof=C('#b9643f');
  mb.quad([-w/2-.15,h+.12,d+.28],[w/2+.15,h+.12,d+.28],[w/2+.15,h+.42,0],[-w/2-.15,h+.42,0],roof,SURF.roof);
}

// ---------------------------------------------------------------- Puertas
// kind: 'portal' (acceso de vivienda con montante), 'house', 'garage', 'church'
export function door(mb,o){
  const {w,h}=o,stone=TINT2,sw=o.surroundW??(o.kind==='portal'?.32:o.kind==='church'?.5:.12);
  const sd=o.kind==='house'?.08:.2,fz=.04,arch=o.arch;
  const top=arch?h-w/2:h;
  if(o.kind!=='garage'){
    cube(mb,-w/2-sw,0,0,-w/2,top,sd,stone);cube(mb,w/2,0,0,w/2+sw,top,sd,stone);
    if(arch)archRing(mb,0,top,w/2,sw,sd,0,stone,10);else cube(mb,-w/2-sw,h,0,w/2+sw,h+sw,sd+.02,stone);
    if(o.kind==='portal'&&!arch)cube(mb,-w/2-sw-.1,h+sw,0,w/2+sw+.1,h+sw+.12,sd+.12,stone);
    if(o.kind==='church'){for(let k=1;k<=2;k++){const e=k*.18;cube(mb,-w/2-sw-e,0,0,-w/2-sw-e+.16,top,sd+.08*k,stone);cube(mb,w/2+sw+e-.16,0,0,w/2+sw+e,top,sd+.08*k,stone);if(arch)archRing(mb,0,top,w/2+sw+e-.16,.16,sd+.08*k,0,stone,10);}}
    cube(mb,-w/2-sw-.05,-.02,0,w/2+sw+.05,.06,.35,stone); // escalón
  }
  const leafTop=o.transom&&!arch?h-.65:top;
  tinted(mb,()=>{
    if(o.kind==='garage'){
      cube(mb,-w/2-.08,0,0,w/2+.08,h+.1,.08,WHITE,SURF.metal);
      pane(mb,-w/2,0,w/2,h,.085,WHITE,SURF.metal);
      for(let y=.25;y<h;y+=.25)cube(mb,-w/2,y-.012,.08,w/2,y+.012,.1,WHITE,SURF.metal,false);
      return;
    }
    pane(mb,-w/2,0,w/2,leafTop,fz,WHITE,SURF.trim);
    if(arch)archPane(mb,0,top,w/2,fz-.004,GLASS_DARK,SURF.glass);
    const leaves=w>1.3?2:1,lw=w/leaves;
    for(let k=0;k<leaves;k++){
      const x0=-w/2+k*lw;
      // cuarterones
      for(const [y0,y1]of [[.25,leafTop*.45],[leafTop*.52,leafTop-.2]]){
        cube(mb,x0+.12,y0,fz,x0+lw-.12,y1,fz+.035,WHITE,SURF.trim);
      }
      cube(mb,x0,0,fz,x0+.05,leafTop,fz+.05,WHITE,SURF.trim);
    }
    if(leaves===2)cube(mb,-.025,0,fz,.025,leafTop,fz+.055,WHITE,SURF.trim);
    if(o.transom&&!arch){cube(mb,-w/2,leafTop,fz-.02,w/2,leafTop+.07,fz+.04,WHITE,SURF.trim);}
  });
  if(o.transom&&!arch){pane(mb,-w/2,leafTop+.07,w/2,h,fz-.012,GLASS,SURF.glass);
    for(let x=-w/2+.2;x<w/2;x+=.2)cube(mb,x-.01,leafTop+.07,fz-.01,x+.01,h,fz+.01,IRON,SURF.metal,false);}
  // pomos
  cube(mb,-.12,leafTop*.48,fz+.04,-.07,leafTop*.48+.06,fz+.09,C('#c9a24a'),SURF.metal);
}

// Escaparate de comercio en planta baja.
export function shopfront(mb,o){
  const {w,h}=o,door=o.door??Math.min(1.1,w*.35),dx=o.doorSide??(w/2-door/2-.25);
  tinted(mb,()=>{
    cube(mb,-w/2,0,0,-w/2+.12,h,.12,WHITE,SURF.trim);cube(mb,w/2-.12,0,0,w/2,h,.12,WHITE,SURF.trim);
    cube(mb,-w/2,h-.12,0,w/2,h,.12,WHITE,SURF.trim);
    // El zócalo pertenece al escaparate fijo; no cruza la hoja de la puerta.
    cube(mb,-w/2+.12,0,0,dx-door/2-.05,.45,.1,WHITE,SURF.trim);
    if(dx+door/2+.05<w/2-.12)cube(mb,dx+door/2+.05,0,0,w/2-.12,.45,.1,WHITE,SURF.trim);
    cube(mb,dx-door/2+.02,0,.02,dx+door/2-.02,.035,.1,WHITE,SURF.trim);
    cube(mb,dx-door/2-.05,0,.02,dx-door/2+.02,h-.12,.1,WHITE,SURF.trim);cube(mb,dx+door/2-.02,0,.02,dx+door/2+.05,h-.12,.1,WHITE,SURF.trim);
    cube(mb,-w/2+.12,h-.72,.03,w/2-.12,h-.66,.1,WHITE,SURF.trim);
  });
  if(o.layered)return; // El vidrio y la ilusión se comparten y exportan por roles.
  pane(mb,-w/2+.12,.45,dx-door/2-.05,h-.12,.04,GLASS_SHOP,SURF.glass);
  pane(mb,dx+door/2+.05,.45,w/2-.12,h-.12,.04,GLASS_SHOP,SURF.glass);
  pane(mb,dx-door/2+.02,0,dx+door/2-.02,h-.72,.035,GLASS_DARK,SURF.glass);
  pane(mb,dx-door/2+.02,h-.66,dx+door/2-.02,h-.12,.035,GLASS_SHOP,SURF.glass);
  // interior sugerido: estantes oscuros detrás del vidrio
  if(o.goods)for(let y=.9;y<h-.8;y+=.45)cube(mb,-w/2+.25,y,-.002,dx-door/2-.2,y+.05,.02,C('#6d5a4a'),SURF.trim,false);
}

export function awning(mb,o){
  const {w,depth:d,drop}=o,stripes=o.striped?Math.max(2,Math.round(w/.32)):1;
  const sw=w/stripes;
  for(let k=0;k<stripes;k++){
    const x0=-w/2+k*sw,x1=x0+sw,t=(k%2===0)?1:0;
    mb.setTint(o.striped?t:1);
    const col=o.striped&&!t?C('#f3efe6'):WHITE;
    mb.quad([x0,-drop,d],[x1,-drop,d],[x1,0,0],[x0,0,0],col,SURF.trim);
    mb.quad([x1,-drop,d],[x0,-drop,d],[x0,0,0],[x1,0,0],col,SURF.trim);
    mb.quad([x0,-drop-.25,d+.01],[x1,-drop-.25,d+.01],[x1,-drop,d+.01],[x0,-drop,d+.01],col,SURF.trim,[0,0,1]);
    mb.quad([x1,-drop-.25,d-.005],[x0,-drop-.25,d-.005],[x0,-drop,d-.005],[x1,-drop,d-.005],col,SURF.trim,[0,0,-1]);
  }
  mb.setTint(0);
  for(const sx of [-w/2,w/2]){mb.quad([sx,-drop,d],[sx,0,0],[sx,-drop,0],[sx,-drop,d],C('#9a9590'),SURF.metal);}
  cube(mb,-w/2,-.04,0,w/2,.04,.1,IRON,SURF.metal);
}

export function sign(mb,o){
  const {w,h}=o;
  tinted(mb,()=>cube(mb,-w/2,0,0,w/2,h,.08,WHITE,SURF.trim));
  // «letras»: barras claras de longitud variable (ya decidida en o.text)
  const text=o.text??[.6],lc=C(o.letter??'#f7f3e8');
  let x=-w/2+.25;
  for(const len of text){const lw=len*(w-.5);if(x+lw>w/2-.2)break;cube(mb,x,h*.3,.08,x+lw,h*.7,.105,lc,SURF.trim);x+=lw+.18;}
}
export function bladeSign(mb,o){
  const {h=.8,d=.7}=o;
  cube(mb,-.02,.2,0,.02,.24,d+.1,IRON,SURF.metal);
  tinted(mb,()=>cube(mb,-.04,-h+.2,.12,.04,.2,d+.05,WHITE,SURF.trim));
  cube(mb,-.05,-h*.5,.3,.05,-.05,d-.12,C('#f7f3e8'),SURF.trim);
}

export function acUnit(mb){
  cube(mb,-.4,0,0,.4,.55,.3,C('#e9e9e4'),SURF.metal);
  pane(mb,-.3,.08,.12,.47,.302,C('#6d7176'),SURF.metal);
  cube(mb,-.35,-.08,0,-.31,0,.25,IRON,SURF.metal);cube(mb,.31,-.08,0,.35,0,.25,IRON,SURF.metal);
}

export function flowerPots(mb,o){
  const {w}=o,n=Math.max(2,Math.round(w/.38));
  for(let k=0;k<n;k++){
    const x=-w/2+(k+.5)*w/n;
    mb.cylinder(x,0,.12,.1,.18,6,C('#b8623e'),SURF.trim,{r2:.13});
    mb.setTint(1);mb.dome(x,.16,.12,.17,.2,6,2,WHITE,SURF.foliage);mb.setTint(0);
    mb.dome(x+.06,.2,.15,.1,.18,5,2,C('#5f8f45'),SURF.foliage);
  }
}

export function wallLamp(mb){
  cube(mb,-.03,0,0,.03,.06,.45,IRON,SURF.metal);
  cube(mb,-.12,-.35,.3,.12,0,.55,IRON,SURF.metal);
  pane(mb,-.1,-.3,.1,-.04,.556,C('#ffe2a0'),SURF.emissive);
  mb.cylinder(0,0,.42,.16,.1,6,IRON,SURF.metal,{r2:.02});
}

// Buhardilla sobre faldón (origen en la línea de cornisa, Z hacia fuera, cubierta inclinada hacia -Z).
export function dormer(mb,o){
  const {w,h,pitch}=o,roof=C(o.roofColor??'#596270'),wall=TINT2;
  const back=-(h+.6)/Math.tan(pitch);
  cube(mb,-w/2,0,back,w/2,h,-.15,wall);
  pane(mb,-w/2+.18,.15,w/2-.18,h-.2,-.14,GLASS,SURF.glass);
  tinted(mb,()=>{cube(mb,-w/2+.12,.1,-.16,-w/2+.18,h-.15,-.1,WHITE,SURF.trim);cube(mb,w/2-.18,.1,-.16,w/2-.12,h-.15,-.1,WHITE,SURF.trim);
    cube(mb,-w/2+.12,h-.2,-.16,w/2-.12,h-.15,-.1,WHITE,SURF.trim);cube(mb,-.02,.1,-.16,.02,h-.15,-.11,WHITE,SURF.trim);});
  const ridge=h+.45;
  mb.quad([-w/2-.12,h,-.05],[0,ridge,-.05],[0,ridge,back],[-w/2-.12,h,back],roof,SURF.roof);
  mb.quad([0,ridge,-.05],[w/2+.12,h,-.05],[w/2+.12,h,back],[0,ridge,back],roof,SURF.roof);
  mb.tri([-w/2,h,-.15],[w/2,h,-.15],[0,ridge-.08,-.15],wall,SURF.wall,[0,0,1]);
}

export function chimney(mb,o){
  const {h=1.4,w=.6}=o,brick=C(o.color??'#b8735a');
  cube(mb,-w/2,0,-w/2,w/2,h,w/2,brick,SURF.wall);
  cube(mb,-w/2-.06,h,-w/2-.06,w/2+.06,h+.12,w/2+.06,C('#d9cfbf'));
  cube(mb,-.1,h+.12,-.1,.1,h+.4,.1,C('#8f8a85'),SURF.metal);
}

// Rosetón (origen en el centro).
export function rose(mb,o){
  const R=o.r,seg=20,stone=TINT2;
  for(let i=0;i<seg;i++){const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2;
    mb.tri([0,0,.03],[Math.cos(a0)*R,Math.sin(a0)*R,.03],[Math.cos(a1)*R,Math.sin(a1)*R,.03],GLASS_DARK,SURF.glass,[0,0,1]);}
  const ring=(rr,th,d)=>{for(let i=0;i<seg;i++){const a0=i/seg*Math.PI*2,a1=(i+1)/seg*Math.PI*2;
    const p=(a,x)=>[Math.cos(a)*x,Math.sin(a)*x];const A=p(a0,rr),B=p(a1,rr),Cc=p(a1,rr+th),D=p(a0,rr+th);
    mb.quad([A[0],A[1],d],[B[0],B[1],d],[Cc[0],Cc[1],d],[D[0],D[1],d],stone,SURF.trim,[0,0,1]);
    mb.quad([Cc[0],Cc[1],0],[Cc[0],Cc[1],d],[D[0],D[1],d],[D[0],D[1],0],stone,SURF.trim);}};
  ring(R,.28,.22);ring(R*.32,.12,.12);
  tinted(mb,()=>{for(let k=0;k<12;k++){const a=k/12*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
    const x0=c*R*.42,y0=s*R*.42,x1=c*R,y1=s*R,w=.05;
    mb.quad([x0-s*w,y0+c*w,.1],[x1-s*w,y1+c*w,.1],[x1+s*w,y1-c*w,.1],[x0+s*w,y0-c*w,.1].map(v=>v),WHITE,SURF.trim,[0,0,1]);
    mb.quad([x0+s*w,y0-c*w,.1],[x1+s*w,y1-c*w,.1],[x1-s*w,y1+c*w,.1],[x0-s*w,y0+c*w,.1],WHITE,SURF.trim,[0,0,1]);}});
}

export const BUILDERS={rose,window:window_,balcony,mirador,colonialBalcony,door,shopfront,awning,sign,bladeSign,acUnit,flowerPots,wallLamp,dormer,chimney};

export function registerBuilders(map){Object.assign(BUILDERS,map);}
export {cube,tinted,pane,archRing,archPane,GLASS,GLASS_DARK,IRON,WHITE,TINT2};

// Construye (una vez por clave) la geometría de un elemento.
const cache=new Map();
export function elementGeometry(type,params){
  const key=type+'|'+JSON.stringify(params);
  if(cache.has(key)){const g=cache.get(key);cache.delete(key);cache.set(key,g);return g;}
  const mb=new MeshBuilder();
  BUILDERS[type](mb,params);
  const g=mb.build();g.userData.key=key;
  cache.set(key,g);if(cache.size>256){const oldest=cache.keys().next().value;cache.get(oldest).dispose();cache.delete(oldest);}return g;
}
export function clearElementCache(){for(const g of cache.values())g.dispose();cache.clear();}
