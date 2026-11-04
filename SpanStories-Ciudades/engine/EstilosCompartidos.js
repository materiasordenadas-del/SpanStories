// El compositor y el catálogo se sirven directamente desde Generador-Mundos.
import * as T from './three.js';
import {Pipeline} from '../shared-styles/pipeline.js';
import {STYLE_CATALOG,STYLE_CONTROLS,STYLE_DEFAULTS,StylePoolClient} from '../shared-styles/style-pool.js';
import {fragmentoGBuffer,verticeGBuffer} from './StyleGBuffer.js';

export class EstilosCompartidos{
  constructor({luz,renderer,scene}){
    this.composicionFija=true;this.luz=luz;this.scene=scene;this.renderer=renderer;this.oyentes=new Set();this.activo='spanstories';
    this.pipeline=new Pipeline(renderer);this.pipeline.setAmbient(luz.ambiente);
    this.registro=new Map(STYLE_CATALOG.map(s=>[s.id,{id:s.id,nombre:s.name,descripcion:'Estilo compartido con el creador de mundos.',
      controles:STYLE_CONTROLS.map(c=>({clave:c.key,nombre:c.name,min:c.min,max:c.max,paso:c.step})),
      uniformes:{...Object.fromEntries(Object.entries(STYLE_DEFAULTS).map(([k,value])=>[k,{value}])),uEstiloTrazo:{value:0}}}]));
    this.pool=new StylePoolClient({onChange:state=>this.aplicar(state)});
    this.soltarLuz=luz.alCambiar(()=>{if(!this.aplicando)this.pool.change({ambient:luz.ambiente});});
    this.ready=this.pool.start();
  }
  aplicar(state){
    this.aplicando=true;
    try{
      this.activo=state.active;this.ambienteCompartido=state.ambient;
      // A Story scene may light the city locally; the shared pool keeps its own value.
      const ambiente=this.ambienteDeEscena||state.ambient;
      this.pipeline.setAmbient(ambiente);
      if(this.luz.ambiente!==ambiente)this.luz.usarAmbiente(ambiente);
      for(const [id,values]of Object.entries(state.styles))for(const [key,value]of Object.entries(values))if(this.registro.get(id)?.uniformes[key])this.registro.get(id).uniformes[key].value=value;
      Object.assign(this.pipeline.params,state.styles[state.active],{mode:STYLE_CATALOG.find(s=>s.id===state.active).mode});
      for(const fn of this.oyentes)fn(this.actual);
    }finally{this.aplicando=false;}
  }
  get actual(){return this.registro.get(this.activo);}
  get ambienteVisual(){return this.luz.ambiente;}
  listar(){return [...this.registro.values()];}
  seleccionar(id){if(!STYLE_CATALOG.some(s=>s.id===id))return false;this.pool.change({active:id});return true;}
  usarAmbiente(id){this.pool.change({ambient:id});return true;}
  /** Story Studio: light for the active scene without writing the shared style pool. null restores the shared light. */
  ambienteEscena(id){
    this.ambienteDeEscena=id||null;
    const ambiente=this.ambienteDeEscena||this.ambienteCompartido||this.luz.ambiente;
    this.aplicando=true;
    try{this.pipeline.setAmbient(ambiente);if(this.luz.ambiente!==ambiente)this.luz.usarAmbiente(ambiente);}
    finally{this.aplicando=false;}
  }
  ajustar(key,value){if(!this.actual.controles.some(c=>c.clave===key))return false;this.pool.change({styles:{[this.activo]:{[key]:value}}});return true;}
  componer(shader,material){return fragmentoGBuffer(shader,material.userData);}
  componerVertice(shader){return verticeGBuffer(shader);}
  alCambiar(fn){this.oyentes.add(fn);return ()=>this.oyentes.delete(fn);}
  update(){}
  render(scene,camera){
    const size=this.renderer.getDrawingBufferSize(new T.Vector2());this.pipeline.setSize(size.x,size.y,1);
    const hidden=[],overlays=[];scene.traverse(o=>{if(o.visible&&(o.userData.cityOutline||o.isLine||o.isSprite)){hidden.push(o);if(!o.userData.cityOutline)overlays.push(o);o.visible=false;}});
    const background=scene.background;scene.background=null;
    const space=this.renderer.outputColorSpace;this.renderer.outputColorSpace=T.LinearSRGBColorSpace;
    try{this.pipeline.render(scene,camera,this.luz.uniformes.uLuzDir.value);}
    finally{this.renderer.outputColorSpace=space;scene.background=background;for(const o of hidden)o.visible=true;}
    if(overlays.length){
      const mask=camera.layers.mask,clear=this.renderer.autoClear,layers=overlays.map(o=>o.layers.mask);
      try{camera.layers.set(31);for(const o of overlays)o.layers.set(31);this.renderer.autoClear=false;scene.background=null;this.renderer.render(scene,camera);}
      finally{camera.layers.mask=mask;this.renderer.autoClear=clear;scene.background=background;overlays.forEach((o,i)=>o.layers.mask=layers[i]);}
    }
  }
  dispose(){this.pool.dispose();this.soltarLuz();this.pipeline.dispose();this.oyentes.clear();}
}
