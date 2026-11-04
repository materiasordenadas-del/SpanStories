import * as THREE from 'three';
import {chunkManifest,chunkModel,chunkSignature,worldPrepared,finalizeChunk,STREAM_LIMITS} from './chunks.js';
import {buildPlaceScene} from './place-scene.js';
import {MeshBuilder,SURF} from '../geom/mesh.js';
import {createGMaterial} from '../render/gmaterial.js';
import {geometryBytes,ResourcePool,disposeScene} from '../render/resources.js';

// Detalle generado bajo demanda. Conserva los datos semánticos; no es streaming de red ilimitado.
export class StreamScene{
  constructor(model,config,builder=buildPlaceScene){
    this.builder=builder;this.model=model;this.config=config;this.group=new THREE.Group();this.group.name='lugar-por-sectores';this.chunks=chunkManifest(model);this.loaded=new Map();this.errors=new Map();this.pool=new ResourcePool();this.revision=0;this.focus={x:0,z:0};this.pending=false;this.lastTick=0;this.disposed=false;this.rebuildPlan();
    this.lod={update:(camera,force)=>this.updateLOD(camera,force),full:()=>this.full()};
    this.built={group:this.group,buildings:{prepared:[]},ground:{asphalt:[]},street:{trees:[]},interiors:{floors:[]},infra:{walkSurfaces:[]},stats:{ms:0,buildings:0},lod:this.lod,streamer:this};
  }
  rebuildPlan(){
    if(this.plan){this.group.remove(this.plan);disposeScene(this.plan);}
    this.plan=new THREE.Group();this.plan.name='plano-sectores-sin-detalle';this.planChunks=new Map();
    const material=createGMaterial({sun:this.config.sun});material.uniforms.uMeshId.value=.08;
    for(const c of this.chunks){const mb=new MeshBuilder(),n=4,dx=(c.x1-c.x0)/n,dz=(c.z1-c.z0)/n,P=(x,z)=>[x,this.model.terrain.height(x,z)+.03,z];
      for(let z=0;z<n;z++)for(let x=0;x<n;x++){const a=c.x0+x*dx,b=c.z0+z*dz;mb.quad(P(a,b),P(a,b+dz),P(a+dx,b+dz),P(a+dx,b),new THREE.Color('#c1b9a7'),SURF.paving);}
      const mesh=new THREE.Mesh(mb.build(),material);mesh.name='plano:'+c.id;mesh.userData={kind:'stream-plan',chunkId:c.id};this.plan.add(mesh);this.planChunks.set(c.id,mesh);
    }
    this.group.add(this.plan);for(const id of this.loaded.keys())this.planChunks.get(id).visible=false;
  }
  async setModel(model,config){
    const old=this.model,libraryChanged=this.config.assetLibrary!==config.assetLibrary;this.model=model;this.config=config;this.revision++;
    if(libraryChanged)for(const id of [...this.loaded.keys()])this.unload(id);
    if(old.size.width!==model.size.width||old.size.depth!==model.size.depth||old.buildings.map(b=>b.id).join('|')!==model.buildings.map(b=>b.id).join('|')){for(const id of [...this.loaded.keys()])this.unload(id);this.chunks=chunkManifest(model);this.rebuildPlan();}
    if(old.terrain!==model.terrain)this.rebuildPlan();
    for(const [id,entry]of this.loaded)if(libraryChanged||entry.signature!==chunkSignature(model,entry.chunk,this.signatureSettings()))entry.dirty=true;
    this.errors.clear();await this.update(this.focus,true);return this.built;
  }
  signatureSettings(){return {seeds:this.config.seeds,options:this.config.options};}
  desired(focus){return this.chunks.map(c=>({c,d:Math.hypot(Math.max(c.x0-focus.x,0,focus.x-c.x1),Math.max(c.z0-focus.z,0,focus.z-c.z1))})).filter(e=>e.d<=STREAM_LIMITS.radius).sort((a,b)=>a.d-b.d||Math.hypot(a.c.cx-focus.x,a.c.cz-focus.z)-Math.hypot(b.c.cx-focus.x,b.c.cz-focus.z)).slice(0,STREAM_LIMITS.maxChunks).map(e=>e.c);}
  async update(focus,force=false){
    this.focus={x:focus.x,z:focus.z};if(this.disposed)return;if(this.pending){this.again=true;return this.pending;}
    const run=async()=>{do{this.again=false;const revision=this.revision,wanted=this.desired(this.focus),ids=new Set(wanted.map(c=>c.id));
      for(const [id,entry]of this.loaded)if(!ids.has(id)&&Math.hypot(entry.chunk.cx-this.focus.x,entry.chunk.cz-this.focus.z)>STREAM_LIMITS.radius+200)this.unload(id);
      for(const c of wanted){if(this.disposed||revision!==this.revision){this.again=true;break;}const previous=this.loaded.get(c.id);if(previous&&!previous.dirty)continue;if(this.errors.has(c.id)&&!force)continue;
        try{const local=chunkModel(this.model,c),built=await this.builder(local,{...this.config,onProgress:()=>{}});if(this.disposed||revision!==this.revision){disposeScene(built.group);continue;}
          finalizeChunk(built,local,c,this.model);const bytes=geometryBytes(built.group);
          while(this.loaded.size>=STREAM_LIMITS.maxChunks&&!previous){const victim=[...this.loaded].filter(([id])=>!ids.has(id)).sort((a,b)=>Math.hypot(b[1].chunk.cx-this.focus.x,b[1].chunk.cz-this.focus.z)-Math.hypot(a[1].chunk.cx-this.focus.x,a[1].chunk.cz-this.focus.z))[0];if(!victim)break;this.unload(victim[0]);}
          if(bytes+[...this.loaded.values()].reduce((s,e)=>s+e.bytes,0)-(previous?.bytes??0)>STREAM_LIMITS.maxBytes){disposeScene(built.group);throw Error('Presupuesto de geometría de 192 MiB alcanzado; reduce densidad');}
          this.pool.retain(built.group);if(previous)this.unload(c.id);this.group.add(built.group);this.planChunks.get(c.id).visible=false;this.loaded.set(c.id,{chunk:c,built,bytes,signature:chunkSignature(this.model,c,this.signatureSettings())});this.refresh();
        }catch(e){this.errors.set(c.id,e.message);this.refresh();}
      }
    }while(this.again&&!this.disposed);};
    this.pending=run();try{await this.pending;}finally{this.pending=false;this.refresh();}return this.built;
  }
  tick(focus){if(performance.now()-this.lastTick<300)return;this.lastTick=performance.now();if(Math.hypot(focus.x-this.focus.x,focus.z-this.focus.z)>20)this.update(focus);}
  unload(id){const entry=this.loaded.get(id);if(!entry)return;this.group.remove(entry.built.group);this.pool.release(entry.built.group);this.loaded.delete(id);const proxy=this.planChunks.get(id);if(proxy)proxy.visible=true;}
  refresh(){
    const entries=[...this.loaded.values()],prepared=entries.flatMap(e=>e.built.buildings.prepared.filter(p=>e.chunk.buildingIds.includes(p.b.id)).map(p=>worldPrepared(p,e.chunk,this.model))),sum=key=>entries.reduce((s,e)=>s+(e.built.stats[key]??0),0);
    this.built.warnings=[...new Set(entries.flatMap(e=>e.built.warnings??[]))];
    const commerce=entries.flatMap(e=>(e.built.commerce?.entries??[]).map(c=>({...c,position:[c.position[0]+e.chunk.cx,c.position[1],c.position[2]+e.chunk.cz]})));this.built.commerce={entries:commerce};
    this.built.buildings.prepared=prepared;this.built.ground.asphalt=entries.flatMap(e=>e.built.ground.asphalt.map(r=>r.map(p=>({X:p.X+Math.round(e.chunk.cx*100),Y:p.Y+Math.round(e.chunk.cz*100)}))));
    this.built.street.trees=entries.flatMap(e=>e.built.street.trees.map(t=>({...t,x:t.x+e.chunk.cx,z:t.z+e.chunk.cz})));
    this.built.interiors={floors:prepared.filter(p=>p.interiorPlan).map(p=>({rings:p.rings,y:p.interiorPlan.floor}))};
    this.built.infra.walkSurfaces=entries.flatMap(e=>e.built.infra.walkSurfaces.map(s=>({...s,points:s.points.map(p=>({...p,x:p.x+e.chunk.cx,z:p.z+e.chunk.cz}))})));
    this.built.stats={...this.built.stats,...Object.fromEntries(['ms','buildings','windows','shops','balconies','elements','elementTypes','trees','lamps','cars','barriers'].map(k=>[k,sum(k)])),stream:{loaded:entries.length,total:this.chunks.length,bytes:entries.reduce((s,e)=>s+e.bytes,0),errors:[...this.errors].map(([id,error])=>id+': '+error),maxBytes:STREAM_LIMITS.maxBytes,maxBuildings:STREAM_LIMITS.maxBuildings}};this.config.onChange?.(this.built);
  }
  updateLOD(camera,force=false){for(const e of this.loaded.values()){const p=camera.clone();p.x-=e.chunk.cx;p.z-=e.chunk.cz;e.built.lod.update(p,force);}}
  full(){for(const e of this.loaded.values())e.built.lod.full();}
  dispose(){this.disposed=true;this.revision++;for(const id of [...this.loaded.keys()])this.unload(id);this.group.remove(this.plan);disposeScene(this.plan);this.group.clear();}
}
