import * as THREE from 'three';
// Recorta triángulos con interpolación de atributos; IDs/superficies son constantes por triángulo.
export function cropGeometry(geometry,box,{omitBoundaryWalls=false}={}){
  const attrs=Object.entries(geometry.attributes),out=Object.fromEntries(attrs.map(([key])=>[key,[]])),P=geometry.attributes.position;
  for(let t=0;t<P.count;t+=3){let poly=[0,1,2].map(k=>Object.fromEntries(attrs.map(([key,a])=>[key,Array.from({length:a.itemSize},(_,j)=>a.array[(t+k)*a.itemSize+j])])));
    for(const [axis,value,sign]of [[0,box[0],1],[0,box[2],-1],[2,box[1],1],[2,box[3],-1]]){
      const next=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a.position[axis]-value)*sign,db=(b.position[axis]-value)*sign;if(da>=-1e-6)next.push(a);if((da>=0)!==(db>=0)){const u=da/(da-db);next.push(Object.fromEntries(attrs.map(([key])=>[key,a[key].map((v,j)=>v+(b[key][j]-v)*u)])));}}poly=next;if(!poly.length)break;
    }
    for(let i=1;i<poly.length-1;i++){
      const tri=[poly[0],poly[i],poly[i+1]],a=tri[0].position,b=tri[1].position,c=tri[2].position,u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],area=Math.hypot(...normal);
      if(area<1e-10)continue;
      if(omitBoundaryWalls&&Math.abs(normal[1])/area<.2&&[[0,box[0]],[0,box[2]],[2,box[1]],[2,box[3]]].some(([axis,edge])=>tri.every(p=>Math.abs(p.position[axis]-edge)<1e-4)))continue;
      for(const point of tri)for(const [key]of attrs)out[key].push(...point[key]);
    }
  }
  const g=new THREE.BufferGeometry();for(const [key,a]of attrs)g.setAttribute(key,new THREE.Float32BufferAttribute(out[key],a.itemSize));g.computeBoundingSphere();return g;
}
