import * as T from './three.js';
import { conNormalContorno } from './Luz25D.js';
import { PRODUCTOS } from './Surtido.js';

/* Formas de producto (geometrías unitarias compartidas) y colocación en estantes.
   Todo va al lote de color por instancia: una malla por forma, miles de instancias.
   Solo la fila delantera lleva etiqueta y trazo (las de atrás casi no se ven). */

let G = null;
function geometrias(kit) {
  if (G) return G;
  // Almohada: caja subdividida con los bordes aplastados (bolsas de granos, paquetes, cojines)
  const almohada = (k = .55, tumbar = false) => {
    const g = new T.BoxGeometry(1, 1, 1, 4, 4, 1), p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) * 2, y = p.getY(i) * 2;
      p.setZ(i, p.getZ(i) * (1 - k * Math.max(x * x, y * y * .6)));
    }
    if (tumbar) g.rotateX(Math.PI / 2);
    g.computeVertexNormals(); return conNormalContorno(g);
  };
  const perfil = pts => conNormalContorno(new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y - .5)), 8));
  G = {
    caja: kit.geo.caja, cil: conNormalContorno(new T.CylinderGeometry(.5, .5, 1, 8)), esfera: conNormalContorno(new T.SphereGeometry(.5, 8, 6)),
    bolsa: almohada(.35), inflada: almohada(.75),
    tumbada: almohada(.6, true),
    botella: perfil([[0, 0], [.46, 0], [.5, .04], [.5, .58], [.36, .74], [.17, .84], [.17, 1], [0, 1]]),
    frasco: perfil([[0, 0], [.46, 0], [.5, .05], [.5, .82], [.42, .88], [.42, 1], [0, 1]]),
    olla: perfil([[0, 0], [.47, 0], [.5, .06], [.5, .8], [.53, .82], [.4, .92], [.1, .98], [.08, 1], [0, 1]]),
    jarra: perfil([[0, 0], [.3, 0], [.42, .9], [.44, 1], [0, 1]]),
  };
  return G;
}

/** Coloca UNA unidad de producto: `m` = marco local (base centrada en el estante,
 *  frente hacia +z).  `delante` = fila delantera (lleva etiqueta y trazo). */
function unidad(lote, g, prod, m, delante) {
  const [w, h, d] = prod.tam, [c0, c1] = prod.colores, id = prod.id;
  const nivel = delante && Math.max(w, h, d) >= .1 ? 'fino' : null;
  const put = (geo, x, y, z, sx, sy, sz, color, o = {}) => {
    const k = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(o.rx || 0, o.ry || 0, o.rz || 0)), new T.Vector3(sx, sy, sz));
    lote.poner(geo, m.clone().multiply(k), color, { id, nivel: o.trazo === false ? null : (o.nivel ?? nivel) });
  };
  switch (prod.forma) {
    case 'caja':
      put(g.caja, 0, h / 2, 0, w, h, d, c0);
      if (delante && !prod.sinPrecio) put(g.caja, 0, h * .52, d / 2 + .002, w * .8, h * .42, .004, c1, { trazo: false });
      if (prod.sinPrecio && delante) put(g.caja, 0, h + .002, 0, w * .98, .004, .05, c1, { trazo: false });   // cinta de embalar
      break;
    case 'bolsa': case 'bolsaLeche': {
      const geo = prod.forma === 'bolsaLeche' ? g.tumbada : prod.inflada ? g.inflada : g.bolsa;
      put(geo, 0, h / 2, 0, w, h, d, c0);
      if (delante) put(g.caja, 0, prod.forma === 'bolsaLeche' ? h * .75 : h * .5, prod.forma === 'bolsaLeche' ? 0 : d * .42, w * .6, prod.forma === 'bolsaLeche' ? .004 : h * .36, prod.forma === 'bolsaLeche' ? d * .5 : .004, c1, { trazo: false });
      if (prod.forma === 'bolsa' && !prod.inflada) put(g.caja, 0, h - .006, 0, w * .96, .012, d * .3, c0, { trazo: false });
      break;
    }
    case 'lata':
      put(g.cil, 0, h / 2, 0, w, h, d, c0);
      if (delante) put(g.cil, 0, h / 2, 0, w * 1.03, h * .56, d * 1.03, c1, { trazo: false });
      break;
    case 'botella':
      put(g.botella, 0, h / 2, 0, w, h, d, c0);
      put(g.caja, 0, h + .008, 0, w * .32, .018, d * .32, c1, { trazo: false });          // tapa
      if (delante) put(g.cil, 0, h * .38, 0, w * 1.03, h * .2, d * 1.03, c1, { trazo: false });
      break;
    case 'frasco':
      put(g.frasco, 0, h / 2, 0, w, h, d, c0);
      put(g.cil, 0, h * .96, 0, w * .88, h * .1, d * .88, c1, { trazo: false });
      if (delante) put(g.cil, 0, h * .45, 0, w * 1.03, h * .32, d * 1.03, c1, { trazo: false });
      break;
    case 'pan': put(g.esfera, 0, h / 2, 0, w, h, d, c0); break;
    case 'bola': put(g.esfera, 0, h / 2, 0, w, h, d, c0); if (delante) put(g.esfera, 0, h / 2, 0, w * 1.01, h * .2, d * 1.01, c1, { trazo: false }); break;
    case 'fruta':
      put(g.esfera, 0, h / 2, 0, w, h, d, c0, { ry: prod.largo ? (m.elements[12] * 7 % 1) * .6 - .3 : 0 });
      if (c1 !== c0) put(g.esfera, w * .12, h * .6, d * .1, w * .6, h * .6, d * .6, c1, { trazo: false });
      break;
    case 'platos': for (let k = 0; k < 6; k++) put(g.cil, 0, .008 + k * .016, 0, w * (k ? 1 : .6), .014, d * (k ? 1 : .6), k ? c0 : c1, { nivel: k === 5 ? nivel : null }); break;
    case 'olla':
      put(g.olla, 0, h / 2, 0, w, h, d, c0);
      put(g.cil, 0, h + .01, 0, w * .12, .03, d * .12, c1, { trazo: false });
      for (const s of [-1, 1]) put(g.caja, s * w * .55, h * .78, 0, w * .12, .025, .04, c1, { trazo: false });
      break;
    case 'colgado':
      put(g.caja, 0, h / 2, 0, w, h, d, c1);                                     // cartón del blíster
      put(g.caja, 0, h * .45, d / 2 + .008, w * .35, h * .8, .014, c0);        // el utensilio
      put(g.cil, 0, h + .02, -d / 2 - .06, .008, .14, .008, '#80878d', { rx: Math.PI / 2, trazo: false });   // gancho
      break;
    case 'licuadora':
      put(g.caja, 0, h * .14, 0, w, h * .28, d, c0);
      put(g.jarra, 0, h * .28 + h * .3, 0, w * .9, h * .6, d * .9, c1);
      put(g.cil, 0, h * .9, 0, w * .82, h * .06, d * .82, '#2a2c2f');
      break;
    case 'ventilador':
      put(g.cil, 0, .02, 0, w * .7, .04, w * .7, c0);
      put(g.cil, 0, h * .4, 0, .035, h * .75, .035, c0, { trazo: false });
      put(g.cil, 0, h * .78, .04, w, .1, w, c0, { rx: Math.PI / 2 });
      put(g.cil, 0, h * .78, .07, w * .3, .03, w * .3, c1, { rx: Math.PI / 2, trazo: false });
      break;
    default: put(g.caja, 0, h / 2, 0, w, h, d, c0);
  }
}

