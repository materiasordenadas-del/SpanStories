import * as T from './three.js';
import { boxes } from './ThreeResources.js';
import { luz, crearMaterialToon, normalBaldosa } from './Luz25D.js';
import { DIMENSIONS, ENTRANCE_HALL } from './routes.js';
import { PALETTE, hex, canvasTexture, drawBagGlyph, drawPlaneGlyph } from './EntranceHall.js';
import { createGlossyFloor } from './GlossyFloor.js';
import { drawHallFloor, HALL_SLABS } from './ExteriorIllusion.js';

// Shared dressing for the airside halls built after D01 (D02 Seguridad,
// D03 Pasaportes): D01's palette, beige walls with warm wood under a navy band
// and gold line, stanchion queues, porcelain floor with carpets and decals.

export const EXTRA = { shell: 0xd9dde1, curtain: 0x1b2330, belt: 0x2b3038, tray: 0xc7ccd2,
  ledGreen: 0x3fd46a, ledAmber: 0xf2a33a, ledRed: 0xe0503c, monitor: 0x1a1f26 };
export const WALL = { wood: 3.2, band: { y: 3.4, height: .3 } };

function drawOfficerGlyph(c, x, y, size) {
  c.fillStyle = '#ffffff';
  c.beginPath(); c.arc(x, y - size * .1, size * .19, 0, Math.PI * 2); c.fill();                          // head
  c.beginPath(); c.roundRect(x - size * .24, y - size * .42, size * .48, size * .15, size * .04); c.fill();   // cap
  c.fillRect(x - size * .3, y - size * .29, size * .6, size * .045);                                     // visor
  c.beginPath(); c.moveTo(x - size * .42, y + size * .5); c.quadraticCurveTo(x - size * .4, y + size * .12, x, y + size * .11);
  c.quadraticCurveTo(x + size * .4, y + size * .12, x + size * .42, y + size * .5); c.fill();             // shoulders
  c.fillStyle = '#17427c'; c.fillRect(x - size * .045, y + size * .15, size * .09, size * .35);          // tie
}
function drawPassportGlyph(c, x, y, size) {
  const w = size * .62, h = size * .86;
  c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, size * .06); c.fill();
  c.strokeStyle = '#17427c'; c.lineWidth = size * .05;
  c.beginPath(); c.arc(x, y - h * .08, w * .24, 0, Math.PI * 2); c.stroke();                             // globe
  c.beginPath(); c.moveTo(x - w * .24, y - h * .08); c.lineTo(x + w * .24, y - h * .08); c.stroke();
  c.fillStyle = '#17427c'; c.fillRect(x - w * .28, y + h * .26, w * .56, size * .05);
}
// Simple white pictograms for the concourse signs (size = glyph height).
export const GLYPHS = {
  plane: (c, x, y, s) => drawPlaneGlyph(c, x, y, s),
  info: (c, x, y, s) => {
    c.strokeStyle = '#ffffff'; c.lineWidth = s * .08; c.beginPath(); c.arc(x, y, s * .4, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x, y - s * .2, s * .06, 0, Math.PI * 2); c.fill(); c.fillRect(x - s * .05, y - s * .08, s * .1, s * .32);
  },
  cup: (c, x, y, s) => {
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(x - s * .3, y - s * .2, s * .46, s * .5, s * .08); c.fill();
    c.strokeStyle = '#ffffff'; c.lineWidth = s * .08; c.beginPath(); c.arc(x + s * .2, y + s * .02, s * .13, -Math.PI / 2, Math.PI / 2); c.stroke();
    c.lineWidth = s * .05; for (const dx of [-.14, .02]) { c.beginPath(); c.moveTo(x + dx * s, y - s * .28); c.quadraticCurveTo(x + (dx + .08) * s, y - s * .38, x + dx * s, y - s * .48); c.stroke(); }
  },
  book: (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    for (const side of [-1, 1]) { c.beginPath(); c.moveTo(x, y - s * .28); c.lineTo(x + side * s * .42, y - s * .36); c.lineTo(x + side * s * .42, y + s * .3); c.lineTo(x, y + s * .38); c.closePath(); c.fill(); }
    c.fillStyle = '#17427c'; c.fillRect(x - s * .02, y - s * .28, s * .04, s * .66);
  },
  gift: (c, x, y, s) => {
    c.fillStyle = '#ffffff'; c.fillRect(x - s * .36, y - s * .12, s * .72, s * .48); c.fillRect(x - s * .4, y - s * .26, s * .8, s * .14);
    c.fillStyle = '#17427c'; c.fillRect(x - s * .05, y - s * .26, s * .1, s * .62);
    c.strokeStyle = '#ffffff'; c.lineWidth = s * .07;
    for (const side of [-1, 1]) { c.beginPath(); c.ellipse(x + side * s * .14, y - s * .36, s * .14, s * .08, side * .5, 0, Math.PI * 2); c.stroke(); }
  },
  perfume: (c, x, y, s) => {
    c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(x - s * .28, y - s * .12, s * .56, s * .5, s * .1); c.fill();
    c.fillRect(x - s * .08, y - s * .3, s * .16, s * .2); c.fillRect(x - s * .16, y - s * .42, s * .32, s * .12);
  },
  wc: (c, x, y, s) => {
    c.fillStyle = '#ffffff';
    for (const side of [-1, 1]) {
      const px = x + side * s * .24;
      c.beginPath(); c.arc(px, y - s * .32, s * .09, 0, Math.PI * 2); c.fill();
      if (side < 0) c.fillRect(px - s * .1, y - s * .2, s * .2, s * .56);
      else { c.beginPath(); c.moveTo(px, y - s * .2); c.lineTo(px + s * .16, y + s * .2); c.lineTo(px - s * .16, y + s * .2); c.closePath(); c.fill(); c.fillRect(px - s * .06, y + s * .2, s * .12, s * .16); }
    }
    c.fillRect(x - s * .015, y - s * .42, s * .03, s * .8);
  },
  seat: (c, x, y, s) => {
    c.fillStyle = '#ffffff'; c.fillRect(x - s * .3, y - s * .4, s * .12, s * .5); c.fillRect(x - s * .3, y, s * .55, s * .12);
    c.fillRect(x + s * .13, y + s * .1, s * .1, s * .3); c.fillRect(x - s * .3, y + s * .1, s * .1, s * .3);
  },
};
export function drawSign(glyph, title, subtitle) {
  return (c, w, h) => {
    c.fillStyle = '#17427c'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2b53a'; c.fillRect(0, h * .9, w, h * .1);
    const cy = h * .45, gx = h * .5;
    if (glyph === 'officer') drawOfficerGlyph(c, gx, cy, h * .62);
    else if (glyph === 'passport') drawPassportGlyph(c, gx, cy, h * .62);
    else if (GLYPHS[glyph]) GLYPHS[glyph](c, gx, cy, h * .6);
    else drawBagGlyph(c, gx, cy, h * .5);
    const tx = gx + h * .45, room = w - tx - h * .2;
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(h * .32)}px system-ui, sans-serif`; c.fillText(title, tx, cy + h * .03, room);
    c.fillStyle = '#f7c948'; c.font = `600 ${Math.round(h * .23)}px system-ui, sans-serif`; c.fillText(subtitle, tx, cy + h * .31, room);
  };
}
export function drawNumber(n) {
  return (c, w, h) => {
    c.fillStyle = '#17427c'; c.beginPath(); c.roundRect(0, 0, w, h, w * .08); c.fill();
    c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(h * .66)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), w / 2, h * .54);
  };
}

// Floor painter: D00's grey porcelain tiled 1:1 in metres, then the hall's
// decals drawn by `decals(api)` in zone metres (carpets, dashed lines, arrows).
function drawFloor(w, d, decals) {
  return (c, pw) => {
    const k = pw / w, X = x => (x + w / 2) * k, Z = z => (z + d / 2) * k;
    const slab = document.createElement('canvas'); slab.width = slab.height = 1024;
    drawHallFloor(slab.getContext('2d'), 1024, 1024, HALL_SLABS[0], HALL_SLABS[1]);
    const period = HALL_SLABS[0] * ENTRANCE_HALL.slab[0];
    for (let x = 0; x < w; x += period) for (let z = 0; z < d; z += period) c.drawImage(slab, x * k, z * k, period * k, period * k);
    const carpet = (x0, z0, x1, z1) => {
      c.fillStyle = '#c6d4de'; c.beginPath(); c.roundRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k, 14); c.fill();
      c.strokeStyle = '#a2b9c9'; c.lineWidth = 4; c.beginPath(); c.roundRect(X(x0) + 4, Z(z0) + 4, (x1 - x0) * k - 8, (z1 - z0) * k - 8, 11); c.stroke();
    };
    const dashed = points => {
      c.strokeStyle = '#356f9e'; c.lineWidth = 5; c.setLineDash([18, 14]);
      c.beginPath(); points.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.stroke();
      c.setLineDash([]);
    };
    // angle 0 points east (+x), PI / 2 south (+z).
    const arrow = (wx, wz, angle, size = .5) => {
      c.save(); c.translate(X(wx), Z(wz)); c.rotate(angle); c.fillStyle = '#2e5d86';
      c.beginPath(); c.moveTo(size * k, 0); c.lineTo(-size * .45 * k, size * .62 * k);
      c.lineTo(-size * .12 * k, 0); c.lineTo(-size * .45 * k, -size * .62 * k); c.closePath(); c.fill();
      c.restore();
    };
    const text = (wx, wz, str, size = .32, angle = 0, color = '#2e5d86') => {
      c.save(); c.translate(X(wx), Z(wz)); c.rotate(angle); c.fillStyle = color;
      c.font = `bold ${Math.round(size * k)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(str, 0, 0); c.restore();
    };
    const tint = (x0, z0, x1, z1, color) => { c.fillStyle = color; c.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); };
    decals({ carpet, dashed, arrow, text, tint });
  };
}

