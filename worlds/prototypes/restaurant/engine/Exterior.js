import * as T from './three.js';
import { ALTO_TECHO as H, HUECOS, VENTANAS, VENTANA_Y } from './config.js';
import { lienzo, azar, materialSuperficie, texturaEstuco, ilustracion, PALETA } from './Kit.js';
import { luz, crearMaterialToon, crearReceptorSombra, profundidadRecortada } from './Luz25D.js';
import { crearVidrio } from './Reflejos.js';
import { tramos, HUECOS_FACHADA } from './Arquitectura.js';

/* ── Fachada, acera y calle ──────────────────────────────────────────────
   Cerca y protagonista → 3D (escaparate, toldos, planta alta con balcón).
   Lejos → 2D plano pintado (edificios de enfrente), según ESTILO.md §1. */

const TOLDO_Y = [3.02, 2.52], TOLDO_VUELO = 1.15;

function texturaAdoquin() {       // sampietrini: adoquín de basalto en hileras
  return lienzo(512, 512, (c, w) => {
    c.fillStyle = '#6d6a66'; c.fillRect(0, 0, w, w);
    const r = azar(21), n = 8, t = w / n;
    for (let j = 0; j < n; j++) for (let i = -1; i <= n; i++) {
      const x = i * t + (j % 2 ? t / 2 : 0), y = j * t;
      const k = 70 + r() * 40;
      c.fillStyle = `rgb(${k + 22},${k + 18},${k + 14})`;
      c.beginPath(); c.roundRect(x + 3, y + 3, t - 6, t - 6, 9); c.fill();
      c.fillStyle = 'rgba(255,255,255,.06)'; c.beginPath(); c.roundRect(x + 8, y + 7, t - 22, t * .35, 7); c.fill();
    }
  }, { repetir: true });
}
function texturaLosas() {        // acera de losas de piedra clara
  return lienzo(512, 512, (c, w) => {
    c.fillStyle = '#aaa294'; c.fillRect(0, 0, w, w);
    const r = azar(5), filas = 4;
    for (let j = 0; j < filas; j++) {
      let x = -r() * 200; const y = j * w / filas;
      while (x < w) {
        const largo = 150 + r() * 120, k = 196 + r() * 22;
        c.fillStyle = `rgb(${k},${k - 6},${k - 16})`; c.fillRect(x + 2, y + 2, largo - 4, w / filas - 4);
        for (let m = 0; m < 30; m++) { c.fillStyle = `rgba(120,110,95,${r() * .12})`; c.fillRect(x + r() * largo, y + r() * w / filas, 2, 2); }
        x += largo;
      }
    }
  }, { repetir: true });
}
function texturaToldo() {       // lona a rayas rojo/crema
  return lienzo(256, 64, (c, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? PALETA.toldoCrema : PALETA.toldoRojo; c.fillRect(i * w / n, 0, w / n, h); }
  }, { repetir: true });
}
function texturaFaldon() {      // faldón festoneado del toldo (con alfa)
  return lienzo(256, 64, (c, w, h) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 2 ? PALETA.toldoCrema : PALETA.toldoRojo;
      c.beginPath(); c.moveTo(i * w / n, 0); c.lineTo((i + 1) * w / n, 0); c.lineTo((i + 1) * w / n, h * .55);
      c.quadraticCurveTo((i + .5) * w / n, h * 1.15, i * w / n, h * .55); c.closePath(); c.fill();
    }
  });
}
// Rótulo del escaparate: verde botella, letras doradas con filete.
function dibujarRotulo(c, w, h) {
  c.fillStyle = '#1d4633'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#d9ab4a'; c.lineWidth = h * .035; c.strokeRect(h * .08, h * .1, w - h * .16, h * .8);
  c.lineWidth = h * .012; c.strokeRect(h * .14, h * .17, w - h * .28, h * .66);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#10281d'; c.font = `italic bold ${h * .52}px Georgia, 'Times New Roman', serif`;
  c.fillText('Trattoria  La Nonna', w / 2 + h * .025, h * .5 + h * .03);
  const g = c.createLinearGradient(0, h * .25, 0, h * .75);
  g.addColorStop(0, '#f7dc8a'); g.addColorStop(.5, '#e0b24f'); g.addColorStop(1, '#b8862f');
  c.fillStyle = g; c.fillText('Trattoria  La Nonna', w / 2, h * .5);
  c.font = `${h * .16}px Georgia, serif`; c.fillStyle = '#e8c56d';
  c.fillText('CUCINA  CASALINGA  ·  DAL  1962', w * .16, h * .5); c.fillText('PASTA  FRESCA  ·  PIZZA  ·  VINI', w * .84, h * .5);
}
// Edificios de enfrente: ilustración plana (lejos → 2D).
function dibujarEnfrente(c, w, h) {
  const r = azar(33), cielo = c.createLinearGradient(0, 0, 0, h);
  c.clearRect(0, 0, w, h);
  const colores = ['#e8b77a', '#d98f6b', '#efd49a', '#c97c5d', '#e6c79a', '#dba273', '#f0c9a0', '#b9785a'];
  let x = 0, i = 0;
  // campanario lejano
  c.fillStyle = '#c9a383'; c.fillRect(w * .62, h * .06, w * .035, h * .5);
  c.fillStyle = '#a77f63'; c.beginPath(); c.moveTo(w * .615, h * .07); c.lineTo(w * .6375, h * .01); c.lineTo(w * .66, h * .07); c.fill();
  c.fillStyle = '#6d5646'; c.fillRect(w * .628, h * .1, w * .018, h * .05);
  while (x < w) {
    const ancho = w * (.07 + r() * .05), alto = h * (.5 + r() * .3), y0 = h - alto;
    const color = colores[i++ % colores.length];
    c.fillStyle = color; c.fillRect(x, y0, ancho + 1, alto);
    // tejado y cornisa
    c.fillStyle = '#9c4d33'; c.fillRect(x - 4, y0 - h * .015, ancho + 8, h * .02);
    c.fillStyle = 'rgba(255,245,225,.55)'; c.fillRect(x, y0 + h * .01, ancho, h * .012);
    // ventanas con persianas verdes
    const cols = Math.max(2, Math.round(ancho / (w * .025))), filas = Math.floor((alto - h * .2) / (h * .13));
    for (let f = 0; f < filas; f++) for (let k = 0; k < cols; k++) {
      const vx = x + ancho * (k + .5) / cols, vy = y0 + h * .06 + f * h * .13, vw = w * .008, vh = h * .075;
      c.fillStyle = '#3b2f2a'; c.fillRect(vx - vw / 2, vy, vw, vh);
      c.fillStyle = r() > .4 ? '#3d7a52' : '#4f6f5a';
      c.fillRect(vx - vw * 1.25, vy, vw * .7, vh); c.fillRect(vx + vw * .55, vy, vw * .7, vh);
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(vx - vw * .8, vy + vh, vw * 1.6, h * .006);
      if (r() > .7) { c.fillStyle = '#c8433a'; c.fillRect(vx - vw * .7, vy + vh - h * .012, vw * 1.4, h * .012); }
    }
    // planta baja: portales y tiendas
    c.fillStyle = 'rgba(60,40,30,.8)';
    c.fillRect(x + ancho * .2, h - h * .13, ancho * .22, h * .13);
    c.fillStyle = r() > .5 ? '#7a3a2f' : '#2f5a42'; c.fillRect(x + ancho * .5, h - h * .12, ancho * .35, h * .12);
    if (r() > .5) { c.fillStyle = '#e9e1cf'; c.fillRect(x + ancho * .48, h - h * .145, ancho * .39, h * .025); }
    x += ancho;
  }
}

