// Full route is a contract only. Only the four slice factories are instantiated.
export const DIMENSIONS = { ceiling: 7.5, doorHeight: 2.8, portalWidth: 4, counterHeight: 1.1, playerHeight: 1.7, playerRadius: 0.32 };
// D00 facade: canopy underside and the x of its downlights (zone-local metres);
// the portico keeps its lower roof. Shared by the shell, the lamps and the soffit.
export const CANOPY_SOFFIT = 7.2;
export const CANOPY_SPOTS = [-5.6, -2.8, 0, 2.8, 5.6];
// Exterior-only facade contract. The glass, side piers, first portico column
// and check-in wall share one front plane. Only the central canopy overhangs;
// the lateral cornices terminate flush with the stone boundary piers.
export const FACADE = { front: 5, sideFront: 5.12, pierWidth: .72, roofFront: 8.25, canopyWidth: 14.72, canopyDepth: 3.25,
  canopyZ: 6.625, sideSoffit: 5.34, sideTop: 6.18, sideInner: 7.36, sideOuter: 14.8 };
// Portico: a covered walk along the hall's west side, from the canopy line
// back to the end of the building. Roof x (west edge -> hall wall) and z
// (back end -> front); one row of columns on its west edge, open to the street.
export const PORTICO_X = [-FACADE.sideOuter, -FACADE.sideInner];
export const PORTICO_Z = [-5, FACADE.sideFront];
// Soffit downlights as [x, z] along the walk's axis: the first ones are scene
// lamps, the back ones only 3D fixtures with a painted halo.
export const PORTICO_SPOTS = [[-12.8, 4.3], [-9.5, 1.4]];
export const PORTICO_BACK_SPOTS = [[-9.5, 4.3], [-12.8, 1.4], [-12.8, -1.5], [-9.5, -1.5], [-12.8, -4], [-9.5, -4]];
// Pavement runs under the portico; the lawn starts west of the columns and
// behind the street pavement (z < PORTICO_LAWN_EDGE).
export const PORTICO_LAWN_EDGE = 7.3;
export const PORTICO_LAWN_WEST = PORTICO_X[0] - .25;
// D00 street, zone-local z: near kerb, far kerb, and how far the asphalt sits
// below the pavement (the kerb face shows this drop).
export const STREET = { curb: 10.1, far: 17.7, drop: .14 };
// D00 hall interior (zone-local metres), measured on the reference view: its
// back wall (14 m) spans image px 255-1390, so x = (px - 822) / 81. Furniture
// stands along the back wall; x values are centres unless given as a range.
export const ENTRANCE_HALL = {
  band: { y: 3.45, height: .26, depth: .14 },        // navy sign band, gold line under it
  signHeight: 1, signDepth: .18,
  infoSign: { x: -4.3, width: 3.4 }, departuresSign: { x: .85, width: 4.8 }, checkinSign: { z: 0, width: 4.2 },
  woodWall: [-7, -2.55],                             // warm wood panelling behind the desk
  poster: { x: -3.35, width: .85, y: [1.5, 2.86] },
  desk: { x: [-6.3, -2.9], front: -3.1, depth: .8 },
  bench: { x: .15, seats: 3, back: -4.75 },
  bin: { x: 3.27 },
  fids: { x: 4.55, width: 1.25, height: 2.45 },
  panelJoints: [-1.16, .96, 3.22, 5.6],              // vertical joints of the beige wall panels
  // Floor (top-view reference): 120 x 60 cm porcelain slabs (long side on X,
  // straight grid; `tile` = the 60 cm row the bands snap to); two full-width bands of
  // one blue-grey tile row edged by 10 cm yellow lines (centres z); the mat.
  slab: [1.2, .6], tile: .6, bands: [-1.5, 1.4], bandLine: .1, gloss: .4,
  mat: { width: 8.4, depth: 2.3 },
  beams: [-2.3, 2.3], lightsX: [-4.7, 0, 4.7], lightsZ: [-2.6, 1.8],
  westBays: 4,                                       // glazed west wall, up to the portico soffit
};
export const DEPARTURES = [
  ['D00', 'Entrada', 14, 10], ['D01', 'Facturación', 24, 16], ['D02', 'Seguridad', 20, 14],
  ['D03', 'Pasaportes', 16, 10], ['D04', 'Zona comercial', 24, 12], ['D05', 'Sala de espera', 24, 16], ['D06', 'Embarque', 16, 8],
].map(([id, label, width, depth]) => ({ id, label, width, depth }));
export const ARRIVALS = [
  ['A00', 'Corredor de llegadas', 14, 6], ['A01', 'Inmigración', 20, 14], ['A02', 'Recogida de equipaje', 24, 18],
  ['A03', 'Aduana', 16, 10], ['A04', 'Llegadas', 20, 14], ['A05', 'Salida', 14, 10],
].map(([id, label, width, depth]) => ({ id, label, width, depth }));
// Non-overlapping folded blockout: centers on alternating E / S / W edges.
export const SLICE = ['D01', 'D02', 'D04', 'D05'].map((id, i) => ({
  ...DEPARTURES.find(z => z.id === id),
  center: [[0, 0], [22, 0], [24, 13], [0, 16]][i],
  // Connections are shifted to shorten sight lines; corridor clear width is four metres.
  openings: [ { east: 0 }, { west: 0, south: 0 }, { north: -2, west: 0 }, { east: -3 } ][i],
}));

