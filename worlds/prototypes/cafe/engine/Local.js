import * as T from './three.js';
import { crearMaterialToon, normalDesdeAltura } from './Luz25D.js';
import { MARCA, pintarEmblema } from './Marca.js';
import { PALETA, lienzo, texturaBaldosa, ilustracion, azar } from './Kit.js';
import { LOCAL, MURO, ALTO_TECHO, FACHADA, PUERTA, TOLDO, ACERA, CALZADA, FONDO_CALLE, VECINOS,
  LISTONES, SANITARIOS, zFrenteBarra, zContrabarra, BARRA } from './config.js';

/* Casco de la cafetería (marca en Marca.js): piso de madera, muros (ladrillo al este), techo
   oscuro con listones sobre el salón y rieles sobre la barra, fachada de vidrio
   con puerta doble, letrero, toldo y la calle.  Todo derivado de config.js. */

const X0 = LOCAL.x0, X1 = LOCAL.x1, Z0 = LOCAL.z0, Z1 = LOCAL.z1;

/** Tablas de madera: albedo neutro con vetas + altura (juntas hondas).  Un módulo = 1,6 m. */
export function texturaTablas({ tonos = ['#b88a5c', '#a97c50', '#c29467', '#9f7248'], lado = 512, filas = 8 } = {}) {
  const albedo = document.createElement('canvas'), altura = document.createElement('canvas');
  albedo.width = albedo.height = altura.width = altura.height = lado;
  const g = albedo.getContext('2d'), h = altura.getContext('2d'), r = azar(11), fh = lado / filas;
  h.fillStyle = '#000'; h.fillRect(0, 0, lado, lado);
  for (let f = 0; f < filas; f++) {
    let x = -r() * lado * .5;
    while (x < lado) {
      const w = lado * (.35 + r() * .4), y = f * fh;
      g.fillStyle = tonos[Math.floor(r() * tonos.length)]; g.fillRect(x, y, w, fh);
      // vetas: detalle que no es luz (ESTILO.md §3)
      g.strokeStyle = 'rgba(80,50,25,.16)'; g.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) { const vy = y + fh * (.25 + k * .25) + (r() - .5) * 4; g.beginPath(); g.moveTo(x, vy); g.bezierCurveTo(x + w * .3, vy + 3, x + w * .6, vy - 3, x + w, vy); g.stroke(); }
      g.fillStyle = 'rgba(60,40,20,.55)'; g.fillRect(x, y, 2, fh); g.fillRect(x, y, w, 2);   // junta
      h.fillStyle = '#fff'; h.fillRect(x + 2, y + 2, w - 2, fh - 2);
      // envolver horizontalmente (la textura se repite)
      if (x + w > lado) { g.drawImage(albedo, lado, y, x + w - lado, fh, 0, y, x + w - lado, fh); h.drawImage(altura, lado, y, x + w - lado, fh, 0, y, x + w - lado, fh); }
      if (x < 0) { g.drawImage(albedo, 0, y, -x, fh, lado + x, y, -x, fh); h.drawImage(altura, 0, y, -x, fh, lado + x, y, -x, fh); }
      x += w;
    }
  }
  const map = new T.CanvasTexture(albedo); map.colorSpace = T.SRGBColorSpace; map.wrapS = map.wrapT = T.RepeatWrapping;
  map.anisotropy = 8; map.minFilter = T.LinearMipmapLinearFilter;
  return { map, normal: normalDesdeAltura(altura, { fuerza: 2, suavizado: .6, repetir: true }) };
}

