import {buildArchitecture} from './architecture.js';
import {buildGeographicArchitecture} from './geographic-geometry.js';
export function buildingRepresentation(b,emit,box,gable,material,detail){
 if(!b.footprint)return buildArchitecture(b,emit,box,gable,material,detail);
 if(detail!==true)buildGeographicArchitecture(b,emit,box,material,false);
 if(detail!==false)buildGeographicArchitecture(b,emit,box,material,true);
}
