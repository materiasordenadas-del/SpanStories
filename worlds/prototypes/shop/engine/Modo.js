import * as T from './three.js';
import { PALETA, crearLoteColor } from './Kit.js';
import { construirMural, construirFrio, construirFrescos, construirVitrinaEste, construirExposicion } from './Mobiliario.js';
import { llenarEstante, ponerProducto } from './Productos.js';
import { PRODUCTOS, ZONAS, SECCIONES, OFERTAS } from './Surtido.js';
import { crearEtiquetas, cartelPasillo, cartelPared, cartelFrio, cartelOferta, cartelLista, aviso, avisoPrecio, cartelSalida,
  colocar, estrella, precioDe } from './Rotulos.js';
import { MODOS, GONDOLAS, largoGondola, zSurGondola, CAJAS, carrilCaja, ISLA, FRESCOS, FRIO, ALMACEN, MURAL, LOCAL, ESCAPARATE,
  PUERTA, ALTO_TECHO, CANASTAS, BANCA } from './config.js';

/* Lo que cambia entre modos (súper / general) sobre el mismo casco:
   pared oeste, pared este, fondo, surtido, carteles y el letrero de la fachada. */

// Refrigeradores del súper: tres grupos de tres puertas.
const FRIO_GRUPOS = [['leche', 'yogur', 'kumis', 'queso', 'mantequilla'], ['huevos', 'salchichas', 'jamon', 'chorizo', 'queso'], ['gaseosa', 'gaseosaVerde', 'agua', 'jugo', 'gaseosaNaranja']];

