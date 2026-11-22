// 50 actuaciones cotidianas · cuerpo de mocap + rostro (RostrosCotidianos.mjs).
//
// Cada entrada apunta a un clip de mocap real de biblioteca/paquetes (no se copia ni se mueve). Se reproduce
// con el esqueleto del personaje cargado en el Taller facial (ver CuerpoBiblioteca.mjs). El rostro (15/11/2026) está
// en RostrosCotidianos.mjs: una ficha por actuación, compilada en bucle al largo del clip. `faceNotes` es su guion.
//
// Las ids `daily-1`…`daily-50` no chocan con las 50 actuaciones procedurales (`behavior-1`…`behavior-50`)
// de ActingLibrary.mjs, que siguen igual.

/** Perfil según la subcarpeta del archivo (los paquetes sin subcarpeta de género son «sin especificar»). */
export const PERFILES = Object.freeze([
  Object.freeze({id:'male',name:'Masculinas',carpeta:'Masculinas'}),
  Object.freeze({id:'female',name:'Femeninas',carpeta:'Femeninas'}),
  Object.freeze({id:'unspecified',name:'Sin especificar',carpeta:'Sin especificar'}),
]);

/** Perfil de una ruta relativa a biblioteca/paquetes: <paquete>/<Masculinas|Femeninas|Sin especificar>/…; sin subcarpeta de género, «sin especificar». */
export function perfilDeRuta(ruta){
  const trozo=String(ruta).split('/')[1];
  return PERFILES.find(p=>p.carpeta===trozo)?.id||'unspecified';
}

/**
 * URL con la que el Taller de animación sirve un clip de biblioteca. El servidor nombra sus raíces «r0», «r1»…
 * (orden de rutas.json), así que se resuelve con la lista de /api/biblioteca buscando la misma ruta.
 * @param {{ruta:string}} body
 * @param {{archivos:{raiz:string,ruta:string,url:string}[]}} lista respuesta de /api/biblioteca
 */
export function urlDeCuerpo(body,lista,base=''){
  const item=lista.archivos.find(a=>a.raiz!=='local'&&a.ruta===body.ruta);
  if(!item)throw Error('El clip no está en la biblioteca del Taller: '+body.ruta);
  return base+item.url;
}

const sinAcentos=t=>String(t).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();

/** Agrupa por categoría › subcategoría conservando el orden del catálogo. */
export function agruparActuaciones(items){
  const grupos=new Map();
  for(const a of items){const clave=`${a.category} › ${a.subcategory}`;if(!grupos.has(clave))grupos.set(clave,[]);grupos.get(clave).push(a);}
  return [...grupos].map(([titulo,lista])=>({titulo,lista}));
}

/** Filtra por texto (nombre, categoría, subcategoría, archivo) y por perfil ('todas' = sin filtro). */
export function filtrarActuaciones(items,texto='',perfil='todas'){
  const q=sinAcentos(texto).trim();
  return items.filter(a=>(perfil==='todas'||a.perfil===perfil)&&(!q||sinAcentos(`${a.name} ${a.category} ${a.subcategory} ${a.body.ruta}`).includes(q)));
}


const MIC='Conversations Michael 8/Masculinas/',M3='Mocap_Pack_03_Talking_and_Interacting/Sin especificar/',M4='Mocap_Pack_04_Crowd_Reactions/Sin especificar/',
  M7='Mocap_Pack_07_Everyday_Actions_2/Sin especificar/',M1='Mocap_Pack_01_Everyday_Actions/Sin especificar/',CHF='Church People/Femeninas/',CHM='Church People/Masculinas/',
  IDLE='100 Idle Animation Pack/',SURV='505 Survival Mocap/Sin especificar/';

