import * as T from './three.js';
import { optimizarObjeto } from './Optimizar.js';
import { COLORS as C, HOUSE as H, FRONT as F, STREET as S, POOL as P, DOOR, BUNK as B, NOMBRE, HORARIOS } from './dimensions.js';
import { rect, restar, CARAS, INTERIOR, PATIO, PISCINA, CALLE, DELANTERO, cuarto, vanos, VENTANAS, columnas, zsLargas, xsCortas,
  escalera, huecoEscalera, literas, portadas, tramosMuroCalle, tejadillo } from './Planta.js';
import { caja, cilindro, esfera, barra } from '../objetos/Piezas.js';
import { materialTextura, planoSuelo } from '../objetos/Texturas.js';
import { crearMuro, crearArco, crearColumnaPiedra, crearPieDerecho, crearZapata, crearBaranda, crearTejadillo, crearVentanaReja, crearLosa, crearVentilador } from '../objetos/Arquitectura.js';
import { crearVentanaBalconera, crearBalconMadera, crearFarol, crearPorton } from '../objetos/Colonial.js';
import { crearPuertaColonial, crearReja, crearPortada } from '../objetos/Puertas.js';
import { crearCartel, crearTextoPintado, lienzoCartel } from '../objetos/Carteles.js';
import * as M from '../objetos/Mobiliario.js';
import * as K from '../objetos/Cocina.js';
import { crearLitera, crearCasillero, crearCortina, crearAlmohada, crearCobija, crearLamparaLectura, crearPerchero, crearEspejo } from '../objetos/Dormitorio.js';
import { crearPiscina, crearEscalerilla } from '../objetos/Piscina.js';
import { crearEscalera } from '../objetos/Escalera.js';
import { crearPizarraPrecios } from '../objetos/Pizarra.js';
import { crearVecinos, crearFachadasEnfrente, crearHorizonte } from '../objetos/Fondo.js';
import { crearSombraContacto } from '../objetos/SombraContacto.js';

// La casa entera es UN mundo continuo (calle → muro → patio delantero → zaguán → patio → cuartos → azotea).
// Las «zonas» son vistas de cámara dentro de ese mundo; cada objeto lleva su zona para el selector.
const F1 = H.floorHeight, TECHO_PB = F1 - H.slab, ROOF = H.roofY + .02, X = CARAS.xIn, e = H.wall.ext, CASETA_PUERTA = 7.7;
export const PISOS = [0, F1, ROOF];

export const ZONAS = {
  calle: { nombre: 'La calle', descripcion: 'El muro del hostal: ENTRADA a la derecha y SALIDA a la izquierda.', planta: 0, cam: [-1.6, 1.62, 16.2], target: [1.2, 3.9, 0] },
  delantero: { nombre: 'Patio delantero', descripcion: 'Entre el muro y la casa: el portón, los faroles y el nombre del hostal.', planta: 0, cam: [6.4, 1.62, 5.4], target: [-.5, 2.6, -.5] },
  recepcion: { nombre: 'Recepción', descripcion: 'Check-in, llaves, consigna de equipaje y la pizarra de precios.', planta: 0, cam: [2.3, 1.62, -1.0], target: [7.4, 1.25, -4.9] },
  sala: { nombre: 'Sala común', descripcion: 'Sofás, televisor, juegos de mesa e intercambio de libros.', planta: 0, cam: [-2.4, 1.62, -1.1], target: [-8.2, 1.1, -4.6] },
  patio: { nombre: 'Patio y piscina', descripcion: 'El corazón de la casa: galerías, hamacas y una piscina pequeña.', planta: 0, cam: [0, 1.62, -7.45], target: [0, .2, -16] },
  cocina: { nombre: 'Cocina compartida', descripcion: 'Cada huésped cocina lo suyo: nevera, estufa, lavaplatos y canastas.', planta: 0, cam: [-2.0, 1.62, -22.9], target: [-8.2, 1.0, -24.2] },
  comedor: { nombre: 'Comedor', descripcion: 'Mesa larga y mostrador de buffet (la comida se pondrá después).', planta: 0, cam: [.6, 1.62, -21.7], target: [8.6, 1.0, -23.8] },
  dormitorio: { nombre: 'Dormitorio 1', descripcion: 'Mixto de 8 camas: literas con cortina, lámpara y casillero.', planta: 0, cam: [-7.6, 1.62, -7.45], target: [-7.6, 1.0, -13] },
  galeria: { nombre: 'Galería alta', descripcion: 'Planta alta: puertas de dormitorios y habitaciones privadas.', planta: 1, cam: [-4.5, F1 + 1.62, -14.0], target: [4.4, F1 + 1.1, -10.0] },   // mitad de la galería oeste: mira al otro lado por el vano central
  azotea: { nombre: 'Azotea', descripcion: 'Hamacas, barra, luces y la zona de ropas, con vista a la ciudad.', planta: 2, cam: [8.2, ROOF + 1.62, -1.4], target: [-3.5, ROOF + .7, -5.2] },
};
// Lámparas (luz de banda) que se encienden por zona: techo, faroles y guirnaldas.
const LAMPARAS = {
  galeria: [[-4.4, 3.2, -12], [4.4, 3.2, -11.5], [-4.4, 3.2, -17.1], [4.4, 3.2, -16.6], [2.4, 3.2, -8], [-1.9, 3.2, -8], [-1.5, 3.2, -20]],
  cuartos: { sala: [[-5.7, 3.6, -3.6]], recepcion: [[5.7, 3.6, -3.6]], zaguan: [[0, 3.4, -3.6]], dormitorio: [[-7.6, 3.5, -10.1]], cocina: [[-6.6, 3.5, -23.4], [-3.4, 3.5, -23.4]], comedor: [[2.2, 3.5, -23.3], [5.2, 3.5, -23.3]] },
};
export function lamparasDe(id) {
  const base = id === 'galeria' ? LAMPARAS.galeria.map(([x, y, z]) => [x, y + F1, z]) : id === 'azotea' ? [[-4, ROOF + 2.4, -3.6], [2, ROOF + 2.4, -3.6], [-8.4, ROOF + 2.3, -1]] : LAMPARAS.galeria;
  const extra = id === 'recepcion' ? [...LAMPARAS.cuartos.recepcion, ...LAMPARAS.cuartos.zaguan] : LAMPARAS.cuartos[id] || (id === 'calle' || id === 'delantero' ? [[-1.9, 2.9, .6], [1.9, 2.9, .6], [-6, 3.9, 6.6], [6, 3.9, 6.6]] : []);
  return [...extra, ...base].slice(0, 16).map(([x, y, z]) => ({ pos: [x, y, z], color: '#ffd9a0', intensidad: .3, radio: 5.5, exterior: id === 'azotea' || id === 'calle' || id === 'delantero' }));
}

