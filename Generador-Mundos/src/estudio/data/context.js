// Contexto urbano del lugar, deducido solo de la fuente: región, centro histórico, cobertura de datos.
// Decide valores por defecto (plantas, relleno, estilos) donde OSM calla; nunca sustituye un dato registrado.
import {regionOf} from '../arq/styles.js';

const CIVIC=/^(plaza|plazuela|parque central|zócalo|zocalo|plaza de armas|plaza mayor)/i;
const median=list=>{if(!list.length)return null;const s=list.slice().sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};

export function urbanContext(model){
  const region=regionOf(model.bounds);
  const source=model.buildings.filter(b=>!b.inferred);
  const known=source.filter(b=>b.knownHeight&&b.use!=='religious'&&!b.isPart);
  const knownLevels=median(known.map(b=>b.knownHeight/3.2));
  const religious=source.filter(b=>b.use==='religious').length;
  const old=b=>Number.parseInt(b.tags?.start_date)<1900;
  const historic=source.filter(b=>b.tags?.historic||b.tags?.heritage||old(b)).length+(model.landmarks??[]).filter(l=>l.tags?.historic||l.tags?.heritage).length;
  const civic=(model.areas??[]).some(a=>['plaza','park'].includes(a.kind)&&CIVIC.test(a.name||''))||(model.roads??[]).some(r=>r.type!=='vehicle'&&CIVIC.test(r.name||''));
  const portals=new Set((model.roads??[]).filter(r=>/^portal(es)? /i.test(r.name||'')).map(r=>r.name)).size;
  const identities=(model.landmarks??[]).length;
  const lowRise=knownLevels==null||knownLevels<=3.5;
  // Puntuación sencilla: patrimonio etiquetado, templos, plaza cívica, soportales y monumentos con identidad.
  const score=historic+religious*2+(civic?2:0)+Math.min(3,portals)+Math.min(4,Math.floor(identities/4));
  const historicCore=lowRise&&score>=5;
  const profile=region==='latam'?(historicCore?'historico-latam':'latam'):historicCore&&['espana','andalucia','canarias'].includes(region)?'historico':'general';
  return {version:1,region,profile,signals:{buildings:source.length,known:known.length,knownLevels:knownLevels&&Math.round(knownLevels*10)/10,religious,historic,civic,portals,identities,score}};
}

export const PROFILE_NAMES={'historico-latam':'Centro histórico latinoamericano',latam:'Ciudad latinoamericana',historico:'Casco histórico',general:'General'};

// Plantas por defecto cuando no hay vecinos con altura conocida. null = regla general previa.
export function contextLevels(profile,b,r){
  if(profile==='historico-latam'){
    if(b.area<90)return r()<.72?1:2;
    if(b.area<700)return r()<.5?1:r()<.92?2:3;
    return r()<.2?1:r()<.82?2:3;
  }
  if(profile==='latam'){
    if(b.area<90)return r()<.55?1:2;
    if(b.area<400){const x=r();return x<.25?1:x<.7?2:x<.9?3:4;}
    const x=r();return x<.3?2:x<.6?3:x<.85?4:6;
  }
  return null;
}
