import * as T from './three.js';
import { ResourceScope } from './AssetRegistry.js';
import { createKit, createFacadeKit, boxes, sign } from './ThreeResources.js';
import { buildAirportComponents } from './AirportComponents.js';
import { buildExteriorIllusion } from './ExteriorIllusion.js';
import { LODController } from './LODController.js';
import { DIMENSIONS, FACADE, CANOPY_SOFFIT, CANOPY_SPOTS, PORTICO_SPOTS, PORTICO_X, PORTICO_Z, STREET, ENTRANCE_HALL, CHECKIN, DEPARTURE_ROUTE, ARRIVAL_ROUTE } from './routes.js';
import { crearCuadroPortal } from './PortalPreview.js';
import { luz, N_LAMPARAS } from './Luz25D.js';
import { colocarPlantas } from './TropicalPlants.js';

// Lamps of a zone, in world metres: a regular grid of ceiling pools (always
// on, stronger at night) and, at the entrance, the canopy downlights (dusk and
// night only). Pools are painterly: they need not match every ceiling panel.
function zoneLamps(meta, origin) {
  const { width: w, depth: d } = meta, lamps = [];
  const exterior = meta.id === 'D00' ? [
    ...CANOPY_SPOTS.map(x => [x, CANOPY_SOFFIT - .1, FACADE.canopyZ]),
    ...PORTICO_SPOTS.map(([x, z]) => [x, 5.25, z]),
  ] : [];
  const room = N_LAMPARAS - exterior.length;
  let nx = Math.max(1, Math.round(w / 6)), nz = Math.max(1, Math.round(d / 6));
  while (nx * nz > room) { if (nx >= nz) nx--; else nz--; }
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) lamps.push({
    pos: [origin.x - w / 2 + w / nx * (i + .5), DIMENSIONS.ceiling - .25, origin.z - d / 2 + d / nz * (j + .5)],
    color: '#ffe7c4', intensidad: .72, radio: 4.8, exterior: false,
  });
  // D00 entrance hall: a row of hidden warm linear lamps just under the navy
  // band washes the back wall downward (2800–3200 K wall-wash), replacing the
  // old fully-painted glow with real light that also catches the battens.
  if (meta.id === 'D00') {
    const washY = 3.14, washZ = origin.z - d / 2 + .72;
    for (let i = 0; i < 5; i++) lamps.push({
      pos: [origin.x - 5.6 + i * 2.8, washY, washZ],
      color: '#ffbe6e', intensidad: 1.4, radio: 3.4, exterior: false,
    });
  }
  for (const [x, y, z] of exterior) lamps.push({ pos: [origin.x + x, y, origin.z + z], color: '#ffd59a', intensidad: 1, radio: y > 6 ? 4.4 : 3.9, exterior: true });
  return lamps;
}

