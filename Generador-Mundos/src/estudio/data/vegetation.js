// Especie de cada árbol: la registrada en OSM (species/genus/leaf_type) si es representable; si no,
// la del clima del lugar según su contexto (calle, parque, bosque, matorral, cementerio, humedal, paseo).
import {climateOf,speciesWeights,recordedSpecies} from './climate.js';
import {rng,weighted} from './rng.js';

const segDist=(x,z,a,b)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);};

export function assignSpecies(trees,model,{seed=model.seed}={}){
  const climate=climateOf(model),lat=model.bounds?.centerLat??40;
  // Paseo marítimo: a menos de 60 m del mar (bordes del mar que no son el límite del cuadrado).
  const W=model.size?.width??0,D=model.size?.depth??0,edges=[];
  for(const a of (model.areas??[]).filter(a=>a.sea))for(const ring of a.rings)for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];
    const onBorder=[[0,W/2],[0,-W/2],[1,D/2],[1,-D/2]].some(([k,v])=>Math.abs(p[k]-v)<.05&&Math.abs(q[k]-v)<.05);if(!onBorder)edges.push([p,q]);}
  const nearSea=(x,z)=>edges.some(([p,q])=>segDist(x,z,p,q)<60);
  const southSpain=climate.variant==='mediterraneo:iberico'&&lat<39.8;
  const counts={};
  for(const t of trees){
    if(!t.species){
      const recorded=t.tags?recordedSpecies(t.tags):null;
      if(recorded){t.species=recorded;t.speciesSource='osm';}
      else{
        let ctx=t.ctx??(t.pit?'calle':'parque');
        if(['calle','parque'].includes(ctx)&&edges.length&&nearSea(t.x,t.z))ctx='paseo';
        let w=speciesWeights(climate,ctx);
        // Naranjos y palmeras de alineación en el sur y el levante peninsular.
        if(southSpain&&ctx==='calle')w={frondoso:.6,naranjo:.25,palmera:.09,sakura:.06};
        const r=rng(seed+':especie:'+Math.round(t.x*10)+':'+Math.round(t.z*10));
        t.species=weighted(r,Object.entries(w));t.ctx=ctx;t.speciesSource='clima';
      }
    }
    counts[t.species]=(counts[t.species]??0)+1;
  }
  return {climate,counts};
}
