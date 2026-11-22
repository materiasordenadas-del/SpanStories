// Vida, habla, controles manuales y físicas para CUALQUIER personaje del Taller facial
// (rig corporal Mixamo + shape keys FACEIT/ARKit). Ningún personaje tiene código propio: sus diferencias son datos.
//
// · Vida: LifeCharacter con un contrato construido a partir del propio modelo (cabeza por el mapa
//   Mixamo, ojos por nombre de hueso, morphs leídos de sus mallas). Nada de nombres fijos.
// · Habla: texto → visemas. Si el modelo no trae visemas `vis_*`, se sustituyen por canales ARKit.
// · Controles manuales: visemas, las 52 ARKit, otros morphs, ojos y mandíbula por hueso, clips del GLB.
// · Físicas de personaje: colisiones del cuerpo (Rapier) y pelo/trenza. Son datos por personaje
//   (perfiles-personaje.json + lo que se guarde en este navegador), no código por personaje.
import * as T from 'three';
import {LifeCharacter,GESTOS,REACCIONES} from './LifeCharacter.js';
import {NOMBRES as EXPRESIONES} from './ExpresionesVida.js?v=4';
import {restaurarDientes,ajustarDientes} from './DientesSonrisa.js';
import {ARKIT} from './FacialCore.mjs';

const pair=(n,a,b=a)=>({[n+'Left']:a,[n+'Right']:b});
// Visemas del español en canales ARKit, para personajes que no traen visemas propios.
export const VISEMAS_ARKIT={
  vis_A:{jawOpen:.5,...pair('mouthLowerDown',.3),...pair('mouthUpperUp',.1)},
  vis_E:{jawOpen:.28,...pair('mouthStretch',.35),...pair('mouthSmile',.15)},
  vis_I:{jawOpen:.14,...pair('mouthStretch',.5),...pair('mouthSmile',.25)},
  vis_O:{jawOpen:.34,mouthFunnel:.6,mouthPucker:.2},
  vis_U:{jawOpen:.12,mouthPucker:.75,mouthFunnel:.3},
  vis_BL:{jawOpen:.06,mouthClose:.15},
  vis_MBP:{mouthClose:.5,...pair('mouthPress',.4),mouthRollLower:.2},
  vis_FV:{mouthRollLower:.55,...pair('mouthUpperUp',.2),jawOpen:.08},
  vis_S:{jawOpen:.06,...pair('mouthStretch',.3),mouthClose:.15},
  vis_TH:{jawOpen:.15,tongueOut:.3},
  vis_CH:{mouthFunnel:.4,mouthPucker:.2,jawOpen:.12},
  vis_TDNL:{jawOpen:.2,...pair('mouthStretch',.15)},
  vis_K:{jawOpen:.25,...pair('mouthStretch',.1)}
};
const VISEMAS=Object.keys(VISEMAS_ARKIT);
const san=n=>T.PropertyBinding.sanitizeNodeName(n||'');
const norm=n=>n.toLowerCase().replace(/[^a-z0-9]/g,'');