// Orthogonal full-route floor plans. Adjacent door centres coincide in world metres.
export const DEPARTURE_ROUTE = DEPARTURES.map((zone, i) => ({
  ...zone,
  center: [[-19, 0], [0, 0], [22, 0], [22, 12], [42, 13], [42, 27], [22, 27]][i],
  openings: [
    // D02 → D03 at world x 27, D03 → D04 at world z 14.5 (one-way flows, see SECURITY / PASSPORT).
    { east: 0 }, { west: 0, east: 0 }, { west: 0, south: 5 },
    { north: 5, east: 2.5 }, { west: 1.5, south: 0 }, { north: 0, west: 0 }, { east: 0 },
  ][i],
}));
export const ARRIVAL_ROUTE = ARRIVALS.map((zone, i) => ({
  ...zone,
  center: [[0, 0], [0, 10], [22, 10], [42, 10], [44, 22], [61, 22]][i],
  openings: [
    // A00 → A01 at world x 4.5 (immigration lobby on the east, as D03);
    // A03 → A04 at world x 45 (customs channels end on the east side).
    { south: 4.5 }, { north: 4.5, east: 0 }, { west: 0, east: 0 },
    { west: 0, south: 3 }, { north: 1, east: 0 }, { west: 0 },
  ][i],
}));

// D01 · Facturación (zone-local metres). Counters stand against the north wall
// facing +Z; their front stays clear for passengers (no scale or belt in front).
// Bags go over the counter onto one collector belt behind the agents, which
// runs along the wall into a hatch at the east end.
export const CHECKIN = {
  counters: 8, pitch: 2.35, deskWidth: 1.75, deskDepth: .88, deskZ: -5,
  agentAisle: 1.1,                         // clear floor behind the desks
  belt: { width: .7, height: .5, hatchWidth: 1.2 },
  lanesX: [-5.25, -1.75, 1.75, 5.25],      // queue carpets (floor decals)
  queueZ: [4.2, 6],                        // belt-barrier rows
  // Walls of the reference view (looking east down the hall).
  wood: { height: 3.2, pilaster: .5 },     // warm panelling behind the counters, white end pilasters
  canopy: { y: 3.2, thickness: .28, fascia: 1.1, overhang: .2 }, // soffit over the agents, navy sign fascia
  fids: { x: -5.4, width: 3.6, height: 1.1 },
  numberSign: { size: .46, y: 1.9 },
  pillarsX: [-10, -6, -2, 2, 6, 10],       // south glazing: white piers
  pillar: { width: .7, depth: .45 },
  glazing: { sill: 3.2, top: 5.6 },        // clerestory (sky only); sill = wood.height, one line round the room
  // Solid wall under the clerestory: one feature per inner bay (between pillarsX,
  // west → east); plants stand in the two narrow end bays and beside each bench.
  southBays: ['anuncio', 'bancos', 'servicios', 'bancos', 'anuncio'],
  lightbox: { width: 2.6, height: 1.6, y: 1.75, depth: .14, frame: .08 },
  bench: { seats: 3, pitch: .66, shift: -.4 },   // seat row west of the bay centre, plant east of it
  services: { vending: [1, 1.9, .75], atm: [.8, 1.7, .6], gap: .3 },   // [width, height, depth]
  sky: { cloudScale: .08, wind: .004, distance: 12, margin: 20, height: 40 },   // clouds: tiling, drift (tiles/s); sky box beyond the glass (m)
  hangingSign: { pillar: 4, width: 1, height: 2.6, y: 3.3 },
  plantZ: 7.05,
  endDoor: { sign: { width: 3.8, height: .95, y: 3.55 }, plantZ: 3.3 },
};

