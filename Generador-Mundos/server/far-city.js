// Contexto lejano de la ciudad (los kilómetros que rodean la zona detallada).
// Lee teselas vectoriales OpenMapTiles de OpenFreeMap (datos © OpenStreetMap contributors),
// las decodifica (MVT/protobuf) y devuelve huellas y alturas simplificadas en metros locales.
// Pocas peticiones por lugar y caché en disco en .geo-cache/far.
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';

const USER_AGENT='SpanStories-Atlas-Estudio/0.3 (local; cached, user-triggered requests)';
const TILEJSON='https://tiles.openfreemap.org/planet';
const R=6378137,DEG=Math.PI/180;

// ---------- Protobuf / MVT ----------
class Pbf{
  constructor(buf){this.buf=buf;this.pos=0;}
  varint(){let r=0,s=0,b;do{b=this.buf[this.pos++];r+=(b&0x7f)*2**s;s+=7;}while(b&0x80);return r;}
  skip(type){if(type===0)this.varint();else if(type===1)this.pos+=8;else if(type===2)this.pos+=this.varint();else if(type===5)this.pos+=4;else throw Error('Tipo protobuf desconocido '+type);}
  bytes(){const n=this.varint(),s=this.pos;this.pos+=n;return this.buf.subarray(s,s+n);}
  string(){return this.bytes().toString('utf8');}
  packed(){const end=this.varint()+this.pos,out=[];while(this.pos<end)out.push(this.varint());return out;}
}
const zigzag=n=>(n>>>1)^-(n&1);

function decodeValue(buf){
  const p=new Pbf(buf);let v=null;
  while(p.pos<buf.length){const tag=p.varint(),f=tag>>3,t=tag&7;
    if(f===1)v=p.string();
    else if(f===2){v=buf.readFloatLE(p.pos);p.pos+=4;}
    else if(f===3){v=buf.readDoubleLE(p.pos);p.pos+=8;}
    else if(f===4||f===5)v=p.varint();
    else if(f===6){const n=p.varint();v=n%2?-(n+1)/2:n/2;}
    else if(f===7)v=Boolean(p.varint());
    else p.skip(t);}
  return v;
}

export function decodeMVT(buf,wanted){
  const p=new Pbf(buf),layers={};
  while(p.pos<buf.length){const tag=p.varint();
    if(tag>>3!==3){p.skip(tag&7);continue;}
    const lb=p.bytes(),lp=new Pbf(lb),layer={name:'',keys:[],values:[],extent:4096,raw:[]};
    while(lp.pos<lb.length){const t=lp.varint(),f=t>>3;
      if(f===1)layer.name=lp.string();else if(f===2)layer.raw.push(lp.bytes());else if(f===3)layer.keys.push(lp.string());
      else if(f===4)layer.values.push(decodeValue(lp.bytes()));else if(f===5)layer.extent=lp.varint();else lp.skip(t&7);}
    if(wanted&&!wanted.includes(layer.name))continue;
    layer.features=layer.raw.map(fb=>{const fp=new Pbf(fb),feat={tags:{},type:0,geometry:[]};
      while(fp.pos<fb.length){const t=fp.varint(),f=t>>3;
        if(f===2){const tags=fp.packed();for(let i=0;i<tags.length;i+=2)feat.tags[layer.keys[tags[i]]]=layer.values[tags[i+1]];}
        else if(f===3)feat.type=fp.varint();else if(f===4)feat.geometry=fp.packed();else fp.skip(t&7);}
      feat.rings=decodeGeometry(feat.geometry);return feat;});
    delete layer.raw;layers[layer.name]=layer;}
  return layers;
}

function decodeGeometry(cmds){
  const rings=[];let x=0,y=0,ring=null,i=0;
  while(i<cmds.length){const c=cmds[i++],id=c&7,count=c>>3;
    if(id===1||id===2){for(let k=0;k<count;k++){x+=zigzag(cmds[i++]);y+=zigzag(cmds[i++]);if(id===1){ring=[];rings.push(ring);}ring.push([x,y]);}}
    else if(id===7&&ring&&ring.length)ring.push(ring[0].slice());}
  return rings;
}
const signedArea=r=>{let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=(r[j][0]-r[i][0])*(r[j][1]+r[i][1]);return s;};

