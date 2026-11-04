import * as T from './three.js';
import { plantar } from './TropicalPlants.js';
import { SHOPS, GATE, BOARDING } from './routes.js';
import { createHallKit, drawSign } from './HallKit.js';
import { luz } from './Luz25D.js';
import { createClerestoryGlass, CLERESTORY_GLASS_SPAN } from './ExteriorIllusion.js';

// Airside after passport control, in D01's palette (HallKit.js):
// D04 · Zona comercial, D05 · Sala de espera (gate lounge with the apron
// window) and D06 · Embarque (jet bridge). Each keeps a clear one-way walk
// from its entry door to its exit door. Measures: routes.js SHOPS / GATE / BOARDING.

// --- Painted illustrations ------------------------------------------------------
function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// Shelves full of products; palette per shop kind.
function drawShelves(kind) {
  const palettes = {
    perfume: ['#e95f8c', '#f7c948', '#8e6bd8', '#ffffff', '#3fb0e0'], book: ['#d0582b', '#17427c', '#3fae8e', '#f2b53a', '#e8e8e8'],
    gift: ['#e8703a', '#3fae5a', '#f7c948', '#5b8fd8', '#e95f8c'], cup: ['#7a4a26', '#c4772c', '#f4ecdc', '#3fae8e', '#e05a4a'],
  };
  const colours = palettes[kind] || palettes.gift;
  return (c, w, h) => {
    const r = seeded(kind.length * 97 + 11);
    c.fillStyle = '#c4772c'; c.fillRect(0, 0, w, h);
    const rows = 4, rh = h / rows;
    for (let row = 0; row < rows; row++) {
      const y = row * rh;
      c.fillStyle = '#f4ecdc'; c.fillRect(0, y + rh * .06, w, rh * .88);
      let x = w * .02;
      while (x < w * .97) {
        const bw = w * (.025 + r() * .045), bh = rh * (.35 + r() * .45);
        c.fillStyle = colours[Math.floor(r() * colours.length)];
        if (kind === 'perfume') { c.beginPath(); c.roundRect(x, y + rh * .9 - bh * .7, bw, bh * .7, bw * .3); c.fill(); c.fillRect(x + bw * .3, y + rh * .9 - bh * .9, bw * .4, bh * .2); }
        else c.fillRect(x, y + rh * .9 - bh, bw, bh);
        x += bw + w * .006;
      }
      c.fillStyle = '#b36c2a'; c.fillRect(0, y + rh * .9, w, rh * .1);
    }
  };
}
function drawMenu(c, w, h) {
  c.fillStyle = '#1f2a30'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f7c948'; c.font = `bold ${Math.round(h * .14)}px system-ui, sans-serif`; c.textAlign = 'center';
  c.fillText('Menú · Menu', w / 2, h * .17);
  const items = [['Café', 'Coffee', '2,50'], ['Té', 'Tea', '2,00'], ['Zumo', 'Juice', '3,00'], ['Bocadillo', 'Sandwich', '4,50'], ['Croissant', 'Croissant', '2,20']];
  c.font = `600 ${Math.round(h * .085)}px system-ui, sans-serif`;
  items.forEach(([es, en, price], i) => {
    const y = h * (.33 + i * .14);
    c.textAlign = 'left'; c.fillStyle = '#ffffff'; c.fillText(es, w * .06, y);
    c.fillStyle = '#9fc2d4'; c.fillText(en, w * .38, y);
    c.textAlign = 'right'; c.fillStyle = '#f7c948'; c.fillText(`${price} €`, w * .94, y);
  });
}
export function drawFlights(title, rows) {
  return (c, w, h) => {
    c.fillStyle = '#10213a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#17427c'; c.fillRect(0, 0, w, h * .2);
    c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(h * .12)}px system-ui, sans-serif`; c.textAlign = 'left';
    c.fillText(title, w * .04, h * .145);
    c.font = `600 ${Math.round(h * .1)}px system-ui, sans-serif`;
    rows.forEach(([t, city, gate, state], i) => {
      const y = h * (.37 + i * .17);
      c.fillStyle = '#ffffff'; c.fillText(t, w * .04, y); c.fillText(city, w * .2, y); c.fillText(gate, w * .6, y);
      c.fillStyle = state === 'Embarcando' ? '#7fe08a' : '#f7c948'; c.fillText(state, w * .74, y);
    });
  };
}
const FLIGHTS = [['10:20', 'Madrid', 'Puerta 12', 'Embarcando'], ['11:05', 'Bogotá', 'Puerta 8', 'A tiempo'], ['12:15', 'Nueva York', 'Puerta 3', 'A tiempo'], ['13:40', 'Ciudad de México', 'Puerta 15', 'Retrasado']];
function drawGateBoard(c, w, h) {
  c.fillStyle = '#10213a'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#17427c'; c.fillRect(0, 0, w, h * .3);
  c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(h * .2)}px system-ui, sans-serif`; c.textAlign = 'left';
  c.fillText('PUERTA 12 · Gate 12', w * .04, h * .21);
  c.font = `600 ${Math.round(h * .15)}px system-ui, sans-serif`;
  c.fillText('IB312  Madrid  10:20', w * .04, h * .55);
  c.fillStyle = '#7fe08a'; c.fillText('Embarcando · Boarding', w * .04, h * .82);
}
function drawToiletDoor(c, w, h) {
  c.fillStyle = '#d9dde1'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#c3c9cf'; c.fillRect(w * .08, h * .05, w * .84, h * .42); c.fillRect(w * .08, h * .52, w * .84, h * .43);
  c.fillStyle = '#7d878f'; c.fillRect(w * .78, h * .5, w * .08, h * .03);
}
// Aircraft seen from the bridge: white fuselage, navy cheatline, open door.
export function drawAircraftDoor(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#f4f6f8'); g.addColorStop(1, '#d8dde2');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#17427c'; c.fillRect(0, h * .2, w, h * .07);
  c.fillStyle = '#f2b53a'; c.fillRect(0, h * .27, w, h * .025);
  const dx = w * .3, dw = w * .4, dy = h * .12, dh = h * .86;
  c.fillStyle = '#9aa5ae'; c.beginPath(); c.roundRect(dx - w * .02, dy - h * .02, dw + w * .04, dh + h * .02, w * .08); c.fill();
  const inside = c.createLinearGradient(0, dy, 0, dy + dh); inside.addColorStop(0, '#f8e2b8'); inside.addColorStop(1, '#c9a676');
  c.fillStyle = inside; c.beginPath(); c.roundRect(dx, dy, dw, dh, w * .07); c.fill();
  c.fillStyle = '#1f447e'; for (let k = 0; k < 3; k++) c.fillRect(dx + dw * (.12 + k * .3), dy + dh * .55, dw * .2, dh * .3);   // seats inside
  c.fillStyle = '#17427c'; c.font = `bold ${Math.round(h * .07)}px system-ui, sans-serif`; c.textAlign = 'left';
  c.fillText('SpanStories Air', w * .05, h * .16);
  c.fillStyle = '#2b3038';
  for (const x of [.08, .18, .8, .9]) { c.beginPath(); c.roundRect(w * x - w * .025, h * .38, w * .05, h * .08, w * .02); c.fill(); }   // windows
}
function drawPlantLeaves(c, w, h) {
  const r = seeded(5);
  for (let k = 0; k < 24; k++) {
    const a = -Math.PI / 2 + (r() - .5) * 2.6, len = h * (.45 + r() * .5);
    c.fillStyle = ['#2f8a3c', '#46a846', '#6cc04a', '#2a7534'][k % 4];
    c.save(); c.translate(w / 2, h); c.rotate(a + Math.PI / 2);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(w * .12, -len * .55, 0, -len); c.quadraticCurveTo(-w * .12, -len * .55, 0, 0); c.fill();
    c.restore();
  }
}