export function crearHostal({ scene, objetos, onAccion = () => {} }) {
  const mundo = new T.Group(); mundo.name = 'hostal'; scene.add(mundo);
  const animados = [], cuenta = new Map(), raices = [];
  let zona = 'estructura', planta = 0;
  const conZona = (z, p, fn) => { const a = zona, b = planta; zona = z; planta = p; fn(); zona = a; planta = b; };

  // Una raíz seleccionable con ID estable, tipo, etiqueta (pantalla) y voz (con artículo).
  function add(root, tipo, etiqueta, voz, { id, accion, detalle = 2, sombra = false, optimizar = true, z = zona, p = planta, info } = {}) {
    const n = (cuenta.get(z + tipo) || 0) + 1; cuenta.set(z + tipo, n); id ??= `${z}-${tipo}-${String(n).padStart(2, '0')}`;
    if (optimizar && !root.userData.animar) optimizarObjeto(root);
    mundo.add(root); root.updateMatrixWorld(true);
    Object.assign(root.userData, { detalleMin: detalle, zona: z, planta: p, info });
    if (accion) root.userData.accion = accion;
    // Sombra de contacto: rectángulo horizontal alineado con el mundo bajo la huella (orden YXZ: primero se anula el giro).
    if (sombra) { const b = new T.Box3().setFromObject(root), s = crearSombraContacto(b.max.x - b.min.x, b.max.z - b.min.z);
      s.rotation.order = 'YXZ'; s.rotation.set(-Math.PI / 2, -root.rotation.y, 0); s.position.copy(root.worldToLocal(new T.Vector3((b.min.x + b.max.x) / 2, b.min.y + .01, (b.min.z + b.max.z) / 2))); root.add(s); }
    objetos.registrar(root, { id, tipo, etiqueta, voz });
    if (root.userData.animar) animados.push(root); raices.push(root);
    return root;
  }
  // Coloca y registra: pon(pieza, [x, y, z], giro, tipo, etiqueta, voz, opciones).
  const pon = (root, [x, y, z], rot, ...rest) => { root.position.set(x, y, z); root.rotation.y = rot; return add(root, ...rest); };
  const suelo = (rcs, y, tex, etiqueta, opts = {}) => { const g = new T.Group(); for (const rc of [rcs].flat()) g.add(planoSuelo(rc, y, materialTextura(tex))); return add(g, 'piso', etiqueta, 'el piso', { optimizar: false, ...opts }); };
  const cartel = (opts, pos, rot, etiqueta, voz, extra) => pon(crearCartel(opts), pos, rot, 'cartel', etiqueta, voz, { optimizar: false, ...extra });

  // ── Ciudad, calle y patio delantero ─────────────────────────────────────
  conZona('calle', 0, () => {
    mundo.add(crearHorizonte({ centro: [0, -10] }));
    const enfrente = crearFachadasEnfrente({ z: CALLE.fondoZ + .2 }); mundo.add(enfrente);
    add(crearVecinos({ zFrente: F.wallZ + F.thickness / 2, zFondo: -H.depth - 4, xDesde: H.width / 2, ancho: S.neighborWidth, alto: S.neighborHeight, n: S.neighborsEach }), 'casa', 'Casas vecinas', 'las casas vecinas', { optimizar: false });
    suelo(rect(-60, CALLE.acera[0], 60, CALLE.acera[1]), 0, 'acera', 'Acera');
    suelo(rect(-60, CALLE.via[0], 60, CALLE.via[1]), -S.curb, 'asfalto', 'Calle', {});
    suelo(rect(-60, CALLE.aceraOpuesta[0], 60, CALLE.aceraOpuesta[1] + 1), 0, 'acera', 'Acera de enfrente');
    for (const z of [CALLE.acera[1], CALLE.aceraOpuesta[0]]) { const g = new T.Group(); caja(g, 'sardinel', 120, S.curb, .16, '#bdb5a5', 0, -S.curb / 2 + .001, z + (z === CALLE.acera[1] ? -.08 : .08), false); add(g, 'sardinel', 'Sardinel (bordillo)', 'el sardinel', { detalle: 1 }); }
    // Rayas de la calle (paso peatonal frente al hostal) pintadas a ras.
    const cebra = new T.Group(); for (let i = 0; i < 7; i++) caja(cebra, 'franja', .5, .01, CALLE.via[1] - CALLE.via[0] - .6, '#efeae0', -3 + i, -S.curb + .006, (CALLE.via[0] + CALLE.via[1]) / 2, false); add(cebra, 'cebra', 'Paso de cebra', 'el paso de cebra');
  });
  conZona('delantero', 0, () => {
    suelo(DELANTERO, 0, 'laja', 'Patio delantero (laja de piedra)');
    // Sendero de barro: del portón a cada portada (entrar por la derecha, salir por la izquierda).
    const g = new T.Group(), barro = materialTextura('barro'), banda = 1.4, gx = F.gate.x;
    for (const rc of [rect(-gx - F.path / 2, 0, gx + F.path / 2, banda), rect(gx - F.path / 2, banda, gx + F.path / 2, DELANTERO.z1), rect(-gx - F.path / 2, banda, -gx + F.path / 2, DELANTERO.z1)]) g.add(planoSuelo(rc, .006, barro));
    add(g, 'sendero', 'Sendero de baldosa de barro', 'el sendero', { optimizar: false });
  });

  // ── Muro de calle con portadas: ENTRADA a la derecha (+x), SALIDA a la izquierda (−x) ──
  conZona('calle', 0, () => {
    for (const [i, t] of tramosMuroCalle().entries()) {
      const g = new T.Group(), w = t.x1 - t.x0, cx = (t.x0 + t.x1) / 2;
      caja(g, 'muro', w, F.height, F.thickness, C.fachada, cx, F.height / 2, F.wallZ, false);
      for (const s of [-1, 1]) caja(g, 'zocalo', w, .6, .02, C.zocalo, cx, .3, F.wallZ + s * (F.thickness / 2 + .01), false);
      caja(g, 'albardilla', w + .02, F.cap, F.thickness + .16, C.teja, cx, F.height + F.cap / 2, F.wallZ, 'fino');
      for (const x of t.pilastras) { caja(g, 'pilastra', F.pilaster.width, F.height + .25, F.pilaster.depth, C.fachadaSombra, x, (F.height + .25) / 2, F.wallZ, 'fino'); caja(g, 'remate', F.pilaster.width + .1, .1, F.pilaster.depth + .1, C.moldura, x, F.height + .3, F.wallZ, false); }
      add(g, 'muro', 'Muro de la calle', 'el muro', { id: 'muro-calle-' + (i + 1) });
    }
    for (const pt of portadas()) {
      pon(crearPortada({ texto: pt.texto, flecha: '', colorMuro: C.fachada }), [pt.x, 0, F.wallZ], 0, 'pilar', 'Portada de ' + pt.texto.toLowerCase(), pt.voz, { id: 'portada-' + pt.id });
      const reja = crearReja(); reja.position.set(pt.x, 0, F.wallZ);
      add(reja, 'reja', 'Reja de la ' + pt.texto.toLowerCase(), 'la reja', { id: 'reja-' + pt.id, accion: () => { reja.userData.abierta = !reja.userData.abierta; onAccion('reja-' + pt.id, reja.userData.abierta); } });
      for (const s of [-1, 1]) pon(crearFarol(), [pt.pilares[s < 0 ? 0 : 1], F.gate.height + .55, F.wallZ + F.gate.pierDepth / 2], 0, 'farol', 'Farol de la portada', 'el farol', { detalle: 1 });
    }
    // Letrero del hostal en el muro (lado calle) y placa con la dirección.
    cartel({ ancho: 3.6, alto: 1.05, lineas: [{ texto: NOMBRE.hostal.toUpperCase(), tam: .42, color: C.crema, peso: 700 }, { texto: 'hostal · hostel · wifi · piscina', tam: .26, color: '#f0d9a4', fuente: 'system-ui, sans-serif', peso: 500 }] },
      [0, 1.85, F.wallZ + F.thickness / 2 + .03], 0, 'Letrero del hostal', 'el letrero', { id: 'letrero-muro' });
    cartel({ ancho: .56, alto: .24, fondo: '#1f4f8c', borde: C.crema, lineas: [{ texto: NOMBRE.direccion, tam: .5, color: C.crema, peso: 600, fuente: 'system-ui, sans-serif' }] },
      [F.gate.x + 1.95, 1.75, F.wallZ + F.thickness / 2 + .03], 0, 'Placa con la dirección: ' + NOMBRE.direccion, 'la placa de la dirección', { id: 'placa-direccion' });
    const timbre = new T.Group(); caja(timbre, 'placa', .08, .13, .02, C.metal, 0, 0, 0); esfera(timbre, 'boton', .018, C.crema, 0, 0, .015, false);
    pon(timbre, [F.gate.x + F.gate.clear / 2 + F.gate.pier + .2, 1.35, F.wallZ + F.thickness / 2 + .01], 0, 'timbre', 'Timbre de la entrada', 'el timbre', { id: 'timbre-calle', accion: () => onAccion('timbre-calle') });
  });

  // ── Suelos de la casa ───────────────────────────────────────────────────
  const hundido = rect(PATIO.x0 + .25, PATIO.z0 + .25, PATIO.x1 - .25, PATIO.z1 - .25);
  conZona('estructura', 0, () => {
    suelo(restar(INTERIOR, [hundido]), 0, 'barro', 'Piso de baldosa de barro', { id: 'piso-pb' });
    for (const [id, tex, et] of [['sala', 'hidraulica', 'Piso de baldosa hidráulica'], ['recepcion', 'hidraulica', 'Piso de baldosa hidráulica'], ['zaguan', 'laja', 'Piso de piedra del zaguán'], ['dorm1', 'tablas', 'Piso de madera'], ['cocina', 'hidraulica', 'Piso de baldosa hidráulica'], ['comedor', 'hidraulica', 'Piso de baldosa hidráulica']])
      suelo(cuarto(id).rect, .004, tex, et, { z: id === 'dorm1' ? 'dormitorio' : id === 'zaguan' ? 'recepcion' : id, id: 'piso-' + id });
    // Patio hundido 15 cm con sardinel de piedra en todo el borde y hueco de la piscina.
    conZona('patio', 0, () => {
      suelo(restar(hundido, [PISCINA]), -H.patio.drop, 'laja', 'Piso de piedra del patio', { id: 'piso-patio' });
      const borde = new T.Group(), b = .5, y0 = -H.patio.drop;
      for (const [w, d, x, z] of [[PATIO.x1 - PATIO.x0 + b, b, 0, PATIO.z0], [PATIO.x1 - PATIO.x0 + b, b, 0, PATIO.z1], [b, PATIO.z1 - PATIO.z0, PATIO.x0, (PATIO.z0 + PATIO.z1) / 2], [b, PATIO.z1 - PATIO.z0, PATIO.x1, (PATIO.z0 + PATIO.z1) / 2]])
        caja(borde, 'sardinel', w, H.patio.drop + .012, d, C.piedra, x, y0 + (H.patio.drop + .012) / 2, z, 'fino');
      add(borde, 'sardinel', 'Sardinel de piedra del patio', 'el sardinel');
      add(crearPiscina(PISCINA, -H.patio.drop), 'piscina', 'Piscina pequeña', 'la piscina', { id: 'piscina', optimizar: false, info: 'Piscina: 3,2 × 5 m y 1,3 m de profundidad. Dúchate antes de entrar.' });
      pon(crearEscalerilla(), [0, -H.patio.drop, PISCINA.z0 - .05], 0, 'escalerilla', 'Escalerilla de la piscina', 'la escalerilla', { id: 'escalerilla' });
    });
  });

  // ── Forjados y cubiertas ────────────────────────────────────────────────
  conZona('estructura', 1, () => {
    const vacioP1 = [rect(PATIO.x0, PATIO.z0, PATIO.x1, PATIO.z1), huecoEscalera()];
    const losa = new T.Group(), tablas = new T.Group(), madera = materialTextura('tablas');
    for (const rc of restar(INTERIOR, vacioP1)) { losa.add(crearLosa(rc, F1, H.slab, C.cal)); tablas.add(planoSuelo(rc, F1 + .002, madera)); }
    add(losa, 'techo', 'Entrepiso (techo de la planta baja)', 'el techo', { id: 'entrepiso' }); add(tablas, 'piso', 'Piso de madera de la planta alta', 'el piso', { id: 'piso-p1', optimizar: false });
  });
  conZona('azotea', 2, () => {
    const galeria = rect(-CARAS.side[0], CARAS.rear[0], CARAS.side[0], CARAS.front[1]), barro = materialTextura('barro');
    const losa = new T.Group(), piso = new T.Group();
    for (const rc of restar(INTERIOR, [galeria, huecoEscalera()])) { losa.add(crearLosa(rc, H.roofY, H.slab, C.cal)); piso.add(planoSuelo(rc, ROOF, barro)); }
    add(losa, 'techo', 'Cubierta (techo de la planta alta)', 'el techo', { id: 'cubierta' }); add(piso, 'piso', 'Piso de la azotea', 'el piso', { id: 'piso-azotea', optimizar: false });
    add(crearTejadillo(tejadillo()), 'techo', 'Tejadillo de teja sobre la galería', 'el tejado', { id: 'tejadillo', optimizar: false });
  });

  // ── Muros ───────────────────────────────────────────────────────────────
  const V = vanos(), alturaVano = v => v.tipo === 'puerta' ? DOOR.height + DOOR.transom : v.alto;
  const huecosDe = (muro, eje, extra = []) => [...V.filter(v => v.muro === muro && Math.abs(v.eje - eje) < .01).map(v => ({ pos: v.pos, ancho: v.ancho, alto: alturaVano(v), base: (v.planta || 0) * F1 })), ...extra];
  // Muros por PISO (PB, P1, pretil): la vista general oculta lo que está por encima de la planta baja.
  // Cada vano va al tramo que lo contiene entero; su base pasa a ser relativa al tramo.
  const muro = (id, etiqueta, o, z = 'estructura') => {
    const y0 = o.y0 || 0, y1 = y0 + o.alto, cortes = [...new Set([y0, ...[F1, H.roofY].filter(c => c > y0 + .01 && c < y1 - .01), y1])];
    for (let i = 0; i < cortes.length - 1; i++) {
      const a = cortes[i], b = cortes[i + 1], pl = a >= H.roofY - .01 ? 2 : a >= F1 - .01 ? 1 : 0;
      const huecos = (o.huecos || []).filter(h => (h.base || 0) >= a - .01 && (h.base || 0) + h.alto <= b + .01).map(h => ({ ...h, base: (h.base || 0) - a }));
      conZona(z, pl, () => add(crearMuro({ ...o, y0: a, alto: b - a, huecos, zocalo: i === 0 ? o.zocalo : null }), pl === 2 ? 'pretil' : 'muro', etiqueta, pl === 2 ? 'el pretil' : 'la pared', { id: cortes.length > 2 ? id + ['-pb', '-p1', '-pretil'][pl] : id }));
    }
  };
  const altoTotal = H.roofY + H.parapet;
  conZona('estructura', 0, () => {
    // Fachada (dos plantas): exterior amarillo con zócalo; interior encalado.
    const fach = [{ pos: 0, ancho: H.zaguan.door.width, alto: H.zaguan.door.height }, ...VENTANAS.fachadaPB.map(w => ({ pos: w.x, ancho: w.ancho, alto: w.alto, base: w.base })),
      ...VENTANAS.fachadaP1.map(w => ({ pos: w.x, ancho: w.ancho, alto: w.alto, base: F1 + w.base })), ...VENTANAS.balconP1.map(w => ({ pos: w.x, ancho: w.ancho, alto: w.alto, base: F1 }))];
    muro('muro-fachada', 'Fachada', { muro: 'z', eje: -e / 2, desde: -H.width / 2, hasta: H.width / 2, alto: H.roofY, grosor: e, colores: [C.cal, C.fachada], huecos: fach, zocalo: { alto: .9, color: C.zocalo, lados: [1] } });
    for (const s of [-1, 1]) muro('muro-lateral-' + (s < 0 ? 'oeste' : 'este'), 'Muro medianero', { muro: 'x', eje: s * (H.width / 2 - e / 2), desde: -e, hasta: -H.depth + e, alto: altoTotal, grosor: e, colores: [C.cal, C.cal] });
    muro('muro-fondo', 'Muro del fondo', { muro: 'z', eje: -H.depth + e / 2, desde: -H.width / 2, hasta: H.width / 2, alto: altoTotal, grosor: e, colores: [C.cal, C.cal] });
    // Muros de galería (dos plantas + pretil de la azotea): cara de galería en ocre claro con zócalo.
    const g = H.wall.gallery;
    muro('muro-galeria-norte', 'Muro de la galería', { muro: 'z', eje: H.frontWallZ, desde: -X, hasta: X, alto: H.roofY, grosor: g, colores: [C.calGaleria, C.cal], huecos: huecosDe('z', H.frontWallZ), zocalo: { alto: 1, color: C.zocalo, lados: [-1] } });
    muro('muro-galeria-sur', 'Muro de la galería', { muro: 'z', eje: H.rearWallZ, desde: -X, hasta: X, alto: H.roofY, grosor: g, colores: [C.cal, C.calGaleria], huecos: huecosDe('z', H.rearWallZ), zocalo: { alto: 1, color: C.zocalo, lados: [1] } });
    const vent = VENTANAS.dorm1Alta;
    muro('muro-galeria-oeste', 'Muro de la galería', { muro: 'x', eje: -H.sideWallX, desde: CARAS.front[1], hasta: CARAS.rear[0], alto: altoTotal, grosor: g, colores: [C.cal, C.calGaleria], huecos: huecosDe('x', -H.sideWallX, [{ pos: vent.pos, ancho: vent.ancho, alto: vent.alto, base: vent.base }]), zocalo: { alto: 1, color: C.zocalo, lados: [1] } });
    muro('muro-galeria-este', 'Muro de la galería', { muro: 'x', eje: H.sideWallX, desde: CARAS.front[1], hasta: CARAS.rear[0], alto: altoTotal, grosor: g, colores: [C.calGaleria, C.cal], huecos: huecosDe('x', H.sideWallX), zocalo: { alto: 1, color: C.zocalo, lados: [-1] } });
    // Pretil interior de la azotea: solo rodea el hueco de galería y patio (los lados ya lo tienen en los muros x = ±5,5).
    for (const [i, z] of [H.frontWallZ, H.rearWallZ].entries()) conZona('azotea', 2, () => add(crearMuro({ muro: 'z', eje: z, desde: -CARAS.side[1], hasta: CARAS.side[1], y0: H.roofY, alto: H.parapet, grosor: g, colores: [C.cal, C.cal] }), 'pretil', 'Pretil sobre el patio', 'el pretil', { id: 'pretil-patio-' + (i ? 'sur' : 'norte') }));
    // Tabiques por planta.
    const t = H.wall.int, zh = H.zaguan.half;
    for (const s of [-1, 1]) muro('tabique-zaguan-' + s, 'Tabique del zaguán', { muro: 'x', eje: s * zh, desde: -e, hasta: CARAS.front[0], alto: TECHO_PB, grosor: t, colores: [C.cal, C.cal], huecos: huecosDe('x', s * zh) });
    for (const [i, z] of H.west.entries()) muro('tabique-oeste-' + i, 'Tabique', { muro: 'z', eje: z, desde: -X, hasta: -CARAS.side[1], alto: TECHO_PB, grosor: t, colores: [C.cal, C.cal] });
    for (const [i, z] of H.east.entries()) muro('tabique-este-' + i, 'Tabique', { muro: 'z', eje: z, desde: CARAS.side[1], hasta: X, alto: TECHO_PB, grosor: t, colores: [C.cal, C.cal] });
    muro('tabique-cocina', 'Tabique entre cocina y comedor', { muro: 'x', eje: H.rearPB[0], desde: CARAS.rear[1], hasta: CARAS.zRearIn, alto: TECHO_PB, grosor: t, colores: [C.cal, C.cal], huecos: huecosDe('x', H.rearPB[0]) });
    // P1
    const p1 = o => ({ ...o, y0: F1, alto: F1 - H.slab, grosor: t, colores: [C.cal, C.cal] });
    muro('tabique-p1-frente', 'Tabique', p1({ muro: 'x', eje: H.frontP1[0], desde: -e, hasta: CARAS.front[0] }));
    muro('tabique-p1-oeste', 'Tabique', p1({ muro: 'z', eje: H.west[0], desde: -X, hasta: -CARAS.side[1] }));
    for (const [i, z] of H.east.entries()) muro('tabique-p1-este-' + i, 'Tabique', p1({ muro: 'z', eje: z, desde: CARAS.side[1], hasta: X }));
    for (const [i, x] of H.rearP1.entries()) muro('tabique-p1-fondo-' + i, 'Tabique', p1({ muro: 'x', eje: x, desde: CARAS.rear[1], hasta: CARAS.zRearIn }));
  });
  // Caseta de la escalera en la azotea: cuatro muros sobre el cuarto de la escalera y puerta al norte.
  conZona('azotea', 2, () => {
    const hC = 3.9, zN = H.frontWallZ, zS = H.east[0], yTope = ROOF + hC, sobre = H.roofY + H.parapet;
    add(crearMuro({ muro: 'z', eje: zN, desde: CARAS.side[1], hasta: X, y0: H.roofY, alto: yTope - H.roofY, grosor: H.wall.gallery, colores: [C.cal, C.cal], huecos: [{ pos: CASETA_PUERTA, ancho: DOOR.width, alto: DOOR.height + DOOR.transom, base: ROOF - H.roofY }] }), 'muro', 'Caseta de la escalera', 'la caseta', { id: 'caseta-norte' });
    add(crearMuro({ muro: 'z', eje: zS, desde: CARAS.side[1], hasta: X, y0: H.roofY, alto: yTope - H.roofY, grosor: H.wall.int, colores: [C.cal, C.cal] }), 'muro', 'Caseta de la escalera', 'la caseta', { id: 'caseta-sur' });
    for (const [lado, xx, gr] of [['oeste', H.sideWallX, H.wall.gallery], ['este', H.width / 2 - e / 2, e]]) add(crearMuro({ muro: 'x', eje: xx, desde: CARAS.front[1], hasta: zS - H.wall.int / 2, y0: sobre, alto: yTope - sobre, grosor: gr, colores: [C.cal, C.cal] }), 'muro', 'Caseta de la escalera', 'la caseta', { id: 'caseta-' + lado });
    add(crearLosa(rect(H.sideWallX - .2, zS - .15, H.width / 2, zN + .25), yTope + .15, .15, C.cal), 'techo', 'Techo de la caseta', 'el techo', { id: 'caseta-techo' });
    const puerta = crearPuertaColonial({ grosor: H.wall.gallery, rotulo: 'ESCALERA', abierta: true }); puerta.position.set(CASETA_PUERTA, ROOF, zN);
    add(puerta, 'puerta', 'Puerta de la azotea', 'la puerta de la azotea', { id: 'puerta-azotea' });
  });

  // ── Arcos, puertas y portón ─────────────────────────────────────────────
  const grosorDe = v => v.muro === 'z' ? (Math.abs(v.eje + e / 2) < .01 ? e : H.wall.gallery) : (Math.abs(Math.abs(v.eje) - H.sideWallX) < .01 ? H.wall.gallery : H.wall.int);
  const situar = (root, v) => { const y = (v.planta || 0) * F1; if (v.muro === 'z') { root.position.set(v.pos, y, v.eje); root.rotation.y = v.cara > 0 ? 0 : Math.PI; } else { root.position.set(v.eje, y, v.pos); root.rotation.y = v.cara > 0 ? Math.PI / 2 : -Math.PI / 2; } return root; };
  for (const v of V) {
    const zonaV = v.id === 'puerta-dorm1' ? 'galeria-pb' : v.planta ? 'galeria' : v.id.includes('cocina') ? 'cocina' : v.id.includes('comedor') ? 'comedor' : v.id.includes('sala') ? 'sala' : v.id.includes('zaguan') || v.id === 'porton' ? 'recepcion' : 'patio';
    conZona(zonaV === 'galeria-pb' ? 'patio' : zonaV, v.planta || 0, () => {
      const enGaleria = v.muro === 'z' ? [H.frontWallZ, H.rearWallZ].some(z => Math.abs(v.eje - z) < .01) : Math.abs(Math.abs(v.eje) - H.sideWallX) < .01;
      if (v.tipo === 'arco') add(situar(crearArco({ ancho: v.ancho, alto: v.alto, grosor: grosorDe(v) + .002, color: enGaleria ? C.calGaleria : C.cal }), v), 'arco', v.etiqueta, v.voz, { id: v.id });
      else if (v.tipo === 'porton') {
        const p = situar(crearPorton({ ancho: v.ancho, alto: v.alto }), v); p.position.z = -e / 2; add(p, 'porton', 'Portón de madera de la entrada', 'el portón', { id: 'porton', accion: () => { p.userData.abierta = !p.userData.abierta; onAccion('porton', p.userData.abierta); } });
      } else {
        const d = situar(crearPuertaColonial({ grosor: grosorDe(v), numero: v.numero, rotulo: v.rotulo, sub: v.sub, abierta: v.abierta }), v);
        add(d, 'puerta', v.etiqueta, v.voz, { id: v.id, info: v.info, accion: () => { if (v.real || v.abierta) { d.userData.abierta = !d.userData.abierta; onAccion(v.id, d.userData.abierta); } else onAccion('ocupada', v); } });
      }
    });
  }

  // ── Fachada: ventanas, balcones, molduras, nombre, faroles ──────────────
  conZona('delantero', 0, () => {
    for (const w of VENTANAS.fachadaPB) pon(crearVentanaReja({ ancho: w.ancho, alto: w.alto }), [w.x, w.base, 0], 0, 'ventana', 'Ventana con reja de madera', 'la ventana', { detalle: 1 });
    for (const w of VENTANAS.fachadaP1) pon(crearVentanaBalconera({ ancho: w.ancho, alto: w.alto }), [w.x, F1 + w.base, 0], 0, 'ventana', 'Ventana con postigos', 'la ventana', { p: 1 });
    for (const w of VENTANAS.balconP1) { pon(crearVentanaBalconera({ ancho: w.ancho, alto: w.alto }), [w.x, F1, 0], 0, 'ventana', 'Puerta balconera', 'la puerta del balcón', { p: 1 });
      pon(crearBalconMadera({ ancho: w.balcon, fondo: .95, techo: 3.1 }), [w.x, F1, 0], 0, 'balcon', 'Balcón de madera', 'el balcón', { p: 1 }); }
    const mold = new T.Group();
    caja(mold, 'imposta', H.width + .1, .2, .1, C.moldura, 0, F1, .05, 'fino');
    caja(mold, 'cornisa', H.width + .3, .3, .3, C.moldura, 0, H.roofY - .15, .15, 'fino');
    caja(mold, 'cornisa-filete', H.width + .4, .1, .38, C.moldura, 0, H.roofY + .05, .19, false);
    for (const s of [-1, 1]) caja(mold, 'pilastra-esquina', .5, H.roofY, .08, C.fachadaSombra, s * (H.width / 2 - .25), H.roofY / 2, .04, 'fino');
    // Portada de piedra alrededor del portón.
    const D0 = H.zaguan.door; for (const s of [-1, 1]) caja(mold, 'jamba-portada', .3, D0.height + .3, .12, C.piedra, s * (D0.width / 2 + .15), (D0.height + .3) / 2, .06, 'fino');
    caja(mold, 'dintel-portada', D0.width + .9, .3, .14, C.piedra, 0, D0.height + .3 + .15, .07, 'fino'); caja(mold, 'clave', .3, .42, .18, C.piedra, 0, D0.height + .3, .09, false);
    add(mold, 'moldura', 'Molduras de la fachada', 'la cornisa', { id: 'molduras-fachada' });
    // Pretil con balaustrada sobre la cornisa (frente de la azotea).
    const pre = new T.Group(), y0 = H.roofY + .1, hP = H.parapet - .1, nP = 7;
    for (let i = 0; i <= nP; i++) caja(pre, 'pilar-pretil', .4, hP, e, C.fachada, -H.width / 2 + .2 + i * (H.width - .4) / nP, y0 + hP / 2, -e / 2, 'fino');
    caja(pre, 'albardilla', H.width + .1, .1, e + .1, C.moldura, 0, y0 + hP + .05, -e / 2, false);
    caja(pre, 'zocalo-pretil', H.width, .15, e, C.fachada, 0, y0 + .075, -e / 2, false);
    for (let i = 0; i < nP; i++) { const a = -H.width / 2 + .4 + i * (H.width - .4) / nP, b = a + (H.width - .4) / nP - .4, n = Math.round((b - a) / .16);
      for (let k = 0; k < n; k++) cilindro(pre, 'balaustre', .045, hP - .25, C.moldura, a + (k + .5) * (b - a) / n, y0 + .15 + (hP - .25) / 2, -e / 2, false, 8); }
    add(pre, 'pretil', 'Pretil con balaustrada', 'el pretil', { id: 'pretil-fachada', p: 2, z: 'azotea' });
    const nombre = crearTextoPintado({ ancho: 6.6, alto: .62, lineas: [{ texto: NOMBRE.hostal.toUpperCase(), tam: .9, color: C.postigoOscuro, peso: 700 }] });
    // Franja libre entre las ventanas altas (tope 7,3 m) y la cornisa (8,25 m).
    pon(nombre, [0, (F1 + VENTANAS.fachadaP1[0].base + VENTANAS.fachadaP1[0].alto + H.roofY - .3) / 2, .005], 0, 'cartel', 'Nombre pintado en la fachada', 'el nombre del hostal', { id: 'nombre-fachada', optimizar: false });
    for (const s of [-1, 1]) pon(crearFarol(), [s * (D0.width / 2 + .75), 3.05, 0], 0, 'farol', 'Farol colonial', 'el farol', { detalle: 1 });
    // Letrero colgante perpendicular a la fachada.
    const bandera = new T.Group(); barra(bandera, 'brazo', [0, 0, 0], [0, 0, .95], .04, C.hierro, false); for (const z of [.25, .85]) barra(bandera, 'cadena', [0, 0, z], [0, -.12, z], .015, C.hierro, false);
    const letrero = crearCartel({ ancho: .85, alto: .55, lineas: [{ texto: 'HOSTAL', tam: .4, color: C.crema, peso: 700 }, { texto: 'hostel · rooms', tam: .24, color: '#f0d9a4', fuente: 'system-ui, sans-serif' }] });
    letrero.rotation.y = Math.PI / 2; letrero.position.set(0, -.42, .55); bandera.add(letrero);
    pon(bandera, [3.05, 3.55, 0], 0, 'cartel', 'Letrero colgante del hostal', 'el letrero', { id: 'letrero-colgante', optimizar: false });
    pon(M.crearAlfombra({ ancho: 1.4, fondo: .8 }), [0, .006, -1.0], 0, 'tapete', 'Tapete de bienvenida', 'el tapete', { z: 'recepcion' });
  });

  // ── Columnas, vigas, barandas de la galería ─────────────────────────────
  const plan = tejadillo(), viga = .22;
  conZona('patio', 0, () => {
    for (const [x, z] of columnas()) {
      pon(crearColumnaPiedra({ alto: TECHO_PB - viga - .14 }), [x, 0, z], 0, 'columna', 'Columna de piedra', 'la columna');
      for (const rot of (Math.abs(Math.abs(x) - H.patio.x) < .01 && (Math.abs(z - H.patio.front) < .01 || Math.abs(z - H.patio.rear) < .01)) ? [0, Math.PI / 2] : [Math.abs(Math.abs(x) - H.patio.x) < .01 ? Math.PI / 2 : 0])
        pon(crearZapata(), [x, TECHO_PB - viga - .14, z], rot, 'zapata', 'Zapata de madera', 'la zapata', { detalle: 1 });
    }
    const v = new T.Group(), { x, front, rear } = H.patio;
    for (const zz of [front, rear]) caja(v, 'viga', 2 * x + .4, viga, .26, C.maderaOscura, 0, TECHO_PB - viga / 2, zz, 'fino');
    for (const s of [-1, 1]) caja(v, 'viga', .26, viga, rear - front - .4 + .8, C.maderaOscura, s * x, TECHO_PB - viga / 2, (front + rear) / 2, 'fino');
    for (const zz of [front, rear]) caja(v, 'canto', 2 * x, H.slab + .02, .1, C.maderaOscura, 0, F1 - H.slab / 2, zz + (zz === front ? -.0 : 0), false);
    add(v, 'viga', 'Vigas de madera de la galería', 'la viga', { id: 'vigas-pb' });
    // Hamacas colgadas de las columnas del tramo central de cada lado largo.
    const zs = zsLargas();
    for (const s of [-1, 1]) add(M.crearHamaca([s * x, 2.25, zs[1] - .22], [s * x, 2.25, zs[2] + .22], { comba: .95 }), 'hamaca', 'Hamaca colombiana', 'la hamaca', { id: 'hamaca-patio-' + (s < 0 ? 'oeste' : 'este') });
    // Faroles de pared en la galería.
    for (const [px, pz, rot] of [[-CARAS.side[0], -12, Math.PI / 2], [-CARAS.side[0], -17.1, Math.PI / 2], [CARAS.side[0], -11.5, -Math.PI / 2], [CARAS.side[0], -16.6, -Math.PI / 2], [2.4, CARAS.front[1], Math.PI], [-1.9, CARAS.front[1], Math.PI], [-1.5, CARAS.rear[0], 0]])
      pon(crearFarol(), [px, 2.75, pz], rot, 'farol', 'Farol de la galería', 'el farol', { detalle: 1 });
    pon(M.crearBanca({ largo: 1.5 }), [3.3, 0, CARAS.front[1] - .3], Math.PI, 'banca', 'Banca de madera', 'la banca', { sombra: true });
    pon(M.crearCuadro({ ancho: 1.2, alto: .8, motivo: 1 }), [-CARAS.side[0] + .016, 1.75, -12.7], Math.PI / 2, 'cuadro', 'Cuadro', 'el cuadro', { detalle: 1 });
    pon(M.crearCuadro({ ancho: 1.2, alto: .8, motivo: 2 }), [CARAS.side[0] - .016, 1.75, -12.2], -Math.PI / 2, 'cuadro', 'Cuadro', 'el cuadro', { detalle: 1 });
    // Patio: asoleadoras, mesa con sombrilla, ducha y cartel de la piscina.
    const yP = -H.patio.drop;
    for (const s of [-1, 1]) pon(M.crearAsoleadora(), [s * 2.45, yP, PISCINA.z0 + 2.3], 0, 'asoleadora', 'Asoleadora', 'la asoleadora', { sombra: true });
    pon(M.crearMesa({ ancho: .8, redonda: true, alto: .74 }), [-1.7, yP, -10.2], 0, 'mesa', 'Mesa del patio', 'la mesa', { sombra: true });
    for (const [dx, dz, r] of [[-.75, 0, Math.PI / 2], [.75, 0, -Math.PI / 2], [0, .75, Math.PI]]) pon(M.crearSilla({ asiento: C.tela3 }), [-1.7 + dx, yP, -10.2 + dz], r, 'silla', 'Silla del patio', 'la silla');
    pon(M.crearSombrilla(), [-1.7, yP + .74, -10.2], 0, 'sombrilla', 'Sombrilla', 'la sombrilla', { detalle: 1 });
    pon(M.crearDucha(), [2.55, yP, -17.9], 0, 'ducha', 'Ducha de la piscina', 'la ducha');
    cartel({ ancho: .9, alto: .62, lineas: [{ texto: 'PISCINA', tam: .3, color: C.crema, peso: 700 }, { texto: 'Dúchate antes de entrar', tam: .16, color: '#f0d9a4', fuente: 'system-ui, sans-serif' }, { texto: 'No hay salvavidas · No correr', tam: .16, color: '#f0d9a4', fuente: 'system-ui, sans-serif' }, { texto: 'Horario: 7 a. m. – 9 p. m.', tam: .16, color: C.crema, fuente: 'system-ui, sans-serif' }] },
      [2.05, 1.65, CARAS.rear[0] + .02], 0, 'Cartel de normas de la piscina', 'el cartel de la piscina', { id: 'cartel-piscina' });
  });
  conZona('galeria', 1, () => {
    const yC = plan.yColumna - .1, hPost = yC - F1 - viga - .14;
    for (const [x, z] of columnas()) pon(crearPieDerecho({ alto: hPost }), [x, F1, z], 0, 'columna', 'Pie derecho de madera', 'el pie derecho');
    const v = new T.Group(), { x, front, rear } = H.patio;
    for (const zz of [front, rear]) caja(v, 'viga', 2 * x + .3, viga, .2, C.maderaOscura, 0, yC - viga / 2, zz, 'fino');
    for (const s of [-1, 1]) caja(v, 'viga', .2, viga, rear - front - .3 + .6, C.maderaOscura, s * x, yC - viga / 2, (front + rear) / 2, 'fino');
    add(v, 'viga', 'Vigas de la galería alta', 'la viga', { id: 'vigas-p1' });
    for (const [px, pz] of columnas()) pon(crearZapata(), [px, yC - viga - .14, pz], Math.abs(Math.abs(px) - x) < .01 ? Math.PI / 2 : 0, 'zapata', 'Zapata', 'la zapata', { detalle: 1 });
    // Barandas entre pies derechos (todo el perímetro del patio).
    const xs = xsCortas(), zs = zsLargas(), h = .12;
    const tramos = [...[front, rear].flatMap(zz => xs.slice(0, -1).map((a, i) => [[a + h, zz], [xs[i + 1] - h, zz]])), ...[-x, x].flatMap(xx => zs.slice(0, -1).map((a, i) => [[xx, a - h], [xx, zs[i + 1] + h]]))];
    for (const [a, b] of tramos) add(crearBaranda(a, b, F1), 'baranda', 'Baranda de madera', 'la baranda');
    for (const [px, pz, rot] of [[-CARAS.side[0], -13.6, Math.PI / 2], [CARAS.side[0], -16.3, -Math.PI / 2], [-1.6, CARAS.front[1], Math.PI], [2.6, CARAS.rear[0], 0]]) pon(crearFarol(), [px, F1 + 2.75, pz], rot, 'farol', 'Farol de la galería', 'el farol', { detalle: 1 });
    pon(M.crearBanca({ largo: 1.4 }), [-CARAS.side[0] + .3, F1, -13.9], Math.PI / 2, 'banca', 'Banca de la galería', 'la banca', { sombra: true });
  });

  // ── Escalera (PB → P1 → azotea) ─────────────────────────────────────────
  conZona('patio', 0, () => {
    const llegada = y => [[CARAS.side[1], STAIRZ()], [escalera(0).xb[0], STAIRZ()], y];
    add(crearEscalera(escalera(0), 0, { barandaLlegada: llegada(F1) }), 'escalera', 'Escalera (planta baja → planta alta)', 'la escalera', { id: 'escalera-pb', info: 'Escalera a la planta alta y a la azotea.' });
    add(crearEscalera(escalera(F1), F1, { barandaLlegada: llegada(ROOF) }), 'escalera', 'Escalera (planta alta → azotea)', 'la escalera', { id: 'escalera-p1', p: 1, z: 'galeria' });
  });

  // ── Recepción y zaguán ──────────────────────────────────────────────────
  conZona('recepcion', 0, () => {
    const rc = cuarto('recepcion').rect, zc = -3.6;
    pon(M.crearMostrador({ largo: 3 }), [6.8, 0, zc], -Math.PI / 2, 'mostrador', 'Mostrador de recepción', 'el mostrador', { id: 'mostrador', sombra: true, accion: () => onAccion('checkin') });
    pon(M.crearTimbre(), [6.6, 1.05, zc + 1.05], 0, 'timbre', 'Timbre de recepción', 'el timbre', { id: 'timbre-recepcion', accion: () => onAccion('timbre') });
    pon(M.crearLibroRegistro(), [6.66, 1.05, zc], -Math.PI / 2, 'libro', 'Libro de registro', 'el libro de registro', { id: 'libro-registro', accion: () => onAccion('checkin') });
    pon(M.crearDatafono(), [6.7, 1.05, zc - .95], -Math.PI / 2, 'datafono', 'Datáfono (pago con tarjeta)', 'el datáfono');
    pon(M.crearComputador(), [7.0, 1.05, zc - .45], Math.PI / 2, 'computador', 'Computador de recepción', 'el computador');
    pon(M.crearTableroLlaves(), [rc.x1 - .02, 1.65, -3.0], -Math.PI / 2, 'llaves', 'Tablero de llaves', 'el tablero de llaves');
    pon(M.crearReloj(), [rc.x1 - .02, 2.75, -4.6], -Math.PI / 2, 'reloj', 'Reloj de pared', 'el reloj');
    const piz = pon(crearPizarraPrecios({ ancho: 2.2, alto: 1.5 }), [4.4, 1.85, rc.z0 + .03], 0, 'pizarra', 'Pizarra de precios y servicios', 'la pizarra de precios', { id: 'pizarra-precios', optimizar: false, accion: () => onAccion('precios') });
    mundo.userData.pizarra = piz;
    cartel({ ancho: .7, alto: .4, fondo: C.crema, borde: C.postigoOscuro, lineas: [{ texto: 'WIFI GRATIS', tam: .3, color: C.postigoOscuro, peso: 700, fuente: 'system-ui, sans-serif' }, { texto: 'Red: HostalSantaMarta', tam: .2, color: C.tinta, fuente: 'system-ui, sans-serif' }, { texto: 'Clave: bienvenidos', tam: .2, color: C.tinta, fuente: 'system-ui, sans-serif' }] },
      [2.5, 1.7, rc.z0 + .03], 0, 'Cartel del wifi', 'el cartel del wifi', { id: 'cartel-wifi' });
    // Mapa de la ciudad pintado (mar, calles, «usted está aquí»).
    const mapa = new T.Group(); caja(mapa, 'marco', 1.06, .76, .03, C.maderaOscura, 0, 0, 0, false);
    const tex = lienzoCartel(1, .7, (g, W, Hh) => { g.fillStyle = '#efe6cf'; g.fillRect(0, 0, W, Hh); g.fillStyle = '#7fc2d0'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * .35, 0); g.quadraticCurveTo(W * .2, Hh * .5, W * .3, Hh); g.lineTo(0, Hh); g.fill();
      g.strokeStyle = '#c9b48f'; g.lineWidth = 6; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(W * .3 + i * W * .09, 0); g.lineTo(W * .3 + i * W * .09, Hh); g.stroke(); g.beginPath(); g.moveTo(W * .3, i * Hh / 7); g.lineTo(W, i * Hh / 7); g.stroke(); }
      g.fillStyle = '#d8483b'; g.beginPath(); g.arc(W * .66, Hh * .55, 12, 0, 7); g.fill(); g.font = '600 26px system-ui'; g.fillStyle = '#2f3b36'; g.fillText('Usted está aquí', W * .66 + 18, Hh * .55 + 9); g.font = '700 30px Georgia'; g.fillText('SANTA MARTA', W * .45, 40); g.fillStyle = '#2f6f6c'; g.font = 'italic 24px Georgia'; g.fillText('Mar Caribe', 20, Hh * .5); }, 512);
    const mm = new T.MeshBasicMaterial({ map: tex }); const lam = new T.Mesh(new T.PlaneGeometry(1, .7), mm); lam.position.z = .017; mapa.add(lam);
    pon(mapa, [5.7, 1.85, rc.z1 - .02], Math.PI, 'mapa', 'Mapa de la ciudad', 'el mapa de la ciudad', { optimizar: false });
    pon(M.crearConsigna({ ancho: 1.6 }), [rc.x0 + .3, 0, -1.55], Math.PI / 2, 'consigna', 'Consigna de equipaje', 'la consigna de equipaje', { sombra: true });
    for (const [y, dz, col] of [[.135, -.35, C.tela4], [.135, .35, C.tela1], [.835, 0, C.tela3]]) pon(M.crearMochila({ color: col, alto: y > .5 ? .55 : .62 }), [rc.x0 + .3, y, -1.55 + dz], Math.PI / 2, 'mochila', 'Mochila guardada', 'la mochila');
    pon(M.crearBanca({ largo: 1.4 }), [4.0, 0, rc.z1 - .3], Math.PI, 'banca', 'Banca de espera', 'la banca', { sombra: true });
    techoCuarto('recepcion', rc, [[5.7, -3.6]]);
    // Zaguán: banca, tapete y rótulos sobre los arcos.
    const zg = cuarto('zaguan').rect;
    pon(M.crearBanca({ largo: 1.5 }), [zg.x0 + .25, 0, -1.6], Math.PI / 2, 'banca', 'Banca del zaguán', 'la banca', { sombra: true });
    for (const [s, txt, voz] of [[1, 'RECEPCIÓN', 'el letrero de la recepción'], [-1, 'SALA COMÚN', 'el letrero de la sala']]) cartel({ ancho: 1.3, alto: .3, lineas: [{ texto: txt, tam: .62, color: C.crema, peso: 700 }] }, [s * (zg.x1 - .01), 3.3, -3.6], s > 0 ? -Math.PI / 2 : Math.PI / 2, 'Letrero ' + txt.toLowerCase(), voz);
    const farol = new T.Group(); barra(farol, 'cadena', [0, 0, 0], [0, -.55, 0], .02, C.hierro, false); caja(farol, 'techo', .34, .06, .34, C.hierro, 0, -.58, 0); caja(farol, 'cuerpo', .26, .4, .26, '#ffe2a6', 0, -.82, 0, false); caja(farol, 'base', .3, .05, .3, C.hierro, 0, -1.04, 0);
    pon(farol, [0, TECHO_PB, -3.6], 0, 'lampara', 'Farol colgante del zaguán', 'el farol').userData.cielo = true;
  });

  // ── Sala común ──────────────────────────────────────────────────────────
  conZona('sala', 0, () => {
    const rc = cuarto('sala').rect, zc = -3.6;
    pon(M.crearTelevisor({ ancho: 1.3 }), [rc.x0 + .02, 1.55, zc], Math.PI / 2, 'televisor', 'Televisor', 'el televisor');
    pon(M.crearAlfombra({ ancho: 3, fondo: 2.2 }), [-6.3, .006, zc], Math.PI / 2, 'alfombra', 'Alfombra tejida', 'la alfombra');
    pon(M.crearSofa({ ancho: 2.2, color: C.tela3 }), [-4.5, 0, zc], -Math.PI / 2, 'sofa', 'Sofá', 'el sofá', { sombra: true });
    pon(M.crearSofa({ ancho: 1.8, color: C.tela4 }), [-6.5, 0, rc.z1 - .55], Math.PI, 'sofa', 'Sofá', 'el sofá', { sombra: true });
    pon(M.crearMesa({ ancho: 1.0, fondo: .55, alto: .42, color: C.madera }), [-6.3, 0, zc], Math.PI / 2, 'mesa', 'Mesa de centro', 'la mesa de centro', { sombra: true });
    pon(M.crearEstanteria({ ancho: 1.8, alto: 2.1 }), [-7.7, 0, rc.z0 + .18], 0, 'estanteria', 'Estantería de intercambio de libros', 'la estantería', { sombra: true });
    cartel({ ancho: 1.7, alto: .36, fondo: C.crema, borde: C.postigoOscuro, lineas: [{ texto: 'INTERCAMBIO DE LIBROS', tam: .42, color: C.postigoOscuro, peso: 700, fuente: 'system-ui, sans-serif' }, { texto: 'Deja uno, llévate uno', tam: .3, color: C.tinta, fuente: 'system-ui, sans-serif' }] },
      [-7.7, 2.45, rc.z0 + .03], 0, 'Cartel de intercambio de libros', 'el cartel');
    pon(M.crearGuitarra(), [-9.05, 0, rc.z0 + .55], .5, 'guitarra', 'Guitarra', 'la guitarra');
    pon(M.crearMesa({ ancho: .85, fondo: .85 }), [-3.05, 0, -1.55], 0, 'mesa', 'Mesa de juegos', 'la mesa', { sombra: true });
    for (const [dx, dz, r] of [[-.6, 0, Math.PI / 2], [.6, 0, -Math.PI / 2]]) pon(M.crearSilla({ asiento: C.tela2 }), [-3.05 + dx, 0, -1.55 + dz], r, 'silla', 'Silla', 'la silla');
    pon(M.crearJuegoMesa(), [-3.05, .75, -1.55], .3, 'juegos', 'Juegos de mesa', 'los juegos de mesa');
    pon(M.crearLamparaPie(), [-9.1, 0, -1.0], 0, 'lampara', 'Lámpara de pie', 'la lámpara');
    pon(M.crearCuadro({ ancho: .85, alto: .6, motivo: 0 }), [-5.45, 1.75, rc.z0 + .02], 0, 'cuadro', 'Cuadro', 'el cuadro', { detalle: 1 });
    techoCuarto('sala', rc, [[-5.7, -3.6]]);
  });

  // ── Dormitorio 1 (la única habitación real) ─────────────────────────────
  conZona('dormitorio', 0, () => {
    const rc = cuarto('dorm1').rect, cols = [C.cobija, C.tela1, C.tela3, C.tela4], rot = new T.Vector3();
    for (const [i, L] of literas().entries()) {
      const g = L.pasillo > 0 ? 0 : Math.PI, rotar = (lx, ly, lz) => rot.set(lx, ly, lz).applyAxisAngle(new T.Vector3(0, 1, 0), g).add(new T.Vector3(L.x, 0, L.z)).toArray();
      const lit = crearLitera(), { ancho: w, largo: lg } = lit.userData.huella, n = i * 2;
      pon(lit, [L.x, 0, L.z], g, 'litera', 'Litera (camas ' + (n + 1) + ' y ' + (n + 2) + ')', 'la litera', { id: L.id, sombra: true });
      for (const [k, deck] of [B.lowerDeck, B.upperDeck].entries()) {
        const cama = n + k + 1, top = deck + B.mattress;
        pon(crearAlmohada(), rotar(0, top, -lg / 2 + .32), g, 'almohada', 'Almohada (cama ' + cama + ')', 'la almohada');
        pon(crearCobija({ color: cols[(i + k) % 4] }), rotar(0, top + .02, lg / 2 - .38), g, 'cobija', 'Cobija (cama ' + cama + ')', 'la cobija');
        const hRod = k ? B.top - .12 : B.upperDeck - .2, caida = hRod - top - .05;
        pon(crearCortina({ ancho: .55 + (cama % 3) * .12, caida }), rotar(w / 2 + .03, hRod, -lg / 2 + .45), g + Math.PI / 2, 'cortina', 'Cortina (cama ' + cama + ')', 'la cortina');
        pon(crearLamparaLectura(), rotar(.28, top + .42, -lg / 2 + .075), g, 'lampara', 'Lámpara de lectura y enchufe (cama ' + cama + ')', 'la lámpara de lectura', { detalle: 1 });
        pon(crearCasillero({ ancho: (lg - .24) / 2 }), rotar(w / 2 - B.locker.depth / 2 - .06, 0, (k ? 1 : -1) * (lg - .2) / 4), g + Math.PI / 2, 'casillero', 'Casillero con candado (cama ' + cama + ')', 'el casillero', { info: 'Casillero de la cama ' + cama + ': se cierra con candado. En recepción venden candados.' });
      }
    }
    pon(M.crearMochila({ color: C.tela2 }), [-8.75, 0, rc.z1 - .35], Math.PI, 'mochila', 'Mochila', 'la mochila');
    pon(crearPerchero(), [-8.6, 1.75, rc.z1 - .02], Math.PI, 'perchero', 'Perchero', 'el perchero');
    pon(crearEspejo(), [-7.4, 1.5, rc.z1 - .02], Math.PI, 'espejo', 'Espejo', 'el espejo');
    cartel({ ancho: .8, alto: .52, fondo: C.crema, borde: C.cortina, lineas: [{ texto: 'SILENCIO', tam: .32, color: C.cortina, peso: 700, fuente: 'system-ui, sans-serif' }, { texto: HORARIOS.silencio, tam: .2, color: C.tinta, fuente: 'system-ui, sans-serif' }, { texto: 'Apaga la luz al salir', tam: .18, color: C.tinta, fuente: 'system-ui, sans-serif' }] },
      [-7.62, 1.75, rc.z0 + .02], 0, 'Cartel de horas de silencio', 'el cartel de silencio', { id: 'cartel-silencio' });
    // Ventanuco enrejado sobre las literas (muro de la galería).
    const vt = VENTANAS.dorm1Alta, ven = new T.Group(); caja(ven, 'vidrio', .02, vt.alto, vt.ancho, C.vidrio, 0, vt.alto / 2, 0, false);
    for (let i = 1; i < 6; i++) cilindro(ven, 'barrote', .015, vt.alto, C.maderaOscura, .05, vt.alto / 2, -vt.ancho / 2 + i * vt.ancho / 6, false, 6);
    pon(ven, [-H.sideWallX, vt.base, vt.pos], 0, 'ventana', 'Ventana alta con reja', 'la ventana');
    techoCuarto('dormitorio', rc, [[-7.6, -10.1]]);
  });

  // ── Cocina compartida ───────────────────────────────────────────────────
  conZona('cocina', 0, () => {
    const rc = cuarto('cocina').rect, zb = rc.z0 + .3;
    for (const [i, z] of [-21.75, -22.5].entries()) pon(K.crearNevera({ color: i ? '#e8ece9' : '#f2efe8' }), [rc.x0 + .35, 0, z - .03 * i], Math.PI / 2, 'nevera', 'Nevera ' + (i + 1), 'la nevera', { sombra: true });
    const fila = [['mueble', 1.6], ['estufa', .6], ['mueble', 1.2], ['lavaplatos', 1.0], ['mueble', 1.8]]; let x = rc.x0;
    for (const [tipo, w] of fila) { const cx = x + w / 2;
      if (tipo === 'mueble') pon(K.crearMuebleBajo({ largo: w }), [cx, 0, zb], 0, 'mueble', 'Mueble de cocina', 'el mueble de cocina');
      else if (tipo === 'estufa') pon(K.crearEstufa(), [cx, 0, zb], 0, 'estufa', 'Estufa de gas', 'la estufa', { id: 'estufa' });
      else pon(K.crearLavaplatos({ largo: w }), [cx, 0, zb], 0, 'mueble', 'Lavaplatos', 'el lavaplatos', { id: 'lavaplatos' });
      x += w; }
    const xE = rc.x0 + 1.6 + .3;
    // Sobre el último mueble (−5,2 … −3,4): cafetera, escurridor y microondas, sin tapar la poceta.
    pon(K.crearCafetera(), [-4.95, .9, zb - .1], 0, 'cafetera', 'Cafetera', 'la cafetera');
    pon(K.crearEscurridor(), [-4.35, .9, zb], 0, 'escurridor', 'Escurridor de platos', 'el escurridor');
    pon(K.crearMicroondas(), [-3.72, .9, zb - .05], 0, 'microondas', 'Microondas', 'el microondas');
    pon(K.crearGabineteAlto({ largo: 1.4 }), [rc.x0 + .8, 1.5, rc.z0 + .18], 0, 'gabinete', 'Gabinetes', 'los gabinetes');
    const campana = new T.Group(); caja(campana, 'campana', .7, .35, .5, '#c8cdcf', 0, .175, 0); caja(campana, 'chimenea', .25, .9, .25, '#c8cdcf', 0, .8, -.1);
    pon(campana, [xE, 1.65, rc.z0 + .25], 0, 'campana', 'Campana extractora', 'la campana');
    pon(K.crearOllasColgadas({ largo: 1.1 }), [xE + 1.15, 1.85, rc.z0], 0, 'ollas', 'Ollas y sartenes', 'las ollas');
    pon(K.crearGabineteAlto({ largo: 2.0 }), [xE + 2.95, 1.5, rc.z0 + .18], 0, 'gabinete', 'Gabinetes', 'los gabinetes');
    pon(M.crearMesa({ ancho: 1.8, fondo: .8, alto: .9, color: '#e9e2d2' }), [-5.6, 0, -23.3], 0, 'mesa', 'Mesa de trabajo', 'la mesa de trabajo', { sombra: true });
    for (const dx of [-.5, .5]) pon(M.crearTaburete(), [-5.6 + dx, 0, -22.65], 0, 'taburete', 'Taburete', 'el taburete');
    pon(K.crearRepisaCanastas(), [-7.6, 1.0, rc.z1 - .2], Math.PI, 'repisa', 'Repisa con canastas de los huéspedes', 'las canastas', { info: 'Cada huésped guarda sus cosas en una canasta con su nombre.' });
    cartel({ ancho: 1.1, alto: .72, fondo: C.crema, borde: C.postigoOscuro, lineas: [{ texto: 'COCINA COMPARTIDA', tam: .2, color: C.postigoOscuro, peso: 700, fuente: 'system-ui, sans-serif' }, { texto: '• Lava y guarda lo que uses', tam: .15, color: C.tinta, fuente: 'system-ui, sans-serif' }, { texto: '• Marca tu comida con tu nombre', tam: .15, color: C.tinta, fuente: 'system-ui, sans-serif' }, { texto: '• Horario: 7 a. m. – 10 p. m.', tam: .15, color: C.tinta, fuente: 'system-ui, sans-serif' }] },
      [-5.0, 1.65, rc.z1 - .02], Math.PI, 'Cartel de normas de la cocina', 'el cartel de la cocina', { id: 'cartel-cocina' });
    const caneca = new T.Group(); cilindro(caneca, 'caneca', .2, .6, '#3c3f3e', 0, .3, 0, true, 16); cilindro(caneca, 'tapa', .21, .04, '#2a2c2b', 0, .62, 0, false, 16);
    pon(caneca, [-2.0, 0, rc.z1 - .35], 0, 'caneca', 'Caneca de la basura', 'la caneca');
    techoCuarto('cocina', rc, [[-6.6, -23.4], [-3.4, -23.4]]);
  });

  // ── Comedor (tipo buffet, sin comida) ───────────────────────────────────
  conZona('comedor', 0, () => {
    const rc = cuarto('comedor').rect, zc = -23.35;
    pon(K.crearMostradorBuffet({ largo: 3.2 }), [rc.x1 - .38, 0, zc], -Math.PI / 2, 'buffet', 'Mostrador del buffet (sin comida por ahora)', 'el buffet', { id: 'buffet', sombra: true, info: 'Buffet del desayuno: las bandejas están vacías; la comida se añadirá después.' });
    const xb = rc.x1 - .38 - .05;
    pon(K.crearPilaPlatos(), [xb, .9, zc + 1.3], 0, 'platos', 'Pila de platos', 'los platos');
    for (const [i, dz] of [.55, -.05, -.65].entries()) pon(K.crearBandejaBuffet(), [xb, .9, zc + dz], -Math.PI / 2, 'bandeja', 'Bandeja del buffet ' + (i + 1) + ' (vacía)', 'la bandeja', { id: 'bandeja-' + (i + 1) });
    for (const [i, dz] of [-1.15, -1.42].entries()) pon(K.crearTermo({ color: i ? C.tela4 : C.tela1 }), [xb, .9, zc + dz], -Math.PI / 2, 'termo', i ? 'Termo de agua caliente' : 'Termo de café', 'el termo');
    cartel({ ancho: 1.5, alto: .6, lineas: [{ texto: 'DESAYUNO', tam: .4, color: C.crema, peso: 700 }, { texto: HORARIOS.desayuno + ' · Sírvete tú mismo', tam: .24, color: '#f0d9a4', fuente: 'system-ui, sans-serif' }] },
      [rc.x1 - .03, 2.15, zc], -Math.PI / 2, 'Cartel del desayuno', 'el cartel del desayuno', { id: 'cartel-desayuno' });
    pon(M.crearMesa({ ancho: 1.2, fondo: .5, alto: .85 }), [7.4, 0, rc.z0 + .3], 0, 'mesa', 'Mesa auxiliar', 'la mesa auxiliar', { sombra: true });
    pon(K.crearVasos(), [7.05, .85, rc.z0 + .3], 0, 'vasos', 'Vasos', 'los vasos');
    pon(K.crearCubiertero(), [7.6, .85, rc.z0 + .3], 0, 'cubiertos', 'Cubiertos', 'los cubiertos');
    pon(K.crearServilletero(), [7.95, .85, rc.z0 + .3], 0, 'servilletero', 'Servilletero', 'el servilletero');
    pon(M.crearMesa({ ancho: 5.2, fondo: .9, alto: .76 }), [3.4, 0, zc], 0, 'mesa', 'Mesa larga del comedor', 'la mesa', { id: 'mesa-comedor', sombra: true });
    for (const dz of [-.78, .78]) for (const dx of [-1.3, 1.3]) pon(M.crearBanca({ largo: 2.4 }), [3.4 + dx, 0, zc + dz], 0, 'banca', 'Banca del comedor', 'la banca');
    pon(M.crearCuadro({ ancho: 1.4, alto: .8, motivo: 2 }), [3.4, 1.85, rc.z0 + .02], 0, 'cuadro', 'Cuadro', 'el cuadro', { detalle: 1 });
    techoCuarto('comedor', rc, [[2.2, zc], [5.2, zc]]);
  });

  // ── Azotea ──────────────────────────────────────────────────────────────
  conZona('azotea', 2, () => {
    const y = ROOF;
    // Barra al oeste con taburetes; mesas plegables; hamacas en soportes al este.
    pon(M.crearBarra({ largo: 2.6 }), [-7.4, y, -5.3], 0, 'barra', 'Barra de la azotea', 'la barra', { sombra: true });
    for (const dx of [-.8, 0, .8]) pon(M.crearTaburete(), [-7.4 + dx, y, -4.45], 0, 'taburete', 'Taburete', 'el taburete');
    for (const [mx, mz] of [[-3.6, -2.4], [-1.0, -4.6]]) { pon(M.crearMesa({ ancho: .8, redonda: true, alto: .74 }), [mx, y, mz], 0, 'mesa', 'Mesa de la azotea', 'la mesa', { sombra: true });
      for (const a of [0, 2.1, 4.2]) pon(M.crearSilla({ asiento: C.tela2 }), [mx + Math.sin(a) * .72, y, mz + Math.cos(a) * .72], a + Math.PI, 'silla', 'Silla', 'la silla'); }
    pon(M.crearSombrilla({ radio: 1.1 }), [-3.6, y + .74, -2.4], 0, 'sombrilla', 'Sombrilla', 'la sombrilla', { detalle: 1 });
    for (const [i, z] of [-2.0, -4.9].entries()) { const sop = M.crearSoporteHamaca({ largo: 3.2 });
      pon(sop, [3.6, y, z], 0, 'soporte-hamaca', 'Soporte de la hamaca', 'el soporte de la hamaca', { sombra: true });
      const [[ax, ay], [bx, by]] = sop.userData.ganchos; add(M.crearHamaca([3.6 + ax, y + ay, z], [3.6 + bx, y + by, z], { comba: .7 }), 'hamaca', 'Hamaca', 'la hamaca', { id: 'hamaca-azotea-' + (i + 1) }); }
    // Postes con guirnalda de luces cruzando la terraza.
    const postes = [[-9.2, -.75], [9.2, -.75], [-9.2, -6.5], [5.1, -6.5]];
    for (const [px, pz] of postes) pon(M.crearPoste({ alto: 2.6 }), [px, y, pz], 0, 'poste', 'Poste de las luces', 'el poste', { detalle: 1 });
    for (const [a, b] of [[0, 1], [2, 3], [0, 3], [1, 2]]) add(M.crearGuirnalda([postes[a][0], y + 2.55, postes[a][1]], [postes[b][0], y + 2.55, postes[b][1]], { comba: .4 }), 'luces', 'Guirnalda de luces', 'las luces', { detalle: 1 });
    // Zona de ropas (fondo de la azotea): lavadero, tendedero y tanque de agua.
    const zr = CARAS.zRearIn;
    pon(M.crearLavadero(), [7.6, y, zr + .4], 0, 'lavadero', 'Lavadero (zona de ropas)', 'el lavadero', { sombra: true, info: 'Zona de ropas: lavadero y tendedero. El servicio de lavandería se paga en recepción.' });
    pon(M.crearTendedero({ largo: 3.2 }), [3.4, y, -23.4], 0, 'tendedero', 'Tendedero con toallas', 'el tendedero', { sombra: true });
    pon(M.crearTanqueAgua(), [-7.6, y, -23.4], 0, 'tanque', 'Tanque de agua', 'el tanque de agua', { sombra: true });
    cartel({ ancho: 1.1, alto: .32, lineas: [{ texto: 'ZONA DE ROPAS', tam: .6, color: C.crema, peso: 700, fuente: 'system-ui, sans-serif' }] }, [5.6, y + .75, zr + .02], 0, 'Cartel de la zona de ropas', 'el cartel');
  });

  // Vigas del techo y ventilador de los cuartos que se recorren.
  function techoCuarto(z, rc, luces) {
    const v = new T.Group(), n = Math.floor((rc.x1 - rc.x0) / .9);
    for (let i = 1; i < n; i++) caja(v, 'viga', .12, .16, rc.z1 - rc.z0, C.maderaOscura, rc.x0 + i * (rc.x1 - rc.x0) / n, TECHO_PB - .08, (rc.z0 + rc.z1) / 2, false);
    add(v, 'viga', 'Vigas del techo', 'las vigas', { detalle: 1 }).userData.cielo = true;
    for (const [x, zz] of luces) {
      if (z === 'cocina' || z === 'comedor' || z === 'recepcion') {
        const l = new T.Group(); barra(l, 'cable', [0, 0, 0], [0, -.9, 0], .012, C.negro, false);
        l.add(Object.assign(new T.Mesh(new T.ConeGeometry(.22, .2, 16, 1, true), new T.MeshBasicMaterial({ color: '#2f6f6c', side: T.DoubleSide })), { name: 'pantalla' })).children.at(-1).position.set(0, -1, 0);
        l.add(Object.assign(new T.Mesh(new T.SphereGeometry(.06, 8, 6), new T.MeshBasicMaterial({ color: '#ffe7b0' })), { name: 'bombillo' })).children.at(-1).position.set(0, -1.08, 0);
        pon(l, [x, TECHO_PB, zz], 0, 'lampara', 'Lámpara colgante', 'la lámpara', { detalle: 1 }).userData.cielo = true;
      }
      else pon(crearVentilador(TECHO_PB), [x, 0, zz], 0, 'ventilador', 'Ventilador de techo', 'el ventilador', { detalle: 1 }).userData.cielo = true;
    }
  }
  function STAIRZ() { return escalera(0).pasos[0].z1; }

  mundo.updateMatrixWorld(true);
  return { mundo, raices, animados, pizarra: mundo.userData.pizarra };
}