// D02 · Seguridad (zone-local metres). One-way flow west → east: entry from
// D01 on the west wall (z = 0) onto a clear apron, stanchion queue, two lanes
// in the middle of the room (tray table → X-ray → rollers → recompose; the
// passenger walks the corridor beside the belt through the arch; glass stops
// anyone going round it), a clear crossing at the east end, then the exit to
// D03 on the south wall at x = 5, past the shoe benches.
export const SECURITY = {
  lanesZ: [-5, -1],                         // belt centre lines
  walkway: 2,                               // corridor centre, south of each belt (mid-way between the X-rays)
  table: { x: [-2.6, -.2], height: .86, depth: .92 },
  trays: { x: -2.1, stack: 5, size: [.76, .1, .54] },
  xray: { x: [-.2, 3.2], height: 2.25, depth: 1.75, collar: .6, tunnel: [1.25, .9] },   // tunnel [width, height]
  exit: { x: [3.2, 5.2] },
  recompose: { x: [5.2, 7.4] },
  arch: { x: 1.5, inner: 1, height: 2.45, post: [.34, .7] },   // post [width across, depth along]
  // Queue west of the lanes, apron x -10 … -7.4 kept clear in front of the door.
  // Enter the southern aisle from the west, snake east-west-east, leave at the
  // east end (x -3.6) and step north or south to a lane corridor.
  queueRows: [[-2.6, -7.4, -3.6], [-1.3, -6.4, -3.6], [0, -7.4, -4.6], [1.3, -7.4, -3.6]],
  queueEnds: [[-3.6, -1.3, 1.3], [-7.4, -2.6, 0]],
  benches: { x: [-.6, 1.8], wallZ: 6.9 },
  mainSign: { x: -3, y: 5.1, width: 7, height: 1.75 },
  laneSign: { width: 3, height: 1, y: 3.5 },
};

// D03 · Pasaportes (zone-local metres, 16 x 10). Entry from D02 at the NE
// (north door, x = 5) into a door lobby that only leads into the queue; the
// queue snakes west then back east along the booth line; each booth has its own
// 1.3 m lane on its east side; glass closes the rest of the line. Airside
// (south) leads east to D04 (east door, z = 2.5).
export const PASSPORT = {
  queueRows: [[-4.1, -7.9, 3.75], [-2.7, -6.4, 3.75]],
  queueEnds: [[3.75, -2.7, -.4]],
  booths: { x: [-6, -3.4, -.8, 1.8], z: .3, width: 1.3, depth: 1.3, height: 1.1, glass: 2.1 },
  lane: 1.3,                                // clear lane east of each booth
  mainSign: { x: -2.4, y: 5, width: 6, height: 1.5 },
  benches: [-5.6, -2.8],                    // on the south wall, airside, clear of the exit
};

