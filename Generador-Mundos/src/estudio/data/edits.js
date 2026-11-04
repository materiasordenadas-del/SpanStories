// Overlays por ID: la fuente geográfica y las otras entidades no se modifican.
import {appearancePolicy} from './appearance-policy.js';

export const EDIT_FIELDS=['height','levels','baseOffset','colour','material','roofShape','roofColour','roofMaterial','forceStyle'];
export function validateEdit(patch){
  if(!patch||typeof patch!=='object'||Array.isArray(patch))throw Error('Edición no válida');
  const out={};
  for(const [key,value]of Object.entries(patch)){
    if(!EDIT_FIELDS.includes(key))throw Error(`Campo no editable: ${key}`);
    if(value==null)continue;
    if(key==='baseOffset'){if(!Number.isFinite(value)||value< -3||value>10)throw Error('Ajuste de apoyo no válido');}
    else if(['height','levels'].includes(key)){
      if(!Number.isFinite(value)||value<(key==='height'?2.6:1)||value>(key==='height'?3000:200)||key==='levels'&&!Number.isInteger(value))throw Error(`Valor no válido: ${key}`);
    }else if(typeof value!=='string'||value.length>120)throw Error(`Texto no válido: ${key}`);
    out[key]=value;
  }
  return out;
}
export function applyEdits(model,overrides={},source='manual'){
  if(!model)return null;
  const buildings=model.buildings.map(b=>{
    if(!Object.hasOwn(overrides,b.id))return b;
    const edit=validateEdit(overrides[b.id]),out={...b,roof:{...b.roof},modifiedFields:[...new Set([...(b.modifiedFields??[]),...Object.keys(edit)])],fieldSources:{...b.fieldSources}};
    for(const key of Object.keys(edit))out.fieldSources[key]=source;
    for(const key of ['colour','material','forceStyle'])if(edit[key]!=null)out[key]=edit[key];
    if(edit.baseOffset!=null)out.baseOffset=edit.baseOffset;
    if(edit.levels!=null){out.levels=edit.levels;out.height=edit.height??edit.levels*3.2;}
    if(edit.height!=null){out.height=edit.height;if(edit.levels==null)out.levels=Math.max(1,Math.round(edit.height/3.2));}
    if(edit.height!=null||edit.levels!=null){out.heightSource=source;out.estimated=false;out.knownHeight=out.height;out.knownLevels=out.levels;}
    if(edit.roofShape!=null){out.roof.shape=edit.roofShape;out.roof.shapeSource=source+':roof:shape';}
    if(edit.roofColour!=null)out.roof.colour=edit.roofColour;
    if(edit.roofMaterial!=null)out.roof.material=edit.roofMaterial;
    out.appearance=appearancePolicy(out);
    return out;
  });
  return {...model,buildings};
}
export class EditHistory{
  constructor(){this.entries=[];}
  checkpoint(overrides){this.entries.push(structuredClone(overrides));if(this.entries.length>30)this.entries.shift();}
  undo(){return this.entries.pop()??null;}
  clear(){this.entries.length=0;}
}
