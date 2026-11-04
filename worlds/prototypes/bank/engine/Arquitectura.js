import * as T from './three.js';
import { ALTO_TECHO as H, GROSOR_MURO, EDIFICIO, SALAS, PUERTAS, MOSTRADOR, VENTANAS, VENTANA_Y } from './config.js';
import { texturaEstuco, materialSuperficie, lienzo, azar } from './Kit.js';
import { normalDesdeAltura } from './Luz25D.js';
import { crearSueloBrillante, crearVidrio } from './Reflejos.js';

/* ── Casco del banco ──────────────────────────────────────────────────────
   Muros con huecos, porcelanato claro encerado con banda guía teal, falso
   techo modular con paneles de luz, mamparas de vidrio del vestíbulo y muro
   de lamas de roble tras los cajeros (el fondo que se ve a través del vidrio). */

// Rectángulos [a0, a1] × [y0, y1] de un paño sin sus huecos {a0, a1, y0, y1}.
export function tramos(a0, a1, y0, y1, huecos = []) {
  const cortes = new Set([a0, a1]);
  for (const h of huecos) { if (h.a0 > a0 && h.a0 < a1) cortes.add(h.a0); if (h.a1 > a0 && h.a1 < a1) cortes.add(h.a1); }
  const xs = [...cortes].sort((a, b) => a - b), out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const u0 = xs[i], u1 = xs[i + 1], um = (u0 + u1) / 2;
    let libres = [[y0, y1]];
    for (const h of huecos) if (um > h.a0 && um < h.a1) {
      libres = libres.flatMap(([b0, b1]) => {
        const r = [];
        if (h.y0 > b0) r.push([b0, Math.min(b1, h.y0)]);
        if (h.y1 < b1) r.push([Math.max(b0, h.y1), b1]);
        return r.filter(([c0, c1]) => c1 - c0 > .001);
      });
    }
    for (const [b0, b1] of libres) out.push([u0, u1, b0, b1]);
  }
  return out;
}

const hueco = (c, ancho, y0, y1, extra = {}) => ({ a0: c - ancho / 2, a1: c + ancho / 2, y0, y1, ...extra });
const VANO_PUERTA = .5;        // la hoja corredera se esconde a cada lado: el vano es algo más ancho
export const HUECOS_FACHADA = [
  hueco(PUERTAS.exterior.x, PUERTAS.exterior.ancho + VANO_PUERTA, 0, 2.62, { puerta: true }),
  ...VENTANAS.map(([x0, x1]) => ({ a0: x0, a1: x1, y0: VENTANA_Y[0], y1: VENTANA_Y[1], ventana: true })),
];
const HUECO_INTERIOR = hueco(PUERTAS.interior.x, PUERTAS.interior.ancho + VANO_PUERTA, 0, 2.62, { puerta: true });
export const PUERTA_PERSONAL = { x: 8.05, ancho: .95, alto: 2.15 };
const { x0: EX0, x1: EX1, z0: EZ0 } = EDIFICIO;
const M = MOSTRADOR, MX1 = M.x0 + M.ancho * M.n;

export const MUROS = [
  { eje: 'x', fijo: 0, a0: EX0 - .15, a1: EX1 + .15, huecos: HUECOS_FACHADA, grosor: .3, fachada: true },
  { eje: 'x', fijo: EZ0, a0: EX0 - .1, a1: EX1 + .1 },
  { eje: 'z', fijo: EX0, a0: EZ0, a1: 0 },
  { eje: 'z', fijo: EX1, a0: EZ0, a1: 0 },
  { eje: 'x', fijo: -3.6, a0: EX0, a1: -3.4, huecos: [HUECO_INTERIOR] },                 // vestíbulo ↔ sala
  { eje: 'x', fijo: M.z - .3, a0: EX0, a1: M.x0, grosor: .2 },             // tramo oeste junto a la caja 1
  { eje: 'x', fijo: M.z - .3, a0: MX1, a1: EX1, huecos: [hueco(PUERTA_PERSONAL.x, PUERTA_PERSONAL.ancho, 0, PUERTA_PERSONAL.alto)] },
];

