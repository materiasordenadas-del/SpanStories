import * as T from '../engine/three.js';
import { caja, cilindro, pieza, barra } from './Piezas.js';
import { crearMuroConHuecos } from './MuroConHuecos.js';
import { materialTextura, uvMetros } from './Texturas.js';
import { COLORS as C, COLONNADE as K, TEJADILLO as TJ } from '../engine/dimensions.js';

// Todas las piezas se construyen en coordenadas del MUNDO salvo que se diga otra cosa.

/** Muro recto por su eje. muro 'z': paralelo a x en z = eje, de x = desde a x = hasta. muro 'x': paralelo a z.
 *  Dos mitades con su color (`colores`: [lado de coordenada menor, lado mayor] en el eje perpendicular) y zócalo pintado opcional por lado. Los huecos
 *  van en coordenada del mundo a lo largo del muro ({ pos, ancho, alto, base }). */
export function crearMuro({ muro, eje, desde, hasta, y0 = 0, alto, grosor, colores, huecos = [], zocalo = null }) {
  const root = new T.Group(), a = Math.min(desde, hasta), b = Math.max(desde, hasta), largo = b - a, mid = (a + b) / 2;
  // Muro 'x' girado +90°: x local = −z del mundo y +z local = +x del mundo (colores/lados en ejes del mundo).
  const local = huecos.map(h => ({ x: (muro === 'x' ? mid - h.pos : h.pos - mid), ancho: h.ancho, alto: Math.min(h.alto, alto - (h.base || 0)), base: h.base || 0 })).filter(h => h.alto > 0);
  const capa = (fondo, color, offset, alt = alto, hs = local) => {
    const m = crearMuroConHuecos({ ancho: largo, alto: alt, fondo, color, huecos: hs });
    m.position.z = offset; root.add(m); return m;
  };
  const [cNeg, cPos] = colores;
  if (cNeg === cPos) capa(grosor, cNeg, 0); else { capa(grosor / 2, cNeg, -grosor / 4); capa(grosor / 2, cPos, grosor / 4); }
  // Zócalo pintado: 1,5 cm sobre la cara, recortado por los vanos que llegan a su altura.
  if (zocalo) for (const lado of zocalo.lados) {
    const hs = local.filter(h => h.base < zocalo.alto).map(h => ({ ...h, alto: Math.min(h.alto, zocalo.alto - h.base) }));
    capa(.015, zocalo.color, lado * (grosor / 2 + .0075), zocalo.alto, hs);
  }
  if (muro === 'x') { root.rotation.y = Math.PI / 2; root.position.set(eje, y0, mid); } else root.position.set(mid, y0, eje);
  root.userData.largo = largo; return root;
}

/** Enjuta de arco de medio punto: rellena las esquinas altas de un vano rectangular (frente en +z local). */
export function crearArco({ ancho, alto, grosor, color, moldura = C.moldura, lados = [1, -1] }) {
  const root = new T.Group(), r = ancho / 2, arranque = alto - r;
  const s = new T.Shape(); s.moveTo(-r, arranque); s.absarc(0, arranque, r, Math.PI, 0, true); s.lineTo(r, alto); s.lineTo(-r, alto); s.closePath();
  pieza(root, 'enjuta', new T.ExtrudeGeometry(s, { depth: grosor, bevelEnabled: false, curveSegments: 18 }), color, [0, 0, -grosor / 2], false);
  // Moldura de piedra en el borde del arco y en las jambas, por cada cara visible.
  for (const lado of lados) {
    const m = new T.Shape(); m.absarc(0, arranque, r + .12, 0, Math.PI, false); m.lineTo(-r, arranque); m.absarc(0, arranque, r, Math.PI, 0, true); m.closePath();
    pieza(root, 'moldura-arco', new T.ExtrudeGeometry(m, { depth: .03, bevelEnabled: false, curveSegments: 18 }), moldura, [0, 0, lado * grosor / 2 + (lado < 0 ? -.03 : 0)], false);
    for (const sx of [-1, 1]) caja(root, 'moldura-jamba', .12, arranque, .03, moldura, sx * (r + .06), arranque / 2, lado * (grosor / 2 + .015), false);
  }
  return root;
}

