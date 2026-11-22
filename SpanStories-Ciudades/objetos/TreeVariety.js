import {TREE_VARIETY} from '../routes.js';

const hash=text=>{let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const distance=(a,b)=>(a.position[0]-b.position[0])**2+(a.position[2]-b.position[2])**2;

// Deterministic colouring of neighbouring pits, independent of array order.
export function assignTreeVariety(placements,config=TREE_VARIETY){
  const trees=placements.filter(p=>p.kind==='tree'),neighbors=new Map(trees.map(p=>[p.id,new Set()])),byId=new Map(trees.map(p=>[p.id,p]));
  for(const tree of trees){
    const sorted=trees.filter(p=>p!==tree).sort((a,b)=>distance(tree,a)-distance(tree,b)||a.id.localeCompare(b.id)),limit=distance(tree,sorted[Math.min(config.neighbors,sorted.length)-1]);
    const closest=sorted.filter(p=>distance(tree,p)<=limit+1e-6);
    for(const other of closest){neighbors.get(tree.id).add(other.id);neighbors.get(other.id).add(tree.id);}
  }
  const counts=new Map(config.models.map(id=>[id,0])),assigned=new Map();
  const order=[...trees].sort((a,b)=>neighbors.get(b.id).size-neighbors.get(a.id).size||hash(a.id)-hash(b.id)||a.id.localeCompare(b.id));
  for(const tree of order){
    const used=new Set([...neighbors.get(tree.id)].map(id=>assigned.get(id)));
    const choices=config.models.filter(id=>!used.has(id)).sort((a,b)=>counts.get(a)-counts.get(b)||hash(tree.id+a)-hash(tree.id+b));
    if(!choices.length)throw new Error('No se pudo intercalar el árbol '+tree.id);
    const variant=choices[0],seed=hash(tree.id);tree.variant=variant;assigned.set(tree.id,variant);counts.set(variant,counts.get(variant)+1);
    tree.height=Number((config.baseHeight+((seed%config.heightSteps)-(config.heightSteps-1)/2)*config.heightStep).toFixed(2));
    tree.crown=1+(((seed>>>8)%config.crownSteps)-(config.crownSteps-1)/2)*config.crownStep;
  }
  let repeated=0,edges=0;for(const [id,set]of neighbors)for(const other of set)if(id<other){edges++;if(byId.get(id).variant===byId.get(other).variant)repeated++;}
  return {models:Object.fromEntries(counts),neighborEdges:edges,repeatedNeighbors:repeated,heightMin:Math.min(...trees.map(p=>p.height)),heightMax:Math.max(...trees.map(p=>p.height))};
}