// Sunlight painted on the entrance hall floor, as if cast through the glazing.
// A light decal (Luz25D): it takes the sun's color and fades out at night.
function sunPatchTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const c = canvas.getContext('2d');
  c.fillStyle = '#ffffff';
  // Door and window panes, skewed toward +x like a low sun from the left.
  for (const [x0, x1] of [[20, 92], [100, 172], [196, 316], [340, 412], [420, 492]]) {
    // Canvas top = deeper into the hall (-z); the bottom edge sits at the glass.
    c.beginPath(); c.moveTo(x0 + 56, 0); c.lineTo(x1 + 56, 0); c.lineTo(x1, 256); c.lineTo(x0, 256); c.closePath(); c.fill();
  }
  const fade = c.createLinearGradient(0, 0, 0, 256);
  fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(.35, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  c.globalCompositeOperation = 'destination-out'; c.fillStyle = fade; c.fillRect(0, 0, 512, 256);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

// Facade signs (illustrations, not relit). A vector plane replaces the emoji so
// every OS draws the same glyph.
function drawPlane(c, x, y, size, color) {
  c.save(); c.translate(x, y); c.scale(size / 160, size / 160); c.fillStyle = color;
  c.beginPath(); c.ellipse(0, 0, 78, 11, 0, 0, Math.PI * 2); c.fill();
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(18, 0); c.lineTo(-16, s * 70); c.lineTo(-34, s * 70); c.lineTo(-18, 0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-54, 0); c.lineTo(-70, s * 28); c.lineTo(-82, s * 28); c.lineTo(-74, 0); c.closePath(); c.fill();
  }
  c.restore();
}
function drawHeadingSign(c, w, h) {
  // Simple saturated blue sign, white lettering and a discreet edge.
  c.fillStyle = '#063f73'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#064c83'; c.fillRect(0, 0, w, h * .5);
  c.lineWidth = 3; c.strokeStyle = '#0b568d'; c.strokeRect(2, 2, w - 4, h - 4);
  c.font = 'bold 168px system-ui, sans-serif'; c.textBaseline = 'middle'; c.textAlign = 'left';
  const text = 'Aeropuerto', textWidth = c.measureText(text).width, icon = 200, gap = 70;
  const x0 = (w - (icon + gap + textWidth)) / 2, y = h * .47;
  c.save();
  drawPlane(c, x0 + icon / 2, y, icon, '#f7f5ee');
  c.fillStyle = '#f7f5ee'; c.fillText(text, x0 + icon + gap, y + 6);
  c.restore();
}
function drawEntranceSign(c, w, h) {
  c.fillStyle = '#063f73'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#2c5378'; c.lineWidth = 4; c.strokeRect(8, 8, w - 16, h - 16);
  c.fillStyle = '#f8f3e9'; c.font = 'bold 54px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('Entrada', w / 2, h / 2 + 2);
}

