import type { PracticeTarget } from '../domain/target.ts';

/** Etiqueta publicada para objetivos guardados fuera del lector, sin inventar ocurrencias. */
export function publishedPracticeLabel(target:PracticeTarget,senses:readonly {id:string;lexemeId:string;item:string}[]):string|null{
  if(target.type==='UNRESOLVED_SURFACE')return target.surface;
  const sense=senses.find(s=>s.lexemeId===target.lexemeId&&(target.type!=='SENSE'||s.id===target.senseId));
  return sense?.item??null;
}
