import * as T from './three.js';
import { crearMaterialToon, crearMaterialContornoInstancias, conNormalContorno, colorTrazo, NIVELES_CONTORNO } from './Luz25D.js';
import { azar } from './Kit.js';

/* ── Productos ────────────────────────────────────────────────────────────
   Todo lo que se vende sale de UN atlas de empaques dibujado por código
   (9 × 9 celdas de 256 px).  Cada instancia elige su celda (`aCelda`), así
   que las ~3000 piezas de los anaqueles son cinco InstancedMesh (caja,
   bolsa, botella, frasco, blíster) más su trazo, que toma el color de
   cada empaque.  Los nombres son genéricos: no hay marcas reales.

   Convención de la celda (UV 0..1, v hacia arriba):
     · franja izquierda 0..0.025 = color de fondo (lo usan los cantos)
     · cajas y bolsas: el diseño es la cara frontal (±z del objeto)
     · botellas y frascos: el diseño envuelve el costado (u = vuelta)  */

const N = 9, PX = 256;

// Catálogo: cada entrada pinta una celda.  `tipo` decide el dibujo.
const MEDICINAS = [
  ['Paracetamol', '500 mg', '#e8412f'], ['Ibuprofeno', '400 mg', '#f08a24'], ['Naproxeno', '250 mg', '#2a6fc1'],
  ['Amoxicilina', '500 mg', '#1d9a6c'], ['Loratadina', '10 mg', '#7b4bb5'], ['Omeprazol', '20 mg', '#d63a7a'],
  ['Metformina', '850 mg', '#1b8fb3'], ['Losartán', '50 mg', '#c9a21d'], ['Ambroxol', 'jarabe', '#3aa04a'],
  ['Diclofenaco', '100 mg', '#e2572c'], ['Ciprofloxacino', '500 mg', '#3d5fb0'], ['Ác. acetilsalicílico', '500 mg', '#c8322a'],
  ['Butilhioscina', '10 mg', '#1f7f8f'], ['Cetirizina', '10 mg', '#8a5bc2'], ['Complejo B', 'tabletas', '#e33d62'],
  ['Clonixinato', '125 mg', '#2e8f57'], ['Dexametasona', '8 mg', '#5a6d82'], ['Captopril', '25 mg', '#b8561e'],
  ['Salbutamol', 'inhalador', '#2b7dc9'], ['Metronidazol', '500 mg', '#6f8f2a'], ['Ketorolaco', '10 mg', '#cf4c2a'],
  ['Picosulfato', 'gotas', '#6a4fa3'], ['Vitamina C', '1 g', '#f2a51e'], ['Antigripal', 'día y noche', '#1f5fa8'],
];
const BOTANAS = [
  ['PAPAS', 'sal de mar', '#f6c21c', '#d8342c'], ['PAPAS', 'limón', '#39a34a', '#f6e04a'], ['TOTOPOS', 'chile', '#e5412f', '#f7b43a'],
  ['CHURRITOS', 'enchilados', '#f07a1f', '#7a2c14'], ['CACAHUATES', 'japoneses', '#7a3f1c', '#f2c35a'], ['CHICHARRÓN', 'de harina', '#f2d23a', '#e0542a'],
  ['PALOMITAS', 'mantequilla', '#2f63c1', '#f7e45a'], ['FRITURAS', 'queso', '#f39a1c', '#2c6fc1'], ['AROS', 'picantes', '#8c2ac1', '#f5c33a'],
  ['PEPITAS', 'tostadas', '#3d8f4a', '#e8dca0'],
];
const DULCES = [
  ['GALLETAS', 'marías', '#f2d27a', '#c1462c'], ['GALLETAS', 'chocolate', '#5a3320', '#f2c35a'], ['OBLEAS', 'fresa', '#f08aa8', '#fff4f0'],
  ['BARRAS', 'avena', '#c69a52', '#2e7f3f'], ['CHICLES', 'menta', '#2fb3a0', '#ffffff'], ['GOMITAS', 'frutas', '#e2385e', '#fbd23c'],
];
const BEBIDAS = [
  ['AGUA', '1 L', 'agua'], ['SUERO', 'fresa', '#e8415a'], ['SUERO', 'coco', '#f4f0e4'], ['SUERO', 'uva', '#7a3fb0'],
  ['ISOTÓNICA', 'mora azul', '#2a7fd6'], ['REFRESCO', 'cola', '#3a1a12'], ['NARANJADA', '600 ml', '#f38a1c'], ['JUGO', 'mango', '#f6b21e'],
];
const HIGIENE = [
  ['SHAMPOO', 'manzanilla', '#f4d24a'], ['CREMA', 'corporal', '#f6f1e6'], ['JABÓN', 'líquido', '#58b7e0'],
  ['ALCOHOL', '70 %', '#ffffff'], ['AGUA OXIG.', '10 vol', '#6a3b1c'],
];
const FRASCOS = [
  ['VITAMINA C', '60 tab', '#f29a1c'], ['MULTIVIT.', '30 cáps', '#d2334a'], ['OMEGA 3', '60 cáps', '#1f6fb3'],
  ['CALCIO', '+ vit D', '#3a9a6a'], ['JARABE', 'para la tos', 'ambar'], ['JARABE', 'infantil', 'ambar2'],
];
const PAQUETES = [
  ['PAÑALES', 'etapa 3', '#5fb2e6', '#ffffff'], ['PAÑALES', 'etapa 5', '#f28ab0', '#ffffff'], ['PAPEL', 'higiénico 4', '#f7f4ee', '#2f7fc1'],
  ['TOALLAS', 'femeninas', '#c8468f', '#ffffff'], ['ALGODÓN', '100 g', '#f7f7ff', '#2f6fb7'], ['GASAS', 'estériles', '#e9f3ff', '#1f8a5b'],
];
const OTROS = [
  ['cepillo', '#2f7fd6'], ['pasta', '#e8412f'], ['curitas', '#e0a36a'], ['condón', '#3a2a6a'], ['rastrillo', '#1f5fa8'],
  ['perfume', '#d9b56a'], ['termómetro', '#ffffff'], ['cubrebocas', '#8fc6f0'],
];

