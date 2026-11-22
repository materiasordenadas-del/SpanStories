// Rostro de las 50 actuaciones cotidianas (51–100 en el panel; ids `daily-1`…`daily-50`).
//
// El cuerpo es un clip de mocap en bucle de duración variable (ActuacionesCotidianas.mjs + CuerpoBiblioteca.mjs),
// así que el rostro se escribe en FASE (0…1 del ciclo) y se compila en segundos cuando se conoce la duración del clip.
// Todo lo que sigue es general: canales ARKit por nombre, sin nada de un personaje concreto.
//
// Cómo está escrita cada cara (una intención por actuación, ver la ficha `intencion`)
// · base: la expresión de reposo del ciclo. El ciclo empieza y termina en ella → el bucle no salta.
// · beats: [fase, pose, entrada (s), sobrepaso]. La pose se superpone a la base (lo que no nombra, sigue la base).
//   El compilador adelanta cejas y ojos frente a la boca (líder/seguidores), desfasa izquierda/derecha,
//   pasa un poco el valor al llegar y asienta, y desgasta la pose durante la pausa.
// · ojos: mirada de reposo [x, y]; mira: [fase, x, y] sacadas rápidas (≤ 0,08 s) hacia objetivos con sentido.
// · habla / risa / grito: tramos [fase0, fase1, energía] → sílabas del español con vocales a-e-i-o-u,
//   cierres labiales y acentos de cejas en las sílabas tónicas (tipo de acento: 'cejas' o 'ceño').
// · ritmo del parpadeo: según el estado (calma, viva, fijo, tenso, triste, pantalla). Los parpadeos caen
//   primero en los giros de cabeza del mocap (`eventos`), luego en los cambios de pensamiento y solo
//   después se rellenan huecos, con espaciado irregular. Cierre rápido, contacto con rebote, apertura lenta,
//   y la ceja y la mejilla acompañan el cierre.
// · acentoCabeza: en las actuaciones de asentir, las cejas suben con cada cabeceo medido en el mocap.
import {FACE} from './ActingLibrary.mjs';

const {smile,laugh,sad,angry,surprise,smirk,doubt,ponder,tired,tense,attentive,mix,scale,pair}=FACE;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const REFERENCIA=.75;

// ---------- Vocabulario propio de la vida diaria ----------
const sinMirada=p=>Object.fromEntries(Object.entries(p||{}).filter(([n])=>!n.startsWith('eyeLook')));
/** Amabilidad de reposo: comisuras apenas arriba y ceja interior suelta. */
const amable=(s=1)=>({...pair('mouthSmile',.16*s,.14*s),...pair('cheekSquint',.07*s),browInnerUp:.08*s,...pair('mouthDimple',.06*s)});
/** Neutro atento: cejas un poco arriba, ojos algo abiertos, boca cerrada. */
const atento=(s=1)=>({browInnerUp:.22*s,...pair('browOuterUp',.16*s,.13*s),...pair('eyeWide',.1*s),...pair('mouthPress',.08*s)});
/** Concentración: ceño leve, párpado inferior tenso, labios recogidos. */
const foco=(s=1)=>({...pair('browDown',.36*s,.32*s),...pair('eyeSquint',.26*s),...pair('mouthPress',.24*s),mouthRollLower:.12*s});
/** Curiosidad: cejas arriba y algo de apertura de ojos, sin sonrisa. */
const curioso=(s=1)=>({browInnerUp:.42*s,...pair('browOuterUp',.5*s,.44*s),...pair('eyeWide',.2*s)});
/** Reproche: ceja oblicua (interior arriba + ceño), labios apretados. */
const reproche=(s=1)=>({browInnerUp:.48*s,...pair('browDown',.44*s,.4*s),...pair('mouthPress',.55*s),...pair('mouthFrown',.3*s),...pair('eyeSquint',.22*s),mouthShrugLower:.18*s});
/** Resoplido: mejillas que se inflan y nariz que se arruga un instante. */
const resoplido={cheekPuff:.35,...pair('mouthPress',.6),...pair('noseSneer',.22),...pair('browDown',.4)};
/** Bostezo contenido: mandíbula abre, ojos se aprietan, cejas suben un poco. */
const bostezo={jawOpen:.5,mouthFunnel:.18,...pair('mouthStretch',.2),...pair('eyeSquint',.5),...pair('eyeBlink',.55),browInnerUp:.32,...pair('browOuterUp',.18),...pair('mouthLowerDown',.12)};
/** Labios en el borde del vaso o la taza. */
const sorber={mouthPucker:.42,mouthFunnel:.24,...pair('mouthPress',.12),jawOpen:.06,...pair('eyeSquint',.1)};
/** Alivio tras beber o suspirar: soltar aire, párpados que caen un poco. */
const alivio={...pair('mouthSmile',.24,.2),browInnerUp:.2,...pair('eyeBlink',.3),jawOpen:.06,...pair('cheekSquint',.12)};
/** Suspiro: labios redondeados que sueltan aire y cejas internas arriba. */
const suspiro={mouthFunnel:.22,jawOpen:.08,browInnerUp:.3,...pair('eyeBlink',.25),...pair('mouthPress',.08)};
/** Guiño a medias (ojo izquierdo entornado) para la pose juguetona. */
const entornaIzq={eyeSquintLeft:.55,eyeBlinkLeft:.38,cheekSquintLeft:.7};
/** Grito de alegría: boca muy abierta enseñando dientes, ojos entornados por las mejillas. */
const vitoreo=mix(smile(1,1),{jawOpen:.58,...pair('mouthUpperUp',.5),...pair('mouthLowerDown',.45),...pair('eyeSquint',.6),...pair('browOuterUp',.62),browInnerUp:.45});
/** Ceja «por aquí»: una sola ceja arriba, amable. */
const porAqui={browOuterUpLeft:.62,browInnerUp:.24,mouthSmileLeft:.34,mouthSmileRight:.22,cheekSquintLeft:.2};

