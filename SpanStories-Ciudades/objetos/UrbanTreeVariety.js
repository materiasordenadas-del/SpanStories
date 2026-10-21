import {URBAN_TREES} from '../routes.js';
export const treeSeed=text=>{let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
export function treeVariation(placement){const seed=treeSeed(placement.id);return [(seed>>>12)%4/3,(seed>>>9)%2,1];}
export function assignUrbanTreeVariety(placements,config=URBAN_TREES){
  const trees=placements.filter(p=>p.kind==='tree'),neighbors=new Map(trees.map(p=>[p.id,new Set()]));
  const distance=(a,b)=>(a.position[0]-b.position[0])**2+(a.position[2]-b.position[2])**2;
  for(const p of trees){
    const others=trees.filter(q=>q!==p).sort((a,b)=>distance(p,a)-distance(p,b)||a.id.localeCompare(b.id));
    if(!others.length)continue;const limit=distance(p,others[Math.min(config.neighbors,others.length)-1]);
    for(const q of others)if(distance(p,q)<=limit+1e-6){neighbors.get(p.id).add(q.id);neighbors.get(q.id).add(p.id);}
  }
  const counts=new Map(config.models.map(m=>[m.id,0])),remaining=new Set(trees);
  // Incremental saturation avoids repeatedly allocating neighbour sets inside
  // an O(n log n) sort for every tree during startup.
  const colors=new Map(trees.map(p=>[p.id,new Set()])),seeds=new Map(trees.map(p=>[p.id,treeSeed(p.id)]));
  const priority=(a,b)=>colors.get(b.id).size-colors.get(a.id).size||neighbors.get(b.id).size-neighbors.get(a.id).size||seeds.get(a.id)-seeds.get(b.id);
  while(remaining.size){
    let p;for(const candidate of remaining)if(!p||priority(candidate,p)<0)p=candidate;
    const taken=colors.get(p.id),choices=config.models.filter(m=>!taken.has(m.id)).sort((a,b)=>counts.get(a.id)/a.weight-counts.get(b.id)/b.weight||treeSeed(p.id+a.id)-treeSeed(p.id+b.id));
    if(!choices.length)throw new Error('No se pudo intercalar '+p.id);
    p.variant=choices[0].id;counts.set(p.variant,counts.get(p.variant)+1);remaining.delete(p);
    for(const id of neighbors.get(p.id))colors.get(id).add(p.variant);
    const seed=treeSeed(p.id);p.height=config.heights[seed%config.heights.length];p.crown=config.crowns[(seed>>>5)%config.crowns.length];p.treeVariation=treeVariation(p);
  }
  return {models:Object.fromEntries(counts),heightMin:Math.min(...trees.map(p=>p.height)),heightMax:Math.max(...trees.map(p=>p.height))};
}
