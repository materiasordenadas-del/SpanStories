import * as T from './three.js';
import { ALTO_TECHO as H, GROSOR_MURO, SALAS, HUECOS, VENTANAS, VENTANA_Y } from './config.js';
import { texturaMadera, texturaEstuco, texturaAzulejo, materialSuperficie, lienzo, azar } from './Kit.js';
import { crearSueloBrillante } from './Reflejos.js';

/* ── Casco del restaurante ────────────────────────────────────────────────
   Muros (núcleo de estuco con huecos), acabados de cada sala, piso de madera
   encerado, techo con vigas.  Todo en metros; posiciones en config.js. */

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

// Huecos de cada muro (a lo largo de su eje: x si el muro corre en x, z si corre en z).
const hueco = (c, ancho, y0, y1, extra = {}) => ({ a0: c - ancho / 2, a1: c + ancho / 2, y0, y1, ...extra });
export const HUECOS_FACHADA = [
  hueco(HUECOS.entrada.x, HUECOS.entrada.ancho, 0, HUECOS.entrada.alto),
  ...VENTANAS.map(([x0, x1]) => ({ a0: x0, a1: x1, y0: VENTANA_Y[0], y1: VENTANA_Y[1], ventana: true })),
];
const ARCO = { ...hueco(HUECOS.arco.z, HUECOS.arco.ancho, 0, H), arco: true };
const PASO_PASILLO = hueco(HUECOS.pasillo.z, HUECOS.pasillo.ancho, 0, HUECOS.pasillo.alto);
const PUERTA_DAMAS = hueco(HUECOS.damas.z, HUECOS.damas.ancho, 0, HUECOS.damas.alto);
const PUERTA_CAB = hueco(HUECOS.caballeros.z, HUECOS.caballeros.ancho, 0, HUECOS.caballeros.alto);
const PUERTA_COCINA = hueco(HUECOS.cocina.x, HUECOS.cocina.ancho, 0, HUECOS.cocina.alto);

// Muros: eje ('x' corre en x a z = fijo; 'z' corre en z a x = fijo), fijo, desde, hasta, huecos, grosor.
export const MUROS = [
  { eje: 'x', fijo: 0, a0: -10.15, a1: 10.15, huecos: HUECOS_FACHADA, grosor: .3, fachada: true },
  { eje: 'x', fijo: -10, a0: -10.1, a1: 10.1, huecos: [PUERTA_COCINA] },
  { eje: 'z', fijo: -10, a0: -10, a1: 0 },
  { eje: 'z', fijo: 10, a0: -10, a1: 0 },
  { eje: 'z', fijo: -3, a0: -5, a1: 0, huecos: [ARCO] },
  { eje: 'z', fijo: -3, a0: -10, a1: -5, huecos: [PASO_PASILLO] },
  { eje: 'x', fijo: -5, a0: -10, a1: -3 },
  { eje: 'z', fijo: -5, a0: -10, a1: -5, huecos: [PUERTA_DAMAS, PUERTA_CAB] },
  { eje: 'x', fijo: -7.5, a0: -10, a1: -5 },
];

