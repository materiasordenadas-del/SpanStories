import * as T from './three.js';

const axis=(point,index)=>point?.[['x','y','z'][index]]??point?.[index];

// Conservative XZ broad phase: every potentially intersecting wall is retained.
// Large objects stay in a global list, avoiding unbounded grid expansion.
export class CityCollisionIndex {
  constructor(obstacles=[],{cellSize=16,maxCells=64}={}){
    this.cellSize=cellSize;this.cells=new Map();this.global=[];this.stamp=0;
    for(const source of obstacles){
      const bounds=source.bounds||source.box||source;if(!bounds.min||!bounds.max)continue;
      const box=bounds.isBox3?bounds:new T.Box3(new T.Vector3(axis(bounds.min,0),axis(bounds.min,1),axis(bounds.min,2)),new T.Vector3(axis(bounds.max,0),axis(bounds.max,1),axis(bounds.max,2)));
      const entry={id:source.id,bounds:box,source,stamp:0};
      const x0=Math.floor(box.min.x/cellSize),x1=Math.floor(box.max.x/cellSize),z0=Math.floor(box.min.z/cellSize),z1=Math.floor(box.max.z/cellSize);
      if(![x0,x1,z0,z1].every(Number.isFinite)||(x1-x0+1)*(z1-z0+1)>maxCells){this.global.push(entry);continue;}
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
        const key=x+','+z;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(entry);
      }
    }
  }
  query(position,radius=.32,result=[]){
    result.length=0;const stamp=++this.stamp,size=this.cellSize;
    const append=entry=>{if(entry.stamp===stamp)return;entry.stamp=stamp;if(entry.source.enabled===false||entry.source.visible===false)return;result.push(entry);};
    for(const entry of this.global)append(entry);
    for(let x=Math.floor((position.x-radius)/size);x<=Math.floor((position.x+radius)/size);x++)
      for(let z=Math.floor((position.z-radius)/size);z<=Math.floor((position.z+radius)/size);z++)
        for(const entry of this.cells.get(x+','+z)||[])append(entry);
    return result;
  }
}
