import * as T from './three.js';
import { BAGGAGE, CUSTOMS, ARRIVALS_HALL } from './routes.js';
import { createHallKit, drawSign } from './HallKit.js';
import { luz } from './Luz25D.js';
import { createClerestoryGlass, CLERESTORY_GLASS_SPAN } from './ExteriorIllusion.js';
import { plants, board, drawFlights, drawAircraftDoor } from './ConcourseHalls.js';

// Arrivals, in D01's palette (HallKit.js), each with a one-way walk from its
// entry door to its exit door: A00 corridor from the aircraft, A02 baggage
// claim, A03 customs, A04 arrivals hall, A05 exit to taxis and buses.
// (A01 · Inmigración is PassportHall.js with routes.js IMMIGRATION.)

const ARRIVING = [['09:40', 'Madrid', 'IB311', 'Cinta 1'], ['10:05', 'Bogotá', 'AV200', 'Cinta 2'], ['10:30', 'Lima', 'LA504', 'Aterrizado'], ['11:15', 'Miami', 'AA902', 'En vuelo']];
function drawChannel(bg, title, subtitle) {
  return (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffffff'; c.fillRect(0, h * .9, w, h * .1);
    c.textAlign = 'center';
    c.font = `bold ${Math.round(h * .3)}px system-ui, sans-serif`; c.fillText(title, w / 2, h * .42, w * .92);
    c.font = `600 ${Math.round(h * .2)}px system-ui, sans-serif`; c.fillText(subtitle, w / 2, h * .74, w * .92);
  };
}
function drawKiosk(title, subtitle, colour) {
  return (c, w, h) => {
    c.fillStyle = '#f4ecdc'; c.fillRect(0, 0, w, h);
    c.fillStyle = colour; c.fillRect(0, 0, w, h * .28);
    c.fillStyle = '#ffffff'; c.textAlign = 'center';
    c.font = `bold ${Math.round(w * .13)}px system-ui, sans-serif`; c.fillText(title, w / 2, h * .13, w * .9);
    c.font = `600 ${Math.round(w * .09)}px system-ui, sans-serif`; c.fillText(subtitle, w / 2, h * .23, w * .9);
    c.fillStyle = '#17427c'; c.fillRect(w * .1, h * .38, w * .8, h * .3);
    c.fillStyle = '#9fc2d4'; for (let i = 0; i < 3; i++) c.fillRect(w * .16, h * (.43 + i * .08), w * (.5 + (i % 2) * .15), h * .035);
  };
}
function drawTransport(c, w, h) {
  c.fillStyle = '#17427c'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f2b53a'; c.fillRect(0, h * .9, w, h * .1);
  const item = (y, colour, label, sub, glyph) => {
    c.fillStyle = colour; c.beginPath(); c.roundRect(w * .06, y, w * .2, w * .2, w * .03); c.fill();
    glyph(w * .16, y + w * .1);
    c.textAlign = 'left'; c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(w * .1)}px system-ui, sans-serif`; c.fillText(label, w * .32, y + w * .1);
    c.fillStyle = '#f7c948'; c.font = `600 ${Math.round(w * .07)}px system-ui, sans-serif`; c.fillText(sub, w * .32, y + w * .18);
  };
  const car = (x, y, s = w * .12) => { c.fillStyle = '#17427c'; c.fillRect(x - s / 2, y - s * .1, s, s * .35); c.fillRect(x - s * .3, y - s * .35, s * .6, s * .3); c.beginPath(); c.arc(x - s * .28, y + s * .28, s * .1, 0, 7); c.arc(x + s * .28, y + s * .28, s * .1, 0, 7); c.fill(); };
  const bus = (x, y, s = w * .13) => { c.fillStyle = '#17427c'; c.fillRect(x - s / 2, y - s * .4, s, s * .7); c.fillStyle = '#ffffff'; c.fillRect(x - s * .4, y - s * .3, s * .8, s * .25); };
  item(h * .08, '#f7c948', 'Taxis', 'Taxi rank', car);
  item(h * .36, '#ffffff', 'Autobús', 'Bus · Shuttle', bus);
  item(h * .64, '#9fc2d4', 'Alquiler', 'Car rental', car);
}
// Apron window on an interior wall: sky, apron illustration, reflections.
function apronWindow(K, context, { x, y, z, width, height, facing = 0 }) {
  const { add } = K, nz = Math.cos(facing), nx = Math.sin(facing);
  const at = (m, off) => { const o = add(new T.Mesh(context.scope.own(new T.PlaneGeometry(width, height)), m)); o.position.set(x + nx * off, y, z + nz * off); o.rotation.y = facing; return o; };
  const sky = context.scope.own(new T.MeshBasicMaterial({ color: 0xbfe3f5 }));
  context.scope.defer(luz.tintar(sky, 'cartel'));
  at(sky, .01); at(context.kit.exterior.materials.apron, .02);
  const { reflections, filter } = createClerestoryGlass(context.scope);
  reflections.map.wrapS = T.RepeatWrapping; reflections.map.repeat.x = Math.max(1, Math.round(width / CLERESTORY_GLASS_SPAN));
  at(reflections, .03); at(filter, .04);
  const frame = Math.abs(nx) > .5
    ? [[x, y + height / 2, z, .1, .1, width], [x, y - height / 2, z, .14, .1, width]]
    : [[x, y + height / 2, z, width, .1, .1], [x, y - height / 2, z, width, .1, .14]];
  const bays = Math.max(1, Math.round(width / 2.2));
  for (let i = 0; i <= bays; i++) {
    const t = -width / 2 + i * width / bays;
    frame.push(Math.abs(nx) > .5 ? [x + nx * .05, y, z + t, .06, height, .08] : [x + t, y, z + nz * .05, .08, height, .06]);
  }
  K.vol('hallNavy', frame);
}
// Street glazing (A04/A05): the shell has the glass and the sliding doors;
// here beige wall round it, the band over it, and reflections either side of
// the door opening.
function streetGlazing(K, context) {
  const { w, d, H, vol, add } = K, south = d / 2 - .1;
  vol('hallWall', [[0, (4.1 + H) / 2, south, w, H - 4.1, .02], [0, .5, south, w, 1, .02]]);
  vol('hallNavy', [[0, 4.35, south - .05, w, .3, .1]]);
  vol('gold', [[0, 4.17, south - .07, w, .05, .08]]);
  const { reflections, filter } = createClerestoryGlass(context.scope);
  reflections.map.wrapS = T.RepeatWrapping;
  const span = (w - 4) / 2;
  reflections.map.repeat.x = Math.max(1, Math.round(span / CLERESTORY_GLASS_SPAN));
  for (const s of [-1, 1]) for (const [m, inset] of [[reflections, .03], [filter, .045]]) {
    const pane = add(new T.Mesh(context.scope.own(new T.PlaneGeometry(span, 3.1)), m));
    pane.position.set(s * (2 + span / 2), 2.55, d / 2 - inset); pane.rotation.y = Math.PI;
  }
}

// --- A00 · Corredor de llegadas ------------------------------------------------------
export function buildArrivalCorridor(meta, context) {
  const K = createHallKit(meta, context);
  const { w, d, back } = K, outX = meta.openings.south;
  K.walls();
  apronWindow(K, context, { x: -1.5, y: 2.1, z: back + .1, width: 9, height: 2.2 });
  K.wallSign({ x: -1.5, y: 4.9, width: 5.6, height: 1.4 }, drawSign('plane', 'LLEGADAS', 'Arrivals · Pasaportes →'));
  // The aircraft door the passengers come from, on the west wall.
  const door = board(K, -w / 2 + .12, 1.35, 0, 2.6, 2.6, drawAircraftDoor, Math.PI / 2);
  door.userData = { semanticId: 'airport.boarding.jetBridge', interactionType: 'inspect', zoneId: meta.id }; context.interactive.push(door);
  K.solid(-w / 2, -1.4, -w / 2 + .3, 1.4);
  plants(K, context, [[w / 2 - .6, back + .7], [-w / 2 + .6, d / 2 - .6]]);
  K.floor(({ carpet, dashed, arrow }) => {
    carpet(-w / 2 + .4, -.8, outX + .8, .8);
    dashed([[-w / 2 + 1, 0], [outX, 0], [outX, d / 2]]);
    arrow(-w / 2 + 1.6, 0, 0); arrow(outX, d / 2 - .8, Math.PI / 2, .45);
  });
}

// --- A02 · Recogida de equipaje -----------------------------------------------------------
export function buildBaggageHall(meta, context) {
  const K = createHallKit(meta, context);
  const { w, d, vol, solid, hall, back } = K, B = BAGGAGE;
  K.walls();
  K.wallSign({ x: 0, y: 5, width: 7.4, height: 1.8 }, drawSign('bag', 'RECOGIDA DE EQUIPAJE', 'Baggage claim'));
  const [L, D] = B.size, ra = L / 2 - .3, rb = D / 2 - .3;
  const belt = context.scope.own(new T.TorusGeometry(1, .2, 6, 48));
  const bags = [];
  B.carousels.forEach(([cx, cz], i) => {
    vol('steel', [[cx, .32, cz, L, .64, D]], hall.cylinder).userData = { semanticId: 'airport.baggage.carousel', interactionType: 'inspect', zoneId: meta.id };
    vol('shell', [[cx, .68, cz, L - 1.2, .1, D - 1.2]], hall.cylinder);
    const ring = K.add(new T.Mesh(belt, hall.materials.curtain));
    ring.rotation.x = Math.PI / 2; ring.scale.set(ra, rb, 1); ring.position.set(cx, .68, cz);
    solid(cx - L / 2, cz - D / 2, cx + L / 2, cz + D / 2);
    // Carousel number and flight on the nearest long wall.
    const wallZ = cz < 0 ? back + .15 : d / 2 - .15;
    board(K, cx, 2.5, wallZ, 3.6, 1.1, drawFlights(`CINTA ${i + 1}  ·  BELT ${i + 1}`, [ARRIVING[i]]), cz < 0 ? 0 : Math.PI);
    for (let k = 0; k < 6; k++) bags.push([cx, i, k]);
  });
  // Suitcases riding the carousels.
  const suitcases = vol('luggage', bags.map(([cx, i, k]) => { const a = k * Math.PI / 3; return [cx + Math.cos(a) * ra, .92, B.carousels[i][1] + Math.sin(a) * rb, .55, .34, .7]; }));
  suitcases.userData = { semanticId: 'airport.baggage.suitcase', zoneId: meta.id, interactionType: 'inspect' }; context.interactive.push(suitcases);
  // Trolleys lined up on the west wall.
  const T0 = B.trolleys, trolleys = [];
  for (let z = T0.z[0]; z <= T0.z[1]; z += .42) trolleys.push([T0.x, .62, z, .9, .5, .34], [T0.x + .4, .95, z, .06, .7, .3]);
  vol('steel', trolleys);
  solid(T0.x - .5, T0.z[0] - .2, T0.x + .5, T0.z[1] + .2);
  K.bench(-8, d / 2 - .1, 3, true); K.bench(8, back - .0, 3, false);
  plants(K, context, [[-w / 2 + .6, d / 2 - .6], [w / 2 - .6, back + .6]]);
  K.floor(({ carpet, dashed, arrow }) => {
    carpet(-w / 2 + .3, -1.2, w / 2 - .3, 1.2);
    dashed([[-w / 2, 0], [w / 2, 0]]);
    arrow(-w / 2 + 1, 0, 0); arrow(w / 2 - 1, 0, 0);
  });
  let time = 0; const matrix = new T.Matrix4(), rotation = new T.Quaternion(), position = new T.Vector3(), scale = new T.Vector3(.55, .34, .7);
  return { update(dt) {
    time += dt * .22;
    bags.forEach(([cx, i, k], n) => {
      const a = time + k * Math.PI * 2 / 6, cz = B.carousels[i][1];
      rotation.setFromAxisAngle(new T.Vector3(0, 1, 0), -a);
      matrix.compose(position.set(cx + Math.cos(a) * ra, .92, cz + Math.sin(a) * rb), rotation, scale);
      suitcases.setMatrixAt(n, matrix);
    });
    suitcases.instanceMatrix.needsUpdate = true;
  } };
}

// --- A03 · Aduana ----------------------------------------------------------------------------
export function buildCustomsHall(meta, context) {
  const K = createHallKit(meta, context);
  const { w, d, H, vol, solid, back } = K, C = CUSTOMS, outX = meta.openings.south;
  K.walls();
  K.wallSign({ x: -2.5, y: 5, width: 5, height: 1.3 }, drawSign('bag', 'ADUANA', 'Customs'));
  // Glass splits the west door: north = red channel, south = green channel.
  K.glassWall(C.split[0], 0, C.split[1], 0, 1.6);
  // Channel signs hung over each half, facing the door.
  const sx = -w / 2 + 2.2;
  for (const [z, colour, title, sub] of [[-2.1, '#c8322f', 'Artículos a declarar', 'Goods to declare'], [2.1, '#2f8f4e', 'Nada que declarar', 'Nothing to declare']]) {
    vol('steelDark', [-1, 1].map(s => [sx, (3.2 + H) / 2, z + s * 1.2, .03, H - 3.2, .03]));
    const face = K.painted(3.4, 1, 512, drawChannel(colour, title, sub));
    face.position.set(sx - .01, 2.7, z); face.rotation.y = -Math.PI / 2;
    vol('hallNavy', [[sx + .03, 2.7, z, .05, 1.04, 3.44]]);
  }
  // Red channel: inspection bench with an officer's desk behind it.
  const [bx0, bx1] = C.bench.x, bz = C.bench.z;
  K.tagged('steel', [[(bx0 + bx1) / 2, .85, bz, bx1 - bx0, .08, .9]], 'airport.customs.redChannel');
  vol('steelDark', [bx0 + .2, bx1 - .2].flatMap(x => [[x, .42, bz - .35, .06, .84, .06], [x, .42, bz + .35, .06, .84, .06]]));
  solid(bx0, bz - .45, bx1, bz + .45);
  vol('hallNavy', [[(bx0 + bx1) / 2, .5, back + .55, 2, 1, .6]]);
  vol('monitor', [[(bx0 + bx1) / 2, 1.3, back + .5, .6, .4, .05]]);
  solid((bx0 + bx1) / 2 - 1, back, (bx0 + bx1) / 2 + 1, back + .85);
  plants(K, context, [[w / 2 - .6, d / 2 - .6], [-w / 2 + .6, d / 2 - .6]]);
  K.floor(({ tint, dashed, arrow }) => {
    tint(-w / 2, -d / 2 + .1, C.split[1], 0, 'rgba(200,50,47,.14)');
    tint(-w / 2, 0, w / 2, d / 2 - .1, 'rgba(47,143,78,.14)');
    dashed([[-w / 2, 1.3], [outX, 1.3], [outX, d / 2]]);
    dashed([[-w / 2, -1.3], [w / 2 - 1.2, -1.3], [w / 2 - 1.2, 2.6], [outX + 1, 2.6], [outX + 1, d / 2]]);
    arrow(-w / 2 + 1, 1.3, 0); arrow(-w / 2 + 1, -1.3, 0); arrow(outX, d / 2 - .8, Math.PI / 2, .45);
  });
}

// --- A04 · Llegadas ---------------------------------------------------------------------------
export function buildArrivalsHall(meta, context) {
  const K = createHallKit(meta, context);
  const { w, d, vol, solid, back } = K, A = ARRIVALS_HALL, outZ = meta.openings.east, inX = meta.openings.north;
  K.walls({ skip: ['south'] });
  streetGlazing(K, context);
  K.wallSign({ x: -5.5, y: 5, width: 6, height: 1.5 }, drawSign('plane', 'BIENVENIDOS', 'Welcome · Llegadas'));
  // Greeters' rails either side of the walk from the north door.
  const R = A.rails, rails = [];
  for (const x of R.x.map((x, i) => x + (i ? .25 : -.25))) {
    rails.push([x, 1, (R.z[0] + R.z[1]) / 2, .06, .06, R.z[1] - R.z[0]]);
    for (let z = R.z[0]; z <= R.z[1] + .01; z += (R.z[1] - R.z[0]) / 3) rails.push([x, .5, z, .06, 1, .06]);
    solid(x - .05, R.z[0], x + .05, R.z[1]);
  }
  vol('steel', rails);
  // Information desk.
  const I = A.info;
  K.tagged('hallNavy', [[I.x, .52, I.z, 2.4, 1.04, .8]], 'airport.arrivals.info');
  vol('counter', [[I.x, 1.07, I.z, 2.5, .06, .9]]);
  const infoSign = K.painted(1.8, .6, 512, drawSign('info', 'Información', 'Information'));
  infoSign.position.set(I.x, 2.9, I.z); vol('steelDark', [[I.x, (3.2 + K.H) / 2, I.z - .03, .03, K.H - 3.2, .03]]);
  solid(I.x - 1.2, I.z - .4, I.x + 1.2, I.z + .4);
  // Car-rental kiosks on the west wall, café kiosk and cash machine NE.
  A.rentals.forEach((z, i) => {
    vol('hallNavy', [[-w / 2 + .5, .6, z, .8, 1.2, 1.9]]);
    vol('counter', [[-w / 2 + .5, 1.23, z, .9, .06, 2]]);
    board(K, -w / 2 + .12, 2.3, z, 1.9, 1.3, drawKiosk(['Rent a Car', 'AutoRuta', 'CocheYa'][i % 3], 'Alquiler · Rental', ['#c8322f', '#2f7fd0', '#2f8f4e'][i % 3]), Math.PI / 2, 512);
    solid(-w / 2, z - 1, -w / 2 + .9, z + 1);
  });
  const Cf = A.cafe;
  vol('woodWarm', [[Cf.x, .55, Cf.z, 2.6, 1.1, .7]]); vol('counter', [[Cf.x, 1.13, Cf.z, 2.7, .06, .8]]);
  vol('steel', [[Cf.x - .8, 1.4, Cf.z - .1, .5, .5, .4]]);
  board(K, Cf.x + 1.1, 2.6, back + .15, 2.8, .9, drawSign('cup', 'Cafetería', 'Coffee'));
  solid(Cf.x - 1.3, Cf.z - .35, Cf.x + 1.3, Cf.z + .35);
  board(K, 5, 2.4, back + .15, 3.4, 1.1, drawFlights('LLEGADAS  |  ARRIVALS', ARRIVING)).userData = { semanticId: 'airport.gate.flightBoard', interactionType: 'inspect', zoneId: meta.id };
  for (const x of A.benches) K.bench(x, A.benchZ, 3, false);
  plants(K, context, [[w / 2 - .6, d / 2 - .8], [-w / 2 + .6, d / 2 - .8], [w / 2 - .6, back + .6]]);
  K.floor(({ carpet, dashed, arrow, text }) => {
    carpet(R.x[0] - .2, R.z[0], R.x[1] + .2, R.z[1]);
    dashed([[inX, -d / 2], [inX, outZ], [w / 2, outZ]]);
    dashed([[inX, outZ], [inX, d / 2 - .4]]);
    arrow(inX, -d / 2 + 1, Math.PI / 2); arrow(w / 2 - 1, outZ, 0, .45); arrow(inX, d / 2 - 1.2, Math.PI / 2, .45);
    text(inX, R.z[1] + .8, 'BIENVENIDOS');
  });
}

// --- A05 · Salida ------------------------------------------------------------------------------
export function buildExitHall(meta, context) {
  const K = createHallKit(meta, context);
  const { w, d, back } = K, inZ = meta.openings.west;
  K.walls({ skip: ['south'] });
  streetGlazing(K, context);
  K.wallSign({ x: 0, y: 5, width: 6, height: 1.5 }, drawSign('plane', 'SALIDA', 'Exit · Taxis · Autobuses'));
  board(K, w / 2 - .12, 1.9, -1.5, 1.6, 2.4, drawTransport, -Math.PI / 2, 512);
  K.bench(-2.5, back, 3, false); K.bench(2.5, back, 3, false);
  plants(K, context, [[-w / 2 + .6, back + .6], [w / 2 - .6, back + .6], [-w / 2 + .6, d / 2 - .8], [w / 2 - .6, d / 2 - .8]]);
  K.floor(({ carpet, dashed, arrow }) => {
    carpet(-2, 1, 2, d / 2 - .2);
    dashed([[-w / 2, inZ], [0, inZ], [0, d / 2]]);
    arrow(-w / 2 + 1, inZ, 0); arrow(0, d / 2 - 1, Math.PI / 2);
  });
}