/** Ladrillo visto: hiladas de 7,5 cm con junta clara.  Un módulo = 0,6 × 0,6 m. */
export function texturaLadrillo() {
  const lado = 256, albedo = document.createElement('canvas'), altura = document.createElement('canvas');
  albedo.width = albedo.height = altura.width = altura.height = lado;
  const g = albedo.getContext('2d'), h = altura.getContext('2d'), r = azar(3), hil = 8, lh = lado / hil, lw = lado / 2;
  g.fillStyle = '#d9cbb8'; g.fillRect(0, 0, lado, lado); h.fillStyle = '#000'; h.fillRect(0, 0, lado, lado);
  const tonos = ['#b5654a', '#a85b42', '#bf7155', '#9e5540', '#b8694f'];
  for (let f = 0; f < hil; f++) for (let i = -1; i < 3; i++) {
    const x = i * lw + (f % 2 ? lw / 2 : 0), y = f * lh;
    g.fillStyle = tonos[Math.floor(r() * tonos.length)]; g.fillRect(x + 3, y + 3, lw - 6, lh - 6);
    h.fillStyle = '#fff'; h.fillRect(x + 3, y + 3, lw - 6, lh - 6);
  }
  const map = new T.CanvasTexture(albedo); map.colorSpace = T.SRGBColorSpace; map.wrapS = map.wrapT = T.RepeatWrapping;
  map.anisotropy = 8; map.minFilter = T.LinearMipmapLinearFilter;
  return { map, normal: normalDesdeAltura(altura, { fuerza: 2.4, suavizado: .8, repetir: true }) };
}