// Potted plants as in D01: white pot, two crossed painted leaf cards.
export function plants(K, context, spots) {
  const { vol, hall, solid, add } = K;
  for (const [x, z] of spots) {
    plantar(context.scope, x, z);   // planta tropical GLB (TropicalPlants.js)
    solid(x - .3, z - .3, x + .3, z + .3);
  }
}
// A flat painted board on a navy frame, flush on a wall. facing: 0 = +z, PI = -z, ±PI/2 = ±x.
export function board(K, x, y, z, width, height, draw, facing = 0, px = 1024) {
  const nx = Math.sin(facing), nz = Math.cos(facing);
  K.vol('hallNavy', [Math.abs(nx) > .5 ? [x - nx * .03, y, z, .08, height + .1, width + .1] : [x, y, z - nz * .03, width + .1, height + .1, .08]]);
  const face = K.painted(width, height, px, draw);
  face.position.set(x + nx * .02, y, z + nz * .02); face.rotation.y = facing;
  return face;
}

// --- D04 · Zona comercial --------------------------------------------------------
export function buildShopsHall(meta, context) {
  const K = createHallKit(meta, context);
  const { w, d, H, vol, solid, painted, back } = K, S = SHOPS;
  const inZ = meta.openings.west, outX = meta.openings.south;
  K.walls();
  const front = S.front, depth = front - back, top = S.fascia[1];
  // Bulkhead over the shopfronts up to the ceiling, gold line under the fascias.
  vol('hallWall', [[0, (top + H) / 2, front - .1, w, H - top, .2]]);
  vol('gold', [[0, S.fascia[0] - .03, front + .02, w, .05, .06]]);
  const partitions = new Set();
  S.units.forEach(([x0, x1, glyph, title, subtitle], i) => {
    const cx = (x0 + x1) / 2, uw = x1 - x0, cafe = glyph === 'cup';
    partitions.add(x0); partitions.add(x1);
    // Fascia with the shop sign.
    const fh = S.fascia[1] - S.fascia[0], fy = (S.fascia[0] + S.fascia[1]) / 2;
    vol('hallNavy', [[cx, fy, front - .04, uw, fh, .1]]);
    painted(uw - .1, fh - .1, 1024, drawSign(glyph, title, subtitle)).position.set(cx, fy, front + .015);
    // Back shelves full of products (painted), a counter by the door.
    vol('woodWarm', [[cx, 1.15, back + .28, uw - .5, 2.3, .5]]);
    painted(uw - .6, 2.2, 1024, drawShelves(glyph)).position.set(cx, 1.15, back + .535);
    solid(x0, back, x1, back + .55);
    if (cafe) {
      // Café: open front, service counter with the coffee machine, menu board.
      const cz = front - 1.2;
      vol('woodWarm', [[cx, .5, cz, uw - 1.6, 1, .6]]);
      vol('counter', [[cx, 1.03, cz, uw - 1.5, .06, .7]]);
      vol('steel', [[cx - 1.2, 1.3, cz - .1, .6, .5, .4]]);
      vol('curtain', [[cx - 1.2, 1.3, cz + .11, .5, .3, .01]]);
      const vitrine = K.add(new T.Mesh(context.scope.own(new T.PlaneGeometry(1.2, .35)), context.kit.glass));
      vitrine.position.set(cx + 1, 1.24, cz + .3);
      board(K, cx, 2.45, back + .6, 2.4, 1.1, drawMenu);
      solid(cx - (uw - 1.6) / 2, cz - .3, cx + (uw - 1.6) / 2, cz + .3);
    } else {
      // Glass shopfront with the door in the middle; a till by the door and a gondola.
      K.glassWall(x0 + .1, front, cx - S.door / 2, front, S.fascia[0] - .05);
      K.glassWall(cx + S.door / 2, front, x1 - .1, front, S.fascia[0] - .05);
      vol('hallNavy', [[x1 - 1.1, .5, front - .8, 1.2, 1, .6]]);
      vol('counter', [[x1 - 1.1, 1.03, front - .8, 1.3, .06, .7]]);
      solid(x1 - 1.7, front - 1.1, x1 - .5, front - .5);
      const gz = (back + front) / 2 - .1, gw = Math.min(2.6, uw - 2.8);
      vol('woodWarm', [[x0 + 1.6, .65, gz, gw, 1.3, .7]]);
      for (const s of [-1, 1]) {
        const face = painted(gw - .1, 1.2, 512, drawShelves(glyph));
        face.position.set(x0 + 1.6, .65, gz + s * .36); face.rotation.y = s < 0 ? Math.PI : 0;
      }
      solid(x0 + 1.6 - gw / 2, gz - .35, x0 + 1.6 + gw / 2, gz + .35);
    }
    void i;
  });
  // Partitions between units, flush with the shopfront line.
  for (const x of partitions) {
    const px = Math.max(-w / 2 + .1, Math.min(w / 2 - .1, x));
    vol('hallWall', [[px, top / 2, (back + front) / 2, .2, top, depth]]);
    solid(px - .1, back, px + .1, front);
  }
  // Café tables (round tops, two chairs each) in the SE corner.
  const tops = [], stems = [], seats = [];
  for (const [x, z] of S.cafeTables) {
    tops.push([x, .74, z, .8, .04, .8]); stems.push([x, .37, z, .06, .72, .06], [x, .02, z, .44, .04, .44]);
    for (const s of [-1, 1]) seats.push([x + s * .62, .46, z, .42, .06, .42], [x + s * .82, .7, z, .05, .44, .42]);
    solid(x - .95, z - .3, x + .95, z + .3);
  }
  vol('counter', tops, K.hall.cylinder); vol('steel', stems, K.hall.cylinder); vol('hallSeat', seats);
  // FIDS on the south wall with benches facing it (SW), toilets on the east wall.
  const F = S.fids;
  board(K, F.x, F.y, d / 2 - .12, F.width, F.height, drawFlights('SALIDAS  |  DEPARTURES', FLIGHTS), Math.PI).userData =
    { semanticId: 'airport.gate.flightBoard', interactionType: 'inspect', zoneId: meta.id };
  for (const x of S.benches) K.bench(x, S.benchZ, 3, false);
  const wc = S.wc;
  board(K, w / 2 - .12, 1.1, wc.z, wc.width, 2.2, drawToiletDoor, -Math.PI / 2, 256);
  board(K, w / 2 - .12, 2.75, wc.z, 2.4, .8, drawSign('wc', 'Baños', 'Toilets'), -Math.PI / 2, 512);
  plants(K, context, [[-w / 2 + .6, d / 2 - .6], [w / 2 - .6, d / 2 - .6], [-2.8, d / 2 - .6], [2.8, d / 2 - .6]]);
  K.floor(({ dashed, arrow, tint }) => {
    for (const [x0, x1] of S.units) tint(x0 + .1, back - .1, x1 - .1, front, 'rgba(196,150,96,.28)');   // shop floors
    dashed([[-w / 2, inZ], [outX, inZ], [outX, d / 2]]);
    arrow(-w / 2 + 1, inZ, 0); arrow(outX, d / 2 - 1, Math.PI / 2);
  });
}