// D04 · Zona comercial (24 x 12). Entry west (z = 1.5, from D03), exit south
// (x = 0, to D05). Shops recessed into the north side (glass fronts, door in
// the middle, navy fascia); the café is the east unit, open, with its tables in
// the SE corner; FIDS and benches in the SW; toilets door on the east wall. The
// band z 0 … 3 from the west door and x -2 … 2 down to the exit stay clear.
export const SHOPS = {
  front: -3.2,                               // shopfront line (z)
  units: [[-11.8, -6.2, 'perfume', 'Duty Free', 'Perfumes · Libre de impuestos'], [-5.8, -.2, 'book', 'Prensa', 'Libros · Books'],
    [.2, 5.8, 'gift', 'Recuerdos', 'Souvenirs'], [6.2, 11.8, 'cup', 'Cafetería', 'Café · Coffee']],
  door: 1.8, fascia: [2.85, 3.75],
  cafeTables: [[6.2, 3.3], [8.4, 3.3], [10.4, 3.3], [7.3, 5], [9.5, 5]],
  benches: [-9.2, -6.6], benchZ: 4, fids: { x: -7.9, width: 4, height: 1.3, y: 2.5 },
  wc: { z: -1, width: 1.4 },
};
// D05 · Sala de espera (24 x 16). Entry north (x = 0, from D04), exit west
// (z = 0, to D06, the boarding bridge). South wall: full-width window onto the
// apron. Gate desk by the west door, a two-lane boarding queue in front of it,
// seat rows facing the window either side of the north-south walkway.
export const GATE = {
  desk: { x: -8.4, z: -4.2, width: 2.8 },
  queueRows: [[-1.3, -10.4, -4.4], [0, -10.4, -4.4], [1.3, -10.4, -4.4]],
  eGates: { x: -11.2, gap: 1.1 },
  seatRows: [2.8, 4.6, 6.4],                 // bench backs (z), seats face the window
  seatX: [-9.2, -6.9, -4.6, 4.6, 6.9, 9.2],
  north: { x: [3.4, 5.7, 8, 10.3], rows: [-5.6, -3.8] },
  fids: { x: 6.5, width: 3.6, height: 1.2, y: 2.4 },
};
// D06 · Embarque (16 x 8): the jet bridge. Entry east (z = 0, from D05); a
// glazed tunnel runs west to the aircraft door painted on the west wall.
export const BOARDING = { tunnel: { x: [-8, 3], half: 1.45, height: 2.6 }, windows: [1.05, 2.15] };

// Arrivals (zone-local metres), same look and one-way logic as departures.
// A01 · Inmigración: D03's layout (PassportHall.js) scaled to 20 x 14.
export const IMMIGRATION = {
  queueRows: [[-5.9, -9.9, 2.95], [-4.6, -8.9, 2.95]],
  queueEnds: [[2.95, -4.6, -3.2]],
  booths: { x: [-6.8, -4.2, -1.6, 1], z: -2.5, width: 1.3, depth: 1.3, height: 1.1, glass: 2.1 },
  lane: 1.3,
  mainSign: { x: -3.5, y: 5, width: 6.4, height: 1.6 },
  benches: [-7, -4.4, -1.8, 3.4, 6],
};
// A02 · Recogida de equipaje (24 x 18): straight walk west → east along z 0;
// one carousel either side of it, trolleys on the west wall.
export const BAGGAGE = {
  carousels: [[-3.5, -5.2], [3.5, 5.2]], size: [6.4, 3],
  trolleys: { x: -11.4, z: [-7.5, -3] },
};
// A03 · Aduana (16 x 10): the west door splits into the red channel (north,
// inspection bench) and the green channel (south, straight to the exit).
export const CUSTOMS = { split: [-7.4, 5.4], bench: { x: [1, 5], z: -2.9 } };
// A04 · Llegadas (20 x 14): greeters' rails from the north door, info desk,
// rental kiosks on the west wall, café and ATM on the east, benches SW.
export const ARRIVALS_HALL = {
  rails: { x: [-1.1, 3.1], z: [-6.8, -2.4] },
  info: { x: -6, z: -3.8 }, rentals: [-5.2, -3, -.8], cafe: { x: 7.2, z: -4.6 },
  benches: [-8.2, -5.8, 5.6, 8], benchZ: 3.2,
};
