// 50 emociones y comportamientos · actuación conjunta de rostro (ARKit/Faceit) y cuerpo (Mixamo).
// Fuente de autoría compartida por los dos talleres. Sin UUID, índices de morph ni huesos del personaje:
// el rostro son curvas por nombre de canal y el cuerpo son direcciones y contactos que el motor
// (taller-animacion/src/core/acting.js) resuelve sobre las proporciones de cada personaje.
//
// Cómo está escrita cada actuación
// · Rostro: una lista de «actitudes» {t, in, pose}. El compilador añade lo que hace que una cara se
//   lea viva: las cejas y los ojos llegan antes que la boca, cada actitud se pasa un poco y se asienta,
//   se desgasta durante la pausa, los dos lados no llegan a la vez y los parpadeos caen en los cambios.
// · Cuerpo: poses clave con anticipación → acción → asentamiento; el motor añade arrastre por
//   articulación, respiración y el peso sobre los pies.
// · Las curvas guardan el aspecto a la intensidad de referencia (75 %). Al 100 % se exagera; por debajo
//   se suaviza sin perder los contactos de las manos ni los parpadeos.
export const INTENSITY_REFERENCE=.75;
const pair=(n,a,b=a)=>({[n+'Left']:a,[n+'Right']:b});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));

// ---------- Vocabulario facial (valores a la intensidad de referencia) ----------
/** Combina poses: gana el valor mayor de cada canal. */
const mix=(...poses)=>{const out={};for(const p of poses)for(const [n,v] of Object.entries(p))out[n]=Math.max(out[n]||0,v);return out;};
const scale=(pose,k)=>Object.fromEntries(Object.entries(pose).map(([n,v])=>[n,clamp(v*k)]));
const without=(pose,...names)=>Object.fromEntries(Object.entries(pose).filter(([n])=>!names.some(x=>n.startsWith(x))));
const look=(x=0,y=0)=>({...(x>0?{eyeLookOutLeft:x,eyeLookInRight:x}:x<0?{eyeLookInLeft:-x,eyeLookOutRight:-x}:{}),...(y>0?pair('eyeLookUp',y):y<0?pair('eyeLookDown',-y):{})});
// Alegría: comisuras + mejillas que empujan el párpado inferior (sonrisa de Duchenne) y cejas que se abren.
const smile=(s=1,open=0)=>({...pair('mouthSmile',.88*s,.83*s),...pair('cheekSquint',.6*s,.56*s),...pair('eyeSquint',.24*s),...pair('mouthDimple',.22*s),...pair('browOuterUp',.46*s,.4*s),browInnerUp:.42*s,
  ...(open?{jawOpen:.3*open,...pair('mouthUpperUp',.3*open),...pair('mouthLowerDown',.22*open),...pair('mouthStretch',.14*open)}:{})});
const laugh=(s=1)=>mix(smile(1.1*s,1.3*s),{...pair('eyeBlink',.62*s,.58*s),...pair('cheekSquint',.8*s),...pair('noseSneer',.18*s),browInnerUp:.3*s});
// Tristeza: cejas en oblicuo (interior arriba), párpado pesado, comisuras abajo y mentón que empuja el labio.
const sad=(s=1)=>({browInnerUp:.9*s,...pair('browDown',.16*s),...pair('mouthFrown',.75*s,.7*s),mouthShrugLower:.38*s,...pair('eyeBlink',.2*s),...pair('cheekSquint',.16*s),...pair('mouthPress',.14*s),...look(0,-.3*s)});
const cry=(s=1)=>mix(sad(s),{...pair('eyeSquint',.6*s),...pair('eyeBlink',.5*s),...pair('mouthStretch',.4*s),...pair('mouthLowerDown',.3*s),...pair('noseSneer',.26*s),jawOpen:.16*s,mouthShrugLower:.55*s});
// Enfado: ceño, párpado inferior tenso, nariz arrugada y boca apretada (o abierta enseñando dientes).
const angry=(s=1,open=0)=>({...pair('browDown',.9*s,.86*s),...pair('eyeSquint',.5*s),...pair('eyeWide',.2*s),...pair('noseSneer',.42*s,.36*s),...pair('mouthFrown',.4*s),jawForward:.2*s,
  ...(open?{jawOpen:.28*open,...pair('mouthUpperUp',.5*open),...pair('mouthLowerDown',.45*open),...pair('mouthStretch',.3*open),mouthFunnel:.12*open}:{...pair('mouthPress',.65*s),mouthShrugLower:.2*s,mouthRollLower:.15*s})});
// Miedo: cejas arriba y juntas, ojos muy abiertos, boca estirada hacia los lados.
const fear=(s=1)=>({browInnerUp:.95*s,...pair('browOuterUp',.5*s),...pair('browDown',.2*s),...pair('eyeWide',.95*s),...pair('mouthStretch',.7*s,.64*s),jawOpen:.26*s,...pair('mouthLowerDown',.34*s),...pair('mouthFrown',.26*s),...pair('mouthUpperUp',.1*s)});
// Sorpresa: todo se abre en vertical; la boca cae en «o», sin estirarse.
const surprise=(s=1)=>({browInnerUp:.8*s,...pair('browOuterUp',.95*s,.9*s),...pair('eyeWide',.9*s),jawOpen:.46*s,mouthFunnel:.34*s,...pair('mouthLowerDown',.1*s)});
// Desagrado: nariz arrugada que sube el labio, ceño y ojos entornados.
const disgust=(s=1)=>({...pair('noseSneer',.9*s,.7*s),...pair('mouthUpperUp',.6*s,.42*s),...pair('browDown',.62*s,.5*s),...pair('eyeSquint',.6*s),...pair('cheekSquint',.36*s),...pair('mouthFrown',.42*s),mouthShrugLower:.34*s,...pair('mouthLowerDown',.14*s)});
// Gestos asimétricos y de pensamiento.
const smirk=(s=1)=>({mouthSmileLeft:.62*s,mouthDimpleLeft:.4*s,cheekSquintLeft:.34*s,mouthLeft:.2*s,mouthPressRight:.18*s});
const doubt=(s=1)=>({browOuterUpLeft:.9*s,browInnerUp:.2*s,browDownRight:.62*s,eyeSquintRight:.42*s,mouthRight:.3*s,mouthPressLeft:.3*s,mouthPressRight:.4*s,mouthFrownRight:.2*s});
const ponder=(s=1)=>({...pair('browDown',.34*s,.2*s),browOuterUpLeft:.34*s,mouthPucker:.34*s,mouthLeft:.4*s,...pair('mouthPress',.26*s),...pair('eyeSquint',.2*s)});
const tired=(s=1)=>({...pair('eyeBlink',.5*s,.46*s),browInnerUp:.36*s,...pair('browDown',.12*s),...pair('mouthFrown',.22*s),mouthShrugLower:.1*s,jawOpen:.05*s,...look(0,-.2*s)});
const tense=(s=1)=>({...pair('mouthPress',.6*s),...pair('mouthStretch',.3*s),mouthRollLower:.3*s,mouthRollUpper:.2*s,browInnerUp:.5*s,...pair('browDown',.3*s),...pair('eyeWide',.25*s)});
const attentive=(s=1)=>({...pair('browOuterUp',.56*s,.48*s),browInnerUp:.5*s,...pair('eyeWide',.42*s),...pair('mouthSmile',.3*s,.27*s),...pair('cheekSquint',.14*s)});
export const FACE={smile,laugh,sad,cry,angry,fear,surprise,disgust,smirk,doubt,ponder,tired,tense,attentive,look,mix,scale,pair};

// ---------- Compilador del rostro ----------
const LEAD=n=>n.startsWith('eyeLook')?-.1:n.startsWith('brow')?-.05:n.startsWith('eye')?-.065:/^(cheek|nose)/.test(n)?-.02:n.startsWith('jaw')?.03:0;
const STEADY=n=>n.startsWith('eyeLook')||n.startsWith('eyeBlink');
const at=(keys,t)=>{if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const [a,b]=[keys[i-1],keys[i]];return a[1]+(b[1]-a[1])*(t-a[0])/(b[0]-a[0]||1);}return keys.at(-1)[1];};
function tidy(keys,D){
  keys.sort((a,b)=>a[0]-b[0]);const out=[[0,keys[0][0]<=0?keys[0][1]:0]];
  for(const [t,v] of keys){const time=Math.round(clamp(t,0,D)*1000)/1000,value=Math.round(clamp(v)*1000)/1000;if(time<=0||time>=D-.01)continue;if(time<=out.at(-1)[0]+.012){if(out.length>1)out[out.length-1]=[out.at(-1)[0],value];}else out.push([time,value]);}
  out.push([D,0]);return out;
}
/**
 * attitudes: [{t: llegada (s), in: transición (s), pose, ov: sobrepaso, drift: desgaste en la pausa}]
 * options.blinks: instantes de parpadeo; options.pulses: [{t0,t1,f,ph,ch:{canal:amplitud}}] para risa, sollozo o temblor.
 */
function faceTrack(D,attitudes,{blinks=[],pulses=[],out=.45,ov=.1}={}){
  const names=new Set(attitudes.flatMap(a=>Object.keys(a.pose)));for(const p of pulses)Object.keys(p.ch).forEach(n=>names.add(n));
  if(blinks.length){names.add('eyeBlinkLeft');names.add('eyeBlinkRight');}
  const channels={};
  for(const n of names){
    const shift=LEAD(n)+(n.endsWith('Right')?.015:0),steady=STEADY(n);let keys=[[0,0]],last=0,wear=1;
    for(const a of attitudes){
      const v=a.pose[n]||0,into=n.startsWith('eyeLook')?Math.min(a.in??.3,.09):a.in??.3,over=!steady&&v>last?(a.ov??ov):0,t=a.t+shift;
      keys.push([t-into,last*wear]);if(over)keys.push([t,clamp(v*(1+over))],[t+.2,v]);else keys.push([t,v]);
      last=v;wear=steady?1:a.drift??.93;
    }
    keys.push([D-out+shift,last*wear]);keys=tidy(keys,D);
    for(const p of pulses){
      const amp=p.ch[n];if(!amp)continue;
      const base=keys,beat=[];
      for(let k=0;;k++){const t=p.t0+(k+(p.ph||0))/p.f;if(t>p.t1)break;const fade=1-(p.decay||0)*(t-p.t0)/(p.t1-p.t0);beat.push([t,at(base,t)+amp*fade],[t+.5/p.f,at(base,t+.5/p.f)-amp*.45*fade]);}
      keys=tidy([...base.filter(([t])=>t<p.t0-.02||t>p.t1+.5/p.f+.02),...beat],D);
    }
    if(n.startsWith('eyeBlink'))for(const t of blinks){
      const side=n.endsWith('Right')?.012:0,base=keys;
      if(at(base,t)>.75)continue;
      keys=tidy([...base.filter(([k])=>k<t-.075||k>t+.17),[t-.07+side,at(base,t-.07)],[t+side,1],[t+.05+side,.92],[t+.16+side,at(base,t+.16)]],D);
    }
    if(keys.some(k=>k[1]>0))channels[n]=keys;
  }
  return channels;
}

// ---------- Vocabulario corporal ----------
// Vectores en el espacio del personaje con X hacia FUERA del propio brazo (se reflejan solos), Y arriba, Z delante.
// {u,f}: dirección de brazo y antebrazo. {to}: contacto de la mano con un punto medido del receptor;
// `off` en longitudes de mano, `with` = parte de la mano que toca. g:1 = cuelga con la gravedad.
export const ARM={
  loose:{u:[.2,-.97,-.08],f:[.12,-.84,.52],palm:[-.9,0,-.3],g:1},
  heavy:{u:[.1,-.99,.03],f:[.07,-.99,.1],palm:[-.5,0,-.85],g:1},
  back:{u:[.16,-.93,-.32],f:[.1,-.9,-.42],palm:[-.3,0,-.95],g:.6},
  fists:{u:[.36,-.92,-.12],f:[.3,-.9,.3],palm:[-.9,0,-.4],g:1},
  open:{u:[.26,-.95,.12],f:[.45,-.1,.88],palm:[-.3,.95,.05]},
  give:{u:[.2,-.9,.38],f:[.25,.12,.96],palm:[-.2,.97,.1]},
  shrug:{u:[.3,-.94,.12],f:[.52,.1,.85],palm:[-.1,.98,.15]},
  up:{u:[.6,.78,.02],f:[.22,.97,.1],palm:[-.2,0,.98]},
  high:{u:[.62,.36,.2],f:[.2,.96,.12],palm:[-.1,0,1]},
  wave:{u:[.72,-.42,.24],f:[.14,.97,.14],palm:[-.1,0,1]},
  pump:{u:[.3,-.72,.5],f:[.02,.82,.56],palm:[-.5,0,-.86]},
  cock:{u:[.34,-.8,.3],f:[.08,.55,.83],palm:[-.9,0,-.2]},
  jab:{u:[.22,-.42,.88],f:[.12,.12,.98],palm:[-.3,-.95,0]},
  aha:{u:[.32,-.62,.55],f:[.04,.96,.28],palm:[-.9,0,.3]},
  gun:{u:[.25,-.82,.42],f:[.18,.22,.96],palm:[-1,0,0]},
  thumb:{u:[.26,-.86,.42],f:[.02,.42,.9],palm:[-1,0,0]},
  no:{u:[.28,-.82,.5],f:[.1,.5,.86],palm:[0,-.05,1]},
  guard:{u:[.36,-.78,.5],f:[-.12,.82,.56],palm:[0,.15,.99]},
  stop:{u:[.3,-.52,.8],f:[.06,.6,.8],palm:[0,-.1,1]},
  point:{u:[.78,-.12,.6],f:[.8,.02,.6],palm:[0,-1,0]},
  stretch:{u:[.82,.3,-.1],f:[.55,.82,.15],palm:[0,0,1]},
  hips:{to:'waist',with:'palm',palm:[-1,0,0],fingers:[.1,-.25,.96],elbow:[1,-.05,-.5],off:[.05,0,.25]},
  chin:{to:'chin',with:'knuckles',palm:[.2,-.3,-.93],fingers:[-.8,.55,.25],elbow:[.35,-.9,.25],off:[0,-.22,.05]},
  mouth:{to:'mouth',with:'pads',palm:[0,0,-1],fingers:[-.78,.62,0],elbow:[.5,-.85,.2],off:[0,0,.12]},
  cheek:{to:'cheek',with:'palm',palm:[-.9,0,-.45],fingers:[0,1,-.1],elbow:[.25,-.95,.25],off:[.05,-.1,.05]},
  cover:{to:'eye',with:'palm',palm:[0,0,-1],fingers:[-.25,.96,0],elbow:[.4,-.9,.25],off:[-.1,.05,.1]},
  cover1:{to:'eyes',with:'palm',palm:[0,-.1,-1],fingers:[-.9,.42,0],elbow:[.5,-.85,.2],off:[.3,.1,.1]},
  brow:{to:'forehead',with:'palm',palm:[0,-.1,-1],fingers:[-.4,.92,0],elbow:[.35,-.9,.3],off:[0,0,.06]},
  eye:{to:'eye',with:'knuckles',palm:[.2,-.2,-.96],fingers:[-.85,.5,.15],elbow:[.45,-.88,.2],off:[0,-.15,.1]},
  ear:{to:'ear',with:'palm',palm:[-1,0,0],fingers:[0,.92,-.4],elbow:[.55,-.8,.25],off:[.28,-.1,.1]},
  nape:{to:'nape',with:'pads',palm:[-.2,0,.98],fingers:[-.95,-.2,-.1],elbow:[.75,.45,.45],off:[0,0,-.05]},
  scalp:{to:'scalp',with:'tips',palm:[-.75,-.65,0],fingers:[-.6,.6,-.5],elbow:[.9,.1,.4],off:[.1,.1,0]},
  heart:{to:'sternum',with:'palm',palm:[0,0,-1],fingers:[-.86,.5,0],elbow:[.75,-.62,-.1],off:[0,0,.04]},
  belly:{to:'belly',with:'palm',palm:[0,0,-1],fingers:[-.95,.2,0],elbow:[.8,-.5,-.15],off:[-.2,.15,.05]},
  thigh:{to:'thigh',with:'palm',palm:[0,-.3,-.95],fingers:[-.2,-.95,.2],elbow:[.8,-.2,-.5],off:[0,0,.06]},
  clasp:{to:'solar',with:'palm',palm:[-1,0,0],fingers:[-.15,.3,.94],elbow:[.6,-.78,-.1],off:[.04,0,.7]},
  low:{to:'belly',with:'palm',palm:[-1,0,0],fingers:[-.1,-.72,.68],elbow:[.7,-.7,-.15],off:[.04,-.7,.55]},
  delight:{to:'sternum',with:'palm',palm:[-1,0,0],fingers:[-.1,.85,.5],elbow:[.5,-.85,.05],off:[.05,.25,.55]},
  pray:{to:'sternum',with:'palm',palm:[-1,0,0],fingers:[0,.92,.4],elbow:[.6,-.78,0],off:[.03,-.35,.7]},
  clapHit:{to:'sternum',with:'palm',palm:[-1,0,0],fingers:[-.1,.6,.8],elbow:[.6,-.78,-.1],off:[.03,-.3,.95]},
  clapOpen:{to:'sternum',with:'palm',palm:[-.96,0,.25],fingers:[0,.6,.8],elbow:[.6,-.78,-.1],off:[.5,-.25,.9],free:true},
  work:{to:'belly',with:'tips',palm:[-.7,-.7,0],fingers:[-.2,-.15,.97],elbow:[.75,-.65,-.1],off:[.38,.35,1.3],free:true},
  shield:{to:'forehead',with:'back',palm:[0,.2,1],fingers:[-.82,.55,0],elbow:[.7,-.5,.5],off:[-.1,.3,1.1],free:true},
  hold:{to:'x:bicep',with:'palm',palm:[-.3,0,-.95],fingers:[-.95,.1,.3],elbow:[.2,-.95,.3],off:[.15,-.1,.1]},
  support:{to:'x:bicep',with:'palm',palm:[0,.9,-.4],fingers:[-.95,0,.3],elbow:[.4,-.9,.1],off:[0,-1.35,.45]},
  cross:{to:'x:bicep',with:'palm',palm:[-.15,-.1,-.98],fingers:[-.97,.2,.1],elbow:[.25,-.95,.2],off:[.2,-.2,.15]},
  cross2:{to:'x:bicep',with:'pads',palm:[-.2,0,-.97],fingers:[-.97,.1,.2],elbow:[.25,-.95,.2],off:[-.35,-.45,-.25]},
  lap:{to:'thigh',with:'palm',palm:[0,-.95,-.3],fingers:[-.25,-.2,.95],elbow:[.8,-.5,-.3],off:[0,.25,.1]},
  // Vocabulario de las variantes femeninas: puños recogidos cerca de la cara y del pecho, codos pegados.
  fistChest:{to:'chest',with:'knuckles',palm:[-.45,-.2,-.87],fingers:[-.55,.78,.2],elbow:[.35,-.92,.1],off:[.62,-.25,.85],free:true},
  fistCheek:{to:'chin',with:'knuckles',palm:[-.55,0,-.83],fingers:[-.25,.93,.25],elbow:[.2,-.97,.1],off:[1.05,-.15,.55],free:true},
  fistUp:{u:[.5,-.64,.3],f:[.06,.96,.25],palm:[-.7,0,-.7]},
  fistLow:{to:'belly',with:'knuckles',palm:[-.6,-.3,-.75],fingers:[-.35,.45,.82],elbow:[.55,-.78,-.2],off:[.95,-.25,1.05],free:true},
  waveF:{u:[.3,-.86,.36],f:[.16,.96,.2],palm:[-.1,0,1]},
  peace:{to:'eye',with:'palm',palm:[-.1,0,1],fingers:[-.25,.96,0],elbow:[.75,-.62,.1],off:[1,.05,.75],free:true},
  // Vocabulario de las variantes masculinas: gestos amplios, codos abiertos, apoyos firmes.
  // hang: cae con la gravedad y con la separación medida en el propio personaje (no atraviesa su cadera).
  hang:{idle:true,g:1},
  // Puños en la cintura con los nudillos apoyados y los codos abiertos (en jarras).
  hipsFist:{to:'waist',with:'knuckles',palm:[.1,-.3,-.95],fingers:[-.95,-.25,.15],elbow:[1,0,-.3],off:[.08,0,0]},
  wide:{u:[.82,.3,.3],f:[.55,.72,.42],palm:[0,.3,.95]},
  gather:{u:[.22,-.95,.18],f:[.2,-.45,.87],palm:[-.85,.2,-.45]},
  // Pellizco del puente de la nariz (pulgar e índice), codo abajo.
  pinch:{to:'nose',with:'index',palm:[.1,-.55,-.83],fingers:[-.45,.85,.25],elbow:[.3,-.95,.15],off:[0,.15,.12]},
  // Mano que tira del cuello de la camisa (los dedos enganchados bajo la barbilla).
  collar:{to:'throat',with:'pads',palm:[.2,0,-.98],fingers:[-.9,.1,.42],elbow:[.6,-.8,.1],off:[.25,-.1,.15]},
  // Mano en la nuca con el codo adelante y bajo (rascarse la nuca sin levantar el brazo por encima de la cabeza).
  napeLow:{to:'nape',with:'pads',palm:[-.2,-.1,.97],fingers:[-.95,-.15,-.2],elbow:[.55,-.35,.75],off:[.1,-.1,-.05]},
  // Palma apoyada en el muslo, por encima de la rodilla (doblado hacia delante).
  knee:{to:'thigh',with:'palm',palm:[0,-.95,-.3],fingers:[-.2,-.3,.93],elbow:[.75,-.3,-.6],off:[0,.2,.25]},
  victory:{u:[.55,.75,.2],f:[.25,.95,.12],palm:[-.2,0,.98]},
  // Tirón de «¡sí!»: codo atrás pegado al costado y puño delante a la altura de la cintura.
  yes:{u:[.32,-.9,-.28],f:[.1,.55,.83],palm:[-.95,0,-.3]},
  cockFist:{u:[.45,-.55,.35],f:[.12,.9,.42],palm:[-.6,0,.8]},
  // Puñetazo suave en el pecho, del lado propio.
  thump:{to:'heart',with:'knuckles',palm:[-.2,-.5,-.85],fingers:[-.5,.6,-.6],elbow:[.7,-.6,.2],off:[0,0,.05]},
  // Pulgar que se señala el pecho («yo»), del lado propio.
  thumbChest:{to:'heart',with:'thumb',palm:[-.2,-.95,.2],fingers:[.1,.2,.97],elbow:[.8,-.55,.1],off:[0,0,.1]},
  // Puño apretado contra la boca: aguantarse el llanto (o la risa).
  fistMouth:{to:'mouth',with:'knuckles',palm:[-.2,-.95,-.2],fingers:[-.5,.3,-.8],elbow:[.3,-.95,.1],off:[0,-.05,.12]},
  // Manos en la barriga, cada una en su lado (las dos al centro se solapan): carcajada «de Papá Noel».
  bellyLaugh:{to:'belly',with:'palm',palm:[-.15,-.05,-.99],fingers:[-.55,-.8,.15],elbow:[.9,-.35,-.25],off:[.62,.25,.04]},
  // Mano abierta tapando los ojos (una sola mano: dos manos en el mismo sitio se funden).
  eyesPalm:{to:'eyes',with:'palm',palm:[0,-.05,-1],fingers:[-.97,.2,0],elbow:[.45,-.88,.15],off:[.4,-.22,.14]}
};
const GUN={c:[-.1,0,1,1,1],s:0,ta:-1};
const arm=(name,extra={})=>({...ARM[name],...extra});
const key=(t,pose,ease='io',ov=0)=>({t,ease,ov,...pose});
const ADD=['torso','head','hips','hipsT','spine','chest','upperChest','neck','skull'];
/** Suma partes de una pose: los giros de tronco, cabeza y cadera se acumulan; el resto, gana la última. */
function P(...parts){const out={};for(const p of parts)for(const [k,v] of Object.entries(p))out[k]=ADD.includes(k)&&out[k]?out[k].map((x,i)=>x+(v[i]||0)):v;return out;}
// Peso sobre una pierna: la cadera se desplaza y sube de ese lado, los hombros compensan y la otra pierna descansa.
const onL=(a=1)=>({hipsT:[.034*a,-.008*a,0],hips:[0,0,4*a],torso:[0,0,-6*a],head:[0,0,2*a],footR:{heel:7*a,yaw:5*a}});
const onR=(a=1)=>({hipsT:[-.034*a,-.008*a,0],hips:[0,0,-4*a],torso:[0,0,6*a],head:[0,0,-2*a],footL:{heel:7*a,yaw:5*a}});
const A=(t,pose,inn=.3,o={})=>({t,in:inn,pose,...o});
const lids=v=>pair('eyeBlink',v,v*.96);
const beat=(f,t0,t1,extra={})=>({f,t0,t1,shape:'pulse',...extra});