function fondoCelda(c, x, y, base, canto = base) {
  c.fillStyle = base; c.fillRect(x, y, PX, PX);
  c.fillStyle = canto; c.fillRect(x, y, PX * .03, PX);
}
function texto(c, t, x, y, px, color, peso = 800, max = PX * .9) {
  c.font = `${peso} ${px}px "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif`;
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(t, x, y, max);
}
const oscurecer = (h, k) => `#${new T.Color(h).multiplyScalar(k).getHexString()}`;

// Caja de medicina: fondo blanco, franja de color, nombre genérico y dosis.
function dibujarMedicina(c, x, y, [nombre, dosis, color], r) {
  fondoCelda(c, x, y, '#fbfbf8', color);
  const estilo = Math.floor(r() * 3);
  c.fillStyle = color;
  if (estilo === 0) { c.fillRect(x, y + PX * .62, PX, PX * .2); c.fillRect(x, y + PX * .86, PX, PX * .05); }
  else if (estilo === 1) { c.beginPath(); c.moveTo(x, y + PX); c.lineTo(x + PX, y + PX * .55); c.lineTo(x + PX, y + PX); c.fill(); }
  else { c.fillRect(x, y, PX, PX * .22); c.fillStyle = oscurecer(color, .8); c.fillRect(x, y + PX * .22, PX, PX * .04); }
  texto(c, nombre, x + PX / 2, y + PX * .4, nombre.length > 12 ? 28 : 36, '#23303a');
  texto(c, dosis, x + PX / 2, y + PX * .53, 26, color, 700);
  if (r() > .45) { // sello de genérico: GI en un óvalo
    c.fillStyle = '#1f8a5b'; c.beginPath(); c.ellipse(x + PX * .82, y + PX * .14, 26, 18, 0, 0, Math.PI * 2); c.fill();
    texto(c, 'GI', x + PX * .82, y + PX * .145, 22, '#ffffff', 900);
  }
  c.fillStyle = 'rgba(35,48,58,.35)';
  for (let i = 0; i < 3; i++) c.fillRect(x + PX * .2, y + PX * (.7 + i * .06), PX * (.6 - i * .12), 4);
}
// Bolsa de botana: color vivo, remate dentado arriba y abajo, «ventana» con la botana.
function dibujarBolsa(c, x, y, [marca, sabor, color, acento], r) {
  fondoCelda(c, x, y, color);
  c.fillStyle = oscurecer(color, .78);
  for (const yy of [y, y + PX * .9]) {
    c.fillRect(x, yy, PX, PX * .1);
    c.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 12; i++) c.fillRect(x + i * PX / 12, yy + PX * .02, 3, PX * .06);
    c.fillStyle = oscurecer(color, .78);
  }
  c.fillStyle = acento; c.beginPath(); c.ellipse(x + PX / 2, y + PX * .32, PX * .42, PX * .16, -.12, 0, Math.PI * 2); c.fill();
  texto(c, marca, x + PX / 2, y + PX * .32, marca.length > 8 ? 34 : 44, '#ffffff', 900);
  // la botana: óvalos dorados/rojizos
  const tonos = marca === 'CACAHUATES' ? ['#c98a4a', '#a8662e'] : marca === 'PALOMITAS' ? ['#fff6d8', '#f4dc8a'] : ['#f3c24a', '#e39a2c', '#f7d66a'];
  for (let i = 0; i < 9; i++) {
    c.fillStyle = tonos[i % tonos.length];
    c.beginPath(); c.ellipse(x + PX * (.28 + r() * .44), y + PX * (.6 + r() * .18), 22 + r() * 10, 14 + r() * 6, r() * 3, 0, Math.PI * 2); c.fill();
  }
  texto(c, sabor, x + PX / 2, y + PX * .5, 26, '#ffffff', 800);
}
// Caja de galletas/dulces: franja clara central con el nombre.
function dibujarDulce(c, x, y, [marca, sabor, color, acento]) {
  fondoCelda(c, x, y, color);
  c.fillStyle = acento; c.fillRect(x, y + PX * .3, PX, PX * .3);
  texto(c, marca, x + PX / 2, y + PX * .4, 40, color === '#5a3320' ? '#5a3320' : oscurecer(color, .55), 900);
  texto(c, sabor, x + PX / 2, y + PX * .52, 26, oscurecer(color, .5), 700);
  c.fillStyle = 'rgba(255,255,255,.55)';
  for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + PX * (.2 + i * .2), y + PX * .78, 18, 0, Math.PI * 2); c.fill(); }
}
// Botella (costado envolvente, v hacia arriba en el canvas = arriba de la botella).
function dibujarBotella(c, x, y, [nombre, sabor, color], tapa = '#2f7fd6') {
  const agua = color === 'agua';
  const liquido = agua ? '#cfe9f7' : color;
  fondoCelda(c, x, y, liquido);
  c.fillStyle = tapa; c.fillRect(x, y, PX, PX * .12);                         // tapa (arriba)
  c.fillStyle = agua ? '#e6f4fb' : oscurecer(liquido, .92); c.fillRect(x, y + PX * .12, PX, PX * .2);   // cuello
  c.fillStyle = '#ffffff'; c.fillRect(x, y + PX * .4, PX, PX * .3);           // etiqueta
  c.fillStyle = agua ? '#2f8fd6' : liquido; c.fillRect(x, y + PX * .4, PX, PX * .05); c.fillRect(x, y + PX * .65, PX, PX * .05);
  for (const cx of [.25, .75]) {
    texto(c, nombre, x + PX * cx, y + PX * .51, 30, agua ? '#1f6fb3' : oscurecer(liquido === '#f4f0e4' ? '#9c8a5a' : liquido, .8), 900, PX * .46);
    texto(c, sabor, x + PX * cx, y + PX * .6, 20, '#4b5560', 700, PX * .46);
  }
}
function dibujarHigiene(c, x, y, [nombre, sub, color]) {
  const tapas = { SHAMPOO: '#2f8f4a', CREMA: '#2f6fb7', 'JABÓN': '#ffffff', ALCOHOL: '#2f6fb7', 'AGUA OXIG.': '#f2f2f2' };
  dibujarBotella(c, x, y, [nombre, sub, color], tapas[nombre] || '#ffffff');
}
function dibujarFrasco(c, x, y, [nombre, sub, color]) {
  const ambar = color.startsWith('ambar');
  const cuerpo = ambar ? '#8a4a16' : '#fbfbf8';
  fondoCelda(c, x, y, cuerpo);
  c.fillStyle = ambar ? '#f4f4f0' : color; c.fillRect(x, y, PX, PX * .2);    // tapa
  c.fillStyle = ambar ? '#fff8ea' : color; c.fillRect(x, y + PX * .32, PX, PX * .42);
  c.fillStyle = ambar ? (color === 'ambar' ? '#d2352c' : '#2f8fd6') : '#ffffff'; c.fillRect(x, y + PX * .36, PX, PX * .12);
  for (const cx of [.25, .75]) {
    texto(c, nombre, x + PX * cx, y + PX * .42, 26, ambar ? '#ffffff' : color, 900, PX * .46);
    texto(c, sub, x + PX * cx, y + PX * .6, 22, ambar ? '#6a3a12' : '#ffffff', 800, PX * .46);
  }
}
function dibujarPaquete(c, x, y, [nombre, sub, color, acento], r) {
  fondoCelda(c, x, y, color);
  c.fillStyle = acento; c.beginPath(); c.roundRect(x + PX * .12, y + PX * .14, PX * .76, PX * .3, 26); c.fill();
  texto(c, nombre, x + PX / 2, y + PX * .29, 40, color === '#f7f4ee' || color === '#f7f7ff' || color === '#e9f3ff' ? '#ffffff' : color, 900);
  texto(c, sub, x + PX / 2, y + PX * .56, 28, oscurecer(acento === '#ffffff' ? color : acento, .6), 800);
  if (nombre === 'PAÑALES') { // un bebé esquemático
    c.fillStyle = '#f7d2b0'; c.beginPath(); c.arc(x + PX * .5, y + PX * .78, 30, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x + PX * .5, y + PX * .95, 40, 20, 0, 0, Math.PI * 2); c.fill();
  } else {
    c.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 3; i++) c.fillRect(x + PX * .2, y + PX * (.7 + i * .07), PX * .6, 6);
  }
}
function dibujarOtro(c, x, y, [nombre, color]) {
  fondoCelda(c, x, y, '#f6f7f8', color);
  c.fillStyle = color; c.fillRect(x, y + PX * .72, PX, PX * .28);
  texto(c, nombre.toUpperCase(), x + PX / 2, y + PX * .86, 32, '#ffffff', 900);
  c.fillStyle = color; c.globalAlpha = .9;
  c.beginPath(); c.roundRect(x + PX * .3, y + PX * .15, PX * .4, PX * .45, 20); c.fill(); c.globalAlpha = 1;
}