export function construirExterior(ctx) {
  const { kit, lote, grupo, colisiones } = ctx;
  const verde = 'verdeTienda', dorado = kit.metal('dorado', .45);

  // ── Suelo de la calle ──────────────────────────────────────────────
  const acera = materialSuperficie({ map: texturaLosas(), metros: 2.4 });
  const adoquin = materialSuperficie({ map: texturaAdoquin(), metros: 1.1 });
  lote.caja(acera, 0, -.06, 2.25, 80, .12, 4.3, { contorno: false });
  lote.caja('bordillo', 0, -.08, 4.47, 80, .16, .24, { contorno: 'fino' });
  lote.caja(adoquin, 0, -.2, 8.1, 80, .1, 7.1, { contorno: false });
  lote.caja('bordillo', 0, -.08, 11.73, 80, .16, .24, { contorno: 'fino' });
  lote.caja(acera, 0, -.06, 13.9, 80, .12, 4.1, { contorno: false });
  // receptores de la sombra del sol (toldos, mesas, macetas) en la acera y la fachada
  const receptor = new T.Mesh(new T.PlaneGeometry(40, 16), crearReceptorSombra(1));
  receptor.rotation.x = -Math.PI / 2; receptor.position.set(0, .003, 7.9); receptor.receiveShadow = true; grupo.add(receptor);
  const receptorFachada = new T.Mesh(new T.PlaneGeometry(20.3, 8), crearReceptorSombra(.8));
  receptorFachada.position.set(0, 4, .245); receptorFachada.receiveShadow = true; grupo.add(receptorFachada);
  ctx.sombraSol = [];

  // ── Planta baja: escaparate de madera verde ───────────────────────
  const Z = .15;
  for (const [u0, u1, y0, y1] of tramos(-10.15, 10.15, 0, 3.1, HUECOS_FACHADA.map(h => ({ ...h, a0: h.a0 - .02, a1: h.a1 + .02 })))) {
    lote.caja(verde, (u0 + u1) / 2, (y0 + y1) / 2, Z + .03, u1 - u0, y1 - y0, .06, { contorno: false });
  }
  // pilastras con basa y capitel entre huecos
  const bordes = [-10.15, ...HUECOS_FACHADA.flatMap(h => [h.a0, h.a1]).sort((a, b) => a - b), 10.15];
  for (let i = 0; i < bordes.length; i += 2) {
    const a = bordes[i], b = bordes[i + 1], c = (a + b) / 2, w = Math.min(b - a, .5);
    if (b - a < .15) continue;
    lote.caja('verdeTiendaClaro', c, 1.55, Z + .09, w - .06, 3.1, .08, { contorno: 'medio', nombre: 'la pilastra' });
    lote.caja(verde, c, .12, Z + .12, w + .04, .24, .12, { contorno: 'medio' });
    lote.caja(dorado, c, 2.98, Z + .13, w + .02, .05, .1, { contorno: false });
    lote.caja(verde, c, 3.05, Z + .12, w + .06, .1, .12, { contorno: 'medio' });
  }
  // paneles bajo las ventanas con moldura
  for (const [x0, x1] of VENTANAS) {
    const c = (x0 + x1) / 2, w = x1 - x0;
    lote.caja(verde, c, VENTANA_Y[0] / 2, Z + .07, w, VENTANA_Y[0], .04, { contorno: false });
    lote.caja('verdeTiendaClaro', c, VENTANA_Y[0] / 2 + .02, Z + .1, w - .24, VENTANA_Y[0] - .3, .025, { contorno: 'fino' });
    lote.caja('piedra', c, VENTANA_Y[0] - .02, Z + .1, w + .12, .06, .22, { contorno: 'medio', nombre: 'el alféizar' });
  }
  // rótulo corrido
  lote.caja(verde, 0, 3.45, Z + .1, 20.3, .7, .16, { contorno: 'fino' });
  const rotulo = ilustracion(11.5, .6, 2048, dibujarRotulo);
  rotulo.position.set(0, 3.45, Z + .185); grupo.add(rotulo);
  for (const s of [-1, 1]) {
    const lateral = ilustracion(3.6, .6, 512, (c, w, h) => { c.fillStyle = '#1d4633'; c.fillRect(0, 0, w, h); c.strokeStyle = '#d9ab4a'; c.lineWidth = h * .03; c.strokeRect(h * .1, h * .12, w - h * .2, h * .76);
      c.fillStyle = '#e0b24f'; c.font = `italic ${h * .34}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s < 0 ? 'Ristorante' : 'Pizzeria', w / 2, h * .52); });
    lateral.position.set(s * 8.1, 3.45, Z + .185); grupo.add(lateral);
  }
  lote.caja(dorado, 0, 3.08, Z + .19, 20.3, .04, .03, { contorno: false });
  lote.caja(dorado, 0, 3.82, Z + .19, 20.3, .04, .03, { contorno: false });
  lote.caja('cornisa', 0, 3.9, Z + .12, 20.5, .14, .36, { contorno: 'fino' });

  // ── Ventanales: marco verde, parteluz, montante y vidrio reflectante ─
  const vidrioFachada = crearVidrio({ tinte: '#9fc3c9', opacidad: .1, fuerza: 1, fuera: [0, 0, 1] });
  ctx.vidrioFachada = vidrioFachada;
  for (const [x0, x1] of VENTANAS) {
    const c = (x0 + x1) / 2, w = x1 - x0, [y0, y1] = VENTANA_Y, hy = y1 - y0, trave = y1 - .5;
    const marco = (x, y, ww, hh) => lote.caja(verde, x, y, .03, ww, hh, .09, { contorno: 'medio' });
    marco(c, y0 + .03, w, .06); marco(c, y1 - .03, w, .06); marco(c, trave, w, .06);
    marco(x0 + .03, (y0 + y1) / 2, .06, hy); marco(x1 - .03, (y0 + y1) / 2, .06, hy);
    const partes = Math.max(1, Math.round(w / 1.1));
    for (let k = 1; k < partes; k++) marco(x0 + w * k / partes, (y0 + trave) / 2, .05, trave - y0);
    // montante: cuarterones pequeños
    for (let k = 1; k < partes * 2; k++) lote.caja(verde, x0 + w * k / (partes * 2), (trave + y1) / 2, .03, .03, y1 - trave, .06, { contorno: false });
    const vidrio = new T.Mesh(new T.PlaneGeometry(w - .08, hy - .08), vidrioFachada);
    vidrio.position.set(c, (y0 + y1) / 2, .03); vidrio.renderOrder = 4; vidrio.userData.nombre = 'el vidrio del ventanal'; grupo.add(vidrio);
    ctx.pulsables.push(vidrio);
    // de noche, resplandor cálido del comedor visto desde la calle (cara trasera invisible desde dentro)
    const brillo = new T.Mesh(new T.PlaneGeometry(w - .08, hy - .08), new T.MeshBasicMaterial({ color: '#ffb35c', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    brillo.position.set(c, (y0 + y1) / 2, -.1); brillo.renderOrder = 5; brillo.raycast = () => {};
    grupo.add(brillo); luz.registrarDecal(brillo, .16, 'noche');
    // jambas interiores del hueco (estuco del grosor del muro)
  }

  // ── Toldos a rayas sobre ventanas y puerta ─────────────────────────
  const lona = crearMaterialToon({ albedo: texturaToldo(), doble: true, bandas: 2 });
  const faldonMat = crearMaterialToon({ albedo: texturaFaldon(), doble: true, corteAlfa: .5, bandas: 2 });
  const toldos = [...VENTANAS.filter(([a]) => a > -9), [HUECOS.entrada.x - HUECOS.entrada.ancho / 2, HUECOS.entrada.x + HUECOS.entrada.ancho / 2], [-9.4, -8.1]];
  for (const [x0, x1] of toldos) {
    const w = x1 - x0 + .5, c = (x0 + x1) / 2;
    const largo = Math.hypot(TOLDO_VUELO, TOLDO_Y[0] - TOLDO_Y[1]), ang = Math.atan2(TOLDO_Y[0] - TOLDO_Y[1], TOLDO_VUELO);
    const g = new T.PlaneGeometry(w, largo); g.getAttribute('uv').array.forEach((_, i, a) => { if (i % 2 === 0) a[i] *= w / 1.6; });
    const tela = new T.Mesh(g, lona);
    tela.position.set(c, (TOLDO_Y[0] + TOLDO_Y[1]) / 2, Z + .2 + TOLDO_VUELO / 2); tela.rotation.x = -Math.PI / 2 + ang;
    tela.castShadow = true; tela.userData.nombre = 'el toldo'; grupo.add(tela); ctx.pulsables.push(tela);
    const gf = new T.PlaneGeometry(w, .24); gf.getAttribute('uv').array.forEach((_, i, a) => { if (i % 2 === 0) a[i] *= w / 1.6; });
    const faldon = new T.Mesh(gf, faldonMat);
    faldon.position.set(c, TOLDO_Y[1] - .11, Z + .2 + TOLDO_VUELO); faldon.castShadow = true;
    faldon.customDepthMaterial = profundidadRecortada(faldonMat.uniforms.uAlbedo.value); grupo.add(faldon);
    // brazos y tubo del toldo
    lote.cil('hierro', c, TOLDO_Y[1], Z + .2 + TOLDO_VUELO, .04, w, { rz: Math.PI / 2, contorno: 'medio' });
    for (const s of [-1, 1]) lote.caja('hierro', c + s * (w / 2 - .05), (TOLDO_Y[0] + TOLDO_Y[1]) / 2 - .06, Z + .2 + TOLDO_VUELO / 2, .025, .025, largo, { rx: ang, contorno: 'medio' });
    lote.caja('hierro', c, TOLDO_Y[0] + .03, Z + .22, w, .08, .08, { contorno: 'medio' });
  }

  // ── Planta alta: estuco anaranjado, ventanas con persianas, balcón ──
  const estucoFachada = materialSuperficie({ map: texturaEstuco(PALETA.fachada, 17), metros: 2.6, bandas: 3 });
  const huecosAltos = [-7.3, -2.45, 2.45, 7.3].map(x => ({ a0: x - .6, a1: x + .6, y0: 4.55, y1: 6.75 }));
  for (const [u0, u1, y0, y1] of tramos(-10.15, 10.15, 3.97, 8.1, huecosAltos)) lote.caja(estucoFachada, (u0 + u1) / 2, (y0 + y1) / 2, 0, u1 - u0, y1 - y0, .3, { contorno: false });
  lote.caja('cornisa', 0, 4.12, .2, 20.3, .1, .14, { contorno: 'fino' });                  // imposta
  const vidrioAlto = crearVidrio({ tinte: '#6f8a93', opacidad: .55, fuerza: 1.05, fuera: [0, 0, 1] });
  const persiana = crearMaterialToon({ color: PALETA.persiana, bandas: 3, albedo: lienzo(64, 256, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#b9c7bb'; for (let y = 0; y < h; y += 12) c.fillRect(0, y, w, 4);
    c.fillStyle = '#d7e0d8'; c.fillRect(0, 0, 5, h); c.fillRect(w - 5, 0, 5, h);
  }) });
  for (const h of huecosAltos) {
    const c = (h.a0 + h.a1) / 2, w = h.a1 - h.a0, cy = (h.y0 + h.y1) / 2, hh = h.y1 - h.y0;
    lote.caja('#3a302b', c, cy, -.12, w, hh, .04, { contorno: false });                               // penumbra interior
    if (c === -7.3 || c === 2.45) {        // de noche, los vecinos de arriba tienen la luz encendida
      const calido = new T.Mesh(new T.PlaneGeometry(w, hh), new T.MeshBasicMaterial({ color: '#ffc877', transparent: true, opacity: 0 }));
      calido.position.set(c, cy, -.095); grupo.add(calido); luz.registrarDecal(calido, .95, 'noche');
    }
    const v = new T.Mesh(new T.PlaneGeometry(w - .1, hh - .1), vidrioAlto); v.position.set(c, cy, .02); v.renderOrder = 4; grupo.add(v);
    lote.caja('cornisa', c, cy, .02, .05, hh, .06, { contorno: false });                               // parteluz blanco
    lote.caja('cornisa', c, h.y0 + hh * .62, .02, w, .05, .06, { contorno: false });
    for (const s of [-1, 1]) lote.caja('cornisa', c + s * (w / 2 + .07), cy, .18, .14, hh + .1, .08, { contorno: 'medio' });   // recerco de piedra
    lote.caja('cornisa', c, h.y1 + .1, .19, w + .42, .14, .12, { contorno: 'medio' });
    lote.caja('cornisa', c, h.y1 + .23, .22, w + .52, .08, .18, { contorno: 'medio' });                 // guardapolvo
    for (const s of [-1, 1]) lote.pieza(kit.geo.caja, persiana, c + s * (w / 2 + .45), cy, .2, .58, hh - .05, .035, { contorno: 'medio', nombre: 'la persiana' });
    if (Math.abs(c) > 5) {       // jardinera con geranios
      lote.caja('terracota', c, h.y0 - .08, .36, w + .2, .2, .3, { contorno: 'medio', nombre: 'la jardinera' });
      lote.caja('piedra', c, h.y0 - .2, .24, w + .35, .06, .42, { contorno: 'medio' });
      const r = azar(Math.round(c * 10) + 50);
      for (let k = 0; k < 9; k++) {
        const x = c - w / 2 + (k + .5) * (w + .1) / 9, y = h.y0 + .08 + r() * .08;
        lote.esfera('hojaOscura', x, y, .38 + (r() - .5) * .12, .22, .17, .22, { contorno: 'medio' });
        if (k % 2 === 0) lote.esfera('geranio', x + .03, y + .1, .42, .12, .1, .12, { contorno: 'medio', nombre: 'el geranio' });
      }
    } else lote.caja('piedra', c, h.y0 - .05, .24, w + .3, .08, .34, { contorno: 'medio' });
  }
  // balcón de hierro forjado entre las dos ventanas centrales
  lote.caja('piedra', 0, 4.48, .55, 6.4, .14, .8, { contorno: 'medio', nombre: 'el balcón' });
  for (let x = -3.1; x <= 3.1; x += .155) lote.cil('hierro', x, 4.98, .9, .018, .88, { lados: 8, contorno: false });
  lote.caja('hierro', 0, 5.43, .9, 6.3, .04, .05, { contorno: 'medio' });
  lote.caja('hierro', 0, 4.6, .9, 6.3, .03, .04, { contorno: false });
  for (const s of [-1, 1]) lote.caja('hierro', s * 3.15, 5.0, .55, .04, .04, .7, { contorno: false }), lote.caja('hierro', s * 3.15, 5.43, .55, .04, .04, .7, { contorno: false });
  for (const x of [-2.2, 0, 2.2]) {       // macetas en el balcón
    lote.cil('maceta', x, 4.7, .5, .3, .28, { contorno: 'medio' });
    lote.esfera('hoja', x, 4.98, .5, .5, .42, .45, { contorno: 'medio' });
    lote.esfera('geranio', x + .1, 5.08, .6, .12, .1, .12, { contorno: false }); lote.esfera('geranio', x - .12, 5.02, .55, .11, .09, .11, { contorno: false });
  }
  // cornisa superior con canecillos y alero de teja
  lote.caja('cornisa', 0, 8.18, .22, 20.5, .16, .5, { contorno: 'fino' });
  for (let x = -9.8; x <= 9.8; x += .7) lote.caja('cornisa', x, 7.98, .3, .12, .24, .3, { contorno: false });
  lote.caja('cornisa', 0, 7.84, .2, 20.4, .08, .16, { contorno: false });
  const teja = crearMaterialToon({ color: '#ffffff', bandas: 3, albedo: lienzo(128, 64, (c, w, h) => {
    c.fillStyle = '#b8552f'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { c.fillStyle = '#c96a3f'; c.fillRect(x + 2, 0, 9, h); c.fillStyle = '#9b4426'; c.fillRect(x + 12, 0, 3, h); }
  }, { repetir: true }), repetir: [30, 3] });
  const tejado = new T.Mesh(new T.BoxGeometry(20.6, .12, 5), teja);
  tejado.position.set(0, 9.05, -1.9); tejado.rotation.x = -.38; grupo.add(tejado);

  // ── Faroles de pared junto a la puerta y lámpara de bandera ─────────
  const lampara = kit.emisivo('#ffe2a8');
  for (const s of [-1, 1]) {
    const x = HUECOS.entrada.x + s * 1.35, y = 2.55;
    lote.caja('negro', x, y - .45, Z + .12, .08, .12, .1, { contorno: 'medio' });
    lote.caja('negro', x, y - .2, Z + .3, .04, .04, .32, { contorno: 'medio' });
    lote.cil('negro', x, y - .1, Z + .42, .22, .05, { lados: 8, contorno: 'medio', nombre: 'el farol' });
    lote.pieza(kit.geo.cil8, crearVidrio({ tinte: '#fff0c8', opacidad: .45, fuerza: .6 }), x, y - .28, Z + .42, .18, .3, .18);
    lote.cil(lampara, x, y - .28, Z + .42, .07, .14, { lados: 8 });
    lote.pieza(kit.geo.cono, 'negro', x, y - .03, Z + .42, .26, .14, .26, { contorno: 'medio' });
    ctx.lamparas.push({ pos: [x, y - .3, Z + .6], color: '#ffd9a0', intensidad: 1.2, radio: 2.6, exterior: true });
  }
  // cartel de bandera ovalado
  lote.caja('hierro', HUECOS.entrada.x + 1.8, 3.02, Z + .55, .03, .03, .8, { contorno: 'medio' });
  const bandera = ilustracion(.62, .44, 512, (c, w, h) => {
    c.fillStyle = '#1d4633'; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#e0b24f'; c.lineWidth = 10; c.beginPath(); c.ellipse(w / 2, h / 2, w / 2 - 14, h / 2 - 14, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#e0b24f'; c.textAlign = 'center'; c.font = `italic bold ${h * .2}px Georgia, serif`; c.fillText('La Nonna', w / 2, h * .42);
    c.font = `${h * .1}px Georgia, serif`; c.fillText('TRATTORIA', w / 2, h * .62);
    c.strokeStyle = '#f3ead6'; c.lineWidth = 6; for (const dx of [-26, 0, 26]) { c.beginPath(); c.moveTo(w / 2 + dx, h * .7); c.lineTo(w / 2 + dx, h * .82); c.stroke(); }
  });
  bandera.material.side = T.DoubleSide; bandera.material.transparent = true; bandera.material.alphaTest = .5;
  bandera.rotation.y = Math.PI / 2; bandera.position.set(HUECOS.entrada.x + 1.8, 2.72, Z + .72); grupo.add(bandera);
  lote.caja('hierro', HUECOS.entrada.x + 1.8, 2.97, Z + .72, .02, .06, .02, { contorno: false });

  // ── Mobiliario de terraza en la acera ──────────────────────────────
  const r = azar(90);
  const mesaFuera = (x, z) => lote.en(x, 0, z, 0, () => {
    lote.cil(kit.esmalte('marmol', .25), 0, .74, 0, .66, .03, { lados: 24, contorno: 'medio', nombre: 'la mesa de terraza' });
    lote.cil('hierro', 0, .38, 0, .05, .72, { lados: 8, contorno: 'medio' });
    lote.cil('hierro', 0, .02, 0, .44, .04, { lados: 16, contorno: 'medio' });
    lote.sombra(0, 0, 1, 1, 1);
    for (const s of [-1, 1]) lote.en(s * .62, 0, 0, -s * Math.PI / 2 + (r() - .5) * .3, () => sillaBistro(lote, kit));
    colisiones.push([x - .4, z - .4, x + .4, z + .4]);
  });
  mesaFuera(-.7, 1.55); mesaFuera(3.3, 1.55); mesaFuera(7.3, 1.55);
  // macetones de laurel a los lados de la puerta
  for (const s of [-1, 1]) {
    const x = HUECOS.entrada.x + s * 1.25, z = .62;
    lote.en(x, 0, z, 0, () => {
      lote.caja('terracota', 0, .3, 0, .5, .6, .5, { contorno: 'medio', nombre: 'el macetero' });
      lote.caja('ladrilloOscuro', 0, .58, 0, .56, .06, .56, { contorno: 'medio' });
      lote.cil('tronco', 0, .95, 0, .05, .8, { lados: 8, contorno: 'medio' });
      lote.esfera('hoja', 0, 1.55, 0, .62, .58, .62, { contorno: 'medio', nombre: 'el laurel' });
      lote.esfera('hojaOscura', .12, 1.4, .1, .4, .34, .4, { contorno: false });
      lote.sombra(0, 0, .9, .9, 1);
    });
    colisiones.push([x - .3, z - .3, x + .3, z + .3]);
  }
  // pizarra de caballete
  lote.en(-4.3, 0, 1.25, -.25, () => {
    for (const s of [-1, 1]) {
      lote.caja('roble', 0, .52, s * .12, .62, 1.04, .03, { rx: s * .2, contorno: 'medio', nombre: 'la pizarra' });
      lote.caja('pizarra', 0, .56, s * .136, .52, .78, .01, { rx: s * .2, contorno: false });
    }
    lote.sombra(0, 0, .8, .6, .8);
  });
  const menu = ilustracion(.5, .76, 512, dibujarPizarra);
  menu.position.set(-4.3 + Math.sin(-.25) * .15, .56, 1.25 + Math.cos(-.25) * .15); menu.rotation.set(-.2, -.25, 0, 'YXZ'); grupo.add(menu);
  colisiones.push([-4.7, 1, -3.9, 1.5]);
  // farola de la calle
  for (const fx of [-12.5, 11.5]) lote.en(fx, 0, 4.0, 0, () => {
    lote.cil('farola', 0, .2, 0, .3, .4, { lados: 8, contorno: 'medio' });
    lote.cil('farola', 0, 2.2, 0, .12, 4, { lados: 8, contorno: 'medio', nombre: 'la farola' });
    lote.caja('farola', 0, 4.2, -.35, .06, .06, .75, { contorno: 'medio' });
    lote.pieza(kit.geo.cono, 'farola', 0, 4.25, -.7, .36, .22, .36, { contorno: 'medio' });
    lote.pieza(kit.geo.cil8, crearVidrio({ tinte: '#fff2cf', opacidad: .5, fuerza: .5 }), 0, 4.0, -.7, .26, .28, .26);
    lote.cil(lampara, 0, 4.02, -.7, .1, .16, { lados: 8 });
  });
  for (const fx of [-12.5, 11.5]) { ctx.lamparas.push({ pos: [fx, 3.9, 3.3], color: '#ffe0a8', intensidad: 1.3, radio: 4.2, exterior: true }); colisiones.push([fx - .2, 3.8, fx + .2, 4.2]); }

  // ── Vespa aparcada junto al bordillo ──────────────────────────────
  lote.en(5.6, 0, 3.75, Math.PI + .12, () => {
    const menta = kit.esmalte('#8fcfb9', .3, 2), cromoV = kit.metal('cromo', .6, 1), o = { contorno: 'medio', nombre: 'la Vespa' };
    lote.esfera(menta, -.28, .5, 0, .78, .5, .46, o);                        // carrocería trasera
    lote.caja(menta, .12, .3, 0, .6, .07, .3, o);                             // plataforma
    lote.caja(menta, .44, .6, 0, .08, .66, .44, { rz: -.18, ...o });          // escudo delantero
    lote.esfera(menta, .56, .3, 0, .34, .2, .2, o);                           // guardabarros
    lote.cil(cromoV, .5, .95, 0, .05, .5, { rz: .2, lados: 8, ...o });
    lote.cil('negro', .54, 1.18, 0, .04, .66, { rx: Math.PI / 2, lados: 8, ...o });   // manillar
    lote.esfera(cromoV, .6, 1.15, 0, .15, .15, .15, { contorno: 'medio', nombre: 'el faro' });
    lote.caja('#5a3a2a', -.2, .77, 0, .5, .08, .24, { contorno: 'medio', nombre: 'el asiento' });
    for (const x of [.56, -.46]) {
      lote.cil('negro', x, .16, 0, .32, .09, { rx: Math.PI / 2, lados: 16, contorno: 'medio', nombre: 'la rueda' });
      lote.cil(cromoV, x, .16, 0, .14, .1, { rx: Math.PI / 2, lados: 12, contorno: false });
    }
    lote.caja(cromoV, -.62, .78, 0, .24, .02, .22, { contorno: 'medio', nombre: 'el portaequipajes' });
    lote.cil(cromoV, -.5, .3, .16, .05, .3, { rz: Math.PI / 2, lados: 8, contorno: false, nombre: 'el tubo de escape' });
    lote.sombra(0, 0, 1.6, .7, 1);
  });
  colisiones.push([4.9, 3.45, 6.3, 4.05]);

  // ── Vecinos (secundarios) y edificios de enfrente (plano pintado) ───
  const vecino = (x0, x1, alto, color, semilla) => {
    const mat = crearMaterialToon({ bandas: 3, mundo: true, repetir: [1 / 3, 1 / 3.2], albedo: lienzo(256, 272, (c, w, h) => {
      c.fillStyle = color; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3b2f2a'; c.fillRect(w * .32, h * .2, w * .36, h * .5);
      c.fillStyle = '#48805a'; c.fillRect(w * .12, h * .2, w * .19, h * .5); c.fillRect(w * .69, h * .2, w * .19, h * .5);
      c.fillStyle = 'rgba(255,248,235,.8)'; c.fillRect(w * .28, h * .7, w * .44, h * .05); c.fillRect(w * .28, h * .15, w * .44, h * .05);
    }, { repetir: true }) });
    lote.caja(mat, (x0 + x1) / 2, alto / 2 + 3.2, -3, x1 - x0, alto, 6.4, { contorno: 'fino' });
    lote.caja(materialSuperficie({ map: texturaEstuco(color, semilla), metros: 2.4, bandas: 3 }), (x0 + x1) / 2, 1.6, -3, x1 - x0, 3.2, 6.4, { contorno: false });
    lote.caja('cornisa', (x0 + x1) / 2, alto + 3.25, .1, x1 - x0, .16, .4, { contorno: 'fino' });
    lote.caja('cornisa', (x0 + x1) / 2, 3.2, .05, x1 - x0, .12, .2, { contorno: false });
  };
  vecino(-26, -10.2, 6, '#ead9a6', 41); vecino(10.2, 26, 5.2, '#d9906e', 43);
  // portón de la persiana metálica del vecino y puerta de madera
  lote.caja('#8a8f92', -13.5, 1.3, .22, 3.2, 2.6, .05, { contorno: 'medio', nombre: 'la persiana metálica' });
  lote.caja('nogalOscuro', 13.2, 1.2, .22, 1.3, 2.4, .06, { contorno: 'medio', nombre: 'el portal' });
  colisiones.push([-40, -10, -10.1, .3], [10.1, -10, 40, .3]);
  const enfrente = ilustracion(80, 16, 4096, dibujarEnfrente, 'fondo');
  enfrente.material.transparent = true; enfrente.material.alphaTest = .5;
  enfrente.position.set(0, 8, 16); enfrente.rotation.y = Math.PI; grupo.add(enfrente);
  // límites de la calle
  colisiones.push([-40, 15.5, 40, 17], [-40, -1, -24, 17], [24, -1, 40, 17]);
}

export function dibujarPizarra(c, w, h) {
  c.fillStyle = '#2b2f2c'; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < 40; i++) c.fillRect(Math.random() * w, Math.random() * h, 30, 2);
  c.textAlign = 'center'; c.fillStyle = '#f4efe4';
  c.font = `italic bold ${w * .13}px Georgia, serif`; c.fillText('Menú del día', w / 2, h * .12);
  c.fillStyle = '#e0b24f'; c.fillRect(w * .2, h * .15, w * .6, 3);
  const platos = [['Bruschetta', '5 €'], ['Spaghetti carbonara', '12 €'], ['Lasaña de la nonna', '13 €'], ['Pizza margarita', '10 €'], ['Tiramisú', '6 €']];
  c.font = `${w * .066}px Georgia, serif`;
  platos.forEach(([p, e], i) => {
    const y = h * (.27 + i * .13);
    c.fillStyle = '#f4efe4'; c.textAlign = 'left'; c.fillText(p, w * .08, y);
    c.fillStyle = '#f2c14e'; c.textAlign = 'right'; c.fillText(e, w * .92, y);
  });
  c.fillStyle = '#c9e0c3'; c.textAlign = 'center'; c.font = `italic ${w * .07}px Georgia, serif`; c.fillText('¡Bienvenidos!', w / 2, h * .94);
}

/** Silla bistró de madera curvada (Thonet), mirando a +z local (el asiento da la espalda a -z). */
export function sillaBistro(lote, kit, { color = 'silla', asiento = 'enea' } = {}) {
  lote.cil(color, 0, .45, 0, .42, .04, { lados: 16, contorno: 'medio', nombre: 'la silla' });
  lote.cil(asiento, 0, .472, 0, .37, .012, { lados: 16, contorno: false });
  for (const [x, z] of [[-.15, .15], [.15, .15], [-.14, -.14], [.14, -.14]]) lote.cil(color, x * 1.08, .225, z * 1.08, .028, .45, { lados: 8, rx: z * .35, rz: -x * .35, contorno: 'medio' });
  lote.pieza(kit.geo.cil16, color, 0, .2, 0, .3, .02, .3, { contorno: false });   // aro
  for (const s of [-1, 1]) lote.cil(color, s * .16, .72, -.19, .026, .56, { lados: 8, rx: -.12, contorno: 'medio' });
  lote.caja(color, 0, .98, -.22, .36, .07, .03, { rx: -.12, contorno: 'medio' });
  lote.caja(color, 0, .74, -.2, .3, .04, .025, { rx: -.12, contorno: 'medio' });
  lote.sombra(0, 0, .55, .55, .9);
}
