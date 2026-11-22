import {validatePreset} from './FacialCore.mjs';
const pair=(name,left,right=left)=>({[name+'Left']:left,[name+'Right']:right});
function preset(id,name,category,pose,{duration=2.4,tags=[],loop=false,peaks}={}) {
  const channels={};
  for(const [n,v] of Object.entries(pose))channels[n]=peaks?.[n]||[[0,0],[duration*.18,v*.38],[duration*.4,v],[duration*.67,v*.94],[duration,0]];
  return validatePreset({schema:'spanstories.facial-animation',version:1,id,name,category,tags,type:'animation',fpsReference:30,timeUnit:'seconds',duration,loop,rig:'ARKit-52',interpolation:'smoothstep',channels,source:{kind:'original',license:'internal',author:'SpanStories'},review:{status:'candidate',note:'Revisar visualmente en cada personaje.'}});
}
export const BASE_PRESETS = [
  preset('joy.soft.01','Sonrisa leve','Alegría',{...pair('mouthSmile',.48,.45),...pair('cheekSquint',.18,.17)},{tags:['feliz','sonrisa']}),
  preset('joy.very-happy.01','Muy feliz','Alegría',{...pair('mouthSmile',.96,.93),...pair('cheekSquint',.48,.46),...pair('browOuterUp',.32,.29),...pair('eyeBlink',1),...pair('mouthStretch',.35),...pair('mouthDimple',.22),...pair('mouthUpperUp',.14),browInnerUp:.9,jawOpen:.38},{duration:3.4,tags:['feliz','alegría','entusiasmo'],peaks:{jawOpen:[[0,0],[.7,.18],[1.1,.38],[1.4,.3],[1.8,.38],[2.3,.28],[3.4,0]]}}),
  preset('joy.laugh.01','Risa breve','Alegría',{...pair('mouthSmile',.87,.84),...pair('cheekSquint',.48,.46),...pair('eyeBlink',.72,.68),jawOpen:.24},{duration:2.2,tags:['riendo','risa'],peaks:{jawOpen:[[0,0],[.5,.12],[.75,.27],[1,.14],[1.25,.25],[1.5,.12],[2.2,0]]}}),
  preset('sad.contained.01','Tristeza contenida','Tristeza',{browInnerUp:.86,...pair('mouthFrown',.67,.63),...pair('eyeBlink',.14,.16),mouthShrugLower:.18},{tags:['triste','pena']}),
  preset('sad.worry.01','Preocupación','Tristeza',{browInnerUp:.8,...pair('browDown',.15,.18),...pair('mouthFrown',.5,.47),...pair('eyeWide',.18,.16)},{tags:['preocupada','temor']}),
  preset('anger.annoyed.01','Molestia','Enojo',{...pair('browDown',.72,.68),...pair('eyeSquint',.24,.22),...pair('mouthPress',.48,.45),...pair('mouthFrown',.32,.3)},{tags:['molesta','enfado']}),
  preset('surprise.light.01','Sorpresa leve','Sorpresa',{browInnerUp:.78,...pair('browOuterUp',.65,.62),...pair('eyeWide',.72,.68),jawOpen:.24,mouthFunnel:.22},{duration:1.8,tags:['sorprendida','asombro']}),
  preset('thought.doubt.01','Duda','Pensamiento',{...pair('browOuterUp',.74,.12),...pair('browDown',.08,.44),...pair('mouthPress',.24,.34),mouthLeft:.14},{tags:['confundida','pensando','escepticismo']}),
  preset('social.shy.01','Vergüenza','Interacción',{...pair('mouthSmile',.44,.25),...pair('cheekSquint',.18,.14),...pair('eyeLookDown',.25,.25),browInnerUp:.23},{tags:['avergonzada','timidez']}),
  preset('micro.wink.01','Guiño izquierdo','Microgestos',{eyeBlinkLeft:1,cheekSquintLeft:.2},{duration:.8,tags:['guiño','ojo izquierdo']}),
  preset('micro.blink.01','Parpadeo','Microgestos',{...pair('eyeBlink',1)},{duration:.3,loop:true,tags:['ojos','parpadear']}),
  preset('micro.brow.01','Elevar ceja','Microgestos',{browOuterUpLeft:.82,browInnerUp:.22},{duration:1.2,tags:['cejas','curiosidad']}),
  preset('joy.relief.01','Alivio','Alegría',{...pair('mouthSmile',.32,.3),...pair('eyeBlink',.35),browInnerUp:.28},{duration:3,tags:['descanso','tranquilidad']}),
  preset('joy.enthusiasm.01','Entusiasmo','Alegría',{...pair('mouthSmile',.78,.74),...pair('browOuterUp',.56,.5),...pair('eyeWide',.3),...pair('cheekSquint',.24)},{duration:2,tags:['feliz','emoción']}),
  preset('joy.pride.01','Orgullo discreto','Alegría',{...pair('mouthSmile',.4,.25),...pair('mouthPress',.12),...pair('eyeSquint',.14)},{duration:2.8,tags:['satisfacción']}),
  preset('sad.disappointment.01','Decepción','Tristeza',{...pair('mouthFrown',.57,.54),...pair('eyeLookDown',.28),browInnerUp:.48},{duration:3,tags:['decepcionada']}),
  preset('sad.near-tears.01','Al borde del llanto','Tristeza',{browInnerUp:.95,...pair('browDown',.23),...pair('mouthFrown',.75,.72),mouthShrugLower:.3,...pair('eyeBlink',.22)},{duration:3.4,tags:['llorar','pena']}),
  preset('sad.lonely.01','Melancolía','Tristeza',{browInnerUp:.52,...pair('mouthFrown',.32),...pair('eyeLookDown',.4),...pair('eyeBlink',.24)},{duration:4,tags:['nostalgia']}),
  preset('anger.frustration.01','Frustración','Enojo',{...pair('browDown',.8,.75),...pair('mouthPress',.7,.67),...pair('eyeBlink',.4),mouthShrugLower:.18},{duration:2.6,tags:['frustrada']}),
  preset('anger.disbelief.01','Incredulidad','Enojo',{...pair('browOuterUp',.74,.25),...pair('browDown',.08,.45),...pair('eyeWide',.23),...pair('mouthPress',.4,.27)},{duration:2.2,tags:['incrédula','no puede ser']}),
  preset('anger.determination.01','Determinación','Enojo',{...pair('browDown',.5,.47),...pair('eyeSquint',.3),...pair('mouthPress',.42)},{duration:3,tags:['decidida','firme']}),
  preset('surprise.intense.01','Asombro intenso','Sorpresa',{browInnerUp:.95,...pair('browOuterUp',.82),...pair('eyeWide',.88),jawOpen:.4,mouthFunnel:.4},{duration:2,tags:['asombrada']}),
  preset('fear.startle.01','Susto','Miedo',{browInnerUp:.86,...pair('browOuterUp',.62),...pair('eyeWide',.9),...pair('mouthStretch',.3),jawOpen:.28},{duration:1.4,tags:['asustada']}),
  preset('fear.apprehension.01','Temor contenido','Miedo',{browInnerUp:.7,...pair('browDown',.26),...pair('eyeWide',.42),...pair('mouthPress',.28),...pair('mouthFrown',.24)},{duration:3,tags:['miedo','inseguridad']}),
  preset('thought.focus.01','Concentración','Pensamiento',{...pair('browDown',.36,.31),...pair('eyeSquint',.24),...pair('mouthPress',.2)},{duration:3.2,tags:['concentrada']}),
  preset('thought.curiosity.01','Curiosidad','Pensamiento',{browInnerUp:.46,...pair('browOuterUp',.6,.48),...pair('eyeWide',.28),...pair('mouthSmile',.16)},{duration:2.4,tags:['curiosa']}),
  preset('thought.skepticism.01','Escepticismo','Pensamiento',{...pair('browOuterUp',.85,.06),...pair('browDown',.05,.6),...pair('eyeSquint',.08,.36),mouthLeft:.25},{duration:2.6,tags:['escéptica','duda']}),
  preset('thought.realization.01','Comprensión repentina','Pensamiento',{browInnerUp:.48,...pair('browOuterUp',.44),...pair('eyeWide',.32),...pair('mouthSmile',.34,.3)},{duration:1.8,tags:['entender','ahora entiendo']}),
  preset('social.listening.01','Escucha atenta','Interacción',{browInnerUp:.25,...pair('browOuterUp',.42,.32),...pair('eyeWide',.24),...pair('mouthSmile',.2,.18)},{duration:3.2,tags:['escuchando']}),
  preset('social.side-eye.01','Mirada de reojo','Interacción',{eyeLookOutLeft:.52,eyeLookInRight:.52,...pair('eyeSquint',.12,.26),browOuterUpRight:.38},{duration:2,tags:['de lado','mirar']}),
  preset('social.tired.01','Cansancio','Interacción',{...pair('eyeBlink',.58,.55),browInnerUp:.3,mouthShrugLower:.12},{duration:3.8,tags:['cansada','sueño']}),
  preset('disgust.light.01','Desagrado leve','Desagrado',{...pair('noseSneer',.55,.48),...pair('mouthUpperUp',.23),...pair('browDown',.3),...pair('eyeSquint',.16)},{duration:2,tags:['asco','rechazo']}),
  preset('micro.double-blink.01','Doble parpadeo','Microgestos',{...pair('eyeBlink',1)},{duration:.85,peaks:{eyeBlinkLeft:[[0,0],[.12,1],[.27,0],[.42,1],[.62,0],[.85,0]],eyeBlinkRight:[[0,0],[.13,1],[.28,0],[.43,1],[.63,0],[.85,0]]},tags:['ojos']}),
  preset('micro.lip-press.01','Apretar labios','Microgestos',{...pair('mouthPress',.65,.6),mouthShrugLower:.12},{duration:1.2,tags:['labios','contención']}),
  preset('micro.wink-right.01','Guiño derecho','Microgestos',{eyeBlinkRight:1,cheekSquintRight:.2},{duration:.8,tags:['guiño','ojo derecho']}),
  preset('micro.brow-both.01','Saludo de cejas','Microgestos',{...pair('browOuterUp',.6),browInnerUp:.7},{duration:.9,tags:['cejas','saludo']})
];
