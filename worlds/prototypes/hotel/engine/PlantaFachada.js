// Muro recto de entrada en planta baja, derivado de FACADE: pilares de piedra y los vanos
// que quedan entre ellos (vidrio, puerta giratoria de ENTRADA o puerta de SALIDA).
import { FACADE as F } from './dimensions.js';

export function pilaresEntrada(){
  const W=F.entrance.width/2,p=F.entrance.pier,r=F.revolving.radius,e=F.exit;
  const inner=r+.25+p/2,exitL=e.x-e.width/2-p/2,exitR=e.x+e.width/2+p/2;
  return [-(W-p/2),-exitR,-exitL,-inner,inner,exitL,exitR,W-p/2];
}
export function tramosEntrada(){
  const xs=pilaresEntrada(),p=F.entrance.pier,out=[];
  for(let i=0;i<xs.length-1;i++){const min=xs[i]+p/2,max=xs[i+1]-p/2;
    out.push({min,max,contenido:min<0&&max>0?'giratoria':min<F.exit.x&&max>F.exit.x?'salida':'vidrio'});}
  return out;
}
// Altura del dintel y de la marquesina a partir de la altura libre medida bajo el vuelo.
export const marquesinaBajo=libre=>libre-F.canopy.gap-F.canopy.thickness;