export function construirLocal(ctx) {
  const { kit, lote, grupo, colisiones } = ctx;
  const muro = (x0, z0, x1, z1) => colisiones.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);

  // ── Piso de tablas y techo oscuro ────────────────────────────────────────
  const tab = texturaTablas();
  const piso = new T.Mesh(new T.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(-Math.PI / 2),
    crearMaterialToon({ albedo: tab.map, normal: tab.normal, repetir: [(X1 - X0) / 1.6, (Z1 - Z0) / 1.6], fuerzaNormal: .7 }));
  piso.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2); piso.name = 'piso';
  piso.userData.nombre = 'el piso de madera';
  const techo = new T.Mesh(new T.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(Math.PI / 2), crearMaterialToon({ color: PALETA.techo }));
  techo.position.set((X0 + X1) / 2, ALTO_TECHO, (Z0 + Z1) / 2); techo.name = 'techo';
  grupo.add(piso, techo); ctx.pulsables.push(piso);

  // ── Muros: oeste (liso), este (ladrillo visto) y fondo ──────────────────
  const H = ALTO_TECHO + .25;
  lote.bloque('paredCalida', X0 - MURO, 0, Z0 - MURO, X0, H, Z1, { contorno: false }); muro(X0 - MURO, Z0 - MURO, X0, Z1);
  lote.bloque('pared', X1, 0, Z0 - MURO, X1 + MURO, H, Z1, { contorno: false }); muro(X1, Z0 - MURO, X1 + MURO, Z1);
  lote.bloque('paredCalida', X0 - MURO, 0, Z0 - MURO, X1 + MURO, H, Z0, { contorno: false }); muro(X0 - MURO, Z0 - MURO, X1 + MURO, Z0);
  const lad = texturaLadrillo();
  const ladrillo = new T.Mesh(new T.PlaneGeometry(Z1 - Z0, ALTO_TECHO).rotateY(-Math.PI / 2),
    crearMaterialToon({ albedo: lad.map, normal: lad.normal, repetir: [(Z1 - Z0) / .6, ALTO_TECHO / .6], fuerzaNormal: .8 }));
  ladrillo.position.set(X1 - .004, ALTO_TECHO / 2, (Z0 + Z1) / 2); ladrillo.name = 'muro-ladrillo';
  ladrillo.userData.nombre = 'la pared de ladrillo';
  grupo.add(ladrillo); ctx.pulsables.push(ladrillo);
  // Zócalo de nogal (oeste y fondo; el ladrillo no lo lleva)
  lote.bloque('nogal', X0, 0, Z0, X0 + .015, .12, Z1, { contorno: false });
  lote.bloque('nogal', X0, 0, Z0, X1, .12, Z0 + .015, { contorno: false });

  // Puerta de los sanitarios (muro oeste, cerrada) con su rótulo
  const S = SANITARIOS;
  lote.bloque('nogal', X0, 0, S.z - S.ancho / 2 - .06, X0 + .03, S.alto + .06, S.z + S.ancho / 2 + .06, { contorno: 'medio' });
  lote.bloque('madera', X0 + .03, 0, S.z - S.ancho / 2, X0 + .06, S.alto, S.z + S.ancho / 2, { nombre: 'la puerta de los sanitarios' });
  lote.cil('cobre', X0 + .09, 1.02, S.z + S.ancho / 2 - .1, .045, .06, { rz: Math.PI / 2 });
  const rotSan = ilustracion(.5, .2, 256, (c, w, h) => {
    c.fillStyle = PALETA.verde; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f3ead8'; c.font = `600 ${h * .46}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Sanitarios', w / 2, h * .54);
  });
  rotSan.position.set(X0 + .07, S.alto + .28, S.z); rotSan.rotation.y = Math.PI / 2; rotSan.userData.nombre = 'los sanitarios <small>(también «los baños» o «el servicio»)</small>';
  grupo.add(rotSan); ctx.pulsables.push(rotSan);

  // ── Techo: listones sobre el salón y rieles de focos sobre la barra ──────
  const L = LISTONES;
  for (let z = L.z0 + L.paso / 2; z < L.z1; z += L.paso) lote.caja('liston', 0, L.y + L.canto / 2, z, X1 - X0, L.canto, L.ancho, { contorno: false });
  for (const x of [X0 + .01, X1 - .01]) lote.bloque('nogalOscuro', x - .01, L.y - .04, L.z0, x + .01, L.y + L.canto, L.z1, { contorno: false });
  const zRiel = (zContrabarra() + zFrenteBarra()) / 2;
  for (const z of [zRiel - .45, zRiel + .45]) {
    lote.caja('negro', (BARRA.x0 + X1) / 2, ALTO_TECHO - .03, z, X1 - BARRA.x0, .04, .05, { contorno: false });
    for (let x = BARRA.x0 + .6; x < X1; x += 1.2) {
      lote.cil('negro', x, ALTO_TECHO - .14, z, .08, .18, { rx: z < zRiel ? .5 : -.5 });
      lote.cil(kit.emisivo('#fff1cf'), x, ALTO_TECHO - .235, z + (z < zRiel ? -.045 : .045), .06, .01, { rx: z < zRiel ? .5 : -.5 });
    }
  }

  // ── Fachada (z = 0 … MURO hacia la calle) ─────────────────────────────
  const zF0 = Z1, zF1 = Z1 + MURO, V = FACHADA.vidrio, P = PUERTA;
  const px0 = P.x - P.ancho / 2, px1 = P.x + P.ancho / 2, vx1 = px0 - .15;
  lote.bloque('nogal', X0 - MURO, 0, zF0, V.x0, V.y1, zF1, { contorno: 'fino' });              // pilar oeste
  lote.bloque('nogal', vx1, 0, zF0, px0, V.y1, zF1, { contorno: 'fino' });                     // montante vidrio | puerta
  lote.bloque('nogal', px1, 0, zF0, X1 + MURO, V.y1, zF1, { contorno: 'fino' });               // pilar este
  lote.bloque('nogalOscuro', V.x0, 0, zF0 - .02, vx1, V.y0, zF1 + .02, { contorno: 'fino' });  // antepecho
  lote.bloque('marco', X0 - MURO, V.y1, zF0, X1 + MURO, FACHADA.alto, zF1, { contorno: 'fino' }); // franja superior
  lote.bloque('cobre', X0 - MURO, FACHADA.alto - .08, zF0, X1 + MURO, FACHADA.alto, zF1 + .04, { contorno: false });
  muro(X0 - MURO, zF0, px0, zF1); muro(px1, zF0, X1 + MURO, zF1);
  const paño = (vx1 - V.x0) / V.paños;
  for (let i = 0; i <= V.paños; i++) lote.caja('marco', V.x0 + paño * i, (V.y0 + V.y1) / 2, zF0 + MURO / 2, V.montante, V.y1 - V.y0, MURO * .7);
  lote.caja('marco', (V.x0 + vx1) / 2, V.y0 + .03, zF0 + MURO / 2, vx1 - V.x0, .06, MURO * .7);
  lote.caja('marco', (V.x0 + vx1) / 2, V.y1 - .03, zF0 + MURO / 2, vx1 - V.x0, .06, MURO * .7);
  const vidrio = new T.Mesh(new T.PlaneGeometry(vx1 - V.x0, V.y1 - V.y0), kit.vidrio('#cfe6ea', .2));
  vidrio.position.set((V.x0 + vx1) / 2, (V.y0 + V.y1) / 2, zF0 + MURO / 2); vidrio.renderOrder = 4; vidrio.name = 'fachada-vidrio';
  grupo.add(vidrio);
  // Marco de la puerta y montante de vidrio encima
  lote.bloque('marco', px0, P.alto, zF0, px1, P.alto + .08, zF1);
  const trans = new T.Mesh(new T.PlaneGeometry(P.ancho, V.y1 - P.alto - .08), kit.vidrio('#cfe6ea', .2));
  trans.position.set(P.x, (P.alto + .08 + V.y1) / 2, zF0 + MURO / 2); trans.renderOrder = 4; grupo.add(trans);
  lote.bloque('grafito', px0 + .05, 0, Z1 - 1.3, px1 - .05, .012, Z1 - .02, { contorno: false, nombre: 'el tapete de la entrada' });
  const puertas = construirPuertas(ctx, zF0 + MURO / 2);

  // ── Letrero y toldo ─────────────────────────────────────────────────────
  const [ly0, ly1] = FACHADA.letrero, lx0 = -2.6, lx1 = 2.6;
  lote.bloque('verdeOscuro', lx0, ly0, zF1, lx1, ly1, zF1 + FACHADA.vuelo, { contorno: 'fino' });
  const letrero = ilustracion(lx1 - lx0 - .1, ly1 - ly0 - .1, 2048, (c, w, h) => pintarLetrero(c, w, h), 'cartel');
  letrero.position.set((lx0 + lx1) / 2, (ly0 + ly1) / 2, zF1 + FACHADA.vuelo + .005); letrero.name = 'letrero';
  letrero.userData.nombre = `el letrero: <b>${MARCA.nombre}</b> <small>(el nombre de la cafetería)</small>`;
  grupo.add(letrero); ctx.pulsables.push(letrero);
  // Farolas de pared a los lados de la puerta (encendidas al atardecer y de noche)
  for (const x of [px0 - .35, px1 + .35]) {
    lote.bloque('marco', x - .06, 2.35, zF1, x + .06, 2.6, zF1 + .08);
    lote.cil(kit.emisivo('#ffe2a8'), x, 2.47, zF1 + .14, .12, .22, { lados: 8 });
    lote.cil('marco', x, 2.6, zF1 + .14, .16, .03, { lados: 8 });
    ctx.lamparas.push({ pos: [x, 2.4, zF1 + .5], color: '#ffd9a0', intensidad: 1, radio: 2.4, exterior: true });
  }
  construirToldo(ctx, zF1, V.x0 - .1, vx1 + .1);

  construirCalle(ctx);
  return { letrero, puertas };
}

