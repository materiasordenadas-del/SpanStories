import * as T from './three.js';
import { DIMENSIONS } from './routes.js';

/* ── Luz de escena 2.5D del aeropuerto ─────────────────────────────────────
   Port de `escenarios/luz25d.js` (aula) al aeropuerto: mismo lenguaje de luz
   que los personajes, calculada en el material como lo haría un ilustrador.

     · zona iluminada = albedo × color de la luz
     · sombra        = albedo MULTIPLICADO por un tono frío (nunca hacia el negro)
     · corte duro pero antialiasado (fwidth); los volúmenes usan 3 bandas
       (sombra / medio / luz), los planos 2 bandas + relieve del normal map
     · rebote de hemisferio: cielo frío arriba, suelo cálido abajo

   Diferencias con el aula:
     · La luz es del MUNDO (el sol no gira con la cámara) y la fuente principal
       queda arriba a la izquierda del espectador en la vista de la fachada,
       el mismo lado que la luz de los personajes.
     · Cada fragmento decide si es INTERIOR o EXTERIOR por su posición: dentro
       del rectángulo de una sala del recorrido (y bajo el techo) usa la luz de
       techo; fuera, el sol.  Así una misma caja de pared tiene cara exterior al
       sol y cara interior con luz de techo, sin materiales separados.
     · Lámparas puntuales en bandas que pone la zona activa: paneles de techo
       (encendidos siempre, más fuertes de noche) y focos de la marquesina
       (solo al atardecer y de noche).
     · Las ilustraciones sin relighting (carteles, pantallas, fondo, nubes) se
       tiñen con el ambiente; los decales de «luz pintada» siguen al sol.

   Una sola instancia (`luz`) compartida por todo el aeropuerto: al cambiarla,
   todo cambia a la vez. */

/* Ambientes.  dir = de la superficie hacia la fuente (mundo).  La cámara de la
   fachada mira hacia -z: -x es la izquierda del espectador, +z queda detrás.
   Colores en hex sRGB; se convierten a lineal al aplicarlos. */
