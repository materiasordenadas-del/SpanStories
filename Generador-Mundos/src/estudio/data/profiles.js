// Perfiles opcionales por identidad; nunca cambian la fuente ni el urbanismo.
import {styleFromArchitecture} from '../arq/styles.js';
const LIMITS={bayWidth:[1.2,12],windowWidth:[.4,5],windowHeight:[.5,5],doorWidth:[.6,5],doorHeight:[1.8,6],balconyProbability:[0,1]};
export function validateProfile(profile={}){
  if(!profile||typeof profile!=='object'||Array.isArray(profile))throw Error('Perfil de edificio no válido');
  const result={facade:{},reference:String(profile.reference??'').slice(0,1500),modelId:profile.modelId||null,yaw:Number(profile.yaw??0),scale:Number(profile.scale??1),fromSource:profile.fromSource===true};
  if(result.modelId&&(typeof result.modelId!=='string'||result.modelId.length>100))throw Error('Identidad de modelo no válida');
  if(!Number.isFinite(result.yaw)||Math.abs(result.yaw)>360||!Number.isFinite(result.scale)||result.scale<=0||result.scale>1)throw Error('Ajuste del modelo no válido');
  for(const [key,value]of Object.entries(profile.facade??{})){
    const limits=LIMITS[key];if(!limits||!Number.isFinite(value)||value<limits[0]||value>limits[1])throw Error('Parámetro de fachada no válido: '+key);
    result.facade[key]=value;
  }
  if(result.facade.bayWidth&&result.facade.windowWidth&&result.facade.windowWidth+.2>result.facade.bayWidth)throw Error('La separación debe dejar espacio entre ventanas');
  return result;
}
export function withProfiles(model,profiles={}){
  return {...model,buildings:model.buildings.map(b=>{
    if(!Object.hasOwn(profiles,b.id))return b;
    const p=validateProfile(profiles[b.id]),style=p.fromSource?styleFromArchitecture(b.tags):null;
    return {...b,facadeProfile:p.facade,reference:p.reference,modelId:p.modelId,modelYaw:p.yaw,modelScale:p.scale,...(style?{forceStyle:style,styleSource:'perfil:fuente:arquitectura'}:{})};
  })};
}
