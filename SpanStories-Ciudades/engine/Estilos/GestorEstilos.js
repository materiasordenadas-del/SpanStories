import { StyleSky } from '../StyleSky.js';
import { AMBIENTES } from '../Luz25D.js';

// Style contract: id, nombre, crearUniformes(), fragmento(shader, metadata), controles.
// The manager owns selection, settings and notifications; models/navigation stay outside.
export class GestorEstilos {
  constructor({estilos=[],luz,scene=null,clave='spanstories.ciudades.estilos.v1',storage=globalThis.localStorage}={}) {
    this.registro=new Map();this.oyentes=new Set();this.activo='Luz25D';this.clave=clave;this.storage=storage;this.prefs={};
    try{const data=JSON.parse(storage?.getItem(clave)||'{}');if(data&&typeof data==='object'&&!Array.isArray(data))this.prefs=data;}catch{/* storage optional */}
    for(const style of estilos)this.registrar(style);
    if(!this.registro.has(this.activo))throw new Error('Estilos necesita el adaptador Luz25D');
    if(this.registro.has(this.prefs.activo))this.activo=this.prefs.activo;
    this.luz=luz;this.sky=scene?new StyleSky(scene):null;
    this.soltarLuz=luz?.alCambiar(()=>this.actualizarEntorno());
    if(this.prefs.ambiente)this.usarAmbiente(this.prefs.ambiente);
    this.actualizarEntorno();
  }
  registrar(style){
    if(!style?.id||!style.nombre||typeof style.fragmento!=='function'||typeof style.crearUniformes!=='function')throw new Error('Contrato de estilo inválido');
    if(this.registro.has(style.id))throw new Error('Estilo ya registrado: '+style.id);
    const uniforms={...style.crearUniformes(),uEstiloTrazo:{value:style.trazo??1}};
    for(const control of style.controles||[])this.aplicarValor(uniforms,control,this.prefs.ajustes?.[style.id]?.[control.clave]);
    this.registro.set(style.id,{...style,uniformes:uniforms});
    if(this.oyentes.size)this.emitir();
    return this;
  }
  listar(){return [...this.registro.values()];}
  get actual(){return this.registro.get(this.activo);}
  get ambienteVisual(){const id=this.variante?.id;return id&&this.actual.ambientes?.[id]?.base===this.luz?.ambiente?id:this.luz?.ambiente;}
  usarAmbiente(id){
    const variante=this.actual.ambientes?.[id];
    if(!variante&&!AMBIENTES[id])return false;
    this.variante=variante?{id,base:variante.base}:null;this.luz?.usarAmbiente(variante?.base||id);this.guardar();return true;
  }
  seleccionar(id){
    if(!this.registro.has(id))return false;
    if(id===this.activo)return true;
    this.activo=id;this.guardar();this.actualizarEntorno();this.emitir();return true;
  }
  aplicarValor(uniforms,control,value){
    if(value===undefined||!uniforms[control.clave])return false;
    if(control.tipo==='color'){
      if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))return false;
      uniforms[control.clave].value.set(value);return true;
    }
    if(typeof value!=='number'||!Number.isFinite(value))return false;
    uniforms[control.clave].value=Math.max(control.min,Math.min(control.max,value));return true;
  }
  ajustar(clave,value){
    const profile=this.actual,control=profile.controles?.find(c=>c.clave===clave);
    if(!control||!this.aplicarValor(profile.uniformes,control,value))return false;
    this.guardar();this.actualizarEntorno();return true; // shared uniforms update without shader compilation
  }
  guardar(){
    const ajustes={};for(const style of this.listar()){
      ajustes[style.id]={};for(const c of style.controles||[]){const v=style.uniformes[c.clave].value;ajustes[style.id][c.clave]=v?.isColor?'#'+v.getHexString():v;}
    }
    try{this.storage?.setItem(this.clave,JSON.stringify({activo:this.activo,ambiente:this.ambienteVisual,ajustes}));}catch{/* no storage */}
  }
  componer(shader,material){return this.actual.fragmento(shader,material.userData);}
  componerVertice(shader,material){return this.actual.vertice?this.actual.vertice(shader,material.userData):shader;}
  alCambiar(fn){this.oyentes.add(fn);return ()=>this.oyentes.delete(fn);}
  emitir(){for(const fn of this.oyentes)fn(this.actual);}
  actualizarEntorno(){
    const profile=this.actual;
    if(this.sky&&profile.preparar&&!profile.preparado&&typeof document!=='undefined'){
      profile.preparado=true;profile.liberar=profile.preparar(profile);
    }
    const palette=profile.entorno?.({ambiente:this.luz?.ambiente,variante:this.ambienteVisual,uniformes:profile.uniformes})||profile.cielo;
    this.sky?.configurar(palette,this.luz?.ambiente,{fragmento:profile.fragmentoCielo,uniformes:{...profile.uniformes,uLuzDir:this.luz?.uniformes.uLuzDir}});
  }
  update(camera){this.sky?.update(camera);}
  dispose(){this.soltarLuz?.();this.sky?.dispose();for(const profile of this.listar())profile.liberar?.();this.oyentes.clear();}
}
