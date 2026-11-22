// Esqueleto humanoide canónico: nombres comunes a todos los personajes.
// Cada clip de la biblioteca se guarda en este espacio y se aplica a cualquier GLB/FBX.

const FINGERS = ['thumb', 'index', 'middle', 'ring', 'little'];

// [id, padre canónico, grupo, dirección ideal en pose T (X = izquierda del personaje, Y = arriba, Z = delante)]
const BASE = [
  ['hips', null, 'torso', [0, 1, 0]],
  ['spine', 'hips', 'torso', [0, 1, 0]],
  ['chest', 'spine', 'torso', [0, 1, 0]],
  ['upperChest', 'chest', 'torso', [0, 1, 0]],
  ['neck', 'upperChest', 'head', [0, 1, 0]],
  ['head', 'neck', 'head', [0, 1, 0]],
];

function sideRows(S, sx) {
  const arm = `arm${S}`, leg = `leg${S}`, fin = `fingers${S}`;
  const rows = [
    [`shoulder${S}`, 'upperChest', arm, [sx, 0, 0]],
    [`upperArm${S}`, `shoulder${S}`, arm, [sx, 0, 0]],
    [`lowerArm${S}`, `upperArm${S}`, arm, [sx, 0, 0]],
    [`hand${S}`, `lowerArm${S}`, arm, [sx, 0, 0]],
    [`upperLeg${S}`, 'hips', leg, [0, -1, 0]],
    [`lowerLeg${S}`, `upperLeg${S}`, leg, [0, -1, 0]],
    [`foot${S}`, `lowerLeg${S}`, leg, [0, 0, 1]],
    [`toes${S}`, `foot${S}`, leg, [0, 0, 1]],
  ];
  for (const f of FINGERS) {
    const dir = f === 'thumb' ? [sx * 0.7071, 0, 0.7071] : [sx, 0, 0];
    for (let n = 1; n <= 3; n++) {
      rows.push([`${f}${n}${S}`, n === 1 ? `hand${S}` : `${f}${n - 1}${S}`, fin, dir]);
    }
  }
  return rows;
}

export const CANON = [...BASE, ...sideRows('L', 1), ...sideRows('R', -1)].map(
  ([id, parent, group, dir]) => ({ id, parent, group, dir }),
);
export const CANON_BY_ID = Object.fromEntries(CANON.map((c) => [c.id, c]));
export const CANON_IDS = CANON.map((c) => c.id);

// Hijo de referencia para medir la dirección de cada hueso en reposo.
export const CANON_CHILD = {
  hips: ['spine', 'chest', 'upperChest', 'neck'],
  spine: ['chest', 'upperChest', 'neck'],
  chest: ['upperChest', 'neck'],
  upperChest: ['neck', 'head'],
  neck: ['head'],
};
for (const S of ['L', 'R']) {
  Object.assign(CANON_CHILD, {
    [`shoulder${S}`]: [`upperArm${S}`],
    [`upperArm${S}`]: [`lowerArm${S}`],
    [`lowerArm${S}`]: [`hand${S}`],
    [`hand${S}`]: [`middle1${S}`, `index1${S}`, `ring1${S}`],
    [`upperLeg${S}`]: [`lowerLeg${S}`],
    [`lowerLeg${S}`]: [`foot${S}`],
    [`foot${S}`]: [`toes${S}`],
  });
  for (const f of FINGERS) {
    CANON_CHILD[`${f}1${S}`] = [`${f}2${S}`];
    CANON_CHILD[`${f}2${S}`] = [`${f}3${S}`];
  }
}

export const GROUPS = [
  { id: 'torso', label: 'Torso' },
  { id: 'head', label: 'Cuello y cabeza' },
  { id: 'armL', label: 'Brazo izq.' },
  { id: 'armR', label: 'Brazo der.' },
  { id: 'legL', label: 'Pierna izq.' },
  { id: 'legR', label: 'Pierna der.' },
  { id: 'fingersL', label: 'Dedos izq.' },
  { id: 'fingersR', label: 'Dedos der.' },
];