const orden = (i, n) => ((i % n) + n) % n;

/** Llena un estante con la lista de ids.  Devuelve las etiquetas de precio
 *  [{ id, matriz }] (una por bloque de producto, en el borde del estante). */
export function llenarEstante(lote, kit, e, ids, { semilla = 0, filas = 2, apilar = true, colgado = false, precios = true } = {}) {
  const g = geometrias(kit), etiquetas = [];
  const base = new T.Matrix4().compose(new T.Vector3(e.x, e.y, e.z), new T.Quaternion().setFromEuler(new T.Euler(0, e.ry, 0)), new T.Vector3(1, 1, 1));
  // bloques ~ un módulo; cada bloque un producto (el que quepa en altura)
  const nb = Math.max(1, Math.round(e.largo / (e.cabecera ? e.largo : 1.2) * (ids.length > 3 ? 2 : 1)));
  const largoB = e.largo / nb;
  let x = -e.largo / 2;
  for (let b = 0; b < nb; b++) {
    let prod = null;
    for (let t = 0; t < ids.length; t++) {
      const p = PRODUCTOS[ids[orden(semilla + b + t, ids.length)]];
      if (p && (colgado || p.tam[1] <= e.altoLibre)) { prod = p; break; }
    }
    if (!prod) { x += largoB; continue; }
    const [w, h, d] = prod.tam, gap = prod.forma === 'fruta' ? -.006 : .012;
    const n = Math.max(1, Math.floor((largoB + gap) / (w + gap)));
    const usado = n * (w + gap) - gap, x0 = x + (largoB - usado) / 2 + w / 2;
    const nf = colgado ? 1 : Math.max(1, Math.min(filas, Math.floor((e.fondo + .01) / (d + .01))));
    const capas = colgado ? 1 : apilar && prod.forma !== 'fruta' ? Math.max(1, Math.min(h < .1 ? 3 : 2, Math.floor((e.altoLibre + .005) / (h + .005)))) : 1;
    const frutaCapas = prod.forma === 'fruta' ? 2 : 1;
    for (let i = 0; i < n; i++) for (let f = 0; f < nf; f++) for (let c = 0; c < Math.max(capas, frutaCapas); c++) {
      const lx = x0 + i * (w + gap) + (prod.forma === 'fruta' ? (f % 2) * w * .5 : 0);
      const lz = colgado ? d / 2 + .1 : e.fondo / 2 - d / 2 - f * (d + .01);
      const ly = colgado ? -h - .03 : c * (prod.forma === 'fruta' ? h * .6 : h + .004);
      if (prod.forma === 'fruta' && c > 0 && (i % 2 || f === nf - 1)) continue;
      const m = base.clone().multiply(new T.Matrix4().makeTranslation(lx, ly, lz));
      unidad(lote, g, prod, m, f === 0 && (c === capas - 1 || prod.forma === 'fruta'));
    }
    if (precios && !prod.sinPrecio) {
      const tx = x + largoB / 2, tag = colgado
        ? new T.Matrix4().makeTranslation(tx, -.02, .09)
        : new T.Matrix4().makeTranslation(tx, -.03, e.fondo / 2 + .03);
      etiquetas.push({ id: prod.id, matriz: base.clone().multiply(tag), fruta: prod.forma === 'fruta' });
    }
    x += largoB;
  }
  return etiquetas;
}

/** Un solo producto puesto a mano (exposición, escaparate, isla): marco de mundo. */
export function ponerProducto(lote, kit, id, x, y, z, ry = 0, escala = 1) {
  const prod = PRODUCTOS[id]; if (!prod) return;
  const m = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry, 0)), new T.Vector3(escala, escala, escala));
  unidad(lote, geometrias(kit), prod, m, true);
}