// ---------- Actuaciones ----------
function acting(n,name,duration,face,body,options={}){
  return {id:'behavior-'+String(n).padStart(2,'0'),name,duration,peak:.45,...options,face,body};
}
const SEAT={hipsT:[0,-.4,-.1],feet:{off:[.02,0,.3]},torso:[5,0,0],head:[-3,0,0],arms:ARM.lap,hands:'soft'};
function claps(t0,n,dt,frame,hit=ARM.clapHit,open=ARM.clapOpen){
  const keys=[];
  for(let i=0;i<n;i++){
    const wide=i===0?1:.8+.2*(i%2);
    keys.push(key(t0+i*dt-dt*.52,P(frame(i,0),{armL:arm('clapOpen',{...open,off:[open.off[0]*.6*wide,open.off[1],open.off[2]]}),armR:arm('clapOpen',{...open,off:[open.off[0]*wide,open.off[1]+.05,open.off[2]]}),hands:'open'}),'o'),
      key(t0+i*dt,P(frame(i,1),{arms:hit,hands:'soft'}),'i'));
  }
  return keys;
}
/** Palmadas con el golpe sostenido un instante: con el arrastre por articulación, hombro, codo y mano llegan
 *  al golpe en momentos distintos; sosteniéndolo, las palmas llegan a encontrarse. */
function clapsHeld(t0,n,dt,frame,hold=.08,hit=ARM.clapHit,open=ARM.clapOpen){
  const keys=[];
  for(let i=0;i<n;i++){
    const t=t0+i*dt;
    keys.push(key(t-dt*.42,P(frame(i,0),{armL:arm('clapOpen',{...open,off:[open.off[0]*.65,open.off[1],open.off[2]]}),armR:arm('clapOpen',{...open,off:[open.off[0]*.8,open.off[1]+.05,open.off[2]]}),hands:'open'}),i?'io':'o'),
      key(t,P(frame(i,1),{arms:hit,hands:'flat'}),'i'),key(t+hold,P(frame(i,1),{arms:hit,hands:'flat'})));
  }
  return keys;
}
const DANCE_L=P(onL(1.3),{torso:[3,11,0],head:[-2,-9,-5],hipsT:[0,-.03,0],armR:{u:[.32,-.72,.48],f:[.05,.78,.58],palm:[-.6,0,-.8]},armL:{u:[.34,-.9,-.12],f:[.45,-.45,.7],palm:[-.9,0,-.3]},hands:'loose',sh:[4,0]});
const DANCE_R=P(onR(1.3),{torso:[3,-11,0],head:[-2,9,5],hipsT:[0,-.03,0],armL:{u:[.32,-.72,.48],f:[.05,.78,.58],palm:[-.6,0,-.8]},armR:{u:[.34,-.9,-.12],f:[.45,-.45,.7],palm:[-.9,0,-.3]},hands:'loose',sh:[4,0]});
const WORRY=mix(without(sad(.75),'eyeLook','mouthFrown','mouthShrug'),tense(.6));
const NERVOUS=mix({...pair('mouthSmile',.42,.3),...pair('mouthStretch',.5),...pair('mouthPress',.3),browInnerUp:.75,...pair('browOuterUp',.2)},pair('eyeWide',.22));
const HOLDBACK=mix(sad(.85),{...pair('mouthPress',.55),mouthRollLower:.3},pair('eyeSquint',.3));
const RESOLVE={...pair('browDown',.62,.56),...pair('eyeSquint',.42),...pair('mouthPress',.46),jawForward:.3,...pair('mouthDimple',.25),...pair('noseSneer',.1)};
const ASHAMED={...pair('mouthStretch',.55),...pair('mouthSmile',.36),...pair('mouthPress',.35),browInnerUp:.88,...pair('cheekSquint',.4)};
const SHY=mix(smile(.5),{browInnerUp:.72});
const SORRY=mix(without(sad(.7),'eyeLook','mouthFrown'),{...pair('mouthPress',.4),...pair('mouthSmile',.15),...pair('mouthFrown',.25)});
const SHRUG={mouthShrugLower:.85,...pair('mouthFrown',.55),...pair('browOuterUp',.85,.8),browInnerUp:.6,...pair('mouthPress',.2)};
const FOCUS={...pair('browDown',.7,.62),...pair('eyeSquint',.55),...pair('mouthPress',.45),mouthRollLower:.35,mouthPucker:.15};
const LISTEN=h=>P(onL(.6),{torso:[7,-4,0],head:h,arms:ARM.low,hands:'cup'});
const PROUD=h=>P(onR(1),{torso:[-10,-6,0],chest:[-4,0,0],head:h,arms:ARM.hips,hands:'soft',sh:[-3,-6]});
const ARGUE=(armR,t,h,z)=>({torso:t,head:h,hipsT:[0,-.018,z],armR,handR:'point',armL:ARM.fists,handL:'fist',footL:{off:[0,0,.08]},sh:[5,0]});
const FIRM=h=>({torso:[3,-6,0],head:h,hipsT:[0,-.02,0],footL:{off:[.05,0,.03],yaw:6},armR:ARM.pump,handR:'fist',armL:ARM.fists,handL:'fist',sh:[-2,0]});
const PHONE=(side,t,h,extra={})=>P(side,{torso:t,head:h,armR:ARM.ear,handR:'hold',armL:ARM.belly,handL:'soft',...extra});
const BOW=(t,h,z=0)=>({torso:[t,0,0],head:h,hipsT:[0,-.4*z,-z],arms:ARM.pray,hands:'flat',sh:[6,5]});

