import * as T from '../engine/three.js';
import { pieza,cilindro } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';
export function crearPalma({alto=3.8}={}){
  const r=new T.Group();pieza(r,'maceta',new T.CylinderGeometry(.55,.43,.8,20),C.stone,[0,.4,0]);cilindro(r,'borde',.57,.07,C.gold,0,.77);cilindro(r,'tierra',.5,.04,C.darkWood,0,.79);
  pieza(r,'tronco',new T.CylinderGeometry(.045,.09,alto-.8,10),C.wood,[0,(alto+.8)/2,0]);
  for(let i=0;i<9;i++){const angle=i*Math.PI*2/9,positions=[],indices=[];
    for(let k=0;k<=12;k++){const t=k/12,reach=1.8*t,y=alto+.5*Math.sin(t*Math.PI)-.65*t*t,width=.17*Math.sin(t*Math.PI);
      for(const side of [-1,1])positions.push(Math.sin(angle)*reach+Math.cos(angle)*width*side,y,Math.cos(angle)*reach-Math.sin(angle)*width*side);
      if(k<12){const q=k*2;indices.push(q,q+1,q+2,q+1,q+3,q+2);}}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();
    const leaf=pieza(r,'fronda-'+i,g,i%2?C.green:C.leaf,[0,0,0],false);leaf.material.side=T.DoubleSide;
  }
  return r;
}