// ---------- Fichas ----------
// Cada ficha: intencion (una frase), base, beats, ojos, mira, habla/risa/grito, ritmo, acento, acentoCabeza, lectura.
const F=(intencion,spec)=>({intencion,...spec});
const FICHAS=[
  // ---- Conversación › Explicar ----
  F('Explica algo sencillo sin prisa y comprueba que le siguen.',{base:amable(1),
    beats:[[.17,smile(.3),.35],[.3,amable(1),.5],[.52,mix(amable(1),atento(1.3)),.25],[.64,amable(1),.5],[.82,smile(.28),.4]],
    habla:[[.04,.44,.7],[.53,.93,.72]],mira:[[.46,-.22,.12],[.51,0,0]],ritmo:'calma',acento:.8}),
  F('Desarrolla una idea con las manos; cada idea clave levanta las cejas.',{base:amable(1.1),
    beats:[[.2,mix(amable(1),curioso(1)),.2,.12],[.34,amable(1.1),.4],[.5,mix(curioso(1.1),smile(.25)),.2,.12],[.64,amable(1.1),.4],[.78,mix(curioso(.9),smile(.3)),.2,.1]],
    habla:[[.03,.48,.95],[.53,.95,.95]],mira:[[.34,.06,-.24],[.39,0,0],[.7,-.08,-.22],[.74,0,0]],ritmo:'viva',acento:1.15}),
  F('Cuenta algo que le apasiona: no puede quedarse quieto.',{base:mix(smile(.42),curioso(.5)),
    beats:[[.14,mix(attentive(.8),smile(.7,.3)),.18,.14],[.42,mix(surprise(.4),smile(.6)),.15,.14],[.56,smile(.55),.3],[.7,laugh(.55),.2,.1],[.84,mix(smile(.6,.2),curioso(.6)),.3]],
    habla:[[.03,.4,1.25],[.46,.67,1.3],[.76,.96,1.2]],risa:[[.7,.75,.6]],mira:[[.4,.18,.1],[.45,0,0]],ritmo:'viva',acento:1.35,rapido:1.12}),
  F('Charla tranquila de pie: habla, piensa en la pausa y vuelve al otro.',{base:amable(1),
    beats:[[.37,smile(.36),.35],[.47,amable(1),.4],[.74,smile(.34),.35],[.86,amable(1),.4]],
    habla:[[.05,.35,.75],[.46,.71,.72]],mira:[[.2,.28,.02],[.26,0,0],[.6,-.2,-.1],[.66,0,0]],ritmo:'calma',acento:.85}),
  F('Habla animada que se remata con una risa breve.',{base:amable(1.2),
    beats:[[.25,mix(amable(1.2),curioso(.8)),.2,.1],[.4,amable(1.2),.35],[.6,mix(amable(1.2),curioso(.9)),.2,.1],[.8,laugh(.6),.18,.1],[.93,smile(.55),.3]],
    habla:[[.04,.76,1]],risa:[[.8,.91,.85]],ritmo:'viva',acento:1.1}),
  // ---- Conversación › Escuchar ----
  F('Escucha con interés: no quiere perderse nada.',{base:atento(1.1),
    beats:[[.38,mix(atento(1.1),smile(.2)),.5],[.55,atento(1.1),.6],[.72,mix(atento(1),curioso(.6)),.4],[.86,atento(1.1),.5]],
    mira:[[.6,.05,.03],[.63,0,0]],ritmo:'fijo',acentoCabeza:.55}),
  F('Escucha en calma, en paz con lo que oye.',{base:{...amable(.8),...pair('eyeBlink',.12)},
    beats:[[.55,mix(smile(.24),pair('eyeBlink',.16)),.7],[.78,{...amable(.8),...pair('eyeBlink',.12)},.8]],
    ojos:[0,-.05],mira:[[.35,.1,0],[.4,0,-.05]],ritmo:'calma',lento:1}),
  F('Escucha respetuoso, con las manos recogidas; atención sin juicio.',{base:atento(.8),
    beats:[[.5,mix(atento(.8),pair('mouthPress',.18)),.6],[.72,atento(.8),.6]],
    ojos:[0,-.04],ritmo:'fijo',lento:1}),
  F('Da la razón y se pone en marcha hacia donde le dicen.',{base:amable(1),
    beats:[[.14,mix(smile(.45),curioso(.8)),.2,.15],[.34,smile(.36),.4],[.6,amable(.8),.5]],
    mira:[[.56,.18,-.04],[.8,0,0]],ritmo:'calma'}),
  F('Caminando, se detiene, asiente con una sonrisa corta y sigue.',{base:amable(.8),
    beats:[[.38,mix(smile(.5),curioso(.7)),.2,.15],[.56,smile(.3),.4],[.7,amable(.8),.5]],
    mira:[[.36,.12,0],[.66,0,0]],ritmo:'calma',acentoCabeza:.5}),
  // ---- Conversación › Discutir ----
  F('Discute con rabia: alza la voz y adelanta la mandíbula.',{base:angry(.55),
    beats:[[.18,angry(.95,.55),.15,.12],[.36,angry(.75),.3],[.55,angry(.9,.4),.15,.1],[.72,angry(.7),.3],[.86,angry(.95,.6),.15,.12]],
    habla:[[.05,.45,1.3],[.52,.95,1.3]],ritmo:'tenso',acento:1.2,tipoAcento:'ceño'}),
  F('Reprocha con enfado contenido: aprieta los labios, resopla y aparta la vista.',{base:reproche(.85),
    beats:[[.5,reproche(1),.3],[.57,resoplido,.15,.1],[.66,reproche(.9),.4],[.88,reproche(1),.3]],
    habla:[[.05,.48,.9],[.74,.95,.85]],mira:[[.58,-.38,-.06],[.73,0,0]],ritmo:'tenso',acento:1,tipoAcento:'ceño'}),
  // ---- Conversación › Dar indicaciones ----
  F('Indica amablemente el camino hacia su izquierda y vuelve a mirar al otro.',{base:amable(1.2),
    beats:[[.18,mix(amable(1.2),curioso(.75)),.2,.12],[.4,amable(1.2),.4],[.6,smile(.36),.35]],
    habla:[[.05,.9,.78]],mira:[[.16,.55,-.05],[.5,0,0],[.7,.4,-.05],[.8,0,0]],ritmo:'calma',acento:.95}),
  F('Señala a su derecha mientras habla; la mirada va antes que la mano.',{base:amable(1),
    beats:[[.18,mix(amable(1),curioso(.8)),.2,.1],[.4,amable(1),.4],[.68,mix(amable(1),curioso(.8)),.2,.1],[.84,amable(1),.4]],
    habla:[[.04,.92,.88]],mira:[[.16,-.52,0],[.48,0,0],[.66,-.46,0],[.84,0,0]],ritmo:'viva',acento:1}),
  F('Señala hacia arriba para explicar algo que está ahí.',{base:amable(1),
    beats:[[.24,mix(attentive(.6),pair('eyeWide',.32)),.2,.12],[.5,mix(amable(1),curioso(.6)),.4],[.7,amable(1),.4]],
    habla:[[.05,.9,.82]],mira:[[.22,0,.56],[.58,0,0]],ritmo:'calma',acento:1}),
  F('Señala la dirección («por aquí») y echa a andar.',{base:amable(1),
    beats:[[.15,porAqui,.2,.12],[.42,smile(.32),.35],[.7,amable(.8),.5]],
    habla:[[.16,.36,.8]],mira:[[.13,-.42,0],[.44,0,0]],ritmo:'calma',acento:.9}),
  // ---- Conversación › Contar una idea o una noticia ----
  F('Ha tenido una gran idea y la cuenta con pausas de expectación.',{base:mix(attentive(.45),smile(.3)),
    beats:[[.1,mix(surprise(.5),smile(.4)),.15,.14],[.24,smile(.7,.3),.3],[.52,mix(attentive(.9),smile(.45)),.2,.12],[.62,smile(.6,.2),.3],[.88,mix(attentive(.7),smile(.5)),.3]],
    habla:[[.16,.5,1.15],[.62,.86,1.2]],mira:[[.06,.08,.3],[.14,0,0]],ritmo:'viva',acento:1.3,rapido:1.15}),
  F('Cuenta una buena noticia con ánimo; sonríe de verdad en las pausas.',{base:smile(.45),
    beats:[[.32,smile(.82),.3,.1],[.4,smile(.5),.4],[.7,smile(.85,.2),.3,.1],[.78,smile(.5),.4]],
    habla:[[.04,.31,1],[.42,.68,1],[.8,.96,.95]],ritmo:'viva',acento:1.05}),
  F('Cuenta algo que le duele; le cuesta sostener la mirada.',{base:sinMirada(sad(.6)),
    beats:[[.4,mix(sinMirada(sad(.8)),pair('mouthPress',.3)),.6],[.55,sinMirada(sad(.7)),.7],[.82,sinMirada(sad(.62)),.7]],
    habla:[[.05,.38,.45],[.58,.8,.42]],ojos:[0,-.3],mira:[[.42,-.1,-.42],[.6,.02,-.18],[.75,0,-.3]],ritmo:'triste',lento:1,acento:.4,rapido:.82}),
  // ---- Saludos y despedidas ----
  F('Abre la puerta a alguien querido: alegría de verlo.',{base:smile(.5),
    beats:[[.1,mix(surprise(.32),smile(.6)),.15,.12],[.24,smile(1,.4),.25,.12],[.6,smile(.8),.4],[.85,smile(.6),.4]],
    habla:[[.28,.58,.95]],ritmo:'viva',acento:1.1}),
  F('Reconoce a alguien al caminar y le saluda con la mano.',{base:amable(.9),
    beats:[[.18,mix(curioso(1),smile(.35)),.15,.15],[.3,smile(.9,.45),.25,.12],[.62,smile(.55),.45],[.84,amable(.9),.4]],
    habla:[[.33,.44,.9]],mira:[[.16,.15,.04],[.7,0,0]],ritmo:'viva',acento:1}),
  F('Posa con la señal de paz, juguetón.',{base:smile(.55),
    beats:[[.2,mix(smile(.92,.25),entornaIzq),.2,.1],[.56,mix(smile(.8),entornaIzq),.4],[.82,smile(.6),.4]],
    ritmo:'calma'}),
  F('Se levanta y se despide con cariño; le cuesta irse un poco.',{base:amable(1),
    beats:[[.45,mix(smile(.75),{browInnerUp:.36}),.35,.08],[.7,smile(.55),.4],[.88,amable(1),.4]],
    habla:[[.47,.6,.75]],mira:[[.25,0,-.18],[.4,0,0]],ritmo:'calma',acento:.9}),
  // ---- Teléfono y pantallas ----
  F('Va hablando por videollamada, saluda y cuenta cosas a la pantalla.',{base:smile(.32),
    beats:[[.1,smile(.85,.4),.25,.12],[.25,smile(.45),.4],[.6,mix(smile(.4),curioso(.7)),.2,.1],[.75,smile(.4),.4]],
    habla:[[.14,.92,.95]],ojos:[0,-.32],mira:[[.48,.12,-.04],[.52,0,-.32]],ritmo:'viva',acento:1.05}),
  F('Videollamada relajada desde el sofá: habla y escucha.',{base:smile(.35),
    beats:[[.42,mix(atento(1),smile(.25)),.4],[.58,smile(.38),.4],[.86,smile(.5),.4]],
    habla:[[.05,.4,.75],[.6,.85,.72]],ojos:[0,-.2],ritmo:'calma',acento:.85}),
  F('Charla distendida por videollamada apoyado en la pared.',{base:smirk(.6),
    beats:[[.3,mix(smirk(.8),smile(.3)),.3],[.6,smirk(.55),.4],[.8,mix(smirk(.7),curioso(.5)),.3]],
    habla:[[.05,.32,.7],[.46,.9,.72]],ojos:[0,-.26],mira:[[.34,.4,.05],[.41,0,-.26],[.7,-.3,0],[.76,0,-.26]],ritmo:'calma',acento:.8}),
  F('Reunión de trabajo en pantalla: atención profesional e intervención breve.',{base:atento(.6),
    beats:[[.3,atento(1),.4],[.4,atento(.6),.5],[.74,mix(atento(.6),smile(.26)),.4],[.88,atento(.6),.5]],
    habla:[[.42,.66,.65]],ojos:[0,-.15],mira:[[.68,.18,-.1],[.72,0,-.15]],ritmo:'pantalla',acento:.8,acentoCabeza:.4}),
  F('Mira el móvil apoyado en la pared y algo le llama la atención.',{base:{...pair('mouthPress',.1)},
    beats:[[.44,curioso(1),.2,.12],[.58,mix(curioso(.5),smile(.18)),.4],[.72,{...pair('mouthPress',.1)},.5]],
    ojos:[0,-.5],mira:[[.25,.08,-.52],[.33,-.04,-.48],[.82,.06,-.5],[.9,0,-.5]],ritmo:'pantalla'}),
  F('Escribe un mensaje concentrado y sonríe al leer la respuesta.',{base:{...pair('mouthPress',.26),...pair('browDown',.12)},
    beats:[[.62,mix(smirk(.55),smile(.3)),.3,.1],[.78,smile(.25),.4],[.92,{...pair('mouthPress',.26),...pair('browDown',.12)},.4]],
    ojos:[0,-.56],mira:[[.2,.1,-.56],[.3,-.06,-.56],[.45,.08,-.56],[.6,0,-.5]],ritmo:'pantalla'}),
  F('Se hace un selfie: sonrisa de foto y un poco de pose.',{base:smile(.42),
    beats:[[.14,smile(1,.2),.25,.1],[.5,mix(smile(.9),pair('eyeSquint',.32)),.3],[.72,mix(smile(.7),curioso(.5)),.3],[.86,smile(.5),.4]],
    ojos:[0,.08],ritmo:'calma'}),
  // ---- Reacciones del público ----
  F('Aplaude sentado algo que le ha gustado.',{base:mix(smile(.55),curioso(.4)),
    beats:[[.3,mix(smile(.8),curioso(.5)),.3,.1],[.62,smile(.62),.4],[.84,smile(.7),.3]],
    ojos:[0,.05],ritmo:'viva'}),
  F('Aplaude de pie, encantado con lo que ve.',{base:mix(smile(.8),pair('eyeSquint',.36)),
    beats:[[.36,smile(1,.3),.25,.1],[.6,smile(.82),.4],[.8,smile(.95,.2),.3]],
    ritmo:'viva',acentoCabeza:.4}),
  F('Aplaude con las manos en alto: alegría desbordada.',{base:smile(.85,.5),
    beats:[[.18,mix(laugh(.8),curioso(.6)),.2,.12],[.55,smile(1,.7),.3],[.8,smile(.9,.5),.3]],
    risa:[[.22,.5,.9]],ritmo:'viva'}),
  F('Aplaude dando la razón; las cejas suben con cada cabeceo.',{base:smile(.5),
    beats:[[.22,mix(smile(.6),curioso(.6)),.2,.1],[.34,smile(.5),.3],[.48,mix(smile(.6),curioso(.6)),.2,.1],[.6,smile(.5),.3],[.74,mix(smile(.62),curioso(.6)),.2,.1]],
    ritmo:'calma',acentoCabeza:.6}),
  F('Celebra con el puño en alto: grito de alegría.',{base:smile(.62,.3),
    beats:[[.14,vitoreo,.15,.14],[.42,smile(.95,.6),.3],[.7,mix(smile(.85,.4),pair('eyeSquint',.4)),.3]],
    grito:[[.16,.38,1.3]],ritmo:'viva'}),
  F('Se ríe a carcajadas señalando a alguien.',{base:laugh(.62),
    beats:[[.08,laugh(1),.15,.12],[.5,laugh(.85),.3],[.78,laugh(.95),.2],[.92,laugh(.7),.3]],
    risa:[[.1,.46,1.2],[.56,.86,1.05]],ritmo:'viva'}),
  // ---- Esperar y descansar ----
  F('Espera sin más: la mente se pasea, la mirada también.',{base:{browInnerUp:.05,...pair('mouthPress',.06)},
    beats:[[.6,{...pair('mouthPress',.16),browInnerUp:.12},.6],[.8,{browInnerUp:.05,...pair('mouthPress',.06)},.7]],
    mira:[[.14,.3,0],[.3,0,.06],[.5,-.26,-.1],[.7,.1,0],[.86,0,0]],ritmo:'calma'}),
  F('Espera apoyado en la pared, aburrido; se le escapa un bostezo.',{base:mix(tired(.32),amable(.3)),
    beats:[[.5,bostezo,.6,.06],[.64,mix(tired(.4),pair('eyeBlink',.4)),.5],[.8,mix(tired(.32),amable(.3)),.6]],
    ojos:[0,-.1],mira:[[.2,.24,-.06],[.44,.1,-.1],[.86,0,-.1]],ritmo:'calma',lento:1}),
  F('Mira a su alrededor, curioso por lo que hay.',{base:atento(1),
    beats:[[.3,mix(atento(1),curioso(.8)),.25,.1],[.45,atento(1),.4],[.7,mix(atento(1),curioso(.7)),.25,.1],[.85,atento(1),.4]],
    mira:[[.1,.55,.05],[.3,.2,.15],[.5,-.52,0],[.7,-.15,-.1],[.88,0,0]],ritmo:'viva'}),
  F('Mira el reloj: se le hace tarde y suspira.',{base:{...pair('mouthPress',.12)},
    beats:[[.18,{browOuterUpRight:.45,browInnerUp:.2},.2,.1],[.34,mix(tense(.55),{browOuterUpRight:.25}),.3],[.6,suspiro,.4],[.76,{...pair('mouthPress',.2),browInnerUp:.12},.4]],
    mira:[[.15,-.2,-.6],[.42,0,0],[.6,.12,.1],[.74,0,0]],ritmo:'tenso'}),
  F('Duda y se rasca el cuello mientras piensa.',{base:ponder(.55),
    beats:[[.22,doubt(.8),.3,.08],[.48,ponder(.7),.5],[.7,doubt(.6),.4],[.86,ponder(.55),.5]],
    mira:[[.14,.3,.36],[.5,-.12,.26],[.86,0,0]],ritmo:'calma',lento:1}),
  // ---- Sentados a la mesa o en el sofá ----
  F('Conversa sentado con muchos gestos; las cejas siguen a las manos.',{base:amable(1.1),
    beats:[[.22,mix(amable(1.1),curioso(.9)),.2,.12],[.36,amable(1.1),.4],[.55,mix(smile(.4),curioso(.8)),.2,.12],[.7,amable(1.1),.4]],
    habla:[[.04,.5,.95],[.55,.94,.95]],mira:[[.45,.1,-.22],[.5,0,0]],ritmo:'viva',acento:1.15}),
  F('Charla tranquila tomando un café.',{base:smile(.32),
    beats:[[.46,sorber,.3],[.56,mix(alivio,smile(.3)),.35],[.68,smile(.35),.4]],
    habla:[[.05,.36,.7],[.66,.93,.72]],mira:[[.42,0,-.42],[.58,0,0]],ritmo:'calma',acento:.85}),
  F('En el sofá, se gira hacia el otro y se ríe con ganas.',{base:smile(.48),
    beats:[[.14,laugh(.9),.2,.12],[.55,smile(.8,.3),.3],[.78,smile(.6),.4]],
    risa:[[.16,.5,1.05]],mira:[[.1,.45,0],[.8,0,0]],ritmo:'viva'}),
  F('Escucha en el sofá con media sonrisa y da la razón.',{base:mix(smile(.28),atento(.5)),
    beats:[[.3,mix(smile(.42),curioso(.6)),.25,.1],[.42,mix(smile(.3),atento(.5)),.4],[.62,mix(smile(.45),curioso(.6)),.25,.1],[.76,mix(smile(.28),atento(.5)),.4]],
    ritmo:'calma',acentoCabeza:.5}),
  F('Conversación serena en la sala: habla, escucha y remata con una sonrisa.',{base:amable(1),
    beats:[[.3,smile(.45),.35],[.42,atento(.9),.4],[.58,amable(1),.4],[.86,smile(.5),.35]],
    habla:[[.05,.29,.72],[.6,.84,.72]],ritmo:'calma',acento:.85}),
  // ---- Tareas cotidianas ----
  F('Lee un libro tranquilo; una frase le sorprende.',{base:{...pair('browDown',.08),...pair('mouthPress',.08)},
    beats:[[.6,curioso(.9),.2,.12],[.68,mix(curioso(.4),smile(.2)),.4],[.82,{...pair('browDown',.08),...pair('mouthPress',.08)},.5]],
    ojos:[0,-.5],lectura:[[.04,.56],[.72,.96]],ritmo:'pantalla'}),
  F('Escribe al ordenador muy concentrado.',{base:foco(1),
    beats:[[.45,foco(1.3),.5],[.62,foco(1),.5],[.85,mix(foco(.6),curioso(.3)),.4]],
    ojos:[0,-.22],lectura:[[.05,.4],[.5,.8]],ritmo:'pantalla'}),
  F('Bebe de pie y siente alivio al terminar.',{base:amable(.7),
    beats:[[.28,sorber,.3],[.46,mix(sorber,pair('eyeBlink',.3)),.3],[.6,alivio,.3,.08],[.8,amable(.7),.5]],
    mira:[[.26,0,.12],[.58,0,0]],ritmo:'calma'}),
  F('Sostiene una taza y asiente, de acuerdo con lo que oye.',{base:mix(smile(.34),atento(.4)),
    beats:[[.35,mix(smile(.44),curioso(.65)),.25,.1],[.48,mix(smile(.34),atento(.4)),.4],[.7,mix(smile(.46),curioso(.6)),.25,.1],[.82,mix(smile(.34),atento(.4)),.4]],
    ritmo:'calma',acentoCabeza:.5}),
];
if(FICHAS.length!==50)throw new Error(`RostrosCotidianos: se esperaban 50 fichas y hay ${FICHAS.length}.`);