const NOMBRES = {
  hips: 'Cadera', spine: 'Columna', chest: 'Pecho', upperChest: 'Pecho alto', neck: 'Cuello', head: 'Cabeza',
  shoulder: 'Clavícula', upperArm: 'Brazo', lowerArm: 'Antebrazo', hand: 'Mano',
  upperLeg: 'Muslo', lowerLeg: 'Pierna', foot: 'Pie', toes: 'Dedos del pie',
  thumb: 'Pulgar', index: 'Índice', middle: 'Corazón', ring: 'Anular', little: 'Meñique',
};

export function canonLabel(id) {
  if (NOMBRES[id]) return NOMBRES[id];
  const m = id.match(/^([a-zA-Z]+?)(\d?)([LR])$/);
  if (!m) return id;
  const base = NOMBRES[m[1]] || m[1];
  return `${base}${m[2] ? ' ' + m[2] : ''} ${m[3] === 'L' ? 'izq.' : 'der.'}`;
}

export function mirrorCanon(id) {
  if (id.endsWith('L')) return id.slice(0, -1) + 'R';
  if (id.endsWith('R') && id !== 'upperChest') return id.slice(0, -1) + 'L';
  return id;
}

// ---------- Detección de nombres ----------

export function normalizeName(name) {
  let n = String(name || '').toLowerCase();
  n = n.replace(/^mixamorig\d*[:_]?/, '');
  n = n.replace(/[^a-z0-9]/g, '');
  n = n.replace(/^def/, '');
  return n;
}

function mixamoTable() {
  const t = { hips: 'Hips', spine: 'Spine', chest: 'Spine1', upperChest: 'Spine2', neck: 'Neck', head: 'Head' };
  const F = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', little: 'Pinky' };
  for (const [S, W] of [['L', 'Left'], ['R', 'Right']]) {
    Object.assign(t, {
      [`shoulder${S}`]: `${W}Shoulder`, [`upperArm${S}`]: `${W}Arm`, [`lowerArm${S}`]: `${W}ForeArm`, [`hand${S}`]: `${W}Hand`,
      [`upperLeg${S}`]: `${W}UpLeg`, [`lowerLeg${S}`]: `${W}Leg`, [`foot${S}`]: `${W}Foot`, [`toes${S}`]: `${W}ToeBase`,
    });
    for (const f of FINGERS) for (let n = 1; n <= 3; n++) t[`${f}${n}${S}`] = `${W}Hand${F[f]}${n}`;
  }
  return t;
}

function ueTable() {
  const t = { hips: 'pelvis', spine: 'spine_01', chest: 'spine_02', upperChest: 'spine_03', neck: 'neck_01', head: 'head' };
  const F = { thumb: 'thumb', index: 'index', middle: 'middle', ring: 'ring', little: 'pinky' };
  for (const S of ['L', 'R']) {
    const s = S.toLowerCase();
    Object.assign(t, {
      [`shoulder${S}`]: `clavicle_${s}`, [`upperArm${S}`]: `upperarm_${s}`, [`lowerArm${S}`]: `lowerarm_${s}`, [`hand${S}`]: `hand_${s}`,
      [`upperLeg${S}`]: `thigh_${s}`, [`lowerLeg${S}`]: `calf_${s}`, [`foot${S}`]: `foot_${s}`, [`toes${S}`]: `ball_${s}`,
    });
    for (const f of FINGERS) for (let n = 1; n <= 3; n++) t[`${f}${n}${S}`] = `${F[f]}_0${n}_${s}`;
  }
  return t;
}