function texturaPorcelanato() {
  // Placa de 60 × 60 cm, crema con veta suave (albedo); 2 × 2 placas por textura.
  const lado = 512, r = azar(41), n = 2, t = lado / n;
  const albedo = document.createElement('canvas'), altura = document.createElement('canvas');
  albedo.width = albedo.height = altura.width = altura.height = lado;
  const a = albedo.getContext('2d'), h = altura.getContext('2d');
  h.fillStyle = '#fff'; h.fillRect(0, 0, lado, lado);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = 236 + r() * 8;
    a.fillStyle = `rgb(${k},${k - 6},${k - 16})`; a.fillRect(i * t, j * t, t, t);
    for (let v = 0; v < 5; v++) {
      a.strokeStyle = `rgba(170,150,120,${.05 + r() * .07})`; a.lineWidth = .8 + r() * 1.5; a.beginPath();
      let x = i * t + r() * t, y = j * t;
      a.moveTo(x, y);
      for (let s = 0; s < 8; s++) { x += (r() - .45) * 26; y += t / 8; a.lineTo(Math.min(Math.max(x, i * t), i * t + t), y); }
      a.stroke();
    }
    a.fillStyle = 'rgba(150,140,125,.55)'; a.fillRect(i * t, j * t, t, 1.5); a.fillRect(i * t, j * t, 1.5, t);
    h.fillStyle = '#000'; h.fillRect(i * t, j * t, t, 2); h.fillRect(i * t, j * t, 2, t);
  }
  const map = new T.CanvasTexture(albedo); map.colorSpace = T.SRGBColorSpace; map.wrapS = map.wrapT = T.RepeatWrapping;
  map.anisotropy = 8; map.minFilter = T.LinearMipmapLinearFilter;
  return { map, normal: normalDesdeAltura(altura, { fuerza: 2, suavizado: .6, repetir: true }), metros: 1.2 };
}
// Pintura mate crema: casi lisa, con un grano muy fino (las manchas del estuco se leían como suciedad).
function texturaPintura(base) {
  return lienzo(256, 256, (c, w) => {
    c.fillStyle = base; c.fillRect(0, 0, w, w);
    const r = azar(4);
    for (let i = 0; i < 2200; i++) { c.fillStyle = r() > .5 ? 'rgba(255,255,255,.05)' : 'rgba(120,100,70,.045)'; c.fillRect(r() * w, r() * w, 1.5, 1.5); }
  }, { repetir: true });
}
function texturaFalsoTecho() {
  // Placas de 60 cm con perfilería en T: dos por textura.
  return lienzo(256, 256, (c, w) => {
    c.fillStyle = '#f3f2ee'; c.fillRect(0, 0, w, w);
    const r = azar(8);
    for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(160,160,150,${r() * .12})`; c.fillRect(r() * w, r() * w, 1.5, 1.5); }
    c.fillStyle = '#d8d9d6';
    for (const p of [0, w / 2]) { c.fillRect(p, 0, 3, w); c.fillRect(0, p, w, 3); }
  }, { repetir: true });
}
function texturaGranito(base = '#4d4f52', semilla = 13) {
  return lienzo(256, 256, (c, w) => {
    c.fillStyle = base; c.fillRect(0, 0, w, w);
    const r = azar(semilla);
    for (let i = 0; i < 2600; i++) {
      const k = r();
      c.fillStyle = k > .8 ? 'rgba(230,230,225,.45)' : k > .5 ? 'rgba(20,20,22,.4)' : 'rgba(140,130,120,.35)';
      c.fillRect(r() * w, r() * w, 1 + r() * 2.5, 1 + r() * 2.5);
    }
  }, { repetir: true });
}
export { texturaGranito };

export function construirCasco(ctx) {
  const { kit, lote, grupo, colisiones } = ctx;
  const estuco = materialSuperficie({ map: texturaPintura('#efe7d8'), metros: 2, bandas: 3 });
  const techo = materialSuperficie({ map: texturaFalsoTecho(), metros: 1.2, bandas: 2 });
  const porc = texturaPorcelanato();
  const piso = materialSuperficie({ map: porc.map, normal: porc.normal, metros: porc.metros, fuerzaNormal: .7 });
  const granito = materialSuperficie({ map: texturaGranito('#4a4c4f'), metros: .9, bandas: 2, reflejo: .1, nitidez: 2 });
  const vinil = materialSuperficie({ map: texturaGranito('#9a9d9f', 17), metros: 1.4, bandas: 2 });
  ctx.materiales = { estuco, granito, piso };

  const vol = (material, x, y, z, w, h, d, o = {}) => lote.caja(material, x, y, z, w, h, d, { contorno: false, ...o });
  const panio = (m, material, u0, u1, y0, y1, desplaz, grosor) => {
    const c = (u0 + u1) / 2, len = u1 - u0;
    if (m.eje === 'x') vol(material, c, (y0 + y1) / 2, m.fijo + desplaz, len, y1 - y0, grosor);
    else vol(material, m.fijo + desplaz, (y0 + y1) / 2, c, grosor, y1 - y0, len);
  };

  // 1. Muros (estuco por las dos caras) con colisiones.
  for (const m of MUROS) {
    const g = m.grosor || GROSOR_MURO, alto = m.fachada ? H + .7 : H + .1;
    for (const [u0, u1, y0, y1] of tramos(m.a0, m.a1, 0, alto, m.huecos || [])) {
      panio(m, estuco, u0, u1, y0, y1, 0, g);
      if (y0 === 0 && y1 > 1) colisiones.push(m.eje === 'x' ? [u0, m.fijo - g / 2, u1, m.fijo + g / 2] : [m.fijo - g / 2, u0, m.fijo + g / 2, u1]);
    }
  }
  // Zócalo grafito en todo el perímetro interior de las zonas públicas.
  const zocalo = (x0, z0, x1, z1) => vol('zocalo', (x0 + x1) / 2, .05, (z0 + z1) / 2, Math.max(x1 - x0, .02), .1, Math.max(z1 - z0, .02));
  zocalo(EX0 + .1, -10.7, EX0 + .12, -3.7); zocalo(EX0 + .1, -3.5, EX0 + .12, -.15);                     // oeste
  zocalo(EX1 - .12, -10.7, EX1 - .1, -.15);                      // este
  zocalo(EX0 + .1, -.17, EX1 - .1, -.15);                          // fachada (entre ventanas no estorba)
  zocalo(EX0 + .1, -10.72, M.x0, -10.69); zocalo(MX1, -10.72, EX1 - .1, -10.69);

  // Lambrín de roble (0,95 m) con remate teal en los muros largos de la sala: da escala
  // y abriga la zona de la fila y la de los asesores.
  for (const [x, s] of [[EX0 + .1, 1], [EX1 - .1, -1]]) {
    const z0 = -10.7, z1 = -3.7, zc = (z0 + z1) / 2;
    vol('roble', x + s * .015, .5, zc, .03, .9, z1 - z0);
    vol('teal', x + s * .025, .97, zc, .05, .05, z1 - z0);
    for (let z = z0 + .6; z < z1; z += .6) vol('robleOscuro', x + s * .031, .5, z, .004, .88, .012);
  }

  // 2. Suelos.  Porcelanato en sala, ventanales y vestíbulo; granito oscuro en el
  //    felpudo del vestíbulo; vinílico gris tras el mostrador (lo pisa el personal).
  const suelo = (material, x0, z0, x1, z1, y = -.05) => vol(material, (x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, .1, z1 - z0);
  suelo(piso, EX0, -10.75, EX1, .02);
  suelo(vinil, EX0, EZ0, EX1, -10.75);
  // Banda guía teal: de la puerta interior a la boca de la fila y a lo largo del mostrador.
  const banda = (x0, z0, x1, z1) => vol('teal', (x0 + x1) / 2, .002, (z0 + z1) / 2, x1 - x0, .006, z1 - z0);
  banda(M.x0 - .2, -9.62, MX1 + .2, -9.5);
  banda(-6.26, -5.3, -6.14, -3.7);
  banda(-9, -3.62, -3.4, -3.58);
  // Felpudo empotrado en las dos puertas (granito oscuro con logo en vinilo aparte).
  vol(granito, PUERTAS.exterior.x, .001, -.9, 2.6, .006, 1.4);
  vol(granito, PUERTAS.interior.x, .001, -2.95, 2.6, .006, 1.1);
  // Encerado: espejo tenue sobre la zona pública (la sala y los ventanales).
  const brillo = crearSueloBrillante({ ancho: 18, fondo: 10.6, fuerza: .24, caida: 1.2, rect: [EX0, -10.55, EX1, 0] });
  brillo.position.set(0, .004, -5.3); grupo.add(brillo);

  // 3. Falso techo modular a 3,8 m con paneles de luz LED de 60 × 120 y la
  //    cenefa baja sobre el mostrador (lleva el rótulo de las cajas).
  vol(techo, 0, H + .05, -7.5, 18.4, .1, 15.4);
  const panelLuz = kit.emisivo('#fbfaf5'), marco = kit.mat('aluminio');
  const paneles = [];
  for (const x of [-6.6, -3.0, .6, 4.2, 7.2]) for (const z of [-4.8, -7.8]) paneles.push([x, z]);
  for (const x of [-1.8, 1.8, 5.4]) paneles.push([x, -1.8]);
  paneles.push([-6.2, -1.8]);
  for (const x of [-6, -1.2, 3.6]) paneles.push([x, -12.6]);
  for (const [x, z] of paneles) {
    vol(marco, x, H - .01, z, .66, .02, 1.26);
    lote.caja(panelLuz, x, H - .022, z, .6, .01, 1.2, { contorno: false, nombre: 'la lámpara del techo' });
  }
  ctx.panelesLuz = paneles;
  // Luz lineal continua sobre el pasillo de las cajas: enmarca el mostrador.
  vol(marco, -1.2, H - .012, -9.7, 12.2, .024, .14);
  lote.caja(kit.emisivo('#fffdf6'), -1.2, H - .026, -9.7, 12, .006, .08, { contorno: false, nombre: 'la luz del techo' });
  for (const x of [-6, -3.6, -1.2, 1.2, 3.6]) paneles.push([x, -9.7]);
  // Cenefa sobre el mostrador: caja de 2,95 a 3,8 m que corre de muro a muro.
  vol(estuco, 0, (M.cabecera[1] + H) / 2, M.z - .05, 18, H - M.cabecera[1] + .01, .5);
  vol('teal', 0, M.cabecera[1] + .02, M.z + .21, 18, .05, .04);

  // 4. Muro de lamas de roble tras los cajeros (se ve a través del vidrio).
  {
    const z = EZ0 + .1 + .04;
    vol('robleOscuro', 0, H / 2, z - .02, 18, H, .02);
    for (let x = EX0 + .06; x < EX1; x += .09) lote.caja('roble', x, 1.9, z + .03, .045, 3.8 - .0, .045, { contorno: false, nombre: 'el panel de madera' });
  }

  // 5. Vestíbulo: mampara de vidrio al este (x = -3.4) con perfiles de aluminio
  //    y franja de seguridad; sobre la puerta interior, dintel de vidrio fijo.
  const vidrio = crearVidrio({ tinte: '#dcebec', opacidad: .1, fuerza: .75, brillos: .45 });
  ctx.vidrio = vidrio;
  {
    const x = -3.4, z0 = -3.6, z1 = 0;
    const lamina = new T.Mesh(new T.PlaneGeometry(z1 - z0 - .1, H - .1), vidrio);
    lamina.rotation.y = Math.PI / 2; lamina.position.set(x, H / 2, (z0 + z1) / 2); lamina.renderOrder = 3; grupo.add(lamina);
    lote.caja('aluminio', x, .04, (z0 + z1) / 2, .08, .08, z1 - z0, { contorno: 'fino' });
    lote.caja('aluminio', x, H - .04, (z0 + z1) / 2, .08, .08, z1 - z0, { contorno: false });
    for (const z of [-3.55, -2.4, -1.2, -.15]) lote.caja('aluminio', x, H / 2, z, .07, H, .06, { contorno: 'fino' });
    colisiones.push([x - .06, z0, x + .06, z1]);
    ctx.franjas = [{ x, z: (z0 + z1) / 2, ry: Math.PI / 2, ancho: z1 - z0 - .2 }];
  }
  return { estuco, piso };
}