/** Contrato de LifeCharacter medido en el propio modelo. */
export function contractFor(root,rig){
  const bones=[];root.traverse(o=>{if(o.isBone)bones.push(o.name);});
  // Hueso del globo: el que deforma el ojo, no su padre. En rigs de Faceit `master_eye` es el padre de
  // párpados y cejas: girarlo para mirar arrastraría toda la zona del ojo. Se prefiere un hueso DEF sin
  // párpados ni cejas colgando de él.
  const byName=new Map();root.traverse(o=>{if(o.isBone)byName.set(o.name,o);});
  const carriesLids=n=>{let hit=false;byName.get(n)?.traverse(c=>{if(c.name!==n&&/lid|brow|lash/i.test(c.name))hit=true;});return hit;};
  const eye=side=>{const re=new RegExp(`eye[_.:-]?(${side}|${side==='l'?'left':'right'})$`,'i'),all=bones.filter(n=>!/lid|brow|lash|socket|end$/i.test(n)&&re.test(n)&&!carriesLids(n));
    return all.find(n=>/^def/i.test(n))||all.find(n=>!/^(mch|master|org)/i.test(n))||all[0]||bones.find(n=>new RegExp(`(${side==='l'?'left':'right'})eye$`,'i').test(n))
      // AccuRig / Reallusion: CC_Base_L_Eye
      ||bones.find(n=>new RegExp(`(^|[_.:-])${side}[_.:-]eye$`,'i').test(n));};
  const jaw=bones.find(n=>/^(def[-_.]?)?jaw$/i.test(n))||bones.find(n=>/jaw$/i.test(n)&&!/[lr]$|\d$/i.test(n))||bones.find(n=>/(^|[_.:-])jawroot$/i.test(n));
  const names=new Set();root.traverse(o=>Object.keys(o.morphTargetDictionary||{}).forEach(n=>names.add(n)));
  const all=[...names],arkit=ARKIT.filter(a=>all.some(n=>norm(n)===norm(a))),visemas=all.filter(n=>/^vis_/i.test(n));
  // Un hueso que no existe queda como nombre vacío: LifeCharacter lo trata como ausente.
  return {mapa:{...rig.mapping},huesos:{cabeza:rig.mapping.head||bones.find(n=>/head$/i.test(n))||'',ojo_L:eye('l')||'',ojo_R:eye('r')||'',mandibula:jaw||''},
    morphs:{arkit:arkit.map(a=>all.find(n=>norm(n)===norm(a))),visemas,otros:all.filter(n=>!arkit.some(a=>norm(a)===norm(n))&&!visemas.includes(n))}};
}

const PHYSICS_KEY='spanstories.character-physics.v1:';
async function characterProfile(id){try{const r=await fetch(new URL('./perfiles-personaje.json',import.meta.url));if(r.ok)return (await r.json()).personajes?.[id]||null;}catch{}return null;}
async function physicsProfile(id){
  // {perfil:true} = «Valores del perfil»: se guarda como marca (el espejo en disco nunca borra claves, así que un removeItem volvería).
  try{const stored=localStorage.getItem(PHYSICS_KEY+id);if(stored){const value=JSON.parse(stored);if(!value?.perfil)return value;}}catch{}
  try{const r=await fetch(new URL('./perfiles-personaje.json',import.meta.url));if(r.ok){const d=await r.json();if(d.personajes?.[id]?.fisica)return structuredClone(d.personajes[id].fisica);}}catch{}
  return {cuerpo:false,pelo:null};
}
let rapier=null;
async function loadRapier(){if(!rapier){const m=await import('./vendor/rapier/rapier.es.js');await m.default.init();rapier=m.default;}return rapier;}

