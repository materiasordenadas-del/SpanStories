import * as T from './three.js';
import { PASSPORT } from './routes.js';
import { createHallKit, drawSign, drawNumber } from './HallKit.js';

// D03 · Pasaportes, in D01's palette (HallKit.js). One-way flow: the north door
// (from D02, NE corner) opens onto a lobby that only leads into the queue; the
// queue runs west, turns at the west end and comes back east along the booth
// line; each booth has its own lane on its east side and glass closes the rest
// of the line; airside (south) leads east to D04. Measures: routes.js PASSPORT.

// Also A01 · Inmigración, with its own measures (routes.js IMMIGRATION) and sign.
export function buildPassportHall(meta, context, P = PASSPORT, title = ['PASAPORTES', 'Passport control']) {
  const K = createHallKit(meta, context);
  const { w, d, vol, tagged, solid, painted, add } = K;
  const inX = meta.openings.north, outZ = meta.openings.east;
  K.walls();
  K.wallSign(P.mainSign, drawSign('passport', ...title));

  // --- Booths: navy cabin, counter on the lane side, glass screen, number ---
  const B = P.booths, west = -w / 2 + .1, east = w / 2 - .1;
  const cabins = B.x.map(x => [x, B.height / 2, B.z, B.width, B.height, B.depth]);
  tagged('hallNavy', cabins, 'airport.passport.booth');
  vol('counter', B.x.map(x => [x + B.width / 2 - .05, B.height + .03, B.z, .34, .06, B.depth - .1]));   // shelf toward the lane
  vol('hallNavy', B.x.map(x => [x, B.glass + .06, B.z, B.width + .04, .12, B.depth + .04]));            // roof
  vol('steelDark', B.x.flatMap(x => [-1, 1].flatMap(sx => [-1, 1].map(sz => [x + sx * (B.width / 2 - .03), (B.height + B.glass) / 2, B.z + sz * (B.depth / 2 - .03), .04, B.glass - B.height, .04]))));
  const paneGeometry = context.scope.own(new T.PlaneGeometry(B.depth - .06, B.glass - B.height - .02));
  for (const x of B.x) {
    for (const s of [-1, 1]) {   // side panes (the lane side and the neighbour)
      const pane = add(new T.Mesh(paneGeometry, context.kit.glass));
      pane.position.set(x + s * (B.width / 2 - .03), (B.height + B.glass) / 2, B.z); pane.rotation.y = Math.PI / 2;
    }
    solid(x - B.width / 2, B.z - B.depth / 2, x + B.width / 2, B.z + B.depth / 2);
  }
  // Numbers on the roof, facing the queue.
  B.x.forEach((x, i) => {
    const number = painted(.44, .44, 128, drawNumber(i + 1));
    number.position.set(x, B.glass + .4, B.z - B.depth / 2 - .02); number.rotation.y = Math.PI;
  });
  vol('steelDark', B.x.map(x => [x, B.glass + .15, B.z - B.depth / 2 - .02, .04, .1, .04]));
  // Glass closes the booth line west of the first booth and east of the last lane.
  const firstWest = B.x[0] - B.width / 2, lastLane = B.x.at(-1) + B.width / 2 + P.lane;
  K.glassWall(west, B.z, firstWest, B.z, 1.6);
  K.glassWall(lastLane, B.z, east, B.z, 1.6);

  // Benches on the south wall (airside), facing the booths.
  for (const x of P.benches || []) K.bench(x, d / 2 - .1, 3, true);

  // --- Queue and floor -------------------------------------------------------
  K.queue(P.queueRows, P.queueEnds);
  const lanes = B.x.map(x => x + B.width / 2 + P.lane / 2);
  const qz0 = P.queueRows[0][0], qz1 = P.queueRows[1][0], feedZ = (qz1 + B.z - B.depth / 2) / 2;
  const qEast = Math.max(...P.queueRows.map(r => r[2]));
  K.floor(({ carpet, dashed, arrow }) => {
    carpet(west + .1, qz0 - .15, qEast + .15, B.z - B.depth / 2);
    for (const x of lanes) carpet(x - P.lane / 2 + .1, B.z - B.depth / 2, x + P.lane / 2 - .1, B.z + B.depth / 2 + .6);
    dashed([[inX, -d / 2], [inX, (qz0 + qz1) / 2], [qEast, (qz0 + qz1) / 2]]);
    for (const x of lanes) dashed([[x, B.z + B.depth / 2 + .6], [x, outZ], [w / 2, outZ]]);
    arrow(inX, -d / 2 + .9, Math.PI / 2);                  // from the door into the lobby
    arrow(qEast - .6, (qz0 + qz1) / 2, Math.PI);           // queue runs west
    arrow(-4, feedZ, 0);                                   // back east along the booths
    for (const x of lanes) arrow(x, B.z, Math.PI / 2, .4); // through the lanes
    arrow(w / 2 - 1, outZ, 0);                             // to the next hall
  });
}