// ---------- Servicio ----------
export class FarCityService{
  constructor({cacheDir,fetchImpl=fetch}={}){this.cacheDir=cacheDir;this.fetch=fetchImpl;this.queue=Promise.resolve();this.last=0;this.pending=new Map();}
  async cached(key,load,{maxAge=7*86400000,binary=false}={}){
    const path=this.cacheDir+'/'+createHash('sha256').update(key).digest('hex')+(binary?'.bin':'.json');
    try{const data=await readFile(path);if(binary){if(Date.now()-(await stat(path)).mtimeMs<maxAge)return data;}else{const rec=JSON.parse(data);if(Date.now()-rec.saved<maxAge)return rec.value;}}catch{}
    if(this.pending.has(key))return this.pending.get(key);
    const task=(async()=>{const value=await load();await mkdir(this.cacheDir,{recursive:true});const temp=path+'.'+randomUUID()+'.tmp';
      await writeFile(temp,binary?value:JSON.stringify({saved:Date.now(),value}));await rename(temp,path);return value;})();
    this.pending.set(key,task);try{return await task;}finally{this.pending.delete(key);}
  }
  async request(url){
    const task=this.queue.then(async()=>{await new Promise(r=>setTimeout(r,Math.max(0,150-(Date.now()-this.last))));this.last=Date.now();
      const res=await this.fetch(url,{headers:{'User-Agent':USER_AGENT},signal:AbortSignal.timeout(45000)});
      if(!res.ok)throw Error('OpenFreeMap respondió HTTP '+res.status);return Buffer.from(await res.arrayBuffer());});
    this.queue=task.catch(()=>{});return task;
  }
  async template(){return this.cached('tilejson',async()=>{const j=JSON.parse(await this.request(TILEJSON));if(!j.tiles?.[0])throw Error('TileJSON sin teselas');return j.tiles[0];},{maxAge:86400000});}
  async tile(z,x,y){
    const url=(await this.template()).replace('{z}',z).replace('{x}',x).replace('{y}',y);
    let buf=await this.cached('tile:'+z+'/'+x+'/'+y,()=>this.request(url),{binary:true,maxAge:30*86400000});
    if(buf[0]===0x1f&&buf[1]===0x8b)buf=gunzipSync(buf);
    return buf;
  }
  // radius: semilado del contexto (m). inner: semilado de la zona detallada que se excluye.
  async city({lat,lon,radius=2000,inner=200}){
    if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)throw Error('Coordenadas no válidas');
    radius=Math.min(4000,Math.max(500,radius||2000));inner=Math.max(0,Math.min(radius-50,inner||0));
    const z=14,n=2**z,cos=Math.cos(lat*DEG);
    const toTile=(la,lo)=>{const s=Math.sin(la*DEG);return [(lo+180)/360*n,(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n];};
    const dLat=radius/(R*DEG),dLon=radius/(R*DEG*cos);
    const [x0,y0]=toTile(lat+dLat,lon-dLon),[x1,y1]=toTile(lat-dLat,lon+dLon);
    const tiles=[];for(let tx=Math.floor(x0);tx<=Math.floor(x1);tx++)for(let ty=Math.floor(y0);ty<=Math.floor(y1);ty++)tiles.push([tx,ty]);
    if(tiles.length>16)throw Error('Contexto lejano demasiado grande');
    const project=(tx,ty,ext,px,py)=>{const gx=(tx+px/ext)/n,gy=(ty+py/ext)/n,lo=gx*360-180,la=Math.atan(Math.sinh(Math.PI*(1-2*gy)))/DEG;
      return [Math.round((lo-lon)*DEG*R*cos*10)/10,Math.round((lat-la)*DEG*R*10)/10];};
    const buildings=[],roads=[],water=[],green=[];
    const inside=(x,z,lim)=>Math.abs(x)<=lim&&Math.abs(z)<=lim;
    for(const [tx,ty]of tiles){
      const layers=decodeMVT(await this.tile(z,((tx%n)+n)%n,ty),['building','transportation','water','park','landcover']);
      const polys=(layer,fn)=>{for(const f of layer?.features??[]){if(f.type!==3)continue;let current=null;
        for(const r of f.rings){const ring=r.map(([px,py])=>project(tx,ty,layer.extent,px,py));if(ring.length<4)continue;
          if(signedArea(r)>0){current={outer:ring.slice(0,-1),holes:[]};fn(f,current);}else if(current)current.holes.push(ring.slice(0,-1));}}};
      polys(layers.building,(f,poly)=>{const c=poly.outer.reduce((a,p)=>[a[0]+p[0]/poly.outer.length,a[1]+p[1]/poly.outer.length],[0,0]);
        if(!inside(c[0],c[1],radius)||inside(c[0],c[1],inner))return;
        buildings.push({ring:poly.outer,holes:poly.holes,h:Number(f.tags.render_height)||8,min:Number(f.tags.render_min_height)||0,colour:f.tags.colour||null});});
      polys(layers.water,(f,poly)=>water.push(poly));
      polys(layers.park,(f,poly)=>green.push(poly));
      polys(layers.landcover,(f,poly)=>{if(['grass','wood','farmland'].includes(f.tags.class))green.push(poly);});
      for(const f of layers.transportation?.features??[]){if(f.type!==2)continue;
        const cls=f.tags.class;if(!['motorway','trunk','primary','secondary','tertiary','minor','service','rail'].includes(cls))continue;
        for(const r of f.rings)roads.push({cls,brunnel:f.tags.brunnel||null,points:r.map(([px,py])=>project(tx,ty,layers.transportation.extent,px,py))});}
    }
    return {format:'atlas-far-city',version:1,center:{lat,lon},radius,inner,zoom:z,tiles:tiles.length,buildings,roads,water,green,
      attribution:'© OpenStreetMap contributors · © OpenMapTiles · OpenFreeMap',license:'ODbL 1.0 (OpenStreetMap)'};
  }
}
