// Verified topology of anime_tree_2: 44 isolated leaf cards; the remaining
// connected components are the authored trunk/branches. All indices are kept.
export function splitAtlasTree(part){
  const g=part.geometry,p=g.attributes.position,parent=Array.from({length:p.count},(_,i)=>i),points=new Map();
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const union=(a,b)=>parent[find(a)]=find(b);
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(',');
    if(points.has(key))union(i,points.get(key));else points.set(key,i);
  }
  const index=g.index.array;for(let i=0;i<index.length;i+=3){union(index[i],index[i+1]);union(index[i],index[i+2]);}
  const components=new Map();for(let i=0;i<index.length;i+=3){const key=find(index[i]);if(!components.has(key))components.set(key,[]);components.get(key).push(index[i],index[i+1],index[i+2]);}
  const bark=[],leaves=[];
  for(const indices of components.values()){
    if(![6,240,288].includes(indices.length))throw new Error('Topología de atlas inesperada');
    (indices.length===6?leaves:bark).push(...indices);
  }
  if(!bark.length||!leaves.length)throw new Error('Atlas sin tronco u hojas');
  return [{part:'bark',indices:bark},{part:'leaves',indices:leaves}].map(({part:role,indices})=>{
    const geometry=g.clone();geometry.setIndex(indices);geometry.computeBoundingBox();geometry.computeBoundingSphere();
    return {geometry,material:part.material.clone(),name:part.name+'-'+role,part:role};
  });
}