let catalogo = null;
/** Atlas único (se dibuja una vez) y listas de celdas por familia. */
export function atlasProductos() {
  if (catalogo) return catalogo;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = N * PX;
  const c = canvas.getContext('2d');
  const r = azar(29);
  const familias = { medicina: [], botana: [], dulce: [], bebida: [], higiene: [], frasco: [], paquete: [], otro: [] };
  const fondos = [], nombres = [];
  let i = 0;
  const celda = (familia, fn, datos) => {
    const cx = i % N, cy = Math.floor(i / N);
    const x = cx * PX, y = (N - 1 - cy) * PX;          // flipY: la fila 0 del atlas es la de abajo
    c.save(); c.beginPath(); c.rect(x, y, PX, PX); c.clip();
    fn(c, x, y, datos, r);
    c.restore();
    const px = c.getImageData(x + 2, y + PX / 2, 1, 1).data;
    fondos[i] = new T.Color().setRGB(px[0] / 255, px[1] / 255, px[2] / 255, T.SRGBColorSpace);
    nombres[i] = datos.slice(0, 2).filter(d => typeof d === 'string' && !d.startsWith('#') && !d.startsWith('ambar') && d !== 'agua').join(' ');
    familias[familia].push(i++);
  };
  MEDICINAS.forEach(d => celda('medicina', dibujarMedicina, d));
  BOTANAS.forEach(d => celda('botana', dibujarBolsa, d));
  DULCES.forEach(d => celda('dulce', dibujarDulce, d));
  BEBIDAS.forEach(d => celda('bebida', dibujarBotella, d));
  HIGIENE.forEach(d => celda('higiene', dibujarHigiene, d));
  FRASCOS.forEach(d => celda('frasco', dibujarFrasco, d));
  PAQUETES.forEach(d => celda('paquete', dibujarPaquete, d));
  OTROS.forEach(d => celda('otro', dibujarOtro, d));
  const textura = new T.CanvasTexture(canvas);
  textura.colorSpace = T.SRGBColorSpace; textura.anisotropy = 8;
  textura.minFilter = T.LinearMipmapLinearFilter; textura.magFilter = T.LinearFilter;
  // Los fondos de la franja de canto dan el trazo de cada empaque (oscurecido, nunca negro).
  const trazos = fondos.map(f => colorTrazo(f));
  catalogo = { textura, familias, fondos, trazos, nombres, canvas, usadas: i };
  return catalogo;
}

