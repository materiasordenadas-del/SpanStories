import * as T from './three.js';
import { crearMaterialToon, normalDesdeAltura } from './Luz25D.js';
import { MARCA, pintarEmblema } from './Marca.js';
import { PALETA, ilustracion, crearLoteColor } from './Kit.js';
import { LOCAL, ALTO_TECHO, BARRA, AZULEJO, MENUS, CONDIMENTOS, COLGANTES, COLGADOS,
  zContrabarra, zTrasMostrador, zFrenteBarra, centroTramo } from './config.js';
import { BEBIDAS, SECCIONES, TAMANOS, LECHES, EXTRAS, PAN } from './Carta.js';
import { formatear } from './Moneda.js';

/* La barra de la cafetería, de atrás adelante: contrabarra pegada al muro
   (azulejo, repisas, menús), pasillo del barista y mostrador por tramos
   (entrega · espresso · caja · vitrina · cierre).  Al oeste, la barra de
   condimentos.  Todo sale de BARRA/MENUS/CONDIMENTOS en config.js. */

const Z0 = LOCAL.z0, X1 = LOCAL.x1;
const TOPE = .04;                               // grosor de la encimera

/** Azulejo de la contrabarra: módulo de 4 × 4 piezas de 12 cm con un motivo de flor. */
function texturaAzulejo() {
  const lado = 256, n = 4, p = lado / n, j = 3;
  const albedo = document.createElement('canvas'), altura = document.createElement('canvas');
  albedo.width = albedo.height = altura.width = altura.height = lado;
  const g = albedo.getContext('2d'), h = altura.getContext('2d');
  g.fillStyle = '#cfc6b4'; g.fillRect(0, 0, lado, lado); h.fillStyle = '#000'; h.fillRect(0, 0, lado, lado);
  for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
    const x = i * p, y = k * p, cx = x + p / 2, cy = y + p / 2;
    g.fillStyle = '#f1ead9'; g.fillRect(x + j, y + j, p - 2 * j, p - 2 * j);
    h.fillStyle = '#fff'; h.fillRect(x + j, y + j, p - 2 * j, p - 2 * j);
    g.fillStyle = (i + k) % 2 ? '#1e3932' : '#00704a';
    for (let a = 0; a < 4; a++) { g.beginPath(); g.ellipse(cx + Math.cos(a * Math.PI / 2) * p * .2, cy + Math.sin(a * Math.PI / 2) * p * .2, p * .14, p * .09, a * Math.PI / 2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = PALETA.cobre; g.beginPath(); g.arc(cx, cy, p * .07, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1e3932';
    for (const [qx, qy] of [[x + j, y + j], [x + p - j, y + j], [x + j, y + p - j], [x + p - j, y + p - j]]) { g.beginPath(); g.arc(qx, qy, p * .1, 0, Math.PI * 2); g.fill(); }
  }
  const map = new T.CanvasTexture(albedo); map.colorSpace = T.SRGBColorSpace; map.wrapS = map.wrapT = T.RepeatWrapping;
  map.anisotropy = 8; map.minFilter = T.LinearMipmapLinearFilter;
  return { map, normal: normalDesdeAltura(altura, { fuerza: 2.2, suavizado: .7, repetir: true }) };
}

/** Lámpara colgante: cable, pantalla cónica de cobre y foco emisivo.  Añade su charco de luz. */
export function colgante(ctx, x, z, y, { color = 'cobre', diam = .34, alto = .26, intensidad = .9, radio = 2.3 } = {}) {
  const { lote, kit } = ctx;
  lote.cil('negro', x, (ALTO_TECHO + y + alto / 2) / 2, z, .012, ALTO_TECHO - y - alto / 2, { contorno: false });
  lote.cil('negro', x, ALTO_TECHO - .02, z, .1, .04, { contorno: false });
  lote.pieza(kit.geo.cono, color, x, y, z, diam, alto, diam, { contorno: 'medio', nombre: 'la lámpara' });
  lote.esfera(kit.emisivo('#fff0c8'), x, y - alto / 2, z, diam * .4, diam * .22, diam * .4);
  ctx.lamparas.push({ pos: [x, y - .3, z], color: '#ffe3b0', intensidad, radio });
}

export function construirBarra(ctx, { moneda }) {
  const { kit, lote, grupo, colisiones } = ctx;
  const zC = zContrabarra(), zT = zTrasMostrador(), zF = zFrenteBarra(), B = BARRA;
  const altoM = B.mostrador.alto, altoC = B.contrabarra.alto;
  const col = (x0, z0, x1, z1) => colisiones.push([x0, z0, x1, z1]);

  // ── Contrabarra: muebles bajos, encimera y lo que hay encima ─────────────
  lote.bloque('nogal', B.x0, 0, Z0, X1, altoC - TOPE, zC - .02, { contorno: 'fino', nombre: 'la contrabarra' });
  lote.bloque('encimera', B.x0, altoC - TOPE, Z0, X1, altoC, zC, { contorno: 'fino' });
  for (let x = B.x0 + .6; x < X1 - .1; x += .6) lote.bloque('nogalOscuro', x - .006, .12, zC - .025, x + .006, altoC - .08, zC - .015, { contorno: false });
  col(B.x0, Z0, X1, zC);
  // Azulejo del muro entre la encimera y la repisa
  const az = texturaAzulejo();
  const azulejo = new T.Mesh(new T.PlaneGeometry(X1 - B.x0, AZULEJO.y1 - AZULEJO.y0),
    crearMaterialToon({ albedo: az.map, normal: az.normal, repetir: [(X1 - B.x0) / .48, (AZULEJO.y1 - AZULEJO.y0) / .48], fuerzaNormal: .9 }));
  azulejo.position.set((B.x0 + X1) / 2, (AZULEJO.y0 + AZULEJO.y1) / 2, Z0 + .004); azulejo.name = 'azulejo';
  azulejo.userData.nombre = 'el azulejo <small>(«baldosa» o «cerámica» en otros países)</small>';
  grupo.add(azulejo); ctx.pulsables.push(azulejo);
  lote.bloque('nogal', B.x0, AZULEJO.y1, Z0, X1, AZULEJO.y1 + .04, Z0 + .26, { contorno: 'medio', nombre: 'la repisa' });   // repisa

  const yC = altoC;
  // Cafeteras de filtro (oeste) con jarras térmicas
  for (const [i, x] of [-2.75, -2.25].entries()) {
    lote.bloque('acero', x - .2, yC, Z0 + .08, x + .2, yC + .62, Z0 + .45, { nombre: 'la cafetera de filtro' });
    lote.bloque('negro', x - .16, yC + .5, Z0 + .43, x + .16, yC + .56, Z0 + .46, { contorno: false });
    lote.cil('negro', x, yC + .16, Z0 + .34, .16, .3, { nombre: 'el termo de café del día' });
    lote.cil('verde', x, yC + .33, Z0 + .34, .12, .04);
    if (i === 0) lote.bloque('cremaOscura', x + .24, yC, Z0 + .1, x + .6, yC + .02, Z0 + .5, { contorno: false });
  }
  // Licuadoras de frappé
  for (const x of [-1.55, -1.15]) {
    lote.bloque('negro', x - .1, yC, Z0 + .2, x + .1, yC + .18, Z0 + .4, { nombre: 'la licuadora <small>(«batidora» en España)</small>' });
    lote.cono(kit.vidrio('#e8f2f4', .5), x, yC + .36, Z0 + .3, .17, .36, { rx: Math.PI, contorno: false });
    lote.cil('negro', x, yC + .55, Z0 + .3, .16, .03);
  }
  // Botellas de jarabe en fila
  const jarabes = ['#8a4f2c', '#d9a441', '#6b3a20', '#c4495a', '#e8d9b0', '#3f7a52', '#b86f4c', '#8a4f2c'];
  jarabes.forEach((c, i) => {
    const x = -.7 + i * .12;
    lote.cil(c, x, yC + .15, Z0 + .18, .07, .3, { nombre: 'los jarabes' });
    lote.cil('negro', x, yC + .34, Z0 + .18, .03, .08, { contorno: false });
  });
  // Hielera, pilas de vasos, jarras de leche
  lote.bloque('acero', .4, yC, Z0 + .1, 1.0, yC + .08, Z0 + .52, { nombre: 'la hielera' });
  for (let i = 0; i < 4; i++) lote.cono(i % 2 ? 'blanco' : 'crema', 1.2 + i * .13, yC + .2, Z0 + .3, .09, .4, { rx: Math.PI, nombre: 'los vasos' });
  for (let i = 0; i < 3; i++) lote.cil('acero', 1.85 + i * .14, yC + .09, Z0 + .4, .09, .16, { nombre: 'la jarra de leche' });
  // Horno de pan y molino de café en grano
  lote.bloque('aceroOscuro', 2.7, yC, Z0 + .08, 3.35, yC + .42, Z0 + .55, { nombre: 'el horno' });
  lote.bloque(kit.emisivo('#e9a452'), 2.78, yC + .1, Z0 + .551, 3.1, yC + .32, Z0 + .556);
  lote.cil('grafito', 4.0, yC + .22, Z0 + .3, .22, .44, { nombre: 'el molino de café en grano' });
  lote.cono(kit.vidrio('#c79a6a', .55), 4.0, yC + .58, Z0 + .3, .24, .28, { rx: Math.PI, contorno: false });
  // Repisa: bolsas de café y tazas
  const bolsas = crearLoteColor(kit), m = new T.Matrix4();
  for (let x = B.x0 + .25, i = 0; x < X1 - .2; x += .22, i++) {
    const hueco = x > -.9 && x < .6;      // sobre los jarabes, tazas en lugar de bolsas
    if (hueco) { lote.cil('ceramica', x, AZULEJO.y1 + .1, Z0 + .13, .09, .11, { nombre: 'las tazas' }); continue; }
    m.compose(new T.Vector3(x, AZULEJO.y1 + .04 + .13, Z0 + .13), new T.Quaternion(), new T.Vector3(.14, .26, .08));
    bolsas.poner(kit.geo.caja, m.clone(), ['#00704a', '#b87333', '#6e4a2e', '#c4495a', '#d9a441'][i % 5], { id: 'bolsa', nivel: 'medio' });
  }

  // ── Menús colgados sobre la contrabarra ─────────────────────────────────
  const M = MENUS, ancho = (M.x1 - M.x0 - (M.n - 1) * M.separacion) / M.n;
  const tableros = [];
  for (let i = 0; i < M.n; i++) {
    const cx = M.x0 + ancho / 2 + i * (ancho + M.separacion), cy = (M.y0 + M.y1) / 2;
    lote.bloque('nogalOscuro', cx - ancho / 2 - .03, M.y0 - .03, Z0, cx + ancho / 2 + .03, M.y1 + .03, Z0 + .06, { contorno: 'fino' });
    const t = ilustracion(ancho, M.y1 - M.y0, 1024, () => {}, 'cartel');
    t.position.set(cx, cy, Z0 + .065); t.name = `menu-${i}`; t.userData.nombre = 'el menú <small>(también «la carta»)</small>';
    grupo.add(t); ctx.pulsables.push(t); tableros.push(t);
  }
  const pintarMenus = () => {
    const secciones = [...SECCIONES.map(s => ({ ...s, items: BEBIDAS.filter(b => b.seccion === s.id) })), { id: 'tamanos', titulo: 'Tamaños y extras' }];
    tableros.forEach((t, i) => t.userData.redibujar((c, w, h) => pintarMenu(c, w, h, secciones[i], moneda())));
  };

  // ── Mostrador por tramos ────────────────────────────────────────────────
  const tr = B.tramos;
  const cuerpo = (x0, x1, alto, nombre) => {
    lote.bloque('nogalOscuro', x0, 0, zT, x1, .1, zF - .04, { contorno: false });                 // zócalo retranqueado
    lote.bloque('madera', x0, .1, zT, x1, alto - TOPE, zF, { contorno: 'medio', nombre });
    lote.bloque('encimera', x0, alto - TOPE, zT - .02, x1, alto, zF + .03, { contorno: 'medio' });
    for (let x = x0 + .07; x < x1 - .03; x += .1) lote.bloque('maderaClara', x - .02, .14, zF, x + .02, alto - TOPE - .04, zF + .02, { contorno: false });   // listones del frente
  };
  cuerpo(tr.entrega[0], tr.entrega[1], altoM, 'la barra de entrega');
  cuerpo(tr.espresso[0], tr.espresso[1], altoM, 'la barra');
  cuerpo(tr.caja[0], tr.caja[1], B.altoCaja, 'la caja');
  cuerpo(tr.vitrina[0], tr.vitrina[1], .9, 'la vitrina');
  cuerpo(tr.cierre[0], tr.cierre[1], altoM, 'la barra');
  // Laterales altos entre tramos de distinta altura (la caja es más baja)
  for (const x of [tr.caja[0], tr.caja[1]]) lote.bloque('madera', x - .02, B.altoCaja, zT, x + .02, altoM, zF, { contorno: 'medio' });
  col(B.x0, zT - .02, X1, zF + .03);

  // Media puerta «Solo personal» cerrando el pasillo del barista por el oeste
  lote.bloque('madera', B.x0 - .05, .1, zC, B.x0, B.puertecilla, zT, { contorno: 'medio', nombre: 'la puertecilla del personal' });
  lote.bloque('encimera', B.x0 - .06, B.puertecilla, zC, B.x0 + .01, B.puertecilla + .03, zT, { contorno: false });
  col(B.x0 - .06, zC, B.x0, zT);
  const personal = ilustracion(.44, .14, 256, (c, w, h) => {
    c.fillStyle = PALETA.crema; c.fillRect(0, 0, w, h); c.fillStyle = PALETA.verde;
    c.font = `600 ${h * .52}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Solo personal', w / 2, h * .55);
  });
  personal.position.set(B.x0 - .055, .72, (zC + zT) / 2); personal.rotation.y = -Math.PI / 2; personal.userData.nombre = '«Solo personal» <small>(solo pueden pasar los empleados)</small>';
  grupo.add(personal); ctx.pulsables.push(personal);

  // Tramo de espresso: dos máquinas bajas (el cliente ve al barista por encima) y molinos
  for (const x of [-1.0, .75]) {
    lote.bloque('acero', x - .42, altoM, zT + .08, x + .42, altoM + .38, zF - .12, { nombre: 'la máquina de espresso' });
    lote.bloque('verde', x - .42, altoM + .06, zF - .125, x + .42, altoM + .3, zF - .115, { contorno: false });
    lote.bloque('grafito', x - .44, altoM + .38, zT + .06, x + .44, altoM + .42, zF - .1);
    for (const dx of [-.22, .22]) {                                                     // grupos hacia el barista
      lote.cil('aceroOscuro', x + dx, altoM + .2, zT + .02, .09, .06, { rx: Math.PI / 2 });
      lote.bloque('negro', x + dx - .015, altoM + .16, zT - .16, x + dx + .015, altoM + .19, zT + .02, { contorno: false });
    }
    lote.cil('acero', x + .5, altoM + .25, zT + .15, .025, .3, { rz: .25, contorno: false });   // lanceta de vapor
    lote.cil('grafito', x - .62, altoM + .2, zT + .3, .18, .4, { nombre: 'el molino' });
    lote.cono(kit.vidrio('#6b4a31', .6), x - .62, altoM + .52, zT + .3, .2, .24, { rx: Math.PI, contorno: false });
  }

  // Caja: pantalla hacia el cajero, pantalla hacia el cliente, terminal, vasos y plumón
  const xc = centroTramo('caja'), yK = B.altoCaja;
  lote.cil('grafito', xc - .2, yK + .1, zT + .3, .06, .2, { lados: 8 });
  lote.bloque('negro', xc - .43, yK + .18, zT + .2, xc + .03, yK + .5, zT + .24, { nombre: 'la caja registradora' });
  lote.bloque('grafito', xc + .12, yK, zF - .3, xc + .3, yK + .03, zF - .12, { contorno: false });
  lote.bloque('negro', xc + .15, yK + .02, zF - .26, xc + .27, yK + .06, zF - .12, { nombre: 'la terminal para pagar con tarjeta <small>(«datáfono» en Colombia y España)</small>' });
  lote.bloque(kit.emisivo('#b9e2d0'), xc + .17, yK + .061, zF - .24, xc + .25, yK + .062, zF - .19, { contorno: false });
  const pantalla = ilustracion(.36, .22, 512, (c, w, h) => pintarPantalla(c, w, h, null), 'cartel');
  lote.cil('grafito', xc - .2, yK + .12, zF - .2, .04, .24, { lados: 8 });
  pantalla.position.set(xc - .2, yK + .34, zF - .2); pantalla.rotation.x = -.2; pantalla.name = 'pantalla-cliente';
  pantalla.userData.nombre = 'la pantalla con el total';
  grupo.add(pantalla); ctx.pulsables.push(pantalla);
  for (let i = 0; i < 3; i++) lote.cono('blanco', xc + .55 + i * .13, yK + .22 + i * .02, zT + .25, .09 + i * .01, .44 + i * .04, { rx: Math.PI, nombre: 'los vasos para llevar' });
  lote.cil('negro', xc + .45, yK + .07, zF - .25, .016, .14, { rz: Math.PI / 2 - .2, nombre: 'el plumón <small>(«marcador» en otros países)</small>' });
  // Frasco de propinas
  lote.cil(kit.vidrio('#e8f2f4', .45), xc + .62, yK + .1, zF - .15, .12, .2, { contorno: false });
  lote.cil('cobre', xc + .62, yK + .21, zF - .15, .12, .02);
  const propinas = ilustracion(.12, .05, 128, (c, w, h) => {
    c.fillStyle = PALETA.crema; c.fillRect(0, 0, w, h); c.fillStyle = PALETA.verde; c.font = `700 ${h * .62}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Propinas', w / 2, h * .56);
  });
  propinas.position.set(xc + .62, yK + .1, zF - .15 + .061); propinas.userData.nombre = 'el frasco de las propinas';
  grupo.add(propinas); ctx.pulsables.push(propinas);
  // Cartel «Pide aquí» colgado sobre la caja
  cartelCon(ctx, xc, .9, 'Pide aquí', '«Pide aquí» <small>(aquí se hace el pedido y se paga)</small>');

  // Vitrina del pan: caja de vidrio con dos bandejas iluminadas
  const [vx0, vx1] = tr.vitrina, vy0 = .9, vy1 = B.vitrinaAlto, vz0 = zT + .05, vz1 = zF - .02;
  lote.bloque('encimera', vx0, vy0, vz0, vx1, vy0 + .03, vz1, { contorno: false });                 // fondo claro
  for (const z of [vz0, vz1]) lote.bloque('marco', vx0, vy1 - .03, z - .015, vx1, vy1, z + .015, { contorno: 'medio' });   // marco fino de la tapa
  lote.bloque('madera', vx0, vy0, vz0 - .02, vx1, vy1 - .03, vz0 + .01, { contorno: false });         // espalda (lado del barista)
  for (const x of [vx0, vx1]) lote.bloque('marco', x - .015, vy0, vz0, x + .015, vy1, vz1, { contorno: false });
  lote.bloque('encimera', vx0, vy0 + .21, vz0 + .05, vx1, vy0 + .23, vz1 - .06, { contorno: false });   // bandeja alta
  lote.bloque(kit.emisivo('#fff4dc'), vx0 + .05, vy1 - .035, (vz0 + vz1) / 2 - .03, vx1 - .05, vy1 - .031, (vz0 + vz1) / 2 + .03, { contorno: false });
  const cristal = new T.Mesh(kit.geo.plano, kit.vidrio('#dff0f2', .18));
  cristal.scale.set(vx1 - vx0, (vy1 - vy0) * 1.02, 1); cristal.position.set((vx0 + vx1) / 2, (vy0 + vy1) / 2, vz1 + .02); cristal.rotation.x = -.08;
  cristal.renderOrder = 4; grupo.add(cristal);
  const tapa = cristal.clone(); tapa.scale.set(vx1 - vx0, vz1 - vz0, 1); tapa.rotation.x = -Math.PI / 2; tapa.position.set((vx0 + vx1) / 2, vy1 + .001, (vz0 + vz1) / 2); grupo.add(tapa);
  ctx.lamparas.push({ pos: [(vx0 + vx1) / 2, vy1 + .2, (vz0 + vz1) / 2], color: '#fff0d0', intensidad: .5, radio: 1.2 });
  const panes = crearLoteColor(kit), etiquetas = [];
  const por = Math.ceil(PAN.length / 2), paso = (vx1 - vx0 - .1) / por;
  PAN.forEach((p, i) => {
    const fila = i < por ? 0 : 1, k = fila ? i - por : i;
    const x = vx0 + .05 + paso * (k + .5), y = fila ? vy0 + .23 : vy0 + .03, z = fila ? vz0 + .18 : vz0 + .3;
    for (let n = 0; n < 3; n++) ponerPan(panes, kit, p, x + (n - 1) * paso * .28, y, z - n * .08 + .06, i * 7 + n);
    const et = ilustracion(.13, .07, 256, () => {}, 'cartel');
    et.position.set(x, y + .04, (fila ? vz0 + .38 : vz1 - .03)); et.rotation.x = -.35; et.userData.nombre = `${p.nombre}${p.nota ? ` <small>(${p.nota})</small>` : ''}`;
    et.userData.pan = p; grupo.add(et); ctx.pulsables.push(et); etiquetas.push(et);
  });
  const pintarEtiquetas = () => etiquetas.forEach(et => et.userData.redibujar((c, w, h) => {
    c.fillStyle = '#fbf6ea'; c.fillRect(0, 0, w, h); c.fillStyle = PALETA.verde; c.fillRect(0, 0, w, h * .08);
    c.fillStyle = '#2a2c2f'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const nombre = et.userData.pan.nombre.replace(/^(el|la|los|las) /, '').replace(/^rebanada de /, '');
    c.font = `600 ${h * .22}px system-ui, sans-serif`; c.fillText(nombre.length > 18 ? nombre.slice(0, 17) + '…' : nombre, w / 2, h * .36);
    c.fillStyle = PALETA.verde; c.font = `700 ${h * .3}px system-ui, sans-serif`; c.fillText(formatear(et.userData.pan.precio, moneda()), w / 2, h * .72);
  }));

  // Entrega: cartel «Recoge aquí», lámpara y el lugar donde aparece la bebida
  const xe = centroTramo('entrega');
  cartelCon(ctx, xe, 1.0, 'Recoge aquí', '«Recoge aquí» <small>(aquí te entregan la bebida y dicen tu nombre)</small>');
  lote.bloque('encimera', xe - .5, altoM, zF - .45, xe + .5, altoM + .015, zF - .05, { contorno: false });   // plano de entrega

  // Colgantes sobre el mostrador
  for (const x of COLGANTES.barra.x) colgante(ctx, x, COLGANTES.barra.z, COLGANTES.barra.y, { color: 'cobre' });

  // ── Barra de condimentos (muro del fondo, al oeste) ─────────────────────
  const C = CONDIMENTOS, zCd = Z0 + C.fondo;
  lote.bloque('nogal', C.x0, 0, Z0, C.x1, C.alto - TOPE, zCd - .02, { contorno: 'medio', nombre: 'la barra de condimentos' });
  lote.bloque('encimera', C.x0, C.alto - TOPE, Z0, C.x1, C.alto, zCd, { contorno: 'medio' });
  lote.bloque('negro', C.x1 - .45, .35, zCd - .021, C.x1 - .1, .6, zCd - .015, { contorno: false, nombre: 'el bote de la basura <small>(«la papelera», «la caneca» en Colombia)</small>' });
  col(C.x0, Z0, C.x1, zCd);
  const yT = C.alto, termos = [['Entera', 'blanco'], ['Deslactosada', 'crema'], ['Vegetal', 'verdeClaro']];
  termos.forEach(([n, c], i) => {
    const x = C.x0 + .3 + i * .28;
    lote.cil('acero', x, yT + .17, Z0 + .3, .16, .34, { nombre: `el termo de leche ${n.toLowerCase()}` });
    lote.cil(c, x, yT + .37, Z0 + .3, .12, .06);
    lote.cil('negro', x + .1, yT + .3, Z0 + .3, .02, .1, { rz: Math.PI / 2, contorno: false });
  });
  const xAz = C.x0 + 1.2;
  lote.bloque('madera', xAz - .15, yT, Z0 + .15, xAz + .15, yT + .1, Z0 + .4, { nombre: 'el azúcar y los endulzantes' });
  ['#f4f1ea', '#e8c78f', '#f2d64b', '#c4495a'].forEach((c, i) => lote.bloque(c, xAz - .13 + i * .066, yT + .1, Z0 + .18, xAz - .08 + i * .066, yT + .16, Z0 + .37, { contorno: false }));
  for (const [i, [n, c]] of [['la canela', '#8a4f2c'], ['el cacao en polvo', '#4f3421']].entries())
    lote.cil(c, xAz + .28 + i * .09, yT + .08, Z0 + .3, .06, .16, { nombre: n });
  lote.bloque('acero', C.x1 - .75, yT, Z0 + .1, C.x1 - .5, yT + .22, Z0 + .3, { nombre: 'las servilletas' });
  lote.cil('cremaOscura', C.x1 - .35, yT + .1, Z0 + .22, .1, .2, { nombre: 'las tapas' });
  lote.cil(kit.vidrio('#e8f2f4', .45), C.x1 - .18, yT + .1, Z0 + .22, .08, .2, { contorno: false });
  for (let i = 0; i < 6; i++) lote.cil(['#00704a', '#f6f6f3', '#b87333'][i % 3], C.x1 - .2 + (i % 3) * .02, yT + .2, Z0 + .21 + (i > 2 ? .02 : 0), .008, .26, { contorno: false, nombre: 'las pajitas <small>(«popotes» en México, «pitillos» en Colombia, «sorbetes» en Argentina)</small>' });
  const cond = ilustracion(1.4, .32, 512, (c, w, h) => cartelColgante(c, w, h, 'Leche y azúcar'), 'cartel');
  cond.position.set((C.x0 + C.x1) / 2, 1.75, Z0 + .01); cond.userData.nombre = 'la barra de condimentos: leche, azúcar, canela, tapas…';
  grupo.add(cond); ctx.pulsables.push(cond);
  colgante(ctx, COLGANTES.condimentos.x[0], COLGANTES.condimentos.z, COLGANTES.condimentos.y, { color: 'verde' });

  bolsas.construir(grupo, ctx.pulsables); panes.construir(grupo, ctx.pulsables);
  const repintarPrecios = () => { pintarMenus(); pintarEtiquetas(); };
  repintarPrecios();
  return {
    repintarPrecios,
    pantalla: total => pantalla.userData.redibujar((c, w, h) => pintarPantalla(c, w, h, total)),
    entrega: new T.Vector3(xe, altoM + .015, zF - .25),
  };
}

// Cartel colgante a dos caras con sus dos varillas hasta el techo (medidas en COLGADOS).
function cartelCon(ctx, x, ancho, texto, nombre) {
  const C = COLGADOS, z = zFrenteBarra() - C.retranqueo, tope = C.y + C.alto / 2;
  const cartel = ilustracion(ancho, C.alto, 512, (c, w, h) => cartelColgante(c, w, h, texto), 'cartel', { doble: true });
  cartel.position.set(x, C.y, z); cartel.userData.nombre = nombre;
  ctx.grupo.add(cartel); ctx.pulsables.push(cartel);
  for (const dx of [-ancho * .4, ancho * .4]) ctx.lote.cil('negro', x + dx, (tope + ALTO_TECHO) / 2, z, .01, ALTO_TECHO - tope, { contorno: false });
}

// Pan: formas simples con el lote de color por instancia (una malla por forma).
function ponerPan(lote, kit, p, x, y, z, semilla) {
  const m = (px, py, pz, sx, sy, sz, rx = 0, ry = 0) => new T.Matrix4().compose(new T.Vector3(px, py, pz), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, 0)), new T.Vector3(sx, sy, sz));
  const ry = (semilla * 1.7) % Math.PI, o = { id: p.id, nivel: 'medio' };
  switch (p.forma) {
    case 'cuerno': lote.poner(kit.geo.toro, m(x, y + .025, z, .16, .16, .12, Math.PI / 2, ry), p.color, o); break;
    case 'muffin':
      lote.poner(kit.geo.cono, m(x, y + .03, z, .07, .06, .07, Math.PI), '#e9dcc6', o);
      lote.poner(kit.geo.esfera, m(x, y + .065, z, .085, .06, .085), p.color, o); break;
    case 'disco': lote.poner(kit.geo.cil16, m(x, y + .008, z, .08, .016, .08), p.color, o); break;
    case 'cuadro': lote.poner(kit.geo.caja, m(x, y + .02, z, .07, .04, .07, 0, ry), p.color, o); break;
    case 'rollo': lote.poner(kit.geo.cil16, m(x, y + .02, z, .1, .04, .1), p.color, o); break;
    case 'sandwich':
      lote.poner(kit.geo.caja, m(x, y + .03, z, .12, .025, .09, 0, ry), p.color, o);
      lote.poner(kit.geo.caja, m(x, y + .05, z, .115, .015, .085, 0, ry), '#e9b94a', o); break;
    default: lote.poner(kit.geo.caja, m(x, y + .035, z, .07, .07, .1, 0, ry), p.color, o);
  }
}

