import { SECURITY as S } from './routes.js';
import { createHallKit, drawSign } from './HallKit.js';

// D02 · Seguridad, in D01's palette (HallKit.js). One-way flow west → east:
// apron in front of the D01 door → stanchion queue → two lanes in the middle of
// the room (tray table, X-ray tunnel, rollers, recompose; walk-through arch in
// the corridor beside each belt, glass so nobody goes round it) → clear
// crossing at the east end → benches → exit to D03 (south wall, x = 5).
// Bags are not placed yet. Measures: routes.js SECURITY.

// X-ray operator screen: a bag silhouette with coloured contents.
function drawMonitor(c, w, h) {
  c.fillStyle = '#123a5c'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f2b53a'; c.beginPath(); c.roundRect(w * .2, h * .3, w * .6, h * .42, h * .06); c.fill();
  c.fillStyle = '#3fb0e0'; c.fillRect(w * .3, h * .38, w * .22, h * .12); c.fillRect(w * .56, h * .44, w * .14, h * .2);
}

export function buildSecurityHall(meta, context) {
  const K = createHallKit(meta, context);
  const { w, d, H, hall, vol, tagged, solid, painted } = K;
  const exitX = meta.openings.south;
  K.walls();
  K.wallSign(S.mainSign, drawSign('officer', 'SEGURIDAD', 'Security'));

  // --- Lanes -----------------------------------------------------------------
  const legs = [], trays = [], tray = S.trays.size, top = S.table.height;
  const table = (x0, x1, zb, id) => {
    const td = S.table.depth, cx = (x0 + x1) / 2, len = x1 - x0;
    tagged('steel', [[cx, top - .03, zb, len, .06, td]], id);
    vol('belt', [[cx, top + .005, zb, len - .1, .02, td - .14]]);
    const n = Math.max(1, Math.ceil((len - .3) / 1.4));
    for (let j = 0; j <= n; j++) for (const s of [-1, 1]) legs.push([x0 + .15 + (len - .3) * j / n, (top - .06) / 2, zb + s * (td / 2 - .06), .06, top - .06, .06]);
    solid(x0, zb - td / 2, x1, zb + td / 2);
  };
  const X = S.xray, A = S.arch, L = S.laneSign, edge = X.depth / 2;
  const [pw, pd] = A.post, archHalf = A.inner / 2 + pw;
  S.lanesZ.forEach((zb, i) => {
    const main = i === 0, cz = zb + S.walkway;
    table(S.table.x[0], S.table.x[1], zb, main ? 'airport.security.tray' : '');
    // Stacked grey trays at the start of the table, two used ones at the end.
    for (const [x, n] of [[S.trays.x, S.trays.stack], [S.trays.x + tray[0] + .12, S.trays.stack - 1], [S.recompose.x[1] - tray[0] / 2 - .15, 2]])
      for (let k = 0; k < n; k++) trays.push([x, top + tray[1] / 2 + .01 + k * (tray[1] + .005), zb, ...tray]);
    // X-ray: light grey collars round the tunnel, navy body, status lights.
    const xm = (X.x[0] + X.x[1]) / 2, len = X.x[1] - X.x[0];
    const [tw, th] = X.tunnel, ty = top + th / 2, side = (X.depth - tw) / 2;
    for (const x of [X.x[0] + X.collar / 2, X.x[1] - X.collar / 2]) {
      tagged('shell', [
        [x, (ty + th / 2 + X.height) / 2, zb, X.collar, X.height - ty - th / 2, X.depth],   // over the tunnel
        [x, (ty - th / 2) / 2, zb, X.collar, ty - th / 2, X.depth],                        // under it
        ...[-1, 1].map(s => [x, ty, zb + s * (tw + side) / 2, X.collar, th, side]),
      ], main ? 'airport.security.xrayMachine' : '');
    }
    vol('hallNavy', [[xm, X.height / 2, zb, len - 2 * X.collar, X.height - .04, X.depth - .06]]);
    vol('curtain', [[xm, ty, zb, len - .04, th, tw]]);   // dark tunnel through the machine
    vol('belt', Array.from({ length: 7 }, (_, k) => [X.x[0] - .005, ty + .02, zb - tw / 2 + tw * (k + .5) / 7, .012, th - .04, tw / 7 - .025]));
    const lx = X.x[0] + X.collar / 2, ly = X.height + .03;
    vol('ledGreen', [[lx, ly, zb + .02, .08, .05, .08]], hall.cylinder);
    vol('ledAmber', [[lx, ly, zb + .14, .08, .05, .08]], hall.cylinder);
    vol('ledRed', [[lx, ly, zb + .26, .08, .05, .08]], hall.cylinder);
    solid(X.x[0], zb - edge, X.x[1], zb + edge);
    // Operator screen on an arm over the exit collar, facing the corridor.
    const mx = X.x[1] - X.collar / 2, mz = zb + edge - .1;
    vol('steelDark', [[mx, X.height + .2, mz - .1, .05, .4, .05]]);
    vol('monitor', [[mx, X.height + .45, mz, .7, .46, .05]]);
    painted(.64, .4, 256, drawMonitor).position.set(mx, X.height + .45, mz + .03);
    // Exit rollers and the recompose table.
    table(S.exit.x[0], S.exit.x[1], zb, '');
    vol('steelDark', Array.from({ length: Math.floor((S.exit.x[1] - S.exit.x[0] - .1) / .14) }, (_, k) => [S.exit.x[0] + .12 + k * .14, top + .022, zb, .05, .014, S.table.depth - .16]));
    table(S.recompose.x[0], S.recompose.x[1], zb, '');
    // Walk-through metal detector over the corridor.
    tagged('shell', [...[-1, 1].map(s => [A.x, A.height / 2, cz + s * (A.inner + pw) / 2, pd, A.height, pw]),
      [A.x, A.height + .15, cz, pd + .04, .3, A.inner + 2 * pw + .04]], main ? 'airport.security.metalDetector' : '');
    vol('hallNavy', [-1, 1].map(s => [A.x - pd / 2 - .005, A.height / 2, cz + s * (A.inner + pw) / 2, .01, A.height - .1, pw - .06]));
    vol('ledGreen', [-1, 1].map(s => [A.x, 1.2, cz + s * (A.inner / 2 + .005), .05, .7, .01]));
    solid(A.x - pd / 2, cz - archHalf, A.x + pd / 2, cz - A.inner / 2);
    solid(A.x - pd / 2, cz + A.inner / 2, A.x + pd / 2, cz + archHalf);
    // Glass closes the gaps between the arch and the X-ray bodies either side.
    K.glassWall(A.x, zb + edge, A.x, cz - archHalf);
    const next = S.lanesZ[i + 1];
    if (next !== undefined) K.glassWall(A.x, cz + archHalf, A.x, next - edge);
    // Lane sign hung from the ceiling before each arch, both faces painted.
    const sx = A.x - 1.8;
    vol('steelDark', [-1, 1].map(s => [sx, (L.y + L.height / 2 + H) / 2, cz + s * L.width * .35, .03, H - L.y - L.height / 2, .03]));
    vol('hallNavy', [[sx, L.y, cz, .08, L.height, L.width]]);
    for (const s of [-1, 1]) {
      const face = painted(L.width - .04, L.height - .04, 512, drawSign('bag', `Control ${i + 1}`, 'Screening'));
      face.position.set(sx + s * .042, L.y, cz); face.rotation.y = s * Math.PI / 2;
    }
  });
  vol('steel', legs);
  vol('tray', trays);

  // --- Separation -------------------------------------------------------------
  // Glass along the last corridor's south side (mirror of its north edge) up
  // to its arch, joined to the queue; glass west of the queue, so the apron
  // leads only into the queue entry and nobody reaches the lanes round it.
  const lastZ = S.lanesZ.at(-1), southEdge = lastZ + 2 * S.walkway - edge;
  const qx0 = Math.min(...S.queueRows.map(r => r[1])), qx1 = Math.max(...S.queueRows.map(r => r[2]));
  const qz0 = S.queueRows[0][0], qz1 = S.queueRows.at(-1)[0];
  K.glassWall(qx1, southEdge, A.x, southEdge);
  K.glassWall(qx1, qz1, qx1, southEdge);
  K.glassWall(A.x, lastZ + S.walkway + archHalf, A.x, southEdge);
  K.glassWall(qx0, -d / 2 + .1, qx0, qz0);
  K.glassWall(qx0, qz1, qx0, d / 2 - .1);

  // --- Queue, benches, floor ---------------------------------------------------
  K.queue(S.queueRows, S.queueEnds);
  for (const x of S.benches.x) K.bench(x, S.benches.wallZ);
  const corridors = S.lanesZ.map(zb => zb + S.walkway);
  const crossX = (S.recompose.x[1] + w / 2) / 2, outZ = (qz0 + S.queueRows[1][0]) / 2;
  K.floor(({ carpet, dashed, arrow }) => {
    carpet(qx0 + .1, qz0 - .15, qx1 + .2, qz1 + .15);
    for (const cz of corridors) carpet(S.table.x[0], cz - .75, S.recompose.x[1], cz + .75);
    for (const cz of corridors) dashed([[qx1 + .5, outZ], [qx1 + .5, cz], [S.table.x[0], cz]]);
    for (const cz of corridors) dashed([[S.recompose.x[1], cz], [crossX, cz]]);
    dashed([[crossX, corridors[0]], [crossX, d / 2 - 1.8], [exitX, d / 2 - 1.8], [exitX, d / 2]]);
    arrow(qx0 + .5, (qz1 + S.queueRows.at(-2)[0]) / 2, 0);        // into the queue
    for (const cz of corridors) arrow(S.table.x[0] + .6, cz, 0);   // into the corridors
    arrow(crossX, 2.5, Math.PI / 2);                               // down the crossing
    arrow(exitX, d / 2 - .9, Math.PI / 2);                         // to Pasaportes
  });
}
