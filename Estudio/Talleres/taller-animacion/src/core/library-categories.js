// Categorías de la biblioteca de animaciones: Categoría › Subcategoría.
// Se deciden por el nombre del clip y la carpeta de origen (inglés o español), nunca por el personaje.
// Las reglas van de lo más concreto a lo más general: gana la primera que coincide.

const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_\-./\\]+/g, ' ')
  .toLowerCase();

// [categoría, subcategoría, expresión]
const RULES = [
  // Jinete a caballo (Horse Animset Pro): antes que cualquier regla general (morir, saltar, nadar…)
  ['Animales', 'Montar y desmontar', /\brider\b.*(mount|dismount)/],
  ['Animales', 'Saltos a caballo', /\brider\b.*jump/],
  ['Animales', 'Reacciones a caballo', /\brider\b.*(death|fall|get hit|attack|recover)/],
  ['Animales', 'Nadar y volar a caballo', /\brider\b.*(swim|fly)/],
  ['Animales', 'Reposo a caballo', /\brider\b.*(idle|neigh|sleep)/],
  ['Animales', 'Marcha a caballo', /\brider\b/],

  // Fantasía y Halloween (antes que caminar/atacar)
  ['Trabajo y oficios', 'Pescar', /fish/],
  ['Vida diaria', 'Bar y cafetería', /bartender|bar counter|serve drink/],
  ['Fantasía y Halloween', 'Zombis', /\bzombie|zombi/],
  ['Fantasía y Halloween', 'Monstruos y criaturas', /monster|werewolf|vampire|giant|creature|howl/],
  ['Fantasía y Halloween', 'Hechizos y magia', /fireball|spell|magic|energy ball|power up|\bcast\b|casting|summon|portal|telekinesis|lightning|enchant|self buff/],
  ['Fantasía y Halloween', 'Alquimia y pociones', /alchemist|potion|grind ingredient/],

  // Iglesia (antes que escuchar/sentarse)
  ['Iglesia y religión', 'Predicar', /priest preach|preach/],
  ['Iglesia y religión', 'Santiguarse y rezar', /sign of the cross|pray|rezar/],
  ['Iglesia y religión', 'Coro', /choir/],
  ['Iglesia y religión', 'Confesión', /confession/],

  // Deporte
  ['Deporte y ejercicio', 'Fútbol', /dribble|juggl|throw in|penalty|goal|goalkeeper|soccer|futbol|yellow card|red card|side foot kick|power kick|defending/],
  ['Deporte y ejercicio', 'Estiramientos', /stretch(?!.*stand and walk)|estir/],
  ['Deporte y ejercicio', 'Pesas y máquinas', /dumbbell|barbell|bench press|pec deck|seated row|curl|lateral raise|biceps pose|squat|lunge|calf raise/],
  ['Deporte y ejercicio', 'Cardio y saltos', /jumping jack|box step|forward backward run|standing jump|push ?up|sit ?up|burpee|exercise|workout/],

  // Baile
  ['Baile', 'Bailar', /danc|samba|disco|shuffle|head danc|bail/],
  ['Música', 'Tocar y actuar', /bard|preform|perform|guitar|lute|\bsing\b|singing/],

  // Combate
  ['Combate', 'Espada y escudo', /sword|shield|katana|slash|blade/],
  ['Combate', 'Armas de fuego', /pistol|rifle|\bgun|shoot|\baim\b/],
  ['Combate', 'Puñetazos y patadas', /punch|kick|jab|cross|hook|uppercut|melee|combo|boxing/],
  ['Combate', 'Defensa y esquivar', /block|dodge|parry|guard/],
  ['Combate', 'Atacar', /attack|strike|scratch|stab|dagger/],

  // Lesiones y reacciones físicas
  ['Emociones y reacciones', 'Golpes y caídas', /\bhit\b|impact|knock|kicked|punched|stagger|fall(?!ing)|falling|stumble|\btrip\b/],
  ['Emociones y reacciones', 'Morir', /death|dying|\bdie\b|corpse|dead/],
  ['Heridas y curación', 'Curarse y curar', /\bheal|bandage|first aid|medkit|rescue|cpr/],
  ['Heridas y curación', 'Moverse herido', /\bhurt|injur|limp|wounded/],

  // Emociones
  ['Emociones y reacciones', 'Miedo y susto', /scared|fear|afraid|terrified|startle|panic|cower/],
  ['Emociones y reacciones', 'Tristeza', /\bsad\b|cry|sob|depress|grief|upset/],
  ['Emociones y reacciones', 'Enfado', /angry|anger|rage|furious|frustrat|annoy/],
  ['Emociones y reacciones', 'Sorpresa', /surpris|shock|amaz|astonish/],
  ['Emociones y reacciones', 'Alegría y risa', /laugh|happy|joy|excite|cheer(?!ing)/],

  // Conversación
  ['Conversación', 'Teléfono y videollamada', /phone|video call|texting|selfie|virtual meeting|telefon|movil/],
  ['Conversación', 'Discutir', /argu|argument|discut|shout|yell|complain/],
  ['Conversación', 'Dar indicaciones y señalar', /direction|point|gesturing to side|gesturing up|senal/],
  ['Conversación', 'Escuchar', /listen|escuch/],
  ['Conversación', 'Asentir y negar', /\bagree|\bnod|nodding|\byes\b|\bno\b|disagree|head shake|asentir|negar/],
  ['Conversación', 'Contar una idea', /big idea|idea|explain|present|lecture|teach/],
  ['Conversación', 'Hablar con gestos', /talk|convers|convo|chat|speak|discuss|gestur|hablar/],

  // Saludos y gestos
  ['Saludos y gestos', 'Saludar y despedirse', /wave|greet|hello|goodbye|bye|salud|despedir|handshake|\bbow\b/],
  ['Saludos y gestos', 'Aplaudir', /clap|aplaud/],
  ['Saludos y gestos', 'Celebrar y animar', /celebrat|cheering|fist up|victory|hands up|swaying|hang loose|rock on|peace sign|\bwin\b/],
  ['Saludos y gestos', 'Pensar y dudar', /think|thinking|ponder|shrug|scratch (neck|head)|confus|doubt|pensar|encoger/],
  ['Saludos y gestos', 'Mirar alrededor', /look(ing)? around|look up|looking up|search|scan/],

  // Limpieza
  ['Limpieza y hogar', 'Barrer y recoger', /sweep|dustpan|broom/],
  ['Limpieza y hogar', 'Aspirar', /vacuum/],
  ['Limpieza y hogar', 'Limpiar cristales', /cleaning glass|squeegee|\bwipe/],
  ['Limpieza y hogar', 'Quitar el polvo', /dust/],
  ['Limpieza y hogar', 'Fregar y platos', /dishes|plate|mop/],

  // Vida diaria
  ['Vida diaria', 'Recados en la calle', /\batm\b|use atm|taxi|taking photo|photo|check watch|check pockets|looking at map|\bmap\b|binocul|make a sign/],
  ['Comercio', 'Comprar y vender', /merchant|count coins|give item|shop|cashier|\bpay\b/],
  ['Objetos e interacción', 'Abrir cofres y cajas', /chest|open box/],
  ['Objetos e interacción', 'Coger y dejar objetos', /pick object|place object|shelf|on table|fill container|consume|inspect|press button|\binteract|move furniture|berries|warm hands|break glass|keycard/],
  ['Vida diaria', 'Puertas y ventanas', /door|window|curtain|knock on/],
  ['Vida diaria', 'Sofá y televisión', /watch tv|television|sofa|couch/],
  ['Vida diaria', 'Comer y beber', /\beat|eating|drink|breakfast|coffee|\bcup\b|bottle|glass and drink|fill glass|meal|dinner|set ?table|taste/],
  ['Vida diaria', 'Aseo personal', /shower|brush teeth|wash|toilet|bath/],
  ['Vida diaria', 'Leer, escribir y ordenador', /\bread\b|reading|book|typing|keyboard|computer|laptop|write|writing/],
  ['Vida diaria', 'Mascotas', /\bdog\b|pet |harness|\bcat\b/],
  ['Vida diaria', 'Vestirse y salir', /get ready|leave|dress|put on|jacket|coat/],
  ['Vida diaria', 'Ordenar objetos', /organi[sz]e|tidy|put away|arrange/],
  ['Transporte y vehículos', 'Coche y moto', /driv|car\b|get in car|motorbike|vehicle|suv|pickup truck|steering/],
  ['Transporte y vehículos', 'Barca', /boat|paddle|row(ing)? boat/],
  ['Transporte y vehículos', 'Estación y andén', /platform|carriage|train|station|terminal|\bbus\b/],

  // Cocina y exterior
  ['Cocina y fogata', 'Cocinar', /cook|stir|mix food|pan |frying|butcher|cut food|chop food/],
  ['Cocina y fogata', 'Fuego y antorcha', /\bfire|torch|lantern|flashlight|campfire|\bmatch\b/],
  ['Trabajo y oficios', 'Construir y reparar', /build|repair|\bfix|hammer|\bsaw\b|sawing|construct|weld|\btool/],
  ['Trabajo y oficios', 'Leña y pico', /\bchop|\baxe\b|wood|trunk|pickaxe|\bmine\b/],
  ['Trabajo y oficios', 'Cavar, sembrar y cosechar', /\bdig|shovel|sow|harvest|plant|farm|water(ing)? plant/],
  ['Trabajo y oficios', 'Registrar y recoger', /loot|search|pick ?up|pickup|grab|collect|take out|put on/],
  ['Trabajo y oficios', 'Cargar y empujar', /carry|push|pull|lift|\bdrag\b|throw/],
  ['Trabajo y oficios', 'Cerraduras', /\block|pick door|force in|break (in|through)/],

  // Dormir y transiciones de postura
  ['Esperas y posturas', 'Dormir y despertar', /sleep|wake|lie down|lying|bed|nap|dormir/],
  ['Esperas y posturas', 'Levantarse y sentarse', /stand to sit|sit to stand|stand up|sit down|get up|kneels? to|to kneels?|stand to kneel|sit to kneel/],
  ['Esperas y posturas', 'Arrodillado', /kneel|crouch idle|squat idle/],

  // Locomoción
  ['Locomoción', 'Agacharse y sigilo', /crouch|sneak|stealth|prone|crawl/],
  ['Locomoción', 'Deslizarse y rodar', /\bslide|\broll\b|\bdash\b|\bland\b/],
  ['Locomoción', 'Escaleras y trepar', /stair|climb|ladder|vault|ledge|parkour/],
  ['Locomoción', 'Saltar', /jump|leap|\bhop\b|salt/],
  ['Locomoción', 'Nadar', /swim/],
  ['Locomoción', 'Correr', /\brun|jog|sprint|correr/],
  ['Locomoción', 'Lateral y hacia atrás', /strafe|traverse|backward|sidestep|side step|walk (left|right)\b/],
  ['Locomoción', 'Girar', /\bturn|pivot|girar/],
  ['Locomoción', 'Caminar', /walk|caminar|step|stroll|strut/],

  // Esperas
  ['Esperas y posturas', 'Sentado', /\bsit|seated|sitting|chair|bench|sentad/],
  ['Esperas y posturas', 'Apoyado', /\blean|wall|\brail|strap|agarrad|apoy/],
  ['Esperas y posturas', 'De pie esperando', /idle|stand|wait|bored|breath|espera|relaxed|exhausted|rest\b|reposo/],
  ['Kimodo', 'Pruebas de texto', /prompt/],

  ['Poses', 'Poses fijas', /\bpose\b|t ?pose|a ?pose/],
];

