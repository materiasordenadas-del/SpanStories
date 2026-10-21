import * as T from './three.js';
import { crearMaterialToon, crearMaterialContorno, contornoDe } from './Luz25D.js';
import { ACERA, CASETA, BANCA, VALLA, SENAL, CANECA, disposicion } from './dimensions.js';

/* Paradero de bus (la calle y la acera las pone Calle.js) típico latinoamericano (estilo SITP / MIO / Metrolínea):
   pórtico de tubo gris, techo curvo de policarbonato, fondo de vidrio con mapa
   de rutas, banca metálica perforada, valla publicitaria lateral, señal
   «PARADERO» azul, caneca, bordillo pintado amarillo-negro y franja táctil.
   Sin buses, plantas ni edificios (alcance del usuario). */

const COL = {
  metal: '#6f7780', metalOscuro: '#4b525a', vidrio: '#bfe3ee', policarb: '#9fd0e0',
  acera: '#cfc8bb', baldosa: '#b3ab9b', bordillo: '#f2c230', negro: '#2b2b2b',
  asfalto: '#555a60', raya: '#f4f1e8', amarilloVia: '#f2c230', tactil: '#e9b72a',
  azulSenal: '#1f5fae', verdeCaneca: '#2f7d4f', banca: '#8a929b',
};
const RUTAS = [['A12', '#d33a2c'], ['C24', '#2c8a4a'], ['E30', '#f0a020'], ['T11', '#2a6fd0']];

function lienzo(w, h, pintar, repetir) {
  if (typeof document === 'undefined') return null;          // en node (tests) no hay canvas
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  pintar(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); t.anisotropy = 4;
  if (repetir) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(...repetir); }
  return t;
}
const conTextura = (tex, extra = {}) => (tex ? { albedo: tex, ...extra } : extra);

