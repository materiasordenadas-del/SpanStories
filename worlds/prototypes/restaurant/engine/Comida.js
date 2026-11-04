import * as T from './three.js';
import { crearLote, azar } from './Kit.js';
import { GEO, vidrios } from './Decor.js';
import { PLATOS } from './menu.js';

/* Platos servidos: al confirmar el pedido aparecen sobre la mesa del
   estudiante (toon, con su nombre al pulsarlos).  Un grupo por mesa. */

export const definido = uno => uno.replace(/^unos /, 'los ').replace(/^unas /, 'las ').replace(/^una /, 'la ').replace(/^un /, 'el ');
const MESA_Y = .776;

function modelo(l, kit, tipo, nombre) {
  const loza = kit.esmalte('loza', .25, 2.5), o = { contorno: 'medio', nombre }, sin = { contorno: false, nombre };
  const r = azar(tipo.length * 31);
  const plato = (k = 1) => l.pieza(GEO.plato, loza, 0, 0, 0, k, 1, k, { nombre });
  switch (tipo) {
    case 'espaguetis': case 'tallarines':
      plato();
      // nido de pasta: aros apilados y un poco desplazados
      for (let i = 0; i < 6; i++) l.pieza(kit.geo.nido, '#f1d37a', (r() - .5) * .025, .022 + i * .011, (r() - .5) * .025, .15 - i * .018, .1, .15 - i * .018, { rx: (r() - .5) * .25, rz: (r() - .5) * .25, ...(i === 5 ? o : sin) });
      l.caja(kit.metal('cromo', .6, 1), .04, .09, .02, .012, .004, .17, { rx: -.9, ry: .4, contorno: false, nombre: 'el tenedor' });
      if (tipo === 'tallarines') l.esfera('#a8432c', 0, .06, 0, .09, .03, .08, o);
      else for (let i = 0; i < 8; i++) l.esfera('#6b3a2a', (r() - .5) * .1, .065, (r() - .5) * .1, .015, .01, .015, sin);
      l.esfera('hoja', .03, .075, -.02, .03, .008, .02, sin);
      break;
    case 'raviolis':
      plato();
      for (let i = 0; i < 7; i++) { const a = i * .9; l.caja('#efd39a', Math.cos(a) * .06, .025, Math.sin(a) * .06, .05, .018, .05, { ry: a, ...o }); }
      l.esfera('#e8e2d0', 0, .035, 0, .05, .01, .05, sin);
      break;
    case 'lasana':
      plato();
      for (let k = 0; k < 4; k++) l.caja(k % 2 ? '#b8432e' : '#e8b86a', 0, .02 + k * .018, 0, .12, .018, .09, k === 3 ? o : sin);
      l.caja('#f3dc97', 0, .092, 0, .125, .01, .095, sin);
      break;
    case 'pizza': case 'pizzaBlanca': case 'pizzaSalami':
      l.cil('#d49a52', 0, .012, 0, .32, .025, { lados: 24, ...o });
      l.cil(tipo === 'pizzaBlanca' ? '#f2df9e' : '#c7372b', 0, .026, 0, .28, .006, { lados: 24, ...sin });
      for (let i = 0; i < 9; i++) l.cil('#f7efd8', (r() - .5) * .18, .03, (r() - .5) * .18, .05, .004, { lados: 10, ...sin });
      if (tipo === 'pizzaSalami') for (let i = 0; i < 7; i++) l.cil('#9e2a22', (r() - .5) * .2, .033, (r() - .5) * .2, .045, .004, { lados: 10, ...sin });
      for (let i = 0; i < 4; i++) l.esfera('hoja', (r() - .5) * .16, .036, (r() - .5) * .16, .03, .006, .02, sin);
      break;
    case 'ensalada': case 'sopa':
      l.pieza(GEO.plato, loza, 0, 0, 0, .9, 1, .9, { nombre });
      l.pieza(GEO.cuenco, loza, 0, .012, 0, 1.2, 1, 1.2, { nombre });
      if (tipo === 'sopa') { l.cil('#d98a4a', 0, .075, 0, .17, .006, { lados: 20, ...sin }); for (let i = 0; i < 6; i++) l.caja(i % 2 ? '#e4b54a' : '#5f9a4b', (r() - .5) * .08, .08, (r() - .5) * .08, .02, .015, .02, sin); }
      else for (let i = 0; i < 7; i++) { l.esfera(i % 2 ? '#d8392f' : '#f7f2e6', (r() - .5) * .08, .08, (r() - .5) * .08, .04, .025, .04, sin); l.esfera('hoja', (r() - .5) * .08, .085, (r() - .5) * .08, .03, .008, .02, sin); }
      break;
    case 'bruschetta':
      plato();
      for (let i = 0; i < 3; i++) { l.caja('#d8a45a', (i - 1) * .07, .02, 0, .055, .02, .1, { ry: .2, ...o }); for (let k = 0; k < 4; k++) l.caja('#d8392f', (i - 1) * .07 + (r() - .5) * .03, .035, (r() - .5) * .06, .015, .012, .015, sin); }
      break;
    case 'carne':
      plato();
      l.cil('#7a3e22', .03, .03, 0, .1, .045, { lados: 12, ...o });
      l.esfera('#f2e2b0', -.05, .03, .02, .08, .05, .08, sin);
      break;
    case 'pescado':
      plato();
      l.pieza(kit.geo.esfera, kit.esmalte('#b9c3c6', .3), 0, .03, 0, .2, .04, .07, { ry: .3, ...o });
      l.caja('#b9c3c6', -.11, .03, -.03, .04, .04, .05, { ry: .3, ...sin });
      l.cil('#f2d23c', .08, .025, .06, .045, .01, { lados: 12, ...sin });
      break;
    case 'tiramisu':
      plato(.7);
      l.caja('#e9dcc6', 0, .03, 0, .08, .05, .07, o); l.caja('#6d4228', 0, .058, 0, .08, .006, .07, sin);
      break;
    case 'pannacotta':
      plato(.7);
      l.pieza(kit.geo.cono, '#f6f0e2', 0, .04, 0, .08, .07, .08, { rx: Math.PI, ...o });
      l.esfera('#b3202f', 0, .08, 0, .05, .02, .05, sin);
      break;
    case 'helado':
      l.pieza(GEO.copa, vidrios().copa, 0, 0, 0, 1.4, .8, 1.4, { nombre });
      for (const [c, dx] of [['#f6ecc6', -.02], ['#9cc27a', .02], ['#6d4228', 0]]) l.esfera(c, dx, .17 + (dx === 0 ? .03 : 0), dx === 0 ? .015 : -.01, .045, .04, .045, o);
      break;
    case 'vinoTinto': case 'vinoBlanco':
      l.pieza(GEO.copa, vidrios().copa, 0, 0, 0, 1, 1, 1, { nombre });
      l.pieza(GEO.copaInterior, tipo === 'vinoTinto' ? 'vinoTinto' : '#e9d77a', 0, 0, 0, .95, 1, .95, { contorno: false, nombre });
      break;
    case 'agua': case 'refresco':
      l.pieza(GEO.vaso, vidrios().copa, 0, 0, 0, 1, 1, 1, { nombre });
      l.cil(tipo === 'agua' ? '#cfe9f1' : '#f29a2e', 0, .04, 0, .058, .07, { lados: 14, contorno: false, nombre });
      if (tipo === 'agua') l.pieza(GEO.botellaAgua, vidrios().transparente, .09, 0, .05, 1, 1, 1, { nombre: 'la botella de agua' });
      break;
    case 'cafe':
      l.pieza(GEO.plato, loza, 0, 0, 0, .5, 1, .5, { nombre });
      l.pieza(GEO.taza, loza, 0, .006, 0, 1, 1, 1, { nombre });
      l.cil('#3a2418', 0, .046, 0, .055, .004, { lados: 14, contorno: false, nombre });
      break;
  }
}