function rigifyTable() {
  const t = { hips: 'DEF-spine', spine: 'DEF-spine.001', chest: 'DEF-spine.002', upperChest: 'DEF-spine.003', neck: 'DEF-spine.004', head: 'DEF-spine.006' };
  const F = { thumb: 'thumb', index: 'f_index', middle: 'f_middle', ring: 'f_ring', little: 'f_pinky' };
  for (const S of ['L', 'R']) {
    Object.assign(t, {
      [`shoulder${S}`]: `DEF-shoulder.${S}`, [`upperArm${S}`]: `DEF-upper_arm.${S}`, [`lowerArm${S}`]: `DEF-forearm.${S}`, [`hand${S}`]: `DEF-hand.${S}`,
      [`upperLeg${S}`]: `DEF-thigh.${S}`, [`lowerLeg${S}`]: `DEF-shin.${S}`, [`foot${S}`]: `DEF-foot.${S}`, [`toes${S}`]: `DEF-toe.${S}`,
    });
    for (const f of FINGERS) for (let n = 1; n <= 3; n++) t[`${f}${n}${S}`] = `DEF-${F[f]}.0${n}.${S}`;
  }
  return t;
}

function vrmTable() {
  const t = { hips: 'hips', spine: 'spine', chest: 'chest', upperChest: 'upperChest', neck: 'neck', head: 'head' };
  const F = { thumb: 'Thumb', index: 'Index', middle: 'Middle', ring: 'Ring', little: 'Little' };
  const P = ['Proximal', 'Intermediate', 'Distal'];
  for (const [S, W] of [['L', 'left'], ['R', 'right']]) {
    Object.assign(t, {
      [`shoulder${S}`]: `${W}Shoulder`, [`upperArm${S}`]: `${W}UpperArm`, [`lowerArm${S}`]: `${W}LowerArm`, [`hand${S}`]: `${W}Hand`,
      [`upperLeg${S}`]: `${W}UpperLeg`, [`lowerLeg${S}`]: `${W}LowerLeg`, [`foot${S}`]: `${W}Foot`, [`toes${S}`]: `${W}Toes`,
    });
    for (const f of FINGERS) for (let n = 1; n <= 3; n++) t[`${f}${n}${S}`] = `${W}${F[f]}${P[n - 1]}`;
  }
  return t;
}

// Reallusion: AccuRig, ActorCore y Character Creator (CC3/CC4) exportan «CC_Base_…».
// CC_Base_Hip es la raíz que se mueve; CC_Base_Pelvis (hijo, padre de los muslos) queda sin mapear
// y sigue a la cadera. Los huesos Twist/ShareBone cuelgan de su hueso principal y lo siguen.
function reallusionTable(prefix = 'CC_Base_') {
  const t = { hips: 'Hip', spine: 'Waist', chest: 'Spine01', upperChest: 'Spine02', neck: 'NeckTwist01', head: 'Head' };
  const F = { thumb: 'Thumb', index: 'Index', middle: 'Mid', ring: 'Ring', little: 'Pinky' };
  for (const S of ['L', 'R']) {
    Object.assign(t, {
      [`shoulder${S}`]: `${S}_Clavicle`, [`upperArm${S}`]: `${S}_Upperarm`, [`lowerArm${S}`]: `${S}_Forearm`, [`hand${S}`]: `${S}_Hand`,
      [`upperLeg${S}`]: `${S}_Thigh`, [`lowerLeg${S}`]: `${S}_Calf`, [`foot${S}`]: `${S}_Foot`, [`toes${S}`]: `${S}_ToeBase`,
    });
    for (const f of FINGERS) for (let n = 1; n <= 3; n++) t[`${f}${n}${S}`] = `${S}_${F[f]}${n}`;
  }
  for (const k of Object.keys(t)) t[k] = prefix + t[k];
  return t;
}

// Daz Genesis 8 (FBX y BVH de Daz): «hip» es la raíz que se mueve; los huesos Twist cuelgan de su
// hueso Bend y Metatarsals/Carpal quedan sin mapear (siguen a su padre).
function dazTable() {
  const t = { hips: 'hip', spine: 'abdomenLower', chest: 'abdomenUpper', upperChest: 'chestUpper', neck: 'neckLower', head: 'head' };
  const F = { thumb: 'Thumb', index: 'Index', middle: 'Mid', ring: 'Ring', little: 'Pinky' };
  for (const [S, s] of [['L', 'l'], ['R', 'r']]) {
    Object.assign(t, {
      [`shoulder${S}`]: `${s}Collar`, [`upperArm${S}`]: `${s}ShldrBend`, [`lowerArm${S}`]: `${s}ForearmBend`, [`hand${S}`]: `${s}Hand`,
      [`upperLeg${S}`]: `${s}ThighBend`, [`lowerLeg${S}`]: `${s}Shin`, [`foot${S}`]: `${s}Foot`, [`toes${S}`]: `${s}Toe`,
    });
    for (const f of FINGERS) for (let n = 1; n <= 3; n++) t[`${f}${n}${S}`] = `${s}${F[f]}${n}`;
  }
  return t;
}