export const ACTINGS=Object.freeze([
  acting(1,'Sonreír suavemente',3.4,
    {attitudes:[A(.55,mix(smile(.45),look(0,-.15)),.4),A(1.25,smile(.85),.5),A(2.4,smile(.7),.5)],blinks:[.3,2.05]},
    {keys:[key(.4,{torso:[-2,0,0],head:[-2,0,0]}),
      key(1.2,P(onL(.8),{torso:[1,4,0],head:[4,-5,7],sh:[-2,0],armR:ARM.loose}),'io',.06),
      key(2.5,P(onL(.9),{torso:[0,5,0],head:[3,-6,8],sh:[-2,0],armR:ARM.loose}))]}),
  acting(2,'Mostrar alegría',3.6,
    {attitudes:[A(.3,mix(surprise(.45),smile(.4)),.18),A(.75,smile(1,1),.28,{ov:.12}),A(2.2,smile(.9,.45),.5),A(2.9,smile(.6),.4)],blinks:[.14,2]},
    {keys:[key(.3,{hipsT:[0,-.035,0],torso:[6,0,0],head:[3,0,0],arms:ARM.loose}),
      key(.72,{hipsT:[0,.012,0],torso:[-6,0,0],head:[-7,0,6],arms:ARM.delight,hands:'cup',sh:[8,0],feet:{heel:16}},'o',.12),
      key(1.2,{hipsT:[0,-.012,0],torso:[-2,3,0],head:[-2,0,7],arms:ARM.delight,hands:'cup',sh:[4,0]}),
      key(1.62,{hipsT:[0,.006,0],torso:[-5,-3,0],head:[-5,0,-5],arms:ARM.delight,hands:'cup',sh:[7,0],feet:{heel:10}},'io',.08),
      key(2.4,P(onR(.6),{torso:[-1,0,0],head:[0,0,-4],arms:ARM.clasp,hands:'cup'})),
      key(3,{arms:ARM.loose})]},{peak:.2}),
  acting(3,'Celebrar con entusiasmo',3.8,
    {attitudes:[A(.28,mix(surprise(.5),smile(.3)),.2),A(.75,laugh(.9),.26,{ov:.12}),A(2.2,smile(1,1),.5),A(3,smile(.7),.5)],blinks:[.16,2.5]},
    {keys:[key(.3,{hipsT:[0,-.07,0],torso:[9,0,0],head:[6,0,0],arms:arm('pump',{u:[.3,-.9,.1],f:[.1,-.2,.95]}),hands:'fist'}),
      key(.78,{hipsT:[0,.02,0],torso:[-9,0,0],head:[-10,0,0],arms:ARM.up,hands:'splay',feet:{heel:16}},'o',.16),
      key(1.25,{hipsT:[0,-.04,0],torso:[-3,0,0],head:[-4,0,0],arms:arm('up',{u:[.55,.7,.1],f:[.3,.93,.15]}),hands:'open'}),
      key(1.75,{hipsT:[0,.012,0],torso:[-8,0,0],head:[-8,0,0],arms:ARM.up,hands:'splay',feet:{heel:12}},'io',.1),
      key(2.4,{hipsT:[0,-.02,0],torso:[-2,4,0],head:[-2,-4,3],armR:ARM.pump,handR:'fist',armL:ARM.loose}),
      key(3.1,{torso:[-2,0,0],head:[0,0,2]})]},{peak:.2}),
  acting(4,'Reír brevemente',2.9,
    {attitudes:[A(.28,smile(.6,.3),.2),A(.6,laugh(.8),.22,{ov:.08}),A(1.75,smile(.95,.5),.35),A(2.3,smile(.6),.35)],pulses:[{t0:.62,t1:1.5,f:4.6,decay:.5,ch:{jawOpen:.16,...pair('mouthUpperUp',.08)}}],blinks:[1.95]},
    {keys:[key(.3,{torso:[-5,0,0],head:[-8,0,0],sh:[4,0],arms:ARM.loose}),
      key(.62,{torso:[7,0,0],head:[6,0,4],sh:[6,0],hipsT:[0,-.015,0],armR:ARM.belly,handR:'soft',armL:ARM.loose},'o',.08),
      key(1.5,{torso:[5,3,0],head:[3,-3,5],sh:[3,0],hipsT:[0,-.01,0],armR:ARM.belly,handR:'soft',armL:ARM.loose}),
      key(2.1,P(onL(.5),{torso:[-1,0,0],head:[0,0,5],armR:ARM.loose}))],
     layers:[{on:'torso',v:[3,0,0],...beat(4.6,.62,1.55,{decay:.6})},{on:'sh',v:[5,0],...beat(4.6,.62,1.55,{decay:.6})},{on:'head',v:[-3,0,0],...beat(4.6,.62,1.55,{decay:.6,lag:.06})}]}),
  acting(5,'Reír a carcajadas',5,
    {attitudes:[A(.3,smile(.8,.6),.22),A(.75,laugh(1.05),.3,{ov:.08}),A(3.35,mix(smile(1,.8),{browInnerUp:.5}),.4),A(4.2,smile(.65,.2),.45)],pulses:[{t0:.8,t1:3,f:5,decay:.35,ch:{jawOpen:.2,...pair('mouthUpperUp',.1),...pair('mouthStretch',.08)}}],blinks:[3.75]},
    {keys:[key(.35,{torso:[-7,0,0],head:[-12,0,0],sh:[6,0],arms:ARM.loose,hands:'open'}),
      key(.85,{torso:[-12,0,0],head:[-20,0,3],sh:[8,0],hipsT:[0,.008,0],arms:arm('open',{u:[.3,-.93,-.05],f:[.5,-.5,.6]}),hands:'open'},'o',.08),
      key(1.55,{torso:[38,4,0],head:[6,0,0],hipsT:[0,-.085,-.06],armR:ARM.belly,handR:'soft',armL:ARM.thigh,handL:'soft',feet:{knee:.06}},'io',.05),
      key(2.3,{torso:[30,-5,0],head:[10,4,0],hipsT:[0,-.07,-.05],armR:ARM.belly,handR:'soft',armL:ARM.thigh,handL:'soft',feet:{knee:.06}}),
      key(2.95,{torso:[36,3,0],head:[5,-3,0],hipsT:[0,-.08,-.06],armR:ARM.belly,handR:'soft',armL:ARM.thigh,handL:'soft',feet:{knee:.06}}),
      key(3.6,{torso:[2,0,0],head:[-5,0,5],hipsT:[0,-.01,0],armR:ARM.eye,handR:'loose',armL:ARM.loose}),
      key(4.25,P(onL(.5),{head:[0,0,4],armR:ARM.loose}))],
     layers:[{on:'torso',v:[3.5,0,0],...beat(5,.8,3.05,{decay:.25})},{on:'sh',v:[6,0],...beat(5,.8,3.05,{decay:.25})},{on:'hipsT',v:[0,-.008,0],...beat(5,.8,3.05,{decay:.25})},{on:'head',v:[-3,0,0],...beat(5,.8,3.05,{decay:.25,lag:.06})}]},{peak:.4}),
  acting(6,'Aplaudir de pie',3.8,
    {attitudes:[A(.4,mix(smile(.9,.5),attentive(.6)),.3),A(2.9,smile(.8,.2),.4)],blinks:[.25,1.4,2.6]},
    {keys:[...claps(.75,8,.28,(i,hit)=>({torso:[-2+hit,i%4<2?2:-2,0],head:[-3+hit*2,0,i%4<2?4:-3],hipsT:[0,-.006*hit,0],sh:[3,0]})),
      key(3.25,{torso:[-1,0,0],head:[0,0,3],arms:ARM.clasp,hands:'cup'})],drag:.3}),
  acting(7,'Aplaudir sentado',3.8,
    {attitudes:[A(.4,mix(smile(.75,.3),attentive(.5)),.3),A(2.9,smile(.65),.4)],blinks:[.25,1.5,2.7]},
    {base:SEAT,keys:[...claps(.8,7,.3,(i,hit)=>P(SEAT,{torso:[1+hit,0,0],head:[-1+hit*2,0,i%4<2?3:-3],sh:[2,0]}),arm('clapHit',{to:'solar',off:[.03,.1,.9]}),arm('clapOpen',{to:'solar',off:[.42,.15,.85]})),
      key(3.2,P(SEAT,{head:[0,0,2]}))],drag:.3},{seated:true,requires:['chair']}),
  acting(8,'Bailar alegremente',4.8,
    {attitudes:[A(.4,smile(.9,.5),.3),A(1.4,mix(smile(1,.7),lids(.5),look(.3,0)),.3),A(2.3,mix(smile(1,.5),look(-.3,0)),.3),A(3.2,mix(laugh(.7),look(.2,0)),.3),A(4.05,smile(1,.8),.25)],blinks:[.25,1.85,2.8]},
    {keys:[key(.3,{hipsT:[0,-.035,0],torso:[4,0,0],arms:ARM.loose,hands:'loose'}),
      key(.6,DANCE_L,'o',.1),key(1.05,DANCE_R,'io',.08),key(1.5,DANCE_L,'io',.08),key(1.95,DANCE_R,'io',.08),key(2.4,DANCE_L,'io',.08),key(2.85,DANCE_R,'io',.08),key(3.3,DANCE_L,'io',.08),
      key(3.6,{hipsT:[0,-.05,0],torso:[8,0,0],head:[5,0,0],arms:arm('pump',{u:[.3,-.9,.2],f:[.1,.2,.95]}),hands:'fist'}),
      key(4.02,P(onR(1.2),{torso:[-6,-6,0],head:[-6,8,-5],armR:ARM.up,handR:'splay',armL:ARM.hips,handL:'soft',feet:{heel:0}}),'o',.14),
      key(4.35,P(onR(1.1),{torso:[-5,-5,0],head:[-5,7,-4],armR:ARM.up,handR:'open',armL:ARM.hips,handL:'soft'}))],
     layers:[{on:'hipsT',v:[0,.022,0],f:2.222,ph:.42,shape:'pulse',t0:.5,t1:3.45,in:.2,out:.2}],drag:.75,breath:0},{peak:.33}),
  acting(9,'Mostrar alivio',4.4,
    {attitudes:[A(.5,mix(tense(.7),lids(.9)),.35),A(1.35,{mouthFunnel:.5,mouthPucker:.35,cheekPuff:.55,...lids(1),browInnerUp:.6,jawOpen:.12},.45,{ov:0}),A(2.5,mix(smile(.6),lids(.3)),.6),A(3.4,smile(.5),.4)],blinks:[3]},
    {keys:[key(.55,{torso:[-6,0,0],head:[-7,0,0],sh:[12,0],armR:ARM.heart,handR:'soft',hipsT:[0,.008,0]}),
      key(1.6,{torso:[10,0,0],head:[12,0,3],sh:[-5,4],armR:ARM.heart,handR:'soft',hipsT:[0,-.035,0]}),
      key(2.6,P(onL(.6),{torso:[3,0,0],head:[2,0,6],armR:ARM.heart,handR:'soft'})),
      key(3.5,P(onL(.5),{armR:ARM.loose,head:[0,0,3]}))],breath:0},{peak:.36}),
  acting(10,'Mostrar orgullo',4.2,
    {attitudes:[A(.5,smile(.3),.3),A(1,mix(smirk(.9),smile(.45),lids(.28),pair('browOuterUp',.5,.62)),.35),A(2.9,mix(smirk(.7),smile(.5),lids(.2)),.4)],blinks:[.35,2.5]},
    {keys:[key(.4,{hipsT:[0,-.02,0],torso:[4,0,0],head:[4,0,0],arms:ARM.loose}),
      key(1,P(onR(.9),{torso:[-9,-5,0],chest:[-4,0,0],head:[-9,10,-3],arms:ARM.hips,hands:'soft',sh:[-3,-6]}),'o',.1),
      key(2.2,PROUD([-7,12,-4])),key(2.6,PROUD([-1,12,-4])),key(3,PROUD([-8,10,-4])),key(3.6,{arms:ARM.loose})]},{peak:.3}),
  acting(11,'Entristecerse',4.4,
    {attitudes:[A(.6,sad(.5),.45),A(1.7,sad(1),.8),A(3.3,sad(.85),.5)],blinks:[1,2.7],out:.6},
    {keys:[key(.5,{torso:[-2,0,0],head:[-1,0,0]}),
      key(1.8,{torso:[13,0,0],head:[17,-7,4],sh:[-7,9],hipsT:[0,-.022,-.012],arms:ARM.heavy}),
      key(3.3,{torso:[14,-2,0],head:[19,-9,5],sh:[-8,10],hipsT:[0,-.026,-.012],arms:ARM.heavy})],life:.7}),
  acting(12,'Mostrar decepción',4,
    {attitudes:[A(.3,attentive(.8),.22),A(.95,mix(sad(.6),pair('mouthPress',.4),look(0,-.4)),.35),A(1.6,mix(sad(.5),lids(.9),pair('mouthPress',.5)),.3),A(2.3,mix(without(sad(.6),'eyeLook'),doubt(.3),look(-.5,-.3)),.4),A(3.2,sad(.4),.4)],blinks:[.7]},
    {keys:[key(.3,{torso:[3,0,0],head:[-4,0,0],armR:arm('open',{f:[.3,-.3,.9]}),handR:'open'}),
      key(.95,{torso:[9,0,0],head:[12,0,0],sh:[-6,5],hipsT:[0,-.015,0],armR:arm('open',{f:[.35,-.45,.82]}),handR:'open'}),
      key(1.35,{torso:[10,0,0],head:[13,0,0],sh:[-7,5],hipsT:[0,-.018,0]},'i',.25),
      key(2.3,{torso:[8,-5,0],head:[10,-16,4],sh:[-6,5],hipsT:[0,-.015,0]}),
      key(3.2,{torso:[5,-3,0],head:[7,-10,3],sh:[-4,3]})]}),
  acting(13,'Llorar contenido',4.8,
    {attitudes:[A(.8,HOLDBACK,.6),A(2.25,mix(cry(.55),{browInnerUp:.95}),.3),A(2.9,HOLDBACK,.4),A(3.9,sad(.6),.4)],pulses:[{t0:1,t1:2.1,f:6.5,ch:{mouthShrugLower:.12}},{t0:3,t1:3.8,f:6.5,ch:{mouthShrugLower:.1}}],blinks:[1.25,1.75,3.1,3.5]},
    {keys:[key(1,{torso:[6,0,0],head:[12,9,-3],sh:[5,5],armR:ARM.hold,handR:'cup'}),
      key(2,{torso:[7,2,0],head:[13,10,-3],sh:[7,5],armR:ARM.hold,handR:'cup'}),
      key(2.45,{torso:[8,0,0],head:[10,4,0],sh:[6,5],armR:ARM.eye,handR:'loose'}),
      key(2.95,{torso:[8,0,0],head:[11,2,0],sh:[6,5],armR:arm('eye',{off:[.25,-.15,.1]}),handR:'loose'}),
      key(3.5,{torso:[7,2,0],head:[13,8,-2],sh:[5,5],armR:ARM.hold,handR:'cup'}),
      key(4.2,{torso:[4,0,0],head:[8,4,0]})],
     layers:[{on:'sh',v:[6,0],...beat(2.2,1.4,1.86)},{on:'head',v:[-3,0,0],...beat(2.2,1.4,1.86)},{on:'sh',v:[6,0],...beat(2.2,3.2,3.66)},{on:'head',v:[-3,0,0],...beat(2.2,3.2,3.66)}]}),
  acting(14,'Sollozar',5.2,
    {attitudes:[A(.5,cry(.7),.35),A(1.15,mix(cry(1),lids(.9)),.4),A(3.9,cry(.7),.4),A(4.6,sad(.6),.4)],pulses:[{t0:1.2,t1:3.7,f:2.7,ch:{jawOpen:.14,...pair('mouthStretch',.14),mouthShrugLower:.12}}]},
    {keys:[key(.5,{torso:[6,0,0],head:[8,0,0],sh:[8,4],arms:ARM.guard,hands:'soft'}),
      key(1.15,{torso:[20,0,0],head:[18,0,0],sh:[12,8],hipsT:[0,-.05,-.02],arms:ARM.cover,hands:'soft',feet:{knee:.03}}),
      key(2.4,{torso:[24,3,0],head:[20,0,2],sh:[13,8],hipsT:[0,-.06,-.02],arms:ARM.cover,hands:'soft',feet:{knee:.03}}),
      key(3.7,{torso:[20,-3,0],head:[18,0,-2],sh:[12,8],hipsT:[0,-.05,-.02],arms:ARM.cover,hands:'soft',feet:{knee:.03}}),
      key(4.4,{torso:[10,0,0],head:[12,0,0],sh:[6,4],arms:ARM.clasp,hands:'cup'})],
     layers:[{on:'torso',v:[4.5,0,0],...beat(2.7,1.2,3.75)},{on:'sh',v:[7,0],...beat(2.7,1.2,3.75)},{on:'hipsT',v:[0,-.008,0],...beat(2.7,1.2,3.75)}],breath:0}),
  acting(15,'Mostrar melancolía',5.2,
    {attitudes:[A(1,mix(without(sad(.5),'eyeLook'),pair('mouthSmile',.22,.18),look(-.55,.25)),.7),A(3.1,mix(without(sad(.55),'eyeLook'),pair('mouthSmile',.3,.26),look(-.2,-.4),lids(.3)),.6),A(4.2,sad(.35),.5)],blinks:[.6,2.4,3.4]},
    {keys:[key(1.2,P(onR(.9),{torso:[3,-7,0],head:[-3,-20,5],armL:ARM.hold,handL:'cup',sh:[-3,3]})),
      key(2.6,P(onR(1),{torso:[4,-8,0],head:[-1,-22,7],armL:ARM.hold,handL:'cup',sh:[-4,3]})),
      key(3.4,P(onR(1),{torso:[6,-5,0],head:[10,-10,5],armL:ARM.hold,handL:'cup',sh:[-5,4]})),
      key(4.4,{torso:[3,0,0],head:[5,-4,2]})]}),
  acting(16,'Mostrar preocupación',4.8,
    {attitudes:[A(.7,mix(WORRY,look(.5,0)),.45),A(1.9,mix(WORRY,look(-.5,-.1),{mouthRollLower:.5}),.4),A(2.9,mix(WORRY,look(0,-.45)),.4),A(3.9,scale(WORRY,.5),.4)],blinks:[1.3,2.4,3.3]},
    {keys:[key(.8,{torso:[5,6,0],head:[4,12,0],sh:[7,6],arms:ARM.clasp,hands:'cup'}),
      key(1.9,P(onL(.7),{torso:[6,-7,0],head:[5,-14,2],sh:[8,6],arms:ARM.clasp,hands:'cup'})),
      key(2.9,P(onR(.5),{torso:[8,0,0],head:[12,0,3],sh:[8,7],arms:arm('clasp',{off:[.04,.3,.6]}),hands:'cup'})),
      key(4,{torso:[3,0,0],head:[4,0,0],arms:ARM.loose})],
     layers:[{on:'hand',v:[10,0,6],f:1.3,t0:.9,t1:3.8,in:.3,out:.3}]}),
  acting(17,'Mostrar nerviosismo',4.6,
    {attitudes:[A(.6,mix(NERVOUS,look(.5,0)),.3),A(1.25,mix(NERVOUS,look(-.5,-.2)),.3),A(1.9,mix(scale(NERVOUS,1.1),look(.4,.2)),.3),A(2.6,mix(NERVOUS,look(-.3,0)),.3),A(3.2,mix(NERVOUS,look(0,-.35)),.3),A(3.9,scale(NERVOUS,.5),.3)],blinks:[.45,1.45,2.25,3.05,3.6]},
    {keys:[key(.7,P(onL(.9),{torso:[4,-5,0],head:[8,-10,-4],sh:[9,3],armR:ARM.nape,handR:'soft'}),'io',.05),
      key(1.6,P(onR(.9),{torso:[3,5,0],head:[6,9,3],sh:[9,3],armR:ARM.nape,handR:'soft'})),
      key(2.5,P(onL(.8),{torso:[5,-4,0],head:[9,-7,-3],sh:[10,3],armR:ARM.nape,handR:'soft'})),
      key(3.3,P(onR(.5),{torso:[3,2,0],head:[6,4,0],sh:[6,2],armR:ARM.nape,handR:'soft'})),
      key(3.9,{torso:[1,0,0],head:[2,0,0]})],
     layers:[{on:'lowerArmR',v:[0,6,0],f:2.2,t0:.9,t1:3.3},{on:'handL',v:[0,0,8],f:3.1,t0:.8,t1:3.6}]}),
  acting(18,'Mostrar temor',4.2,
    {attitudes:[A(.3,surprise(.5),.15),A(.75,fear(.95),.3),A(3,fear(.8),.4),A(3.6,fear(.4),.3)],pulses:[{t0:1,t1:2.9,f:8,ch:{jawOpen:.04,...pair('mouthStretch',.05)}}],blinks:[1.6]},
    {keys:[key(.25,{torso:[-3,0,0],head:[-3,0,0],sh:[8,0]},'o'),
      key(.75,{footR:{off:[.02,0,-.2]},hipsT:[-.01,-.045,-.075],torso:[-9,-9,0],head:[9,11,0],sh:[14,5],arms:ARM.guard,hands:'claw'},'o',.1),
      key(2,{footR:{off:[.02,0,-.2]},hipsT:[-.012,-.055,-.085],torso:[-10,-11,0],head:[10,13,0],sh:[15,5],arms:arm('guard',{u:[.34,-.82,.42]}),hands:'claw'}),
      key(3.1,{footR:{off:[.02,0,-.2]},hipsT:[-.01,-.04,-.07],torso:[-7,-8,0],head:[7,9,0],sh:[11,4],arms:ARM.guard,hands:'soft'}),
      key(3.75,{torso:[-2,0,0],sh:[4,0]})],
     layers:[{on:'lowerArm',v:[0,1.6,0],f:9,t0:.9,t1:3},{on:'torso',v:[.5,0,0],f:9,t0:.9,t1:3}]},{peak:.3}),
  acting(19,'Sobresaltarse',2,
    {attitudes:[A(.14,mix(surprise(1),fear(.5)),.08,{ov:0}),A(.6,fear(.55),.3),A(1.2,mix(tense(.4),{mouthFunnel:.3,mouthPucker:.2}),.35),A(1.6,smile(.25),.3)],blinks:[.5,1.25],out:.3},
    {keys:[key(.2,{hipsT:[0,.03,-.03],torso:[-12,0,0],head:[-9,0,0],sh:[22,0],arms:arm('guard',{u:[.6,-.6,.35],f:[.2,.85,.45]}),hands:'splay',feet:{heel:14}},'o',.2),
      key(.62,{hipsT:[0,-.03,-.02],torso:[-4,0,0],head:[2,0,0],sh:[10,0],armR:ARM.heart,handR:'soft',armL:ARM.loose}),
      key(1.25,{hipsT:[0,-.012,0],torso:[5,0,0],head:[6,0,3],sh:[-2,2],armR:ARM.heart,handR:'soft'}),
      key(1.65,{armR:ARM.loose,head:[1,0,2]})],drag:.6},{peak:.1}),
  acting(20,'Asustarse intensamente',3.8,
    {attitudes:[A(.12,surprise(.6),.08),A(.45,mix(fear(1),{jawOpen:.75,mouthFunnel:.2},pair('mouthLowerDown',.6),pair('mouthUpperUp',.4)),.2),A(1.5,mix(fear(.95),pair('eyeSquint',.5),{jawOpen:.3}),.4),A(3,fear(.6),.4)],pulses:[{t0:1.5,t1:2.9,f:8.5,ch:{jawOpen:.05,...pair('mouthStretch',.06)}}],blinks:[1.9]},
    {keys:[key(.12,{hipsT:[0,-.02,0],torso:[4,0,0],sh:[8,0]},'o'),
      key(.52,{footL:{off:[.03,0,-.24]},hipsT:[.02,-.05,-.1],torso:[-17,13,-3],head:[-7,-15,0],sh:[20,0],armR:ARM.shield,handR:'splay',armL:ARM.stop,handL:'splay'},'o',.14),
      key(1.5,{footL:{off:[.03,0,-.24]},hipsT:[.025,-.12,-.08],torso:[9,18,-5],head:[13,-12,4],sh:[18,6],armR:arm('shield',{off:[-.2,.2,.7]}),handR:'claw',armL:ARM.guard,handL:'claw'}),
      key(2.9,{footL:{off:[.03,0,-.24]},hipsT:[.02,-.1,-.08],torso:[7,15,-4],head:[10,-8,3],sh:[15,5],armR:arm('shield',{off:[-.2,.1,.7]}),handR:'claw',armL:ARM.guard,handL:'claw'}),
      key(3.4,{torso:[0,4,0],sh:[5,0],hipsT:[0,-.02,-.02]})],
     layers:[{on:'lowerArm',v:[0,2,0],f:9,t0:1.4,t1:3},{on:'torso',v:[.7,0,0],f:9,t0:1.4,t1:3}]},{peak:.14}),
  acting(21,'Mostrar sorpresa leve',2.6,
    {attitudes:[A(.3,surprise(.62),.13),A(1.15,mix(attentive(.7),smile(.35)),.4),A(1.9,smile(.3),.3)],blinks:[.75]},
    {keys:[key(.32,{torso:[-5,0,0],head:[-6,0,4],sh:[7,0],hipsT:[0,.006,0],armR:{u:[.2,-.96,.1],f:[.12,-.2,.97],palm:[-.8,.5,0]},handR:'open',armL:ARM.loose},'oo',.14),
      key(1.15,{torso:[-1,0,0],head:[1,0,7],sh:[2,0],armR:ARM.loose}),
      key(1.9,{head:[0,0,3]})]},{peak:.14}),
  acting(22,'Mostrar asombro',3.4,
    {attitudes:[A(.2,attentive(.6),.15),A(.6,surprise(1.05),.25,{ov:.06}),A(1.9,mix(surprise(.75),pair('mouthSmile',.4,.36)),.5),A(2.7,smile(.5,.3),.4)],blinks:[1.55,1.75]},
    {keys:[key(.22,{torso:[4,0,0],head:[2,0,0]}),
      key(.7,{torso:[-9,0,0],head:[-9,0,0],sh:[11,0],hipsT:[0,.012,-.01],arms:ARM.cheek,hands:'soft',feet:{heel:10}},'o',.1),
      key(1.9,{torso:[3,0,0],head:[-6,0,4],sh:[7,0],armR:ARM.mouth,handR:'soft',armL:ARM.heart,handL:'soft'}),
      key(2.7,{head:[-2,0,3],armL:ARM.heart,handL:'soft'})]},{peak:.24}),
  acting(23,'Mostrar curiosidad',3.8,
    {attitudes:[A(.5,{browOuterUpLeft:1,browOuterUpRight:.3,browInnerUp:.5,browDownRight:.25,...pair('eyeWide',.7,.45),mouthPucker:.4,mouthFunnel:.2,jawOpen:.1,...look(-.45,-.35)},.3),A(2.1,mix(attentive(.9),smile(.6,.3),look(-.3,-.3)),.4),A(3,smile(.4),.4)],blinks:[.3,1.6]},
    {keys:[key(.35,{torso:[-3,0,0],head:[-2,0,0]}),
      key(.95,{torso:[16,-10,0],head:[-11,-6,-12],hipsT:[0,-.02,.035],arms:ARM.back,feet:{heel:8}},'io',.08),
      key(2.1,{torso:[18,-12,0],head:[-12,-8,9],hipsT:[0,-.025,.04],arms:ARM.back,feet:{heel:10}}),
      key(3.1,{torso:[4,-3,0],head:[-3,-2,3]})]}),
  acting(24,'Mostrar confusión',3.8,
    {attitudes:[A(.6,mix(doubt(.9),look(.45,.35)),.35),A(2,mix(doubt(.8),look(-.45,.2)),.4),A(2.9,doubt(.4),.4)],blinks:[.4,1.6,2.5]},
    {keys:[key(.85,P(onL(.8),{torso:[0,5,0],head:[0,-8,-10],armR:ARM.scalp,handR:'claw',armL:arm('shrug',{f:[.5,-.25,.8]}),handL:'open',sh:[5,0]}),'io',.06),
      key(2,P(onL(.6),{torso:[0,-4,0],head:[2,10,8],armR:ARM.scalp,handR:'claw',armL:arm('shrug',{f:[.5,-.15,.82]}),handL:'open',sh:[6,0]})),
      key(3,{head:[0,3,3]})],
     layers:[{on:'handR',v:[0,0,9],f:3.4,t0:1,t1:2.4},{on:'lowerArmR',v:[0,3,0],f:3.4,t0:1,t1:2.4}]}),
  acting(25,'Mostrar escepticismo',4.4,
    {attitudes:[A(.9,mix(doubt(1),lids(.22),smirk(.3)),.45),A(2.6,mix(doubt(.9),lids(.3),pair('mouthPress',.5)),.4),A(3.6,doubt(.4),.4)],blinks:[.6,2.2]},
    {keys:[key(.95,P(onR(1),{torso:[-8,-8,0],head:[-4,13,6],armR:ARM.hips,handR:'soft',armL:ARM.chin,handL:'loose'}),'io',.05),
      key(2.5,P(onR(1.1),{torso:[-9,-9,0],head:[-2,15,8],armR:ARM.hips,handR:'soft',armL:ARM.chin,handL:'loose'})),
      key(3.7,{torso:[-2,0,0],head:[0,3,2]})],
     layers:[{on:'head',v:[0,5,0],f:.9,t0:1.4,t1:3}]}),
  acting(26,'Pensar',5.2,
    {attitudes:[A(.8,mix(ponder(1),look(.5,.55)),.45),A(2.6,mix(without(ponder(.8),'mouthLeft'),{mouthRight:.4},look(-.45,-.3)),.4),A(3.8,mix(attentive(.6),pair('mouthSmile',.3,.26)),.35),A(4.5,smile(.3),.4)],blinks:[.5,2.3,3.5]},
    {keys:[key(.9,P(onL(.9),{torso:[-3,6,0],head:[-6,-8,6],armR:ARM.chin,handR:'loose',armL:ARM.support,handL:'cup'}),'io',.05),
      key(2.5,P(onL(1),{torso:[-2,7,0],head:[-7,-9,7],armR:ARM.chin,handR:'loose',armL:ARM.support,handL:'cup'})),
      key(2.95,P(onR(.5),{torso:[2,-4,0],head:[6,8,-4],armR:ARM.chin,handR:'loose',armL:ARM.support,handL:'cup'})),
      key(3.9,P(onR(.5),{torso:[0,-2,0],head:[-3,2,0],armR:arm('aha',{u:[.3,-.8,.4],f:[.05,.8,.6]}),handR:'point',armL:ARM.support,handL:'cup'}),'o',.1),
      key(4.6,{head:[0,0,2]})],
     layers:[{on:'handR',v:[0,0,5],f:2.4,t0:1.2,t1:2.4}]},{peak:.3}),
  acting(27,'Concentrarse',4.8,
    {attitudes:[A(.8,mix(FOCUS,look(0,-.45)),.5),A(2.4,mix(scale(FOCUS,1.1),{mouthLeft:.3},look(.15,-.5)),.4),A(3.8,{...pair('browDown',.3),...look(0,-.2)},.4)],blinks:[1.8,3.3]},
    {keys:[key(.9,{torso:[15,0,0],head:[-3,0,0],hipsT:[0,-.02,.02],arms:ARM.work,hands:'cup',sh:[3,8]}),
      key(2.4,{torso:[17,3,0],head:[-2,-3,3],hipsT:[0,-.025,.025],armR:arm('work',{off:[.3,.4,1.35]}),armL:ARM.work,hands:'cup',sh:[3,8]}),
      key(3.6,{torso:[16,-2,0],head:[-3,2,-2],hipsT:[0,-.02,.02],arms:ARM.work,hands:'cup',sh:[3,8]}),
      key(4.2,{torso:[4,0,0]})],life:.5}),
  acting(28,'Comprender de repente',3,
    {attitudes:[A(.3,mix(ponder(.7),look(-.3,-.4)),.25),A(.78,mix(surprise(.75),smile(.5,.5)),.13),A(1.5,smile(1,.5),.35),A(2.3,smile(.6),.35)],blinks:[.62,1.9]},
    {keys:[key(.35,{torso:[5,0,0],head:[9,-6,0],armR:arm('chin',{off:[0,-.5,.3]}),handR:'loose'}),
      key(.62,{torso:[7,0,0],head:[10,-6,0],hipsT:[0,-.015,0],armR:arm('chin',{off:[0,-.5,.3]}),handR:'loose'}),
      key(.85,{torso:[-7,0,0],head:[-8,0,0],hipsT:[0,.012,0],sh:[6,0],armR:ARM.aha,handR:'point',feet:{heel:12}},'oo',.2),
      key(1.5,{torso:[-3,0,0],head:[6,0,3],armR:ARM.aha,handR:'point'}),
      key(1.8,{torso:[-3,0,0],head:[-3,0,3],armR:arm('aha',{u:[.32,-.7,.5]}),handR:'point'}),
      key(2.4,{head:[0,0,2]})]},{peak:.3}),
  acting(29,'Mostrar aburrimiento',5.4,
    {attitudes:[A(.9,mix(tired(.8),{mouthLeft:.3},pair('mouthFrown',.3)),.6),A(1.7,mix(without(tired(.7),'eyeLook'),look(.35,.85),{mouthLeft:.3}),.3),A(2.3,mix(without(tired(.8),'eyeLook'),look(-.3,.2),{mouthLeft:.2}),.3),A(3.1,mix(tired(.9),{cheekPuff:.65,mouthPucker:.45,mouthFunnel:.2}),.45,{ov:0}),A(3.9,mix(tired(.9),{mouthLeft:.25}),.4),A(4.7,tired(.4),.4)],blinks:[1.2,2.7,4.2]},
    {keys:[key(1,P(onR(1.2),{torso:[8,0,0],head:[6,6,12],sh:[-5,4],armR:ARM.hips,handR:'soft',armL:ARM.heavy})),
      key(2.6,P(onR(1.3),{torso:[9,2,0],head:[4,8,13],sh:[-5,4],armR:ARM.hips,handR:'soft',armL:ARM.heavy})),
      key(3,P(onR(1.2),{torso:[4,0,0],head:[-2,4,10],sh:[2,2],armR:ARM.hips,handR:'soft',armL:ARM.heavy})),
      key(3.7,P(onR(1.3),{torso:[12,-3,0],head:[10,-8,-8],sh:[-7,5],armR:ARM.hips,handR:'soft',armL:ARM.heavy})),
      key(4.7,{torso:[4,0,0],head:[3,-2,-2]})],breath:.8},{peak:.3}),
  acting(30,'Mostrar cansancio',5.4,
    {attitudes:[A(.9,tired(1),.7),A(2.1,mix(tired(1),lids(.97)),.4),A(3.5,tired(.95),.6),A(4.6,tired(.5),.4)],blinks:[1.4,4]},
    {keys:[key(1,{torso:[14,0,0],head:[15,0,0],sh:[-7,7],hipsT:[0,-.03,0],arms:ARM.heavy,feet:{knee:.02}}),
      key(2.1,{torso:[12,-3,0],head:[10,-6,4],sh:[-5,6],hipsT:[.01,-.03,0],armR:ARM.brow,handR:'soft',armL:ARM.heavy}),
      key(3.2,{torso:[13,-3,0],head:[12,-6,4],sh:[-6,6],hipsT:[.012,-.032,0],armR:arm('brow',{off:[.25,-.25,.06]}),handR:'soft',armL:ARM.heavy}),
      key(3.9,{torso:[15,0,0],head:[14,0,0],sh:[-8,7],hipsT:[0,-.035,0],arms:ARM.heavy},'i',.2),
      key(4.8,{torso:[5,0,0],head:[5,0,0]})],
     layers:[{on:'hipsT',v:[.012,0,0],f:.32,t0:.6,t1:4.8,in:.6,out:.6,fixed:true}]},{peak:.4}),
  acting(31,'Bostezar',5,
    {attitudes:[A(.9,{jawOpen:.35,mouthFunnel:.3,browInnerUp:.5,...pair('browOuterUp',.4),...lids(.4)},.6),A(1.75,{jawOpen:.92,mouthFunnel:.45,...pair('mouthStretch',.2),...lids(1),...pair('eyeSquint',.7),browInnerUp:.6,...pair('browDown',.4),...pair('noseSneer',.25),...pair('cheekSquint',.4)},.6,{ov:0}),A(2.7,{jawOpen:.8,mouthFunnel:.4,...lids(1),...pair('eyeSquint',.6),browInnerUp:.5,...pair('browDown',.3)},.3),A(3.4,mix(tired(.7),{...pair('mouthPress',.4),mouthShrugUpper:.3}),.5),A(4.3,tired(.4),.4)],blinks:[3.75,4.15]},
    {keys:[key(.9,{torso:[-4,0,0],head:[-7,0,0],sh:[5,0],armR:arm('mouth',{off:[0,-.6,.8]}),handR:'soft',armL:ARM.loose}),
      key(1.75,{torso:[-10,4,0],head:[-15,0,3],sh:[11,0],hipsT:[0,.01,0],armR:ARM.mouth,handR:'soft',armL:ARM.stretch,handL:'fist',feet:{heel:6}}),
      key(2.7,{torso:[-11,5,0],head:[-14,0,4],sh:[12,0],hipsT:[0,.012,0],armR:ARM.mouth,handR:'soft',armL:arm('stretch',{u:[.85,.38,-.15]}),handL:'fist',feet:{heel:7}}),
      key(3.6,{torso:[5,0,0],head:[6,0,0],sh:[-4,3],hipsT:[0,-.015,0],arms:ARM.heavy},'io',.08),
      key(4.3,{torso:[2,0,0],head:[2,0,2]})],breath:0},{peak:.4}),
  acting(32,'Mostrar molestia',4,
    {attitudes:[A(.6,angry(.55),.35),A(1.35,mix(without(angry(.5),'eyeWide'),look(.3,.9),lids(.3)),.3),A(1.95,mix(angry(.65),{mouthRight:.3}),.3),A(3.1,angry(.35),.4)],blinks:[.4,1.7]},
    {keys:[key(.7,P(onR(1),{torso:[-3,-6,0],head:[-3,10,5],arms:ARM.hips,hands:'soft'}),'o',.08),
      key(1.4,P(onR(1.1),{torso:[-5,-5,0],head:[-10,-3,-5],arms:ARM.hips,hands:'soft'})),
      key(2,P(onR(1.1),{torso:[4,-6,0],head:[5,8,4],arms:ARM.hips,hands:'soft',sh:[-4,0]})),
      key(3.1,P(onR(.6),{torso:[1,-3,0],head:[2,4,2],arms:ARM.hips,hands:'soft'})),
      key(3.5,{arms:ARM.loose})]},{peak:.5}),
  acting(33,'Mostrar frustración',3.6,
    {attitudes:[A(.4,angry(.8),.25),A(.95,mix(angry(1,1),pair('eyeSquint',1),lids(.75)),.3,{ov:.05}),A(2.2,mix(tired(.4),angry(.35),{cheekPuff:.4,mouthPucker:.3}),.4),A(2.9,angry(.3),.3)],pulses:[{t0:1,t1:1.7,f:7,ch:{jawOpen:.05}}]},
    {keys:[key(.38,{torso:[9,0,0],head:[8,0,0],sh:[10,4],hipsT:[0,-.03,0],arms:ARM.fists,hands:'fist'}),
      key(.95,{torso:[-8,0,0],head:[-15,0,0],sh:[12,0],hipsT:[0,.005,0],arms:ARM.scalp,hands:'claw'},'o',.1),
      key(1.75,{torso:[-6,0,0],head:[-12,0,0],sh:[12,0],arms:ARM.scalp,hands:'claw'}),
      key(2.45,{torso:[10,0,0],head:[9,0,0],sh:[-6,4],hipsT:[0,-.03,0],arms:ARM.heavy},'ii',.2),
      key(3.1,{torso:[3,0,0],head:[3,0,0]})],
     layers:[{on:'torso',v:[0,1.5,0],f:7,t0:.95,t1:1.75},{on:'head',v:[0,3,0],f:7,t0:.95,t1:1.75,lag:.03}]},{peak:.33}),
  acting(34,'Discutir con enfado',4.6,
    {attitudes:[A(.5,angry(.8),.3),A(.95,angry(1,.7),.15),A(1.3,angry(.9),.15),A(1.55,angry(1,.8),.12),A(1.9,angry(.9),.15),A(2.15,angry(1,.9),.12),A(2.95,mix(angry(.7,.4),{browInnerUp:.4}),.3),A(3.8,angry(.4),.4)],blinks:[.3,2.6],ov:0},
    {keys:[key(.5,P(onL(.5),{torso:[-4,6,0],head:[-2,0,0],armR:ARM.cock,handR:'point',armL:ARM.fists,handL:'fist',sh:[6,0]})),
      key(.95,ARGUE(ARM.jab,[13,8,0],[-4,-4,0],.03),'oo',.12),key(1.3,ARGUE(ARM.cock,[8,7,0],[-2,-3,0],.02)),
      key(1.55,ARGUE(ARM.jab,[14,8,0],[-5,-4,0],.03),'oo',.12),key(1.9,ARGUE(ARM.cock,[8,7,0],[-2,-3,0],.02)),
      key(2.15,ARGUE(arm('jab',{u:[.25,-.35,.9]}),[15,9,0],[-6,-5,0],.035),'oo',.14),
      key(2.95,{torso:[7,0,0],head:[-3,0,-5],hipsT:[0,-.01,.02],arms:ARM.give,hands:'splay',sh:[10,0],footL:{off:[0,0,.08]}},'o',.1),
      key(3.8,{torso:[2,0,0]})],drag:.7},{speech:true,peak:.21}),
  acting(35,'Mostrar determinación',4.4,
    {attitudes:[A(.5,mix(scale(RESOLVE,.5),lids(.9)),.35),A(1.15,mix(RESOLVE,look(0,.25),pair('mouthSmile',.3,.2)),.3),A(3.2,RESOLVE,.4),A(3.9,scale(RESOLVE,.4),.3)],blinks:[2.6]},
    {keys:[key(.5,{torso:[-5,0,0],head:[5,0,0],sh:[6,0],arms:ARM.fists,hands:'fist'}),
      key(1.15,FIRM([7,5,0]),'o',.12),key(1.9,FIRM([12,5,0])),key(2.2,FIRM([5,5,0])),key(3.3,FIRM([6,4,0])),
      key(3.9,{torso:[0,-2,0],head:[2,0,0]})]},{peak:.3}),
  acting(36,'Mostrar incredulidad',3.8,
    {attitudes:[A(.25,attentive(.5),.15),A(.72,mix(surprise(.55),doubt(.7)),.25),A(1.7,mix(doubt(.85),{jawOpen:.2},pair('mouthSmile',.35,.15)),.35),A(2.9,doubt(.4),.4)],blinks:[.5,.66,2.3]},
    {keys:[key(.25,{torso:[6,0,0],head:[-5,0,0]}),
      key(.72,{torso:[-7,0,0],head:[-6,0,6],sh:[11,0],arms:ARM.give,hands:'splay'},'o',.12),
      key(2.2,{torso:[-5,0,0],head:[-4,0,7],sh:[9,0],arms:arm('give',{f:[.35,.05,.93]}),hands:'open'}),
      key(2.9,{head:[0,0,3]},'i',.15)],
     layers:[{on:'head',v:[0,7,0],f:2,t0:1,t1:2.25}]},{peak:.25}),
  acting(37,'Mostrar desagrado',3.4,
    {attitudes:[A(.22,mix(attentive(.3),pair('noseSneer',.3)),.15),A(.6,mix(disgust(1),look(.5,-.2)),.25),A(1.75,mix(disgust(.8),look(.55,-.1)),.35),A(2.6,disgust(.35),.35)],blinks:[.45]},
    {keys:[key(.22,{torso:[4,0,0],head:[-3,0,0]}),
      key(.6,{torso:[-10,-12,3],head:[-3,-17,6],sh:[10,0],hipsT:[-.015,-.01,-.03],arms:arm('stop',{u:[.3,-.75,.58],f:[.1,.35,.93]}),hands:'splay'},'oo',.12),
      key(1.75,{torso:[-12,-15,4],head:[-2,-20,7],sh:[11,0],hipsT:[-.02,-.012,-.035],armR:arm('stop',{u:[.3,-.75,.58],f:[.1,.35,.93]}),armL:arm('stop',{u:[.3,-.7,.62],f:[.05,.45,.9]}),hands:'open'}),
      key(2.7,{torso:[-3,-4,0],head:[0,-5,2]})]},{peak:.25}),
  acting(38,'Mostrar vergüenza',4.6,
    {attitudes:[A(.5,mix(surprise(.3),ASHAMED),.3),A(1,mix(ASHAMED,pair('eyeSquint',.7),lids(.8)),.35),A(2.5,mix(ASHAMED,look(-.4,-.4)),.4),A(3.3,mix(scale(ASHAMED,.8),look(.2,-.2)),.3),A(4,scale(ASHAMED,.4),.3)],blinks:[2.9,3.6]},
    {keys:[key(.95,{torso:[8,-6,0],head:[16,-12,6],sh:[13,7],armR:ARM.cover1,handR:'soft',armL:ARM.belly,handL:'soft'},'io',.05),
      key(2.3,{torso:[9,-7,0],head:[17,-13,7],sh:[14,7],armR:ARM.cover1,handR:'soft',armL:ARM.belly,handL:'soft'}),
      key(2.8,{torso:[7,-5,0],head:[12,-9,5],sh:[11,6],armR:arm('mouth',{off:[0,-.2,.12]}),handR:'soft',armL:ARM.belly,handL:'soft'}),
      key(3.5,{torso:[5,-3,0],head:[9,-6,4],sh:[8,4],armR:ARM.nape,handR:'soft',armL:ARM.loose}),
      key(3.95,{torso:[3,-1,0],head:[5,-2,3],sh:[5,3],armR:ARM.nape,handR:'soft'})]},{peak:.3}),
  acting(39,'Mostrar timidez',4.2,
    {attitudes:[A(.8,mix(SHY,look(.1,-.45)),.5),A(1.9,mix(scale(SHY,1.3),look(0,.3)),.3),A(2.7,mix(SHY,look(-.45,-.3)),.3),A(3.5,scale(SHY,.6),.4)],blinks:[1.5,2.3,3.1]},
    {keys:[key(.9,P(onL(.8),{torso:[4,6,0],head:[12,8,8],sh:[9,8],arms:ARM.low,hands:'cup',footR:{heel:26,yaw:-14,off:[-.03,0,.02]}})),
      key(1.9,P(onL(.9),{torso:[3,8,0],head:[8,5,9],sh:[9,8],arms:ARM.low,hands:'cup',footR:{heel:26,yaw:-14,off:[-.03,0,.02]}})),
      key(2.7,P(onL(.9),{torso:[5,-3,0],head:[13,-9,6],sh:[10,8],arms:ARM.low,hands:'cup',footR:{heel:26,yaw:-4,off:[-.03,0,.02]}})),
      key(3.6,{torso:[2,0,0],head:[4,0,3]})],
     layers:[{on:'torso',v:[0,5,0],f:.7,t0:.9,t1:3.4,in:.4,out:.4}]}),
  acting(40,'Saludar con la mano',3.4,
    {attitudes:[A(.3,mix(attentive(.8),smile(.5)),.2),A(.65,smile(1,.6),.25,{ov:.1}),A(2.45,smile(.8,.2),.4)],blinks:[.18,1.9]},
    {keys:[key(.2,{hipsT:[0,-.012,0],torso:[2,0,0],armR:ARM.loose}),
      key(.62,P(onL(.6),{torso:[-3,4,0],head:[-3,0,-7],sh:[2,0],armR:ARM.wave,handR:'open'}),'o',.14),
      key(2.3,P(onL(.7),{torso:[-3,5,0],head:[-2,0,-8],armR:ARM.wave,handR:'open'})),
      key(2.9,{head:[0,0,-2]})],
     layers:[{on:'lowerArmR',v:[0,20,0],f:2.7,t0:.7,t1:2.35,in:.1},{on:'handR',v:[0,12,0],f:2.7,t0:.7,t1:2.35,in:.1,lag:.07}]},{peak:.4}),
  acting(41,'Despedirse con la mano',4.2,
    {attitudes:[A(.5,mix(smile(.7),{browInnerUp:.75}),.35),A(2.6,mix(smile(.55),{browInnerUp:.85},lids(.2)),.4),A(3.5,smile(.35),.4)],blinks:[.3,2.2,3]},
    {keys:[key(.6,{torso:[-3,0,0],head:[-3,0,-5],armR:ARM.high,handR:'open',feet:{heel:6}},'o',.1),
      key(2.2,{torso:[-3,0,0],head:[-2,0,-6],armR:ARM.high,handR:'open',feet:{heel:6}}),
      key(2.9,{hips:[0,-12,0],torso:[0,-14,0],head:[2,24,3],armR:ARM.wave,handR:'soft',footR:{off:[.03,0,-.1],yaw:22}}),
      key(3.6,{hips:[0,-8,0],torso:[0,-8,0],head:[0,12,2],footR:{off:[.03,0,-.1],yaw:22}})],
     layers:[{on:'lowerArmR',v:[0,26,0],f:1.7,t0:.7,t1:2.3},{on:'handR',v:[0,12,0],f:1.7,t0:.7,t1:2.3,lag:.09}]},{peak:.35}),
  acting(42,'Asentir con aprobación',3.2,
    {attitudes:[A(.45,mix(smile(.7),attentive(.5)),.3),A(2.2,smile(.8),.4)],blinks:[.62,1.12]},
    {keys:[key(.35,{head:[-5,0,0],torso:[-1,0,0]}),key(.62,{head:[15,0,0],torso:[4,0,0]}),key(.87,{head:[-3,0,0]}),
      key(1.12,{head:[12,0,0],torso:[3,0,0],armR:ARM.thumb,handR:'thumb'}),key(1.37,{head:[-1,0,0],armR:ARM.thumb,handR:'thumb'}),
      key(1.62,{head:[8,0,2],torso:[2,0,0],armR:ARM.thumb,handR:'thumb'}),key(1.95,{head:[1,0,4],armR:ARM.thumb,handR:'thumb'},'io',.1),
      key(2.5,{head:[1,0,4],armR:ARM.thumb,handR:'thumb'})],drag:.6},{peak:.5}),
  acting(43,'Negar con la cabeza',3.2,
    {attitudes:[A(.4,{...pair('mouthPress',.5),...pair('mouthFrown',.35),browInnerUp:.45,...pair('browDown',.3),...lids(.85)},.3),A(1.5,{...pair('mouthPress',.45),...pair('mouthFrown',.3),browInnerUp:.4,...pair('browDown',.25)},.4),A(2.4,pair('mouthPress',.2),.4)]},
    {keys:[key(.3,{head:[2,8,0]}),key(.56,{head:[3,-22,0],torso:[0,-3,0],armR:ARM.no,handR:'flat'}),key(.86,{head:[3,20,0],torso:[0,3,0],armR:ARM.no,handR:'flat'}),
      key(1.16,{head:[3,-15,0],torso:[0,-2,0],armR:ARM.no,handR:'flat'}),key(1.46,{head:[2,10,0],armR:ARM.no,handR:'flat'}),key(1.76,{head:[2,-4,0],armR:ARM.no,handR:'flat'}),
      key(2.2,{head:[1,0,0],armR:ARM.no,handR:'flat'}),key(2.7,{head:[0,0,0]})],
     layers:[{on:'lowerArmR',v:[0,9,0],f:1.65,ph:.25,t0:.5,t1:2.1}],drag:.6},{peak:.3}),
  acting(44,'Encogerse de hombros',3.6,
    {attitudes:[A(.3,attentive(.3),.2),A(.78,mix(SHRUG,lids(.3)),.3),A(2,scale(SHRUG,.65),.4),A(2.8,smile(.25),.4)],blinks:[.55,2.2]},
    {keys:[key(.3,{sh:[-4,0],torso:[2,0,0],arms:ARM.loose}),
      key(.78,{sh:[24,0],torso:[-3,0,-3],head:[-2,0,11],arms:ARM.shrug,hands:'open'},'o',.14),
      key(1.8,{sh:[22,0],torso:[-3,0,-3],head:[-1,0,12],arms:ARM.shrug,hands:'open'}),
      key(2.25,{sh:[-3,0],torso:[1,0,0],head:[2,0,3]},'i',.3),
      key(2.9,{head:[0,0,2]})]},{peak:.3}),
  acting(45,'Señalar algo',3.8,
    {attitudes:[A(.3,mix(attentive(.6),look(-.75,0)),.2),A(1.65,mix(attentive(.9),smile(.4)),.3),A(2.4,mix(attentive(.5),look(-.6,0)),.3),A(3.1,smile(.3),.3)],blinks:[.75,1.5,2.25]},
    {keys:[key(.45,{head:[0,-22,0],torso:[0,-4,0]},'o'),
      key(.95,P(onR(.7),{torso:[3,-15,0],head:[0,-26,-3],armR:ARM.point,handR:'point'}),'o',.12),
      key(1.65,P(onR(.7),{torso:[3,-12,0],head:[2,6,4],armR:ARM.point,handR:'point'})),
      key(2.4,P(onR(.8),{torso:[4,-15,0],head:[0,-20,-2],armR:arm('point',{u:[.8,-.08,.6],f:[.82,.05,.57]}),handR:'point'}),'io',.1),
      key(3.1,{torso:[0,-3,0],head:[0,-4,0]})]},{peak:.3}),
  acting(46,'Escuchar atentamente',5,
    {attitudes:[A(.6,mix(attentive(.7),pair('mouthSmile',.25,.22)),.4),A(2,mix(attentive(1),pair('mouthSmile',.2,.18)),.3),A(2.9,mix(attentive(.6),smile(.45)),.35),A(4.2,attentive(.4),.4)],blinks:[.4,1.55,2.75,3.8]},
    {keys:[key(.7,LISTEN([-3,5,8])),key(1.4,LISTEN([-3,5,8])),key(1.62,LISTEN([6,5,8])),key(1.86,LISTEN([-2,5,8])),key(2.6,LISTEN([-3,4,7])),
      key(2.8,LISTEN([5,4,7])),key(3.02,LISTEN([-2,4,7])),key(3.22,LISTEN([3,4,7])),key(3.45,LISTEN([-1,4,7])),key(4.3,{torso:[2,0,0],head:[0,0,3]})],drag:.7}),
  acting(47,'Explicar con las manos',5,
    {attitudes:[A(.5,attentive(.7),.3),A(1.5,mix(attentive(.9),pair('mouthSmile',.3,.26)),.25),A(2.5,mix(attentive(.6),doubt(.3)),.25),A(3.5,mix(attentive(.8),smile(.5)),.3),A(4.3,smile(.3),.3)],blinks:[.3,1.3,2.3,3.3]},
    {keys:[key(.55,{torso:[4,0,0],head:[-2,0,0],arms:ARM.give,hands:'open'},'o',.1),
      key(1.2,{torso:[3,0,0],head:[2,0,0],arms:arm('give',{f:[.2,0,.98]}),hands:'open'}),
      key(1.6,P(onR(.5),{torso:[2,-9,0],head:[-2,-6,-4],armR:arm('open',{u:[.4,-.85,.25],f:[.7,.1,.7]}),handR:'open',armL:arm('give',{f:[.15,-.2,.95]}),handL:'soft'}),'o',.1),
      key(2.3,P(onR(.5),{torso:[2,-8,0],head:[1,-5,-4],armR:arm('open',{u:[.4,-.85,.25],f:[.68,.02,.73]}),handR:'open',armL:arm('give',{f:[.15,-.2,.95]}),handL:'soft'})),
      key(2.65,P(onL(.5),{torso:[2,9,0],head:[-2,6,4],armL:arm('open',{u:[.4,-.85,.25],f:[.7,.1,.7]}),handL:'open',armR:arm('give',{f:[.15,-.2,.95]}),handR:'soft'}),'o',.1),
      key(3.3,P(onL(.5),{torso:[2,8,0],head:[1,5,4],armL:arm('open',{u:[.4,-.85,.25],f:[.68,.02,.73]}),handL:'open',armR:arm('give',{f:[.15,-.2,.95]}),handR:'soft'})),
      key(3.65,{torso:[5,0,0],head:[4,0,0],arms:ARM.clasp,hands:'cup'},'io',.06),
      key(4.2,{torso:[3,0,0],head:[-1,0,3],arms:ARM.clasp,hands:'cup'})]},{speech:true,peak:.32}),
  acting(48,'Hablar por teléfono',5.4,
    {attitudes:[A(.9,attentive(.5),.4),A(2,mix(attentive(.6),look(.4,.4)),.3),A(2.9,mix(smile(.7,.3),attentive(.5)),.3),A(3.9,mix(smile(.4),look(-.3,-.3)),.4),A(4.7,smile(.2),.3)],blinks:[.6,1.7,2.6,3.6,4.4]},
    {keys:[key(.9,PHONE(onR(.8),[0,-4,0],[2,6,9]),'io',.05),key(2,PHONE(onR(.9),[-2,-5,0],[-4,8,10])),
      key(2.7,PHONE(onL(.6),[1,3,0],[5,2,8])),key(2.95,PHONE(onL(.6),[1,3,0],[-1,2,8])),key(3.2,PHONE(onL(.6),[1,3,0],[4,2,8])),
      key(3.9,PHONE(onL(.8),[2,4,0],[6,-6,7],{armL:arm('open',{f:[.4,-.3,.86]}),handL:'open'})),
      key(4.7,{head:[1,0,3],armR:arm('ear',{off:[.7,-.7,.6]}),handR:'hold'})]},{speech:true,requires:['phone'],peak:.4}),
  acting(49,'Guiñar un ojo',2,
    {attitudes:[A(.28,attentive(.6),.18),A(.55,{eyeBlinkLeft:1,cheekSquintLeft:.85,eyeSquintLeft:.6,mouthSmileLeft:.85,mouthSmileRight:.5,mouthDimpleLeft:.3,browDownLeft:.45,browOuterUpRight:.75,browInnerUp:.2,mouthLeft:.15,cheekSquintRight:.3},.12,{ov:0}),A(.92,smile(.75),.16),A(1.5,smile(.5),.3)],out:.3},
    {keys:[key(.26,{head:[-3,0,0],torso:[-2,0,0],armR:ARM.cock,handR:'loose'}),
      key(.55,{head:[4,7,-9],torso:[2,5,-2],armR:ARM.gun,handR:GUN,sh:[2,0]},'oo',.15),
      key(.95,{head:[2,6,-7],torso:[1,4,-2],armR:arm('gun',{f:[.18,.4,.9]}),handR:GUN}),
      key(1.5,{head:[0,2,-3]})],drag:.7},{peak:.28}),
  acting(50,'Pedir disculpas',4.4,
    {attitudes:[A(.5,SORRY,.35),A(1.15,mix(SORRY,lids(1)),.35),A(2.1,mix(SORRY,look(0,.35),{browInnerUp:.95}),.4),A(2.9,mix(SORRY,lids(.6)),.25),A(3.3,mix(SORRY,look(0,.2)),.25),A(3.9,scale(SORRY,.4),.3)]},
    {keys:[key(.5,BOW(2,[3,0,0])),key(1.15,BOW(21,[15,0,0],.035)),key(1.7,BOW(22,[16,0,0],.035)),key(2.15,BOW(9,[-4,0,5],.012)),
      key(2.9,BOW(13,[6,0,4],.02)),key(3.3,BOW(8,[-2,0,4],.01)),key(3.9,{torso:[2,0,0],head:[1,0,2]})]},{peak:.27})
]);
// ---------- Estilo femenino / masculino ----------
// Cada actuación existe en dos configuraciones. Las que tienen una variante de autor (VARIANTS) se
// actúan de nuevo para ese estilo; el resto se adapta con un perfil de estilo sobre rostro y cuerpo.
// Femenino: cabeza más ladeada, contrapposto marcado, apoyo estrecho, codos recogidos, manos cerca de
// la cara y del pecho, cejas y párpados más expresivos. Masculino: cabeza más recta, cadera quieta,
// apoyo ancho, codos abiertos, pecho adelante, ceño y mandíbula más presentes, menos ceja suplicante.
// El estilo es un dato de la actuación (acting.style), no del personaje: cualquier modelo puede usar
// cualquiera de los dos. El perfil del personaje solo propone el estilo por defecto.
export const STYLES=Object.freeze([{id:'F',name:'Femenino'},{id:'M',name:'Masculino'}]);
const FACE_STYLE={
  F:{browInnerUp:1.12,browOuterUp:1.1,eyeWide:1.08,cheekSquint:1.1,mouthSmile:1.04,browDown:.9,noseSneer:.85,jawForward:.6,mouthPress:.92},
  M:{browInnerUp:.78,browOuterUp:.85,eyeWide:.85,cheekSquint:.95,mouthSmile:.94,mouthStretch:1.15,mouthDimple:1.25,browDown:1.12,noseSneer:1.1,jawForward:1.35,mouthPress:1.1,mouthPucker:.85,mouthFunnel:.9}
};
const BODY_STYLE={
  F:{roll:1.3,sway:1.3,stance:-.012,abduct:.84,sh:1.12,drag:.94,chest:0,hands:{splay:'open',claw:'soft'}},
  M:{roll:.55,sway:.6,stance:.024,abduct:1.15,sh:.85,drag:1.1,chest:-2,hands:{cup:'loose',soft:'relax'}}
};
const styleFace=(pose,S)=>Object.fromEntries(Object.entries(pose).map(([n,v])=>[n,n.startsWith('eyeBlink')||n.startsWith('eyeLook')?v:clamp(v*(FACE_STYLE[S][n.replace(/(Left|Right)$/,'')]??1))]));
function styleArm(a,k){if(!a||!a.u||!a.f||a.f[1]<-.6)return a;return {...a,u:[a.u[0]*k,a.u[1],a.u[2]]};}
function styleKey(src,S){
  const st=BODY_STYLE[S],k={...src};
  if(k.head)k.head=[k.head[0],k.head[1],(k.head[2]||0)*st.roll];
  if(k.hips)k.hips=[k.hips[0],k.hips[1],(k.hips[2]||0)*st.sway];
  if(k.hipsT)k.hipsT=[k.hipsT[0]*st.sway,k.hipsT[1],k.hipsT[2]];
  if(k.sh)k.sh=[k.sh[0]>0?k.sh[0]*st.sh:k.sh[0],k.sh[1]||0];
  if(st.chest&&(k.torso?.[0]??0)<6)k.chest=[(k.chest?.[0]||0)+st.chest,k.chest?.[1]||0,k.chest?.[2]||0];
  for(const n of ['arms','armL','armR'])if(k[n])k[n]=styleArm(k[n],st.abduct);
  for(const n of ['hands','handL','handR'])if(typeof k[n]==='string')k[n]=st.hands[k[n]]||k[n];
  for(const s of ['L','R']){const f=k['foot'+s]??k.feet??{},o=f.off||[0,0,0];k['foot'+s]={...f,off:[o[0]+st.stance,o[1],o[2]]};}
  delete k.feet;return k;
}
/** Adaptación automática de una actuación a un estilo (las que no tienen variante de autor). */
function styled(a,S){
  const st=BODY_STYLE[S];
  return {...a,id:a.id,style:S,name:a.name,
    face:{...a.face,attitudes:a.face.attitudes.map(x=>({...x,pose:styleFace(x.pose,S)})),pulses:(a.face.pulses||[]).map(p=>({...p,ch:styleFace(p.ch,S)}))},
    body:{...a.body,keys:a.body.keys.map(k=>styleKey(k,S)),drag:(a.body.drag??1)*st.drag}};
}
// Rostros de autor que usan varias variantes.
const GRIN={...pair('mouthSmile',1,.94),...pair('cheekSquint',.85,.8),...pair('mouthUpperUp',.36),...pair('mouthLowerDown',.32),...pair('mouthStretch',.28),...pair('eyeSquint',.42),...pair('mouthDimple',.3),browInnerUp:.32,...pair('browOuterUp',.38,.32),jawOpen:.04};
const HAPPY_EYES=s=>({...pair('eyeBlink',.86*s,.82*s),...pair('cheekSquint',1*s),...pair('eyeSquint',.5*s)});
// Grito de triunfo: boca muy abierta, ceño apretado y mejillas arriba («¡¡SÍ!!»), no sorpresa.
const SHOUT={jawOpen:.75,...pair('mouthStretch',.45),...pair('mouthUpperUp',.5),...pair('mouthLowerDown',.5),...pair('browDown',.85),...pair('eyeSquint',.75),...pair('eyeBlink',.28),...pair('noseSneer',.4),...pair('cheekSquint',.8),...pair('mouthSmile',.6)};
// Suficiencia: media sonrisa ladeada que sube la mejilla, párpados a media asta y una ceja arriba (el bigote tapa
// las comisuras: la leen mejillas, párpados y cejas).
const SMUG={mouthSmileLeft:1,mouthSmileRight:.65,cheekSquintLeft:.85,cheekSquintRight:.55,...pair('eyeSquint',.45),...pair('eyeBlink',.36,.32),browOuterUpRight:.7,browDownLeft:.3,mouthDimpleLeft:.5,jawForward:.2,mouthPressRight:.2};
// Apoyo masculino: pies algo más abiertos que en reposo; con peso a un lado, el otro talón descansa.
const M_STANCE=.028;
const mStance=(o={})=>({footL:{off:[M_STANCE,0,0],...(o.L||{})},footR:{off:[M_STANCE,0,0],...(o.R||{})}});
const mOnR=(a=1,o={})=>P(onR(a),mStance({...o,L:{heel:7*a,yaw:5*a,...(o.L||{})}}));
const mOnL=(a=1,o={})=>P(onL(a),mStance({...o,R:{heel:7*a,yaw:5*a,...(o.R||{})}}));
// Variantes de autor. F: los dos personajes actuales son femeninos; M: la celebración, que cambia de gesto.
export const VARIANTS={
  'behavior-01':{F:{duration:3.6,
    face:{attitudes:[A(.5,mix(smile(.35),look(0,-.35),lids(.3)),.45),A(1.3,mix(smile(.82),look(0,.12)),.45),A(2.5,mix(smile(.7),lids(.18)),.5)],blinks:[.35,1.15,2.25]},
    body:{keys:[key(.5,P(onL(.6),{torso:[2,0,0],head:[6,-4,6],sh:[3,3],arms:ARM.low,hands:'cup'})),
      key(1.35,P(onL(.9),{torso:[-1,4,0],head:[-2,-6,11],sh:[5,2],arms:ARM.low,hands:'cup',footR:{heel:12,yaw:-6}}),'io',.06),
      key(2.6,P(onL(.9),{torso:[0,4,0],head:[0,-5,9],sh:[3,2],arms:ARM.low,hands:'cup',footR:{heel:10,yaw:-6}}))]}}},
  // «Muy alegre» según las referencias: inspira con los puños al pecho → estalla con ojos en arco,
  // boca abierta y puños junto a la cara → rebota → se asienta encogida, con sonrisa de dientes.
  'behavior-02':{F:{duration:4.2,peak:.2,
    face:{attitudes:[A(.3,mix(surprise(.5),pair('mouthSmile',.3),{mouthFunnel:.18}),.2),
      A(.76,mix(smile(1.1,1.1),HAPPY_EYES(1),{browInnerUp:.55,jawOpen:.44},pair('mouthLowerDown',.42),pair('mouthUpperUp',.36)),.22,{ov:.12}),
      A(1.9,mix(smile(1,.85),HAPPY_EYES(.7)),.4),
      A(2.5,mix(GRIN,{eyeBlinkLeft:.48,eyeBlinkRight:.3}),.35),A(3.45,smile(.6),.4)],
      pulses:[{t0:.82,t1:1.9,f:4.2,decay:.4,ch:{jawOpen:.12,...pair('mouthUpperUp',.06)}}],blinks:[2.2]},
    body:{keys:[key(.32,{hipsT:[0,-.022,0],torso:[4,0,0],head:[4,0,0],sh:[10,4],arms:ARM.fistChest,hands:'fist'}),
      key(.78,{hipsT:[0,.014,0],torso:[-8,4,0],head:[-10,-6,11],sh:[13,0],arms:ARM.fistUp,hands:'fist',feet:{heel:14}},'o',.14),
      key(1.15,{hipsT:[0,-.022,0],torso:[-3,-3,0],head:[-6,5,-9],sh:[9,0],armL:ARM.fistCheek,armR:ARM.fistUp,hands:'fist'}),
      key(1.52,{hipsT:[0,.008,0],torso:[-6,3,0],head:[-8,-5,10],sh:[11,0],armR:ARM.fistCheek,armL:ARM.fistUp,hands:'fist',feet:{heel:10}},'io',.08),
      key(1.92,{hipsT:[0,-.02,0],torso:[-3,0,0],head:[-5,3,-7],sh:[9,0],arms:ARM.fistCheek,hands:'fist'}),
      key(2.5,{hipsT:[0,-.045,.01],torso:[9,0,0],head:[2,4,9],sh:[9,6],arms:ARM.fistLow,hands:'fist',feet:{knee:-.03}},'io',.06),
      key(3.15,{hipsT:[0,-.036,.008],torso:[7,-2,0],head:[0,-3,10],sh:[7,5],arms:ARM.fistLow,hands:'fist',feet:{knee:-.03}}),
      key(3.75,{torso:[1,0,0],head:[0,0,4],arms:ARM.loose,hands:'relax'})],
     layers:[{on:'hipsT',v:[0,.012,0],...beat(2.6,.85,2.05,{decay:.3})},{on:'sh',v:[4,0],...beat(2.6,.85,2.05,{decay:.3,lag:.04})},
       {on:'hipsT',v:[0,.008,0],...beat(3.2,2.45,3.4,{decay:.5})},{on:'head',v:[-2,0,0],...beat(3.2,2.45,3.4,{decay:.5,lag:.05})}],drag:.85}},
    // «¡Qué alegría!» masculino: recoge aire con los puños abajo → estalla abriendo los brazos al cielo,
    // cabeza atrás y carcajada → rebota → palmada fuerte delante del pecho inclinándose hacia nosotros →
    // se planta en jarras, pecho fuera, radiante.
    M:{duration:4.2,peak:.19,
      face:{attitudes:[A(.3,mix(surprise(.6),{jawOpen:.22,mouthFunnel:.28}),.18),
        A(.76,mix(smile(1.15,1.15),HAPPY_EYES(.62),{jawOpen:.52,browInnerUp:.45},pair('browOuterUp',.55)),.2,{ov:.12}),
        A(1.85,mix(smile(1.05,.85),HAPPY_EYES(.5)),.35),
        A(2.14,mix(GRIN,HAPPY_EYES(.7),pair('noseSneer',.18),{jawOpen:.12}),.12,{ov:.08}),
        A(3,mix(smile(1.05,.3),pair('cheekSquint',.85),pair('eyeSquint',.5),lids(.22),pair('browOuterUp',.25),{jawForward:.12}),.4),A(3.75,mix(smile(.7),pair('eyeSquint',.25)),.4)],
        pulses:[{t0:.85,t1:1.85,f:4.5,decay:.3,ch:{jawOpen:.15,...pair('mouthUpperUp',.07)}}],blinks:[.16,2.07,3.05]},
      body:{keys:[key(.3,{hipsT:[0,-.058,.005],torso:[13,0,0],head:[9,0,0],sh:[12,6],arms:ARM.fistLow,hands:'fist',feet:{knee:.04}}),
        key(.78,{hipsT:[0,.016,0],torso:[-13,0,0],chest:[-4,0,0],head:[-15,0,0],sh:[12,0],arms:ARM.wide,hands:'splay',...mStance({L:{heel:14},R:{heel:14}})},'o',.14),
        key(1.15,{hipsT:[0,-.026,0],torso:[-5,3,0],head:[-6,-4,6],sh:[8,0],arms:arm('wide',{u:[.84,.12,.34],f:[.58,.62,.52]}),hands:'open',...mStance()}),
        key(1.52,{hipsT:[0,.008,0],torso:[-10,-3,0],chest:[-3,0,0],head:[-11,4,-5],sh:[10,0],arms:ARM.wide,hands:'open',...mStance({L:{heel:8},R:{heel:8}})},'io',.08),
        ...clapsHeld(2.1,2,.38,(i,hit)=>({hipsT:[0,-.024-.008*hit,.008],torso:[7+3*hit,i?-3:2,0],head:[1+2*hit,i?5:-3,i?-6:6],sh:[8,5],...mStance({L:{knee:.03},R:{knee:.03}})})),
        // Las manos se separan hacia fuera antes de ir a la cintura: así el antebrazo no cruza el peto.
        key(2.86,{hipsT:[0,-.012,0],torso:[1,-2,0],head:[-2,6,-3],sh:[2,0],arms:{u:[.5,-.84,.2],f:[.75,-.2,.62],palm:[-.55,-.3,.78]},hands:'open',...mStance()}),
        key(3.15,P(mOnR(1),{torso:[-6,-4,0],chest:[-4,0,0],head:[-6,8,-5],sh:[-2,-4],arms:ARM.hipsFist,hands:'fist'}),'io',.06),
        key(3.65,P(mOnR(1),{torso:[-5,-4,0],chest:[-4,0,0],head:[-3,10,-6],sh:[-2,-4],arms:ARM.hipsFist,hands:'fist'}))],
       layers:[{on:'hipsT',v:[0,.01,0],...beat(4.5,.85,1.85,{decay:.3})},{on:'sh',v:[5,0],...beat(4.5,.85,1.85,{decay:.3,lag:.04})},{on:'head',v:[-3,0,0],...beat(4.5,.85,1.85,{decay:.3,lag:.06})},
         {on:'hipsT',v:[0,.006,0],...beat(2.63,2.1,2.85,{decay:.5})}],drag:.9,lead:'both'}}},
  'behavior-03':{
    F:{duration:4,peak:.2,
      face:{attitudes:[A(.25,mix(surprise(.62),smile(.3)),.15),A(.7,mix(laugh(1),HAPPY_EYES(1)),.22,{ov:.12}),A(2,mix(smile(1.05,.9),HAPPY_EYES(.55)),.4),A(2.7,GRIN,.35),A(3.45,smile(.6),.4)],
        pulses:[{t0:.72,t1:1.9,f:5,decay:.35,ch:{jawOpen:.14,...pair('mouthUpperUp',.06)}}],blinks:[2.35]},
      body:{keys:[key(.25,{hipsT:[0,-.05,0],torso:[6,0,0],head:[5,0,0],sh:[12,4],arms:ARM.fistChest,hands:'fist',feet:{knee:-.03}}),
        key(.7,{hipsT:[0,.03,0],torso:[-10,0,0],head:[-12,0,7],sh:[14,0],arms:ARM.up,hands:'fist',feet:{heel:20}},'o',.16),
        key(1.1,{hipsT:[0,-.01,0],torso:[-5,4,0],head:[-6,-4,-8],sh:[10,0],arms:ARM.fistUp,hands:'fist',feet:{heel:12}}),
        key(1.45,{hipsT:[0,.02,0],torso:[-8,-4,0],head:[-9,4,8],sh:[12,0],arms:ARM.up,hands:'fist',feet:{heel:18}},'io',.1),
        key(1.95,{hipsT:[0,-.03,0],torso:[3,0,0],head:[-2,0,-7],sh:[12,6],arms:ARM.delight,hands:'cup',feet:{knee:-.03}}),
        key(2.65,P(onL(.8),{torso:[4,6,0],head:[2,-6,11],sh:[10,6],arms:ARM.delight,hands:'cup',footR:{heel:22,yaw:-10}})),
        key(3.35,{torso:[0,0,0],head:[0,0,4],arms:ARM.loose})],
       layers:[{on:'hipsT',v:[0,.014,0],...beat(2.8,.72,1.8,{decay:.3})},{on:'sh',v:[4,0],...beat(3,2,3,{decay:.4})},{on:'torso',v:[0,4,0],f:1.6,t0:2,t1:3.1}],drag:.85}},
    // «¡¡SÍ!!» de victoria: se agacha apretando los puños → SALTA con los puños al cielo gritando → cae
    // amortiguando y tira de los dos codos hacia abajo («¡sí!») → puño al cielo tres veces → golpe en el
    // pecho dos veces, orgulloso → se ríe y se suelta.
    M:{duration:4.6,peak:.15,
      face:{attitudes:[A(.3,mix(surprise(.45),pair('mouthPress',.45),pair('eyeWide',.55)),.15),
        A(.64,SHOUT,.14,{ov:.1}),A(1,mix(scale(SHOUT,.85),{jawOpen:.55}),.12),
        A(1.35,mix(laugh(.9),{jawOpen:.42}),.2),A(2.15,SHOUT,.15,{ov:.06}),
        A(2.7,mix(RESOLVE,smile(.7),pair('mouthPress',.2)),.18),A(3.55,mix(smile(1.05,.85),HAPPY_EYES(.55)),.3),A(4.1,smile(.6),.4)],
        pulses:[{t0:1.4,t1:2.1,f:2.6,ch:{jawOpen:.16,...pair('mouthStretch',.08)}},{t0:3.55,t1:4,f:4.6,decay:.4,ch:{jawOpen:.12}}],blinks:[.18,.95,2.62,3.5]},
      body:{keys:[key(.32,{hipsT:[0,-.075,.01],torso:[13,0,0],head:[5,0,0],sh:[12,6],arms:ARM.fistLow,hands:'fist',...mStance({L:{knee:.05},R:{knee:.05}})}),
        // Saltito: impulso de puntillas → en el aire con las rodillas recogidas → busca el suelo → cae amortiguando.
        key(.42,{hipsT:[0,.06,0],torso:[-6,0,0],head:[-8,0,0],sh:[12,0],arms:{u:[.42,-.1,.9],f:[.2,.82,.53],palm:[-.6,0,.8]},hands:'fist',...mStance({L:{heel:35},R:{heel:35}})},'c'),
        key(.58,{hipsT:[0,.27,-.01],torso:[-9,0,0],chest:[-4,0,0],head:[-14,0,0],sh:[14,0],arms:ARM.victory,hands:'fist',...mStance({L:{off:[M_STANCE,.38,-.07],heel:22,knee:.05},R:{off:[M_STANCE,.38,-.07],heel:22,knee:.05}})},'o'),
        key(.64,{hipsT:[0,.26,-.01],torso:[-8,0,0],chest:[-4,0,0],head:[-13,0,0],sh:[14,0],arms:ARM.victory,hands:'fist',...mStance({L:{off:[M_STANCE,.36,-.07],heel:20,knee:.05},R:{off:[M_STANCE,.36,-.07],heel:20,knee:.05}})}),
        // Al bajar, los codos bajan por delante (tirar de una cuerda), no por el lado en cruz; las piernas buscan el suelo.
        key(.75,{hipsT:[0,.09,0],torso:[-3,0,0],head:[-7,0,0],sh:[11,3],arms:{u:[.4,-.15,.9],f:[.12,.75,.65],palm:[-.85,0,.5]},hands:'fist',...mStance({L:{off:[M_STANCE,.07,0],heel:14},R:{off:[M_STANCE,.07,0],heel:14}})},'i'),
        key(.82,{hipsT:[0,-.1,.014],torso:[16,0,0],head:[6,0,0],sh:[6,7],arms:ARM.yes,hands:'fist',...mStance({L:{knee:.07},R:{knee:.07}})},'i'),
        key(.94,{hipsT:[0,-.075,.012],torso:[14,0,0],head:[4,0,0],sh:[6,7],arms:ARM.yes,hands:'fist',...mStance({L:{knee:.06},R:{knee:.06}})},'o'),
        key(1.1,{hipsT:[0,-.09,.014],torso:[17,0,0],head:[6,0,0],sh:[5,8],arms:arm('yes',{u:[.3,-.9,-.32]}),hands:'fist',...mStance({L:{knee:.06},R:{knee:.06}})},'o'),
        key(1.36,P(mOnL(.6),{hipsT:[0,-.01,0],torso:[-7,4,0],chest:[-3,0,0],head:[-9,-4,0],armR:ARM.victory,handR:'fist',armL:ARM.yes,handL:'fist'}),'io',.08),
        ...[1.56,1.94].flatMap((t,i)=>[
          key(t,P(mOnL(.6),{hipsT:[0,-.03,0],torso:[3,4,0],head:[-2,-4,0],sh:[6,0],armR:ARM.cockFist,handR:'fist',armL:ARM.yes,handL:'fist'}),'o'),
          key(t+.19,P(mOnL(.6),{hipsT:[0,-.005,0],torso:[-7,4-2*i,0],chest:[-3,0,0],head:[-10,-4,0],sh:[10,0],armR:ARM.victory,handR:'fist',armL:ARM.yes,handL:'fist'}),'o',.06)]),
        key(2.3,P(mOnL(.6),{hipsT:[0,0,0],torso:[-9,2,0],chest:[-4,0,0],head:[-11,-3,0],sh:[11,0],armR:ARM.victory,handR:'fist',armL:ARM.yes,handL:'fist'})),
        key(2.66,P(mStance(),{hipsT:[0,-.02,0],torso:[6,0,0],head:[6,0,0],sh:[4,4],armR:ARM.thump,handR:'fist',armL:ARM.hang,handL:'fist'}),'i'),
        key(2.74,P(mStance(),{hipsT:[0,-.022,0],torso:[7,0,0],head:[7,0,0],sh:[4,4],armR:ARM.thump,handR:'fist',armL:ARM.hang,handL:'fist'})),
        key(2.94,P(mStance(),{hipsT:[0,-.01,0],torso:[0,0,0],chest:[-3,0,0],head:[-3,0,0],sh:[2,2],armR:{u:[.42,-.72,.4],f:[.05,.55,.83],palm:[-.7,0,-.7]},handR:'fist',armL:ARM.hang,handL:'fist'}),'o'),
        key(3.1,P(mStance(),{hipsT:[0,-.022,0],torso:[7,0,0],head:[8,0,0],sh:[4,4],armR:ARM.thump,handR:'fist',armL:ARM.hang,handL:'fist'}),'i'),
        key(3.22,P(mStance(),{hipsT:[0,-.02,0],torso:[5,0,0],chest:[-2,0,0],head:[3,0,0],sh:[3,3],armR:ARM.thump,handR:'fist',armL:ARM.hang,handL:'fist'})),
        key(3.65,P(mOnR(.8),{torso:[-4,-3,0],chest:[-3,0,0],head:[-6,6,-5],sh:[6,0],armR:ARM.hang,handR:'loose',armL:ARM.hang,handL:'loose'}),'io',.06),
        key(4.15,P(mOnR(.8),{torso:[-2,-3,0],head:[-2,7,-5],armR:ARM.hang,handR:'relax',armL:ARM.hang,handL:'relax'}))],
       layers:[{on:'sh',v:[4,0],...beat(4.6,3.55,4.05,{decay:.4})},{on:'hipsT',v:[0,.008,0],...beat(4.6,3.55,4.05,{decay:.4})}],drag:.85}}},
  // Risa que se tapa la boca con la mano y se encoge.
  'behavior-04':{F:{duration:3,peak:.25,
    face:{attitudes:[A(.28,smile(.6,.3),.2),A(.6,mix(laugh(.85),HAPPY_EYES(.8)),.22,{ov:.08}),A(1.7,mix(smile(.95,.3),lids(.4)),.35),A(2.3,smile(.6),.35)],pulses:[{t0:.62,t1:1.5,f:5,decay:.5,ch:{jawOpen:.12,...pair('mouthUpperUp',.06)}}],blinks:[2]},
    body:{keys:[key(.3,{torso:[-4,0,0],head:[-6,0,4],sh:[6,0],arms:ARM.loose}),
      key(.62,{torso:[9,-4,0],head:[10,6,9],sh:[13,4],hipsT:[0,-.02,0],armR:arm('mouth',{off:[0,-.1,.18]}),handR:'soft',armL:ARM.belly,handL:'soft',feet:{knee:-.03}},'o',.08),
      key(1.5,{torso:[7,-3,0],head:[7,5,10],sh:[10,4],hipsT:[0,-.015,0],armR:arm('mouth',{off:[0,-.1,.18]}),handR:'soft',armL:ARM.belly,handL:'soft',feet:{knee:-.03}}),
      key(2.15,P(onL(.6),{torso:[0,0,0],head:[0,-2,7],arms:ARM.loose}))],
     layers:[{on:'torso',v:[2.5,0,0],...beat(5,.62,1.55,{decay:.6})},{on:'sh',v:[5,0],...beat(5,.62,1.55,{decay:.6})},{on:'head',v:[-2,0,0],...beat(5,.62,1.55,{decay:.6,lag:.05})}]}}},
  // Carcajada masculina: intenta aguantarse con el puño en la boca → estalla hacia atrás con las manos en
  // la barriga → se dobla y se da palmadas en el muslo → apoya las manos en las rodillas sin aire → se
  // endereza secándose una lágrima y negando con la cabeza. Las manos en el muslo se apoyan en la tela
  // (punto «muslo» medido en la superficie del pantalón), sin hundirse en un pantalón ancho.
  'behavior-05':{M:{duration:5.4,peak:.38,
    face:{attitudes:[A(.35,mix(smile(.6),pair('mouthPress',.6),pair('cheekSquint',.6),pair('eyeSquint',.45),{mouthRollLower:.25},look(.2,-.3)),.2),
      A(.85,mix(laugh(1.1),{jawOpen:.72,browInnerUp:.5}),.18,{ov:.08}),
      A(2,mix(laugh(1.05),lids(.75),{jawOpen:.6}),.25),
      A(3.5,mix(laugh(.8),lids(.6),{jawOpen:.42}),.3),
      A(4.05,mix(smile(1,.6),HAPPY_EYES(.6),{browInnerUp:.5}),.35),A(4.65,smile(.75,.2),.4)],
      pulses:[{t0:.9,t1:3.65,f:4.8,decay:.2,ch:{jawOpen:.2,...pair('mouthUpperUp',.08),...pair('mouthStretch',.06)}},{t0:4.05,t1:4.6,f:4,decay:.5,ch:{jawOpen:.08}}],blinks:[.25,4]},
    body:{keys:[key(.35,{hipsT:[0,-.012,0],torso:[7,0,0],head:[9,-7,0],sh:[10,4],armR:arm('mouth',{with:'knuckles',off:[0,-.1,.18]}),handR:'loose',armL:ARM.hang,...mStance()}),
      key(.85,{hipsT:[0,.01,0],torso:[-13,0,0],chest:[-4,0,0],head:[-22,0,4],sh:[10,0],arms:ARM.bellyLaugh,hands:'soft',...mStance()},'o',.1),
      key(1.4,{hipsT:[0,.004,0],torso:[-10,3,0],chest:[-3,0,0],head:[-18,-4,-5],sh:[9,0],arms:ARM.bellyLaugh,hands:'soft',...mStance()}),
      key(2,{hips:[15,0,0],hipsT:[0,-.1,-.085],torso:[33,0,0],head:[-22,0,3],sh:[6,6],armR:ARM.knee,handR:'soft',armL:ARM.bellyLaugh,handL:'soft',...mStance({L:{knee:.06},R:{knee:.06}})},'io',.05),
      ...[2.36,2.82].flatMap(t=>[
        key(t-.16,{hips:[15,0,0],hipsT:[0,-.092,-.085],torso:[29,0,0],head:[-19,0,3],sh:[8,6],armR:arm('knee',{off:[.45,2.6,.9],free:true}),handR:'open',armL:ARM.bellyLaugh,handL:'soft',...mStance({L:{knee:.06},R:{knee:.06}})},'o'),
        key(t,{hips:[15,0,0],hipsT:[0,-.104,-.085],torso:[34,0,0],head:[-22,0,3],sh:[5,6],armR:ARM.knee,handR:'flat',armL:ARM.bellyLaugh,handL:'soft',...mStance({L:{knee:.06},R:{knee:.06}})},'i'),
        key(t+.12,{hips:[15,0,0],hipsT:[0,-.104,-.085],torso:[34,0,0],head:[-22,0,3],sh:[5,6],armR:ARM.knee,handR:'soft',armL:ARM.bellyLaugh,handL:'soft',...mStance({L:{knee:.06},R:{knee:.06}})})]),
      key(3.5,{hips:[12,0,0],hipsT:[0,-.09,-.075],torso:[28,0,0],head:[-16,0,0],sh:[2,6],arms:ARM.knee,hands:'soft',...mStance({L:{knee:.06},R:{knee:.06}})},'io'),
      key(4.05,P(mOnL(.6),{hipsT:[0,-.01,0],torso:[-3,0,0],head:[-5,4,7],sh:[6,0],armR:ARM.eye,handR:'loose',armL:ARM.bellyLaugh,handL:'soft'}),'io',.05),
      key(4.7,P(mOnL(.8),{torso:[0,0,0],head:[0,5,5],armR:ARM.hang,handR:'relax',armL:ARM.hang,handL:'relax'}))],
     layers:[{on:'sh',v:[7,0],...beat(4.8,.9,3.65,{decay:.2})},{on:'torso',v:[3,0,0],...beat(4.8,.9,3.65,{decay:.2})},{on:'hipsT',v:[0,-.008,0],...beat(4.8,.9,3.65,{decay:.2})},{on:'head',v:[-3,0,0],...beat(4.8,.9,3.65,{decay:.2,lag:.06})},
       {on:'head',v:[0,6,0],f:2.2,t0:4.05,t1:4.75,in:.15,out:.25}],drag:.9}}},
  // Orgullo: mano en la cadera, la otra sobre el pecho («¿quién, yo?»), barbilla arriba y cadera fuera.
  'behavior-10':{
    // Orgullo masculino: «¿yo?» modesto → se infla en jarras (pecho fuera, hombros atrás, barbilla alta) →
    // mira al horizonte → se señala el pecho con el pulgar dos veces → se balancea en los talones, satisfecho.
    M:{duration:4.6,peak:.3,
      face:{attitudes:[A(.35,mix(smile(.35),look(0,-.4),lids(.25)),.3),
        A(.95,mix(SMUG,pair('browOuterUp',.45,.7)),.3,{ov:.08}),
        A(1.75,mix(SMUG,lids(.45),look(-.25,.15)),.35),
        A(2.35,mix(smile(.85,.3),pair('browOuterUp',.7),{browInnerUp:.3}),.2),
        A(3.25,mix(SMUG,smile(.7)),.35),A(4,mix(scale(SMUG,.7),smile(.5)),.4)],blinks:[.3,1.55,3.05]},
      body:{keys:[key(.35,{hipsT:[0,-.015,0],torso:[5,0,0],head:[9,-4,0],sh:[4,6],arms:ARM.hang,hands:'relax'}),
        key(.95,P(mOnR(1.1),{hipsT:[0,.012,0],torso:[-10,-5,0],chest:[-6,0,0],head:[-11,4,-3],sh:[-3,-8],arms:ARM.hipsFist,hands:'fist'}),'o',.12),
        key(1.75,P(mOnR(1.1),{hipsT:[0,.01,0],torso:[-10,-6,0],chest:[-6,0,0],head:[-10,42,-7],sh:[-3,-8],arms:ARM.hipsFist,hands:'fist'})),
        // La mano sale hacia delante antes de ir al pecho: así el antebrazo no cruza el peto.
        key(2.1,P(mOnR(1),{torso:[-8,-4,0],chest:[-6,0,0],head:[-7,8,0],sh:[-2,-6],armR:arm('thumbChest',{off:[.35,-.1,1.3],free:true}),handR:'thumb',armL:ARM.hipsFist,handL:'fist'})),
        key(2.3,P(mOnR(1),{torso:[-7,-2,0],chest:[-6,0,0],head:[-6,2,3],sh:[-2,-6],armR:ARM.thumbChest,handR:'thumb',armL:ARM.hipsFist,handL:'fist'}),'o',.08),
        key(2.48,P(mOnR(1),{torso:[-8,-2,0],chest:[-6,0,0],head:[-7,2,3],sh:[-2,-6],armR:arm('thumbChest',{off:[.1,0,.55],free:true}),handR:'thumb',armL:ARM.hipsFist,handL:'fist'}),'o'),
        key(2.64,P(mOnR(1),{torso:[-7,-2,0],chest:[-6,0,0],head:[-5,2,3],sh:[-2,-6],armR:ARM.thumbChest,handR:'thumb',armL:ARM.hipsFist,handL:'fist'}),'i'),
        key(2.82,P(mOnR(1),{torso:[-7,-2,0],chest:[-6,0,0],head:[-6,2,3],sh:[-2,-6],armR:ARM.thumbChest,handR:'thumb',armL:ARM.hipsFist,handL:'fist'})),
        key(3.3,P(mOnR(1.1,{L:{heel:12},R:{heel:12}}),{hipsT:[0,.035,0],torso:[-10,-5,0],chest:[-6,0,0],head:[-12,6,-4],sh:[-3,-8],arms:ARM.hipsFist,hands:'fist'}),'io',.06),
        key(3.62,P(mOnR(1.1),{hipsT:[0,.004,0],torso:[-9,-5,0],chest:[-6,0,0],head:[-6,6,-4],sh:[-3,-8],arms:ARM.hipsFist,hands:'fist'}),'io'),
        key(4,P(mOnR(1.1),{hipsT:[0,.01,0],torso:[-10,-5,0],chest:[-6,0,0],head:[-11,6,-4],sh:[-3,-8],arms:ARM.hipsFist,hands:'fist'}))],drag:.9}},
    F:{duration:4.2,peak:.3,
    face:{attitudes:[A(.5,smile(.3),.3),A(1,mix(smirk(.85),smile(.5),lids(.32),pair('browOuterUp',.55,.66)),.35),A(2.9,mix(smirk(.7),smile(.55),lids(.22)),.4)],blinks:[.35,2.5]},
    body:{keys:[key(.4,{hipsT:[0,-.02,0],torso:[4,0,0],head:[4,0,0],arms:ARM.loose}),
      key(1,P(onR(1.25),{torso:[-8,-6,0],chest:[-5,0,0],head:[-10,12,-9],armR:ARM.hips,handR:'soft',armL:ARM.heart,handL:'soft',sh:[-2,-4],footL:{heel:10,yaw:8,off:[-.02,0,.04]}}),'o',.1),
      key(2.2,P(onR(1.25),{torso:[-8,-6,0],chest:[-5,0,0],head:[-8,14,-10],armR:ARM.hips,handR:'soft',armL:ARM.heart,handL:'soft',sh:[-2,-4],footL:{heel:10,yaw:8,off:[-.02,0,.04]}})),
      key(2.6,P(onR(1.25),{torso:[-7,-6,0],chest:[-5,0,0],head:[-2,14,-10],armR:ARM.hips,handR:'soft',armL:ARM.heart,handL:'soft',sh:[-2,-4],footL:{heel:10,yaw:8,off:[-.02,0,.04]}})),
      key(3.05,P(onR(1.2),{torso:[-8,-6,0],chest:[-5,0,0],head:[-9,12,-9],armR:ARM.hips,handR:'soft',armL:ARM.heart,handL:'soft',sh:[-2,-4],footL:{heel:10,yaw:8,off:[-.02,0,.04]}})),
      key(3.6,{arms:ARM.loose})]}}},
  // Tristeza que se abraza a sí misma: una mano sujeta el otro brazo, hombros hacia dentro.
  'behavior-11':{
    // Tristeza masculina, contenida: escucha → recibe el golpe (inspira de golpe) → se desinfla (hombros abajo y
    // hacia dentro, cabeza caída y a un lado) → se tapa los ojos → la mano baja a la boca con un suspiro → niega.
    M:{duration:5.2,peak:.5,life:.6,
      face:{attitudes:[A(.5,mix(attentive(.4),smile(.25)),.3),
        A(1.1,mix(surprise(.35),{browInnerUp:.85},pair('mouthPress',.3)),.15,{ov:0}),
        A(1.95,mix(sad(1.2),{browInnerUp:1},pair('mouthFrown',.95),pair('mouthPress',.35),lids(.3)),.6),
        A(2.8,mix(sad(1.2),{browInnerUp:1},lids(.7),pair('mouthPress',.5),{mouthRollLower:.3}),.4),
        A(3.75,mix(sad(1.1),{browInnerUp:.95},lids(.4),{mouthShrugLower:.55},pair('mouthFrown',.9),look(0,-.4)),.4),
        A(4.45,mix(sad(1),{browInnerUp:.9},lids(.35),look(-.2,-.45)),.4)],blinks:[1.05,2.45,4.15],out:.6},
      body:{keys:[key(.5,{torso:[3,0,0],head:[4,0,0],arms:ARM.hang}),
        key(1.1,{hipsT:[0,.008,0],torso:[-4,0,0],chest:[-2,0,0],head:[-4,0,0],sh:[9,0],arms:ARM.hang},'o',.06),
        key(2,{hipsT:[0,-.035,-.01],torso:[18,-3,0],head:[24,-10,6],sh:[-7,11],arms:ARM.hang,hands:'relax',...mStance({L:{knee:.02},R:{knee:.02}})},'io'),
        key(2.75,{hipsT:[0,-.03,-.01],torso:[16,-4,0],head:[24,-6,3],sh:[-5,11],armR:ARM.eyesPalm,handR:'soft',armL:ARM.hang,handL:'relax',...mStance({L:{knee:.02},R:{knee:.02}})},'io',.04),
        key(3.4,{hipsT:[0,-.032,-.01],torso:[17,-4,0],head:[26,-5,2],sh:[-5,12],armR:ARM.eyesPalm,handR:'soft',armL:ARM.hang,handL:'relax',...mStance({L:{knee:.02},R:{knee:.02}})}),
        key(3.75,{hipsT:[0,-.02,-.01],torso:[13,-3,0],head:[20,-6,3],sh:[5,8],armR:arm('mouth',{off:[0,-.25,.18]}),handR:'soft',armL:ARM.hang,handL:'relax',...mStance({L:{knee:.02},R:{knee:.02}})},'io'),
        key(4.3,{hipsT:[0,-.04,-.012],torso:[20,-3,0],head:[27,-9,6],sh:[-8,12],arms:ARM.hang,hands:'relax',...mStance({L:{knee:.02},R:{knee:.02}})},'io'),
        key(4.75,{hipsT:[0,-.04,-.012],torso:[20,-3,0],head:[26,-11,7],sh:[-8,12],arms:ARM.hang,hands:'relax',...mStance({L:{knee:.02},R:{knee:.02}})})],
       layers:[{on:'head',v:[0,5,0],f:1.1,t0:4.25,t1:5.1,in:.2,out:.3}],drag:1.1,breath:.8}},
    F:{duration:4.6,life:.7,
    face:{attitudes:[A(.6,sad(.5),.45),A(1.8,mix(sad(1),pair('mouthPress',.3)),.8),A(3.3,mix(sad(.85),look(-.3,-.35)),.5)],blinks:[1.1,2.8],out:.6},
    body:{keys:[key(.6,{torso:[2,0,0],head:[3,0,0]}),
      key(1.9,{torso:[12,-3,0],head:[18,-8,10],sh:[4,12],hipsT:[0,-.02,-.012],armL:ARM.hold,handL:'cup',armR:ARM.heavy,feet:{knee:-.03}}),
      key(3.3,{torso:[13,-4,0],head:[20,-10,11],sh:[3,13],hipsT:[0,-.024,-.012],armL:ARM.hold,handL:'cup',armR:ARM.heavy,footR:{heel:8,yaw:-8},footL:{knee:-.03}})],life:.7}}},
  // Llorar contenido, masculino: mira arriba parpadeando para no llorar → puño contra la boca, hombros que se
  // cierran y respiración entrecortada → se le escapa un sollozo → se tapa los ojos → respira hondo, mira a otro
  // lado y se recompone con una media sonrisa apretada.
  'behavior-13':{M:{duration:5.2,peak:.45,
    face:{attitudes:[A(.45,mix(HOLDBACK,look(0,.45)),.3),
      A(1.1,mix(HOLDBACK,pair('eyeSquint',.6),lids(.55)),.3),
      A(2.25,mix(cry(.7),{browInnerUp:1},lids(.6)),.18,{ov:.06}),
      A(2.75,mix(HOLDBACK,lids(.88),pair('eyeSquint',.6)),.3),
      A(3.75,mix(scale(HOLDBACK,.8),look(.3,.35)),.35),
      A(4.25,mix(sad(.65),pair('mouthPress',.5),pair('mouthSmile',.22)),.4)],
      pulses:[{t0:.5,t1:2.1,f:6.5,ch:{mouthShrugLower:.14}},{t0:3.5,t1:4.1,f:6.5,decay:.6,ch:{mouthShrugLower:.1}},{t0:2.2,t1:2.6,f:3,ch:{jawOpen:.08}}],blinks:[.6,.82,1,3.4,4]},
    body:{keys:[key(.45,{torso:[-2,0,0],head:[-9,0,0],sh:[7,0],arms:ARM.hang,hands:'relax',...mStance()}),
      key(1.1,{torso:[7,0,0],head:[10,6,-3],sh:[9,8],armR:ARM.fistMouth,handR:'fist',armL:ARM.hang,handL:'relax',...mStance()},'io',.04),
      key(2,{torso:[8,2,0],head:[12,7,-3],sh:[10,9],armR:ARM.fistMouth,handR:'fist',armL:ARM.hang,handL:'relax',...mStance()}),
      key(2.28,{hipsT:[0,-.012,0],torso:[12,0,0],head:[17,4,0],sh:[14,9],armR:ARM.fistMouth,handR:'fist',armL:ARM.hang,handL:'relax',...mStance()},'o',.08),
      key(2.8,{hipsT:[0,-.015,0],torso:[13,-2,0],head:[19,-4,2],sh:[9,9],armR:ARM.eyesPalm,handR:'soft',armL:ARM.hipsFist,handL:'fist',...mStance()},'io',.04),
      key(3.35,{hipsT:[0,-.015,0],torso:[13,-2,0],head:[20,-4,2],sh:[8,9],armR:ARM.eyesPalm,handR:'soft',armL:ARM.hipsFist,handL:'fist',...mStance()}),
      key(3.9,{hipsT:[0,.006,0],torso:[-5,-4,0],chest:[-3,0,0],head:[-8,-14,0],sh:[10,0],arms:ARM.hang,hands:'relax',...mStance()},'io',.05),
      key(4.4,{torso:[1,-2,0],head:[4,-6,3],sh:[-3,2],arms:ARM.hang,hands:'relax',...mStance()},'io'),
      key(4.8,{torso:[0,-1,0],head:[2,-4,3],arms:ARM.hang,hands:'relax',...mStance()})],
     layers:[{on:'sh',v:[6,0],...beat(2.4,1.3,2.15)},{on:'head',v:[-2.5,0,0],...beat(2.4,1.3,2.15,{lag:.04})},{on:'head',v:[6,0,0],f:2.2,t0:4.35,t1:4.95,in:.15,out:.2}],drag:1,breath:.6}}},
  // Temor: manos a la boca y al pecho, rodillas hacia dentro, paso atrás.
  'behavior-18':{F:{duration:4.2,peak:.3,
    face:{attitudes:[A(.3,surprise(.5),.15),A(.75,mix(fear(.95),{browInnerUp:1}),.3),A(3,fear(.8),.4),A(3.6,fear(.4),.3)],pulses:[{t0:1,t1:2.9,f:8,ch:{jawOpen:.04,...pair('mouthStretch',.05)}}],blinks:[1.6]},
    body:{keys:[key(.25,{torso:[-3,0,0],head:[-3,0,0],sh:[10,0]},'o'),
      key(.75,{footR:{off:[.02,0,-.18],knee:-.04},footL:{knee:-.04},hipsT:[-.01,-.045,-.07],torso:[-6,-8,0],head:[10,10,-7],sh:[16,6],armR:arm('mouth',{off:[0,-.3,.35]}),handR:'soft',armL:ARM.heart,handL:'soft'},'o',.1),
      key(2,{footR:{off:[.02,0,-.18],knee:-.04},footL:{knee:-.04},hipsT:[-.012,-.05,-.08],torso:[-7,-10,0],head:[11,12,-8],sh:[17,6],armR:arm('mouth',{off:[0,-.3,.3]}),handR:'soft',armL:ARM.heart,handL:'soft'}),
      key(3.1,{footR:{off:[.02,0,-.18]},hipsT:[-.01,-.035,-.06],torso:[-5,-7,0],head:[7,8,-5],sh:[12,4],armR:ARM.heart,handR:'soft',armL:ARM.loose}),
      key(3.75,{torso:[-2,0,0],sh:[4,0]})],
     layers:[{on:'lowerArm',v:[0,1.4,0],f:9,t0:.9,t1:3},{on:'torso',v:[.5,0,0],f:9,t0:.9,t1:3}]}}},
  // Frustración: pisotón con los puños abajo («¡uf!»), luego brazos cruzados, puchero y mirada a otro lado.
  'behavior-33':{F:{duration:3.8,peak:.25,
    face:{attitudes:[A(.4,angry(.7),.25),A(.9,mix(angry(1,.6),pair('eyeSquint',.9),lids(.6)),.25,{ov:.05}),A(2,mix(angry(.45),{cheekPuff:.55,mouthPucker:.35},look(-.5,0)),.4),A(3,angry(.3),.35)],pulses:[{t0:.92,t1:1.4,f:7,ch:{jawOpen:.05}}],blinks:[1.7]},
    body:{keys:[key(.4,{torso:[6,0,0],head:[6,0,0],sh:[10,0],hipsT:[0,-.01,0],arms:ARM.fists,hands:'fist',footR:{off:[0,.05,.02]}}),
      key(.9,{torso:[10,0,0],head:[12,0,0],sh:[14,0],hipsT:[0,-.04,0],arms:arm('fists',{u:[.3,-.95,-.1],f:[.25,-.95,.1]}),hands:'fist',footR:{off:[0,0,.02]}},'ii',.1),
      key(1.9,P(onL(1),{torso:[-4,-10,0],head:[-6,-25,-7],sh:[8,4],armR:ARM.cross,handR:'soft',armL:ARM.cross2,handL:'soft'}),'io',.06),
      key(2.9,P(onL(1),{torso:[-4,-9,0],head:[-5,-22,-6],sh:[6,4],armR:ARM.cross,handR:'soft',armL:ARM.cross2,handL:'soft'})),
      key(3.4,{torso:[0,0,0],arms:ARM.loose})]}}},
  // Vergüenza: se tapa la cara con las dos manos y luego asoma por encima de los dedos.
  'behavior-38':{F:{duration:4.6,peak:.3,
    face:{attitudes:[A(.5,mix(surprise(.3),ASHAMED),.3),A(1,mix(ASHAMED,pair('eyeSquint',.7),lids(.85)),.35),A(2.6,mix(ASHAMED,look(0,-.1),lids(.15)),.3),A(3.3,mix(scale(ASHAMED,.8),look(.3,-.3)),.3),A(4,scale(ASHAMED,.4),.3)],blinks:[2.95,3.6]},
    body:{keys:[key(.95,{torso:[10,-4,0],head:[18,-8,8],sh:[14,8],hipsT:[0,-.02,0],arms:ARM.cover,hands:'soft',footL:{knee:-.05},footR:{heel:16,yaw:-12,knee:-.05}},'io',.05),
      key(2.3,{torso:[10,-5,0],head:[19,-10,9],sh:[14,8],hipsT:[0,-.02,0],arms:ARM.cover,hands:'soft',footL:{knee:-.05},footR:{heel:16,yaw:-12,knee:-.05}}),
      key(2.8,{torso:[7,-3,0],head:[12,-6,6],sh:[12,7],arms:arm('cover',{off:[-.1,-.6,.25]}),hands:'soft',footR:{heel:12,yaw:-10}}),
      key(3.5,{torso:[5,-3,0],head:[9,-6,5],sh:[9,5],armR:ARM.nape,handR:'soft',armL:ARM.belly,handL:'soft'}),
      key(4,{torso:[3,-1,0],head:[5,-2,4],sh:[5,3],armR:ARM.nape,handR:'soft'})]}}},
  // Timidez: manos entrelazadas abajo con los dedos inquietos, punta del pie que gira y balanceo del tronco.
  // (Delante y no a la espalda: así vale también para personajes con mochila o capa.)
  'behavior-39':{F:{duration:4.4,
    face:{attitudes:[A(.8,mix(SHY,look(.1,-.45)),.5),A(1.9,mix(scale(SHY,1.3),look(0,.3)),.3),A(2.7,mix(SHY,look(-.45,-.3)),.3),A(3.6,scale(SHY,.6),.4)],blinks:[1.5,2.3,3.1]},
    body:{keys:[key(.9,P(onL(.9),{torso:[4,6,0],head:[12,8,11],sh:[11,7],arms:ARM.low,hands:'cup',footR:{heel:28,yaw:-16,off:[-.02,0,.03]}})),
      key(1.9,P(onL(1),{torso:[3,8,0],head:[7,5,12],sh:[11,7],arms:ARM.low,hands:'cup',footR:{heel:28,yaw:-4,off:[-.02,0,.03]}})),
      key(2.7,P(onL(1),{torso:[5,-3,0],head:[13,-9,8],sh:[12,7],arms:ARM.low,hands:'cup',footR:{heel:28,yaw:-16,off:[-.02,0,.03]}})),
      key(3.7,{torso:[2,0,0],head:[4,0,3]})],
     layers:[{on:'torso',v:[0,6,0],f:.7,t0:.9,t1:3.5,in:.4,out:.4},{on:'hand',v:[0,0,7],f:2.1,t0:1,t1:3.3,in:.3,out:.3}]}}},
  // Saludo pequeño junto al hombro: codo bajo, la muñeca hace el trabajo, punta del pie arriba.
  'behavior-40':{F:{duration:3.4,peak:.4,
    face:{attitudes:[A(.3,mix(attentive(.8),smile(.5)),.2),A(.65,mix(smile(1,.5),pair('cheekSquint',.7)),.25,{ov:.1}),A(2.45,smile(.8,.2),.4)],blinks:[.18,1.9]},
    body:{keys:[key(.2,{hipsT:[0,-.01,0],torso:[2,0,0],sh:[4,0],armR:ARM.loose}),
      key(.62,P(onL(.7),{torso:[-2,4,0],head:[-2,-4,-11],sh:[8,0],armR:ARM.waveF,handR:'open',armL:ARM.low,handL:'soft',footR:{heel:12}}),'o',.14),
      key(2.3,P(onL(.8),{torso:[-2,5,0],head:[-1,-4,-12],sh:[6,0],armR:ARM.waveF,handR:'open',armL:ARM.low,handL:'soft',footR:{heel:12}})),
      key(2.9,{head:[0,0,-3]})],
     layers:[{on:'lowerArmR',v:[0,9,0],f:3.2,t0:.7,t1:2.35,in:.1},{on:'handR',v:[0,22,0],f:3.2,t0:.7,t1:2.35,in:.1,lag:.05}]}}},
  // Guiño con la V junto al ojo y la otra mano en la cadera.
  'behavior-49':{F:{duration:2.2,peak:.28,
    face:{attitudes:[A(.28,attentive(.6),.18),A(.55,{eyeBlinkLeft:1,cheekSquintLeft:.9,eyeSquintLeft:.6,mouthSmileLeft:.9,mouthSmileRight:.6,mouthDimpleLeft:.3,browDownLeft:.4,browOuterUpRight:.8,browInnerUp:.25,mouthLeft:.12,cheekSquintRight:.35,...pair('mouthUpperUp',.2),...pair('mouthLowerDown',.18)},.12,{ov:0}),A(1.05,smile(.8),.16),A(1.65,smile(.5),.3)],out:.3},
    body:{keys:[key(.26,{head:[-3,0,0],torso:[-2,0,0],sh:[4,0]}),
      key(.55,P(onR(.7),{head:[4,8,-13],torso:[2,5,-3],sh:[6,0],armR:ARM.peace,handR:'peace',armL:ARM.hips,handL:'soft'}),'oo',.15),
      key(1.05,P(onR(.7),{head:[2,7,-11],torso:[1,4,-2],sh:[4,0],armR:ARM.peace,handR:'peace',armL:ARM.hips,handL:'soft'})),
      key(1.7,{head:[0,2,-3]})],drag:.7}}}
};
/** Receta de una actuación en un estilo: variante de autor o adaptación automática. */
export function actingFor(id,style){
  const a=ACTINGS.find(x=>x.id===id);if(!a)throw Error('Actuación desconocida.');if(!style)return a;
  if(!STYLES.some(s=>s.id===style))throw Error('Estilo de actuación desconocido.');
  const v=VARIANTS[id]?.[style];
  if(!v)return styled(a,style);
  return Object.freeze({...a,...v,id:a.id,name:a.name,style,authored:true,face:{...v.face},body:{...v.body}});
}
export const recipeKey=(id,style)=>style?id+'@'+style:id;
// El motor corporal busca la receta por `recipeKey(acting.id, acting.style)`; las 50 base siguen por su id.
export const ACTING_BY_ID=new Map(ACTINGS.map(a=>[a.id,a]));
for(const a of ACTINGS)for(const s of STYLES)ACTING_BY_ID.set(recipeKey(a.id,s.id),actingFor(a.id,s.id));
export function validateActing(a){
  if(!a||a.version!==1||!ACTING_BY_ID.has(a.id)||a.id.includes('@')||(a.style!==undefined&&!STYLES.some(s=>s.id===a.style))||!Number.isFinite(a.intensity)||a.intensity<0||a.intensity>1)throw Error('Receta corporal de actuación inválida.');
  return a;
}
const compiled=new Map();
/** Curvas faciales de una actuación, compiladas una sola vez. */
export function actingChannels(id,style){
  const k=recipeKey(id,style),a=ACTING_BY_ID.get(k);if(!a||id.includes('@'))throw Error('Actuación desconocida.');
  if(!compiled.has(k))compiled.set(k,faceTrack(a.duration,a.face.attitudes,a.face));
  return JSON.parse(JSON.stringify(compiled.get(k)));
}
export function actingPreset(id,style){
  const a=ACTING_BY_ID.get(recipeKey(id,style)),channels=actingChannels(id,style),soft=Object.keys(channels).filter(STEADY),label=STYLES.find(s=>s.id===style)?.name;
  const acting={version:1,id,intensity:INTENSITY_REFERENCE,...(style?{style}:{})};
  return {schema:'spanstories.facial-animation',version:1,id:'acting.'+id+(style?'.'+style:''),name:a.name+(label?' · '+label.toLowerCase():''),category:'Actuaciones · cuerpo + rostro',tags:['actuación',id,...(label?[label.toLowerCase()]:[])],type:'animation',fpsReference:30,timeUnit:'seconds',duration:a.duration,loop:false,rig:'ARKit-52',interpolation:'spline',channels,intensity:{reference:INTENSITY_REFERENCE,soft},source:{kind:'original',license:'internal',author:'SpanStories'},review:{status:'candidate'},defaults:{duration:a.duration,intensity:INTENSITY_REFERENCE,fadeIn:0,fadeOut:0,trimStart:0,trimEnd:a.duration,priority:0,blend:'override',loop:false,movement:{id:'none',intensity:0,delay:0},acting}};
}
export function actingProject(id,intensity=INTENSITY_REFERENCE,style){
  const p=actingPreset(id,style);
  return {schema:'spanstories.facial-project',version:1,presets:[p],instances:[{id:'instance.'+id+(style?'.'+style:''),presetId:p.id,start:0,duration:p.duration,intensity,fadeIn:0,fadeOut:0,trimStart:0,trimEnd:p.duration,priority:0,blend:'override',loop:false,movement:{id:'none',intensity:0,delay:0},acting:{version:1,id,intensity,...(style?{style}:{})}}],favorites:[]};
}
// A channel slider sets its peak, preserving its authored timing and neutral endpoints.
export function channelPeak(preset,channel,value){
  if(!Number.isFinite(value)||value<0||value>1)throw Error('Intensidad de shape key fuera de rango.');
  const keys=preset.channels[channel],max=keys?Math.max(...keys.map(k=>k[1])):0;
  return max>0?keys.map(([t,v])=>[t,v/max*value]):[[0,0],[preset.duration*.36,value],[preset.duration*.78,value*.9],[preset.duration,0]];
}