export function createHallKit(meta, { scope, kit, group, interactive, colliders, worldPosition }) {
  const { width: w, depth: d } = meta, H = DIMENSIONS.ceiling;
  const materials = { ...kit.materials };
  for (const [key, color] of Object.entries({ ...PALETTE, ...EXTRA })) materials[key] = scope.own(crearMaterialToon({ color: hex(color), bandas: 3 }));
  const hall = { ...kit, materials, outline: (color, level) => kit.outline(PALETTE[color] ?? EXTRA[color] ?? color, level) };
  const vol = (color, transforms, geometry) => boxes(scope, hall, group, color, transforms, geometry);
  const tagged = (color, transforms, semanticId) => {
    const mesh = vol(color, transforms);
    if (mesh && semanticId) { mesh.userData = { semanticId, interactionType: 'inspect', zoneId: meta.id }; interactive.push(mesh); }
    return mesh;
  };
  const offset = new T.Vector3(worldPosition.x, 0, worldPosition.z);
  const solid = (x0, z0, x1, z1) => colliders.push(new T.Box3(new T.Vector3(x0, 0, z0).add(offset), new T.Vector3(x1, 2, z1).add(offset)));
  const add = mesh => { group.add(mesh); scope.defer(() => mesh.removeFromParent()); return mesh; };
  const painted = (width, height, pixelsWide, draw) => {
    const map = scope.own(canvasTexture(pixelsWide, Math.round(pixelsWide * height / width), draw));
    const material = scope.own(new T.MeshBasicMaterial({ map }));
    scope.defer(luz.tintar(material, 'cartel'));
    return add(new T.Mesh(scope.own(new T.PlaneGeometry(width, height)), material));
  };
  const back = -d / 2 + .09;

  // Four walls: beige, warm wood panelling on the north wall under the navy
  // band and gold line; the band runs round the room, broken over the doors.
  function walls({ skip = [] } = {}) {
    const B = WALL.band;
    vol('hallWall', [[0, H / 2, back + .01, w, H, .02]]);
    vol('woodWarm', [[0, WALL.wood / 2, back + .05, w, WALL.wood, .06]]);
    vol('woodGroove', Array.from({ length: Math.floor(w / 2) - 1 }, (_, i) => [-w / 2 + 2 + i * 2, WALL.wood / 2, back + .083, .025, WALL.wood, .01]));
    vol('hallNavy', [[0, B.y, back + .07, w, B.height, .12]]);
    vol('gold', [[0, B.y - B.height / 2 - .025, back + .09, w, .05, .1]]);
    const halfOpening = DIMENSIONS.portalWidth / 2 + .1, doorTop = DIMENSIONS.doorHeight + .1;
    const skin = [], band = [], skirt = [];
    const liner = (axis, at, length, gap) => {   // axis 'x': wall along x at z = at; 'z': along z at x = at
      const pieces = gap === undefined ? [[0, length, 0, H]] : [
        [(-length / 2 + gap - halfOpening) / 2, gap - halfOpening + length / 2, 0, H],
        [(length / 2 + gap + halfOpening) / 2, length / 2 - gap - halfOpening, 0, H],
        [gap, 2 * halfOpening, doorTop, H - doorTop],
      ];
      for (const [c, len, y0, h] of pieces) {
        const put = (list, y, hh, t) => list.push(axis === 'x' ? [c, y, at, len, hh, t] : [at, y, c, t, hh, len]);
        put(skin, y0 + h / 2, h, .02); put(band, B.y, B.height, .1);
        if (y0 === 0) put(skirt, .06, .12, .04);
      }
    };
    const o = meta.openings || {};
    if (!skip.includes('east')) liner('z', w / 2 - .1, d, o.east);
    if (!skip.includes('south')) liner('x', d / 2 - .1, w, o.south);
    if (!skip.includes('west')) liner('z', -w / 2 + .1, d, o.west);
    vol('hallWall', skin); vol('hallNavy', band); vol('skirting', skirt);
  }
  // Big illustrated sign on the north wall, above the band.
  function wallSign({ x, y, width, height }, draw) {
    vol('hallNavy', [[x, y, back + .1, width + .08, height + .08, .12]]);
    painted(width, height, 1024, draw).position.set(x, y, back + .165);
  }
  // Stanchion queue: navy posts every `pitch` metres with navy tape between.
  // rows: [z, x0, x1]; ends: [x, z0, z1]. Tapes are solid.
  function queue(rows, ends, P = { pitch: 1.6, height: 1.02, radius: .05, base: .38 }) {
    const posts = new Map(), tapes = [];
    const run = (a0, a1, fixed, alongX) => {
      const n = Math.max(1, Math.round(Math.abs(a1 - a0) / P.pitch));
      for (let k = 0; k <= n; k++) {
        const a = a0 + (a1 - a0) * k / n, [x, z] = alongX ? [a, fixed] : [fixed, a];
        posts.set(`${x.toFixed(2)},${z.toFixed(2)}`, [x, z]);
      }
      const mid = (a0 + a1) / 2, len = Math.abs(a1 - a0), lo = Math.min(a0, a1), hi = Math.max(a0, a1);
      tapes.push(alongX ? [mid, P.height - .08, fixed, len, .05, .012] : [fixed, P.height - .08, mid, .012, .05, len]);
      if (alongX) solid(lo, fixed - .05, hi, fixed + .05); else solid(fixed - .05, lo, fixed + .05, hi);
    };
    for (const [z, x0, x1] of rows) run(x0, x1, z, true);
    for (const [x, z0, z1] of ends) run(z0, z1, x, false);
    const pts = [...posts.values()];
    vol('hallNavy', pts.map(([x, z]) => [x, P.height / 2, z, 2 * P.radius, P.height, 2 * P.radius]), hall.cylinder);
    vol('hallNavy', pts.map(([x, z]) => [x, P.height + .02, z, 2 * P.radius + .04, .06, 2 * P.radius + .04]), hall.cylinder);
    vol('hallNavy', pts.map(([x, z]) => [x, .02, z, P.base, .04, P.base]), hall.cylinder);
    vol('hallNavy', tapes);
  }
  // Low glass partition (steel frame, clear pane), solid. Straight runs only.
  function glassWall(x0, z0, x1, z1, height = 1.2) {
    const alongX = z0 === z1, len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const pane = add(new T.Mesh(scope.own(new T.PlaneGeometry(len, height - .1)), kit.glass));
    pane.position.set(cx, height / 2 + .05, cz); if (!alongX) pane.rotation.y = Math.PI / 2;
    const frame = alongX ? [[cx, height, cz, len, .05, .06], [cx, .05, cz, len, .1, .06]] : [[cx, height, cz, .06, .05, len], [cx, .05, cz, .06, .1, len]];
    const n = Math.max(1, Math.round(len / 1.2));
    for (let k = 0; k <= n; k++) {
      const t = k / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      frame.push([px, height / 2, pz, .05, height, .05]);
    }
    vol('steel', frame);
    solid(Math.min(x0, x1) - .04, Math.min(z0, z1) - .04, Math.max(x0, x1) + .04, Math.max(z0, z1) + .04);
  }
  // Three-seat bench as in D01, back to a wall: facing +z (south = false) or -z.
  function bench(x, wallZ, seats = 3, facingNorth = true) {
    const pitch = .66, s = facingNorth ? -1 : 1, benchW = seats * pitch;
    const backZ = wallZ + s * .045, seatZ = wallZ + s * .32;
    const seatXs = Array.from({ length: seats }, (_, k) => x + (k - (seats - 1) / 2) * pitch);
    vol('hallSeat', [...seatXs.map(sx => [sx, .46, seatZ, .6, .08, .5]), ...seatXs.map(sx => [sx, .8, backZ, .6, .5, .07])]);
    const arms = Array.from({ length: seats + 1 }, (_, k) => x + (k - seats / 2) * pitch);
    vol('steel', [
      [x, .37, seatZ, benchW + .1, .06, .08],
      ...arms.map(ax => [ax, .69, seatZ, .05, .04, .44]),
      ...[-1, 1].flatMap(e => [[x + e * benchW / 2, .18, seatZ, .05, .36, .4], [x + e * benchW / 2, .015, seatZ, .06, .03, .56]]),
    ]);
    solid(x - benchW / 2 - .05, Math.min(wallZ, seatZ + s * .3), x + benchW / 2 + .05, Math.max(wallZ, seatZ + s * .3));
  }
  function floor(decals) {
    const floorMaterial = scope.own(crearMaterialToon({ albedo: scope.own(canvasTexture(64 * w, 64 * d, drawFloor(w, d, decals))),
      normal: scope.own(normalBaldosa()), repetirNormal: [w / ENTRANCE_HALL.slab[0], d / ENTRANCE_HALL.slab[1]], fuerzaNormal: .45 }));
    const plane = add(new T.Mesh(scope.own(new T.PlaneGeometry(w, d)), floorMaterial));
    plane.rotation.x = -Math.PI / 2; plane.position.y = .013;
    const gloss = add(createGlossyFloor(scope, { width: w, depth: d, strength: ENTRANCE_HALL.gloss }));
    gloss.position.y = .024; gloss.renderOrder = 1;
  }
  return { w, d, H, back, hall, vol, tagged, solid, add, painted, walls, wallSign, queue, glassWall, bench, floor };
}
