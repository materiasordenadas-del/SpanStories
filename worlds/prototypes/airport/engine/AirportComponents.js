import * as T from './three.js';
import { boxes, sign } from './ThreeResources.js';
import { luz, crearMaterialToon, normalBaldosa } from './Luz25D.js';
import { DIMENSIONS, ENTRANCE_HALL, CHECKIN, IMMIGRATION } from './routes.js';
import { drawHallFloor, HALL_SLABS } from './ExteriorIllusion.js';
import { createGlossyFloor, REFLECT_LAYER } from './GlossyFloor.js';
import { buildEntranceHall } from './EntranceHall.js';
import { buildCheckinHall } from './CheckinHall.js';
import { buildSecurityHall } from './SecurityHall.js';
import { buildPassportHall } from './PassportHall.js';
import { buildShopsHall, buildGateLounge, buildBoardingBridge } from './ConcourseHalls.js';
import { buildArrivalCorridor, buildBaggageHall, buildCustomsHall, buildArrivalsHall, buildExitHall } from './ArrivalHalls.js';

const box = (x, y, z, w, h, d) => [x, y, z, w, h, d];
// Halls dressed in D01's look by their own module (walls, floor, ceiling beams).
const DRESSED = new Set(['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'A00', 'A01', 'A02', 'A03', 'A04', 'A05']);

// --- SpanStories 2.5D baked-texture helpers (D01 · Facturación) -------------
// The floor is one textured plane: designed tile grid, queue carpets and guide
// decals. Neutral albedo only — no vignette or painted shading: the shared
// scene light (Luz25D) lights it, and a tile normal map gives the grout relief.
function makeD01FloorTexture(w, d) {
  const PPM = 64; // pixels per metre; canvas maps 1:1 onto the room (24 x 16 m)
  const canvas = document.createElement('canvas');
  canvas.width = w * PPM; canvas.height = d * PPM;
  const c = canvas.getContext('2d');
  const X = wx => (wx + w / 2) * PPM, Y = wz => (wz + d / 2) * PPM;
  // Base: D00's grey porcelain (120 x 60 cm slabs), same painter, tiled 1:1 in metres.
  const slab = document.createElement('canvas'); slab.width = slab.height = 1024;
  drawHallFloor(slab.getContext('2d'), 1024, 1024, HALL_SLABS[0], HALL_SLABS[1]);
  const period = HALL_SLABS[0] * ENTRANCE_HALL.slab[0];
  for (let x = 0; x < w; x += period) for (let z = 0; z < d; z += period) c.drawImage(slab, x * PPM, z * PPM, period * PPM, period * PPM);
  // Queue carpets: one soft blue lane per queue, under the belt barriers.
  const lane = (cx) => {
    const x0 = X(cx - .95), y0 = Y(2.2), ww = 1.9 * PPM, hh = Y(7.6) - y0;
    c.fillStyle = '#c6d4de';
    c.beginPath(); c.roundRect(x0, y0, ww, hh, 14); c.fill();
    c.strokeStyle = '#a2b9c9'; c.lineWidth = 4;
    c.beginPath(); c.roundRect(x0 + 4, y0 + 4, ww - 8, hh - 8, 11); c.stroke();
  };
  for (const cx of CHECKIN.lanesX) lane(cx);
  // Dashed guide lines from each carpet to the counter apron.
  c.strokeStyle = '#356f9e'; c.lineWidth = 5; c.setLineDash([18, 14]);
  for (const cx of CHECKIN.lanesX) {
    c.beginPath(); c.moveTo(X(cx), Y(2.1)); c.lineTo(X(cx), Y(CHECKIN.deskZ + CHECKIN.deskDepth / 2 + 1.5)); c.stroke();
  }
  // ATM zone tint along the west wall (north of the entrance opening).
  c.fillStyle = '#dde3e0';
  c.fillRect(X(-12), Y(-7.7), X(-10.55) - X(-12), Y(-2.35) - Y(-7.7));
  c.strokeStyle = '#356f9e'; c.lineWidth = 4; c.setLineDash([12, 10]);
  c.beginPath(); c.moveTo(X(-12), Y(-2.35)); c.lineTo(X(-10.55), Y(-2.35)); c.stroke();
  c.setLineDash([]);
  // Painted direction arrows (flat cartoon decals).
  const arrow = (wx, wz, angle, size = .46, color = '#2e5d86') => {
    c.save(); c.translate(X(wx), Y(wz)); c.rotate(angle);
    c.fillStyle = color;
    c.beginPath(); c.moveTo(size * PPM, 0); c.lineTo(-size * .45 * PPM, size * .62 * PPM);
    c.lineTo(-size * .12 * PPM, 0); c.lineTo(-size * .45 * PPM, -size * .62 * PPM); c.closePath(); c.fill();
    c.restore();
  };
  arrow(-9.9, 0, 0);                       // from the entrance, toward the room
  arrow(-5.25, 1.35, -Math.PI / 2); arrow(1.75, 1.35, -Math.PI / 2); // into the queues
  arrow(-9.7, -1.5, -Math.PI / 2, .4);     // toward the ATM row
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

// One ATM front, drawn once and shared by the whole row. The body volume comes
// from a thin dark box; everything else (screen UI, keypad, card slot, outline,
// side shading, base AO) is baked into this single flat illustration.
function makeATMFrontTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 512;
  const c = canvas.getContext('2d');
  const body = c.createLinearGradient(0, 0, 256, 0);
  body.addColorStop(0, '#c9d2d6'); body.addColorStop(.18, '#e6ebee');
  body.addColorStop(.82, '#e6ebee'); body.addColorStop(1, '#b7c2c8');
  c.fillStyle = body; c.beginPath(); c.roundRect(4, 4, 248, 504, 20); c.fill();
  c.strokeStyle = '#7d8b94'; c.lineWidth = 5; c.beginPath(); c.roundRect(6, 6, 244, 500, 18); c.stroke();
  // Header band with plane glyph.
  c.fillStyle = '#21466b'; c.beginPath(); c.roundRect(20, 26, 216, 62, 12); c.fill();
  c.fillStyle = '#ebf3f4';
  c.save(); c.translate(48, 57); c.rotate(-.35);
  c.beginPath(); c.moveTo(16, 0); c.lineTo(-12, 8); c.lineTo(-6, 0); c.lineTo(-12, -8); c.closePath(); c.fill();
  c.restore();
  c.font = 'bold 27px system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText('CHECK-IN', 74, 58);
  // Screen with a tiny flat UI.
  c.fillStyle = '#10273c'; c.beginPath(); c.roundRect(26, 112, 204, 132, 10); c.fill();
  c.fillStyle = '#1d4266'; c.beginPath(); c.roundRect(26, 112, 204, 30, 10); c.fill();
  c.fillStyle = '#dcebf2'; c.font = 'bold 15px system-ui'; c.textAlign = 'center';
  c.fillText('FACTURACIÓN', 128, 128);
  c.fillStyle = '#7fa8c4'; c.font = '12px system-ui';
  c.fillText('Escanea tu billete', 128, 162); c.fillText('o introduce tu código', 128, 180);
  c.fillStyle = '#5b8fc0'; c.beginPath(); c.roundRect(63, 196, 130, 34, 9); c.fill();
  c.fillStyle = '#f2f7fa'; c.font = 'bold 16px system-ui'; c.fillText('INICIAR', 128, 214);
  c.fillStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.moveTo(26, 112); c.lineTo(110, 112); c.lineTo(60, 244); c.lineTo(26, 244); c.closePath(); c.fill();
  // Card slot.
  c.fillStyle = '#2b3a46'; c.beginPath(); c.roundRect(72, 268, 112, 16, 8); c.fill();
  c.fillStyle = '#5c7382'; c.beginPath(); c.roundRect(76, 270, 104, 4, 2); c.fill();
  // Keypad: 3 x 4 baked buttons with soft bottom shadow.
  c.font = 'bold 16px system-ui';
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    const x = 52 + col * 52, y = 312 + row * 40;
    c.fillStyle = '#aeb9be'; c.beginPath(); c.roundRect(x, y + 3, 44, 30, 7); c.fill();
    c.fillStyle = '#d3dce0'; c.beginPath(); c.roundRect(x, y, 44, 30, 7); c.fill();
    c.fillStyle = '#40525c'; c.textAlign = 'center';
    c.fillText(String(row * 3 + col + 1), x + 22, y + 17);
  }
  // Printed slot for the boarding pass and base AO.
  c.fillStyle = '#c3ced3'; c.beginPath(); c.roundRect(58, 478, 140, 12, 6); c.fill();
  const ao = c.createLinearGradient(0, 452, 0, 512);
  ao.addColorStop(0, 'rgba(40,60,75,0)'); ao.addColorStop(1, 'rgba(40,60,75,.28)');
  c.fillStyle = ao; c.beginPath(); c.roundRect(4, 452, 248, 56, 20); c.fill();
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.minFilter = T.LinearMipmapLinearFilter; texture.magFilter = T.LinearFilter;
  return texture;
}

// Hanging wall sign for the self-service row.
function makeCheckinAutoSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 192;
  const c = canvas.getContext('2d');
  c.fillStyle = '#21466b'; c.beginPath(); c.roundRect(4, 4, 1016, 184, 18); c.fill();
  c.strokeStyle = '#182f47'; c.lineWidth = 6; c.beginPath(); c.roundRect(7, 7, 1010, 178, 16); c.stroke();
  c.fillStyle = '#e6b15e'; c.fillRect(24, 158, 976, 10);
  c.fillStyle = '#ebf3f4';
  c.save(); c.translate(84, 84); c.rotate(-.3);
  c.beginPath(); c.moveTo(34, 0); c.lineTo(-26, 17); c.lineTo(-13, 0); c.lineTo(-26, -17); c.closePath(); c.fill();
  c.restore();
  c.font = 'bold 74px system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText('CHECK-IN AUTOMÁTICO', 150, 82);
  c.font = 'bold 30px system-ui'; c.fillStyle = '#9fc2d4';
  c.fillText('self-service bag drop', 152, 136);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.minFilter = T.LinearMipmapLinearFilter; texture.magFilter = T.LinearFilter;
  return texture;
}

