import * as T from '../engine/three.js';
import { caja,cilindro } from './Piezas.js';
import { DIMENSIONS as D,COLORS as C } from '../engine/dimensions.js';
export function crearEscalera() {
  const r=new T.Group(),count=Math.round(D.floorHeight/D.stairRise);
  for(let i=0;i<count;i++) {caja(r,'peldaño-'+i,D.stairWidth,D.stairRise*(i+1),D.stairRun,C.stone,0,D.stairRise*(i+1)/2,-i*D.stairRun);
    for(const x of [-1,1]) {const post=cilindro(r,'baranda-'+i+'-'+x,.022,.95,C.gold,x*(D.stairWidth/2+.05),D.stairRise*(i+1)+.475,-i*D.stairRun);post.name='baranda-'+i+'-'+x;}}
  for(const x of [-1,1]) {const rail=caja(r,'pasamanos-'+x,.05,.05,Math.hypot((count-1)*D.stairRun,(count-1)*D.stairRise),C.wood,x*(D.stairWidth/2+.05),D.stairRise*(count+1)/2+.95,-(count-1)*D.stairRun/2);rail.rotation.x=Math.atan2(D.stairRise,D.stairRun);}
  return r;
}