export function construirCasco(ctx) {
  const { kit, lote, grupo, colisiones } = ctx;
  const R = HUECOS.arco.ancho / 2, arranque = HUECOS.arco.alto - R;

  // Materiales de superficie (UV en metros del mundo).
  const estuco = materialSuperficie({ map: texturaEstuco('#e6c48e', 3), metros: 2.2, bandas: 3 });
  const estucoBano = materialSuperficie({ map: texturaEstuco('#cfdcc3', 9, .35), metros: 2.2, bandas: 3 });
  const techo = materialSuperficie({ map: texturaEstuco('#f3e6cc', 5), metros: 3, bandas: 2 });
  const madera = texturaMadera();
  const piso = materialSuperficie({ map: madera.map, normal: madera.normal, metros: madera.metros, fuerzaNormal: .9 });
  const azulejo = texturaAzulejo({ color: '#f5f2ea', junta: '#d3cbbd', columnas: 5, filas: 10 });
  const pared = materialSuperficie({ map: azulejo.map, normal: azulejo.normal, metros: 1, fuerzaNormal: 1, reflejo: .12, nitidez: 2 });
  const hexa = lienzo(512, 512, (c, w) => {               // suelo de baño: hexágono blanco con flor negra
    c.fillStyle = '#9a958c'; c.fillRect(0, 0, w, w);
    const r = w / 8, dx = r * Math.sqrt(3), dy = r * 1.5;
    let fila = 0;
    for (let y = -r; y < w + r; y += dy, fila++) for (let x = -dx; x < w + dx; x += dx) {
      const cx = x + (fila % 2 ? dx / 2 : 0);
      const flor = (Math.round(cx / dx) * 3 + fila * 2) % 7 === 0;
      c.fillStyle = flor ? '#2d2b29' : '#f4f1ea';
      c.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c.lineTo(cx + Math.cos(a) * (r - 2), y + Math.sin(a) * (r - 2)); }
      c.fill();
    }
  }, { repetir: true });
  const pisoBano = materialSuperficie({ map: hexa, metros: .9, bandas: 2 });

  const vol = (material, x, y, z, w, h, d) => lote.caja(material, x, y, z, w, h, d, { contorno: false });
  // Paño de un muro (en ejes del muro) → caja en el mundo.
  const panio = (m, material, u0, u1, y0, y1, desplaz, grosor) => {
    const c = (u0 + u1) / 2, len = u1 - u0;
    if (m.eje === 'x') vol(material, c, (y0 + y1) / 2, m.fijo + desplaz, len, y1 - y0, grosor);
    else vol(material, m.fijo + desplaz, (y0 + y1) / 2, c, grosor, y1 - y0, len);
  };

  // 1. Núcleo de los muros (estuco en sus dos caras), con colisiones.
  for (const m of MUROS) {
    const g = m.grosor || GROSOR_MURO, huecos = m.huecos || [];
    const alto = m.fachada ? H + .35 : H;
    for (const [u0, u1, y0, y1] of tramos(m.a0, m.a1, 0, alto, huecos)) {
      panio(m, estuco, u0, u1, y0, y1, 0, g);
      if (y0 === 0 && y1 > 1) colisiones.push(m.eje === 'x' ? [u0, m.fijo - g / 2, u1, m.fijo + g / 2] : [m.fijo - g / 2, u0, m.fijo + g / 2, u1]);
    }
  }
  // Tímpano del arco (recepción ↔ comedor): el estuco sobre el medio punto.
  {
    const forma = new T.Shape();
    forma.moveTo(-R, arranque); forma.lineTo(-R, H); forma.lineTo(R, H); forma.lineTo(R, arranque);
    forma.absarc(0, arranque, R, 0, Math.PI, false);
    const geo = new T.ExtrudeGeometry(forma, { depth: GROSOR_MURO, bevelEnabled: false, curveSegments: 28 });
    geo.translate(0, 0, -GROSOR_MURO / 2);
    const tim = new T.Mesh(geo, estuco);
    tim.rotation.y = Math.PI / 2; tim.position.set(-3, 0, HUECOS.arco.z);
    grupo.add(tim);
    // Dovelas de ladrillo alrededor del arco, en las dos caras, y jambas de ladrillo.
    const n = 15;
    for (const lado of [-1, 1]) {
      const x = -3 + lado * (GROSOR_MURO / 2 + .018);
      for (let i = 0; i < n; i++) {
        const a = Math.PI * (i + .5) / n, rm = R + .11;
        lote.caja(i % 2 ? 'ladrillo' : 'ladrilloOscuro', x, arranque + Math.sin(a) * rm, HUECOS.arco.z + Math.cos(a) * rm, .036, .22, Math.PI * rm / n - .025, { rx: -(a - Math.PI / 2), contorno: 'fino' });
      }
      for (let j = 0; j < 7; j++) for (const s of [-1, 1]) {
        const y = .15 + j * (arranque - .1) / 7;
        lote.caja(j % 2 ? 'ladrilloOscuro' : 'ladrillo', x, y + .12, HUECOS.arco.z + s * (R + (j % 2 ? .1 : .14)), .036, .2, j % 2 ? .2 : .28, { contorno: 'fino' });
      }
    }
  }

  // 2. Acabados de las salas (sobre el estuco): zócalo de nogal con cuarterones
  //    y moldura en recepción, comedor y pasillo; azulejo en los baños.
  const cara = (sala, lado) => {           // muro interior de un lado de la sala
    const [x0, z0, x1, z1] = SALAS[sala].rect, t = GROSOR_MURO / 2;
    if (lado === 'n') return { eje: 'x', fijo: z0, off: t, a0: x0 + t, a1: x1 - t, normal: 1 };
    if (lado === 's') return { eje: 'x', fijo: z1, off: -(sala === 'recepcion' || sala === 'comedor' ? .15 : t), a0: x0 + t, a1: x1 - t, normal: -1 };
    if (lado === 'o') return { eje: 'z', fijo: x0, off: t, a0: z0 + t, a1: z1 - t, normal: 1 };
    return { eje: 'z', fijo: x1, off: -t, a0: z0 + t, a1: z1 - t, normal: -1 };
  };
  const huecosDe = (sala, lado) => {
    const f = cara(sala, lado), out = [];
    for (const m of MUROS) {
      if (m.eje !== f.eje || Math.abs(m.fijo - f.fijo) > .01) continue;
      for (const h of m.huecos || []) if (h.a1 > f.a0 && h.a0 < f.a1) out.push(h);
    }
    return out;
  };
  const alto = 1.05;
  function zocaloMadera(sala, lado) {
    const f = cara(sala, lado), hs = huecosDe(sala, lado).map(h => ({ ...h, y1: h.ventana ? h.y1 : h.y1 }));
    const capa = (material, y0, y1, grosor, extra = 0) => {
      for (const [u0, u1, b0, b1] of tramos(f.a0, f.a1, y0, y1, hs.map(h => ({ ...h, a0: h.a0 - extra, a1: h.a1 + extra })))) {
        const c = (u0 + u1) / 2, len = u1 - u0, y = (b0 + b1) / 2, dd = f.fijo + f.off + f.normal * grosor / 2;
        if (f.eje === 'x') lote.caja(material, c, y, dd, len, b1 - b0, grosor, { contorno: false });
        else lote.caja(material, dd, y, c, grosor, b1 - b0, len, { contorno: false });
      }
    };
    capa('nogal', 0, alto, .03, .08);
    capa('zocalo', 0, .14, .045, .08);
    capa('moldura', alto - .03, alto + .03, .06, .08);
    // Cuarterones: marcos en relieve de ~0,6 m entre huecos.
    for (const [u0, u1, b0] of tramos(f.a0, f.a1, 0, alto, hs.map(h => ({ ...h, a0: h.a0 - .1, a1: h.a1 + .1 })))) {
      if (b0 > 0) continue;
      const n = Math.max(1, Math.round((u1 - u0) / .62)), paso = (u1 - u0) / n;
      for (let i = 0; i < n; i++) {
        const c = u0 + paso * (i + .5), dd = f.fijo + f.off + f.normal * .037, w = paso - .16;
        if (w < .15) continue;
        const pieza = (y, h, largo) => f.eje === 'x' ? lote.caja('moldura', c, y, dd, largo, h, .014, { contorno: false }) : lote.caja('moldura', dd, y, c, .014, h, largo, { contorno: false });
        pieza(.26, .025, w); pieza(alto - .14, .025, w);
        if (f.eje === 'x') { for (const s of [-1, 1]) lote.caja('moldura', c + s * w / 2, (alto + .12) / 2, dd, .025, alto - .4, .014, { contorno: false }); }
        else { for (const s of [-1, 1]) lote.caja('moldura', dd, (alto + .12) / 2, c + s * w / 2, .014, alto - .4, .025, { contorno: false }); }
      }
    }
  }
  for (const [sala, lados] of [['recepcion', 'nsoe'], ['comedor', 'nsoe'], ['pasillo', 'nsoe']]) for (const l of lados) {
    if (sala === 'comedor' && l === 'n') continue;             // la barra y las vinotecas cubren el muro norte
    zocaloMadera(sala, l);
  }
  // Muro norte del comedor: zócalo solo en los tramos libres (lo resuelve Comedor.js).
  ctx.caraMuro = cara; ctx.huecosDe = huecosDe; ctx.zocaloMadera = zocaloMadera;

  // Baños: azulejo metro hasta 1,5 m con cenefa verde; encima pintura salvia.
  for (const sala of ['damas', 'caballeros']) for (const l of 'nsoe') {
    const f = cara(sala, l), hs = huecosDe(sala, l);
    const capa = (material, y0, y1, grosor) => {
      for (const [u0, u1, b0, b1] of tramos(f.a0, f.a1, y0, y1, hs)) {
        const c = (u0 + u1) / 2, len = u1 - u0, y = (b0 + b1) / 2, dd = f.fijo + f.off + f.normal * grosor / 2;
        if (f.eje === 'x') lote.caja(material, c, y, dd, len, b1 - b0, grosor, { contorno: false });
        else lote.caja(material, dd, y, c, grosor, b1 - b0, len, { contorno: false });
      }
    };
    capa(pared, 0, 1.5, .012);
    capa('verdeBano', 1.5, 1.58, .03);
    capa(estucoBano, 1.58, H, .006);
    capa('verdeBano', 0, .1, .02);
  }

  // 3. Suelos: madera en recepción, comedor y pasillo; hexágono en los baños.
  const suelo = (material, x0, z0, x1, z1) => lote.caja(material, (x0 + x1) / 2, -.05, (z0 + z1) / 2, x1 - x0, .1, z1 - z0, { contorno: false });
  suelo(piso, -10, -5, 10, 0.02); suelo(piso, -3, -10, 10, -5); suelo(piso, -5, -10, -3, -5);
  suelo(pisoBano, -10, -10, -5, -5);
  // Umbrales de latón en las puertas de los baños.
  for (const h of [PUERTA_DAMAS, PUERTA_CAB]) lote.caja(kit.metal('laton', .5), -5, .006, (h.a0 + h.a1) / 2, .22, .012, h.a1 - h.a0, { contorno: false });
  // Encerado: un único espejo tenue sobre todo el interior.
  const brillo = crearSueloBrillante({ ancho: 20, fondo: 10, fuerza: .32, caida: 1.4, rect: [-10, -10, 10, 0] });
  brillo.position.set(0, .004, -5); grupo.add(brillo);

  // 4. Techo de estuco con vigas de madera oscura (comedor y recepción) y
  //    moldura perimetral; techo liso en baños y pasillo.
  lote.caja(techo, 0, H + .05, -5, 20.4, .1, 10.4, { contorno: false });
  for (let x = -2.4; x < 9.9; x += 1.3) lote.caja('viga', x, H - .12, -5, .16, .24, 9.8, { contorno: 'fino', nombre: 'la viga de madera' });
  lote.caja('viga', 3.5, H - .2, -5, 12.8, .32, .24, { contorno: 'fino', nombre: 'la viga maestra' });
  for (let x = -9.35; x < -3.2; x += 1.3) lote.caja('viga', x, H - .12, -2.5, .16, .24, 4.8, { contorno: 'fino', nombre: 'la viga de madera' });
  // cornisa de madera bajo el techo en recepción y comedor
  for (const [sala, lados] of [['recepcion', 'nsoe'], ['comedor', 'nsoe']]) for (const l of lados) {
    const f = cara(sala, l), hs = huecosDe(sala, l).filter(h => h.y1 > H - .3);
    for (const [u0, u1] of tramos(f.a0, f.a1, H - .16, H, hs)) {
      const c = (u0 + u1) / 2, len = u1 - u0, dd = f.fijo + f.off + f.normal * .04;
      if (f.eje === 'x') lote.caja('vigaClara', c, H - .08, dd, len, .16, .08, { contorno: false });
      else lote.caja('vigaClara', dd, H - .08, c, .08, .16, len, { contorno: false });
    }
  }
  return { estuco, piso };
}