// Malbers (Horse Animset Pro): jinete «R_…». R_CG es el centro de gravedad (raíz) y R_Pelvis su hijo, que lleva los muslos
// y se anima aparte: la cadera es R_Pelvis (su posición y giro de mundo ya incluyen a R_CG). Dedos: Finger0 = pulgar … Finger4 = meñique.
function malbersTable() {
  const t = { hips: 'R_Pelvis', spine: 'R_Spine', chest: 'R_Spine1', upperChest: 'R_Spine2', neck: 'R_Neck', head: 'R_Head' };
  FINGERS.forEach((f, i) => {
    for (const S of ['L', 'R']) for (let n = 1; n <= 3; n++) t[`${f}${n}${S}`] = `R_${S}_Finger${i}${n === 1 ? '' : n - 1}`;
  });
  for (const S of ['L', 'R']) {
    Object.assign(t, {
      [`shoulder${S}`]: `R_${S}_Clavicle`, [`upperArm${S}`]: `R_${S}_UpperArm`, [`lowerArm${S}`]: `R_${S}_Forearm`, [`hand${S}`]: `R_${S}_Hand`,
      [`upperLeg${S}`]: `R_${S}_Thigh`, [`lowerLeg${S}`]: `R_${S}_Calf`, [`foot${S}`]: `R_${S}_Foot`, [`toes${S}`]: `R_${S}_Toe0`,
    });
  }
  return t;
}

// SOMA de 30 huesos (Kimodo, texto → movimiento). Ojo: aquí «LeftLeg» es el muslo y «LeftShin» la pierna.
function somaTable() {
  const t = { hips: 'Hips', spine: 'Spine1', chest: 'Spine2', upperChest: 'Chest', neck: 'Neck1', head: 'Head' };
  for (const [S, W] of [['L', 'Left'], ['R', 'Right']]) {
    Object.assign(t, {
      [`shoulder${S}`]: `${W}Shoulder`, [`upperArm${S}`]: `${W}Arm`, [`lowerArm${S}`]: `${W}ForeArm`, [`hand${S}`]: `${W}Hand`,
      [`upperLeg${S}`]: `${W}Leg`, [`lowerLeg${S}`]: `${W}Shin`, [`foot${S}`]: `${W}Foot`, [`toes${S}`]: `${W}ToeBase`,
    });
  }
  return t;
}

// Alias sueltos para esqueletos hechos a mano en Blender u otras apps.
function looseAliases() {
  const t = {
    hips: ['hips', 'pelvis', 'hip', 'root_hips', 'cog'],
    spine: ['spine', 'spine01', 'spine1', 'abdomen', 'torso'],
    chest: ['chest', 'spine02', 'spine2', 'ribs'],
    upperChest: ['upperchest', 'spine03', 'spine3'],
    neck: ['neck', 'neck01', 'neck1'],
    head: ['head'],
  };
  for (const [S, w, s] of [['L', 'left', 'l'], ['R', 'right', 'r']]) {
    const v = (...xs) => xs.flatMap((x) => [`${x}${s}`, `${s}${x}`, `${w}${x}`, `${x}${w}`]);
    Object.assign(t, {
      [`shoulder${S}`]: v('shoulder', 'clavicle', 'collar'),
      [`upperArm${S}`]: v('upperarm', 'arm', 'uparm'),
      [`lowerArm${S}`]: v('lowerarm', 'forearm', 'elbow', 'loarm'),
      [`hand${S}`]: v('hand', 'wrist'),
      [`upperLeg${S}`]: v('upperleg', 'thigh', 'upleg', 'hip'),
      [`lowerLeg${S}`]: v('lowerleg', 'shin', 'calf', 'knee', 'leg'),
      [`foot${S}`]: v('foot', 'ankle'),
      [`toes${S}`]: v('toes', 'toe', 'toebase', 'ball'),
    });
  }
  return t;
}