export async function createAirportChunk(meta, { scene, renderer, camera, registry, signal }) {
  const scope = new ResourceScope();
  try {
    const kit = await scope.lease(registry.acquire('airport:toon-kit:r180', createKit, kit => kit.dispose()));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const root = new T.Group(); root.name = meta.id;
    root.position.set(...[meta.center?.[0] || 0, 0, meta.center?.[1] || 0]);
    root.visible = true;
    scene.add(root); scope.defer(() => { root.removeFromParent(); root.clear(); });
    const w = meta.width, d = meta.depth, h = DIMENSIONS.ceiling;
    boxes(scope, kit, root, 'floor', [[0, -0.12, 0, w, 0.24, d]]);
    boxes(scope, kit, root, 'ceiling', [[0, h + .08, 0, w, .16, d]]);
    const preview = new T.Group(); preview.name = `${meta.id}:preview`; root.add(preview);
    const previewLabels = {
      D00: 'ENTRADA', D01: 'FACTURACIÓN', D02: 'SEGURIDAD', D03: 'PASAPORTES',
      D04: 'TIENDAS', D05: 'SALA DE ESPERA', D06: 'EMBARQUE', A00: 'PASAPORTES',
      A01: 'PASAPORTES', A02: 'EQUIPAJE', A03: 'CONTROL', A04: 'SALIDAS', A05: 'SALIDAS',
    };
    const previewProps = {
      D00: ['navy', [[-3, .75, -2, .55, 1.5, .5], [3, .75, -2, .55, 1.5, .5]]],
      D01: ['navy', [[-5, .55, -3, 2.2, 1.1, .9], [0, .55, -3, 2.2, 1.1, .9], [5, .55, -3, 2.2, 1.1, .9]]],
      D02: ['accent', [-5, 0, 5].map(x => [x, .018, 0, 1.8, .025, 3])],
      D03: ['navy', [[-3, .55, -2, 2, 1.1, .9], [3, .55, -2, 2, 1.1, .9]]],
      D04: ['wood', [[-6, 1.4, -3, 3, 2.8, .5], [5, 1.4, -3, 3, 2.8, .5]]],
      D05: ['seat', [[-4, .55, 0, 5, 1.1, 1], [4, .55, 0, 5, 1.1, 1]]],
      D06: ['navy', [[-3, .55, 0, 2, 1.1, .9]]],
      A01: ['navy', [[-3, .55, -2, 2, 1.1, .9], [3, .55, -2, 2, 1.1, .9]]],
      A02: ['metal', [[-5, .45, 0, 5, .9, 3], [5, .45, 0, 5, .9, 3]]],
      A03: ['navy', [[0, .55, 0, 2, 1.1, .9]]],
      A04: ['seat', [[-4, .55, 0, 5, 1.1, 1], [4, .55, 0, 5, 1.1, 1]]],
    };
    const landmark = previewProps[meta.id];
    if (landmark) boxes(scope, kit, preview, landmark[0], landmark[1]);
    if (previewLabels[meta.id]) sign(scope, kit, preview, previewLabels[meta.id], 0, 3.9, -d / 2 + .26, Math.min(w - 2, 5), .7);
    const floorLines = [];
    for (let x = -w / 2 + 2; x < w / 2; x += 4) floorLines.push([x, .012, 0, .018, .012, d]);
    for (let z = -d / 2 + 2; z < d / 2; z += 4) floorLines.push([0, .012, z, w, .012, .018]);
    boxes(scope, kit, preview, 'trim', floorLines);
    const incoming = {
      D01: 'west', D02: 'west', D03: 'north', D04: 'west', D05: 'north', D06: 'east',
      A01: 'north', A02: 'west', A03: 'west', A04: 'north', A05: 'west',
    }[meta.id];
    if (incoming && previewLabels[meta.id]) {
      const x = incoming === 'west' ? w / 2 - .24 : incoming === 'east' ? -w / 2 + .24 : 0;
      const z = incoming === 'north' ? d / 2 - .24 : 0;
      const facing = incoming === 'west' ? -Math.PI / 2 : incoming === 'east' ? Math.PI / 2 : Math.PI;
      sign(scope, kit, preview, previewLabels[meta.id], x, 3.8, z, 4.2, .66, facing);
    }
    const nextLabels = {
      // D00's check-in sign is the illustrated one of its hall (EntranceHall.js).
      // D01's security sign is the illustrated one over its glass doors (CheckinHall.js).
      D02: { south: 'PASAPORTES' },
      D03: { east: 'TIENDAS' }, D04: { south: 'SALA DE ESPERA' }, D05: { west: 'EMBARQUE' },
      A00: { south: 'PASAPORTES' }, A01: { east: 'EQUIPAJE' }, A02: { east: 'CONTROL' },
      A03: { south: 'SALIDAS' }, A04: { east: 'SALIDAS' },
    };
    for (const [side, label] of Object.entries(nextLabels[meta.id] || {})) {
      const offset = meta.openings?.[side];
      if (offset === undefined) continue;
      const x = side === 'east' ? w / 2 - .16 : side === 'west' ? -w / 2 + .16 : offset;
      const z = side === 'south' ? d / 2 - .16 : side === 'north' ? -d / 2 + .16 : offset;
      const facing = side === 'east' ? -Math.PI / 2 : side === 'west' ? Math.PI / 2 : side === 'north' ? 0 : Math.PI;
      sign(scope, kit, root, label, x, 3.38, z, 3.4, .56, facing);
    }
    const walls = [];
    const wall = (side, length, horizontal, coordinate) => {
      const gap = meta.openings?.[side];
      const pieces = gap === undefined ? [[0, length, h, h / 2]] : [
        [(-length / 2 + gap - 2) / 2, length / 2 + gap - 2, h, h / 2],
        [(length / 2 + gap + 2) / 2, length / 2 - gap - 2, h, h / 2],
        [gap, 4, h - DIMENSIONS.doorHeight, (h + DIMENSIONS.doorHeight) / 2],
      ];
      pieces.forEach(([p, len, height, y]) => walls.push(horizontal ? [p, y, coordinate, len, height, 0.18] : [coordinate, y, p, 0.18, height, len]));
    };
    wall('north', w, true, -d / 2);
    const doors = [];
    if (['D00', 'D05', 'A04', 'A05'].includes(meta.id)) {
      const automatic = meta.id !== 'D05';
      const entrance = meta.id === 'D00';
      const openingWidth = entrance ? 6.4 : 4;
      const panels = automatic ? [
        [-(w + openingWidth) / 4, (w - openingWidth) / 2], [(w + openingWidth) / 4, (w - openingWidth) / 2],
      ] : [[0, w]];
      for (const [x, width] of panels) {
        const glazing = new T.Mesh(scope.own(new T.PlaneGeometry(width, entrance ? 4.05 : 3.1)), kit.glass);
        glazing.position.set(x, entrance ? 2.5 : 2.55, d / 2); root.add(glazing);
        scope.defer(() => glazing.removeFromParent());
      }
      if (automatic) for (const side of [-1, 1]) {
        const panel = new T.Mesh(scope.own(new T.PlaneGeometry(entrance ? 3.15 : 1.95, entrance ? 3.3 : 2.7)), kit.glass);
        panel.position.set(side * (entrance ? 1.6 : 1), entrance ? 1.65 : 1.35, d / 2 + .02); root.add(panel);
        doors.push({ panel, side }); scope.defer(() => panel.removeFromParent());
      }
      const sill = entrance ? [[-5.1, .5, d / 2, 3.8, 1, .18], [5.1, .5, d / 2, 3.8, 1, .18]] : [[0, .5, d / 2, w, 1, .18]];
      // Header over the glazing. At the entrance it is the transom beam under
      // the clerestory; elsewhere it closes the wall up to the ceiling.
      const header = entrance ? [0, 4.7, d / 2, w, .6, .18] : [0, (4.1 + h) / 2, d / 2, w, h - 4.1, .18];
      boxes(scope, kit, root, 'wall', [...sill, header]);
      boxes(scope, kit, root, 'trim', (entrance ? [-7, -5.1, -3.2, 0, 3.2, 5.1, 7] : Array.from({ length: 7 }, (_, i) => (-3 + i) * w / 6))
        .map(x => [x, entrance ? 2.08 : 2.55, d / 2, .09, entrance ? 4.16 : 3.1, .12]));
      if (meta.id === 'D00') {
        // Facade built in layers, front to back: canopy → clerestory → signs →
        // portal frame → doors and fixed side panes. Small depth offsets
        // (2–40 cm) between the layers give the joints and profiles.
        const front = FACADE.front, soffit = CANOPY_SOFFIT;
        const facadeKit = createFacadeKit(scope, kit);
        // Ground bases: pavement up to the near kerb, asphalt one kerb-drop lower,
        // then the far pavement. The illustrated surfaces lie on top of them.
        const { curb, far, drop } = STREET;
        boxes(scope, facadeKit, root, 'floor', [
          [6, -.13, (front + curb) / 2, w + 36, .24, curb - front],
          [6, -drop - .125, (curb + far) / 2, w + 36, .24, far - curb],
          [6, -.13, (far + d / 2 + 20) / 2, w + 36, .24, d / 2 + 20 - far],
        ]);
        // Canopy: light-grey top slab over a navy fascia band, panel joints on
        // the slab edge. It spans the hall and meets the right wing's cap.
        const canopyX = 0, canopyW = FACADE.canopyWidth, canopyZ = FACADE.canopyZ,
          canopyD = FACADE.canopyDepth, canopyFace = FACADE.roofFront;
        const copingInset = .045;
        boxes(scope, facadeKit, root, 'roofMetal', [[canopyX, soffit + .425, canopyZ, canopyW - 2 * copingInset, .35, canopyD - 2 * copingInset]]).castShadow = true;
        boxes(scope, facadeKit, root, 'navy', [[canopyX, soffit + .125, canopyZ, canopyW, .25, canopyD]]).castShadow = true;
        boxes(scope, facadeKit, root, 'joint', [
          [canopyX, soffit + .25, canopyFace + .006, canopyW, .02, .02],
          ...[-3.9, -1.3, 1.3, 3.9].map(x => [canopyX + x, soffit + .425, canopyFace - copingInset + .006, .025, .35, .02]),
        ]);
        // Two matching boundary piers frame the glass. No extra pier behind
        // the left advertising sign or inside the right-hand glazing.
        boxes(scope, facadeKit, root, 'wall', [
          ...[-7, 7].map(x => [x, soffit / 2, FACADE.sideFront - .31, FACADE.pierWidth, soffit, .62]),
        ]).castShadow = true;
        boxes(scope, facadeKit, root, 'lightMetal', [-7, 7].map(x => [x, .07, FACADE.sideFront - .31, FACADE.pierWidth + .06, .14, .66]));
        // Stone courses continue through both full-height piers, as in the reference.
        boxes(scope, facadeKit, root, 'joint', [-7, 7].flatMap(x =>
          [1.8, 3.6, 4.95, FACADE.sideTop].map(y => [x, y, FACADE.sideFront + .002, FACADE.pierWidth, .022, .008])));
        // Clerestory: tall glazing from the transom beam up behind the canopy,
        // split into bays by real mullions and transoms. Its baked reflections
        // live in ExteriorIllusion; through it the hall's ceiling grid shows.
        const glassWidth = w - FACADE.pierWidth;
        const clerestory = new T.Mesh(scope.own(new T.PlaneGeometry(glassWidth, h - 5)), kit.glass);
        clerestory.position.set(0, (5 + h) / 2, front); root.add(clerestory);
        scope.defer(() => clerestory.removeFromParent());
        boxes(scope, facadeKit, root, 'navy', [
          ...Array.from({ length: 6 }, (_, i) => [-glassWidth / 2 + i * glassWidth / 5, (5 + h) / 2, front + .045, .09, h - 5, .14]),
          [0, 5.06, front + .05, glassWidth, .12, .16],
        ]);
        // Fixed side panes: a transom at door-head height.
        boxes(scope, facadeKit, root, 'trim', [[-5.1, 3.36, front + .03, 3.8, .08, .1], [5.1, 3.36, front + .03, 3.8, .08, .1]]);
        // The narrow glazed bay at the left is an exterior frame only.
        boxes(scope, facadeKit, root, 'navy', [
          [-5.85, 1.7, front + .12, .10, 3.4, .12],
          [-4.45, 1.7, front + .12, .10, 3.4, .12],
          [-5.15, 3.4, front + .12, 1.5, .10, .12],
        ]);
        // (The right wing is a street-only illusion in ExteriorIllusion: it
        // stands where D01's shell pokes out, so it lives in the D00 detail.)
        // The portico: a covered walk along the hall's west wall, from the
        // canopy line back to the end of the building, over pavement. Its roof
        // speaks the canopy's language (navy fascia under a light-grey cap with
        // panel joints) and rests on the hall wall on the east and on one row of
        // square navy columns on its west edge; the street end stays open.
        // The roof meets the outside of the left boundary pier.
        const [porticoWest, porticoEast] = PORTICO_X, [porticoBack, porticoFace] = PORTICO_Z;
        const porticoW = porticoEast - porticoWest, porticoX = (porticoWest + porticoEast) / 2;
        const porticoD = porticoFace - porticoBack, porticoZ = (porticoBack + porticoFace) / 2;
        const roof = (y, height) => [
          [porticoX, y, porticoZ, porticoW, height, porticoD],
        ];
        boxes(scope, facadeKit, root, 'roofMetal', [[porticoX, 6.03, porticoZ, porticoW - 2 * copingInset, .3, porticoD - 2 * copingInset]]).castShadow = true;
        boxes(scope, facadeKit, root, 'navy', roof(5.61, .54)).castShadow = true;
        boxes(scope, facadeKit, root, 'joint', [
          [porticoX, 5.88, porticoFace + .006, porticoW, .02, .02],
          [porticoWest - .006, 5.88, porticoZ, .02, .02, porticoD],
          ...[porticoX - 1.3, porticoX + 1.3].map(x => [x, 6.03, porticoFace - copingInset + .006, .025, .3, .02]),
          ...Array.from({ length: 4 }, (_, i) => porticoBack + (i + 1) * porticoD / 5).map(z => [porticoWest - .006, 6.03, z, .02, .3, .025]),
        ]);
        const columnCount = 9, columnX = porticoWest + .25;
        const columnFront = FACADE.sideFront - .2, columnBack = porticoBack + .25;
        const porticoColumns = Array.from({ length: columnCount }, (_, i) =>
          columnFront - i * (columnFront - columnBack) / (columnCount - 1)).map(z => [columnX, FACADE.sideSoffit / 2, z, .4, FACADE.sideSoffit, .4]);
        // Rear return: two additional supports complete the far end of the
        // colonnade, visible through the open street-facing entrance.
        for (const x of [porticoX, porticoEast - .25]) {
          porticoColumns.push([x, FACADE.sideSoffit / 2, columnBack, .4, FACADE.sideSoffit, .4]);
        }
        boxes(scope, facadeKit, root, 'navy', porticoColumns).castShadow = true;
        boxes(scope, facadeKit, root, 'lightMetal', porticoColumns.map(([x, , z]) => [x, .07, z, .5, .14, .5]));
        // Portal frame: navy jambs and lintel (dintel) around the doors, a gold
        // reveal under the lintel and a metal threshold at the door line.
        boxes(scope, facadeKit, root, 'navy', [
          [-3.3, 1.75, front + .2, .22, 3.5, .34], [3.3, 1.75, front + .2, .22, 3.5, .34],
          [0, 3.44, front + .2, 6.82, .28, .36],
        ]).castShadow = true;
        boxes(scope, facadeKit, root, 'accent', [[0, 3.31, front + .385, 6.82, .04, .03]]);
        boxes(scope, facadeKit, root, 'lightMetal', [[0, .02, front + .12, 6.4, .04, .3]]);
        // Two plain dark posts guard the door approach (the lit bollards live in
        // ExteriorIllusion); the centre stays open for walking.
        boxes(scope, facadeKit, root, 'bollard', [-2.9, 2.9].map(x => [x, .45, d / 2 + 2.4, .17, .9, .17]), kit.cylinder);
        // Signs are boxes with a painted face: navy case, metal caps, hangers.
        boxes(scope, facadeKit, root, 'navy', [[0, 4.75, front + .3, 7.4, 1.1, .24], [0, 3.87, front + .32, 5.3, .52, .16]]).castShadow = true;
        boxes(scope, facadeKit, root, 'lightMetal', [
          [0, 5.32, front + .3, 7.46, .04, .28], [0, 4.18, front + .3, 7.46, .04, .28],
          [-2.1, 4.15, front + .32, .05, .1, .05], [2.1, 4.15, front + .32, .05, .1, .05],
        ]);
        const signFace = (width, height, pixelsWide, draw) => {
          const canvas = document.createElement('canvas'); canvas.width = pixelsWide; canvas.height = Math.round(pixelsWide * height / width);
          draw(canvas.getContext('2d'), canvas.width, canvas.height);
          const texture = scope.own(new T.CanvasTexture(canvas)); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
          const material = scope.own(new T.MeshBasicMaterial({ map: texture }));
          scope.defer(luz.tintar(material, 'cartel'));
          return new T.Mesh(scope.own(new T.PlaneGeometry(width, height)), material);
        };
        const headingMesh = signFace(7.28, 1.0, 2048, drawHeadingSign);
        headingMesh.position.set(0, 4.75, front + .421); root.add(headingMesh); scope.defer(() => headingMesh.removeFromParent());
        const labelMesh = signFace(5.18, .44, 1024, drawEntranceSign);
        labelMesh.position.set(0, 3.87, front + .401); root.add(labelMesh); scope.defer(() => labelMesh.removeFromParent());
        // Sun through the doors: two painted patches just inside the glazing.
        const patchMaterial = scope.own(new T.MeshBasicMaterial({ map: scope.own(sunPatchTexture()), transparent: true, opacity: .2, depthWrite: false }));
        for (const [x, width] of [[-4.6, 4.2], [.4, 6.4], [5.4, 4.2]]) {
          const patch = new T.Mesh(scope.own(new T.PlaneGeometry(width, 2.6)), patchMaterial);
          patch.rotation.x = -Math.PI / 2; patch.position.set(x, .034, d / 2 - 1.35);   // above the door mat
          root.add(patch); scope.defer(() => patch.removeFromParent());
          scope.defer(luz.registrarDecal(patch, .2));
        }
      }
    } else if (meta.id === 'D01') {
      // D01: the shell stays open over the clerestory band so the sky box
      // outside is seen through the glass (CheckinHall.js).
      const { sill, top } = CHECKIN.glazing;
      walls.push([0, sill / 2, d / 2, w, sill, .18], [0, (top + h) / 2, d / 2, w, h - top, .18]);
    } else wall('south', w, true, d / 2);
    if (meta.id === 'D00') {
      // The hall's west wall is glazed onto the portico (reference): navy
      // mullions from the back wall to the front-left pier, up to the portico
      // soffit; solid wall above it. The reference closes the back corner with
      // a full-height beige pier as wide as a glazing bay plus the corner
      // return (~2,2 m): the glazing gives one bay to the pier and starts
      // that far off the corner (westBays counts the remaining bays).
      const x = -w / 2, top = FACADE.sideSoffit, z0 = -d / 2 + 2.33, z1 = FACADE.sideFront - .62;
      const bays = ENTRANCE_HALL.westBays, bay = (z1 - z0) / bays;
      const pane = new T.Mesh(scope.own(new T.PlaneGeometry(z1 - z0, top)), kit.glass);
      pane.position.set(x, top / 2, (z0 + z1) / 2); pane.rotation.y = Math.PI / 2; root.add(pane);
      scope.defer(() => pane.removeFromParent());
      walls.push([x, (top + h) / 2, 0, .18, h - top, d]);
      walls.push([x, top / 2, (-d / 2 + .09 + z0) / 2, .18, top, z0 - (-d / 2 + .09)]);
      boxes(scope, kit, root, 'navy', [
        ...Array.from({ length: bays + 1 }, (_, i) => [x, top / 2, z0 + i * bay + (i === 0 ? .05 : i === bays ? -.05 : 0), .16, top, .1]),
        [x, .06, (z0 + z1) / 2, .16, .12, z1 - z0], [x, 3.36, (z0 + z1) / 2, .16, .08, z1 - z0],
        [x, top - .15, (z0 + z1) / 2, .2, .3, z1 - z0],
      ]);
    } else wall('west', d, false, -w / 2);
    wall('east', d, false, w / 2);
    boxes(scope, kit, root, 'wall', walls);
    // First-person rooms have a ceiling; light strips remain per active zone.
    let detailScope = null, detail = null, active = false;
    // Vecinas por puerta: cuadro horneado en lugar de la sala real (PortalPreview.js).
    const cuadros = new Map(); let viewer = null;
    const refrescarVista = () => {
      const cuadro = !active && viewer ? cuadros.get(viewer) : null, listo = !!cuadro?.listo;
      preview.visible = !active && !listo;
      for (const [id, c] of cuadros) c.mesh.visible = !active && listo && id === viewer;
    };
    const interactive = [], colliders = [];
    const lamps = zoneLamps(meta, root.position);
    const lod = new LODController({ onChange(level) { if (detail) detail.userData.lod = level; } });
    let content = null;
    const discardHigh = () => {
      active = false; interactive.length = 0; colliders.length = 0; luz.soltarLamparas(chunk);
      detailScope?.dispose(); detailScope = null; detail = null; content = null;
    };
    const chunk = {
      root, interactive, colliders,
      snapWalls: walls.filter(([, y, , width, height, depth]) => y - height / 2 < .3 && Math.min(width, depth) <= .24)
        .map(([x, , z, width, , depth]) => width > depth
          ? { a: [root.position.x + x - width / 2, root.position.z + z], b: [root.position.x + x + width / 2, root.position.z + z] }
          : { a: [root.position.x + x, root.position.z + z - depth / 2], b: [root.position.x + x, root.position.z + z + depth / 2] }),
      get detail() { return detail; },
      async prepareHigh(abortSignal) {
        if (detail) return;
        detailScope = new ResourceScope();
        detail = new T.Group(); detail.name = `${meta.id}:HIGH`; detail.visible = false; root.add(detail);
        const localDetail = detail;
        detailScope.defer(() => { localDetail.removeFromParent(); localDetail.clear(); });
        content = buildAirportComponents(meta, { scope: detailScope, kit, group: detail, interactive, colliders, worldPosition: root.position });
        const exterior = await buildExteriorIllusion(meta, detailScope, kit, detail, interactive, colliders, root.position, doors, registry);
        try { await colocarPlantas({ registry, scope: detailScope, group: detail }); }
        catch (error) { if (error?.name === 'AbortError') throw error; console.warn('Plantas tropicales no disponibles', error); }
        if (abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
        const interiorUpdate = content.update;
        content.update = (dt, quality, level) => { interiorUpdate(dt, quality, level); exterior.update(dt, camera); };
        // compileAsync traverses the staging group; do not expose it in the main render.
        const staging = new T.Scene();
        for (const child of scene.children) if (child.isLight) staging.add(child.clone());
        root.remove(detail); staging.add(detail); detail.visible = true;
        try {
          await renderer.compileAsync(staging, camera, scene);
          if (abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
        } finally { staging.remove(detail); detail.visible = false; root.add(detail); staging.clear(); }
      },
      setViewer(id) {
        viewer = id;
        if (id && !active && !cuadros.has(id)) {
          const route = [DEPARTURE_ROUTE, ARRIVAL_ROUTE].find(r => r.some(z => z.id === meta.id));
          const from = route?.find(z => z.id === id), cuadro = from && crearCuadroPortal(scope, from, meta);
          if (cuadro) {
            const entrada = { mesh: cuadro.mesh, listo: false };
            cuadros.set(id, entrada); root.add(cuadro.mesh); scope.defer(() => cuadro.mesh.removeFromParent());
            cuadro.promesa.then(() => { entrada.listo = true; refrescarVista(); }, () => {});
          }
        }
        refrescarVista();
      },
      setActive(value) {
        active = value; root.visible = true; refrescarVista(); if (detail) detail.visible = value;
        if (value) luz.ponerLamparas(lamps, chunk); else luz.soltarLamparas(chunk);
      },
      discardHigh,
      update(dt, camera, quality) {
        if (!active) return;
        if (doors.length) {
          const nearDoor = Math.abs(camera.position.z - (root.position.z + d / 2)) < 4 && Math.abs(camera.position.x - root.position.x) < 3;
          for (const { panel, side } of doors) panel.position.x += (side * (nearDoor ? (meta.id === 'D00' ? 4.75 : 2.05) : (meta.id === 'D00' ? 1.6 : 1)) - panel.position.x) * Math.min(1, dt * 5);
        }
        const level = lod.update(camera.position.distanceTo(root.position), quality.lodScale);
        detail.userData.lod = level;
        content?.update(dt, quality, level);
      },
      dispose() { discardHigh(); scope.dispose(); },
    };
    return chunk;
  } catch (error) { scope.dispose(); throw error; }
}