export function construirModo(ctx, modo, { moneda, letrero }) {
  const superm = modo === 'super', Z = ZONAS[modo], S = SECCIONES[modo], kit = ctx.kit;
  construirMural(ctx, { colgados: !superm });
  if (superm) { construirFrio(ctx); construirFrescos(ctx); } else { construirExposicion(ctx); construirVitrinaEste(ctx); }

  // ── Surtido en los estantes ─────────────────────────────────────────
  const lp = crearLoteColor(kit), tags = [];
  for (const e of ctx.estantes) {
    let ids = null, op = {};
    switch (e.zona) {
      case 'frio': ids = FRIO_GRUPOS[Math.floor(e.puerta / 3)]; op = { semilla: e.puerta + e.nivel, filas: 2 }; break;
      case 'fresco': ids = [Z.fresco[(e.cajon + e.escalon * 3) % Z.fresco.length]]; op = { filas: 4, apilar: false }; break;
      case 'expo': {
        const id = Z.expo[(e.hueco * 2 + e.fila) % Z.expo.length];
        const esc = Math.min(1.6, e.altoLibre / PRODUCTOS[id].tam[1], (e.fondo + .1) / PRODUCTOS[id].tam[2]);   // cabe en la tarima
        ponerProducto(lp, kit, id, e.x, e.y, e.z, e.fila ? .3 : -.2, esc);
        tags.push({ id, matriz: new T.Matrix4().makeTranslation(e.x, e.y - .035, e.z + e.fondo / 2 + .045) });
        continue;
      }
      case 'escaparate': case 'isla': continue;              // se ponen a mano
      case 'colgados': ids = Z.colgados; op = { colgado: true, semilla: e.nivel * 3 }; break;
      case 'almacen': ids = Z.almacen; op = { filas: 1, apilar: false, precios: false }; break;
      default: ids = Z[e.zona]; op = { semilla: (e.nivel ?? 0) * 2 };
    }
    if (!ids) continue;
    tags.push(...llenarEstante(lp, kit, e, ids, op));
  }
  // Isla: montones del producto de temporada y un peldaño con el destacado
  const I = ISLA, islaIds = Z.isla;
  for (const [k, e] of ctx.estantes.filter(e => e.zona === 'isla').entries()) {
    tags.push(...llenarEstante(lp, kit, e, k === 2 ? [islaIds[0]] : islaIds.slice(k, k + 2), { filas: 2, apilar: true }));
  }
  // Escaparate: tres pirámides de producto, de cara a la calle
  const E = ESCAPARATE, ancho = E.x1 - E.x0;
  Z.escaparate.forEach((id, k) => {
    const p = PRODUCTOS[id], [w, h] = p.tam, xc = E.x0 + ancho * (k + .5) / 3, zc = LOCAL.z1 - E.fondo / 2;
    const base = p.tam[1] > .35 ? 2 : 4;
    for (let r = 0; r < base; r++) for (let i = 0; i < base - r; i++) ponerProducto(lp, kit, id, xc + (i - (base - r - 1) / 2) * (w + .02), E.y0 + r * (h + .005), zc);
    tags.push({ id, matriz: new T.Matrix4().makeTranslation(xc, E.y0 - .06, LOCAL.z1 - .02) });
  });
  const nProductos = lp.total;
  lp.construir(ctx.grupo, ctx.pulsables);
  ctx.lote.construir(ctx.grupo, ctx.pulsables);
  const etiquetas = crearEtiquetas(ctx.grupo, tags, moneda());

  // ── Señalización ───────────────────────────────────────────────────
  const repintables = [];
  const conPrecio = m => { repintables.push(m); m.userData.pintar(moneda()); return m; };
  const L = largoGondola(), zc = GONDOLAS.z0 + L / 2, zs = zSurGondola();
  GONDOLAS.x.forEach((x, i) => {
    const c = colocar(ctx, cartelPasillo(i + 1, S.pasillos[i]), x, 2.72, zc + .6, 0);
    c.userData.nombre = `el letrero del pasillo ${i + 1}: ${S.pasillos[i].join(' ').trim()}`;
    for (const dx of [-.6, .6]) ctx.lote.cil('aceroOscuro', x + dx, (3.0 + ALTO_TECHO) / 2, zc + .6, .012, ALTO_TECHO - 3.0, { contorno: false });
    const o = OFERTAS[modo][i];
    conPrecio(colocar(ctx, cartelOferta(o.id, o.txt, .8, .44), x, GONDOLAS.alto + .24, zs + GONDOLAS.cabecera - .06, 0));
  });
  colocar(ctx, cartelPared(S.mural, 4.2, .46), LOCAL.x0 + .015, 2.3, MURAL.z0 + MURAL.modulos * MURAL.modulo / 2, Math.PI / 2).userData.nombre = `la sección: ${S.mural}`;
  colocar(ctx, cartelPared(S.este, 4.2, .46), LOCAL.x1 - .015, 2.3, FRESCOS.z0 + FRESCOS.modulos * FRESCOS.modulo / 2, -Math.PI / 2).userData.nombre = `la sección: ${S.este}`;
  const zFrio = FRIO.z0 + FRIO.fondo;
  if (superm) {
    FRIO_GRUPOS.forEach((_, g) => {
      const x = FRIO.x0 + (g * 3 + 1.5) * FRIO.ancho;
      colocar(ctx, cartelFrio(S.fondo[g], 3 * FRIO.ancho - .12), x, FRIO.alto - .15, zFrio + .006, 0).userData.nombre = `la sección: ${S.fondo[g]}`;
    });
    for (let i = 0; i < FRIO.n; i += 2) ctx.lamparas.push({ pos: [FRIO.x0 + (i + .5) * FRIO.ancho, 1.2, zFrio + .3], color: '#dff0ff', intensidad: .35, radio: 1.3 });
  } else {
    const xm = FRIO.x0 + FRIO.n * FRIO.ancho / 2;
    colocar(ctx, cartelPared(`${S.fondo[0]} · ${S.fondo[1]}`, 7, .56), xm, 2.1, FRIO.z0 + .07, 0).userData.nombre = `la ${S.fondo[0].toLowerCase()}`;
    // Focos de riel sobre las tarimas
    const n = 7, paso = (FRIO.n * FRIO.ancho) / n;
    ctx.lote.bloque('grafito', FRIO.x0 + .2, ALTO_TECHO - .06, FRIO.z0 + 1.35, FRIO.x0 + FRIO.n * FRIO.ancho - .2, ALTO_TECHO, FRIO.z0 + 1.41, { contorno: false });
    for (let i = 0; i < n; i++) {
      const x = FRIO.x0 + paso * (i + .5);
      ctx.lote.cil('grafito', x, ALTO_TECHO - .16, FRIO.z0 + 1.38, .09, .16, { rx: .5, nombre: 'un foco' });
      ctx.lote.cil(kit.emisivo('#fff3d0'), x, ALTO_TECHO - .245, FRIO.z0 + 1.34, .07, .01, { rx: .5 });
      ctx.lamparas.push({ pos: [x, 2.2, FRIO.z0 + .5], color: '#fff0d0', intensidad: .7, radio: 1.2 });
    }
  }
  // Isla: cartel en el poste (dos caras)
  conPrecio(colocar(ctx, cartelLista(S.isla[0], S.isla[1], islaIds, ...I.cartel, true), I.x, I.cartelY, I.z + .035, 0));
  // Escaparate: carteles pegados al vidrio mirando a la calle (con reverso liso)
  [[1 / 3, S.escaparate], [2 / 3, S.escaparate]].forEach(([f]) => {
    const x = E.x0 + ancho * f, m = conPrecio(colocar(ctx, cartelLista(S.escaparate, '¡Precios bajos todos los días!', Z.escaparate, 1.0, .7), x, 1.75, LOCAL.z1 + .085, 0));
    const reverso = new T.Mesh(new T.PlaneGeometry(1.0, .7), new T.MeshBasicMaterial({ color: '#f3ead8' }));
    reverso.position.set(x, 1.75, LOCAL.z1 + .08); reverso.rotation.y = Math.PI; ctx.grupo.add(reverso);
    m.userData.nombre = `el cartel del escaparate: ${S.escaparate}`;
  });
  // Caja: letrero colgante, bolsas, datáfono y dulces
  const xCajas = (CAJAS.x[0] + carrilCaja(1)) / 2;
  colocar(ctx, aviso('CAJAS', { ancho: 1.3, alto: .38, fondo: PALETA.rojo, tinta: '#fff', doble: true, sub: 'Pague aquí' }), xCajas, 2.85, (CAJAS.z0 + CAJAS.z1) / 2 - .4, 0);
  CAJAS.x.forEach((x, i) => {
    const b = conPrecio(colocar(ctx, avisoPrecio('Bolsa reutilizable', 2500, { ancho: .3, alto: .16 }), x, CAJAS.alto + .5 + .09, CAJAS.z1 - .01, 0));
    b.userData.nombre = 'la bolsa reutilizable';
    colocar(ctx, aviso('Aceptamos tarjetas', { ancho: .5, alto: .2, fondo: '#1f5f9c', tinta: '#fff', sub: 'Pague con datáfono' }), x + CAJAS.ancho / 2 + .008, .62, CAJAS.z1 - .55, Math.PI / 2);
    colocar(ctx, aviso(superm ? 'Dulces y chicles' : 'Para llevar', { ancho: .5, alto: .14, fondo: PALETA.amarillo }), carrilCaja(i) + CAJAS.carril / 2 + .18, 1.36, CAJAS.z0 + .5, -Math.PI / 2);
  });
  colocar(ctx, cartelSalida('→'), PUERTA.x, 2.6, LOCAL.z1 - .02, Math.PI);
  colocar(ctx, aviso('SOLO PERSONAL', { ancho: .9, alto: .26, fondo: '#2a2c2f', tinta: '#fff', sub: 'Almacén' }), ALMACEN.puerta.x, 2.5, ALMACEN.z1 + ALMACEN.muro + .01, 0);
  colocar(ctx, aviso('Puerta de servicio', { ancho: .9, alto: .24, fondo: '#f4c542', sub: 'Recibo de mercancía' }), LOCAL.x1 - .01, 2.45, ALMACEN.servicio.z, -Math.PI / 2);
  colocar(ctx, aviso('Tome su canasta', { ancho: .6, alto: .18, fondo: PALETA.rojo, tinta: '#fff' }), LOCAL.x1 - .012, 1.55, CANASTAS.z, -Math.PI / 2);
  colocar(ctx, cartelPared('¡Bienvenidos a La Estrella!', 2.4, .38), LOCAL.x1 - .015, 2.3, BANCA.z - .2, -Math.PI / 2).userData.nombre = 'el cartel de bienvenida';
  ctx.lote.construir(ctx.grupo, ctx.pulsables);

  pintarLetrero(letrero, modo);
  return {
    productos: nProductos, etiquetas: etiquetas.total,
    repintarPrecios() { const m = moneda(); etiquetas.repintar(m); for (const r of repintables) r.userData.pintar(m); },
    nombreProducto(id) {
      const p = PRODUCTOS[id]; if (!p) return null;
      const n = p.nombre[0].toUpperCase() + p.nombre.slice(1);
      return p.sinPrecio ? `${n} (en el almacén)` : `${n} · <b>${precioDe(id, moneda())}</b>`;
    },
    zonaDe: (x, z) => zonaDe(x, z, superm),
  };
}