// Gate-lounge bench from the reference terminal (Airport_building.obj, Blender
// Piezas_A "Banco_3asientos"): seats on a shell with a cushioned back, armrests
// between seats, one beam on two legs and a small side table at the east end.
// Same call as K.bench: (x, wallZ, seats, facingNorth).
function loungeBench(K, x, wallZ, seats = 3, facingNorth = false) {
  const { vol, solid } = K, s = facingNorth ? -1 : 1, pitch = .5, W = seats * pitch, table = .3;
  const x0 = x - (W + table) / 2, u = d => wallZ + s * d;   // u: distance forward from the back
  const cx = Array.from({ length: seats }, (_, k) => x0 + pitch * (k + .5));
  vol('shell', [...cx.map(c => [c, .6, u(.03), .47, .52, .03]), ...cx.map(c => [c, .345, u(.3), .47, .03, .5])]);
  vol('hallSeat', [...cx.map(c => [c, .61, u(.07), .43, .48, .06]), ...cx.map(c => [c, .385, u(.3), .43, .05, .45])]);
  const arms = Array.from({ length: seats + 1 }, (_, k) => x0 + pitch * k);
  vol('steel', [
    ...arms.map(a => [a, .6, u(.3), .05, .03, .42]), ...arms.map(a => [a, .46, u(.47), .03, .28, .03]),
    [x0 + (W + table) / 2, .28, u(.3), W + table, .08, .1],
    ...[x0 + .08, x0 + W - .08].flatMap(e => [[e, .12, u(.3), .05, .24, .06], [e, .01, u(.3), .06, .02, .58]]),
    [x0 + W + table / 2, .3, u(.3), .03, .1, .03],
  ]);
  vol('counter', [[x0 + W + table / 2, .35, u(.3), table - .03, .02, .55]]);
  solid(x0, Math.min(wallZ, u(.6)), x0 + W + table, Math.max(wallZ, u(.6)));
}