/** Sirve el pedido en la mesa: el plato principal frente al asiento, el resto alrededor. */
export function servir(ctx, mesa, asiento, pedido) {
  ctx.servidos ??= new Map();
  const previo = ctx.servidos.get(mesa.numero);
  if (previo) { previo.removeFromParent(); previo.traverse(o => { if (o.isInstancedMesh) o.dispose(); }); ctx.pulsables.splice(0, ctx.pulsables.length, ...ctx.pulsables.filter(p => !previo.getObjectById(p.id))); }
  const g = new T.Group(); g.name = `servido-${mesa.numero}`;
  const l = crearLote(ctx.kit);
  // dirección mesa → asiento: el principal va en el plato de ese lado
  const dx = asiento.x - mesa.x, dz = asiento.z - mesa.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  const items = [];
  for (const { id, cantidad } of pedido) { const p = PLATOS.find(x => x.id === id); for (let k = 0; k < Math.min(cantidad, 4); k++) items.push(p); }
  const principales = items.filter(p => !['bebidas'].includes(p.seccion)), bebidas = items.filter(p => p.seccion === 'bebidas');
  const lado = (mesa.lado ?? .86) / 2 - .17;
  const huecos = [[ux * lado, uz * lado]];
  // más platos: a los lados del principal y hacia el centro
  const px = -uz, pz = ux;
  // [a lo largo del eje mesa→asiento, perpendicular], en metros desde el centro
  for (const [a, b] of [[.02, .24], [.02, -.24], [-.14, .1], [-.14, -.12], [-.26, 0], [.12, .3], [.12, -.3]]) huecos.push([ux * a + px * b, uz * a + pz * b]);
  principales.forEach((p, i) => {
    const [hx, hz] = huecos[Math.min(i, huecos.length - 1)];
    l.en(mesa.x + hx, MESA_Y + (i === 0 ? .012 : 0), mesa.z + hz, Math.atan2(ux, uz), () => modelo(l, ctx.kit, p.plato, definido(p.uno)));
  });
  bebidas.forEach((p, i) => {
    const bx = ux * (lado - .02) + px * (.2 + i * .09), bz = uz * (lado - .02) + pz * (.2 + i * .09);
    l.en(mesa.x + bx, MESA_Y, mesa.z + bz, 0, () => modelo(l, ctx.kit, p.plato, definido(p.uno)));
  });
  l.construir(g, ctx.pulsables);
  ctx.grupo.add(g); ctx.servidos.set(mesa.numero, g);
  return g;
}
