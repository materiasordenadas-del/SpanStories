import {generateWorld} from './core/world.js';
import {reconstructGeographicWorld} from './geo/reconstruct.js';
let world=null;
self.onmessage=({data})=>{try{if(data.type==='load'){world=data.world;return;}if(data.type==='geographic')world=reconstructGeographicWorld(data.source,data.config,world,data.options);else world=generateWorld(data.config,world,data.stage);self.postMessage({id:data.id,stage:data.stage,world});}catch(error){self.postMessage({id:data.id,error:error.message});}};