// --- D05 · Sala de espera ------------------------------------------------------------
export function buildGateLounge(meta, context) {
  const K = createHallKit(meta, context);
  const { w, d, vol, solid, back } = K, G = GATE;
  const outZ = meta.openings.west, inX = meta.openings.north;
  K.walls({ skip: ['south'] });
  K.wallSign({ x: inX, y: 5, width: 6.4, height: 1.6 }, drawSign('seat', 'SALA DE ESPERA', 'Waiting area'));
  // Window onto the apron (the shell glazing and the apron layers beyond it are
  // AirportChunk / ExteriorIllusion): reflections and the blue filter, as D01.
  const { reflections, filter } = createClerestoryGlass(context.scope);
  reflections.map.wrapS = T.RepeatWrapping; reflections.map.repeat.x = Math.max(1, Math.round(w / CLERESTORY_GLASS_SPAN));
  const glass = context.scope.own(new T.PlaneGeometry(w, 3.1));
  for (const [material, inset] of [[reflections, .03], [filter, .045]]) {
    const layer = K.add(new T.Mesh(glass, material));
    layer.position.set(0, 2.55, d / 2 - inset); layer.rotation.y = Math.PI;
  }
  // Beige wall round the window (sill up to 1 m, header from 4.1 m) with the
  // navy band and gold line running over the glazing.
  const south = d / 2 - .1;
  vol('hallWall', [[0, (4.1 + K.H) / 2, south, w, K.H - 4.1, .02], [0, .5, south, w, 1, .02]]);
  vol('skirting', [[0, .06, south - .02, w, .12, .04]]);
  vol('hallNavy', [[0, 4.35, south - .05, w, .3, .1]]);
  vol('gold', [[0, 4.17, south - .07, w, .05, .08]]);
  vol('counter', [[0, 1.02, south - .1, w, .05, .2]]);   // window ledge
  // Limit of the 2.5D apron (GateApron.js): a low rail keeps visitors 1 m off
  // the glass, where the flat layers would start to show.
  const railZ = d / 2 - .75, posts = Array.from({ length: Math.round(w / 2) + 1 }, (_, i) => -w / 2 + .3 + i * (w - .6) / Math.round(w / 2));
  vol('steel', posts.map(x => [x, .45, railZ, .06, .9, .06]));
  vol('steel', [[0, .9, railZ, w - .5, .05, .06], [0, .5, railZ, w - .5, .03, .03]]);
  solid(-w / 2, railZ - .05, w / 2, d / 2);
  // Gate desk by the west door, navy backdrop with the gate board.
  const D = G.desk;
  vol('hallNavy', [[D.x, 1.9, back + .08, D.width + 1.4, 3.2, .1]]);
  board(K, D.x, 2.7, back + .15, 2.8, .9, drawGateBoard).userData = { semanticId: 'airport.gate.flightBoard', interactionType: 'inspect', zoneId: meta.id };
  K.tagged('hallNavy', [[D.x, .52, D.z, D.width, 1.04, .8]], 'airport.gate.boardingPassScanner');
  vol('counter', [[D.x, 1.07, D.z, D.width + .1, .06, .9]]);
  vol('monitor', [[D.x - .6, 1.32, D.z - .15, .5, .36, .04], [D.x + .6, 1.32, D.z - .15, .5, .36, .04]]);
  solid(D.x - D.width / 2, D.z - .4, D.x + D.width / 2, D.z + .4);
  // Boarding queue (Prioridad / General) ending at the e-gates by the door.
  K.queue(G.queueRows, []);
  const E = G.eGates, zs = G.queueRows.map(r => r[0]);
  K.tagged('shell', zs.map(z => [E.x, .5, z, .7, 1, .26]), 'airport.gate.boardingPassScanner');
  vol('ledGreen', zs.map(z => [E.x + .3, 1.01, z, .1, .02, .14]));
  for (const z of zs) solid(E.x - .35, z - .13, E.x + .35, z + .13);
  for (let i = 0; i < zs.length - 1; i++) for (const s of [-1, 1]) {
    const flap = K.add(new T.Mesh(context.scope.own(new T.PlaneGeometry(.4, .7)), context.kit.glass));
    flap.position.set(E.x, .75, (zs[i] + zs[i + 1]) / 2 + s * .3); flap.rotation.y = Math.PI / 2;
  }
  // Seat rows facing the window, either side of the walkway.
  for (const z of G.seatRows) for (const x of G.seatX) loungeBench(K, x, z);
  for (const z of G.north.rows) for (const x of G.north.x) loungeBench(K, x, z);
  const F = G.fids;
  board(K, F.x, F.y, back + .15, F.width, F.height, drawFlights('SALIDAS  |  DEPARTURES', FLIGHTS));
  plants(K, context, [[w / 2 - .6, back + .7], [-w / 2 + .6, d / 2 - 1.4], [w / 2 - .6, d / 2 - 1.4], [-3.2, back + .7], [3.2, back + .7]]);
  K.floor(({ carpet, dashed, arrow, text }) => {
    carpet(G.queueRows[0][1] - .2, zs[0] - .15, G.queueRows[0][2] + .2, zs.at(-1) + .15);
    text(-7.4, (zs[0] + zs[1]) / 2, 'PRIORIDAD'); text(-7.4, (zs[1] + zs[2]) / 2, 'GENERAL');
    const mid = [(zs[0] + zs[1]) / 2, (zs[1] + zs[2]) / 2];
    for (const z of mid) dashed([[inX, -d / 2], [inX, -2.4], [G.queueRows[0][2] + .9, z], [G.queueRows[0][2], z]]);
    arrow(inX, -d / 2 + 1, Math.PI / 2);
    for (const z of mid) arrow(G.queueRows[0][2] - .7, z, Math.PI, .4);
    arrow(-w / 2 + .5, outZ, Math.PI, .4);
  });
}