export const AMBIENTES = {
  manana: {
    nombre: 'Mañana (sol cálido)',
    sol: { dir: [-0.75, 0.50, 0.45], color: '#fff1d2', intensidad: 1.0, cielo: '#ffffff', suelo: '#f4ecd8', sombra: '#c3bfe0', fuerza: 0.85, umbral: 0.12, suave: 0.03 },
    techo: { dir: [-0.30, 0.90, 0.35], color: '#fffaf0', intensidad: 1.0, cielo: '#ffffff', suelo: '#f3eee4', sombra: '#cfd0e8', fuerza: 0.6, umbral: 0.10, suave: 0.05 },
    sombraSol: 0.85, decales: 1.0, lampInterior: 0.16, lampExterior: 0, tinta: 1,
    cielo: ['#4aa3e3', '#8cc6ec', '#f6e7cc'], nubes: '#fffaf2',
    tintes: { fondo: '#fff4e6', vegetacion: '#fff8ec', cartel: '#ffffff', vidrio: '#ffffff', nubes: '#fffaf2' }, brilloNoche: 0,
  },
  mediodia: {
    nombre: 'Mediodía (luz neutra)',
    sol: { dir: [-0.45, 0.85, 0.30], color: '#fffaf0', intensidad: 1.02, cielo: '#ffffff', suelo: '#f0eee6', sombra: '#cbcfe6', fuerza: 0.65, umbral: 0.10, suave: 0.05 },
    techo: { dir: [-0.30, 0.90, 0.35], color: '#fffcf5', intensidad: 1.0, cielo: '#ffffff', suelo: '#f1efe8', sombra: '#d2d3e8', fuerza: 0.55, umbral: 0.10, suave: 0.05 },
    sombraSol: 0.7, decales: 0.7, lampInterior: 0.12, lampExterior: 0, tinta: 1,
    cielo: ['#3998de', '#7bbdeb', '#e0eff4'], nubes: '#ffffff',
    tintes: { fondo: '#ffffff', vegetacion: '#ffffff', cartel: '#ffffff', vidrio: '#ffffff', nubes: '#ffffff' }, brilloNoche: 0,
  },
  tarde: {
    nombre: 'Tarde (naranja rasante)',
    sol: { dir: [-0.90, 0.26, 0.35], color: '#ffc584', intensidad: 1.05, cielo: '#e9d7d9', suelo: '#f0cfa8', sombra: '#9c8ec4', fuerza: 1.0, umbral: 0.10, suave: 0.02 },
    techo: { dir: [-0.30, 0.90, 0.35], color: '#fff0dc', intensidad: 1.0, cielo: '#fff6ee', suelo: '#f2e2cc', sombra: '#c2b8dc', fuerza: 0.7, umbral: 0.10, suave: 0.05 },
    sombraSol: 1.0, decales: 1.15, lampInterior: 0.3, lampExterior: 0.35, tinta: 0.92,
    cielo: ['#5d7cc0', '#e3a08c', '#ffd49a'], nubes: '#ffe0c4',
    tintes: { fondo: '#ffd6b2', vegetacion: '#ffe0c0', cartel: '#fff0e2', vidrio: '#ffdcbc', nubes: '#ffd9bd' }, brilloNoche: 0.25,
  },
  nublado: {
    nombre: 'Nublado (luz difusa)',
    sol: { dir: [-0.35, 0.90, 0.25], color: '#e9eef4', intensidad: 0.98, cielo: '#ffffff', suelo: '#e3e6ea', sombra: '#d6dae8', fuerza: 0.4, umbral: 0.0, suave: 0.35 },
    techo: { dir: [-0.30, 0.90, 0.35], color: '#f6f8fb', intensidad: 1.0, cielo: '#ffffff', suelo: '#eceef0', sombra: '#d8dbea', fuerza: 0.5, umbral: 0.05, suave: 0.2 },
    sombraSol: 0.18, decales: 0.15, lampInterior: 0.28, lampExterior: 0, tinta: 0.96,
    cielo: ['#8ea4b6', '#b5c5d1', '#dde4e8'], nubes: '#eef2f5',
    tintes: { fondo: '#dfe5ea', vegetacion: '#e6ebee', cartel: '#f4f6f8', vidrio: '#e6ebf0', nubes: '#e9eef2' }, brilloNoche: 0.1,
  },
  noche: {
    nombre: 'Noche (lámparas)',
    sol: { dir: [-0.60, 0.55, 0.40], color: '#8fa3e0', intensidad: 0.62, cielo: '#b8c4ee', suelo: '#9aa0c8', sombra: '#6a70a8', fuerza: 1.0, umbral: 0.15, suave: 0.03 },
    techo: { dir: [-0.30, 0.90, 0.35], color: '#ffe6c2', intensidad: 0.84, cielo: '#fff4e4', suelo: '#e8d9c4', sombra: '#a9a3cf', fuerza: 0.75, umbral: 0.10, suave: 0.05 },
    sombraSol: 0.3, decales: 0.0, lampInterior: 1.0, lampExterior: 1.0, tinta: 0.72,
    cielo: ['#0e1a3a', '#1f3264', '#40508a'], nubes: '#5d6c9c', estrellas: true,
    tintes: { fondo: '#5b679e', vegetacion: '#7584bb', cartel: '#e8e6f2', vidrio: '#7c8bc4', nubes: '#6474a6' }, brilloNoche: 1.0,
  },
};

export const N_LAMPARAS = 16;
const N_SALAS = 8;
// Jerarquía del trazo (multiplica el grosor base en píxeles): personajes >
// mobiliario cercano > arquitectura.  Suelo y paredes grandes no llevan trazo.
export const NIVELES_CONTORNO = { fuerte: 1.5, medio: 1.0, fino: 0.55 };