export async function createCharacterLife({root,rig,gltf,mixer,camera,renderer,scene,characterId,say=()=>{}}){
  const contract=contractFor(root,rig),physics=await physicsProfile(characterId),teeth=(await characterProfile(characterId))?.cuerpo?.dientesConSonrisa||null,bones={};root.traverse(o=>{if(o.isBone)bones[o.name]=o;});
  let vida=null,synthetic=null,manualClip=null,owned=false,capsules=false;
  const floor=new T.Group(),grid=new T.GridHelper(4,40,0x6b7280,0x464b55);grid.material.transparent=true;grid.material.opacity=.45;floor.add(grid);scene.add(floor);
  let floorOffset=0;
  async function build(){
    const previous=vida;
    if(previous){for(const [h,q] of previous.reposo)h.quaternion.copy(q);if(previous.cadera&&previous.reposoPos)previous.cadera.position.copy(previous.reposoPos);previous.cuerpo?.depurar?.(null);}
    // Mirada: sigue el cursor mientras está sobre el visor; si sale, vuelve a mirar a cámara. Se conserva al reconstruir.
    const options={camara:camera,modoMirada:previous?.modoMirada||'cursor'};
    if(physics.cuerpo||physics.pelo?.trenza)options.rapier=await loadRapier().catch(e=>{say('No se pudo cargar la física: '+e.message);return null;});
    if(physics.pelo)options.pelo=physics.pelo;
    vida=new LifeCharacter(root,contract,options);
    // El mundo de Rapier del cuerpo anterior vive en memoria WASM: se libera al sustituirlo.
    previous?.cuerpo?.liberar?.();
    if(!physics.cuerpo&&vida.cuerpo)vida.activo.colisiones=false;
    // Visemas sustitutos: objetivos falsos que LifeCharacter escribe como si fueran morphs.
    synthetic=null;
    if(!contract.morphs.visemas.length){
      synthetic=Object.fromEntries(VISEMAS.map(n=>[n,{morphTargetInfluences:[0]}]));
      for(const n of VISEMAS){vida.indice[n]=[[synthetic[n],0]];vida.nombresVida.push(n);}
    }
    floor.position.y=vida.sueloReposo+floorOffset;vida.suelo=floor.position.y;
    if(capsules)vida.cuerpo?.depurar(scene);
    return vida;
  }
  await build();
  const sliders=[],bonesRest={};
  for(const k of ['ojo_L','ojo_R','mandibula']){const b=bones[san(contract.huesos[k])];if(b)bonesRest[k]={b,q:b.quaternion.clone()};}
  const manual={eyeX:0,eyeY:0,jaw:0},q=new T.Quaternion(),e=new T.Euler();
  function applyBones(){
    for(const k of ['ojo_L','ojo_R'])if(bonesRest[k]&&(manual.eyeX||manual.eyeY))bonesRest[k].b.quaternion.copy(bonesRest[k].q).multiply(q.setFromEuler(e.set(manual.eyeY,0,manual.eyeX)));
    if(bonesRest.mandibula&&manual.jaw)bonesRest.mandibula.b.quaternion.copy(bonesRest.mandibula.q).multiply(q.setFromEuler(e.set(manual.jaw,0,0)));
  }
  /** Sin huesos de ojo: «Ojos ↔ / ↕» mueven las shape keys eyeLook (eyeX + = a su izquierda, eyeY + = abajo), encima de la vida. */
  function applyEyeMorphs(){
    const om=vida.ojosMorph;
    if(om&&!bonesRest.ojo_L&&!bonesRest.ojo_R&&(manual.eyeX||manual.eyeY)){
      const put=(n,v)=>{if(v>0)for(const [m,i] of vida.indice[n]||[])m.morphTargetInfluences[i]=Math.min(1,m.morphTargetInfluences[i]+v);};
      for(const sd of ['Left','Right']){const x=Math.max(-1,Math.min(1,manual.eyeX/om[sd].rangoX)),y=Math.max(-1,Math.min(1,manual.eyeY/om[sd].rangoY));
        put(sd==='Left'?'eyeLookOutLeft':'eyeLookInRight',x);put(sd==='Left'?'eyeLookInLeft':'eyeLookOutRight',-x);put('eyeLookDown'+sd,y);put('eyeLookUp'+sd,-y);}
    }
  }
  function applySynthetic(){
    if(!synthetic)return;
    const add={};for(const n of VISEMAS){const v=synthetic[n].morphTargetInfluences[0];if(v>0)for(const [c,w] of Object.entries(VISEMAS_ARKIT[n]))add[c]=(add[c]||0)+v*w;}
    for(const [c,v] of Object.entries(add)){const target=contract.morphs.arkit.find(n=>norm(n)===norm(c));for(const [m,i] of vida.indice[target]||[])m.morphTargetInfluences[i]=Math.min(1,m.morphTargetInfluences[i]+v);}
  }
  const OWNED_OFF=['postura','peso','gestos','cabeza','mirada','inercia','respiracion','colisiones'];
  const api={
    contract,physics,get vida(){return vida;},
    /** Antes de mover el esqueleto: deja huesos y morphs de la vida en reposo. */
    before(){restaurarDientes(vida);vida.antes();},
    /** Clip manual del GLB (solo cuando ninguna actuación ni clip del Taller lleva el cuerpo). */
    playClip(dt){if(manualClip)mixer.update(dt*vida.velocidad);},
    /**
     * Después del cuerpo. bodyOwned = una actuación o el clip del Taller mandan en el esqueleto:
     * la vida deja el cuerpo quieto y conserva habla, pelo y física de la trenza.
     */
    after(dt,{bodyOwned=false}={}){
      owned=bodyOwned;applyBones();
      const saved={};if(owned)for(const k of OWNED_OFF){saved[k]=vida.activo[k];vida.activo[k]=false;}
      vida.update(dt);applyEyeMorphs();
      if(owned)Object.assign(vida.activo,saved);
      applySynthetic();vida.cuerpo?.pintar?.();
    },
    finish(facialSmile){ajustarDientes(vida,teeth,{manual:manual.jaw!==0,facialSmile});},
    pointer(event,dom,picked){
      const r=dom.getBoundingClientRect(),ndc=new T.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),ray=new T.Raycaster();ray.setFromCamera(ndc,camera);
      if(picked){const hit=ray.intersectObject(root,true)[0];if(hit)vida.tocar(hit.point);return;}
      // Plano de la mirada a un 30 % del camino cara→cámara: el giro es unas 2,3 veces el ángulo del cursor en pantalla
      // (a medio camino apenas giraba y parecía que no lo seguía); los límites de ojos y cabeza lo acotan.
      const head=vida.cabeza.getWorldPosition(new T.Vector3()).lerp(camera.position,.3),plane=new T.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new T.Vector3()).negate(),head),hit=ray.ray.intersectPlane(plane,new T.Vector3());
      vida.ponerCursor(hit&&hit.distanceTo(camera.position)>.08?hit:null,{arrastre:event.buttons>0});
    },
    dispose(){scene.remove(floor);grid.geometry.dispose();grid.material.dispose();const c=vida.cuerpo;if(c?.malla){c.malla.parent?.remove(c.malla);c.malla=null;}c?.liberar?.();},
    /** Secciones del panel. Se vuelven a crear cada vez que el editor monta su panel. */
    panel(){
      const sections=[],details=(title,open=false)=>{const d=document.createElement('details');d.className='cl-section';d.open=open;const s=document.createElement('summary');s.textContent=title;d.append(s);sections.push(d);return d;};
      const row=(parent,label,input,out)=>{const l=document.createElement('label');l.className='cl-row';const t=document.createElement('span');t.textContent=label;l.append(t,input);if(out)l.append(out);parent.append(l);return l;};
      const range=(min,max,step,value)=>{const r=document.createElement('input');r.type='range';r.min=min;r.max=max;r.step=step;r.value=value;return r;};
      const button=(parent,text,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=async()=>{try{await fn();}catch(err){say(err?.message||String(err));}};parent.append(b,' ');return b;};
      const style=document.createElement('style');style.textContent='.cl-section{border-top:1px solid #ffffff1c;padding:4px 0}.cl-section summary{cursor:pointer;font-weight:600;margin:6px 0}.cl-row{display:grid;grid-template-columns:118px 1fr 40px;gap:6px;align-items:center;font:11px system-ui;margin:3px 0}.cl-row input[type=checkbox]{justify-self:start}.cl-checks label{display:inline-block;margin:2px 8px 2px 0;font:11px system-ui}.cl-note{font:11px system-ui;color:#b3c9dd;margin:4px 0}.cl-buttons button{font-size:11px;padding:2px 6px;margin:2px 0}.cl-section textarea{width:100%;box-sizing:border-box}';
      // ---- Vida
      const life=details('Vida del personaje',true);life.prepend(style);
      const note=document.createElement('p');note.className='cl-note';note.textContent='Respiración, parpadeo, mirada, postura y gestos de reposo. Mientras una actuación o un clip del Taller mueve el cuerpo, la vida deja quieto el esqueleto y mantiene habla, pelo y trenza. «Volver al personaje vivo» (biblioteca facial) le devuelve la cara.';life.append(note);
      const checks=document.createElement('div');checks.className='cl-checks';
      for(const [k,label] of [['respiracion','Respiración'],['parpadeo','Parpadeo'],['mirada','Ojos'],['cabeza','Cabeza'],['postura','Postura'],['peso','Peso'],['gestos','Gestos'],['cara','Cara'],['inercia','Inercia brazos']]){const l=document.createElement('label'),c=document.createElement('input');c.type='checkbox';c.checked=vida.activo[k];c.onchange=()=>vida.activo[k]=c.checked;l.append(c,' '+label);checks.append(l);}
      life.append(checks);
      const gaze=document.createElement('select');for(const [v,t] of [['camara','a la cámara'],['cursor','sigue el cursor'],['deambular','deambula']])gaze.append(new Option(t,v));gaze.value=vida.modoMirada;gaze.onchange=()=>{vida.modoMirada=gaze.value;vida.mir.prox=0;};row(life,'Mirada',gaze);
      const mood=document.createElement('select');for(const m of ['tranquila','contenta','nerviosa','triste','cansada','atenta'])mood.append(new Option(m,m));mood.value=vida.animo;mood.onchange=()=>vida.animo=mood.value;row(life,'Ánimo',mood);
      const energyOut=document.createElement('output'),energy=range(0,1,.01,vida.energia);energyOut.textContent=(+energy.value).toFixed(2);energy.oninput=()=>{vida.energia=+energy.value;energyOut.textContent=vida.energia.toFixed(2);};row(life,'Energía',energy,energyOut);
      const floorOut=document.createElement('output'),floorInput=range(-.15,.15,.005,floorOffset);floorOut.textContent=floorOffset.toFixed(3);floorInput.oninput=()=>{floorOffset=+floorInput.value;floor.position.y=vida.sueloReposo+floorOffset;vida.suelo=floor.position.y;floorOut.textContent=floorOffset.toFixed(3);};row(life,'Altura del piso',floorInput,floorOut);
      const gridToggle=document.createElement('input');gridToggle.type='checkbox';gridToggle.checked=floor.visible;gridToggle.onchange=()=>floor.visible=gridToggle.checked;row(life,'Ver piso',gridToggle);
      const actions=document.createElement('div');actions.className='cl-buttons';button(actions,'Parpadear',()=>vida.parpadear());button(actions,'Suspiro',()=>vida.suspirar());
      const slow=button(actions,'Cámara lenta',()=>{vida.velocidad=vida.velocidad===1?.25:1;slow.textContent=vida.velocidad===1?'Cámara lenta':'Velocidad normal';});life.append(actions);
      const gestures=document.createElement('div');gestures.className='cl-buttons';gestures.append(Object.assign(document.createElement('b'),{textContent:'Gestos '}));for(const g of Object.keys(GESTOS))button(gestures,g,()=>vida.gesto(g));life.append(gestures);
      const reactions=document.createElement('div');reactions.className='cl-buttons';reactions.append(Object.assign(document.createElement('b'),{textContent:'Reacciones '}));for(const r of Object.keys(REACCIONES))button(reactions,r,()=>vida.reaccionar(r));life.append(reactions);
      const quick=document.createElement('div');quick.className='cl-buttons';quick.append(Object.assign(document.createElement('b'),{textContent:'Expresiones rápidas de la vida '}));
      for(const [k,name] of Object.entries(EXPRESIONES))button(quick,name,()=>{api.onExpression?.();vida.expresion(k);});
      const strengthOut=document.createElement('output'),strength=range(0,1,.01,vida.expr.fuerza??1);strengthOut.textContent=(+strength.value).toFixed(2);strength.oninput=()=>{api.onExpression?.();vida.expr.fuerza=+strength.value;strengthOut.textContent=(+strength.value).toFixed(2);};
      life.append(quick);row(life,'Fuerza',strength,strengthOut);
      const hint=document.createElement('p');hint.className='cl-note';hint.textContent='Haz clic sobre el personaje para que reaccione al toque.';life.append(hint);
      // ---- Habla
      const speech=details('Habla',true);
      const text=document.createElement('textarea');text.rows=2;text.value='¡Hola! ¿Quieres practicar español conmigo hoy?';text.setAttribute('aria-label','Texto que dice el personaje');speech.append(text);
      const variant=document.createElement('select');variant.append(new Option('Latinoamérica','latam'),new Option('España (z = TH)','es'));variant.value=vida.variante;row(speech,'Variante',variant);
      const voice=document.createElement('input');voice.type='checkbox';voice.checked=true;row(speech,'Con voz',voice);
      const speak=document.createElement('div');speak.className='cl-buttons';button(speak,'Hablar',()=>{vida.variante=variant.value;vida.hablar(text.value,{voz:voice.checked});});button(speak,'Callar',()=>{vida.callar();});speech.append(speak);
      const vnote=document.createElement('p');vnote.className='cl-note';vnote.textContent=contract.morphs.visemas.length?`${contract.morphs.visemas.length} visemas propios del personaje.`:'Este personaje no trae visemas: se forman con sus canales ARKit (mandíbula, labios y lengua).';speech.append(vnote);
      // ---- Controles manuales
      const manualSection=details('Controles manuales');
      const mnote=document.createElement('p');mnote.className='cl-note';mnote.textContent='Pesos directos sobre el personaje. Mientras la biblioteca facial tiene el control, sus canales ARKit mandan; pulsa «Volver al personaje vivo» para ver solo estos.';manualSection.append(mnote);
      const group=(title,names,open=false)=>{if(!names.length)return;const d=document.createElement('details');d.open=open;const s=document.createElement('summary');s.textContent=`${title} (${names.length})`;d.append(s);
        for(const n of names){const out=document.createElement('output'),r=range(0,1,.01,vida.historia[n]||0);out.textContent=(+r.value).toFixed(2);r.setAttribute('aria-label',n);r.oninput=()=>{vida.morph(n,+r.value);out.textContent=(+r.value).toFixed(2);};sliders.push([n,r,out]);row(d,n,r,out);}
        manualSection.append(d);};
      group('Visemas',contract.morphs.visemas.length?contract.morphs.visemas:VISEMAS,true);group('ARKit',contract.morphs.arkit);group('Otros morphs',contract.morphs.otros);
      const bonesBox=document.createElement('details');bonesBox.append(Object.assign(document.createElement('summary'),{textContent:'Mirada y mandíbula (huesos)'}));
      for(const [k,label,min,max] of [['eyeX','Ojos ↔',-.5,.5],['eyeY','Ojos ↕',-.4,.4],['jaw','Mandíbula',0,.4]]){const out=document.createElement('output'),r=range(min,max,.01,manual[k]);out.textContent=manual[k].toFixed(2);r.disabled=k==='jaw'?!bonesRest.mandibula:!bonesRest.ojo_L&&!bonesRest.ojo_R&&!vida.ojosMorph;r.oninput=()=>{manual[k]=+r.value;out.textContent=manual[k].toFixed(2);if(!manual.eyeX&&!manual.eyeY)for(const s of ['ojo_L','ojo_R'])bonesRest[s]?.b.quaternion.copy(bonesRest[s].q);if(!manual.jaw&&bonesRest.mandibula)bonesRest.mandibula.b.quaternion.copy(bonesRest.mandibula.q);};sliders.push([k,r,out]);row(bonesBox,label,r,out);}
      manualSection.append(bonesBox);
      const clipBox=document.createElement('details');clipBox.append(Object.assign(document.createElement('summary'),{textContent:`Clips del modelo (${gltf.animations.length})`}));
      const clip=document.createElement('select');clip.append(new Option('(pose de reposo)',''),...gltf.animations.map((a,i)=>new Option(`${a.name} · ${a.duration.toFixed(1)} s`,String(i))));
      clip.onchange=()=>{manualClip?.stop();manualClip=null;if(clip.value!==''){manualClip=mixer.clipAction(gltf.animations[+clip.value]);manualClip.reset().play();}vida.pegarAlSuelo=!!manualClip;vida.activo.postura=!manualClip;};
      row(clipBox,'Clip',clip);manualSection.append(clipBox);
      const zero=document.createElement('div');zero.className='cl-buttons';button(zero,'Todo a cero',()=>{for(const [n,r,out] of sliders){r.value=0;out.textContent='0.00';if(n in manual)manual[n]=0;else vida.morph(n,0);}for(const s of Object.values(bonesRest))s.b.quaternion.copy(s.q);clip.value='';clip.onchange();});manualSection.append(zero);
      // ---- Físicas de personaje
      const phys=details('Físicas de personaje');
      const pnote=document.createElement('p');pnote.className='cl-note';pnote.textContent='Se guardan para este personaje. El pelo se reconoce por su color en la textura; la trenza es una cadena con colisiones dentro de una caja (metros, espacio del personaje).';phys.append(pnote);
      const body=document.createElement('input');body.type='checkbox';body.checked=!!physics.cuerpo;row(phys,'Colisiones del cuerpo',body);
      const caps=document.createElement('input');caps.type='checkbox';caps.checked=capsules;caps.onchange=()=>{capsules=caps.checked;vida.cuerpo?.depurar(scene);};row(phys,'Ver colisionadores',caps);
      const hair=document.createElement('input');hair.type='checkbox';hair.checked=!!physics.pelo;row(phys,'Pelo dinámico',hair);
      const color=document.createElement('input');color.type='color';const rgb=physics.pelo?.color||[31,75,175];color.value='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');row(phys,'Color del pelo',color);
      const tol=document.createElement('input');tol.type='number';tol.min=5;tol.max=160;tol.value=physics.pelo?.tolerancia??60;row(phys,'Tolerancia de color',tol);
      const braid=document.createElement('input');braid.type='checkbox';braid.checked=!!physics.pelo?.trenza;row(phys,'Trenza',braid);
      const box=physics.pelo?.trenza||{zMax:-.06,xMin:-.03,yTop:.83,yBot:.5,paso:.03,radio:.015},fields={};
      for(const [k,label] of [['zMax','Detrás de (z máx.)'],['xMin','Desde x'],['yTop','Altura arriba'],['yBot','Altura abajo'],['paso','Paso de la cadena'],['radio','Radio']]){const n=document.createElement('input');n.type='number';n.step=.005;n.value=box[k];fields[k]=n;row(phys,label,n);}
      const apply=document.createElement('div');apply.className='cl-buttons';
      button(apply,'Aplicar físicas',async()=>{
        physics.cuerpo=body.checked;
        physics.pelo=hair.checked?{color:color.value.slice(1).match(/../g).map(h=>parseInt(h,16)),tolerancia:+tol.value,...(braid.checked?{trenza:Object.fromEntries(Object.entries(fields).map(([k,n])=>[k,+n.value]))}:{})}:null;
        try{localStorage.setItem(PHYSICS_KEY+characterId,JSON.stringify(physics));}catch{}
        await build();api.onRebuild?.();say('Físicas aplicadas y guardadas para este personaje.');
      });
      button(apply,'Valores del perfil',async()=>{try{localStorage.setItem(PHYSICS_KEY+characterId,JSON.stringify({perfil:true}));}catch{}const profile=await physicsProfile(characterId);for(const k of Object.keys(physics))delete physics[k];Object.assign(physics,profile);await build();api.onRebuild?.();say('Físicas restauradas al perfil del personaje.');});
      phys.append(apply);
      return sections;
    }
  };
  return api;
}