// Letrero: emblema propio (estrella en círculo, Marca.js) y el nombre en letras blancas.
function pintarLetrero(c, w, h) {
  c.fillStyle = MARCA.colores.verdeCasa; c.fillRect(0, 0, w, h);
  pintarEmblema(c, h * .6, h / 2, h * .42);
  c.fillStyle = '#ffffff'; c.textBaseline = 'middle'; c.textAlign = 'left';
  c.font = `800 ${h * .46}px 'Arial Black', system-ui, sans-serif`;
  c.fillText(MARCA.nombre, h * 1.22, h * .44);
  c.fillStyle = MARCA.colores.dorado; c.font = `600 ${h * .15}px system-ui, sans-serif`;
  c.fillText(`${MARCA.lema} · CAFÉ DE ALTURA`, h * 1.26, h * .82);
}

/* Puerta doble de vidrio: hojas batientes con bisagra en las jambas; abren hacia la calle. */
function construirPuertas(ctx, z) {
  const { kit, grupo } = ctx, P = PUERTA, w = P.ancho / 2;
  const hojas = [];
  for (const lado of [-1, 1]) {
    const hoja = new T.Group(); hoja.name = lado < 0 ? 'hoja-oeste' : 'hoja-este';
    const s = -lado;                                   // la hoja se extiende hacia el centro
    const marco = kit.mat('marco');
    for (const [cx, cy, sx, sy] of [[.03, P.alto / 2, .06, P.alto], [w - .03, P.alto / 2, .06, P.alto], [w / 2, .08, w, .16], [w / 2, P.alto - .04, w, .08]]) {
      const m = new T.Mesh(kit.geo.caja, marco); m.position.set(s * cx, cy, 0); m.scale.set(sx, sy, .05); hoja.add(m);
    }
    const v = new T.Mesh(kit.geo.plano, kit.vidrio('#cfeaf2', .26)); v.position.set(s * w / 2, P.alto / 2, 0); v.scale.set(w - .12, P.alto - .24, 1);
    v.renderOrder = 4; hoja.add(v);
    // Jaladera vertical de cobre (ambas caras)
    for (const k of [-1, 1]) {
      const j = new T.Mesh(kit.geo.cil16, kit.mat('cobre')); j.scale.set(.03, .7, .03); j.position.set(s * (w - .14), 1.05, k * .07); hoja.add(j);
    }
    const rot = ilustracion(.34, .1, 256, (c, W, H) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); c.fillStyle = PALETA.verde;
      c.font = `bold ${H * .6}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lado < 0 ? 'EMPUJE' : 'JALE', W / 2, H * .55);
    });
    rot.position.set(s * w / 2, 1.3, .03); rot.userData.nombre = lado < 0 ? '«Empuje» <small>(también «Empujar»)</small>' : '«Jale» <small>(«Tire» en España, «Hale» en Colombia)</small>';
    hoja.add(rot); ctx.pulsables.push(rot);
    hoja.userData = { lado };
    hoja.position.set(P.x + lado * w, 0, z);
    grupo.add(hoja); hojas.push(hoja);
  }
  return hojas;
}

/** Abre las hojas hacia la calle cuando el jugador se acerca (giro en la bisagra). */
export function animarPuertas(hojas, jugador, dt) {
  const d = Math.hypot(jugador.x - PUERTA.x, jugador.z - LOCAL.z1);
  const abrir = d < PUERTA.radioApertura ? 1 : 0;
  for (const h of hojas) {
    const u = h.userData; u.t = u.t ?? 0;
    u.t += Math.sign(abrir - u.t) * Math.min(Math.abs(abrir - u.t), dt * 1.6);
    const e = u.t * u.t * (3 - 2 * u.t);
    h.rotation.y = u.lado * e * 1.35;                // oeste: -, este: +  → ambas hacia +z
  }
}

/* Toldo verde liso sobre el vidrio, con faldón recto y ribete cobre. */
function construirToldo(ctx, z0, x0, x1) {
  const t = TOLDO, ancho = x1 - x0, largo = Math.hypot(t.vuelo, t.caida);
  const lona = new T.Mesh(new T.PlaneGeometry(ancho, largo), crearMaterialToon({ color: PALETA.verde, doble: true }));
  lona.position.set((x0 + x1) / 2, t.y - t.caida / 2, z0 + t.vuelo / 2);
  lona.rotation.x = -Math.PI / 2 + Math.atan2(t.caida, t.vuelo);
  lona.name = 'toldo'; lona.userData.nombre = 'el toldo';
  const faldon = lienzo(1024, 64, (c, w, h) => {
    c.fillStyle = PALETA.verde; c.fillRect(0, 0, w, h); c.fillStyle = PALETA.cobre; c.fillRect(0, h * .78, w, h * .1);
  });
  const fal = new T.Mesh(new T.PlaneGeometry(ancho, .22), crearMaterialToon({ albedo: faldon, doble: true }));
  fal.position.set((x0 + x1) / 2, t.y - t.caida - .11, z0 + t.vuelo);
  ctx.grupo.add(lona, fal); ctx.pulsables.push(lona);
  for (const x of [x0 + .1, (x0 + x1) / 2, x1 - .1]) {
    const brazo = new T.Mesh(ctx.kit.geo.caja, ctx.kit.mat('marco'));
    brazo.scale.set(.03, .03, largo); brazo.position.copy(lona.position).setX(x); brazo.position.y -= .03; brazo.rotation.x = lona.rotation.x + Math.PI / 2;
    ctx.grupo.add(brazo);
  }
}

/* La calle: acera, bordillo, calzada, edificios vecinos y fondo pintado. */
function construirCalle(ctx) {
  const { lote, grupo } = ctx, W = ACERA.ancho, zF1 = LOCAL.z1 + MURO;
  const bal = texturaBaldosa({ a: '#d3ccbf', b: '#cbc4b6', junta: '#9f988b' });
  const acera = new T.Mesh(new T.PlaneGeometry(W, ACERA.z1 - zF1).rotateX(-Math.PI / 2),
    crearMaterialToon({ albedo: bal.map, normal: bal.normal, repetir: [W / 1.2, (ACERA.z1 - zF1) / 1.2], fuerzaNormal: .6 }));
  acera.position.set(0, 0, (zF1 + ACERA.z1) / 2);
  lote.bloque('bordillo', -W / 2, -CALZADA.bordillo, ACERA.z1, W / 2, 0, CALZADA.z0, { contorno: false });
  const calzada = new T.Mesh(new T.PlaneGeometry(W, CALZADA.z1 - CALZADA.z0).rotateX(-Math.PI / 2), crearMaterialToon({ color: PALETA.asfalto }));
  calzada.position.set(0, -CALZADA.bordillo, (CALZADA.z0 + CALZADA.z1) / 2);
  for (let x = -W / 2 + 1; x < W / 2; x += 3) lote.caja('raya', x, -CALZADA.bordillo + .003, (CALZADA.z0 + CALZADA.z1) / 2, 1.5, .004, .14, { contorno: false });
  const enfrente = new T.Mesh(new T.PlaneGeometry(W, FONDO_CALLE.z - CALZADA.z1).rotateX(-Math.PI / 2), crearMaterialToon({ color: PALETA.acera }));
  enfrente.position.set(0, 0, (CALZADA.z1 + FONDO_CALLE.z) / 2);
  lote.bloque('bordillo', -W / 2, -CALZADA.bordillo, CALZADA.z1, W / 2, 0, CALZADA.z1 + .2, { contorno: false });
  grupo.add(acera, calzada, enfrente);

  // Edificios vecinos: volumen 3D simple y fachada pintada (secundarios)
  const colores = ['#e9d3a8', '#9fc3c7'];
  [[-1, 0], [1, 1]].forEach(([lado, i]) => {
    const x0 = lado < 0 ? LOCAL.x0 - MURO - VECINOS.ancho : LOCAL.x1 + MURO, x1 = x0 + VECINOS.ancho, alto = VECINOS.alto[i];
    lote.bloque(colores[i], x0, 0, LOCAL.z0 - MURO, x1, alto, zF1 - .02, { contorno: 'fino' });
    const cara = ilustracion(VECINOS.ancho, alto, 1024, (c, w, h) => pintarEdificio(c, w, h, colores[i], i + 2), 'fondo');
    cara.position.set((x0 + x1) / 2, alto / 2, zF1 - .01); grupo.add(cara);
  });
  // Planta alta del propio edificio sobre la cafetería (fachada pintada)
  const alto = VECINOS.alto[0] - FACHADA.alto;
  lote.bloque('#e6d9c6', LOCAL.x0 - MURO, FACHADA.alto, LOCAL.z0 - MURO, LOCAL.x1 + MURO, FACHADA.alto + alto, zF1 - .02, { contorno: 'fino' });
  const alta = ilustracion(LOCAL.x1 - LOCAL.x0 + 2 * MURO, alto, 1024, (c, w, h) => pintarEdificio(c, w, h, '#e6d9c6', 9, 1), 'fondo');
  alta.position.set(0, FACHADA.alto + alto / 2, zF1 - .01); grupo.add(alta);

  // Fondo: fila de edificios de la avenida al otro lado de la calle (2D plano)
  const fondo = ilustracion(FONDO_CALLE.ancho, FONDO_CALLE.alto, 2048, (c, w, h) => {
    const r = azar(5); let x = 0, k = 0;
    while (x < w) {
      const cw = 110 + r() * 90, ch = h * (.45 + r() * .35);
      c.save(); c.translate(x, h - ch);
      pintarEdificio(c, cw, ch, ['#e9d3a8', '#d98f6b', '#9fc3c7', '#f0b8a8', '#b9d4a6', '#f5e1a4', '#c9bde0'][k % 7], k);
      c.restore(); x += cw; k++;
    }
    // árboles de la avenida delante de los edificios
    for (let i = 0; i < 26; i++) {
      const tx = (i + .5) * w / 26 + (r() - .5) * 20, ty = h - 14;
      c.fillStyle = '#6b4a31'; c.fillRect(tx - 3, ty - 60, 6, 60);
      c.fillStyle = i % 2 ? '#5d8f4e' : '#4f8246'; c.beginPath(); c.ellipse(tx, ty - 76, 30, 26, 0, 0, Math.PI * 2); c.fill();
    }
  }, 'fondo');
  fondo.position.set(0, FONDO_CALLE.alto / 2, FONDO_CALLE.z); fondo.rotation.y = Math.PI;
  grupo.add(fondo);
}

// Edificio de ciudad pintado: muro de color, cornisa, ventanas con marco y balcones.
function pintarEdificio(c, w, h, color, semilla, pisos = null) {
  const r = azar(semilla * 31 + 7);
  c.fillStyle = color; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f7f1e3'; c.fillRect(0, 0, w, h * .035);
  const n = pisos ?? Math.max(2, Math.round(h / (w * .45))), ph = h / n;
  for (let p = 0; p < n; p++) {
    const cols = Math.max(1, Math.round(w / (ph * .95)));
    for (let i = 0; i < cols; i++) {
      const cx = (i + .5) * w / cols, y = p * ph + ph * .22, vw = ph * .4, vh = ph * .5;
      c.fillStyle = '#f7f1e3'; c.fillRect(cx - vw / 2 - 4, y - 4, vw + 8, vh + 8);
      c.fillStyle = r() > .5 ? '#5b7a99' : '#4b6a86'; c.fillRect(cx - vw / 2, y, vw, vh);
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(cx - 1, y, 2, vh);
      if (r() > .55) { c.fillStyle = '#3a3d41'; c.fillRect(cx - vw / 2 - 8, y + vh - 4, vw + 16, 5); for (let k = 0; k < 6; k++) c.fillRect(cx - vw / 2 - 8 + k * (vw + 16) / 5, y + vh - 18, 2, 14); }
      if (r() > .7) { c.fillStyle = '#5d8f4e'; c.beginPath(); c.ellipse(cx - vw / 3, y + vh - 6, 9, 6, 0, 0, Math.PI * 2); c.fill(); }
    }
  }
}
