// Catálogo único para creador, visor, editor y Story Studio. Los IDs numéricos
// conservan los proyectos existentes; los modos retirados migran a Color + línea.
export const STYLE_CATALOG=Object.freeze([
  {id:'spanstories',name:'Trigun',mode:0},{id:'zelda',name:'Zelda',mode:6},
  {id:'ghibli',name:'Studio Ghibli',mode:7},{id:'dispatch',name:'Dispatch',mode:8},
  {id:'color',name:'Color',mode:1},{id:'colorline',name:'Color + línea',mode:2},
]);
export const STYLE_MODES=Object.freeze(Object.fromEntries(STYLE_CATALOG.map(s=>[s.id,s.mode])));
export const STYLE_DEFAULTS=Object.freeze({lineWidth:1,outline:1.6,toneSize:4.2,toneOpacity:1,beta:.84,aoStrength:1,
  hazeDensity:.0011,hazeStart:120,threshold:.10,soft:.035,contrast:1.15,shadowDepth:.7,rim:.3,saturation:1.08,lineFar:900,cloudAmount:.22,windowReflect:1,paint:1});
export const STYLE_LIMITS=Object.freeze({lineWidth:[0,4],outline:[0,4],toneSize:[1,12],toneOpacity:[0,1],beta:[0,1],aoStrength:[0,3],hazeDensity:[0,.02],hazeStart:[0,3000],threshold:[-1,1],soft:[0,1],contrast:[0,3],shadowDepth:[0,2],rim:[0,2],saturation:[0,3],lineFar:[1,9000],cloudAmount:[0,1],windowReflect:[0,1],paint:[0,2]});
export const STYLE_CONTROLS=[['lineWidth','Grosor de línea',.1],['outline','Intensidad de línea',.1],['contrast','Contraste',.05],['shadowDepth','Profundidad de sombra',.05],['saturation','Saturación',.05],['paint','Acuarela Zelda',.05]].map(([key,name,step])=>({key,name,step,min:STYLE_LIMITS[key][0],max:STYLE_LIMITS[key][1]}));
export function styleId(id){return STYLE_CATALOG.find(s=>s.id===id||s.mode===id)?.id??({Trigun:'spanstories',Zelda:'zelda',StudioGhibli:'ghibli',Dispatch:'dispatch',Luz25D:'color',line:'colorline',linetone:'colorline',clay:'color',3:'colorline',4:'colorline',5:'color'}[id])??'spanstories';}
export function mergeStyleState(current={},patch={}){
  const result={version:1,revision:current.revision??0,active:styleId(current.active),ambient:current.ambient??'mediodia',styles:structuredClone(current.styles??{})};
  if(patch.active!==undefined)result.active=styleId(patch.active);
  if(['manana','mediodia','tarde','nublado','noche'].includes(patch.ambient))result.ambient=patch.ambient;
  for(const s of STYLE_CATALOG){
    const values={...STYLE_DEFAULTS,...result.styles[s.id]};
    for(const [key,value]of Object.entries(patch.styles?.[s.id]??{})){
      const range=STYLE_LIMITS[key];if(range&&typeof value==='number'&&Number.isFinite(value))values[key]=Math.max(range[0],Math.min(range[1],value));
    }
    result.styles[s.id]=values;
  }
  return result;
}
// No localStorage por origen: cada servidor accede al mismo archivo de ajustes.
export class StylePoolClient{
  constructor({endpoint='/api/style-pool',onChange=()=>{},onError=console.warn}={}){this.endpoint=endpoint;this.onChange=onChange;this.onError=onError;this.state=mergeStyleState();this.pending=[];this.closed=false;}
  async start(){await this.pull();if(!this.closed)this.timer=setInterval(()=>this.pull(),1500);return this;}
  apply(state){this.state=mergeStyleState(state);this.onChange(this.state);}
  async pull(){if(this.closed||this.sending||this.pending.length)return;try{const r=await fetch(this.endpoint,{cache:'no-store'});if(!r.ok)throw Error('Pool de estilos: '+r.status);const state=await r.json();if(!this.closed&&(!this.received||state.revision!==this.state.revision)&&!this.sending&&!this.pending.length){this.received=true;this.apply(state);}}catch(e){this.report(e);}}
  change(patch){this.apply(mergeStyleState(this.state,patch));this.pending.push(patch);clearTimeout(this.debounce);this.debounce=setTimeout(()=>this.flush(),80);}
  async flush(){
    if(this.sending||this.closed)return;this.sending=true;
    try{while(this.pending.length){
      const batch=this.pending.splice(0),patch={styles:{}};
      for(const p of batch){if(p.active!==undefined)patch.active=p.active;if(p.ambient!==undefined)patch.ambient=p.ambient;for(const [id,values]of Object.entries(p.styles??{}))patch.styles[id]={...patch.styles[id],...values};}
      try{
        const r=await fetch(this.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
        if(!r.ok)throw Error('No se pudo guardar el estilo compartido: '+r.status);
        const state=await r.json();if(!this.pending.length&&!this.closed)this.apply(state);
      }catch(e){this.pending.unshift(...batch);throw e;}
    }}catch(e){this.report(e);clearTimeout(this.retry);this.retry=setTimeout(()=>this.flush(),2000);}finally{this.sending=false;}
  }
  report(e){if(!this.warned){this.warned=true;this.onError(e);}}
  dispose(){this.closed=true;clearInterval(this.timer);clearTimeout(this.retry);clearTimeout(this.debounce);}
}