export const CONVENTIONS = {
  mixamo: { label: 'Mixamo', table: mixamoTable() },
  ue: { label: 'Unreal / Quaternius', table: ueTable() },
  rigify: { label: 'Rigify (Blender)', table: rigifyTable() },
  vrm: { label: 'VRM / genérico', table: vrmTable() },
  accurig: { label: 'AccuRig / Reallusion (CC)', table: reallusionTable() },
  // Mismo esqueleto exportado sin prefijo o con «RL_» (iClone, algunos FBX de ActorCore).
  accurigRL: { label: 'AccuRig / Reallusion (RL)', table: reallusionTable('RL_') },
  daz: { label: 'Daz Genesis 8', table: dazTable() },
  malbers: { label: 'Malbers (jinete R_)', table: malbersTable() },
  soma: { label: 'SOMA (Kimodo)', table: somaTable(), exclusive: true },
};
const LOOSE = looseAliases();

/**
 * Detecta la correspondencia hueso canónico → nombre de hueso real.
 * @param {string[]} names nombres de los nodos candidatos (orden de preferencia: primero los huesos con piel)
 */
export function detectMapping(names) {
  const norm = new Map();
  names.forEach((n) => {
    const k = normalizeName(n);
    if (k && !norm.has(k)) norm.set(k, n);
  });
  let best = null;
  for (const [key, conv] of Object.entries(CONVENTIONS)) {
    let score = 0;
    for (const real of Object.values(conv.table)) if (norm.has(normalizeName(real))) score++;
    if (!best || score > best.score) best = { key, score };
  }
  const mapping = {};
  const used = new Set();
  const take = (canon, alias) => {
    const real = norm.get(normalizeName(alias));
    if (real && !used.has(real) && !mapping[canon]) {
      mapping[canon] = real;
      used.add(real);
    }
  };
  if (best && best.score >= 6) {
    for (const [canon, real] of Object.entries(CONVENTIONS[best.key].table)) take(canon, real);
  }
  // Huecos: probar el resto de convenciones y alias sueltos.
  for (const c of CANON_IDS) {
    if (mapping[c]) continue;
    for (const conv of Object.values(CONVENTIONS)) if (conv.table[c] && !conv.exclusive) take(c, conv.table[c]);
    if (!mapping[c] && LOOSE[c]) for (const a of LOOSE[c]) take(c, a);
  }
  // Rigify: si falta el cuello pero existe spine.005 úsalo como cuello.
  const convention = best && best.score >= 6 ? best.key : Object.keys(mapping).length ? 'generico' : 'ninguno';
  return { mapping, convention, score: best ? best.score : 0 };
}

export function conventionLabel(key) {
  if (CONVENTIONS[key]) return CONVENTIONS[key].label;
  if (key === 'manual') return 'Mapeo manual';
  if (key === 'generico') return 'Nombres genéricos';
  return 'Sin esqueleto humanoide';
}

export const IK_CHAINS = {
  handL: { label: 'Mano izq.', bones: ['upperArmL', 'lowerArmL', 'handL'], group: 'armL', poleDir: [0, 0, -1] },
  handR: { label: 'Mano der.', bones: ['upperArmR', 'lowerArmR', 'handR'], group: 'armR', poleDir: [0, 0, -1] },
  footL: { label: 'Pie izq.', bones: ['upperLegL', 'lowerLegL', 'footL'], group: 'legL', poleDir: [0, 0, 1] },
  footR: { label: 'Pie der.', bones: ['upperLegR', 'lowerLegR', 'footR'], group: 'legR', poleDir: [0, 0, 1] },
};
