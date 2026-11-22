import * as T from './three.js';
import { luz, crearMaterialToon, contornoDe } from './Luz25D.js';

// D05 · the apron seen through the south window, as a 2.5D set built from the
// Blender airport (Ambiente/_Airport-Turbosquid.blend, camera "D05_cam").
//
// The Blender renders are cut-outs taken from ONE eye (EYE, zone-local): each
// layer is a plane at its own depth, sized so it covers exactly the frustum
// slice it was rendered for. From EYE the stack reads as the render; walking
// round the lounge the layers slide against each other (parallax).
// Layers are pulled in to 28–52 m (camera far is 70–90 m); the 3D apron and
// its props in front of them stay at real scale.
// The lounge stops visitors 1 m short of the glass (ConcourseHalls.js), where
// the flat layers would start to show.

export const EYE = { y: 1.6, z: 4 };
// Render frustum (Blender: 4096 x 834, 126° horizontal, shift_y .0127).
const SHOT = { w: 4096, h: 834, left: -1.965, span: 3.93, top: .45, vspan: .8 };
// Cut-outs: crop box in the full render (px) and the depth they are hung at.
const LAYERS = [
  { name: 'near', crop: [0, 162, 804, 440], depth: 28 },       // aircraft at the next stand
  { name: 'mid', crop: [148, 341, 3673, 479], depth: 42 },     // parked row
  { name: 'far', crop: [0, 0, 4096, 604], depth: 46 },         // terminal, tower, taxiway
];
const APRON_END = 40;        // the 3D apron runs to EYE.z + 40 (horizon -0.04 rad)
// Runway in front of the terminal: aircraft drawn at FLIGHT.depth but moved in
// true metres at FLIGHT.distance, so speed and climb read right. Sizes are the
// cut-outs in true metres (Blender: 1 unit = 2.06 m).
const FLIGHT = { depth: 36, distance: 130, span: 520, ground: [65.3, 16.4], air: [65.8, 13.1], period: 60 };

function sheet(scope, file) {
  const map = scope.own(new T.TextureLoader().load(new URL(`../assets/d05/${file}.webp`, import.meta.url).href));
  map.colorSpace = T.SRGBColorSpace; map.anisotropy = 4;
  const material = scope.own(new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: T.DoubleSide }));
  scope.defer(luz.tintar(material, 'fondo'));
  return material;
}

function drawApron(c, w, h, mx, mz, x0, z0) {
  const X = x => (x - x0) * mx, Z = z => (z - z0) * mz;
  c.fillStyle = '#737b82'; c.fillRect(0, 0, w, h);
  // Concrete slabs of the stand, 5 m joints.
  c.strokeStyle = 'rgba(40,48,56,.18)'; c.lineWidth = 1;
  for (let x = Math.ceil(x0 / 5) * 5; X(x) < w; x += 5) { c.beginPath(); c.moveTo(X(x), 0); c.lineTo(X(x), h); c.stroke(); }
  for (let z = Math.ceil(z0 / 5) * 5; Z(z) < h; z += 5) { c.beginPath(); c.moveTo(0, Z(z)); c.lineTo(w, Z(z)); c.stroke(); }
  // Service road along the building (white), red equipment limit line.
  c.fillStyle = '#e8ebe6'; c.fillRect(0, Z(17.4), w, 3); c.fillRect(0, Z(23.2), w, 3);
  c.setLineDash([mx * 2, mx * 1.5]); c.strokeStyle = '#e8ebe6'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, Z(20.3)); c.lineTo(w, Z(20.3)); c.stroke(); c.setLineDash([]);
  c.fillStyle = '#c8433a'; c.fillRect(0, Z(24), w, 4);
  // Stand lead-in line (yellow) with the stop bar, and the taxi line.
  c.strokeStyle = '#e5b43c'; c.lineWidth = 5;
  c.beginPath(); c.moveTo(X(-2), Z(25)); c.lineTo(X(-2), Z(30)); c.quadraticCurveTo(X(-2), Z(33), X(8), Z(33)); c.lineTo(X(70), Z(33)); c.stroke();
  c.beginPath(); c.moveTo(X(-60), Z(33)); c.lineTo(X(-6), Z(33)); c.quadraticCurveTo(X(-2), Z(33), X(-2), Z(30)); c.stroke();
  // Runway at the far edge of the apron (the flights run along z = 40).
  c.fillStyle = '#4f565d'; c.fillRect(0, Z(36.5), w, Z(z0 + h / mz) - Z(36.5));
  c.fillStyle = '#eef0ec'; c.fillRect(0, Z(36.8), w, 3);
  for (let x = x0; X(x) < w; x += 12) c.fillRect(X(x), Z(40) - 2, 6 * mx, 4);
  c.fillRect(X(-4), Z(26), X(0) - X(-4), 5);
  c.font = `bold ${Math.round(mz * 2)}px system-ui, sans-serif`; c.fillStyle = '#e5b43c'; c.textAlign = 'center';
  c.save(); c.translate(X(-2), Z(29)); c.rotate(Math.PI); c.fillText('12', 0, 0); c.restore();   // read from the lounge
}

