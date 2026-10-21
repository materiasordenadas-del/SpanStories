import * as T from './three.js';
import { crearMaterialToon, crearMaterialContorno, contornoDe, crearReceptorSombra } from './Luz25D.js';
import { texturaAzulejo, materialSuperficie, lienzo, azar } from './Kit.js';
import { ACERA, CALZADA, ACERA_ENFRENTE, MUNDO, cruce, CEBRA, CEBRA_T, zonaParada } from './dimensions.js';

/* La esquina: avenida con acera ancha a los dos lados, calle transversal
   (con sus aceras), cebras, bordillos (pintado amarillo-negro solo donde para
   el bus), franja táctil, carriles y «SOLO BUS».  Materiales de la Farmacia
   (UV en metros del mundo), así la acera de la farmacia y la del paradero son
   la misma. */

export function construirCalle(grupo) {
  const zEnf0 = ACERA.z1 + CALZADA.fondo, zEnf1 = zEnf0 + ACERA_ENFRENTE;
  const losa = texturaAzulejo({ color: '#cfc9bd', junta: '#aaa396', columnas: 2, filas: 2, trabado: false, variar: .07 });
  const matAcera = materialSuperficie({ map: losa.map, normal: losa.normal, metros: 2.4, fuerzaNormal: .7 });
  const matAsfalto = materialSuperficie({ map: lienzo(256, 256, (c, w, h) => {
    c.fillStyle = '#5d6066'; c.fillRect(0, 0, w, h);
    const r = azar(5);
    for (let i = 0; i < 1400; i++) { c.fillStyle = r() > .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.08)'; c.fillRect(r() * w, r() * h, 2, 2); }
  }, { repetir: true }), metros: 2, bandas: 2 });
  const mats = new Map();
  const mat = (color) => (typeof color !== 'string' ? color : (mats.get(color) ?? mats.set(color, crearMaterialToon({ color, bandas: 3 })).get(color)));
  // Caja por límites [x0, x1] × [y0, y1] × [z0, z1].
  function bloque(nombre, m, x0, x1, y0, y1, z0, z1, contorno = null) {
    const mesh = new T.Mesh(new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat(m));
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); mesh.name = nombre;
    if (contorno) contornoDe(mesh, crearMaterialContorno(typeof m === 'string' ? m : '#a9a397', contorno));
    grupo.add(mesh); return mesh;
  }
  const A = ACERA.alto;

  // ── Calzadas ──
  bloque('avenida', matAsfalto, MUNDO.x0, MUNDO.x1, -.05, 0, ACERA.z1, zEnf0);
  bloque('transversal-norte', matAsfalto, cruce.x0, cruce.x1, -.05, 0, -MUNDO.fondo, ACERA.z1);
  bloque('transversal-sur', matAsfalto, cruce.x0, cruce.x1, -.05, 0, zEnf0, zEnf1 + MUNDO.fondo / 2);

  // ── Aceras (de losa) ──
  for (const [x0, x1] of [[MUNDO.x0, cruce.x0], [cruce.x1, MUNDO.x1]]) {
    bloque('acera', matAcera, x0, x1, 0, A, ACERA.z0, ACERA.z1);
    bloque('acera-enfrente', matAcera, x0, x1, 0, A, zEnf0, zEnf1);
  }
  bloque('acera-transversal-oeste', matAcera, cruce.lineaOeste, cruce.x0, 0, A, -MUNDO.fondo, ACERA.z0);
  bloque('acera-transversal-este', matAcera, cruce.x1, cruce.lineaEste, 0, A, -MUNDO.fondo, ACERA.z0);
  bloque('acera-transversal-sur-o', matAcera, cruce.lineaOeste, cruce.x0, 0, A, zEnf1, zEnf1 + MUNDO.fondo / 2);
  bloque('acera-transversal-sur-e', matAcera, cruce.x1, cruce.lineaEste, 0, A, zEnf1, zEnf1 + MUNDO.fondo / 2);
  // Suelo del resto de las manzanas (patios, lotes): losa más oscura, sin trazo.
  bloque('manzana-oeste', '#bdb6a8', MUNDO.x0, cruce.lineaOeste, 0, A - .005, -MUNDO.fondo, ACERA.z0);
  bloque('manzana-este', '#bdb6a8', cruce.lineaEste, MUNDO.x1, 0, A - .005, -MUNDO.fondo, ACERA.z0);

  // ── Bordillos: gris; amarillo-negro en la zona de parada ──
  const G = .16;
  const zp = zonaParada();
  for (const [x0, x1] of [[MUNDO.x0, zp.x0], [zp.x1, cruce.x0], [cruce.x1, MUNDO.x1]]) bloque('bordillo', '#a9a397', x0, x1, -.02, A + .005, ACERA.z1 - G, ACERA.z1, 'fino');
  for (const [x0, x1] of [[MUNDO.x0, cruce.x0], [cruce.x1, MUNDO.x1]]) bloque('bordillo-enfrente', '#a9a397', x0, x1, -.02, A + .005, zEnf0, zEnf0 + G, 'fino');
  const texBord = lienzo(64, 16, (c, w, h) => { c.fillStyle = '#f2c230'; c.fillRect(0, 0, w / 2, h); c.fillStyle = '#2b2b2b'; c.fillRect(w / 2, 0, w / 2, h); }, { repetir: true });
  bloque('bordillo-parada', materialSuperficie({ map: texBord, metros: 1 }), zp.x0, zp.x1, -.02, A + .006, ACERA.z1 - G, ACERA.z1, 'fino');
  for (const x of [cruce.x0, cruce.x1]) {
    bloque('bordillo-transversal', '#a9a397', x - G / 2, x + G / 2, -.02, A + .005, -MUNDO.fondo, ACERA.z0);
    bloque('bordillo-transversal', '#a9a397', x - G / 2, x + G / 2, -.02, A + .005, zEnf1, zEnf1 + MUNDO.fondo / 2);
  }

  // ── Franja táctil guía a lo largo de la acera del paradero ──
  const texTactil = lienzo(128, 64, (c, w, h) => {
    c.fillStyle = '#e9b72a'; c.fillRect(0, 0, w, h); c.fillStyle = '#c99a1c';
    for (let x = 6; x < w; x += 16) c.fillRect(x, 8, 5, h - 16);
  }, { repetir: true });
  const zT1 = ACERA.z1 - G - .1, zT0 = zT1 - ACERA.franjaTactil * .75;
  bloque('franja-tactil', materialSuperficie({ map: texTactil, metros: .6 }), MUNDO.x0, cruce.x0 - .6, A, A + .006, zT0, zT1);

  // ── Marcas viales (pintura: cajas finísimas sobre el asfalto) ──
  const pintura = '#f4f1e8', amarillo = '#f2c230', y0 = 0, y1 = .006;
  // Cebra que cruza la avenida: franjas paralelas al tráfico.
  for (let z = ACERA.z1 + .3; z + CEBRA.franja < zEnf0 - .2; z += CEBRA.franja * 2)
    bloque('cebra', pintura, CEBRA.x0 + .2, CEBRA.x1 - .2, y0, y1, z, z + CEBRA.franja);
  // Cebra que cruza la transversal por la acera de la avenida.
  for (let x = cruce.x0 + .3; x + CEBRA.franja < cruce.x1 - .2; x += CEBRA.franja * 2)
    bloque('cebra-transversal', pintura, x, x + CEBRA.franja, y0, y1, CEBRA_T.z0, CEBRA_T.z1);
  // Línea central doble amarilla y separación del carril exclusivo.
  const zc = ACERA.z1 + CALZADA.fondo / 2, zBus = ACERA.z1 + CALZADA.carrilBus;
  for (const [x0, x1] of [[MUNDO.x0, CEBRA.x0 - .5], [cruce.x1 + .5, MUNDO.x1]]) {
    for (const dz of [-.1, .1]) bloque('linea-central', amarillo, x0, x1, y0, y1, zc + dz - .05, zc + dz + .05);
    bloque('linea-carril-bus', pintura, x0, x1, y0, y1, zBus - .08, zBus + .08);
  }
  // Líneas de pare ante la cebra (carril de este sentido) y rótulo SOLO BUS en la zona de parada.
  bloque('linea-pare', pintura, CEBRA.x1 + .1, CEBRA.x1 + .5, y0, y1, zc + .2, zEnf0 - .2);
  const texSolo = lienzo(1024, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = pintura; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = 'bold 200px Arial, sans-serif'; c.fillText('SOLO BUS', w / 2, h / 2 + 10);
  });
  const rotulo = new T.Mesh(new T.PlaneGeometry(6, 1.5), crearMaterialToon({ albedo: texSolo, transparente: true, corteAlfa: .4 }));
  rotulo.rotation.set(-Math.PI / 2, 0, Math.PI / 2);                   // se lee de frente llegando hacia -x
  rotulo.position.set((zp.x0 + zp.x1) / 2 + 3, .008, ACERA.z1 + CALZADA.carrilBus / 2); rotulo.name = 'rotulo-solo-bus';
  grupo.add(rotulo);

  // Receptores de la sombra del sol (la acera y la calzada no la pintan por sí mismas).
  for (const [y, z0, z1] of [[A + .004, ACERA.z0, ACERA.z1], [.004, ACERA.z1, zEnf0], [A + .004, zEnf0, zEnf1]]) {
    const r = new T.Mesh(new T.PlaneGeometry(MUNDO.x1 - MUNDO.x0, z1 - z0), crearReceptorSombra(1));
    r.rotation.x = -Math.PI / 2; r.position.set((MUNDO.x0 + MUNDO.x1) / 2, y + .003, (z0 + z1) / 2);
    r.receiveShadow = true; r.renderOrder = 1; r.raycast = () => {}; r.name = 'sombras'; grupo.add(r);
  }
  return { zEnf0, zEnf1 };
}