/** Columna toscana de piedra (PB). Pivot abajo-centro. */
export function crearColumnaPiedra({ alto }) {
  const r = new T.Group(), d = K.columnPB;
  caja(r, 'plinto', d + .14, .14, d + .14, C.piedraOscura, 0, .07, 0, 'fino');
  cilindro(r, 'basa', d / 2 + .04, .1, C.piedra, 0, .19, 0, 'fino', 20);
  cilindro(r, 'fuste', d / 2, alto - .5, C.piedra, 0, .24 + (alto - .5) / 2, 0, 'fino', 20);
  cilindro(r, 'collarino', d / 2 + .03, .06, C.piedra, 0, alto - .23, 0, 'fino', 20);
  caja(r, 'abaco', d + .12, .2, d + .12, C.piedra, 0, alto - .1, 0, 'fino');
  return r;
}
/** Pie derecho de madera sobre basa de piedra (P1). */
export function crearPieDerecho({ alto }) {
  const r = new T.Group(), d = K.postP1;
  caja(r, 'basa', d + .1, .12, d + .1, C.piedra, 0, .06, 0, 'fino');
  caja(r, 'poste', d, alto - .12, d, C.maderaOscura, 0, .12 + (alto - .12) / 2, 0, 'fino');
  return r;
}
/** Zapata: apoyo de madera bajo la viga, con extremos tallados. Eje a lo largo de x local. */
export function crearZapata() {
  const r = new T.Group(), L = K.zapata;
  caja(r, 'zapata', L, .14, K.postP1 + .02, C.maderaOscura, 0, .07, 0, 'fino');
  for (const s of [-1, 1]) caja(r, 'talla', .16, .07, K.postP1 + .02, C.maderaOscura, s * (L / 2 - .08), -.035, 0, false);
  return r;
}

/** Baranda de madera entre dos puntos (pasamanos, balaustres y zócalo). Altura desde y. */
export function crearBaranda([x0, z0], [x1, z1], y, { alto = K.railing.height, color = C.maderaOscura } = {}) {
  const r = new T.Group(), len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / K.railing.step));
  barra(r, 'pasamanos', [x0, y + alto, z0], [x1, y + alto, z1], .09, color, 'fino');
  barra(r, 'zocalo-baranda', [x0, y + .12, z0], [x1, y + .12, z1], .07, color, false);
  for (let i = 1; i < n; i++) { const k = i / n; caja(r, 'balaustre-' + i, K.railing.baluster, alto - .16, K.railing.baluster, C.madera, x0 + (x1 - x0) * k, y + .16 + (alto - .16) / 2, z0 + (z1 - z0) * k, false); }
  return r;
}

