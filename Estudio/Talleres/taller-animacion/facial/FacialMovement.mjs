// Body gestures reuse the character's life controller (LifeCharacter); facial curves stay independent.
export const MOVEMENTS={auto:'Según la expresión',none:'Sin movimiento',feliz:'Alegría suave',muyFeliz:'Celebrar',sorprendido:'Sorprenderse',confundido:'Mostrar confusión',preocupado:'Preocuparse',molesto:'Mostrar molestia',pensando:'Pensar',riendo:'Reír',avergonzado:'Mostrar vergüenza',esceptico:'Mostrar escepticismo',guino:'Gesto de guiño',hablandoEl:'Acompañar con las manos',triste:'Entristecerse',escuchando:'Escuchar'};
const clamp=v=>Math.min(1,Math.max(0,v));
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function suggestMovement(p){
  const id=String(p.id),text=normalize([p.name,...(p.tags||[])].join(' '));
  if(/wink|guino/.test(id+' '+text))return 'guino';
  if(/shy|verguenza/.test(id+' '+text))return 'avergonzado';
  if(/laugh|risa/.test(id+' '+text))return 'riendo';
  if(/skeptic|escept/.test(id+' '+text))return 'esceptico';
  if(/doubt|confusion|duda/.test(id+' '+text))return 'confundido';
  if(/very-happy|enthusiasm/.test(id)||/muy feliz|entusiasmo|very happy/.test(text))return 'muyFeliz';
  return {alegria:'feliz',tristeza:'triste',enojo:'molesto',sorpresa:'sorprendido',miedo:'preocupado',pensamiento:'pensando',interaccion:'escuchando',desagrado:'molesto',microgestos:'escuchando',preocupacion:'preocupado',calma:'feliz',neutral:'escuchando'}[normalize(p.category)]||'escuchando';
}
export function validateMovement(m,duration){
  if(m===undefined)return;
  if(!m||!Object.hasOwn(MOVEMENTS,m.id)||typeof m.intensity!=='number'||!Number.isFinite(m.intensity)||m.intensity<0||m.intensity>1||typeof m.delay!=='number'||!Number.isFinite(m.delay)||m.delay<0||m.delay>=duration)throw Error('Movimiento, intensidad o retraso inválidos.');
}
export function sampleMovement(p,i,time){
  const m=i.movement||{id:'auto',intensity:.65,delay:Math.min(.15,i.duration*.15)};
  const id=m.id==='auto'?suggestMovement(p):m.id;
  const elapsed=time-i.start-m.delay,span=i.duration-m.delay;
  if(id==='none'||elapsed<=0||elapsed>=span)return null;
  const u=elapsed/span,smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  const envelope=smooth(u/.22)*smooth((1-u)/.22);
  const subtle=['microgestos','calma','neutral'].includes(normalize(p.category))?.35:1;
  return {id,intensity:m.intensity*envelope*subtle,time:u*3.4};
}
export function evaluateMovement(presets,instances,time){
  // One body gesture owns the skeleton. Higher-priority/later layers win.
  let result=null;
  for(const i of [...instances].sort((a,b)=>a.priority-b.priority||a.start-b.start||a.id.localeCompare(b.id))){
    const p=presets.find(p=>p.id===i.presetId);
    if(p&&time>=i.start&&time<i.start+i.duration)result=sampleMovement(p,i,time);
  }
  return result;
}
export class LifeMovement {
  constructor(vida){
    this.vida=vida;this.original=vida.expr;this.current=null;this.active=false;
    this.controller=new this.original.constructor(vida);
    const body=this.controller.cuerpo.bind(this.controller);
    this.controller.cara=()=>{}; // The ARKit player remains the only facial owner.
    this.controller.cuerpo=(_dt,posture)=>{
      const m=this.current,c=this.controller;
      c.nombre=m?.id||'neutral';c.fuerza=m?.intensity||0;c.pesos=m?{[m.id]:m.intensity}:{};
      c.tiempo=m?.time||0;c.tFeliz=m?.time||0;
      body(0,posture); // Explicit clip time: no accumulated gesture clock/spring.
      c.ojosCerrados=0; // Gaze relaxation must follow the actual facial weights.
    };
  }
  prepare(m){this.current=m;this.vida.expr=this.controller;this.active=true;}
  restore(){if(this.active&&this.vida.expr===this.controller)this.vida.expr=this.original;this.active=false;this.current=null;}
}
