// Planta del patio de llegada derivada de COURT y del frente MEDIDO del muro de entrada (zFace).
// La comparten HotelWorld y los tests: la regla vive en un solo sitio.
// Calzada en U de sentido único: ramal de ENTRADA en +x, frente bajo la marquesina hacia −x,
// ramal de SALIDA en −x. `d` desplaza el eje hacia fuera de la U (+) o hacia la isla (−).
import { COURT as K } from './dimensions.js';

export function planPatio(zFace){
  const front=zFace+K.arrivalWalk,zc=front+K.drive/2,islandFront=front+K.drive,zP=islandFront+K.island;
  const curbZ=zP+K.sidewalk,streetFar=curbZ+K.street;
  return {zFace,front,zc,islandFront,zP,curbZ,streetFar,farSidewalk:streetFar+K.farSidewalk,
    islandCenter:(islandFront+zP)/2,cornerX:K.legX-K.turnRadius,gates:{entrada:K.gateX,salida:-K.gateX}};
}

// Eje de la calzada desplazado `d`, desde el cerramiento (zP) en el ramal de entrada hasta el
// cerramiento en el ramal de salida. Puntos [x, z].
export function ejeCalzada(p,d=0,pasos=14,hasta=p.zP){
  const r=K.turnRadius+d,cx=p.cornerX,cz=p.zc+K.turnRadius,pts=[[K.gateX+d,hasta],[K.legX+d,cz]];
  for(let i=0;i<=pasos;i++){const a=-Math.PI/2*i/pasos;pts.push([cx+r*Math.cos(a),cz+r*Math.sin(a)]);}
  for(let i=0;i<=pasos;i++){const a=-Math.PI/2-Math.PI/2*i/pasos;pts.push([-cx+r*Math.cos(a),cz+r*Math.sin(a)]);}
  pts.push([-K.legX-d,cz],[-K.gateX-d,hasta]);return pts;
}
// Polígono de la calzada (borde exterior + borde interior invertido). `hasta` = dónde terminan
// los ramales: el cerramiento, o el bordillo de la calle si cruzan la acera pública.
export function poligonoCalzada(p,hasta=p.zP,ancho=K.drive){
  return [...ejeCalzada(p,ancho/2,14,hasta),...ejeCalzada(p,-ancho/2,14,hasta).reverse()];
}
// Isla: entre los bordes interiores de la U y el cerramiento; esquinas delanteras redondeadas.
export function contornoIsla(p,margen=0){
  const inner=ejeCalzada(p,-K.drive/2-margen,10,p.zP-margen);
  return inner;  // la U interior ya es cerrada por el cerramiento (último → primer punto)
}
// Puntos a lo largo de una polilínea cada `paso` m (para bolardos, farolas, pilares…).
export function aLoLargo(pts,paso,inicio=paso/2){
  const out=[];let acumulado=0,siguiente=inicio;
  for(let i=1;i<pts.length;i++){const [ax,az]=pts[i-1],[bx,bz]=pts[i],l=Math.hypot(bx-ax,bz-az);
    while(siguiente<=acumulado+l){const t=(siguiente-acumulado)/l;out.push({x:ax+(bx-ax)*t,z:az+(bz-az)*t,angulo:Math.atan2(bz-az,bx-ax)});siguiente+=paso;}
    acumulado+=l;}
  return out;
}
// Cerramiento sobre la línea zP: tramos de muro bajo con portones (calzada) y paso peatonal.
export function tramosCerramiento(){
  // Cuatro raíces existentes, ahora contiguas y sin huecos al otro lado de la calle.
  const e=K.perimeter.extent;
  return [[-e,-e/2],[-e/2,0],[0,e/2],[e/2,e]];
}

export function planAccesos(p){
  const zCurva=p.zc+K.turnRadius;
  const cortes=[[-K.gateX-K.drive/2,-K.gateX+K.drive/2],[K.gateX-K.drive/2,K.gateX+K.drive/2]];
  const acera=[],bordillo=[];let x=-160;
  for(const [a,b] of cortes){acera.push([[x,p.zP],[a,p.zP],[a,p.curbZ],[x,p.curbZ]]);bordillo.push([[x,p.curbZ+.15],[a,p.curbZ+.15]]);x=b;}
  acera.push([[x,p.zP],[160,p.zP],[160,p.curbZ],[x,p.curbZ]]);bordillo.push([[x,p.curbZ+.15],[160,p.curbZ+.15]]);
  const fondo=[[-160,-80],[160,-80],[160,p.curbZ]];
  for(const [a,b] of [...cortes].reverse())fondo.push([b,p.curbZ],[b,p.curbZ-K.access.ramp],[a,p.curbZ-K.access.ramp],[a,p.curbZ]);
  fondo.push([-160,p.curbZ]);
  return {wallZ:p.farSidewalk+Math.max(K.perimeter.thickness+.1,K.perimeter.pier+.1)/2+.02,acera,bordillo,cortes,fondo,
    rampStart:p.curbZ-K.access.ramp,rampEnd:p.curbZ,
    barreras:[['entrada',1],['salida',-1]].map(([id,s])=>({id,x:s*(K.gateX+(K.legX-K.gateX)*K.access.barrierInset/(p.zP-zCurva)),z:p.zP-K.access.barrierInset}))};
}
