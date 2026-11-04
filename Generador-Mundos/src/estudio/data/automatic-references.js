// Coincidencia exacta por la identidad Wikidata de OSM; nunca por similitud de nombres.
import {appearancePolicy} from './appearance-policy.js';
export const validQ=id=>typeof id==='string'&&/^Q[1-9]\d{0,11}$/.test(id);
const safeURL=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}};
const commons=file=>typeof file==='string'&&file.length<500?'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(file.replaceAll(' ','_')):null;
const value=claim=>claim?.mainsnak?.snaktype==='value'?claim.mainsnak.datavalue?.value:null;
function best(claims=[]){const live=claims.filter(c=>c.rank!=='deprecated');return live.some(c=>c.rank==='preferred')?live.filter(c=>c.rank==='preferred'):live;}
function citations(claim){return [...new Set((claim.references??[]).flatMap(r=>[
  ...(r.snaks?.P854??[]).map(s=>safeURL(s.datavalue?.value)),
  ...(r.snaks?.P248??[]).map(s=>s.datavalue?.value?.id).filter(validQ).map(id=>'https://www.wikidata.org/wiki/'+id),
]).filter(Boolean))];}
export function referenceFromEntity(entity,retrievedAt=new Date().toISOString()){
  if(!validQ(entity?.id))throw Error('Identidad Wikidata no válida');
  const claims=entity.claims??{},heights=best(claims.P2048).flatMap(c=>{
    const v=value(c),n=Number(v?.amount),sources=citations(c);
    if(v?.unit!=='http://www.wikidata.org/entity/Q11573'||!Number.isFinite(n)||n<2.6||n>3000||Object.keys(c.qualifiers??{}).length||!sources.length)return [];
    return [{metres:n,sources,statement:String(c.id??''),lower:v.lowerBound==null?null:Number(v.lowerBound),upper:v.upperBound==null?null:Number(v.upperBound)}];
  });
  const unique=[...new Set(heights.map(h=>h.metres))];
  const height=unique.length===1?heights[0]:null;
  const media=prop=>best(claims[prop]).map(value).map(commons).filter(Boolean).slice(0,3);
  return {id:entity.id,label:entity.labels?.es?.value??entity.labels?.en?.value??entity.id,url:'https://www.wikidata.org/wiki/'+entity.id,
    revision:Number(entity.lastrevid)||null,retrievedAt,license:'CC0 (datos Wikidata; los medios tienen licencia propia)',
    height,heightStatus:height?'documentada':unique.length>1?'conflictiva':'sin altura inequívoca con referencia',images:media('P18'),models:media('P4896')};
}
export function validateReferences(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>100)throw Error('Referencias automáticas no válidas');
  const out={};
  for(const [id,r]of Object.entries(input)){
    if(!validQ(id)||r?.id!==id||r.url!=='https://www.wikidata.org/wiki/'+id||typeof r.label!=='string'||r.label.length>1000||typeof r.retrievedAt!=='string'||!Number.isFinite(Date.parse(r.retrievedAt))||typeof r.heightStatus!=='string'||r.heightStatus.length>200)throw Error('Referencia automática no válida');
    if(r.height&&(!Number.isFinite(r.height.metres)||r.height.metres<2.6||r.height.metres>3000||!Array.isArray(r.height.sources)||!r.height.sources.length||!r.height.sources.every(s=>safeURL(s))))throw Error('Altura automática no válida');
    for(const key of ['images','models'])if(!Array.isArray(r[key])||r[key].length>3||!r[key].every(u=>typeof u==='string'&&u.startsWith('https://commons.wikimedia.org/wiki/File:')))throw Error('Medio de referencia no válido');
    out[id]=r;
  }
  return out;
}
export function referenceIds(model){return [...new Set([...(model.buildings??[]),...(model.points??[]),...(model.landmarks??[])].map(b=>b.tags?.wikidata).filter(validQ))].sort().slice(0,100);}
export async function fetchAutomaticReferences(model,{fetcher=fetch}={}){
  const ids=referenceIds(model);if(!ids.length)return {references:{},warnings:[]};
  const response=await fetcher('/api/estudio/referencias',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
  const data=await response.json();if(!response.ok)throw Error(data.error??'Referencias no disponibles');
  return {references:validateReferences(data.references),warnings:data.warnings??[]};
}
export function withAutomaticReferences(model,references={}){
  const refs=validateReferences(references),counts=new Map();for(const b of model.buildings){const q=b.tags?.wikidata;if(q)counts.set(q,(counts.get(q)??0)+1);}
  const buildings=model.buildings.map(b=>{
    const ref=refs[b.tags?.wikidata];if(!ref)return b;
    let out={...b,autoReference:ref};
    // Un Q repetido puede describir todo un conjunto. No aplicar la altura del conjunto a sus partes.
    if(ref.height&&b.heightSource!=='osm:height'&&!b.isPart&&!b.minHeight&&counts.get(ref.id)===1&&!b.origin?.startsWith('local')){
      out={...out,knownHeight:ref.height.metres,height:ref.height.metres,levels:b.knownLevels??Math.max(1,Math.round(ref.height.metres/3.2)),estimated:false,heightSource:'wikidata:P2048'};
    }
    out.appearance=appearancePolicy(out);return out;
  });
  const enrich=p=>refs[p.tags?.wikidata]?{...p,autoReference:refs[p.tags.wikidata]}:p;
  return {...model,buildings,points:(model.points??[]).map(enrich),landmarks:(model.landmarks??[]).map(enrich)};
}
export function heightDescription(b){
  const s=b.heightSource??'estimado';
  if(s==='osm:height')return 'Altura registrada en OSM; no medida por Atlas';
  if(s==='osm:levels')return 'Altura derivada del número de plantas';
  if(s==='wikidata:P2048')return 'Altura documentada en Wikidata; consulta su referencia';
  if(s.startsWith('manual')||s.startsWith('local'))return 'Altura corregida · '+s;
  return 'Altura estimada; no es una medida';
}