/* ── Geometrías de empaque (alto 1, centradas en la base) ─────────────── */

function geoCaja() { const g = new T.BoxGeometry(1, 1, 1); g.translate(0, .5, 0); return conNormalContorno(g); }
// Bolsa: caja subdividida que se infla en el centro y se aplasta en los remates.
function geoBolsa() {
  const g = new T.BoxGeometry(1, 1, 1, 4, 6, 1), p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const fy = Math.max(0, 1 - Math.pow(Math.abs(y * 2), 5)), fx = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x * 2), 4)));
    p.setZ(i, Math.sign(z) * (.06 + .44 * fy * (.35 + .65 * fx)));
    p.setX(i, x * (1 - .06 * fy));
  }
  g.computeVertexNormals(); g.translate(0, .5, 0);
  return conNormalContorno(g);
}
// Botella: perfil de torno con hombro, cuello y tapa (radio máximo .5).
// El torno reparte v por índice de punto; aquí v = altura, para que la
// etiqueta pintada en la celda caiga a la misma altura en cualquier perfil.
function torno(perfil) {
  const g = new T.LatheGeometry(perfil.map(([x, y]) => new T.Vector2(x, y)), 9);   // 9 lados: se lee redondo con toon y pesa poco
  const p = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i = 0; i < p.count; i++) uv.setY(i, p.getY(i));
  return conNormalContorno(g);
}
function geoBotella() {
  return torno([[0, 0], [.5, 0], [.5, .62], [.4, .75], [.19, .85], [.21, .87], [.21, 1], [0, 1]]);
}
function geoFrasco() {
  return torno([[0, 0], [.5, 0], [.5, .76], [.46, .8], [.46, 1], [0, 1]]);
}