function crearLuzEscena() {
  const c = () => new T.Color();
  const u = {
    uLuzDir: { value: new T.Vector3(-0.8, 0.5, 0.35).normalize() }, uLuzColor: { value: c() },
    uAmbCielo: { value: c() }, uAmbSuelo: { value: c() }, uSombraColor: { value: c() },
    uUmbral: { value: 0.12 }, uSuave: { value: 0.03 },
    uInDir: { value: new T.Vector3(0, 1, 0) }, uInColor: { value: c() },
    uInCielo: { value: c() }, uInSuelo: { value: c() }, uInSombra: { value: c() },
    uInUmbral: { value: 0.1 }, uInSuave: { value: 0.05 },
    uSalas: { value: Array.from({ length: N_SALAS }, () => new T.Vector4(1e9, 1e9, -1e9, -1e9)) },
    uLampPos: { value: Array.from({ length: N_LAMPARAS }, () => new T.Vector3()) },
    uLampColor: { value: Array.from({ length: N_LAMPARAS }, () => c()) },
    uLampRadio: { value: new Array(N_LAMPARAS).fill(1) },
    uPie: { value: 0.02 },
  };
  // Uniformes del contorno, compartidos por todos los materiales de trazo.
  const trazo = {
    uGrosor: { value: 1.4 }, uResolucion: { value: new T.Vector2(1280, 720) }, uTinta: { value: 1 },
  };
  const estado = { ambiente: 'manana', k: 1, giro: 0, elevacion: 0, contorno: true, grosor: 1.4, dpr: 1 };
  let base = AMBIENTES.manana;
  let lamparas = [], duenoLamparas = null;
  const decales = new Set(), tintes = new Set(), oyentes = new Set(), receptores = new Set(), contornos = new Set();

  const dirMundo = (A) => {
    const dir = new T.Vector3(...A.sol.dir);
    dir.applyAxisAngle(new T.Vector3(0, 1, 0), estado.giro);
    const horiz = Math.hypot(dir.x, dir.z) || 1;
    const el = T.MathUtils.clamp(Math.atan2(dir.y, horiz) + estado.elevacion, 0.02, 1.5);
    return new T.Vector3(dir.x / horiz * Math.cos(el), Math.sin(el), dir.z / horiz * Math.cos(el)).normalize();
  };
  const blanco = new T.Color(1, 1, 1);
  function aplicarLamparas() {
    const A = base;
    for (let i = 0; i < N_LAMPARAS; i++) {
      const l = lamparas[i];
      if (!l) { u.uLampColor.value[i].setRGB(0, 0, 0); u.uLampRadio.value[i] = 1; continue; }
      u.uLampPos.value[i].set(...l.pos);
      u.uLampColor.value[i].set(l.color).multiplyScalar(l.intensidad * (l.exterior ? A.lampExterior : A.lampInterior));
      u.uLampRadio.value[i] = l.radio;
    }
  }
  function aplicar() {
    const A = base, k = estado.k, S = A.sol, I = A.techo;
    u.uLuzDir.value.copy(dirMundo(A));
    u.uLuzColor.value.set(S.color).multiplyScalar(S.intensidad * k);
    u.uAmbCielo.value.set(S.cielo); u.uAmbSuelo.value.set(S.suelo);
    // sombra = tono frío atenuado hacia blanco según la fuerza (como en los personajes)
    u.uSombraColor.value.set(S.sombra).lerp(blanco, 1 - Math.min(S.fuerza, 1));
    u.uUmbral.value = S.umbral; u.uSuave.value = S.suave;
    u.uInDir.value.set(...I.dir).normalize();
    u.uInColor.value.set(I.color).multiplyScalar(I.intensidad);
    u.uInCielo.value.set(I.cielo); u.uInSuelo.value.set(I.suelo);
    u.uInSombra.value.set(I.sombra).lerp(blanco, 1 - Math.min(I.fuerza, 1));
    u.uInUmbral.value = I.umbral; u.uInSuave.value = I.suave;
    trazo.uTinta.value = A.tinta;
    aplicarLamparas();
    for (const d of decales) {
      const peso = d.tipo === 'noche' ? A.brilloNoche : A.decales * k;
      d.mesh.material.opacity = Math.min(1, d.opacidad * peso);
      if (d.tipo === 'sol') d.mesh.material.color.set(S.color);
      d.mesh.visible = d.mesh.material.opacity > 0.004;
    }
    for (const t of tintes) t.material.color.set(A.tintes[t.tipo] || '#ffffff');
    for (const r of receptores) {
      r.color.set(S.sombra).lerp(blanco, 0.12);
      r.opacity = r.userData.fuerza * A.sombraSol;
    }
    for (const fn of oyentes) fn(A, k, u);
  }
  function aplicarContorno() {
    trazo.uGrosor.value = estado.grosor * estado.dpr;
    for (const m of contornos) m.visible = estado.contorno;
  }
  aplicar();

  const quitar = (set, item) => () => set.delete(item);
  return {
    uniformes: u, trazo,
    get ambiente() { return estado.ambiente; },
    ambienteActual() { return base; },
    direccionSol() { return u.uLuzDir.value.clone(); },
    /** Cambia de ambiente (clave de AMBIENTES) conservando giro/elevación/intensidad manuales. */
    usarAmbiente(clave) { if (!AMBIENTES[clave]) return; estado.ambiente = clave; base = AMBIENTES[clave]; aplicar(); },
    /** Multiplicador de intensidad (0..2), giro del sol (rad, eje Y) y elevación extra (rad). */
    ajustar({ intensidad, giro, elevacion } = {}) {
      if (intensidad !== undefined) estado.k = intensidad;
      if (giro !== undefined) estado.giro = giro;
      if (elevacion !== undefined) estado.elevacion = elevacion;
      aplicar();
    },
    estado() { return { ...estado }; },
    /** Rectángulos [x0, z0, x1, z1] (mundo) de las salas cubiertas: ahí manda la luz de techo. */
    salas(rects) {
      for (let i = 0; i < N_SALAS; i++) {
        const r = rects[i];
        if (r) u.uSalas.value[i].set(r[0], r[1], r[2], r[3]); else u.uSalas.value[i].set(1e9, 1e9, -1e9, -1e9);
      }
    },
    /** Lámparas de la zona activa: [{ pos, color, intensidad, radio, exterior }]. */
    ponerLamparas(lista, dueno) { lamparas = lista.slice(0, N_LAMPARAS); duenoLamparas = dueno; aplicarLamparas(); },
    soltarLamparas(dueno) { if (duenoLamparas === dueno) { lamparas = []; duenoLamparas = null; aplicarLamparas(); } },
    /** Plano de «luz pintada».  tipo 'sol' se tiñe y apaga con el sol; 'noche' se enciende de noche. */
    registrarDecal(mesh, opacidad = mesh.material.opacity, tipo = 'sol') {
      const d = { mesh, opacidad, tipo }; decales.add(d); aplicar(); return quitar(decales, d);
    },
    /** Ilustración sin relighting (MeshBasicMaterial): se multiplica por el tinte del ambiente. */
    tintar(material, tipo) { const t = { material, tipo }; tintes.add(t); material.color.set(base.tintes[tipo] || '#ffffff'); return quitar(tintes, t); },
    /** Engancha un callback (ambiente, k, uniformes); devuelve la función para soltarlo. */
    alCambiar(fn) { oyentes.add(fn); fn(base, estado.k, u); return quitar(oyentes, fn); },
    registrarReceptor(material) { receptores.add(material); aplicar(); return quitar(receptores, material); },
    registrarContorno(material) { contornos.add(material); material.visible = estado.contorno; return quitar(contornos, material); },
    /** Tamaño del lienzo en píxeles CSS y DPR: el trazo mide lo mismo en pantalla a cualquier distancia. */
    viewport(ancho, alto, dpr = 1) { trazo.uResolucion.value.set(ancho * dpr, alto * dpr); estado.dpr = dpr; aplicarContorno(); },
    contorno({ activo, grosor } = {}) {
      if (activo !== undefined) estado.contorno = activo;
      if (grosor !== undefined) estado.grosor = grosor;
      aplicarContorno();
    },
  };
}