// --- D06 · Embarque (jet bridge) ---------------------------------------------------------
export function buildBoardingBridge(meta, context) {
  const K = createHallKit(meta, context);
  const { w, d, H, vol, solid, add } = K, B = BOARDING.tunnel, [wy0, wy1] = BOARDING.windows;
  K.walls();
  const x0 = -w / 2 + .1, x1 = B.x[1], len = x1 - x0, cx = (x0 + x1) / 2, hz = B.half;
  // Close the room around the tunnel mouth: wall at x1 outside the tunnel.
  const side = d / 2 - hz;
  vol('hallWall', [...[-1, 1].map(s => [x1, H / 2, s * (hz + side / 2), .2, H, side]), [x1, (B.height + .15 + H) / 2, 0, .2, H - B.height - .15, 2 * hz]]);
  vol('hallNavy', [[x1 + .11, 3.4, 0, .02, .3, d - .2]]);
  board(K, x1 + .12, 3.25, 0, 3.4, .9, drawSign('plane', 'EMBARQUE', 'Boarding · Puerta 12'), Math.PI / 2, 1024);
  // Tunnel walls: lower and upper panels, glazed band, navy ribs, roof and light.
  // Opaque sky behind the apron layer (its sky is transparent), tinted by the ambience.
  const skyMaterial = context.scope.own(new T.MeshBasicMaterial({ color: 0xbfe3f5 }));
  context.scope.defer(luz.tintar(skyMaterial, 'cartel'));
  const panels = [];
  for (const s of [-1, 1]) {
    const z = s * hz;
    panels.push([cx, wy0 / 2, z, len, wy0, .1], [cx, (wy1 + B.height) / 2, z, len, B.height - wy1, .1]);
    solid(x0, z - .1, x1, z + .1);
    // Beyond the glazing: the apron illustration, then reflections facing in.
    const apron = add(new T.Mesh(context.scope.own(new T.PlaneGeometry(len * 1.6, 5)), context.kit.exterior.materials.apron));
    apron.position.set(cx, 1.9, z + s * .9); apron.rotation.y = s > 0 ? Math.PI : 0;
    const sky = add(new T.Mesh(context.scope.own(new T.PlaneGeometry(len * 2, 8)), skyMaterial));
    sky.position.set(cx, 3, z + s * 1.9); sky.rotation.y = s > 0 ? Math.PI : 0;
    const { reflections } = createClerestoryGlass(context.scope);
    reflections.map.wrapS = T.RepeatWrapping; reflections.map.repeat.x = Math.max(1, Math.round(len / CLERESTORY_GLASS_SPAN));
    const pane = add(new T.Mesh(context.scope.own(new T.PlaneGeometry(len, wy1 - wy0)), reflections));
    pane.position.set(cx, (wy0 + wy1) / 2, z - s * .02); pane.rotation.y = s > 0 ? Math.PI : 0;
  }
  vol('shell', panels);
  vol('shell', [[cx, B.height + .07, 0, len, .14, 2 * hz + .2]]);
  vol('warmLight', [[cx, B.height - .005, 0, len - .4, .02, .3]]);
  const ribs = [];
  for (let x = x1 - .1; x > x0; x -= 1.6) ribs.push([x, B.height / 2, -hz, .12, B.height, .14], [x, B.height / 2, hz, .12, B.height, .14], [x, B.height + .02, 0, .12, .12, 2 * hz]);
  vol('hallNavy', ribs);
  // Aircraft door at the far end.
  const door = K.painted(2 * hz, B.height, 1024, drawAircraftDoor);
  door.position.set(x0 + .03, B.height / 2, 0); door.rotation.y = Math.PI / 2;
  door.userData = { semanticId: 'airport.boarding.jetBridge', interactionType: 'inspect', zoneId: meta.id }; context.interactive.push(door);
  plants(K, context, [[w / 2 - .6, -d / 2 + .6], [w / 2 - .6, d / 2 - .6]]);
  K.floor(({ tint, dashed, arrow }) => {
    tint(x0, -hz, x1, hz, '#2a4f86');   // navy carpet in the bridge
    dashed([[w / 2, meta.openings.east], [x1 + .3, 0]]);
    arrow(x1 + 1.4, 0, Math.PI);
  });
}