// Cartel colgante: verde con letras crema.
function cartelColgante(c, w, h, texto) {
  c.fillStyle = PALETA.verde; c.fillRect(0, 0, w, h);
  c.strokeStyle = PALETA.cobre; c.lineWidth = h * .05; c.strokeRect(h * .08, h * .08, w - h * .16, h * .84);
  c.fillStyle = PALETA.crema; c.font = `700 ${h * .5}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(texto, w / 2, h * .54);
}

// Pantalla del cliente en la caja: bienvenida o total del pedido.
function pintarPantalla(c, w, h, total) {
  c.fillStyle = MARCA.colores.verdeCasa; c.fillRect(0, 0, w, h);
  c.fillStyle = PALETA.crema; c.textAlign = 'center'; c.textBaseline = 'middle';
  if (!total) {
    pintarEmblema(c, w * .2, h / 2, h * .3, { texto: false });
    c.font = `600 ${h * .16}px system-ui, sans-serif`; c.fillText('¡Bienvenido!', w * .6, h * .4);
    c.fillStyle = MARCA.colores.verdeClaro; c.font = `${h * .1}px system-ui, sans-serif`; c.fillText(MARCA.nombre, w * .6, h * .64);
    return;
  }
  c.font = `${h * .1}px system-ui, sans-serif`; c.fillStyle = '#9fc9b4'; c.fillText(total.detalle, w / 2, h * .25);
  c.fillStyle = PALETA.crema; c.font = `600 ${h * .12}px system-ui, sans-serif`; c.fillText('Total', w / 2, h * .48);
  c.font = `700 ${h * .22}px system-ui, sans-serif`; c.fillText(total.texto, w / 2, h * .72);
}

// Menú: pizarra verde con precios por tamaño (chico · mediano · grande).
function pintarMenu(c, w, h, sec, moneda) {
  c.fillStyle = MARCA.colores.verdeCasa; c.fillRect(0, 0, w, h);
  c.strokeStyle = MARCA.colores.dorado; c.lineWidth = 3; c.strokeRect(10, 10, w - 20, h - 20);
  c.fillStyle = PALETA.crema; c.textBaseline = 'middle';
  c.font = `700 ${h * .1}px Georgia, serif`; c.textAlign = 'left'; c.fillText(sec.titulo, 34, h * .12);
  if (sec.id === 'tamanos') {
    let y = h * .27;
    c.font = `600 ${h * .06}px system-ui, sans-serif`; c.fillStyle = '#d9b48a'; c.fillText('Tamaños', 34, y); y += h * .08;
    for (const t of TAMANOS) {
      c.fillStyle = PALETA.crema; c.font = `${h * .058}px system-ui, sans-serif`;
      c.fillText(`${t.nombre}`, 50, y); c.fillStyle = '#9fc9b4'; c.textAlign = 'right'; c.fillText(`${t.oz} oz · ${t.ml} ml`, w - 34, y); c.textAlign = 'left'; y += h * .068;
    }
    y += h * .03; c.font = `600 ${h * .06}px system-ui, sans-serif`; c.fillStyle = '#d9b48a'; c.fillText('Leches y extras', 34, y); y += h * .08;
    const lista = [...LECHES.filter(l => l.extra).map(l => ({ nombre: l.nombre.replace(/^leche /, 'Leche '), precio: l.extra })), ...EXTRAS];
    for (const e of lista) {
      c.fillStyle = PALETA.crema; c.font = `${h * .052}px system-ui, sans-serif`; c.fillText(e.nombre, 50, y);
      c.textAlign = 'right'; c.fillText(`+ ${formatear(e.precio, moneda)}`, w - 34, y); c.textAlign = 'left'; y += h * .062;
    }
    return;
  }
  const colX = [w * .6, w * .74, w * .88];
  c.fillStyle = '#d9b48a'; c.font = `600 ${h * .045}px system-ui, sans-serif`; c.textAlign = 'center';
  TAMANOS.forEach((t, i) => c.fillText(t.nombre.toUpperCase(), colX[i], h * .25));
  let y = h * .35; const paso = Math.min(h * .12, (h * .6) / sec.items.length);
  for (const b of sec.items) {
    c.textAlign = 'left'; c.fillStyle = PALETA.crema; c.font = `${h * .062}px system-ui, sans-serif`; c.fillText(b.nombre, 34, y);
    c.textAlign = 'center'; c.font = `${h * .052}px system-ui, sans-serif`;
    if (b.sinTamano) c.fillText(formatear(b.precio, moneda), colX[0], y);
    else TAMANOS.forEach((t, i) => c.fillText(formatear(b.precio + t.extra, moneda), colX[i], y));
    y += paso;
  }
}
