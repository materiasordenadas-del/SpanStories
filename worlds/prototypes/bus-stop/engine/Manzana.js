import * as T from './three.js';
import { crearMaterialToon, crearMaterialContorno, contornoDe } from './Luz25D.js';
import { crearKit, crearLote, materialSuperficie, lienzo } from './Kit.js';
import { construirCasco } from './farmacia/Casco.js';
import { fondoEnfrente } from './farmacia/Rotulos.js';
import { LOCAL } from './farmacia/config.js';
import { ACERA, MUNDO, CONJUNTO, cruce, farmaciaEn } from './dimensions.js';

/* Lo que rodea el paradero:
   · La FARMACIA (copia del proyecto Farmacia/, solo su casco: sin mobiliario,
     productos ni interacción) en la esquina este, con su casa vecina.
   · Detrás del paradero, el cerramiento de un conjunto residencial (muro bajo
     y reja, portería lejos de la parada) y sus torres de ladrillo.
   · Enfrente, las casas pintadas del fondo de la Farmacia, dejando libre la
     boca de la transversal. */

export function construirManzana(grupo, { zEnf1 }) {
  // ── Farmacia en la esquina ──
  const f = farmaciaEn();
  const farmacia = new T.Group(); farmacia.name = 'Farmacia (esquina)'; farmacia.position.set(f.x, f.y, f.z);
  const exteriorGrupo = new T.Group(); exteriorGrupo.name = 'Farmacia: fachada'; farmacia.add(exteriorGrupo);
  const kit = crearKit(), lote = crearLote(kit), exterior = crearLote(kit);
  const ctx = { kit, lote, exterior, grupo: farmacia, colisiones: [], animables: [] };   // animables no corre: puertas cerradas
  const casco = construirCasco(ctx);
  lote.construir(farmacia, []); exterior.construir(exteriorGrupo, []);
  exteriorGrupo.traverse(o => { if (o.isMesh && o.name !== 'contorno') o.castShadow = true; });
  grupo.add(farmacia);
  const aMundo = ([x, y, z]) => [x + f.x, y + f.y, z + f.z];
  const lamparas = casco.lamparas.map(l => ({ ...l, pos: aMundo(l.pos) }));
  const sala = [LOCAL.x0 + f.x - .1, LOCAL.z0 + f.z - .1, LOCAL.x1 + f.x + .1, LOCAL.z1 + f.z + .05];

  // ── Conjunto residencial detrás del paradero ──
  const C = CONJUNTO, A = ACERA.alto, zL = ACERA.z0;
  const ladrillo = materialSuperficie({ map: lienzo(256, 128, (c, w, h) => {
    c.fillStyle = '#9c4a33'; c.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) for (let i = -1; i < 5; i++) {
      c.fillStyle = (i + j) % 3 ? '#b25a3c' : '#a8533a'; c.fillRect(i * 64 + (j % 2) * 32 + 2, j * 16 + 2, 60, 12);
    }
  }, { repetir: true }), metros: 1, bandas: 3 });
  const hierro = crearMaterialToon({ color: '#2d3235', bandas: 3 });
  const cerramiento = new T.Group(); cerramiento.name = 'Cerramiento del conjunto'; grupo.add(cerramiento);
  const caja = (m, x0, x1, y0, y1, z0, z1, padre = cerramiento, trazo = null) => {
    const mesh = new T.Mesh(new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); mesh.castShadow = true;
    if (trazo) contornoDe(mesh, crearMaterialContorno(trazo, 'fino'));
    padre.add(mesh); return mesh;
  };
  const p0 = C.porteria - C.anchoPorteria / 2, p1 = C.porteria + C.anchoPorteria / 2;
  const tramos = [[MUNDO.x0, p0], [p1, cruce.lineaOeste]];
  const yReja = A + C.muro, yTope = yReja + C.reja;
  const barrotes = [];
  // Frente a la avenida (con portería) y costado a la transversal.
  for (const [x0, x1] of tramos) {
    caja(ladrillo, x0, x1, A, yReja, zL - .25, zL, cerramiento, '#9c4a33');
    for (let x = x0 + .06; x < x1 - .05; x += .14) barrotes.push([x, zL - .12]);
    caja(hierro, x0, x1, yTope - .05, yTope, zL - .15, zL - .09);
    for (let x = x0; x <= x1 + .01; x += 3) caja(ladrillo, x - .2, x + .2, A, yTope + .15, zL - .32, zL + .02, cerramiento, '#9c4a33');
  }
  caja(ladrillo, cruce.lineaOeste, cruce.lineaOeste + .25, A, yReja, -MUNDO.fondo, zL, cerramiento, '#9c4a33');
  for (let z = zL - .1; z > -MUNDO.fondo; z -= .14) barrotes.push([cruce.lineaOeste + .12, z]);
  caja(hierro, cruce.lineaOeste + .09, cruce.lineaOeste + .15, yTope - .05, yTope, -MUNDO.fondo, zL);
  const barras = new T.InstancedMesh(new T.BoxGeometry(.025, C.reja, .025), hierro, barrotes.length);
  const m4 = new T.Matrix4();
  barrotes.forEach(([x, z], i) => barras.setMatrixAt(i, m4.makeTranslation(x, yReja + C.reja / 2, z)));
  barras.name = 'reja'; barras.castShadow = true; cerramiento.add(barras);
  // Portería: garita de vigilancia y portón corredizo (lejos del paradero).
  caja(crearMaterialToon({ color: '#e9e4d6', bandas: 3 }), p0 - 2.6, p0 - .4, A, A + 2.6, zL - 2.4, zL - .3, cerramiento, '#e9e4d6');
  caja(crearMaterialToon({ color: '#4c6a7a', bandas: 2 }), p0 - 2.4, p0 - .6, A + 1.1, A + 2.1, zL - .29, zL - .27);
  caja(hierro, p0 - 2.8, p0 - .2, A + 2.6, A + 2.75, zL - 2.6, zL - .1, cerramiento, '#2d3235');
  caja(hierro, p0, p1, A, A + 2.1, zL - .2, zL - .15, cerramiento, '#2d3235');
  const nombre = cartelPlano(2.4, .4, (c, w, h) => {
    c.fillStyle = '#2d3235'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2ede2'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `bold ${h * .55}px Arial`; c.fillText('Conjunto Residencial Los Almendros', w / 2, h / 2 + 2);
  });
  nombre.position.set(p0 - 1.5, A + 2.4, zL - .09); cerramiento.add(nombre);
  // Patio interior adoquinado (sin jardines).
  caja(crearMaterialToon({ color: '#b9ad9b', bandas: 2 }), MUNDO.x0, cruce.lineaOeste, A - .004, A, -MUNDO.fondo, zL - .25);

  // Torres de ladrillo con ventanas pintadas.
  const altoTorre = C.pisos * C.piso, [anchoT, fondoT] = C.torre;
  const texTorre = lienzo(512, 512 * altoTorre / anchoT, (c, w, h) => {
    c.fillStyle = '#a4523a'; c.fillRect(0, 0, w, h);
    const ph = h / C.pisos;
    for (let p = 0; p < C.pisos; p++) {
      c.fillStyle = '#e9e1d2'; c.fillRect(0, p * ph, w, ph * .06);                           // placa de entrepiso
      for (let i = 0; i < 4; i++) {
        const x = (i + .5) * w / 4, vw = w * .13, vh = ph * .48, y = p * ph + ph * .3;
        c.fillStyle = '#e9e1d2'; c.fillRect(x - vw / 2 - 4, y - 4, vw + 8, vh + 8);
        c.fillStyle = (p + i) % 3 ? '#5b7a99' : '#4b6a86'; c.fillRect(x - vw / 2, y, vw, vh);
        c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x - 1.5, y, 3, vh);
      }
    }
  });
  const matTorre = crearMaterialToon({ albedo: texTorre, bandas: 3 });
  for (const x of C.torres) {
    const t = new T.Mesh(new T.BoxGeometry(anchoT, altoTorre, fondoT), matTorre);
    t.position.set(x, A + altoTorre / 2, zL - C.retiro - fondoT / 2); t.name = 'Torre del conjunto'; t.castShadow = true;
    contornoDe(t, crearMaterialContorno('#a4523a', 'fino')); grupo.add(t);
    caja(crearMaterialToon({ color: '#e9e1d2', bandas: 3 }), x - anchoT / 2 - .1, x + anchoT / 2 + .1, A + altoTorre, A + altoTorre + .3, t.position.z - fondoT / 2 - .1, t.position.z + fondoT / 2 + .1, grupo, '#e9e1d2');
  }

  // ── Enfrente: casas pintadas (fondo de la Farmacia), con hueco para la transversal ──
  for (const [x0, x1] of [[MUNDO.x0, cruce.lineaOeste], [cruce.lineaEste, MUNDO.x1]]) {
    const fondo = fondoEnfrente(x1 - x0, 7.2);
    fondo.rotation.y = Math.PI; fondo.position.set((x0 + x1) / 2, A + 3.6, zEnf1); grupo.add(fondo);
  }
  return { lamparas, sala };
}

function cartelPlano(ancho, alto, dibujar) {
  const tex = lienzo(Math.round(512 * ancho / alto), 512, dibujar);
  const m = new T.Mesh(new T.PlaneGeometry(ancho, alto), crearMaterialToon({ albedo: tex }));
  m.name = 'cartel'; return m;
}