export function buildGateApron(meta, scope, kit, group) {
  const edge = meta.depth / 2;
  const add = object => { group.add(object); scope.defer(() => object.removeFromParent()); return object; };

  // --- Cut-out layers ------------------------------------------------------------
  for (const { name, crop: [x0, y0, x1, y1], depth } of LAYERS) {
    const tx0 = SHOT.left + x0 / SHOT.w * SHOT.span, tx1 = SHOT.left + x1 / SHOT.w * SHOT.span;
    const ty0 = SHOT.top - y0 / SHOT.h * SHOT.vspan, ty1 = SHOT.top - y1 / SHOT.h * SHOT.vspan;
    const layer = add(new T.Mesh(scope.own(new T.PlaneGeometry((tx1 - tx0) * depth, (ty0 - ty1) * depth)), sheet(scope, name)));
    // Faces the lounge (rotation PI), so image left is world +x.
    layer.position.set(-(tx0 + tx1) / 2 * depth, EYE.y + (ty0 + ty1) / 2 * depth, EYE.z + depth);
    layer.rotation.y = Math.PI;
  }

  // --- 3D apron at real scale: ground, jet bridge, baggage train, cones, mast ----
  const x0 = -70, x1 = 70, z0 = edge, z1 = EYE.z + APRON_END;
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 512;
  drawApron(canvas.getContext('2d'), 2048, 512, 2048 / (x1 - x0), 512 / (z1 - z0), x0, z0);
  const albedo = scope.own(new T.CanvasTexture(canvas)); albedo.colorSpace = T.SRGBColorSpace; albedo.anisotropy = 8;
  // Canvas u follows world x and its top row is the window side (z0).
  const ground = add(new T.Mesh(scope.own(new T.PlaneGeometry(x1 - x0, z1 - z0)), scope.own(crearMaterialToon({ albedo, bandas: 2 }))));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((x0 + x1) / 2, -.02, (z0 + z1) / 2);

  const colors = { bridge: 0xd9dde1, bridgeDark: 0x5d6873, navy: 0x17427c, tug: 0xf2b53a, cart: 0x9aa5ae, tyre: 0x2b3038, cone: 0xef7a2a, white: 0xf4f6f8, mast: 0x8d979f };
  const materials = Object.fromEntries(Object.entries(colors).map(([k, c]) => [k, scope.own(crearMaterialToon({ color: c, bandas: 3 }))]));
  const box = scope.own(new T.BoxGeometry(1, 1, 1)), cyl = scope.own(new T.CylinderGeometry(.5, .5, 1, 16)), cone = scope.own(new T.ConeGeometry(.5, 1, 12));
  const piece = (color, [x, y, z, w, h, d], { geometry = box, parent = group, rotY = 0, outline = true } = {}) => {
    const mesh = new T.Mesh(geometry, materials[color]);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.rotation.y = rotY;
    parent.add(mesh); if (parent === group) scope.defer(() => mesh.removeFromParent());
    if (outline && kit.outline) { const hull = contornoDe(mesh, kit.outline(colors[color], 'medio')); scope.defer(() => hull.removeFromParent()); }
    return mesh;
  };

  // Jet bridge, parked: rotunda by the facade, tunnel angled out to the west
  // (screen right from the lounge), drive column with its bogie at the free end.
  piece('bridgeDark', [-9, 2.2, edge + 2, 2.4, 4.4, 2.4], { geometry: cyl });
  const bridge = add(new T.Group()); bridge.position.set(-9, 0, edge + 2); bridge.rotation.y = -.55;
  const L = 16;
  piece('bridge', [0, 4.9, L / 2 + 1, 2.8, 2.9, L], { parent: bridge });
  piece('navy', [0, 4.9, L / 2 + 1, 2.84, .35, L + .02], { parent: bridge, outline: false });
  piece('bridgeDark', [0, 3.35, L / 2 + 1, 2.2, .2, L - .4], { parent: bridge });
  piece('bridge', [0, 5.1, L + 2.1, 3.6, 3.4, 2.2], { parent: bridge });                        // cab
  piece('bridgeDark', [0, 5.1, L + 3.25, 3, 2.6, .1], { parent: bridge, outline: false });      // canopy
  for (const s of [-1, 1]) piece('mast', [s * .7, 1.8, L - 1, .35, 3.6, .35], { parent: bridge });
  piece('bridgeDark', [0, .45, L - 1, 2.4, .5, .9], { parent: bridge });
  for (const s of [-1, 1]) piece('tyre', [s * 1.1, .4, L - 1, .8, .5, .8], { parent: bridge, geometry: cyl }).rotation.z = Math.PI / 2;

  // Baggage tug pulling three carts along the service road.
  const train = add(new T.Group()); train.position.set(21, 0, 20.3);
  piece('tug', [0, .75, 0, 2.6, .9, 1.5], { parent: train });
  piece('tug', [.5, 1.55, 0, 1, .7, 1.3], { parent: train });
  piece('tyre', [.5, 1.9, 0, 1.1, .08, 1.4], { parent: train, outline: false });
  for (let i = 0; i < 3; i++) {
    const x = -3.4 - i * 3.3;
    piece('cart', [x, .7, 0, 2.8, .12, 1.5], { parent: train });
    piece('navy', [x, 1.3, 0, 2.6, 1.1, 1.4], { parent: train });
    piece('white', [x, 1.9, 0, 2.8, .08, 1.6], { parent: train });
  }
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
    const wheel = piece('tyre', [(i ? -2.4 - (i - 1) * 3.3 : .6) + (i ? 0 : 0), .3, s * .7, .55, .22, .55], { parent: train, geometry: cyl, outline: false });
    wheel.rotation.x = Math.PI / 2;
  }
  // Cones round the empty stand and a ground power unit by the stop bar.
  for (const [x, z] of [[-6, 26.5], [2, 26.5], [-6, 33], [2, 33], [9, 36]]) {
    piece('cone', [x, .38, z, .45, .75, .45], { geometry: cone });
    piece('white', [x, .45, z, .3, .08, .3], { geometry: cyl, outline: false });
  }
  piece('white', [5, .7, 27, 2.2, 1.2, 1.2]);
  piece('navy', [5, 1.34, 27, 2.2, .08, 1.2], { outline: false });
  // Floodlight mast at the edge of the stand.
  piece('mast', [-22, 11, edge + 26, .6, 22, .6], { geometry: cyl });
  piece('mast', [-22, 22.2, edge + 26, 3.2, .5, .6]);
  piece('white', [-22, 22, edge + 25.6, 3, .3, .1], { outline: false });

  // --- Take-offs and landings on the runway in front of the terminal -------------
  // Each flight swaps two cut-outs: gear down on the runway and on approach,
  // gear up once climbing. Wheels sit on the painted runway (y = 0).
  const k = FLIGHT.depth / FLIGHT.distance;
  const cutout = (file, [width, height]) => {
    const mesh = add(new T.Mesh(scope.own(new T.PlaneGeometry(width * k, height * k)), sheet(scope, file)));
    mesh.geometry.translate(0, height * k / 2, 0);   // origin at the wheels
    mesh.rotation.y = Math.PI; mesh.visible = false; return mesh;
  };
  const sprites = { ground: cutout('plane_ground', FLIGHT.ground), air: cutout('plane_side', FLIGHT.air) };
  // x in true metres (image left = +x, the direction of travel), altitude above the runway.
  const place = (gear, x, altitude, pitch) => {
    const shown = sprites[gear];
    sprites.ground.visible = sprites.air.visible = false;
    if (Math.abs(x) > FLIGHT.span) return;
    shown.visible = true;
    shown.position.set(x * k, altitude * k, EYE.z + FLIGHT.depth);
    shown.rotation.z = pitch;   // - raises the nose (the gear-up sprite is already ~7° nose-up)
  };
  const tan = d => Math.tan(d * Math.PI / 180);
  let time = 0;
  return {
    update(dt) {
      time = (time + dt) % FLIGHT.period;
      if (time < 26) {
        // Take-off: accelerate from the right, rotate at x = 60, climb 9°.
        const s = -FLIGHT.span + 1.9 * time * time, lift = 60;
        if (s < lift) place('ground', s, 0, s > lift - 40 ? -(s - lift + 40) / 40 * .12 : 0);
        else place(s < lift + 120 ? 'ground' : 'air', s, (s - lift) * tan(9), s < lift + 120 ? -.14 : -.03);
      } else if (time > 30) {
        // Landing: 4° approach from the right, flare, touchdown at x = -60, brake.
        const t = time - 30, touch = -60, v = 70;
        const approach = touch + FLIGHT.span + 400, s = -FLIGHT.span - 400 + v * Math.min(t, approach / v);
        const after = Math.max(0, t - approach / v);
        const x = after ? touch + v * after - 1.6 * after * after : s;
        place('ground', x, after ? 0 : (touch - s) * tan(4), after ? 0 : -.06);
      } else place('ground', 1e9, 0, 0);
    },
  };
}
