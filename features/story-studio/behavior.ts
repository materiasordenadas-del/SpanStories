export type BehaviorReference = {
  id: string; name: string; characterId: string; duration: number; url: string;
  review: { status: 'unreviewed' };
  /** Actuación propia de una historia reemplazada en su sitio («Modificación en historia», «Corrección general»):
   *  mismo archivo, revisión nueva. El motor la vuelve a leer al cambiar. */
  revision?: number;
};
/**
 * URL con la que se lee una referencia. Las actuaciones del Taller (5189) se reemplazan en su sitio y archivan sus
 * revisiones anteriores: `?revision=N` pide la que la historia guardó. Las importadas (sha) ya son inmutables.
 */
export function behaviorFetchUrl(ref: Pick<BehaviorReference, 'url' | 'revision'>): string {
  return ref.url.startsWith('http://127.0.0.1:5189/') && Number.isInteger(ref.revision) && (ref.revision as number) >= 0 ? `${ref.url}?revision=${ref.revision}` : ref.url;
}
export function isBehaviorReference(value: unknown): value is BehaviorReference {
  if(!value||typeof value!=='object')return false;
  const v=value as BehaviorReference;
  return typeof v.id==='string'&&/^[a-f0-9-]{36}$/.test(v.id)&&typeof v.name==='string'&&!!v.name.trim()&&v.name.length<=160&&typeof v.characterId==='string'&&!!v.characterId&&Number.isFinite(v.duration)&&v.duration>0&&v.duration<=600&&v.review?.status==='unreviewed'&&typeof v.url==='string'&&(v.url===`http://127.0.0.1:5189/ecosystem/assets/${v.id}.json`||new RegExp(`^http://(?:localhost|127\\.0\\.0\\.1):3000/api/studio-behaviors\\?id=${v.id}&sha=[a-f0-9]{64}$`).test(v.url));
}

export type BehaviorAsset={schema:'spanstories.behavior';version:1;id:string;name:string;characterId:string;duration:number;animation:{name?:string;duration:number;tracks:{name:string;type:string;times:number[];values:number[]}[]};recipe:Record<string,unknown>;review:{status:'unreviewed'}};
/** Validate imported baked motion independently from authoring recipes; never change its artistic status. */
export function validateBehaviorAsset(raw:unknown,reference?:BehaviorReference):asserts raw is BehaviorAsset{
  const d=raw as BehaviorAsset;
  if(!d||d.schema!=='spanstories.behavior'||d.version!==1||typeof d.id!=='string'||!/^[a-f0-9-]{36}$/.test(d.id)||typeof d.name!=='string'||!d.name.trim()||d.name.length>160||typeof d.characterId!=='string'||!d.characterId||!Number.isFinite(d.duration)||d.duration<=0||d.duration>600||!d.animation||!Number.isFinite(d.animation.duration)||Math.abs(d.animation.duration-d.duration)>.05||!Array.isArray(d.animation.tracks)||!d.animation.tracks.length||d.animation.tracks.length>2000||!d.recipe||typeof d.recipe!=='object'||d.review?.status!=='unreviewed')throw Error('Actuación importada incompatible.');
  const names=new Set<string>();let values=0;
  for(const track of d.animation.tracks){
    if(!track||typeof track.name!=='string'||track.name.length>500||!/^.+\.(quaternion|position|scale|morphTargetInfluences)$/.test(track.name)||names.has(track.name)||!['quaternion','vector','number'].includes(track.type)||!Array.isArray(track.times)||!track.times.length||track.times.length>18001||!Array.isArray(track.values)||track.values.length%track.times.length!==0||track.values.some(n=>!Number.isFinite(n))||track.times.some((n,i)=>!Number.isFinite(n)||n<0||n>d.duration+.05||(i>0&&n<=track.times[i-1])))throw Error('Curvas de actuación inválidas.');
    const stride=track.values.length/track.times.length;
    if(track.name.endsWith('.quaternion')&&track.type!=='quaternion'||/\.(position|scale)$/.test(track.name)&&track.type!=='vector'||track.name.endsWith('.morphTargetInfluences')&&track.type!=='number')throw Error('Tipo de curva incompatible con la propiedad animada.');
    if(!stride||stride>200||(track.type==='quaternion'&&stride!==4)||(track.type==='vector'&&stride!==3)||(values+=track.values.length)>4000000)throw Error('Tamaño de curvas de actuación inválido.');
    names.add(track.name);
  }
  if(reference&&(d.id!==reference.id||d.characterId!==reference.characterId||d.name!==reference.name||Math.abs(d.duration-reference.duration)>.05))throw Error('La actuación no coincide con la versión referenciada.');
}
