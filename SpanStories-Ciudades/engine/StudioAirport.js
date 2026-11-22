import {CityAssets} from './CityAssets.js';

export function studioAirportZone(base){return {id:'aeropuerto-entrada',label:'Aeropuerto · Entrada',countryId:'prototipos',cityId:'aeropuerto',countryLabel:'Escenarios',cityLabel:'Aeropuerto',manifestUrl:new URL('./Mundo/Aeropuerto/zona.json',base).href,lexiconUrl:null};}

// Hueco de las puertas de cristal de la fachada de la Entrada (AirportChunk.js, `openingWidth`).
const ENTRANCE_DOOR_WIDTH=6.4;
// Grosor de las paredes de las salas (AirportChunk.js, muros de 0,18 m).
const WALL_THICKNESS=.18;

// Reuse the original airport builder and its whole departure route (entrance, check-in,
// security, passports, shops, waiting room, boarding), each zone at its world position.
// As in the original airport (ZoneManager.js), the interior is only seen from inside:
// one room is active (the one with the camera, or the Entrance from outside), its route
// neighbours show their shell and the baked picture through the door (PortalPreview.js),
// and every other room is hidden. Walls and furniture collide.
export class StudioAirportAssets extends CityAssets{
  async prepare({record}){
    try{
      const source=new URL('../airport-source/engine/',import.meta.url).href;
      const [{createAirportChunk},{AssetRegistry},{DEPARTURE_ROUTE,DIMENSIONS}]=await Promise.all([
        import(source+'AirportChunk.js'),import(source+'AssetRegistry.js'),import(source+'routes.js'),
      ]);
      this.airportRegistry??=new AssetRegistry();
      const T=await import(source+'three.js');
      const signal=record.controller.signal;
      const root=new T.Group();root.name='aeropuerto';
      record.root=root;record.chunks=[];
      this.scene.add(root);
      for(const meta of DEPARTURE_ROUTE){
        const chunk=await createAirportChunk(meta,{scene:this.scene,renderer:this.renderer,camera:this.camera,registry:this.airportRegistry,signal});
        record.chunks.push({meta,chunk});
        root.add(chunk.root);
        await chunk.prepareHigh(signal);signal.throwIfAborted();
        chunk.setActive(false);
      }
      record.colliders=airportColliders(T,DIMENSIONS,record.chunks);record.ceiling=DIMENSIONS.ceiling;
      record.current=undefined;this.activate(record,record.chunks[0]);
      root.updateMatrixWorld(true);
      root.traverse(object=>{if(object.userData.ssId)this.objetos.registrar(object,{id:object.userData.ssId,tipo:object.userData.ssType||'objeto',etiqueta:object.name});});
      record.state='ready';record.transferBytes=0;this.onLoad(record);record.resolve(record);
    }catch(error){
      for(const {chunk} of record.chunks||[])chunk.dispose();
      record.chunks=null;record.colliders=null;record.root?.removeFromParent();record.root=null;
      record.state=error.name==='AbortError'?'cancelled':'error';record.error=error.message;record.retryAt=performance.now()+1000;this.errors.push({sector:record.sector.id,error:error.message});record.reject(error);this.status('No se pudo cargar el aeropuerto: '+error.message);
    }
  }
  // Paredes de todas las salas y muebles: el visor las lee en rebuildColliders (main.js).
  colliders(){const out=[];for(const record of this.records.values())if(record.state==='ready'&&record.colliders)out.push(...record.colliders);return out;}
  activate(record,current){
    if(current===record.current)return;
    record.current=current;
    const index=record.chunks.indexOf(current);
    record.chunks.forEach((entry,i)=>{
      const {chunk}=entry,near=Math.abs(i-index)<=1;
      if(entry!==current)chunk.setActive(false);
      if(near&&entry!==current)chunk.setViewer?.(current.meta.id);
      chunk.root.visible=near;
    });
    current.chunk.setActive(true);
  }
  update(dt){
    dt=Number.isFinite(dt)?Math.max(0,dt):0;
    for(const record of this.records.values()){
      if(record.state!=='ready'||!record.chunks)continue;
      const {x,y,z}=this.camera.position;
      const here=y>record.ceiling?null:record.chunks.find(({meta})=>Math.abs(x-meta.center[0])<=meta.width/2&&Math.abs(z-meta.center[1])<=meta.depth/2);
      // Fuera del edificio manda la Entrada: su fachada y la ilusión de calle (ExteriorIllusion.js).
      this.activate(record,here||record.chunks[0]);
      // Bajo techo (también en la entrada) no llueve ni caen pétalos: lo lee main.js para el clima.
      this.interior=!!here;
      // Una sala que falla no debe detener el bucle de render (three.js no lo reanuda): se avisa una vez.
      try{record.current.chunk.update(dt,this.camera,{lodScale:1});}
      catch(error){const id=record.current.meta.id;if(!(record.failedZones??=new Set()).has(id)){record.failedZones.add(id);console.error(error);this.status('Error al animar '+record.current.meta.label+' ('+id+'): '+error.message);}}
    }
  }
  detach(record){super.detach(record);for(const {chunk} of record.chunks||[])chunk.dispose();record.chunks=null;record.colliders=null;record.root?.removeFromParent();}
}

// Muros de cada sala con sus puertas abiertas (mismas reglas que AirportChunk.js) más los
// sólidos de sus muebles. La Entrada se abre a la calle por sus puertas de cristal.
// Los sólidos de una sala que caen dentro de otra (p. ej. el ala pintada de Facturación,
// que solo existe vista desde la calle) se descartan.
function airportColliders(T,DIMENSIONS,chunks){
  const h=DIMENSIONS.ceiling,door=DIMENSIONS.portalWidth,t=WALL_THICKNESS,out=[];
  const inside=(meta,px,pz)=>Math.abs(px-meta.center[0])<meta.width/2&&Math.abs(pz-meta.center[1])<meta.depth/2;
  const box=(x0,z0,x1,z1)=>out.push(new T.Box3(new T.Vector3(Math.min(x0,x1),0,Math.min(z0,z1)),new T.Vector3(Math.max(x0,x1),h,Math.max(z0,z1))));
  for(const {meta,chunk} of chunks){
    const [cx,cz]=meta.center,hw=meta.width/2,hd=meta.depth/2;
    const sides={north:[cz-hd,true],south:[cz+hd,true],west:[cx-hw,false],east:[cx+hw,false]};
    for(const [side,[line,horizontal]] of Object.entries(sides)){
      const half=horizontal?hw:hd,centre=horizontal?cx:cz;
      let gap=meta.openings?.[side],width=door;
      if(meta.id==='D00'&&side==='south'){gap=0;width=ENTRANCE_DOOR_WIDTH;}
      const pieces=gap===undefined?[[-half,half]]:[[-half,gap-width/2],[gap+width/2,half]];
      for(const [a,b] of pieces){
        if(b-a<=0)continue;
        if(horizontal)box(centre+a,line-t/2,centre+b,line+t/2);else box(line-t/2,centre+a,line+t/2,centre+b);
      }
    }
    for(const solid of chunk.colliders){
      const px=(solid.min.x+solid.max.x)/2,pz=(solid.min.z+solid.max.z)/2;
      if(chunks.some(other=>other.meta!==meta&&inside(other.meta,px,pz)))continue;
      out.push(solid.clone());
    }
  }
  return out;
}