// [nombre, categoría, subcategoría, ruta, notas del rostro para la etapa siguiente]
const FILAS=[
  // ---- Conversación ----
  ['Explicar con calma','Conversación','Explicar',MIC+'Convo 01 Low Key Loop Michael 8.glb','Mirada al interlocutor, cejas suaves, boca casi neutra con micro-sonrisas al enfatizar.'],
  ['Explicar algo con las manos','Conversación','Explicar',MIC+'Convo 03 Animated Loop Michael 8.glb','Cejas que suben con cada idea clave, visemas de habla y asentimientos de cabeza con parpadeo.'],
  ['Explicar con mucha energía','Conversación','Explicar',MIC+'Convo 04 Very Animated Loop Michael 8.glb','Cejas muy móviles, ojos abiertos, sonrisa franca y mandíbula muy activa al hablar.'],
  ['Conversar de pie','Conversación','Explicar',M3+'02_Standing_Conversation_01.fbx','Habla natural con mirada que va y vuelve al interlocutor; sonrisa ligera en las pausas.'],
  ['Conversar de pie moviendo las manos','Conversación','Explicar',M3+'03_Standing_Conversation_02.fbx','Habla animada, cejas que acompañan el ritmo de las manos, risa breve al final de la frase.'],
  ['Escuchar con atención','Conversación','Escuchar',MIC+'Convo 11 Listening Loop Michael 8.glb','Ojos fijos en quien habla, cejas levemente arriba, boca cerrada y parpadeo lento.'],
  ['Escuchar con serenidad (de pie)','Conversación','Escuchar',CHF+'078_AA_church_Female_stand_listening_loop01.FBX','Mirada tranquila al frente, expresión neutra suave, parpadeo pausado.'],
  ['Escuchar con las manos recogidas','Conversación','Escuchar',CHM+'022_AA_church_Male_stand_listening_loop01.FBX','Rostro neutro atento, cejas apenas elevadas, mirada estable.'],
  ['Asentir de pie y echar a andar','Conversación','Escuchar',M3+'05_Stand_Agree_And_Walk.fbx','Gesto de conformidad: media sonrisa, cejas arriba un instante y mirada hacia donde se va.'],
  ['Asentir al caminar y seguir','Conversación','Escuchar',M3+'07_Walk_Stop_Agree_And_Continue.fbx','Sonrisa corta de acuerdo al detenerse, cejas que suben y vuelta a la mirada al frente.'],
  ['Discutir acaloradamente','Conversación','Discutir',MIC+'Convo 05 Argument 1 Loop Michael 8.glb','Ceño fruncido, ojos entornados, boca tensa y mandíbula adelantada al alzar la voz.'],
  ['Discutir con reproche','Conversación','Discutir',MIC+'Convo 06 Argument 2 Loop Michael 8.glb','Cejas en oblicuo, labios apretados, resoplido y mirada que se desvía con enfado contenido.'],
  ['Indicar el camino a un lado','Conversación','Dar indicaciones',MIC+'Convo 08 Directions A Left Loop Michael 8.glb','Mirada que sigue la mano hacia el lado señalado y vuelve al interlocutor; expresión amable.'],
  ['Señalar hacia un lado mientras se habla','Conversación','Dar indicaciones',MIC+'Convo 09 Gesturing To Side A Right Loop Michael 8.glb','Mirada hacia el lado señalado, cejas que enfatizan, habla clara.'],
  ['Señalar hacia arriba al explicar','Conversación','Dar indicaciones',MIC+'Convo 12 Gesturing Up C Center Loop Michael 8.glb','Mirada que sube con la mano, ojos algo abiertos, cejas arriba en el punto señalado.'],
  ['Señalar y echar a andar','Conversación','Dar indicaciones',M3+'04_Stand_Point_And_Walk.fbx','Mirada al punto señalado, ceja arriba de «por aquí» y sonrisa leve al empezar a caminar.'],
  ['Contar una gran idea','Conversación','Contar una idea o una noticia',MIC+'Convo 10 Big Idea Loop Michael 8.glb','Ojos muy abiertos, cejas arriba, sonrisa de entusiasmo y habla rápida con pausas expectantes.'],
  ['Contar algo con ánimo','Conversación','Contar una idea o una noticia',MIC+'Convo 02 Up Beat Loop Michael 8.glb','Sonrisa de Duchenne en las pausas, cejas alegres y cabeza que acompaña el ritmo.'],
  ['Contar algo triste','Conversación','Contar una idea o una noticia',MIC+'Convo 07 Sad Loop Michael 8.glb','Cejas internas arriba, comisuras caídas, párpados pesados y mirada hacia abajo.'],
  // ---- Saludos y despedidas ----
  ['Recibir a una visita en la puerta','Saludos y despedidas','Saludar',M1+'11_Greet_Visitor_Door.fbx','Sonrisa amplia de bienvenida, cejas arriba y mirada directa a quien llega.'],
  ['Saludar con la mano al caminar','Saludos y despedidas','Saludar',M7+'15_Walk_And_Wave.fbx','Sonrisa abierta, cejas que suben al ver a la otra persona y asentimiento corto.'],
  ['Saludar con la señal de paz','Saludos y despedidas','Saludar',M4+'09_Peace_Sign_Pose.fbx','Sonrisa juguetona, ojo ligeramente entornado y cabeza ladeada.'],
  ['Levantarse del sofá y despedirse con la mano','Saludos y despedidas','Despedirse',M3+'14_Sitting_Sofa_Stand_Wave_And_Walk.fbx','Sonrisa cálida de despedida, cejas suaves y mirada que se queda un momento en la otra persona.'],
  // ---- Teléfono y pantallas ----
  ['Videollamada caminando','Teléfono y pantallas','Videollamada',M3+'08_Walk_Video_Call_Phone_01.fbx','Mirada a la pantalla, habla animada y sonrisa al saludar; cejas expresivas al hablar.'],
  ['Videollamada en el sofá','Teléfono y pantallas','Videollamada',M3+'15_Sitting_Sofa_Video_Call_Phone.fbx','Mirada a la cámara, sonrisa relajada y habla con pausas para escuchar.'],
  ['Videollamada apoyado en la pared','Teléfono y pantallas','Videollamada',M3+'16_Standing_Wall_Lean_Video_Call.fbx','Habla distendida, sonrisa ladeada y mirada a la pantalla con desvíos breves.'],
  ['Reunión virtual sentado','Teléfono y pantallas','Videollamada',M7+'20_Virtual_Meeting.fbx','Rostro atento y profesional, cejas ligeras al intervenir, asentimientos con parpadeo.'],
  ['Usar el móvil apoyado en la pared','Teléfono y pantallas','Escribir en el móvil',M3+'17_Standing_Wall_Lean_Phone_Use.fbx','Mirada baja a la pantalla, boca neutra y cejas que se alzan al leer algo curioso.'],
  ['Escribir en el móvil de pie','Teléfono y pantallas','Escribir en el móvil',M4+'18_Standing_Texting.fbx','Mirada baja, labios apenas apretados al teclear y media sonrisa al leer la respuesta.'],
  ['Hacerse un selfie','Teléfono y pantallas','Fotos y selfies',M4+'12_Standing_Selfie.fbx','Mirada a la cámara, sonrisa de pose y cabeza ladeada.'],
  // ---- Reacciones del público ----
  ['Aplaudir sentado','Reacciones del público','Aplaudir',M4+'01_Sitting_Clapping.fbx','Sonrisa de aprobación, cejas arriba y mirada hacia el escenario.'],
  ['Aplaudir de pie','Reacciones del público','Aplaudir',M4+'02_Standing_Clapping.fbx','Sonrisa amplia, ojos brillantes y cabeza que asiente al ritmo.'],
  ['Aplaudir con las manos en alto','Reacciones del público','Aplaudir',M4+'03_Clapping_Hands_Up.fbx','Alegría desbordada, boca abierta en sonrisa y cejas altas.'],
  ['Aplaudir y asentir','Reacciones del público','Aplaudir',M4+'04_Clapping_And_Agree.fbx','Sonrisa de conformidad, asentimientos con las cejas y mirada al frente.'],
  ['Celebrar con el puño en alto','Reacciones del público','Celebrar',M4+'05_Fist_Up_Cheering.fbx','Grito de alegría: boca abierta, ojos entornados, cejas altas y dientes visibles.'],
  ['Reír señalando a alguien','Reacciones del público','Celebrar',M4+'22_Pointing_And_Laughing.fbx','Carcajada con mejillas arriba, ojos casi cerrados y la boca muy abierta.'],
  // ---- Esperar y descansar ----
  ['Esperar de pie','Esperar y descansar','Esperar',IDLE+'AS_StandUpright_Normal01_Loop01.fbx','Rostro neutro, parpadeo natural y mirada que se pasea sin fijarse.'],
  ['Esperar apoyado en la pared','Esperar y descansar','Esperar',IDLE+'AS_StandLean_Normal01_Loop01.fbx','Expresión relajada, cejas sueltas y mirada perdida con algún bostezo discreto.'],
  ['Mirar a su alrededor','Esperar y descansar','Esperar',M3+'01_Standing_Looking_Around.fbx','Ojos que recorren el entorno, cejas curiosas y cabeza que acompaña la mirada.'],
  ['Mirar el reloj','Esperar y descansar','Esperar',SURV+'Idle/IP_idle_look_at_watch.FBX','Mirada a la muñeca, ceja algo arriba, labios apretados con impaciencia y un suspiro.'],
  ['Pensar rascándose el cuello','Esperar y descansar','Pensar',M4+'16_Scratch_Neck.fbx','Ceja asimétrica, boca ladeada, mirada hacia arriba y parpadeo lento al dudar.'],
  // ---- Sentados a la mesa o en el sofá ----
  ['Conversar sentado con gestos','Sentados a la mesa o en el sofá','Conversar en silla',M3+'10_Sitting_Chair_Conversation_Gesturing.fbx','Habla animada, cejas que acompañan las manos y mirada al interlocutor.'],
  ['Conversar tomando un café','Sentados a la mesa o en el sofá','Conversar en la mesa',M3+'11_Sitting_Coffee_Conversation.fbx','Rostro cercano, sonrisa tranquila al hablar y mirada que baja a la taza al sorber.'],
  ['Mirar y reír en el sofá','Sentados a la mesa o en el sofá','Conversar en el sofá',M3+'12_Sitting_Sofa_Conversation_Look_Laugh.fbx','Risa franca con la cabeza girada hacia el otro, mejillas arriba y ojos entornados.'],
  ['Asentir en el sofá','Sentados a la mesa o en el sofá','Conversar en el sofá',M3+'13_Sitting_Sofa_Conversation_Agree.fbx','Escucha con media sonrisa, cejas que suben al dar la razón y asentimientos suaves.'],
  ['Conversar sentado en la sala','Sentados a la mesa o en el sofá','Conversar en silla',M7+'19_Seated_Conversation.fbx','Habla y escucha alternando, expresión serena y sonrisa en los remates.'],
  // ---- Tareas cotidianas ----
  ['Leer un libro','Tareas cotidianas','Leer y escribir',M7+'08_Read_Book.fbx','Mirada baja siguiendo las líneas, cejas relajadas y alguna ceja arriba ante una sorpresa de la lectura.'],
  ['Escribir a ordenador sentado','Tareas cotidianas','Leer y escribir',M7+'17_Seated_Typing.fbx','Ojos fijos en la pantalla, boca neutra, ceño leve de concentración y parpadeos espaciados.'],
  ['Beber de pie','Tareas cotidianas','Tomar algo',M4+'20_Standing_Drinking.fbx','Labios en el borde del vaso, ojos que miran al frente y gesto de alivio al terminar.'],
  ['Sostener una taza y asentir','Tareas cotidianas','Tomar algo',M4+'21_Holding_Cup_Nodding.fbx','Sonrisa suave tras la taza, cejas que suben al dar la razón y mirada atenta.'],
];

if(FILAS.length!==50)throw new Error(`ActuacionesCotidianas: se esperaban 50 filas y hay ${FILAS.length}.`);

/** 50 actuaciones cotidianas congeladas: cuerpo (mocap) + rostro (RostrosCotidianos.mjs). */
export const DAILY_ACTINGS=Object.freeze(FILAS.map(([name,category,subcategory,ruta,faceNotes],i)=>Object.freeze({
  id:`daily-${i+1}`,
  name,category,subcategory,
  perfil:perfilDeRuta(ruta),
  body:Object.freeze({raiz:'paquetes',ruta}),
  faceStatus:'listo',
  faceNotes,
})));

export const DAILY_BY_ID=new Map(DAILY_ACTINGS.map(a=>[a.id,a]));
