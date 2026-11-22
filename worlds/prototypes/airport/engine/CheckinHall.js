import * as T from './three.js';
import { plantar } from './TropicalPlants.js';
import { boxes } from './ThreeResources.js';
import { luz, crearMaterialToon } from './Luz25D.js';
import { DIMENSIONS, CHECKIN as C } from './routes.js';
import { PALETTE, hex, canvasTexture, drawBagGlyph, drawHallSign } from './EntranceHall.js';
import { createClerestoryGlass, CLERESTORY_GLASS_SPAN } from './ExteriorIllusion.js';

// D01 · Facturación walls, after the reference view (looking east down the hall):
// north — warm wood panelling behind the counters under a cream soffit with the
// navy FACTURACIÓN fascia, the departures board and numbered counter signs;
// south — white piers with a sky clerestory above the wood line and, below it,
// wall bays (posters, benches, services), a hanging wayfinding sign; east — beige wall, glass doors to security
// under the navy sign. All measures: routes.js CHECKIN; positions derive from
// the wall faces and the counter row.

const EXTRA = { white: 0xf6f2ea, mullion: 0x1d4a86, pot: 0xf3efe7, soffit: 0xf4ecdc };

function drawFascia(c, w, h) {
  c.fillStyle = '#17427c'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f2b53a'; c.fillRect(0, h * .9, w, h * .1);
  const gx = h * .55, cy = h * .45;
  drawBagGlyph(c, gx, cy, h * .5);
  c.textAlign = 'left'; c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(h * .34)}px system-ui, sans-serif`;
  c.fillText('FACTURACIÓN', gx + h * .5, cy + h * .04);
  c.fillStyle = '#f7c948'; c.font = `600 ${Math.round(h * .24)}px system-ui, sans-serif`;
  c.fillText('Check-in', gx + h * .5, cy + h * .33);
}
function drawDepartures(c, w, h) {
  c.fillStyle = '#10213a'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#17427c'; c.fillRect(0, 0, w, h * .2);
  c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(h * .12)}px system-ui, sans-serif`; c.textAlign = 'left';
  c.fillText('SALIDAS  |  DEPARTURES', w * .04, h * .145);
  const rows = [['10:20', 'Madrid', 'IB312'], ['11:05', 'Bogotá', 'AV201'], ['12:15', 'Nueva York', 'AA809'], ['13:40', 'Ciudad de México', 'AM352']];
  c.font = `600 ${Math.round(h * .1)}px system-ui, sans-serif`;
  rows.forEach(([t, city, fl], i) => {
    const y = h * (.37 + i * .17);
    c.fillStyle = '#ffffff'; c.fillText(t, w * .04, y); c.fillText(city, w * .2, y); c.fillText(fl, w * .6, y);
    c.fillStyle = '#f7c948'; c.fillText('Check-in', w * .78, y);
  });
}
function drawNumber(n) {
  return (c, w, h) => {
    c.fillStyle = '#17427c'; c.beginPath(); c.roundRect(0, 0, w, h, w * .08); c.fill();
    c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(h * .66)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), w / 2, h * .54);
  };
}
function drawHanging(c, w, h) {
  c.fillStyle = '#17427c'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#ffffff'; c.lineWidth = w * .06; c.lineCap = 'round'; c.lineJoin = 'round';
  const ax = w / 2, a0 = h * .06, a1 = h * .2;
  c.beginPath(); c.moveTo(ax, a1); c.lineTo(ax, a0); c.moveTo(ax - w * .14, a0 + w * .14); c.lineTo(ax, a0); c.lineTo(ax + w * .14, a0 + w * .14); c.stroke();
  c.textAlign = 'center'; c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(w * .17)}px system-ui, sans-serif`;
  c.fillText('Embarque', w / 2, h * .3);
  c.fillStyle = '#f7c948'; c.font = `600 ${Math.round(w * .13)}px system-ui, sans-serif`; c.fillText('Departures', w / 2, h * .37);
  c.fillStyle = '#ffffff'; c.fillRect(w * .12, h * .47, w * .76, h * .005);
  drawBagGlyph(c, w / 2, h * .6, w * .3);
  c.font = `bold ${Math.round(w * .15)}px system-ui, sans-serif`; c.fillText('Servicios', w / 2, h * .78);
  c.fillStyle = '#f7c948'; c.font = `600 ${Math.round(w * .13)}px system-ui, sans-serif`; c.fillText('Services', w / 2, h * .85);
}
// Cloud layer for the clerestory sky: a few flat cartoon clouds on a clear tile
// (most of it empty, so one only drifts past now and then). Alpha = coverage;
// red = shading: white crown over a flat belly band (the shader colours both).
function drawCloudLayer(c, w, h) {
  let s = 23; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const [cx, cy, size] of [[.22, .3, .2], [.68, .64, .26], [.82, .14, .14]]) {
    const x0 = cx * w, cw = size * w, base = cy * h + cw * .18;
    c.save();
    c.beginPath();
    const puffs = 5 + Math.floor(r() * 3);
    for (let k = 0; k < puffs; k++) {
      const t = k / (puffs - 1), px = x0 - cw / 2 + t * cw, rad = cw * (.12 + .14 * Math.sin(Math.PI * t) + r() * .04);
      c.moveTo(px + rad, base - rad * .7); c.arc(px, base - rad * .7, rad, 0, Math.PI * 2);
    }
    c.fillStyle = '#ffffff'; c.fill();
    c.clip();
    c.fillStyle = '#000000'; c.fillRect(x0 - cw, base - cw * .09, cw * 2, cw);   // belly band
    c.restore();
    c.clearRect(x0 - cw, base, cw * 2, cw);   // flat underside
  }
}
// Backlit destination posters: illustration on top, title and one word of
// vocabulary on a white band. Emissive (not relit), like the ceiling panels.
function drawPoster(title, place, word, scene) {
  return (c, w, h) => {
    const ih = h * .7;
    c.save(); c.beginPath(); c.rect(0, 0, w, ih); c.clip(); scene(c, w, ih); c.restore();
    c.fillStyle = '#ffffff'; c.fillRect(0, ih, w, h - ih);
    c.fillStyle = '#f2b53a'; c.fillRect(0, ih, w, h * .025);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#17427c'; c.font = `bold ${Math.round(h * .11)}px system-ui, sans-serif`;
    c.fillText(title, w * .05, ih + h * .14);
    c.fillStyle = '#5a6b80'; c.font = `600 ${Math.round(h * .065)}px system-ui, sans-serif`;
    c.fillText(place, w * .05, ih + h * .245);
    c.textAlign = 'right'; c.fillStyle = '#d0582b'; c.font = `bold ${Math.round(h * .075)}px system-ui, sans-serif`;
    c.fillText(word, w * .95, ih + h * .245);
  };
}
function sceneSky(c, w, h, top, low) {
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, low);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}
function frond(c, x, y, angle, len, width, colour) {
  c.save(); c.translate(x, y); c.rotate(angle); c.fillStyle = colour;
  c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(width, len * .5, 0, len); c.quadraticCurveTo(-width, len * .5, 0, 0); c.fill();
  c.restore();
}
function sceneCartagena(c, w, h) {
  sceneSky(c, w, h, '#3d9be0', '#bfe6f7');
  c.fillStyle = '#ffd24a'; c.beginPath(); c.arc(w * .82, h * .22, h * .11, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1f8fc4'; c.fillRect(0, h * .6, w, h * .4);
  c.fillStyle = '#65c3e6';
  for (let i = 0; i < 16; i++) c.fillRect(w * ((i * .37) % 1), h * (.66 + ((i * .53) % 1) * .28), w * .05, h * .012);
  // Coloured colonial houses with wooden balconies along the waterfront.
  const hw = w * .11;
  ['#f7c948', '#e8703a', '#3fae8e', '#e95f8c', '#f39a3d', '#5b8fd8'].forEach((colour, i) => {
    const x = w * .02 + i * hw * 1.02, top = h * (.3 + (i % 3) * .04);
    c.fillStyle = colour; c.fillRect(x, top, hw, h * .6 - top);
    c.fillStyle = '#b85a2a'; c.fillRect(x - hw * .04, top - h * .03, hw * 1.08, h * .035);
    c.fillStyle = '#ffffff';
    for (const wy of [.06, .3]) { c.fillRect(x + hw * .18, top + h * wy, hw * .24, h * .09); c.fillRect(x + hw * .58, top + h * wy, hw * .24, h * .09); }
    c.fillStyle = '#7a4a26'; c.fillRect(x + hw * .08, top + h * .15, hw * .84, h * .025);
  });
  c.strokeStyle = '#8a6a45'; c.lineWidth = w * .012; c.lineCap = 'round';
  c.beginPath(); c.moveTo(w * .76, h * .64); c.quadraticCurveTo(w * .8, h * .45, w * .78, h * .3); c.stroke();
  for (let k = 0; k < 7; k++) frond(c, w * .78, h * .3, -Math.PI * .45 + k * Math.PI * .3 - Math.PI / 2, h * .24, w * .03, k % 2 ? '#3f9a45' : '#2f7f3a');
}
function sceneMexico(c, w, h) {
  sceneSky(c, w, h, '#f39a3d', '#ffe3a8');
  c.fillStyle = '#fff4d0'; c.beginPath(); c.arc(w * .2, h * .3, h * .12, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#e9b86a'; c.fillRect(0, h * .78, w, h * .22);
  // Stepped pyramid with a central stair and a temple on top.
  const steps = 5, bw = w * .56, cx = w * .58, baseY = h * .8, sh = h * .09;
  for (let i = 0; i < steps; i++) {
    const sw = bw * (1 - i * .16);
    c.fillStyle = i % 2 ? '#b98a55' : '#a87a48'; c.fillRect(cx - sw / 2, baseY - (i + 1) * sh, sw, sh);
  }
  c.fillStyle = '#8c6238'; c.fillRect(cx - bw * .07, baseY - steps * sh, bw * .14, steps * sh);
  c.fillStyle = '#a87a48'; c.fillRect(cx - bw * .12, baseY - steps * sh - h * .1, bw * .24, h * .1);
  c.fillStyle = '#5a3b1f'; c.fillRect(cx - bw * .04, baseY - steps * sh - h * .07, bw * .08, h * .07);
  // Cactus: trunk and two arms.
  c.fillStyle = '#3f9a45';
  const stem = (x, y, sw, sh2) => { c.beginPath(); c.roundRect(x, y, sw, sh2, sw / 2); c.fill(); };
  stem(w * .12, h * .5, w * .035, h * .32);
  stem(w * .08, h * .56, w * .028, h * .14); stem(w * .08, h * .66, w * .06, h * .028);
  stem(w * .165, h * .6, w * .028, h * .1); stem(w * .145, h * .67, w * .05, h * .028);
}
const POSTERS = [
  drawPoster('Descubre Cartagena', 'Colombia', 'el mar · the sea', sceneCartagena),
  drawPoster('Visita México', 'Teotihuacán', 'la pirámide · the pyramid', sceneMexico),
];
function drawVending(c, w, h) {
  c.fillStyle = '#c8322f'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.font = `bold ${Math.round(w * .12)}px system-ui, sans-serif`;
  c.fillText('Bebidas', w * .38, h * .075);
  // Window with shelves of bottles and cans.
  const gx = w * .06, gy = h * .1, gw = w * .64, gh = h * .66;
  c.fillStyle = '#dff1fb'; c.fillRect(gx, gy, gw, gh);
  const colours = ['#2f7fd0', '#f2b53a', '#3fae5a', '#e05a4a', '#ffffff'];
  for (let row = 0; row < 5; row++) {
    const y = gy + gh * (.05 + row * .19);
    for (let i = 0; i < 5; i++) {
      const x = gx + gw * (.06 + i * .19);
      c.fillStyle = colours[(row + i) % colours.length]; c.fillRect(x, y, gw * .12, gh * .13);
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x, y, gw * .12, gh * .025);
    }
    c.fillStyle = '#9aa7b2'; c.fillRect(gx, y + gh * .14, gw, gh * .01);
  }
  // Keypad, display, coin slot and delivery hatch.
  c.fillStyle = '#22303d'; c.fillRect(w * .76, h * .12, w * .19, h * .08);
  c.fillStyle = '#7fe08a'; c.fillRect(w * .78, h * .14, w * .15, h * .04);
  c.fillStyle = '#e8e8e8';
  for (let i = 0; i < 9; i++) c.fillRect(w * (.775 + (i % 3) * .06), h * (.24 + Math.floor(i / 3) * .045), w * .045, h * .032);
  c.fillStyle = '#22303d'; c.fillRect(w * .82, h * .4, w * .07, h * .012);
  c.fillRect(w * .1, h * .82, w * .56, h * .1);
}
function drawCashATM(c, w, h) {
  c.fillStyle = '#d9dee3'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#17427c'; c.fillRect(0, 0, w, h * .14);
  c.textAlign = 'center';
  c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(w * .12)}px system-ui, sans-serif`; c.fillText('Cajero', w / 2, h * .065);
  c.fillStyle = '#f7c948'; c.font = `600 ${Math.round(w * .09)}px system-ui, sans-serif`; c.fillText('ATM', w / 2, h * .115);
  c.fillStyle = '#22303d'; c.fillRect(w * .12, h * .2, w * .76, h * .24);
  c.fillStyle = '#2f7fd0'; c.fillRect(w * .15, h * .22, w * .7, h * .2);
  c.fillStyle = '#ffffff'; c.font = `600 ${Math.round(w * .07)}px system-ui, sans-serif`;
  c.fillText('Retirar dinero', w / 2, h * .3); c.fillText('Withdraw cash', w / 2, h * .36);
  c.fillStyle = '#9aa7b2'; c.fillRect(w * .1, h * .48, w * .8, h * .2);
  c.fillStyle = '#f4f4f4';
  for (let i = 0; i < 12; i++) c.fillRect(w * (.2 + (i % 3) * .14), h * (.5 + Math.floor(i / 3) * .042), w * .1, h * .032);
  c.fillStyle = '#22303d'; c.fillRect(w * .66, h * .52, w * .16, h * .012);   // card slot
  c.fillRect(w * .2, h * .74, w * .6, h * .03);                               // cash slot
}
// Clerestory sky, seen as if infinitely far: gradient by view elevation, and a
// cloud layer projected on a plane overhead that drifts with the wind. Only
// sky shows, since the sill is above eye height. Colours follow the ambience.
function createSkyMaterial(scope) {
  const clouds = scope.own(new T.CanvasTexture((() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    drawCloudLayer(canvas.getContext('2d'), 512, 512); return canvas;
  })()));
  clouds.wrapS = clouds.wrapT = T.RepeatWrapping;
  const material = scope.own(new T.ShaderMaterial({
    uniforms: {
      uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uLow: { value: new T.Color() },
      uCloud: { value: new T.Color() }, uBelly: { value: new T.Color() },
      uClouds: { value: clouds }, uScale: { value: C.sky.cloudScale }, uDrift: { value: 0 },
    },
    vertexShader: 'varying vec3 vWorld; void main() { vec4 p = modelMatrix * vec4(position, 1.0); vWorld = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }',
    fragmentShader: `uniform vec3 uTop, uMid, uLow, uCloud, uBelly; uniform sampler2D uClouds; uniform float uScale, uDrift; varying vec3 vWorld;
      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float e = max(dir.y, 0.0);
        vec3 col = mix(uMid, uTop, smoothstep(0.1, 0.7, e));
        col = mix(uLow, col, smoothstep(0.0, 0.12, e));
        vec4 t = texture2D(uClouds, dir.xz / max(dir.y, 0.04) * uScale + vec2(uDrift, 0.0));
        float cover = smoothstep(0.35, 0.6, t.a) * smoothstep(0.06, 0.2, e);
        float crown = smoothstep(0.4, 0.6, t.r / max(t.a, 0.001));
        col = mix(col, mix(uBelly, uCloud, crown), cover);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  const u = material.uniforms;
  scope.defer(luz.alCambiar(A => {
    u.uTop.value.set(A.cielo[0]); u.uMid.value.set(A.cielo[1]); u.uLow.value.set(A.cielo[2]);
    u.uCloud.value.set(A.nubes); u.uBelly.value.set(A.nubes).lerp(new T.Color(A.cielo[1]), .55);
  }));
  return material;
}
function drawPlant(c, w, h) {
  let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 26; k++) {
    const a = -Math.PI / 2 + (r() - .5) * 2.6, len = h * (.45 + r() * .5), bx = w / 2, by = h;
    c.fillStyle = ['#2f8a3c', '#46a846', '#6cc04a', '#2a7534'][k % 4];
    c.save(); c.translate(bx, by); c.rotate(a + Math.PI / 2);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(w * .12, -len * .55, 0, -len); c.quadraticCurveTo(-w * .12, -len * .55, 0, 0); c.fill();
    c.strokeStyle = 'rgba(20,70,30,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -len * .95); c.stroke();
    c.restore();
  }
}

export function buildCheckinHall(meta, { scope, kit, group, interactive, colliders, worldPosition }) {
  const { width: w, depth: d } = meta, H = DIMENSIONS.ceiling;
  const materials = { ...kit.materials };
  for (const [key, color] of Object.entries({ ...PALETTE, ...EXTRA })) materials[key] = scope.own(crearMaterialToon({ color: hex(color), bandas: 3 }));
  const hall = { ...kit, materials, outline: (color, level) => kit.outline(PALETTE[color] ?? EXTRA[color] ?? color, level) };
  const vol = (color, transforms, geometry) => boxes(scope, hall, group, color, transforms, geometry);
  const offset = new T.Vector3(worldPosition.x, 0, worldPosition.z);
  const solid = (x0, z0, x1, z1) => colliders.push(new T.Box3(new T.Vector3(x0, 0, z0).add(offset), new T.Vector3(x1, 2, z1).add(offset)));
  const painted = (width, height, pixelsWide, draw, cutout = false, tint = 'cartel') => {
    const map = scope.own(canvasTexture(pixelsWide, Math.round(pixelsWide * height / width), draw));
    const material = scope.own(new T.MeshBasicMaterial({ map, transparent: cutout, alphaTest: cutout ? .5 : 0, side: cutout ? T.DoubleSide : T.FrontSide }));
    scope.defer(luz.tintar(material, tint));
    const mesh = new T.Mesh(scope.own(new T.PlaneGeometry(width, height)), material);
    group.add(mesh); scope.defer(() => mesh.removeFromParent());
    return mesh;
  };
  // Wall faces (the shell walls are .18 thick, centred on the room edge).
  const back = -d / 2 + .09, south = d / 2 - .09, east = w / 2 - .09;
  const halfOpening = DIMENSIONS.portalWidth / 2 + .1, doorTop = DIMENSIONS.doorHeight + .1;

  // --- North: counters wall -------------------------------------------------
  const rowHalf = (C.counters - 1) * C.pitch / 2 + C.deskWidth / 2;
  const woodX = rowHalf + .4, pil = C.wood.pilaster;
  vol('hallWall', [[0, H / 2, back + .01, w, H, .02]]);
  vol('woodWarm', [[0, C.wood.height / 2, back + .05, 2 * woodX, C.wood.height, .06]]);
  const grooves = [];
  for (let i = 0; i <= C.counters; i++) grooves.push([(i - C.counters / 2) * C.pitch, C.wood.height / 2, back + .083, .025, C.wood.height, .01]);
  vol('woodGroove', grooves);
  vol('white', [-1, 1].map(s => [s * (woodX + pil / 2), H / 2, back + .2, pil, H, .4]));
  // Soffit over the agents with warm downlights, navy fascia on its front.
  const front = C.deskZ + C.canopy.overhang, canopyD = front - back, cy = C.canopy.y + C.canopy.thickness / 2;
  vol('soffit', [[0, cy, (back + front) / 2, 2 * woodX, C.canopy.thickness, canopyD]]);
  vol('warmLight', Array.from({ length: C.counters }, (_, i) => [(i - (C.counters - 1) / 2) * C.pitch, C.canopy.y - .01, (C.deskZ + back) / 2, .34, .02, .34]));
  const fasciaY = C.canopy.y + C.canopy.fascia / 2;
  vol('hallNavy', [[0, fasciaY, front - .06, 2 * woodX, C.canopy.fascia, .12]]);
  vol('gold', [[0, C.canopy.y + .02, front + .005, 2 * woodX, .04, .02]]);
  const fasciaW = Math.min(9, 2 * woodX);
  painted(fasciaW, C.canopy.fascia - .02, 2048, drawFascia).position.set(-woodX + fasciaW / 2, fasciaY, front + .002);
  // Departures board hanging under the soffit, over the first counters.
  const f = C.fids, fy = C.canopy.y - .12 - f.height / 2;
  vol('bezel', [[f.x, fy, front - .3, f.width + .1, f.height + .1, .1]]);
  vol('steelDark', [-1, 1].map(s => [f.x + s * f.width * .35, (fy + f.height / 2 + C.canopy.y) / 2, front - .3, .04, C.canopy.y - fy - f.height / 2, .04]));
  const board = painted(f.width, f.height, 1024, drawDepartures);
  board.position.set(f.x, fy, front - .245);
  board.userData = { semanticId: 'airport.gate.flightBoard', interactionType: 'inspect', zoneId: meta.id }; interactive.push(board);
  // Numbered sign on a post at the left end of each counter.
  const n = C.numberSign, deskTop = 1.14;
  for (let i = 0; i < C.counters; i++) {
    const x = (i - (C.counters - 1) / 2) * C.pitch - C.deskWidth / 2 + .28;
    vol('steelDark', [[x, (deskTop + n.y - n.size / 2) / 2, C.deskZ - .2, .04, n.y - n.size / 2 - deskTop, .04]]);
    painted(n.size, n.size, 128, drawNumber(i + 1)).position.set(x, n.y, C.deskZ - .18);
  }

  // --- South: clerestory of sky over a solid wall, between white piers --------
  const g = C.glazing, pw = C.pillar.width, pd = C.pillar.depth;
  const glassH = g.top - g.sill, glassY = (g.sill + g.top) / 2;
  // Same glass as the D00 facade clerestory (createClerestoryGlass): from the
  // room outwards, blue multiply filter → baked reflections → the sky behind.
  // The reflection texture repeats so each copy spans about what it does in D00.
  const skyMaterial = createSkyMaterial(scope);
  const { reflections, filter } = createClerestoryGlass(scope);
  reflections.map.wrapS = T.RepeatWrapping; reflections.map.repeat.x = Math.max(1, Math.round(w / CLERESTORY_GLASS_SPAN));
  const glassGeometry = scope.own(new T.PlaneGeometry(w, glassH));
  for (const [material, inset] of [[reflections, .015], [filter, .025]]) {
    const layer = new T.Mesh(glassGeometry, material);
    layer.position.set(0, glassY, south - inset); layer.rotation.y = Math.PI;   // faces the room
    group.add(layer); scope.defer(() => layer.removeFromParent());
  }
  // The sky is a box far beyond the glass (the shell wall is open over this
  // band, AirportChunk.js), so it sits at depth behind the pane.
  skyMaterial.side = T.DoubleSide;
  const S = C.sky, far = south + S.distance, half = w / 2 + S.margin;
  for (const [pw2, ph, x, y, z, rx, ry] of [
    [2 * half, S.height, 0, S.height / 2, far, 0, 0],                               // far wall
    [2 * half, S.distance, 0, S.height, (south + far) / 2, Math.PI / 2, 0],         // top
    ...[-1, 1].map(s => [S.distance, S.height, s * half, S.height / 2, (south + far) / 2, 0, Math.PI / 2]),   // sides
  ]) {
    const face = new T.Mesh(scope.own(new T.PlaneGeometry(pw2, ph)), skyMaterial);
    face.position.set(x, y, z); face.rotation.set(rx, ry, 0);
    group.add(face); scope.defer(() => face.removeFromParent());
  }
  vol('hallWall', [[0, (g.top + H) / 2 + .1, south - .01, w, H - g.top - .2, .02], [0, g.sill / 2, south - .01, w, g.sill, .02]]);
  const mullions = [[0, g.top + .05, south - .05, w, .12, .1], [0, g.sill + .03, south - .05, w, .06, .1]];
  const xs = [-w / 2, ...C.pillarsX, w / 2];
  for (let i = 0; i < xs.length - 1; i++) mullions.push([(xs[i] + xs[i + 1]) / 2, glassY, south - .05, .06, glassH, .08]);
  vol('mullion', mullions);
  vol('white', [[0, g.sill - .04, south - .08, w, .08, .16]]);          // sill ledge under the glass
  vol('panelJoint', [[0, .06, south - .02, w, .12, .04]]);              // skirting
  vol('white', C.pillarsX.map(x => [x, H / 2, south - pd / 2, pw, H, pd]));
  for (const x of C.pillarsX) solid(x - pw / 2, south - pd, x + pw / 2, south);

  // Wall bays under the sill (routes.js CHECKIN.southBays): backlit posters,
  // benches with a plant, and a services bay (drinks machine + cash machine).
  // Everything stands with its back on the wall face.
  const plantXs = [(xs[0] + xs[1]) / 2, (xs.at(-2) + xs.at(-1)) / 2];   // narrow end bays
  const potH = .62, potD = .6, plantH = 1.5;
  let posterIndex = 0;
  C.southBays.forEach((kind, i) => {
    const x = (C.pillarsX[i] + C.pillarsX[i + 1]) / 2;
    if (kind === 'anuncio') {
      const L = C.lightbox;
      vol('hallNavy', [[x, L.y, south - L.depth / 2, L.width + 2 * L.frame, L.height + 2 * L.frame, L.depth]]);
      const poster = painted(L.width, L.height, 1024, POSTERS[posterIndex++ % POSTERS.length]);
      poster.position.set(x, L.y, south - L.depth - .003); poster.rotation.y = Math.PI;
      poster.userData = { semanticId: 'airport.checkin.poster', interactionType: 'inspect', zoneId: meta.id }; interactive.push(poster);
    } else if (kind === 'bancos') {
      // Three-seat bench (as in D00), facing the room, with a plant at its east end.
      const B = C.bench, bx = x + B.shift, benchW = B.seats * B.pitch, backZ = south - .045, seatZ = south - .07 - .25;
      const seatXs = Array.from({ length: B.seats }, (_, k) => bx + (k - (B.seats - 1) / 2) * B.pitch);
      vol('hallSeat', [...seatXs.map(sx => [sx, .46, seatZ, .6, .08, .5]), ...seatXs.map(sx => [sx, .8, backZ, .6, .5, .07])]);
      const arms = Array.from({ length: B.seats + 1 }, (_, k) => bx + (k - B.seats / 2) * B.pitch);
      vol('steel', [
        [bx, .37, seatZ, benchW + .1, .06, .08],
        ...arms.flatMap(ax => [[ax, .58, seatZ - .12, .04, .2, .04], [ax, .69, seatZ, .05, .04, .44]]),
        ...[-1, 1].flatMap(s => [
          [bx + s * benchW / 2, .18, seatZ - .2, .05, .36, .05], [bx + s * benchW / 2, .18, seatZ + .2, .05, .36, .05],
          [bx + s * benchW / 2, .015, seatZ, .06, .03, .56],
        ]),
      ]);
      solid(bx - benchW / 2 - .05, seatZ - .3, bx + benchW / 2 + .05, south);
      plantXs.push(bx + benchW / 2 + .15 + potD / 2);
    } else if (kind === 'servicios') {
      const S = C.services, [vw, vh, vd] = S.vending, [aw, ah, ad] = S.atm;
      const x0 = x - (vw + S.gap + aw) / 2, vx = x0 + vw / 2, ax = x0 + vw + S.gap + aw / 2;
      vol('hallNavy', [[vx, vh / 2, south - vd / 2, vw, vh, vd]]);
      vol('kiosk', [[ax, ah / 2, south - ad / 2, aw, ah, ad]]);
      for (const [px, pw2, ph, pdp, draw, id] of [[vx, vw, vh, vd, drawVending, 'airport.checkin.vending'], [ax, aw, ah, ad, drawCashATM, 'airport.checkin.atm']]) {
        const face = painted(pw2 - .06, ph - .06, 512, draw);
        face.position.set(px, ph / 2, south - pdp - .003); face.rotation.y = Math.PI;
        face.userData = { semanticId: id, interactionType: 'inspect', zoneId: meta.id }; interactive.push(face);
        solid(px - pw2 / 2, south - pdp, px + pw2 / 2, south);
      }
    }
  });
  const hs = C.hangingSign, hx = C.pillarsX[hs.pillar], hz = south - pd - .04;
  vol('hallNavy', [[hx, hs.y, hz, hs.width, hs.height, .06]]);
  const hanging = painted(hs.width - .04, hs.height - .04, 256, drawHanging);
  hanging.position.set(hx, hs.y, hz - .031); hanging.rotation.y = Math.PI;

  // --- East: end wall with glass doors to security -----------------------------
  const ez = meta.openings.east;
  vol('hallWall', [
    [east - .01, H / 2, (-d / 2 + ez - halfOpening) / 2, .02, H, ez - halfOpening + d / 2],
    [east - .01, H / 2, (ez + halfOpening + d / 2) / 2, .02, H, d / 2 - ez - halfOpening],
    [east - .01, (doorTop + H) / 2, ez, .02, H - doorTop, 2 * halfOpening],
  ]);
  vol('panelJoint', [-5, -2.6, 2.6, 5].map(z => [east - .025, H / 2, ez + z, .01, H, .03]));
  vol('mullion', [[east - .05, DIMENSIONS.doorHeight + .02, ez, .1, .1, 2 * halfOpening],
    [east - .05, DIMENSIONS.doorHeight / 2, ez - halfOpening + .05, .1, DIMENSIONS.doorHeight, .1],
    [east - .05, DIMENSIONS.doorHeight / 2, ez + halfOpening - .05, .1, DIMENSIONS.doorHeight, .1]]);
  for (const s of [-1, 1]) {   // leaves slid half open: the centre stays walkable
    const leaf = new T.Mesh(scope.own(new T.PlaneGeometry(1.1, DIMENSIONS.doorHeight - .05)), kit.glass);
    leaf.position.set(east - .08, DIMENSIONS.doorHeight / 2, ez + s * (halfOpening - .6)); leaf.rotation.y = -Math.PI / 2;
    group.add(leaf); scope.defer(() => leaf.removeFromParent());
    vol('mullion', [[east - .08, DIMENSIONS.doorHeight / 2, ez + s * (halfOpening - .6 - .55), .05, DIMENSIONS.doorHeight - .05, .05]]);
  }
  const es = C.endDoor.sign;
  vol('hallNavy', [[east - .1, es.y, ez, .14, es.height, es.width]]);
  const endSign = painted(es.width, es.height, 1024, (c, a, b) => drawHallSign(c, a, b, { glyph: 'plane', title: 'SEGURIDAD', subtitle: 'Embarque · Departures' }));
  endSign.position.set(east - .175, es.y, ez); endSign.rotation.y = -Math.PI / 2;

  // --- Potted plants: white pots, crossed painted leaves ----------------------
  const spots = [...plantXs.map(x => [x, C.plantZ]), ...[-1, 1].map(s => [east - .55, ez + s * C.endDoor.plantZ])];
  for (const [x, z] of spots) {
    plantar(scope, x, z);   // planta tropical GLB (TropicalPlants.js)
    solid(x - potD / 2, z - potD / 2, x + potD / 2, z + potD / 2);
  }
  // Clouds drift slowly with the wind across the clerestory sky.
  return { update(dt) { skyMaterial.uniforms.uDrift.value = (skyMaterial.uniforms.uDrift.value + dt * C.sky.wind) % 1; } };
}