export function construirParadero(grupo) {
  const D = disposicion();
  const piezas = {};
  function pieza(nombre, geo, color, pos, { contorno = 'medio', matOpts = {}, padre = grupo } = {}) {
    const m = new T.Mesh(geo, crearMaterialToon({ color, ...matOpts }));
    m.name = nombre; m.position.set(...pos);
    if (contorno) contornoDe(m, crearMaterialContorno(color, contorno));
    padre.add(m); piezas[nombre] = m; return m;
  }
  const caja = (n, [w, h, d], color, pos, o) => pieza(n, new T.BoxGeometry(w, h, d), color, pos, o);
  const plano = (n, [w, h], pos, tex, o = {}) =>
    pieza(n, new T.PlaneGeometry(w, h), '#ffffff', pos, { contorno: null, ...o, matOpts: conTextura(tex, o.matOpts) });

  // ── Caseta: pórtico de tubo ─────────────────────────────────────────────
  // La caseta trabaja en x local (0 = su centro); el grupo la lleva a su sitio en la acera.
  const caseta = new T.Group(); caseta.name = 'caseta'; caseta.position.set(D.cx, ACERA.alto, 0); grupo.add(caseta);
  const P = CASETA.perfil, H = CASETA.alto;
  const tubo = (n, x, z, alto) => pieza(n, new T.CylinderGeometry(P / 2, P / 2, alto, 12), COL.metal, [x, alto / 2, z], { padre: caseta });
  for (const [n, x] of [['I', D.xIzq - D.cx], ['D', D.xDer - D.cx]]) {
    tubo(`posteTras${n}`, x, D.zAtras + P / 2, H);
    tubo(`posteDel${n}`, x, D.zFrente - P / 2, H);
    caja(`placa${n}`, [0.22, 0.02, CASETA.fondo], COL.metalOscuro, [x, 0.01, (D.zAtras + D.zFrente) / 2], { padre: caseta, contorno: 'fino' });
    caja(`viga${n}`, [P, P, D.techo.z1 - D.techo.z0], COL.metal, [x, H, (D.techo.z0 + D.techo.z1) / 2], { padre: caseta });
  }
  caja('largueroTras', [CASETA.largo + P, P, P], COL.metal, [0, H, D.zAtras + P / 2], { padre: caseta });
  caja('largueroDel', [CASETA.largo + P, P, P], COL.metal, [0, H, D.zFrente - P / 2], { padre: caseta });

  // Techo curvo de policarbonato: arco de cilindro con eje x y corona arriba.
  // Sus bordes caen justo sobre las vigas (y = H + P/2); la corona sube `flecha`.
  const cuerda = D.techo.z1 - D.techo.z0, f = CASETA.flecha, R = (cuerda * cuerda / 4 + f * f) / (2 * f);
  const ang = 2 * Math.asin(cuerda / 2 / R);
  const techoGeo = new T.CylinderGeometry(R, R, CASETA.largo + 0.3, 24, 1, true, -ang / 2, ang)
    .rotateZ(Math.PI / 2).rotateX(-Math.PI / 2);
  pieza('techo', techoGeo, COL.policarb, [0, H + P / 2 - (R - f), (D.techo.z0 + D.techo.z1) / 2],
    { padre: caseta, matOpts: { transparente: true, opacidad: 0.72, doble: true } });

  // Fondo de vidrio con travesaños y mapa de rutas.
  const zVidrio = D.zAtras + P / 2, altoVidrio = H - CASETA.vidrioBajo - 0.12;
  pieza('vidrioFondo', new T.PlaneGeometry(CASETA.largo - P, altoVidrio), COL.vidrio,
    [0, CASETA.vidrioBajo + altoVidrio / 2, zVidrio], { padre: caseta, contorno: null, matOpts: { transparente: true, opacidad: 0.32, doble: true } });
  for (const [n, y] of [['Bajo', CASETA.vidrioBajo], ['Medio', 1.15]])
    caja(`travesano${n}`, [CASETA.largo, 0.045, 0.045], COL.metal, [0, y, zVidrio], { padre: caseta, contorno: 'fino' });
  const texMapa = lienzo(512, 384, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = COL.azulSenal; g.fillRect(0, 0, w, 64);
    g.fillStyle = '#fff'; g.font = 'bold 36px Arial'; g.fillText('Mapa de rutas', 20, 44);
    RUTAS.forEach(([n, c], i) => {
      const y = 110 + i * 62; g.strokeStyle = c; g.lineWidth = 10; g.beginPath();
      g.moveTo(110, y); g.bezierCurveTo(200, y - 40 + i * 20, 320, y + 50, 490, y - 10); g.stroke();
      g.fillStyle = c; g.fillRect(24, y - 16, 70, 32); g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.fillText(n, 36, y + 8);
    });
    g.fillStyle = '#d33a2c'; g.beginPath(); g.arc(300, 360, 12, 0, 7); g.fill();
    g.fillStyle = '#222'; g.font = 'bold 20px Arial'; g.fillText('Usted está aquí', 320, 367);
  });
  plano('mapaRutas', [1.0, 0.75], [-CASETA.largo / 4, 1.6, zVidrio + 0.012], texMapa, { padre: caseta });

  // Banca metálica perforada.
  const banca = new T.Group(); banca.name = 'banca'; caseta.add(banca);
  const zb = (D.banca.z0 + D.banca.z1) / 2;
  const texPerf = lienzo(128, 32, (g, w, h) => {
    g.fillStyle = COL.banca; g.fillRect(0, 0, w, h); g.fillStyle = '#5f666e';
    for (let x = 6; x < w; x += 12) for (let y = 6; y < h; y += 12) { g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill(); }
  }, [6, 1]);
  const colorBanca = texPerf ? '#ffffff' : COL.banca;
  caja('asiento', [BANCA.largo, 0.04, BANCA.fondo], colorBanca, [0, BANCA.alto, zb], { padre: banca, matOpts: conTextura(texPerf) });
  caja('respaldo', [BANCA.largo, BANCA.respaldo, 0.03], colorBanca, [0, BANCA.alto + 0.06 + BANCA.respaldo / 2, D.banca.z0 + 0.03],
    { padre: banca, matOpts: conTextura(texPerf) }).rotation.x = -0.12;
  for (const [i, x] of [-BANCA.largo / 2 + 0.2, 0, BANCA.largo / 2 - 0.2].entries()) {
    caja(`pataBanca${i}`, [0.05, BANCA.alto, 0.05], COL.metalOscuro, [x, BANCA.alto / 2, zb], { padre: banca, contorno: 'fino' });
    caja(`pieBanca${i}`, [0.05, 0.03, BANCA.fondo], COL.metalOscuro, [x, 0.015, zb], { padre: banca, contorno: 'fino' });
  }

  // Valla publicitaria lateral (mupi) con anuncio ficticio.
  const texAnuncio = lienzo(384, 576, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff7a45'); gr.addColorStop(1, '#ffc93c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 56px Arial';
    ['¡Aprende', 'español', 'viajando!'].forEach((t, i) => g.fillText(t, w / 2, 150 + i * 65));
    g.beginPath(); g.arc(w / 2, 400, 70, 0, 7); g.fillStyle = '#ffffffcc'; g.fill();
    g.fillStyle = '#ff7a45'; g.font = 'bold 80px Arial'; g.fillText('ñ', w / 2, 425);
    g.fillStyle = '#5a2b12'; g.font = 'bold 30px Arial'; g.fillText('SpanStories', w / 2, 530);
  });
  const fondoValla = CASETA.fondo * 0.9;
  caja('vallaCaja', [VALLA.grosor, VALLA.alto, fondoValla], COL.metalOscuro, [D.valla.cx - D.cx, VALLA.baja + VALLA.alto / 2, D.valla.cz], { padre: caseta });
  for (const s of [-1, 1]) {
    plano(`anuncio${s > 0 ? 'Este' : 'Oeste'}`, [fondoValla - 0.1, VALLA.alto - 0.1],
      [D.valla.cx - D.cx + s * (VALLA.grosor / 2 + 0.004), VALLA.baja + VALLA.alto / 2, D.valla.cz], texAnuncio,
      { padre: caseta, matOpts: { luzPropia: 0.35 } }).rotation.y = s * Math.PI / 2;
  }

  // Letrero del paradero bajo el alero.
  const texNombre = lienzo(1024, 96, (g, w, h) => {
    g.fillStyle = COL.azulSenal; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = 'bold 54px Arial'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText('PARADERO · Av. Las Palmas – Cl. 45', w / 2, h / 2 + 2);
  });
  const anchoLetrero = CASETA.largo * 0.8;
  caja('marcoLetrero', [anchoLetrero + 0.04, 0.3, 0.03], COL.metal, [0, H - 0.2, D.zFrente - P / 2], { padre: caseta, contorno: 'fino' });
  plano('letreroAlero', [anchoLetrero, 0.26], [0, H - 0.2, D.zFrente - P / 2 + 0.017], texNombre,
    { padre: caseta, matOpts: texNombre ? {} : { color: COL.azulSenal } });

  // ── Señal «PARADERO» en poste propio junto al bordillo ─────────────────
  const texSenal = lienzo(300, 400, (g, w, h) => {
    g.fillStyle = COL.azulSenal; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = 'bold 44px Arial'; g.fillText('PARADERO', w / 2, 80);
    g.fillRect(80, 110, 140, 105); g.fillStyle = COL.azulSenal; g.fillRect(92, 122, 116, 45);          // pictograma de bus
    g.fillStyle = '#fff'; g.beginPath(); g.arc(108, 222, 13, 0, 7); g.arc(192, 222, 13, 0, 7); g.fill();
    g.font = 'bold 30px Arial';
    RUTAS.forEach(([r, c], i) => {
      const x = 42 + (i % 2) * 118, y = 262 + Math.floor(i / 2) * 58;
      g.fillStyle = c; g.fillRect(x, y, 100, 46); g.fillStyle = '#fff'; g.fillText(r, x + 50, y + 34);
    });
  });
  const senal = new T.Group(); senal.name = 'senal'; senal.position.set(D.senal.x, ACERA.alto, D.senal.z); grupo.add(senal);
  pieza('posteSenal', new T.CylinderGeometry(0.035, 0.035, SENAL.alto, 10), COL.metal, [0, SENAL.alto / 2, 0], { padre: senal });
  const [pw, ph] = SENAL.placa, yPlaca = SENAL.alto - ph / 2 - 0.05;
  caja('placaSenal', [pw, ph, 0.03], COL.azulSenal, [0, yPlaca, 0.05], { padre: senal, contorno: 'fino' });
  for (const s of [1, -1])
    plano(`senalCara${s > 0 ? 'Calle' : 'Acera'}`, [pw - 0.01, ph - 0.01], [0, yPlaca, 0.05 + s * 0.017], texSenal, { padre: senal })
      .rotation.y = s > 0 ? 0 : Math.PI;

  // ── Caneca de basura ──────────────────────────────────────────────────
  const caneca = new T.Group(); caneca.name = 'caneca'; caneca.position.set(D.caneca.x, ACERA.alto, D.caneca.z); grupo.add(caneca);
  const pie = 0.12, cuerpo = CANECA.alto - pie;
  pieza('canecaPoste', new T.CylinderGeometry(0.03, 0.03, pie, 8), COL.metal, [0, pie / 2, 0], { padre: caneca, contorno: 'fino' });
  pieza('canecaCuerpo', new T.CylinderGeometry(CANECA.radio, CANECA.radio * 0.88, cuerpo, 20), COL.verdeCaneca, [0, pie + cuerpo / 2, 0], { padre: caneca });
  pieza('canecaTapa', new T.CylinderGeometry(CANECA.radio * 1.06, CANECA.radio * 1.06, 0.05, 20), COL.metalOscuro, [0, CANECA.alto + 0.025, 0], { padre: caneca });

  return { grupo, piezas, D };
}