/** Almacén de productos: se colocan con `poner` y se instancian con `construir`. */
export function crearProductos() {
  const atlas = atlasProductos();
  const tipos = {
    caja: { geo: geoCaja(), modo: 0 }, bolsa: { geo: geoBolsa(), modo: 0 },
    botella: { geo: geoBotella(), modo: 2 }, frasco: { geo: geoFrasco(), modo: 2 },
  };
  for (const t of Object.values(tipos)) {
    t.items = [];
    t.material = crearMaterialToon({ atlas: { textura: atlas.textura, n: N, modo: t.modo }, bandas: 3 });
  }
  const pila = [new T.Matrix4()];
  const p = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(), s = new T.Vector3();
  const api = {
    atlas, familias: atlas.familias,
    /** Marco local (posición + giro en Y) para colocar un anaquel entero. */
    en(x, y, z, ry, fn) {
      const m = new T.Matrix4().compose(p.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), s.set(1, 1, 1));
      pila.push(pila.at(-1).clone().multiply(m));
      try { fn(); } finally { pila.pop(); }
    },
    /** Un empaque: base centrada en (x, y, z), frente hacia +z local. */
    poner(tipo, celda, x, y, z, w, h, d, { ry = 0, rx = 0, rz = 0, nombre = null, trazo = true } = {}) {
      const t = tipos[tipo];
      const matriz = new T.Matrix4().compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(w, h, d)).premultiply(pila.at(-1));
      t.items.push({ matriz, celda, nombre, trazo });
    },
    total() { return Object.values(tipos).reduce((n, t) => n + t.items.length, 0); },
    construir(grupo, pulsables = []) {
      for (const [clave, t] of Object.entries(tipos)) {
        if (!t.items.length) continue;
        const n = t.items.length;
        const celdas = new Float32Array(n), trazo = new Float32Array(n * 3), nivel = new Float32Array(n).fill(1);
        const mesh = new T.InstancedMesh(t.geo, t.material, n);
        t.items.forEach((it, i) => {
          mesh.setMatrixAt(i, it.matriz); celdas[i] = it.celda;
          const c = atlas.trazos[it.celda]; trazo[i * 3] = c.r; trazo[i * 3 + 1] = c.g; trazo[i * 3 + 2] = c.b;
        });
        const geo = t.geo.clone();
        geo.setAttribute('aCelda', new T.InstancedBufferAttribute(celdas, 1));
        mesh.geometry = geo;
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.computeBoundingBox();
        mesh.name = `productos-${clave}`;
        mesh.userData.nombres = t.items.map(it => it.nombre);
        pulsables.push(mesh);
        grupo.add(mesh);
        // Trazo solo para lo que se ve: las filas de atrás quedan tapadas por las de delante.
        const conTrazo = t.items.map((it, i) => it.trazo ? i : -1).filter(i => i >= 0);
        const casco = t.geo.clone();
        casco.setAttribute('aNivel', new T.InstancedBufferAttribute(nivel.subarray(0, conTrazo.length), 1));
        casco.setAttribute('aTrazo', new T.InstancedBufferAttribute(new Float32Array(conTrazo.flatMap(i => [trazo[i * 3], trazo[i * 3 + 1], trazo[i * 3 + 2]])), 3));
        const hull = new T.InstancedMesh(casco, crearMaterialContornoInstancias('fino'), conTrazo.length);
        conTrazo.forEach((i, k) => hull.setMatrixAt(k, t.items[i].matriz));
        hull.instanceMatrix.needsUpdate = true; hull.computeBoundingSphere();
        hull.raycast = () => {}; hull.name = 'contorno';
        grupo.add(hull);
        t.items = [];
      }
      return pulsables;
    },
  };
  return api;
}

export { NIVELES_CONTORNO };