/** Scene content is data grouped by geometry/material/semantic ID before upload. */
export function buildAirportComponents(meta, { scope, kit, group, interactive, colliders, worldPosition }) {
  const batches = new Map(), cylinders = new Map();
  const animation = [];
  const add = (color, transform, semanticId = '') => {
    const key = `${color}|${semanticId}`;
    if (!batches.has(key)) batches.set(key, { color, semanticId, transforms: [] });
    batches.get(key).transforms.push(transform);
  };
  const cyl = (color, transform) => {
    if (!cylinders.has(color)) cylinders.set(color, []);
    cylinders.get(color).push(transform);
  };
  const label = (text, x, y, z, w = 3.2, h = .66, facing = 0) => sign(scope, kit, group, text, x, y, z, w, h, facing);
  const barrier = (x, z) => { cyl('metal', box(x, .5, z, .075, 1, .075)); add('navy', box(x, 1, z, .18, .07, .18)); };
  const luggage = (x, z, color = 'luggage') => {
    add(color, box(x, .39, z, .55, .66, .32), 'airport.baggage.suitcase');
    add('dark', box(x, .78, z, .22, .12, .055));
    cyl('metal', box(x - .18, .065, z, .09, .13, .09)); cyl('metal', box(x + .18, .065, z, .09, .13, .09));
  };
  const seat = (x, z, direction = 1) => {
    add('seat', box(x, .48, z, .62, .12, .58), 'airport.gate.seat');
    add('seat', box(x, .84, z + direction * .23, .62, .65, .12));
    add('metal', box(x - .25, .22, z, .055, .42, .48)); add('metal', box(x + .25, .22, z, .055, .42, .48));
  };
  const desk = (x, z, width = 1.8, id = 'airport.checkin.counter') => {
    add('navy', box(x, .52, z, width, 1.04, .88), id);
    add('wood', box(x, 1.09, z, width + .10, .10, 1));
    add('dark', box(x, 1.34, z - .22, .47, .42, .09));
    add('lightMetal', box(x, 1.13, z + .4, .38, .055, .24));
  };
  const kiosk = (x, z, id = 'airport.checkin.kiosk') => {
    add('lightMetal', box(x, .74, z, .48, 1.48, .42), id);
    add('navy', box(x, 1.18, z + .23, .42, .36, .07));
    add('accent', box(x, .79, z + .24, .28, .07, .06));
  };
  const plant = (x, z) => {
    cyl('wood', box(x, .24, z, .55, .48, .55));
    cyl('plant', box(x, .92, z, .82, .94, .82));
  };
  const screen = (x, z, width = 2.8) => {
    add('navy', box(x, 3.25, z, width, 1.0, .12), 'airport.gate.flightBoard');
    const panel = new T.Mesh(scope.own(new T.PlaneGeometry(width - .12, .88)), kit.boardMaterial);
    panel.position.set(x, 3.25, z + .071); group.add(panel); scope.defer(() => panel.removeFromParent());
  };
  const booth = (x, z) => {
    desk(x, z, 1.7, 'airport.passport.booth');
    add('trim', box(x - .84, 2, z, .10, 2.4, 1.6)); add('trim', box(x + .84, 2, z, .10, 2.4, 1.6));
    add('navy', box(x, 3.25, z, 1.7, .25, 1.6));
    add('dark', box(x, 1.12, z + .52, .26, .08, .28), 'airport.passport.scanner');
  };
  const id = meta.id, { width: w, depth: d } = meta, H = DIMENSIONS.ceiling;
  // Repeat ceiling strips and floor seams only in the active chunk. The D00
  // hall has its own ceiling, back-wall band and floor lines (EntranceHall.js).
  const hall = id === 'D00';
  for (let x = -w / 2 + 2; x < w / 2; x += 4) {
    if (hall) continue;
    // D01 (and D02/D03, same look): navy cross beams and blue-framed light panels, as in the reference.
    const beams = DRESSED.has(id);
    add(beams ? 'navy' : 'ceiling', beams ? box(x - 2, H - .2, 0, .5, .3, d - .2) : box(x, H - .08, 0, .28, .05, d - 1));
    if (!beams) add('trim', box(x, .012, 0, .018, .008, d));
    for (let z = -d / 2 + 2; z < d / 2 - 1; z += 4) {
      add(beams ? 'blue' : 'lightMetal', box(x, H - .19, z, 1.52, .055, 2.42));
      add('warmLight', box(x, H - .225, z, 1.3, .018, 2.16));
    }
  }
  if (!DRESSED.has(id) && !hall) for (let z = -d / 2 + 2; z < d / 2; z += 2) add('trim', box(0, .014, z, w, .008, .016));
  // D01-D06 dress their own walls (CheckinHall.js, SecurityHall.js, PassportHall.js, ConcourseHalls.js).
  const plainWalls = !hall && !DRESSED.has(id);
  if (plainWalls) add('navy', box(0, 3.36, -d / 2 + .17, w - .45, .14, .10));
  if (plainWalls) add('accent', box(0, 3.25, -d / 2 + .18, w - .45, .034, .10));
  if (plainWalls) for (let x = -w / 2 + 3.1; x < w / 2 - 2; x += 4.5) {
    add('trim', box(x, 1.6, -d / 2 + .16, .08, 3.2, .12));
    add('lightMetal', box(x, H - .18, 0, .65, .035, d - .6));
  }
  // D02/D03 paint their own guide lines (HallKit.js floor decals).
  const ownFloor = DRESSED.has(id) && id !== 'D01';
  for (const [side, offset] of Object.entries(meta.openings || {})) {
    if (side === 'east' || side === 'west') {
      const edge = side === 'east' ? w / 2 - .03 : -w / 2 + .03;
      if (!hall && !ownFloor) add('accent', box(side === 'east' ? w / 4 : -w / 4, .021, offset, w / 2, .012, .065));
      for (const z of [offset - 2.04, offset + 2.04]) add('trim', box(edge, 1.4, z, .13, 2.8, .13));
      add('navy', box(edge, 2.83, offset, .14, .14, 4.2));
    } else {
      const edge = side === 'south' ? d / 2 - .03 : -d / 2 + .03;
      if (!ownFloor) add('accent', box(offset, .021, side === 'south' ? d / 4 : -d / 4, .065, .012, d / 2));
      for (const x of [offset - 2.04, offset + 2.04]) add('trim', box(x, 1.4, edge, .13, 2.8, .13));
      add('navy', box(offset, 2.83, edge, 4.2, .14, .14));
    }
  }
  if (hall) {
    animation.push(buildEntranceHall(meta, { scope, kit, group, interactive, colliders, worldPosition }).update);
  } else if (id === 'D01') {
    // Walls, signage, glazing and plants of the reference view (CheckinHall.js).
    animation.push(buildCheckinHall(meta, { scope, kit, group, interactive, colliders, worldPosition }).update);
    // Counters: front kept clear for passengers. Bags go over the counter onto
    // one collector belt behind the agents, along the north wall, into a hatch.
    const C = CHECKIN, deskBack = C.deskZ - C.deskDepth / 2;
    const rowHalf = (C.counters - 1) * C.pitch / 2 + C.deskWidth / 2;
    for (let i = 0; i < C.counters; i++) {
      const x = (i - (C.counters - 1) / 2) * C.pitch;
      desk(x, C.deskZ, C.deskWidth, i < 2 ? 'airport.checkin.counter' : '');
    }
    const beltZ = deskBack - C.agentAisle - C.belt.width / 2;
    const beltEnd = w / 2 - .17;              // runs from the row's west end into the east wall hatch
    const beltX0 = -rowHalf, beltLen = beltEnd - beltX0, beltCx = (beltX0 + beltEnd) / 2;
    add('lightMetal', box(beltCx, C.belt.height / 2 - .04, beltZ, beltLen, C.belt.height - .08, C.belt.width), 'airport.checkin.belt');
    add('dark', box(beltCx, C.belt.height - .02, beltZ, beltLen, .04, C.belt.width - .12));
    // Hatch: navy casing on the east wall with a dark flap opening.
    add('navy', box(beltEnd - .12, .8, beltZ, .24, 1.6, C.belt.hatchWidth));
    add('dark', box(beltEnd - .245, .74, beltZ, .02, .5, C.belt.width - .04));
    // Designed floor: one textured plane (tiles, queue carpets, guide decals).
    const floorTexture = scope.own(makeD01FloorTexture(w, d));
    const floorMaterial = scope.own(crearMaterialToon({ albedo: floorTexture, normal: scope.own(normalBaldosa()), repetirNormal: [w / ENTRANCE_HALL.slab[0], d / ENTRANCE_HALL.slab[1]], fuerzaNormal: .45 }));
    const floorPlane = new T.Mesh(scope.own(new T.PlaneGeometry(w, d)), floorMaterial);
    floorPlane.rotation.x = -Math.PI / 2; floorPlane.position.y = .013;
    group.add(floorPlane); scope.defer(() => floorPlane.removeFromParent());
    // Polished porcelain shine, as in D00.
    const gloss = createGlossyFloor(scope, { width: w, depth: d, strength: ENTRANCE_HALL.gloss });
    gloss.position.y = .024; gloss.renderOrder = 1; group.add(gloss); scope.defer(() => gloss.removeFromParent());
    // Self-service ATM row (2.5D extruded): thin dark bodies + one shared baked
    // front illustration per unit; against the west wall, north of the entrance.
    const atmZ = [-7, -5.5, -4, -2.6];
    const atmX = -w / 2 + .17;
    for (const z of atmZ) {
      add('metal', box(atmX, .8, z, .14, 1.6, .8), 'airport.checkin.kiosk');
      add('dark', box(atmX, .05, z, .34, .1, .92));
    }
    const atmTexture = scope.own(makeATMFrontTexture());
    const atmFrontMaterial = scope.own(new T.MeshBasicMaterial({ map: atmTexture }));
    scope.defer(luz.tintar(atmFrontMaterial, 'cartel'));
    const atmFronts = new T.InstancedMesh(scope.own(new T.PlaneGeometry(.78, 1.6)), atmFrontMaterial, atmZ.length);
    const atmMatrix = new T.Matrix4(), atmPos = new T.Vector3(), atmScale = new T.Vector3(1, 1, 1);
    const atmRot = new T.Quaternion().setFromEuler(new T.Euler(0, Math.PI / 2, 0));
    atmZ.forEach((z, i) => { atmMatrix.compose(atmPos.set(atmX + .075, .8, z), atmRot, atmScale); atmFronts.setMatrixAt(i, atmMatrix); });
    atmFronts.instanceMatrix.needsUpdate = true; atmFronts.computeBoundingSphere();
    atmFronts.userData = { semanticId: 'airport.checkin.kiosk', interactionType: 'inspect', zoneId: id };
    group.add(atmFronts); interactive.push(atmFronts);
    scope.defer(() => atmFronts.removeFromParent());
    // Wall sign above the row.
    const signTexture = scope.own(makeCheckinAutoSignTexture());
    const atmSignMaterial = scope.own(new T.MeshBasicMaterial({ map: signTexture }));
    scope.defer(luz.tintar(atmSignMaterial, 'cartel'));
    const atmSign = new T.Mesh(scope.own(new T.PlaneGeometry(3.6, .675)), atmSignMaterial);
    atmSign.position.set(-w / 2 + .13, 2.66, -4.8); atmSign.rotation.y = Math.PI / 2;
    group.add(atmSign); scope.defer(() => atmSign.removeFromParent());
    for (const x of [-7, -3.5, 0, 3.5, 7]) for (const z of CHECKIN.queueZ) barrier(x, z);
    for (const z of CHECKIN.queueZ) add('blue', box(0, 1, z, 14, .07, .055));
    luggage(-4, 5); luggage(1, 5, 'blue');
  } else if (id === 'D02') {
    // Screening lanes, queue, signs and floor of the reference view (SecurityHall.js).
    buildSecurityHall(meta, { scope, kit, group, interactive, colliders, worldPosition });
  } else if (id === 'D03') {
    // Queue, booth line and airside of the passport hall (PassportHall.js).
    buildPassportHall(meta, { scope, kit, group, interactive, colliders, worldPosition });
  } else if (id === 'A01') {
    buildPassportHall(meta, { scope, kit, group, interactive, colliders, worldPosition }, IMMIGRATION, ['INMIGRACIÓN', 'Immigration']);
  } else if (id === 'D04') {
    buildShopsHall(meta, { scope, kit, group, interactive, colliders, worldPosition });
  } else if (id === 'D05') {
    buildGateLounge(meta, { scope, kit, group, interactive, colliders, worldPosition });
  } else if (id === 'D06') {
    buildBoardingBridge(meta, { scope, kit, group, interactive, colliders, worldPosition });
  } else if (id === 'A00') {
    buildArrivalCorridor(meta, { scope, kit, group, interactive, colliders, worldPosition });
  } else if (id === 'A02') {
    animation.push(buildBaggageHall(meta, { scope, kit, group, interactive, colliders, worldPosition }).update);
  } else if (id === 'A03') {
    buildCustomsHall(meta, { scope, kit, group, interactive, colliders, worldPosition });
  } else if (id === 'A04') {
    buildArrivalsHall(meta, { scope, kit, group, interactive, colliders, worldPosition });
  } else if (id === 'A05') {
    buildExitHall(meta, { scope, kit, group, interactive, colliders, worldPosition });
  }
  for (const { color, semanticId, transforms } of batches.values()) {
    const mesh = boxes(scope, kit, group, color, transforms);
    if (semanticId) {
      mesh.userData = { semanticId, interactionType: 'inspect', zoneId: id };
      interactive.push(mesh);
      // Repeated visible props have a shared collider only for essential close-range fixtures.
      if (/counter|belt|xrayMachine|carousel|booth/.test(semanticId)) for (const [x, y, z, width, height, depth] of transforms) {
        const offset = new T.Vector3(worldPosition.x, 0, worldPosition.z);
        colliders.push(new T.Box3(new T.Vector3(x - width / 2, y - height / 2, z - depth / 2).add(offset), new T.Vector3(x + width / 2, y + height / 2, z + depth / 2).add(offset)));
      }
    }
    if (semanticId === 'airport.security.tray' && color === 'accent') {
      let time = 0; const matrix = new T.Matrix4(), rotation = new T.Quaternion(), position = new T.Vector3(), scale = new T.Vector3();
      animation.push(dt => {
        time += dt * .55;
        transforms.forEach(([x, y, z, w, h, depth], i) => {
          matrix.compose(position.set(x, y, -3.5 + ((z + 3.5 + time) % 2.1)), rotation, scale.set(w, h, depth));
          mesh.setMatrixAt(i, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
      });
    }
  }
  for (const [color, transforms] of cylinders) boxes(scope, kit, group, color, transforms, kit.cylinder);
  // D01's porcelain mirrors the room's props (the D00 hall does its own).
  if (id === 'D01') group.traverse(object => object.layers.enable(REFLECT_LAYER));
  return { update(dt) {
    for (const animate of animation) animate(dt);
  } };
}
