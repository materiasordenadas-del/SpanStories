// Biblioteca local compartida. Solo se publica un paquete íntegro y completo.
import {readFile,writeFile,mkdir,rename,open,unlink,realpath} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {decodeProject} from '../src/estudio/data/project.js';
import {Terrain} from '../src/estudio/data/terrain.js';

export const VIEWER_ROOT='D:/Español/SpanStories-worktrees/visor-mundo-20261021';
const digest=b=>createHash('sha256').update(b).digest('hex');
const token=v=>{if(typeof v!=='string'||! /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(v))throw Error('Identificador no válido');return v;};
const filename=v=>{if(typeof v!=='string'||! /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(v))throw Error('Archivo de paquete no válido');return v;};
async function json(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}}
async function atomic(path,value){const temp=path+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2),{flag:'wx'});await rename(temp,path);}
const inside=(root,path)=>{const r=relative(root,path);if(r.startsWith('..')||isAbsolute(r))throw Error('Ruta fuera de la biblioteca');return path;};

export class VisorLibrary{
  constructor({generatorRoot,viewerRoot=VIEWER_ROOT}={}){
    this.exports=resolve(generatorRoot,'exportaciones');
    this.root=resolve(viewerRoot,'SpanStories-Ciudades','Mundo','Generados');
  }
  async catalog(){return json(join(this.root,'catalogo.json'),{format:'spanstories-lugares',version:1,places:[]});}
  async locked(work){
    await mkdir(this.root,{recursive:true});const path=join(this.root,'.escritura.lock');let lock;
    try{lock=await open(path,'wx');}catch(e){if(e.code==='EEXIST')throw Error('Otra operación está guardando lugares. Vuelve a intentarlo.');throw e;}
    try{return await work();}finally{await lock.close();await unlink(path);}
  }
  async place(id){const p=(await this.catalog()).places.find(p=>p.id===token(id));if(!p)throw Error('Lugar desconocido');return p;}
  async project(id,{draft=true,version=null}={}){
    const p=await this.place(id),pointer=draft?await json(join(this.root,p.id,'borrador.json'),null):null;
    if(version&&!p.history.some(h=>h.revision===version))throw Error('Versión desconocida');
    const revision=!version&&pointer?.baseRevision===p.revision?pointer:null;
    const file=revision?join(this.root,p.id,'borradores',filename(revision.file)):join(this.root,p.id,'revisiones',token(version??p.revision),'proyecto.json');
    const text=await readFile(file,'utf8');decodeProject(text);
    const data=JSON.parse(text);data.visorLink={id:p.id,revision:p.revision};
    return {place:p,project:data,sha256:digest(text),draft:!!revision,version:version??p.revision};
  }
  async publish({carpeta,id=null,expectedRevision=null,label=null}){
    return this.locked(async()=>{
      const source=inside(await realpath(this.exports),await realpath(join(this.exports,token(carpeta))));
      const manifestBytes=await readFile(join(source,'manifest.json')),m=JSON.parse(manifestBytes);
      if(m.format!=='atlas-estudio-paquete'||m.version!==2||!m.complete||!Array.isArray(m.files)||!m.files.length||m.files.length>20000)throw Error('Paquete incompleto o incompatible');
      const paths=new Set(),buffers=new Map();let bytes=0;
      for(const f of m.files){
        filename(f.path);if(paths.has(f.path)||f.path==='manifest.json')throw Error('Archivo duplicado');paths.add(f.path);
        const path=inside(source,await realpath(join(source,f.path))),b=await readFile(path);bytes+=b.length;
        if(bytes>4*1024**3)throw Error('Paquete mayor de 4 GB');
        if(b.length!==f.bytes||digest(b)!==f.sha256)throw Error('Integridad incorrecta: '+f.path);buffers.set(f.path,b);
      }
      for(const name of [m.sectors,m.entities,m.project,'lugar.json'])if(!buffers.has(name))throw Error('Falta archivo obligatorio: '+name);
      const projectText=buffers.get(m.project).toString(),project=decodeProject(projectText);
      const lugar=JSON.parse(buffers.get('lugar.json')),relieve=lugar.relieve;
      if(!relieve||!Array.isArray(relieve.alturas)||!Number.isInteger(relieve.resolucion)||relieve.resolucion<2||relieve.resolucion>1025||relieve.alturas.length!==relieve.resolucion**2||!relieve.alturas.every(Number.isFinite)||!(relieve.ancho>0)||!(relieve.fondo>0))throw Error('Relieve exportado inválido');
      const terrain=new Terrain({width:relieve.ancho,depth:relieve.fondo,resolution:relieve.resolucion,heights:relieve.alturas,origin:0});
      const sectors=JSON.parse(buffers.get(m.sectors)).sectores,entities=JSON.parse(buffers.get(m.entities)).entities;
      if(!Array.isArray(sectors)||!sectors.length||!entities||typeof entities!=='object'||Array.isArray(entities))throw Error('Sectores o identidades inválidos');
      const ids=new Set(),bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
      for(const s of sectors){
        if(typeof s.id!=='string'||ids.has(s.id)||!buffers.has(s.archivo)||!s.caja||!['min','max'].every(k=>Array.isArray(s.caja[k])&&s.caja[k].length===3&&s.caja[k].every(Number.isFinite))||s.caja.min.some((n,i)=>n>s.caja.max[i]))throw Error('Sector inválido');
        ids.add(s.id);for(let i=0;i<3;i++){bounds.min[i]=Math.min(bounds.min[i],s.caja.min[i]);bounds.max[i]=Math.max(bounds.max[i],s.caja.max[i]);}
        for(const n of s.entityIds??[])if(!entities[n])throw Error('Entidad de sector desconocida');
      }
      const catalog=await this.catalog();let old=null;
      if(id){token(id);old=catalog.places.find(p=>p.id===id);if(!old)throw Error('Lugar desconocido');if(old.revision!==expectedRevision)throw Error('Conflicto: hay una versión más reciente. Abre el lugar de nuevo antes de actualizarlo.');}
      else id='atlas-'+randomUUID();
      const revision=randomUUID(),name=String(label??old?.label??project.model.label??project.place.name??'Lugar generado').trim().slice(0,160);
      if(!name)throw Error('Nombre de lugar obligatorio');
      const base=id+'/revisiones/'+revision+'/',destination=join(this.root,id,'revisiones',revision);
      await mkdir(destination,{recursive:true});
      for(const [name,b]of buffers)await writeFile(join(destination,name),b,{flag:'wx'});
      await writeFile(join(destination,'manifest.json'),manifestBytes,{flag:'wx'});
      const objects=lugar.edificios.map(o=>{const points=o.huella.flat(),minY=Math.min(...points.map(p=>terrain.height(...p)))+(o.ajusteApoyo??0);return {id:o.id,name:o.nombre||o.id,type:'edificio',collision:true,bounds:{min:[Math.min(...points.map(p=>p[0])),minY,Math.min(...points.map(p=>p[1]))],max:[Math.max(...points.map(p=>p[0])),minY+o.altura,Math.max(...points.map(p=>p[1]))]}};});
      for(const c of lugar.comercios??[])objects.push({id:c.id,name:c.nombre,type:'comercio',collision:false,bounds:c.bounds,categoria:c.categoria,horario:c.horario,semilla:c.semilla,buildingId:c.buildingId,inferido:c.inferido,ancla:c.ancla});
      const zone={version:1,id,label:name,atlas:true,revision,package:'manifest.json',bounds,spawn:[0,terrain.height(0,0)+1.7,0],ground:{grid:{n:terrain.n,width:terrain.width,depth:terrain.depth,h:relieve.alturas}},objects,entities,
        sectors:sectors.map(s=>({id:s.id,url:s.archivo,bytes:s.bytes,sha256:m.files.find(f=>f.path===s.archivo).sha256,bounds:s.caja,entityIds:s.entityIds??[]}))};
      await writeFile(join(destination,'zona.json'),JSON.stringify(zone),{flag:'wx'});
      const entry={id,label:name,revision,manifest:base+'zona.json',updatedAt:new Date().toISOString(),sectors:sectors.length,entities:Object.keys(entities).length,bytes,
        history:[...(old?.history??[]),{revision,createdAt:new Date().toISOString(),packageSha256:digest(manifestBytes)}]};
      catalog.places=old?catalog.places.map(p=>p.id===id?entry:p):[...catalog.places,entry];
      await atomic(join(this.root,'catalogo.json'),catalog);
      return {...entry,viewerUrl:'http://localhost:3000/mundo/piloto-lexico?modo=desarrollo&zone='+id,editorUrl:'http://127.0.0.1:5179/?lugar='+id};
    });
  }
  async edit(id,{expectedHash,changes}){
    return this.locked(async()=>{
      const current=await this.project(id);
      if(!expectedHash||expectedHash!==current.sha256)throw Error('Conflicto: vuelve a leer el proyecto antes de editar');
      if(!Array.isArray(changes)||!changes.length||changes.length>1000)throw Error('Lista de cambios inválida');
      const project=structuredClone(current.project),buildingIds=new Set(project.model.buildings.map(b=>b.id)),roadIds=new Set(project.model.roads.map(r=>r.id));
      const place=await this.place(id),zone=await json(join(this.root,place.manifest)),commerceIds=new Set((zone.objects??[]).filter(o=>o.type==='comercio').map(o=>o.id));
      for(const c of changes){
        if(!['overrides','profiles','interiors','roadEdits','comercios'].includes(c.layer)||typeof c.id!=='string'||!(c.layer==='comercios'?commerceIds:c.layer==='roadEdits'?roadIds:buildingIds).has(c.id)||!c.patch||typeof c.patch!=='object'||Array.isArray(c.patch)||Object.keys(c.patch).some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('Cambio o entidad inválidos');
        project[c.layer]??={};const previous=project[c.layer][c.id]??{};project[c.layer][c.id]={...previous,...c.patch};
        if(c.layer==='profiles'&&c.patch.facade)project.profiles[c.id].facade={...previous.facade,...c.patch.facade};
      }
      const text=JSON.stringify(project);decodeProject(text);
      const dir=join(this.root,token(id),'borradores'),file=randomUUID()+'.json';await mkdir(dir,{recursive:true});await writeFile(join(dir,file),text,{flag:'wx'});
      await atomic(join(this.root,id,'borrador.json'),{file,baseRevision:current.place.revision,createdAt:new Date().toISOString(),changes});
      return {id,sha256:digest(text),file:join(dir,file),editorUrl:'http://127.0.0.1:5179/?lugar='+id,draft:true};
    });
  }
}