// Zona donde está el jugador (para la etiqueta de la esquina).
function zonaDe(x, z, superm) {
  if (x > ALMACEN.x0 && z < ALMACEN.z1) return 'El almacén';
  if (x > ALMACEN.x0 && z < ALMACEN.z1 + 1.3) return 'La puerta del almacén';
  if (z < FRIO.z0 + FRIO.fondo + 1.6) return superm ? 'Los refrigeradores' : 'La exposición especial';
  if (x > FRESCOS.x1 - FRESCOS.fondo - 2.2 && z < FRESCOS.z0 + FRESCOS.modulos * FRESCOS.modulo) return superm ? 'Frutas y verduras' : 'Regalos y decoración';
  if (x < MURAL.x0 + MURAL.fondo + 1.3 && z < MURAL.z0 + MURAL.modulos * MURAL.modulo) return 'La pared de exposición';
  if (z < zSurGondola() + GONDOLAS.cabecera + 1.0) return 'Los pasillos';
  if (x < CAJAS.x[1] + 2 && z > CAJAS.espera - CAJAS.fila - .4) return 'La caja';
  if (Math.abs(x - ISLA.x) < 2.2 && Math.abs(z - ISLA.z) < 1.8) return 'Las ofertas';
  return 'La entrada';
}

/** Letrero de la fachada: estrella, nombre y tipo de tienda. */
export function pintarLetrero(letrero, modo) {
  letrero.userData.redibujar((c, w, h) => {
    c.fillStyle = PALETA.rojo; c.fillRect(0, 0, w, h);
    c.fillStyle = '#b8382f'; c.fillRect(0, h * .86, w, h * .14);
    const cx = w * .3, cy = h * .47, R = h * .36;
    estrella(c, cx - R * 2.1, cy, R, PALETA.amarillo);
    c.fillStyle = '#fffaf0'; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = `900 ${h * .5}px "Trebuchet MS", system-ui, sans-serif`; c.fillText('La Estrella', cx - R * .9, cy);
    c.fillStyle = PALETA.amarillo; c.font = `bold ${h * .26}px system-ui, sans-serif`; c.textAlign = 'right';
    c.fillText(MODOS[modo].letrero.toUpperCase(), w * .95, cy - h * .1);
    c.fillStyle = '#ffe9e3'; c.font = `${h * .15}px system-ui, sans-serif`;
    c.fillText('Abierto todos los días · 7:00 a. m. – 9:00 p. m.', w * .95, cy + h * .2);
  });
}