/** La luz compartida de todo el aeropuerto. */
export const luz = crearLuzEscena();

/* ── Mapas ─────────────────────────────────────────────────────────────── */

function aCanvas(fuente) {
  if (fuente instanceof HTMLCanvasElement) return fuente;
  const c = document.createElement('canvas');
  c.width = fuente.naturalWidth || fuente.width; c.height = fuente.naturalHeight || fuente.height;
  c.getContext('2d').drawImage(fuente, 0, 0);
  return c;
}

/** Normal map (tangent space, +Y arriba) desde la luminancia: lo oscuro es hondo
 *  (juntas, grietas), lo claro sobresale.  `suavizado` en px desenfoca la altura. */
export function normalDesdeAltura(fuente, { fuerza = 2, suavizado = 0, invertir = false, repetir = false } = {}) {
  const src = aCanvas(fuente), w = src.width, h = src.height;
  let lectura = src;
  if (suavizado > 0) {
    lectura = document.createElement('canvas'); lectura.width = w; lectura.height = h;
    const g = lectura.getContext('2d'); g.filter = `blur(${suavizado}px)`; g.drawImage(src, 0, 0);
  }
  const px = lectura.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const alt = new Float32Array(w * h);
  for (let i = 0; i < alt.length; i++) {
    const a = px[i * 4 + 3] / 255;
    alt[i] = ((0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255) * a * (invertir ? -1 : 1);
  }
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const og = out.getContext('2d'), img = og.createImageData(w, h);
  const at = (x, y) => alt[((y + h) % h) * w + ((x + w) % w)];   // envuelve: el mosaico no deja costura
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * fuerza * 0.25, ny = dy * fuerza * 0.25, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const o = (y * w + x) * 4;
    img.data[o] = (nx * 0.5 + 0.5) * 255; img.data[o + 1] = (ny * 0.5 + 0.5) * 255;
    img.data[o + 2] = (nz * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const t = new T.CanvasTexture(out);
  t.colorSpace = T.NoColorSpace;          // datos, no color
  t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter; t.anisotropy = 4;
  if (repetir) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}

/** Relieve de baldosa: un solo módulo con junta oscura, para repetir por metro. */
export function normalBaldosa({ lado = 64, junta = 2, fuerza = 2.2 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = lado;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, lado, lado);
  g.fillStyle = '#000000'; g.fillRect(0, 0, lado, junta); g.fillRect(0, 0, junta, lado);
  return normalDesdeAltura(c, { fuerza, suavizado: 0.7, repetir: true });
}

/* ── Material toon relighteable ────────────────────────────────────────── */

const VERT = /* glsl */`
uniform vec2 uRepetir; uniform vec2 uRepNormal;
varying vec2 vUv; varying vec2 vUvN; varying vec3 vPos; varying vec3 vNor;
void main() {
  vUv = uv * uRepetir; vUvN = uv * uRepNormal;
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 w = modelMatrix * p;
  vPos = w.xyz;
  vNor = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */`
#define N_LAMP ${N_LAMPARAS}
#define N_SALA ${N_SALAS}
#ifdef USE_ALBEDO
uniform sampler2D uAlbedo;
#endif
#ifdef USE_NMAP
uniform sampler2D uNormal; uniform float uNormalFuerza;
#endif
uniform vec3 uColor; uniform float uOpacidad; uniform float uCorte; uniform float uPropia; uniform float uPie;
uniform vec3 uLuzDir; uniform vec3 uLuzColor; uniform vec3 uAmbCielo; uniform vec3 uAmbSuelo; uniform vec3 uSombraColor;
uniform float uUmbral; uniform float uSuave;
uniform vec3 uInDir; uniform vec3 uInColor; uniform vec3 uInCielo; uniform vec3 uInSuelo; uniform vec3 uInSombra;
uniform float uInUmbral; uniform float uInSuave;
uniform vec4 uSalas[N_SALA];
uniform vec3 uLampPos[N_LAMP]; uniform vec3 uLampColor[N_LAMP]; uniform float uLampRadio[N_LAMP];
varying vec2 vUv; varying vec2 vUvN; varying vec3 vPos; varying vec3 vNor;

float corte(float x, float umbral, float borde) { return smoothstep(umbral - borde, umbral + borde, x); }
// posteriza 0..1 en n escalones con borde antialiasado: un degradado pintado con pocos tonos
float bandas(float x, float n) {
  float q = clamp(x, 0.0, 1.0) * n, f = floor(q);
  float w = fwidth(q) + 0.03;
  return min(1.0, (f + smoothstep(0.5 - w, 0.5 + w, fract(q))) / n);
}
// 1 dentro de una sala cubierta (bajo el techo), 0 al aire libre
float interior(vec3 p) {
  float s = 0.0;
  if (p.y < ${(DIMENSIONS.ceiling + .1).toFixed(2)}) for (int i = 0; i < N_SALA; i++) {
    vec4 r = uSalas[i];
    if (p.x > r.x && p.x < r.z && p.z > r.y && p.z < r.w) s = 1.0;
  }
  return s;
}

void main() {
  vec4 tex = vec4(1.0);
  #ifdef USE_ALBEDO
    tex = texture2D(uAlbedo, vUv);
  #endif
  float a = tex.a * uOpacidad;
  if (a < uCorte) discard;
  vec3 albedo = tex.rgb * uColor;
  #ifdef REPARA_GRIS
    // El atlas de la palmera trae parches grises dentro de las hojas verdes.
    float claro = max(albedo.r, max(albedo.g, albedo.b)), oscuro = min(albedo.r, min(albedo.g, albedo.b));
    float gris = 1.0 - smoothstep(0.035, 0.14, claro - oscuro);
    float valor = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
    albedo = mix(albedo, vec3(valor * 0.48, valor * 1.15, valor * 0.37), gris * 0.97);
  #endif
  // Curva de pie: levanta los negros sin desaturar los colores vivos.
  albedo += uPie * (1.0 - albedo) * exp(-dot(albedo, vec3(0.2126, 0.7152, 0.0722)) * 40.0);

  vec3 N = normalize(vNor);
  if (!gl_FrontFacing) N = -N;
  vec3 Nrel = N;
  #ifdef USE_NMAP
    // Base tangente por derivadas de pantalla: sirve con cualquier geometría y con planos girados
    vec3 dp1 = dFdx(vPos), dp2 = dFdy(vPos);
    vec2 du1 = dFdx(vUvN), du2 = dFdy(vUvN);
    vec3 p2 = cross(dp2, N), p1 = cross(N, dp1);
    vec3 Tg = p2 * du1.x + p1 * du2.x;
    vec3 Bt = p2 * du1.y + p1 * du2.y;
    float inv = inversesqrt(max(max(dot(Tg, Tg), dot(Bt, Bt)), 1e-12));
    vec3 m = texture2D(uNormal, vUvN).xyz * 2.0 - 1.0;
    m.xy *= uNormalFuerza;
    Nrel = normalize(mat3(Tg * inv, Bt * inv, N) * m);
  #endif

  float dentro = interior(vPos);
  vec3 L = normalize(mix(uLuzDir, uInDir, dentro));
  vec3 luzColor = mix(uLuzColor, uInColor, dentro);
  vec3 cielo = mix(uAmbCielo, uInCielo, dentro), suelo = mix(uAmbSuelo, uInSuelo, dentro);
  vec3 sombra = mix(uSombraColor, uInSombra, dentro);
  float umbral = mix(uUmbral, uInUmbral, dentro), suave = mix(uSuave, uInSuave, dentro);

  float nl = dot(Nrel, L) + uPropia;
  float borde = fwidth(nl) * 1.5 + 0.02 + suave;
  #ifdef TRES_BANDAS
    // Volúmenes: sombra / medio / luz, tres bandas duras
    float lit = corte(nl, umbral - 0.25, borde) * mix(0.5, 1.0, corte(nl, umbral + 0.3, borde));
  #else
    float lit = corte(nl, umbral, borde);
  #endif
  vec3 hemi = mix(suelo, cielo, N.y * 0.5 + 0.5);
  vec3 color = albedo * mix(sombra * hemi, luzColor, lit);

  // Lámparas: mismo corte duro, radio cuantizado; la caída vertical se aplana
  // para que un foco de techo pinte un charco de luz en el suelo.  Las paredes
  // reciben poco: el charco se lee en el suelo, no como un lavado de pared.
  float charco = mix(0.35, 1.0, clamp(N.y, 0.0, 1.0));
  for (int i = 0; i < N_LAMP; i++) {
    vec3 d = uLampPos[i] - vPos;
    float f = bandas(1.0 - smoothstep(0.0, uLampRadio[i], length(vec3(d.x, d.y * 0.3, d.z))), 3.0);
    float nlp = dot(Nrel, normalize(d));
    color += albedo * uLampColor[i] * corte(nlp, 0.05, fwidth(nlp) * 1.5 + 0.03) * f * charco;
  }
  gl_FragColor = vec4(color, a);
  #include <colorspace_fragment>
}`;

/** Material toon relighteable.  Todos comparten la `luz` y cambian juntos.
 *  `bandas: 3` para volúmenes (cajas, cilindros), 2 para planos con relieve. */
export function crearMaterialToon({
  color = '#ffffff', albedo = null, normal = null, fuerzaNormal = 1, repetir = [1, 1], repetirNormal = null,
  opacidad = 1, corteAlfa = 0, transparente = false, doble = false, bandas = 2, luzPropia = 0, reparaGris = false,
} = {}) {
  const defines = {};
  if (albedo) { defines.USE_ALBEDO = ''; albedo.colorSpace = T.SRGBColorSpace; }
  if (normal) defines.USE_NMAP = '';
  if (bandas === 3) defines.TRES_BANDAS = '';
  if (reparaGris) defines.REPARA_GRIS = '';
  const m = new T.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, defines,
    uniforms: {
      uAlbedo: { value: albedo }, uNormal: { value: normal }, uNormalFuerza: { value: fuerzaNormal },
      uColor: { value: new T.Color(color) }, uOpacidad: { value: opacidad }, uCorte: { value: corteAlfa },
      uPropia: { value: luzPropia },
      uRepetir: { value: new T.Vector2(...repetir) }, uRepNormal: { value: new T.Vector2(...(repetirNormal || repetir)) },
      ...luz.uniformes,     // MISMOS objetos: mover un valor mueve todos los materiales
    },
    transparent: transparente, side: doble ? T.DoubleSide : T.FrontSide,
  });
  m.name = 'toon-relightable';
  m.userData.colorBase = new T.Color(color);
  return m;
}

/** Profundidad para sombras recortadas por alfa (follaje): úsese como `mesh.customDepthMaterial`. */
export function profundidadRecortada(albedo, corte = 0.5) {
  return new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, map: albedo, alphaTest: corte });
}

/** Receptor transparente de la sombra del sol: MULTIPLICA el suelo pintado por el
 *  tono frío del ambiente (capa «Multiplicar»), nunca lo lleva hacia el negro. */
export function crearReceptorSombra(fuerza = 1) {
  const m = new T.ShadowMaterial({ color: 0x9c8ec4, opacity: 0.5, depthWrite: false, transparent: true, blending: T.MultiplyBlending, premultipliedAlpha: true });
  m.onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader.replace(
      'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
      'gl_FragColor = vec4( mix( vec3( 1.0 ), color, opacity * ( 1.0 - getShadowMask() ) ), 1.0 );');
  };
  m.userData.fuerza = fuerza;
  m.userData.soltar = luz.registrarReceptor(m);
  const dispose = m.dispose.bind(m);
  m.dispose = () => { m.userData.soltar(); dispose(); };
  return m;
}

/* ── Contorno grueso cartoon: casco invertido ─────────────────────────── */

/** Añade `outlineNormal`: la dirección media de las caras que comparten cada vértice.
 *  Empujar por ella (y no por la normal de cara) evita que el trazo se abra en las esquinas. */
export function conNormalContorno(geometria) {
  if (geometria.getAttribute('outlineNormal')) return geometria;
  const pos = geometria.getAttribute('position'), nor = geometria.getAttribute('normal');
  const suma = new Map(), clave = i => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = clave(i), v = suma.get(k) || [0, 0, 0];
    v[0] += nor.getX(i); v[1] += nor.getY(i); v[2] += nor.getZ(i); suma.set(k, v);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = suma.get(clave(i)), l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  geometria.setAttribute('outlineNormal', new T.BufferAttribute(out, 3));
  return geometria;
}

const CONTORNO_VERT = /* glsl */`
attribute vec3 outlineNormal;
#ifdef USE_INSTANCING
attribute float aNivel;
#endif
uniform float uGrosor; uniform float uNivel; uniform vec2 uResolucion;
void main() {
  mat4 m = modelMatrix;
  float nivel = uNivel;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
    nivel *= aNivel;
  #endif
  vec4 clip = projectionMatrix * viewMatrix * (m * vec4(position, 1.0));
  // Solo la rotación de la instancia (sin su escala): la esquina de una caja
  // aplanada sigue empujando en diagonal y el trazo no adelgaza.
  mat3 r = mat3(normalize(m[0].xyz), normalize(m[1].xyz), normalize(m[2].xyz));
  // Se engorda en espacio de clip: grosor constante en píxeles a cualquier distancia.
  vec2 off = (projectionMatrix * viewMatrix * vec4(r * outlineNormal, 0.0)).xy;
  float l = length(off);
  if (l > 1e-6) clip.xy += off / l * uGrosor * nivel * 2.0 / uResolucion * clip.w;
  gl_Position = clip;
}`;
const CONTORNO_FRAG = /* glsl */`
uniform vec3 uTintaColor; uniform float uTinta;
void main() {
  gl_FragColor = vec4(uTintaColor * uTinta, 1.0);
  #include <colorspace_fragment>
}`;

/** Color del trazo derivado del relleno: mucho más oscuro (×0,55 en sRGB), nunca negro. */
export function colorTrazo(relleno) {
  const s = new T.Color(relleno).getRGB({ r: 0, g: 0, b: 0 }, T.SRGBColorSpace);
  return new T.Color().setRGB(s.r * 0.55, s.g * 0.55, s.b * 0.55, T.SRGBColorSpace);
}

export function crearMaterialContorno(relleno, nivel = 'medio') {
  const m = new T.ShaderMaterial({
    vertexShader: CONTORNO_VERT, fragmentShader: CONTORNO_FRAG, side: T.BackSide,
    uniforms: {
      uTintaColor: { value: colorTrazo(relleno) }, uNivel: { value: NIVELES_CONTORNO[nivel] ?? 1 },
      uGrosor: luz.trazo.uGrosor, uResolucion: luz.trazo.uResolucion, uTinta: luz.trazo.uTinta,
    },
  });
  m.name = 'contorno';
  m.userData.soltar = luz.registrarContorno(m);
  const dispose = m.dispose.bind(m);
  m.dispose = () => { m.userData.soltar(); dispose(); };
  return m;
}

/** Casco invertido para una malla suelta (hija: hereda su transformación). */
export function contornoDe(mesh, material) {
  conNormalContorno(mesh.geometry);
  const casco = new T.Mesh(mesh.geometry, material);
  casco.name = `${mesh.name || 'pieza'}_contorno`;
  casco.raycast = () => {};          // el trazo no se selecciona ni se pulsa
  mesh.add(casco);
  return casco;
}