export const ROSTROS=Object.freeze(FICHAS.map((f,i)=>Object.freeze({id:`daily-${i+1}`,...f})));
export const ROSTRO_BY_ID=new Map(ROSTROS.map(r=>[r.id,r]));

// ---------- Utilidades ----------
function semilla(texto){let h=2166136261;for(const c of String(texto))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function azar(seed){let a=seed||1;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const at=(keys,t)=>{if(!keys.length)return 0;if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){const a=keys[i-1],b=keys[i];return a[1]+(b[1]-a[1])*(t-a[0])/((b[0]-a[0])||1);}return keys.at(-1)[1];};
// Las cejas y los ojos llegan antes que la boca; la mandíbula, la última. El lado derecho, un pelo después.
const LEAD=n=>n.startsWith('eyeLook')?-.09:n.startsWith('brow')?-.06:n.startsWith('eye')?-.05:/^(cheek|nose)/.test(n)?-.02:n.startsWith('jaw')?.03:0;
const STEADY=n=>n.startsWith('eyeLook')||n.startsWith('eyeBlink');
const LOOK=['eyeLookUpLeft','eyeLookUpRight','eyeLookDownLeft','eyeLookDownRight','eyeLookInLeft','eyeLookInRight','eyeLookOutLeft','eyeLookOutRight'];
const mirada=(x,y)=>{const o=Object.fromEntries(LOOK.map(n=>[n,0]));for(const [n,v] of Object.entries(FACE.look(x,y)))o[n]=v;return o;};

/** Ordena, acota a [0, D], funde claves casi simultáneas y fija los extremos al valor de reposo (bucle sin salto). */
function limpiar(keys,D,b){
  const out=[[0,b]];
  for(const [t,v] of [...keys].sort((x,y)=>x[0]-y[0])){
    if(!(t>.006&&t<D-.006))continue;
    const time=Math.round(t*1000)/1000,value=Math.round(clamp(v)*10000)/10000;
    if(time-out.at(-1)[0]<.012){if(out.length>1)out[out.length-1]=[out.at(-1)[0],value];}else out.push([time,value]);
  }
  out.push([D,Math.round(clamp(b)*10000)/10000]);out[0][1]=out.at(-1)[1];
  return out;
}
/** Suma una capa (claves de desplazamiento que valen 0 fuera de sus tramos). */
// `pulsos`: lista de pulsos, cada uno con sus claves (0 fuera de su tramo). Los pulsos solapados se suman.
function sumar(base,pulsos,D){
  const ps=pulsos.filter(p=>p.length).map(p=>[...p].sort((x,y)=>x[0]-y[0]));if(!ps.length)return base;
  const times=new Set([...base.map(k=>k[0]),...ps.flat().map(k=>k[0])]);
  const dv=t=>ps.reduce((s,d)=>s+(t<=d[0][0]||t>=d.at(-1)[0]?0:at(d,t)),0);
  return limpiar([...times].map(t=>[t,at(base,t)+dv(t)]),D,base[0][1]);
}
/** Parpadeo encima de lo que haya: cierra desde donde esté el párpado (1 - actual), sin pasar de 1. */
function parpadear(base,envolvente,D){
  if(!envolvente.length)return base;
  const e=[...envolvente].sort((x,y)=>x[0]-y[0]),times=new Set([...base.map(k=>k[0]),...e.map(k=>k[0])]);
  const ev=t=>t<=e[0][0]||t>=e.at(-1)[0]?0:at(e,t);
  return limpiar([...times].map(t=>{const a=at(base,t);return[t,a+(1-a)*ev(t)];}),D,base[0][1]);
}

// ---------- Habla, risa y grito ----------
const VOCALES={
  a:{jawOpen:.26,mouthLowerDownLeft:.16,mouthLowerDownRight:.15},
  e:{jawOpen:.15,mouthStretchLeft:.2,mouthStretchRight:.19,mouthLowerDownLeft:.08,mouthLowerDownRight:.08},
  i:{jawOpen:.08,mouthStretchLeft:.26,mouthStretchRight:.25,mouthUpperUpLeft:.06,mouthUpperUpRight:.06},
  o:{jawOpen:.2,mouthFunnel:.32,mouthLowerDownLeft:.05,mouthLowerDownRight:.05},
  u:{jawOpen:.07,mouthPucker:.4,mouthFunnel:.15},
};
const FREQ=[['a',.3],['e',.3],['o',.2],['i',.12],['u',.08]];
const CIERRES=[[null,.62],['p',.24],['f',.14]];   // p/b/m: labios juntos · f/v: labio inferior recogido
const CIERRE={p:{mouthPressLeft:.22,mouthPressRight:.22,mouthClose:.12},f:{mouthRollLower:.24,mouthUpperUpLeft:.05,mouthUpperUpRight:.05}};
const elegir=(lista,r)=>{let x=r();for(const [v,p] of lista){if((x-=p)<=0)return v;}return lista.at(-1)[0];};

/** Sílabas: tramos de fase → frases de 1–2,4 s con pausas, ~4,6 sílabas/s, la última de cada frase más larga. */
function silabas(D,tramos,r,ritmo=1){
  const out=[];
  for(const [p0,p1,energia=1] of tramos){
    let t=Math.max(.2,p0*D);const fin=Math.min(D-.25,p1*D);
    while(t<fin-.2){
      const frase=Math.min(fin,t+1+r()*1.4);let primera=true;
      while(t<frase-.12){
        const dur=(.16+r()*.1)/ritmo,ultima=t+dur*2>frase;
        out.push({t:t+dur*.5,dur:ultima?dur*1.35:dur,v:elegir(FREQ,r),cierre:elegir(CIERRES,r),e:energia*(.75+r()*.45),tonica:primera||r()<.24,frase:primera});
        primera=false;t+=ultima?dur*1.35:dur;
      }
      t+=.25+r()*.3;
    }
  }
  return out;
}
function capaHabla(D,s,{acento=1,tipoAcento='cejas'}={}){
  const capas={},add=(n,k)=>(capas[n]??=[]).push(k);
  for(let i=0;i<s.length;i++){
    const x=s[i],next=s[i+1],cont=next&&next.t-x.t<x.dur*1.6;
    for(const [n,v] of Object.entries(VOCALES[x.v]))add(n,[[x.t-x.dur*.5,0],[x.t,v*x.e],[x.t+x.dur*.5,cont?v*x.e*.18:0]]);
    if(x.cierre&&cont)for(const [n,v] of Object.entries(CIERRE[x.cierre]))add(n,[[x.t+x.dur*.15,0],[x.t+x.dur*.5,v*Math.min(1.1,x.e)],[x.t+x.dur*.85,0]]);
    if(x.tonica&&acento>0){
      const a=Math.min(.3,.22*acento*Math.min(1.2,x.e)),t=x.t-.06;
      const ch=tipoAcento==='ceño'?{browDownLeft:a,browDownRight:a*.9,noseSneerLeft:a*.35,noseSneerRight:a*.3}:{browOuterUpLeft:a,browOuterUpRight:a*.9,browInnerUp:a*.8};
      for(const [n,v] of Object.entries(ch))add(n,[[t-.14,0],[t+.03,v],[t+.34,0]]);
    }
  }
  return capas;
}
/** Risa: pulsos «ja-ja» a ~5 Hz que se van apagando; las mejillas empujan los párpados. */
function capaRisa(D,tramos,r){
  const capas={},add=(n,k)=>(capas[n]??=[]).push(k);
  for(const [p0,p1,e=1] of tramos){
    const t0=Math.max(.2,p0*D),t1=Math.min(D-.25,p1*D);let t=t0;
    while(t<t1){const f=4.6+r()*1.1,k=e*(1-.55*(t-t0)/Math.max(.2,t1-t0)),h=.5/f;
      for(const [n,v] of Object.entries({jawOpen:.2,mouthUpperUpLeft:.09,mouthUpperUpRight:.09,cheekSquintLeft:.08,cheekSquintRight:.08,eyeSquintLeft:.06,eyeSquintRight:.06}))add(n,[[t,0],[t+h*.7,v*k],[t+h*2,0]]);
      t+=1/f;}
  }
  return capas;
}
/** Grito: dos o tres «¡sí!» largos, mandíbula muy abierta. */
function capaGrito(D,tramos,r){
  const capas={},add=(n,k)=>(capas[n]??=[]).push(k);
  for(const [p0,p1,e=1] of tramos){
    let t=Math.max(.2,p0*D);const t1=Math.min(D-.3,p1*D);
    while(t<t1-.2){const d=.36+r()*.2;for(const [n,v] of Object.entries({jawOpen:.24,mouthStretchLeft:.12,mouthStretchRight:.12,mouthLowerDownLeft:.12,mouthLowerDownRight:.12}))add(n,[[t,0],[t+d*.3,v*e],[t+d*.75,v*e*.85],[t+d,0]]);t+=d+.06+r()*.1;}
  }
  return capas;
}

// ---------- Mirada ----------
/** Lectura: barridos cortos de izquierda a derecha y vuelta al principio de la línea. */
function sacadasLectura(D,tramos,y,r){
  const out=[];
  for(const [p0,p1] of tramos){
    let t=p0*D;const fin=p1*D;
    while(t<fin){let x=-.22;out.push([t,x,y]);t+=.08;
      while(x<.22&&t<fin){x+=.08+r()*.06;t+=.22+r()*.12;out.push([t,Math.min(.24,x),y-.01]);}
      t+=.12;y=y;}
  }
  return out;
}
function curvasMirada(D,r,ficha){
  const [bx,by]=ficha.ojos||[0,0];
  const darts=[...(ficha.mira||[]).map(([p,x,y])=>[p*D,x,y])];
  if(ficha.lectura)darts.push(...sacadasLectura(D,ficha.lectura,by,r));
  darts.sort((a,b)=>a[0]-b[0]);
  // Microsacadas en las fijaciones largas: los ojos nunca están del todo quietos.
  const fij=[[0,bx,by],...darts,[D,bx,by]],micro=[];
  for(let i=0;i<fij.length-1;i++){const [t,x,y]=fij[i],gap=fij[i+1][0]-t;for(let k=1;k*2.2<gap-.4;k++){const tm=t+k*2.2+r()*.5;if(tm<fij[i+1][0]-.35)micro.push([tm,x+(r()-.5)*.06,y+(r()-.5)*.04],[tm+.3+r()*.25,x,y]);}}
  const todos=[...darts,...micro].sort((a,b)=>a[0]-b[0]).filter(([t])=>t>.1&&t<D-.15);
  // Si el ciclo acaba fuera del reposo, la mirada vuelve antes del final.
  const last=todos.at(-1);if(last&&(Math.abs(last[1]-bx)>.01||Math.abs(last[2]-by)>.01))todos.push([Math.max(last[0]+.25,D-.3),bx,by]);
  const base=mirada(bx,by),canales={};
  for(const n of LOOK){
    const shift=n.endsWith('Right')?.004:0;let keys=[[0,base[n]]],prev=base[n];
    for(const [t,x,y] of todos){const v=mirada(x,y)[n],s=.05+Math.min(.03,Math.abs(v-prev)*.06);keys.push([t+shift-s,prev],[t+shift,v]);prev=v;}
    canales[n]=limpiar(keys,D,base[n]);
  }
  return {canales,cambios:todos.filter(([,x,y],i,a)=>{const p=i?a[i-1]:[0,bx,by];return Math.hypot(x-p[1],y-p[2])>.38;}).map(d=>d[0])};
}

// ---------- Parpadeo ----------
const RITMOS={calma:{min:1.5,max:4.4},viva:{min:.95,max:3.1,doble:.16},fijo:{min:2.6,max:6.4},tenso:{min:2.3,max:5.6},triste:{min:1.8,max:4.6},pantalla:{min:2.8,max:7}};
function momentosParpadeo(D,r,ficha,{eventos=[],cambios=[],beats=[]}){
  const R=RITMOS[ficha.ritmo]||RITMOS.calma,lim=t=>t>.3&&t<D-.32;
  // Prioridad: giros de cabeza del mocap → cambios de pensamiento (beats grandes) → cambios grandes de mirada.
  const cand=[...eventos.map(t=>[t,3]),...beats.map(t=>[t-.06,2]),...cambios.map(t=>[t-.02,1])].filter(([t])=>lim(t)).sort((a,b)=>b[1]-a[1]||a[0]-b[0]);
  const out=[];
  for(const [t] of cand)if(out.every(x=>Math.abs(x-t)>=R.min))out.push(t);
  out.sort((a,b)=>a-b);
  // Rellenar huecos largos (incluido el que cruza el final del bucle) con espaciado irregular.
  for(let guard=0;guard<200;guard++){
    const pts=[...out].sort((a,b)=>a-b),huecos=[];
    if(!pts.length)huecos.push([.3,D-.32+.3]);
    for(let i=0;i<pts.length;i++){const a=pts[i],b=i+1<pts.length?pts[i+1]:pts[0]+D;if(b-a>R.max)huecos.push([a,b]);}
    if(!huecos.length)break;
    const [a,b]=huecos[0],t=a+Math.min(R.max*(.55+r()*.4),(b-a)*(.4+r()*.25)),tt=t>=D?t-D:t;
    if(lim(tt))out.push(tt);else if(lim(tt+.6))out.push(tt+.6);else if(lim(tt-.6))out.push(tt-.6);else break;
  }
  out.sort((a,b)=>a-b);
  if(R.doble)for(const t of[...out])if(r()<R.doble&&lim(t+.34)&&out.every(x=>x===t||Math.abs(x-t-.34)>.5))out.push(t+.34);
  return out.sort((a,b)=>a-b);
}
/** Envolvente de un parpadeo: cierre rápido con ease-in, contacto con rebote (1 → 0,9), apertura lenta. */
function envolvente(times,lento,lado){
  const k=lento?1.45:1,o=lado?.011:0,out=[];
  for(const t of times)out.push([t-.075*k+o,0],[t-.035*k+o,.28],[t+o,1],[t+.045*k+o,.9],[t+.11*k+o,.42],[t+.19*k+o,0]);
  return out;
}

// ---------- Compilador ----------
/**
 * Curvas ARKit en bucle para una actuación cotidiana de `D` segundos.
 * eventos: instantes (s) de giros/cabeceos de la cabeza medidos en el mocap (ver `momentosDeCabeza`).
 */
export function rostroEnBucle(id,D,{eventos=[]}={}){
  const f=ROSTRO_BY_ID.get(id);if(!f)throw Error('Actuación cotidiana sin rostro: '+id);
  if(!(D>=.5&&D<=600))throw Error('Duración de clip fuera de rango.');
  const r=azar(semilla(id+':'+D.toFixed(2)));
  const base=sinMirada(f.base);
  const beats=(f.beats||[]).map(([p,pose,inn=.3,ov=.08])=>({t:p*D,pose:{...base,...sinMirada(pose)},in:inn,ov})).sort((a,b)=>a.t-b.t);
  // Acentos de cabeceo: las cejas suben con cada movimiento de cabeza medido (actuaciones de asentir).
  const capas=[];
  if(f.acentoCabeza)capas.push(Object.fromEntries(['browInnerUp','browOuterUpLeft','browOuterUpRight'].map(n=>[n,eventos.filter(t=>t>.35&&t<D-.5).map(t=>{const a=.26*f.acentoCabeza*(n==='browOuterUpRight'?.9:1);return[[t-.12,0],[t+.04,a],[t+.4,0]];})])));
  const s=silabas(D,f.habla||[],r,f.rapido||1);
  if(s.length)capas.push(capaHabla(D,s,{acento:f.acento??1,tipoAcento:f.tipoAcento}));
  if(f.risa)capas.push(capaRisa(D,f.risa,r));
  if(f.grito)capas.push(capaGrito(D,f.grito,r));
  const names=new Set([...Object.keys(base),...beats.flatMap(b=>Object.keys(b.pose)),...capas.flatMap(c=>Object.keys(c)),'eyeBlinkLeft','eyeBlinkRight','browDownLeft','browDownRight','cheekSquintLeft','cheekSquintRight']);
  const vuelta=Math.min(.9,Math.max(.35,D*.12)),channels={};
  for(const n of names){
    const b=base[n]||0,shift=LEAD(n)+(n.endsWith('Right')?.012:0),steady=STEADY(n);
    let keys=[[0,b]],last=b,prevT=0;
    for(const beat of beats){
      const v=beat.pose[n]??b,gap=beat.t-prevT,into=Math.min(beat.in,Math.max(.06,gap*.7)),t=beat.t+shift;
      const worn=steady?last:b+(last-b)*.9;   // durante la pausa la pose se desgasta un poco hacia el reposo
      keys.push([t-into,worn]);
      if(!steady&&v-worn>.04){keys.push([t,clamp(v+(v-worn)*beat.ov*1.6)],[t+.2,v]);}else keys.push([t,v]);
      last=v;prevT=beat.t;
    }
    const ret=Math.max(prevT+.3,D-vuelta);
    if(Math.abs(last-b)>1e-4)keys.push([ret+shift,steady?last:b+(last-b)*.92],[Math.min(D-.02,ret+vuelta*.85+shift),b]);
    keys=limpiar(keys,D,b);
    for(const c of capas)if(c[n])keys=sumar(keys,c[n],D);
    channels[n]=keys;
  }
  // Mirada
  const {canales,cambios}=curvasMirada(D,r,f);Object.assign(channels,canales);
  // Parpadeo (con ceja y mejilla acompañando el cierre)
  const grandes=beats.filter((bt,i)=>{const p=i?beats[i-1].pose:base;return Object.keys({...p,...bt.pose}).reduce((s,n)=>s+Math.abs((bt.pose[n]||0)-(p[n]||0)),0)>.9;}).map(bt=>bt.t);
  const blinks=momentosParpadeo(D,r,f,{eventos,cambios,beats:grandes});
  channels.eyeBlinkLeft=parpadear(channels.eyeBlinkLeft,envolvente(blinks.filter(t=>at(channels.eyeBlinkLeft,t)<.75),f.lento,false),D);
  channels.eyeBlinkRight=parpadear(channels.eyeBlinkRight,envolvente(blinks.filter(t=>at(channels.eyeBlinkRight,t)<.75),f.lento,true),D);
  const acomp=(a,lado)=>blinks.map(t=>[[t-.07+lado,0],[t+lado,a],[t+.22+lado,0]]);
  for(const [n,a] of [['browDownLeft',.06],['browDownRight',.06],['cheekSquintLeft',.05],['cheekSquintRight',.05]])channels[n]=sumar(channels[n],acomp(a,n.endsWith('Right')?.012:0),D);
  for(const n of Object.keys(channels))if(!channels[n].some(k=>k[1]>1e-4))delete channels[n];
  return {channels,blinks};
}

/** Preset facial en bucle (`spanstories.facial-animation`) del mismo largo que el clip de cuerpo. */
export function presetRostroCotidiano(item,D,{eventos=[]}={}){
  const {channels}=rostroEnBucle(item.id,D,{eventos}),soft=Object.keys(channels).filter(STEADY);
  const id='daily.'+item.id;
  return {schema:'spanstories.facial-animation',version:1,id,name:item.name+' · rostro',category:'Actuaciones cotidianas · rostro',tags:['actuación cotidiana',item.id,item.category,item.subcategory],type:'animation',fpsReference:30,timeUnit:'seconds',duration:D,loop:true,rig:'ARKit-52',interpolation:'spline',channels,intensity:{reference:REFERENCIA,soft},source:{kind:'original',license:'internal',author:'SpanStories'},review:{status:'candidate'},
    defaults:{duration:D,intensity:REFERENCIA,fadeIn:0,fadeOut:0,trimStart:0,trimEnd:D,priority:0,blend:'override',loop:true,movement:{id:'none',intensity:0,delay:0}}};
}
/** Proyecto facial de un solo clip para cargarlo en la biblioteca facial. */
export function proyectoRostroCotidiano(item,D,{eventos=[],intensidad=REFERENCIA}={}){
  const p=presetRostroCotidiano(item,D,{eventos});
  return {schema:'spanstories.facial-project',version:1,presets:[p],instances:[{...p.defaults,id:'instance.'+p.id,presetId:p.id,start:0,intensity:intensidad}],favorites:[]};
}

/**
 * Instantes en que la cabeza empieza a girar o cabecear en el mocap (para que los parpadeos y los acentos caigan ahí).
 * tiempos: Float32Array; cuats: Float32Array (x,y,z,w por fotograma) con la orientación de cuello·cabeza.
 */
export function momentosDeCabeza(tiempos,cuats,{minimo=.45}={}){
  const n=tiempos.length;if(n<4)return[];
  const vel=new Float64Array(n);
  for(let i=1;i<n;i++){const o=i*4,p=o-4;const dot=Math.abs(cuats[o]*cuats[p]+cuats[o+1]*cuats[p+1]+cuats[o+2]*cuats[p+2]+cuats[o+3]*cuats[p+3]);vel[i]=2*Math.acos(Math.min(1,dot))/Math.max(1e-3,tiempos[i]-tiempos[i-1]);}
  const sm=vel.map((_,i)=>{let s=0,c=0;for(let j=Math.max(1,i-2);j<=Math.min(n-1,i+2);j++){s+=vel[j];c++;}return c?s/c:0;});
  let media=0;for(let i=1;i<n;i++)media+=sm[i];media/=n-1;let v=0;for(let i=1;i<n;i++)v+=(sm[i]-media)**2;const sd=Math.sqrt(v/(n-1));
  const umbral=Math.max(.45,media+.7*sd),out=[];   // ≥ 0,45 rad/s ≈ 26°/s
  for(let i=2;i<n-2;i++)if(sm[i]>umbral&&sm[i]>=sm[i-1]&&sm[i]>=sm[i+1]){
    let j=i;while(j>1&&sm[j-1]>sm[i]*.5)j--;   // inicio del giro: donde la velocidad cruza la mitad del pico
    const t=tiempos[j];if(!out.length||t-out.at(-1)>=minimo)out.push(t);
  }
  return out;
}