export const CATEGORY_ORDER = [
  'Conversación', 'Saludos y gestos', 'Emociones y reacciones', 'Esperas y posturas', 'Locomoción', 'Animales',
  'Vida diaria', 'Limpieza y hogar', 'Cocina y fogata', 'Trabajo y oficios', 'Transporte y vehículos',
  'Deporte y ejercicio', 'Baile', 'Heridas y curación', 'Objetos e interacción', 'Comercio', 'Música', 'Combate', 'Fantasía y Halloween', 'Iglesia y religión', 'Poses', 'Kimodo', 'Otras',
];

const cache = new Map();

/** {cat, sub} de un clip; usa clip.name, clip.ruta (carpeta de origen) y clip.sourceName. */
export function animationCategory(clip) {
  const key = clip.id + '|' + (clip.ruta || '');
  if (cache.has(key)) return cache.get(key);
  // La carpeta cuenta (p. ej. «Locomotion/Hurt», «Eat_cook»), pero sin el nombre del pack ni las de perfil.
  const folders = String(clip.ruta || '').split('/').slice(1, -1).filter((f) => !/^(masculinas|femeninas|sin especificar)$/i.test(f));
  const text = norm([clip.sourceName, clip.name, ...folders].join(' '));
  let out = { cat: 'Otras', sub: 'Sin clasificar' };
  for (const [cat, sub, re] of RULES) if (re.test(text)) { out = { cat, sub }; break; }
  cache.set(key, out);
  return out;
}

export const categoryLabel = (c) => `${c.cat} › ${c.sub}`;