/** Tejadillo a cuatro aguas invertido (cae hacia el patio). `plan` sale de Planta.tejadillo(). */
export function crearTejadillo(plan) {
  const r = new T.Group(), { alto: A, bajo: B, yAlto, yBajo } = plan;
  const teja = materialTextura('teja', { bandas: 2 }), cana = materialTextura('cana', { bandas: 2 });
  // Cuatro faldones trapezoidales: de un borde del rectángulo alto al del bajo.
  const lados = [
    [[A.x0, A.z1], [A.x1, A.z1], [B.x1, B.z1], [B.x0, B.z1]],   // delantero (norte, z alto)
    [[A.x1, A.z0], [A.x0, A.z0], [B.x0, B.z0], [B.x1, B.z0]],   // trasero
    [[A.x0, A.z0], [A.x0, A.z1], [B.x0, B.z1], [B.x0, B.z0]],   // oeste
    [[A.x1, A.z1], [A.x1, A.z0], [B.x1, B.z0], [B.x1, B.z1]],   // este
  ];
  for (const [i, q] of lados.entries()) for (const [mat, dy, nombre] of [[teja, 0, 'teja'], [cana, -TJ.thickness, 'cielo-cana']]) {
    const pts = q.map(([x, z], k) => [x, (k < 2 ? yAlto : yBajo) + dy, z]);
    const g = new T.BufferGeometry(), tri = nombre === 'teja' ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];   // teja mira arriba; la caña, abajo
    g.setAttribute('position', new T.Float32BufferAttribute(tri.flatMap(k => pts[k]), 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(new Array(tri.length * 2).fill(0), 2));
    g.computeVertexNormals();
    // UV: a lo largo del alero y en la pendiente (las tejas corren hacia el patio).
    const p = g.getAttribute('position'), uv = g.getAttribute('uv'), m = mat.userData.metros;
    for (let k = 0; k < p.count; k++) { const x = p.getX(k), z = p.getZ(k); uv.setXY(k, (i < 2 ? x : z) / m, (i < 2 ? z : x) / m); }
    const mesh = new T.Mesh(g, mat); mesh.name = nombre + '-' + i; r.add(mesh);
  }
  // Alero: tabla de borde y canal de barro a lo largo del perímetro bajo.
  const borde = [[B.x0, B.z1], [B.x1, B.z1], [B.x1, B.z0], [B.x0, B.z0], [B.x0, B.z1]];
  for (let k = 0; k < 4; k++) { const [a, b] = [borde[k], borde[k + 1]];
    barra(r, 'tabla-alero', [a[0], yBajo - .06, a[1]], [b[0], yBajo - .06, b[1]], .14, C.maderaOscura, 'fino'); }
  return r;
}

/** Ventana de fachada con reja de madera voladiza (balaustres) y tejadillo; postigos interiores. Frente +z local. */
export function crearVentanaReja({ ancho, alto, vuelo = .28 }) {
  const r = new T.Group();
  caja(r, 'vidrio', ancho, alto, .04, C.vidrio, 0, alto / 2, -.12, false);
  for (const s of [-1, 1]) caja(r, 'postigo', ancho / 2 - .04, alto - .1, .04, C.postigo, s * ancho / 4, alto / 2, -.08, false);
  caja(r, 'repisa', ancho + .3, .1, vuelo + .1, C.maderaOscura, 0, .05, vuelo / 2);
  caja(r, 'cabezal', ancho + .3, .1, vuelo + .1, C.maderaOscura, 0, alto - .05, vuelo / 2);
  for (const s of [-1, 1]) caja(r, 'montante', .08, alto, .08, C.maderaOscura, s * (ancho / 2 + .1), alto / 2, vuelo, 'fino');
  const n = Math.round(ancho / .11);
  for (let i = 1; i < n; i++) cilindro(r, 'balaustre-' + i, .022, alto - .2, C.madera, -ancho / 2 + ancho * i / n, alto / 2, vuelo, false, 8);
  const techo = caja(r, 'tejadillo', ancho + .5, .07, vuelo + .35, C.teja, 0, alto + .12, vuelo / 2 + .05); techo.rotation.x = .3;
  return r;
}

/** Losa horizontal (forjado, cubierta) de un rectángulo del mundo; cara superior en `yTop`. */
export function crearLosa(rc, yTop, grosor, color = C.cal) {
  const r = new T.Group(); caja(r, 'losa', rc.x1 - rc.x0, grosor, rc.z1 - rc.z0, color, (rc.x0 + rc.x1) / 2, yTop - grosor / 2, (rc.z0 + rc.z1) / 2, false); return r;
}

/** Ventilador de techo colgado de y = techo. */
export function crearVentilador(techo) {
  const r = new T.Group();
  cilindro(r, 'florón', .08, .05, C.crema, 0, techo - .025, 0, true, 12);
  cilindro(r, 'barra', .015, .45, C.metal, 0, techo - .27, 0, false, 8);
  cilindro(r, 'motor', .11, .14, C.crema, 0, techo - .55, 0, true, 16);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2, pa = caja(r, 'aspa-' + k, .62, .015, .13, C.madera, Math.cos(a) * .42, techo - .58, Math.sin(a) * .42); pa.rotation.y = -a; }
  r.userData.aspas = r.children.filter(c => c.name.startsWith('aspa'));
  return r;
}
export { uvMetros };
