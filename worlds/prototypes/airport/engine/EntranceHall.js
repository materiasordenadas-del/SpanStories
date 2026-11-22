import * as T from './three.js';
import { boxes } from './ThreeResources.js';
import { luz, crearMaterialToon, contornoDe } from './Luz25D.js';
import { DIMENSIONS, ENTRANCE_HALL as E } from './routes.js';
import { createGlossyFloor, REFLECT_LAYER } from './GlossyFloor.js';
import { plantar } from './TropicalPlants.js';

// D00 · Entrada, inside: the hall of the reference illustration. Back wall
// (north) with the navy sign band, the information desk on warm wood panelling,
// a three-seat bench, a bin and the flight-information totem; the check-in sign
// over the east opening. No plants (by request). All positions: routes.js
// ENTRANCE_HALL; everything else is derived from the wall faces.

// Interior palette of the reference (warmer than the shared kit).
export const PALETTE = {
  hallWall: 0xd8c8b6, panelJoint: 0xd8c7aa, woodWarm: 0xc4772c, woodGroove: 0xb36c2a,
  hallNavy: 0x1d4a86, bandBlue: 0x073a75, gold: 0xf0b43c, counter: 0xf2ebdd, steel: 0xb9c0c6, steelDark: 0x7d878f,
  hallSeat: 0x1f447e, kiosk: 0xc9ced3, bezel: 0x22303d,
  metalTrim: 0x918d88, skirting: 0x55585c,
  binSteel: 0xb9c0c6, binLid: 0x262b31, recycleBlue: 0x1f5fae, wasteGrey: 0x6e7378,
};
export const hex = value => `#${value.toString(16).padStart(6, '0')}`;

export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new T.CanvasTexture(canvas); texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
  return texture;
}

// --- Illustrated faces (not relit: tinted by the ambience) ----------------
function drawInfoGlyph(c, x, y, r, disc = '#ffffff', letter = '#17427c') {
  c.fillStyle = disc; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  c.fillStyle = letter;
  c.beginPath(); c.arc(x, y - r * .5, r * .16, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.roundRect(x - r * .15, y - r * .22, r * .3, r * .8, r * .06); c.fill();
  c.fillRect(x - r * .3, y + r * .5, r * .6, r * .12);
}
export function drawPlaneGlyph(c, x, y, size) {
  c.save(); c.translate(x, y); c.rotate(-Math.PI / 4); c.scale(size / 160, size / 160); c.fillStyle = '#ffffff';
  c.beginPath(); c.ellipse(0, 0, 78, 12, 0, 0, Math.PI * 2); c.fill();
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(20, 0); c.lineTo(-12, s * 72); c.lineTo(-32, s * 72); c.lineTo(-18, 0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-52, 0); c.lineTo(-66, s * 30); c.lineTo(-80, s * 30); c.lineTo(-74, 0); c.closePath(); c.fill();
  }
  c.restore();
}
export function drawBagGlyph(c, x, y, size) {
  const w = size * .9, h = size * .7;
  c.strokeStyle = '#ffffff'; c.lineWidth = size * .08;
  c.beginPath(); c.roundRect(x - w * .2, y - h / 2 - size * .16, w * .4, size * .22, size * .06); c.stroke();
  c.fillStyle = '#ffffff'; c.beginPath(); c.roundRect(x - w / 2, y - h / 2, w, h, size * .1); c.fill();
  c.fillStyle = '#17427c';
  for (const dx of [-.22, .22]) c.fillRect(x + dx * w - size * .035, y - h / 2, size * .07, h);
}
export function drawArrow(c, x, y, size) {
  c.strokeStyle = '#ffffff'; c.lineWidth = size * .16; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x - size / 2, y); c.lineTo(x + size / 2, y);
  c.moveTo(x + size * .05, y - size * .45); c.lineTo(x + size / 2, y); c.lineTo(x + size * .05, y + size * .45); c.stroke();
}
// Navy sign, gold foot strip, white glyph + title, yellow English subtitle.
export function drawHallSign(c, w, h, { glyph, title, subtitle, arrow }) {
  c.fillStyle = '#17427c'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f2b53a'; c.fillRect(0, h * .9, w, h * .1);
  const cy = h * .45, gx = h * .5;
  if (glyph === 'info') drawInfoGlyph(c, gx, cy, h * .26);
  if (glyph === 'plane') drawPlaneGlyph(c, gx, cy, h * .62);
  if (glyph === 'bag') drawBagGlyph(c, gx, cy, h * .5);
  const tx = gx + h * .42, room = w - tx - (arrow ? h * .9 : h * .25);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#ffffff'; c.font = `bold ${Math.round(h * .3)}px system-ui, sans-serif`; c.fillText(title, tx, cy + h * .02, room);
  c.fillStyle = '#f7c948'; c.font = `600 ${Math.round(h * .21)}px system-ui, sans-serif`; c.fillText(subtitle, tx, cy + h * .29, room);
  if (arrow) drawArrow(c, w - h * .5, cy, h * .4);
}
function drawPoster(c, w, h) {
  c.fillStyle = '#17427c'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#2d5d9c'; c.lineWidth = 6; c.strokeRect(8, 8, w - 16, h - 16);
  drawInfoGlyph(c, w / 2, h * .17, w * .2);
  c.fillStyle = '#ffffff';
  for (let i = 0; i < 7; i++) c.fillRect(w * .18, h * (.38 + i * .065), w * (i % 3 === 2 ? .45 : .64), h * .022);
  c.fillStyle = '#f2b53a'; c.fillRect(w * .18, h * .86, w * .64, h * .02);
}
function drawBadge(c, w, h) { drawInfoGlyph(c, w / 2, h / 2, w * .46); }
function drawFlightScreen(c, w, h) {
  c.fillStyle = '#1f66cf'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#184f9f'; c.fillRect(0, 0, w, h * .1);
  for (const x of [.2, .5, .8]) drawPlaneGlyph(c, w * x, h * .05, h * .065);
  const rows = 11;
  for (let i = 0; i < rows; i++) {
    const y = h * (.15 + i * .076);
    c.fillStyle = i % 4 === 1 ? '#f7c948' : '#ffffff'; c.fillRect(w * .08, y, w * .1, h * .016);
    c.fillStyle = '#ffffff'; c.fillRect(w * .22, y, w * (.28 + (i * 37 % 5) * .03), h * .016);
    c.fillStyle = '#4fd0e8'; c.fillRect(w * .66, y, w * (.2 + (i * 13 % 3) * .03), h * .016);
  }
}
// Entrance mat: navy with a fine fleck (albedo only, relit by the scene light).
function drawMat(c, w, h) {
  c.fillStyle = '#1b3f78'; c.fillRect(0, 0, w, h);
  let s = 7; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    c.fillStyle = rand() > .5 ? 'rgba(70,110,170,.45)' : 'rgba(10,30,70,.35)';
    c.fillRect(rand() * w, rand() * h, 2, 2);
  }
  c.strokeStyle = '#142f5c'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, h - 6);
}
// Sun through the west glazing: one skewed patch per bay (the transom splits
// it), fading away from the wall. Canvas x = metres from the wall, y = z.
function drawWestSun(c, w, h, bays) {
  const bay = h / bays;
  c.fillStyle = '#ffffff';
  for (let i = 0; i < bays; i++) for (const [a, b] of [[.04, .42], [.5, .96]]) {
    const y0 = i * bay + bay * .08, y1 = (i + 1) * bay - bay * .08, shift = -bay * .35;
    c.beginPath();
    c.moveTo(w * a, y0 + shift * a); c.lineTo(w * b, y0 + shift * b);
    c.lineTo(w * b, y1 + shift * b); c.lineTo(w * a, y1 + shift * a); c.closePath(); c.fill();
  }
  const fade = c.createLinearGradient(0, 0, w, 0);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-out'; c.fillStyle = fade; c.fillRect(0, 0, w, h);
}
// Back wall of the reference: cream architectural panels with a warm sun wash
// from the west glazing, a warm LED wall-wash under the navy cornice, hairline
// plate joints and soft shading under the ceiling. The metal battens are real
// geometry (see buildEntranceHall), not part of this texture.
// Canvas x maps westM..eastM (metres), y maps top..bottom of the H-metre wall.
function drawBackWall(c, w, h, westM, eastM, washTopM) {
  c.fillStyle = '#d8c8b6'; c.fillRect(0, 0, w, h);
  const sun = c.createLinearGradient(0, 0, w * .62, 0);
  sun.addColorStop(0, 'rgba(255,186,102,.26)'); sun.addColorStop(.45, 'rgba(255,196,130,.12)'); sun.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sun; c.fillRect(0, 0, w, h);
  const top = c.createLinearGradient(0, 0, 0, h * .05);
  top.addColorStop(0, 'rgba(95,72,50,.18)'); top.addColorStop(1, 'rgba(95,72,50,0)');
  c.fillStyle = top; c.fillRect(0, 0, w, h * .05);
  // Warm LED wall-wash under the cornice: intense amber in the first ~30 cm,
  // relaxing over ~80 cm (reference: hidden linear LED, 2800–3200 K). Painted
  // soft here; real scene lamps under the band add the physical gradient.
  const wy = m => h * (1 - m / DIMENSIONS.ceiling);
  const y0 = wy(washTopM), y1 = wy(washTopM - .8);
  const wash = c.createLinearGradient(0, y0, 0, y1);
  wash.addColorStop(0, 'rgba(255,186,84,.52)');
  wash.addColorStop(.35, 'rgba(255,196,110,.28)');
  wash.addColorStop(1, 'rgba(255,205,130,0)');
  c.fillStyle = wash; c.fillRect(0, y0, w, y1 - y0);
  // Hairline joints between the plates (1–2 mm): a thin grey-beige line with
  // a whisper of cast shadow to its right — deeper where the metal batten
  // stands proud of the panel and throws its fine lateral shade.
  const jx = m => (m - westM) / (eastM - westM) * w;
  for (const m of E.panelJoints) {
    const x = jx(m);
    c.fillStyle = 'rgba(150,132,108,.55)'; c.fillRect(x - 1, 0, 2, h);
    const g = c.createLinearGradient(x + 1, 0, x + w * .014, 0);
    g.addColorStop(0, 'rgba(105,85,62,.24)'); g.addColorStop(1, 'rgba(105,85,62,0)');
    c.fillStyle = g; c.fillRect(x + 1, 0, w * .014, h);
  }
}
// Brushed stainless steel for the cylindrical bin: cool base with soft vertical
// streaks and a brighter band, so the body reads as satin metal (not chrome).
function binSteelTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, 128);
  base.addColorStop(0, '#c2c9cf'); base.addColorStop(.5, '#aeb6bd'); base.addColorStop(1, '#99a1a9');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(18, 0, 5, 128); g.fillRect(40, 0, 2, 128);
  g.fillStyle = 'rgba(255,255,255,.08)';
  for (const x of [6, 27, 33, 52, 58]) g.fillRect(x, 0, 1, 128);
  g.fillStyle = 'rgba(50,58,66,.20)'; g.fillRect(0, 0, 3, 128); g.fillRect(61, 0, 3, 128);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter;
  return t;
}
// Front illustration of one recycling-station module: white icon + label on a
// soft sheen that lets the body colour show through (the body is the colour code).
function drawStationFace(kind) {
  return (c, w, h) => {
    const sheen = c.createLinearGradient(0, 0, 0, h);
    sheen.addColorStop(0, 'rgba(255,255,255,.16)'); sheen.addColorStop(.4, 'rgba(255,255,255,.02)'); sheen.addColorStop(1, 'rgba(0,0,0,.18)');
    c.fillStyle = sheen; c.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * .38, R = w * .26;
    c.strokeStyle = '#ffffff'; c.fillStyle = '#ffffff'; c.lineWidth = w * .045; c.lineJoin = 'round'; c.lineCap = 'round';
    if (kind === 'recycle') {
      // Three chasing arrows as a triangle of chevrons.
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + k * 2 * Math.PI / 3;
        c.save(); c.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.rotate(a + Math.PI / 2);
        c.beginPath(); c.moveTo(0, -R * .42); c.lineTo(R * .34, R * .18); c.lineTo(R * .1, R * .18);
        c.lineTo(R * .1, R * .44); c.lineTo(-R * .1, R * .44); c.lineTo(-R * .1, R * .18); c.lineTo(-R * .34, R * .18);
        c.closePath(); c.fill(); c.restore();
      }
    } else {
      // General waste: bin silhouette with a lid and handle.
      c.beginPath(); c.roundRect(cx - R * .62, cy - R * .55, R * 1.24, R * .18, R * .07); c.fill();
      c.fillRect(cx - R * .12, cy - R * .72, R * .24, R * .14);
      c.beginPath(); c.moveTo(cx - R * .48, cy - R * .3); c.lineTo(cx + R * .48, cy - R * .3);
      c.lineTo(cx + R * .38, cy + R * .72); c.lineTo(cx - R * .38, cy + R * .72); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,.22)';
      for (const dx of [-.24, 0, .24]) c.fillRect(cx + dx * R - R * .045, cy - R * .18, R * .09, R * .78);
    }
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.font = `bold ${Math.round(w * .105)}px system-ui, sans-serif`;
    c.fillText(kind === 'recycle' ? 'RECICLAJE' : 'RESIDUOS', cx, h * .78, w * .9);
    c.font = `600 ${Math.round(w * .07)}px system-ui, sans-serif`;
    c.globalAlpha = .85; c.fillText(kind === 'recycle' ? 'recycling' : 'general waste', cx, h * .86, w * .9); c.globalAlpha = 1;
  };
}
// Anodized-aluminium battens: a soft vertical sheen (brighter toward the light
// from above), darker edges and faint brushed streaks, so the profile reads as
// metal and catches an edge highlight instead of a flat grey stripe.
function battenTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0, '#a39f9a'); base.addColorStop(.45, '#918d88'); base.addColorStop(1, '#847f79');
  g.fillStyle = base; g.fillRect(0, 0, 64, 256);
  const edge = g.createLinearGradient(0, 0, 64, 0);
  edge.addColorStop(0, 'rgba(60,56,52,.5)'); edge.addColorStop(.12, 'rgba(60,56,52,0)');
  edge.addColorStop(.88, 'rgba(60,56,52,0)'); edge.addColorStop(1, 'rgba(60,56,52,.45)');
  g.fillStyle = edge; g.fillRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(255,255,255,.20)'; g.fillRect(13, 0, 3, 256);
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(41, 0, 5, 256);
  g.fillStyle = 'rgba(255,255,255,.07)';
  for (const x of [7, 22, 34, 52]) g.fillRect(x, 0, 1, 256);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter;
  return t;
}
// Wood panelling behind the information desk (reference: clean stained-oak
// veneer, honey/orange #C4772C up to #DF913D where the light hits). Soft
// vertical grain, a fine rectangular grid, and the big diagonal shadow cast
// by the strong light from the west glazing. Canvas x = wood0..wood1 (m),
// y maps top (band.y) ..bottom (0) of the panelling.
function drawWoodWall(c, w, h) {
  const base = c.createLinearGradient(0, h, 0, 0);
  base.addColorStop(0, '#b96e28'); base.addColorStop(.55, '#c97c2e'); base.addColorStop(1, '#d98a37');
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  // Discreet vertical grain: soft light/dark streaks, no knots or contrast.
  let s = 11; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const x = rand() * w, drift = (rand() - .5) * w * .02, lw = 1 + rand() * 2;
    c.strokeStyle = rand() > .5 ? 'rgba(223,145,61,.08)' : 'rgba(133,74,22,.08)';
    c.lineWidth = lw; c.beginPath(); c.moveTo(x, 0);
    c.bezierCurveTo(x + drift, h * .33, x - drift, h * .66, x + drift * .5, h); c.stroke();
  }
  // Large rectangular veneer plates with a few horizontal divisions: thin
  // recessed joints (dark line + light lower lip) at the third points.
  for (const t of [1 / 3, 2 / 3]) {
    c.fillStyle = 'rgba(96,52,14,.5)'; c.fillRect(w * t - 1, 0, 2, h);
    c.fillStyle = 'rgba(255,205,140,.22)'; c.fillRect(w * t + 1, 0, 1, h);
  }
  for (const t of [.38, .72]) {
    c.fillStyle = 'rgba(96,52,14,.45)'; c.fillRect(0, h * t - 1, w, 2);
    c.fillStyle = 'rgba(255,205,140,.18)'; c.fillRect(0, h * t + 1, w, 1);
  }
  // Soft diagonal shade falling to the right (sun through the west glass),
  // gentler than before so the veneer stays clean and architectural.
  c.save();
  c.translate(w * .55, 0); c.rotate(.38);
  const sh = c.createLinearGradient(-w * .25, 0, w * .45, 0);
  sh.addColorStop(0, 'rgba(80,42,10,0)'); sh.addColorStop(.5, 'rgba(80,42,10,.18)'); sh.addColorStop(1, 'rgba(80,42,10,0)');
  c.fillStyle = sh; c.fillRect(-w, -h, w * 2, h * 3);
  c.restore();
  // Warm glow where the sun strikes (upper-left).
  const glow = c.createLinearGradient(0, 0, w * .5, h);
  glow.addColorStop(0, 'rgba(255,196,110,.24)'); glow.addColorStop(1, 'rgba(255,196,110,0)');
  c.fillStyle = glow; c.fillRect(0, 0, w, h);
}

// Animated flight-information display (Fase 2): a live CanvasTexture that
// reads as a working FIDS — slow vertical drift, a ticking clock and rows
// whose state updates now and then. Nothing frenetic: the screen feels alive.
const FIDS_STATES = ['A TIEMPO', 'EMBARQUE', 'PUERTA', 'ÚLTIMA LLAMADA', 'DEMORADO'];
const FIDS_FLIGHTS = (() => {
  let s = 42; const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cities = ['MADRID', 'MÉXICO', 'BOGOTÁ', 'LIMA', 'BUENOS AIRES', 'SANTIAGO', 'PANAMÁ', 'MIAMI', 'BARCELONA', 'SEVILLA', 'QUITO', 'SAN JOSÉ'];
  return Array.from({ length: 24 }, (_, i) => ({
    time: `${String(8 + Math.floor(i * .72)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}`,
    code: `SS ${120 + i * 7}`,
    city: cities[i % cities.length],
    state: FIDS_STATES[Math.floor(rand() * 3)],
  }));
})();

function createFidsDisplay(scope, group, width, height, position) {
  const canvas = document.createElement('canvas'); canvas.width = 448; canvas.height = 622;
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const texture = scope.own(new T.CanvasTexture(canvas));
  texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 8;
  const material = scope.own(new T.MeshBasicMaterial({ map: texture }));
  scope.defer(luz.tintar(material, 'cartel'));
  const mesh = new T.Mesh(scope.own(new T.PlaneGeometry(width, height)), material);
  mesh.position.copy(position); group.add(mesh); scope.defer(() => mesh.removeFromParent());
  const headerH = 78, rowH = 42, listH = FIDS_FLIGHTS.length * rowH, viewH = H - headerH;
  const stateColor = { 'A TIEMPO': '#9fe8c0', 'EMBARQUE': '#ffd97a', 'PUERTA': '#7fd4f0', 'ÚLTIMA LLAMADA': '#ffb27a', 'DEMORADO': '#ff9a8a' };
  function draw(scroll, flashRow) {
    g.fillStyle = '#1f66cf'; g.fillRect(0, 0, W, H);
    // Header: brand band, plane glyphs, title and a live clock.
    const header = g.createLinearGradient(0, 0, 0, headerH);
    header.addColorStop(0, '#2a6fd6'); header.addColorStop(1, '#1a57ad');
    g.fillStyle = header; g.fillRect(0, 0, W, headerH);
    g.fillStyle = 'rgba(255,255,255,.92)';
    for (const x of [54, 128, 202]) { g.save(); g.translate(x, headerH / 2); g.rotate(-.5); g.beginPath(); g.ellipse(0, 0, 17, 4, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(2, 0); g.lineTo(-8, -12); g.lineTo(-13, -12); g.lineTo(-6, 0); g.closePath(); g.fill(); g.restore(); }
    const now = new Date();
    g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillStyle = '#ffffff'; g.font = 'bold 24px system-ui, sans-serif';
    g.fillText('SALIDAS · DEPARTURES', 244, headerH / 2 - 12, 196);
    g.fillStyle = '#cfe4ff'; g.font = '600 30px system-ui, sans-serif';
    g.fillText(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, 244, headerH / 2 + 18);
    // Rows, clipped to the list viewport, drifting slowly upward.
    g.save(); g.beginPath(); g.rect(0, headerH, W, viewH); g.clip();
    const first = Math.max(0, Math.floor(scroll / rowH) - 1), last = Math.min(FIDS_FLIGHTS.length, Math.ceil((scroll + viewH) / rowH) + 1);
    for (let i = first; i < last; i++) {
      const f = FIDS_FLIGHTS[i], y = headerH + i * rowH - scroll;
      if (i % 2) { g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, y, W, rowH); }
      if (i === flashRow) { g.fillStyle = 'rgba(247,201,72,.22)'; g.fillRect(0, y, W, rowH); }
      g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, y + rowH - 1, W, 1);
      g.font = '600 19px system-ui, sans-serif';
      g.fillStyle = '#eaf3ff'; g.fillText(f.time, 16, y + rowH / 2);
      g.fillStyle = '#bcd8f6'; g.fillText(f.code, 96, y + rowH / 2);
      g.fillStyle = '#ffffff'; g.fillText(f.city, 186, y + rowH / 2, 150);
      g.textAlign = 'right'; g.fillStyle = stateColor[f.state] || '#ffffff'; g.font = 'bold 17px system-ui, sans-serif';
      g.fillText(f.state, W - 14, y + rowH / 2); g.textAlign = 'left';
    }
    g.restore();
    // Soft fades so the drift disappears under the frame instead of cutting.
    const fadeTop = g.createLinearGradient(0, headerH, 0, headerH + 26);
    fadeTop.addColorStop(0, 'rgba(31,102,207,1)'); fadeTop.addColorStop(1, 'rgba(31,102,207,0)');
    g.fillStyle = fadeTop; g.fillRect(0, headerH, W, 26);
    const fadeBottom = g.createLinearGradient(0, H - 46, 0, H);
    fadeBottom.addColorStop(0, 'rgba(31,102,207,0)'); fadeBottom.addColorStop(1, 'rgba(21,80,160,1)');
    g.fillStyle = fadeBottom; g.fillRect(0, H - 46, W, 46);
  }
  let scrollT = 0, acc = 0, step = 0, flashRow = -1, flashT = 0;
  draw(0, -1); texture.needsUpdate = true;
  return { update(dt) {
    scrollT += dt; acc += dt;
    if (acc > 3.4) {
      acc = 0; step++;
      const i = (step * 7) % FIDS_FLIGHTS.length;
      FIDS_FLIGHTS[i].state = FIDS_STATES[(step + i) % FIDS_STATES.length];
      flashRow = i; flashT = 0;
    }
    if (flashRow >= 0) { flashT += dt; if (flashT > 1.5) flashRow = -1; }
    draw((scrollT * 8) % Math.max(1, listH - viewH), flashRow);
    texture.needsUpdate = true;
  } };
}

export function buildEntranceHall(meta, { scope, kit, group: floorGroup, interactive, colliders, worldPosition }) {
  const { width: w, depth: d } = meta, H = DIMENSIONS.ceiling;
  // Room props live in their own group: the polished floor mirrors it.
  const group = new T.Group(); group.name = 'D00:hall'; floorGroup.add(group);
  scope.defer(() => group.removeFromParent());
  const updates = [];
  const materials = { ...kit.materials };
  for (const [key, color] of Object.entries(PALETTE)) materials[key] = scope.own(crearMaterialToon({ color: hex(color), bandas: 3 }));
  // The battens get an illustrated metal albedo (sheen + edge highlight) so
  // they read as anodized profiles, not painted stripes.
  materials.metalTrim = scope.own(crearMaterialToon({ albedo: scope.own(battenTexture()), bandas: 3 }));
  const hall = { ...kit, materials, outline: (color, level) => kit.outline(PALETTE[color] ?? color, level) };
  const vol = (color, transforms, geometry) => boxes(scope, hall, group, color, transforms, geometry);
  const offset = new T.Vector3(worldPosition.x, 0, worldPosition.z);
  const solid = (x0, z0, x1, z1) => colliders.push(new T.Box3(new T.Vector3(x0, 0, z0).add(offset), new T.Vector3(x1, 2, z1).add(offset)));
  const tag = (mesh, semanticId) => { mesh.userData = { semanticId, interactionType: 'inspect', zoneId: meta.id }; interactive.push(mesh); return mesh; };
  const painted = (width, height, pixelsWide, draw, cutout = false) => {
    const map = scope.own(canvasTexture(pixelsWide, Math.round(pixelsWide * height / width), draw));
    const material = scope.own(new T.MeshBasicMaterial({ map, transparent: cutout, alphaTest: cutout ? .5 : 0 }));
    scope.defer(luz.tintar(material, 'cartel'));
    const mesh = new T.Mesh(scope.own(new T.PlaneGeometry(width, height)), material);
    group.add(mesh); scope.defer(() => mesh.removeFromParent());
    return mesh;
  };

  // Wall faces (the shell walls are .18 thick, centred on the room edge).
  const back = -d / 2 + .09, east = w / 2 - .09, west = -w / 2 + .08;   // west: inside the mullions
  const openingZ = meta.openings.east, halfOpening = DIMENSIONS.portalWidth / 2 + .1;
  const frontPier = 4.5;                                              // back face of the front-left/right piers
  const { band } = E, bandFront = back + .02 + band.depth, bandY = band.y + band.height / 2;

  // Beige wall cladding on the back and east walls (around the check-in opening).
  vol('hallWall', [
    [0, H / 2, back + .01, w, H, .02],
    [east - .01, H / 2, (back + openingZ - halfOpening) / 2, .02, H, openingZ - halfOpening - back],
    [east - .01, H / 2, (openingZ + halfOpening + frontPier) / 2, .02, H, frontPier - openingZ - halfOpening],
    [east - .01, (DIMENSIONS.doorHeight + .1 + H) / 2, openingZ, .02, H - DIMENSIONS.doorHeight - .1, 2 * halfOpening],
  ]);
  // Illustrated back wall (reference): baked sun wash and joint shadows,
  // relit by the scene. It sits in front of the cladding and behind every
  // protruding piece (band, gold stripe, panelling), so no z-fighting.
  const wallTexture = scope.own(canvasTexture(1024, Math.round(1024 * H / (east - west)), (c, a, b) => drawBackWall(c, a, b, west, east, band.y - .18)));
  const wallMaterial = scope.own(crearMaterialToon({ albedo: wallTexture }));
  const backWall = new T.Mesh(scope.own(new T.PlaneGeometry(east - west, H)), wallMaterial);
  backWall.position.set((west + east) / 2, H / 2, back + .045); group.add(backWall);
  scope.defer(() => backWall.removeFromParent());
  // Grey architectural skirting along the base of the back wall (zócalo),
  // tall enough to clearly separate the light panels from the floor.
  vol('skirting', [[(west + east) / 2, .11, back + .048, east - west, .22, .04]]);
  // Real metal battens (anodized aluminium, 9 cm wide x 2.8 cm deep) standing
  // proud of the panels, from just under the gold ribbon down to the skirting:
  // the lateral shade and edge glints give the wall its depth (reference brief).
  const battenTop = band.y - .16;
  vol('metalTrim', E.panelJoints.map(x => [x, (battenTop + .2) / 2, back + .059, .09, battenTop - .2, .028]));
  // Warm wood panelling behind the desk: honey oak veneer with grain, a fine
  // grid and the diagonal sun shadow, illustrated like the back wall.
  const [wood0, wood1] = E.woodWall, woodFront = back + .08;
  vol('woodWarm', [[(wood0 + wood1) / 2, band.y / 2, back + .05, wood1 - wood0, band.y, .06]]);
  const woodTexture = scope.own(canvasTexture(512, Math.round(512 * band.y / (wood1 - wood0)), (c, a, b) => drawWoodWall(c, a, b)));
  const woodFace = new T.Mesh(scope.own(new T.PlaneGeometry(wood1 - wood0, band.y)), scope.own(crearMaterialToon({ albedo: woodTexture })));
  woodFace.position.set((wood0 + wood1) / 2, band.y / 2, woodFront + .004); group.add(woodFace);
  scope.defer(() => woodFace.removeFromParent());
  // Sign band (deep navy body, projected forward like an architectural cornice)
  // with a thin yellow graphic line under it; the warm glow below comes from
  // the painted wash plus real scene lamps (see AirportChunk zoneLamps).
  const bandDepth = band.depth + .02;
  vol('bandBlue', [
    [(west + east) / 2, bandY, back + .02 + bandDepth / 2, east - west, band.height, bandDepth],
    [east - .02 - bandDepth / 2, bandY, (back + .02 + bandDepth + frontPier) / 2, bandDepth, band.height, frontPier - back - .02 - bandDepth],
  ]);
  const lineY = band.y - band.height / 2 - .018, bandFrontZ = back + .02 + bandDepth;
  vol('gold', [
    [(west + east) / 2, lineY, back + .02 + bandDepth / 2, east - west, .036, bandDepth + .004],
    [east - .02 - bandDepth / 2, lineY, (bandFrontZ + frontPier) / 2, bandDepth + .004, .036, frontPier - bandFrontZ],
  ]);

  // Hanging signs: navy case standing on the band, illustrated face.
  const signY = band.y + .05 + E.signHeight / 2, signs = [
    [E.infoSign, { glyph: 'info', title: 'INFORMACIÓN', subtitle: 'Information' }],
    [E.departuresSign, { glyph: 'plane', title: 'SALIDAS', subtitle: 'Departures', arrow: true }],
  ];
  for (const [{ x, width }, content] of signs) {
    vol('hallNavy', [[x, signY, bandFrontZ + E.signDepth / 2, width, E.signHeight, E.signDepth]]);
    painted(width, E.signHeight, 1024, (c, a, b) => drawHallSign(c, a, b, content)).position.set(x, signY, bandFrontZ + E.signDepth + .003);
  }
  const checkinX = east - .02 - bandDepth;
  vol('hallNavy', [[checkinX - E.signDepth / 2, signY, E.checkinSign.z, E.signDepth, E.signHeight, E.checkinSign.width]]);
  const checkin = painted(E.checkinSign.width, E.signHeight, 1024, (c, a, b) => drawHallSign(c, a, b, { glyph: 'bag', title: 'FACTURACIÓN', subtitle: 'Check-in', arrow: true }));
  checkin.position.set(checkinX - E.signDepth - .003, signY, E.checkinSign.z); checkin.rotation.y = -Math.PI / 2;

  // Information poster on the wood panelling.
  const { poster } = E, posterY = (poster.y[0] + poster.y[1]) / 2, posterH = poster.y[1] - poster.y[0];
  vol('hallNavy', [[poster.x, posterY, woodFront + .015, poster.width, posterH, .03]]);
  painted(poster.width - .04, posterH - .04, 256, drawPoster).position.set(poster.x, posterY, woodFront + .033);

  // Information desk: wood body on a dark plinth, navy front panel with the
  // "i" badge and a gold foot line, cream counter top, two monitors (seen
  // from behind) and a brochure stand at the right end.
  const { desk } = E, [desk0, desk1] = desk.x, deskW = desk1 - desk0, deskX = (desk0 + desk1) / 2;
  const deskZ = desk.front - desk.depth / 2, top = DIMENSIONS.counterHeight - .08;
  const panel0 = desk0 + deskW * .19, panel1 = desk0 + deskW * .76, panelX = (panel0 + panel1) / 2, panelW = panel1 - panel0;
  vol('dark', [[deskX, .05, deskZ + .04, deskW - .08, .1, desk.depth - .08]]);
  tag(vol('woodWarm', [[deskX, (.1 + top) / 2, deskZ, deskW, top - .1, desk.depth]]), 'airport.entrance.information');
  vol('hallNavy', [[panelX, (.18 + top - .06) / 2, desk.front + .012, panelW, top - .24, .024]]);
  vol('gold', [[panelX, .16, desk.front + .015, panelW, .04, .03]]);
  vol('counter', [[deskX, top + .03, deskZ + .03, deskW + .1, .06, desk.depth + .12]]);
  painted(.5, .5, 256, drawBadge, true).position.set(panelX, (.18 + top) / 2, desk.front + .026);
  const monitors = [desk0 + deskW * .2, desk0 + deskW * .6];
  vol('bezel', monitors.map(x => [x, top + .06 + .14 + .2, deskZ - .12, .6, .4, .05]));
  vol('steelDark', monitors.flatMap(x => [[x, top + .06 + .08, deskZ - .1, .06, .16, .06], [x, top + .07, deskZ - .1, .26, .02, .18]]));
  vol('steel', [[desk1 - .25, top + .06 + .13, desk.front - .12, .3, .26, .12]]);
  vol('blue', [[desk1 - .32, top + .06 + .2, desk.front - .06, .1, .2, .02]]);
  vol('counter', [[desk1 - .18, top + .06 + .2, desk.front - .06, .1, .2, .02]]);
  solid(desk0 - .05, desk.front - desk.depth - .06, desk1 + .05, desk.front + .06);

  // Three-seat bench: navy shells on a steel beam, armrests between seats.
  const { bench } = E, pitch = .66, seatZ = bench.back + .07 + .25, benchW = bench.seats * pitch;
  const seatXs = Array.from({ length: bench.seats }, (_, i) => bench.x + (i - (bench.seats - 1) / 2) * pitch);
  tag(vol('hallSeat', [
    ...seatXs.map(x => [x, .46, seatZ, .6, .08, .5]),
    ...seatXs.map(x => [x, .8, bench.back + .035, .6, .5, .07]),
  ]), 'airport.gate.seat');
  const arms = Array.from({ length: bench.seats + 1 }, (_, i) => bench.x + (i - bench.seats / 2) * pitch);
  vol('steel', [
    [bench.x, .37, seatZ, benchW + .1, .06, .08],
    ...arms.flatMap(x => [[x, .58, seatZ + .12, .04, .2, .04], [x, .69, seatZ, .05, .04, .44]]),
    ...[-1, 1].flatMap(s => [
      [bench.x + s * benchW / 2, .18, seatZ - .2, .05, .36, .05], [bench.x + s * benchW / 2, .18, seatZ + .2, .05, .36, .05],
      [bench.x + s * benchW / 2, .015, seatZ, .06, .03, .56],
    ]),
  ]);
  solid(bench.x - benchW / 2 - .05, bench.back, bench.x + benchW / 2 + .05, seatZ + .3);
  // Cuatro plantas tropicales (TropicalPlants.js): huecos de la pared del fondo y rincón este.
  for (const [x, z] of [[-1.85, back + .5], [2.15, back + .5], [6.2, back + .55], [6.3, 3.2]]) {
    plantar(scope, x, z, { group, bromelia: true });
    solid(x - .3, z - .3, x + .3, z + .3);
  }

  // Waste point (Fase 3): cylindrical satin-stainless bin with a black lid and
  // opening, and a new double recycling station at the right end — blue module
  // (recycling) joined to a grey module (general waste), gently inclined tops,
  // two dark openings and painted white icons.
  materials.binSteel = scope.own(crearMaterialToon({ albedo: scope.own(binSteelTexture()), bandas: 3 }));
  materials.binLid = scope.own(crearMaterialToon({ color: '#262b31', bandas: 3 }));
  materials.recycleBlue = scope.own(crearMaterialToon({ color: '#1f5fae', bandas: 3 }));
  materials.wasteGrey = scope.own(crearMaterialToon({ color: '#6e7378', bandas: 3 }));
  const binZ = back + .45;
  vol('binSteel', [[E.bin.x, .44, binZ, .46, .88, .46]], hall.cylinder);
  vol('binSteel', [[E.bin.x, .035, binZ, .48, .07, .48]], hall.cylinder);
  vol('binLid', [[E.bin.x, .885, binZ, .48, .05, .48]], hall.cylinder);
  vol('binLid', [[E.bin.x, .913, binZ, .3, .016, .3]], hall.cylinder);
  solid(E.bin.x - .25, binZ - .25, E.bin.x + .25, binZ + .25);
  const stW = .62, stD = .46, stH = .92, stX = 5.62, stZ = back + .08 + stD / 2, stFront = stZ + stD / 2;
  vol('recycleBlue', [[stX + stW / 2, stH / 2, stZ, stW, stH, stD]]);
  vol('wasteGrey', [[stX + stW * 1.5, stH / 2, stZ, stW, stH, stD]]);
  vol('dark', [[stX + stW, .04, stZ, 2 * stW - .06, .08, stD - .06]]);
  const cap = (color, x) => {
    const mesh = new T.Mesh(scope.own(new T.BoxGeometry(stW + .03, .05, stD + .08)), materials[color]);
    mesh.position.set(x, stH + .015, stZ + .015); mesh.rotation.x = -.16;
    group.add(mesh); scope.defer(() => mesh.removeFromParent());
    contornoDe(mesh, hall.outline(color, 'medio'));
    return mesh;
  };
  cap('recycleBlue', stX + stW / 2); cap('wasteGrey', stX + stW * 1.5);
  const slot = x => {
    const mesh = new T.Mesh(scope.own(new T.BoxGeometry(stW - .26, .022, .24)), materials.binLid);
    mesh.position.set(x, stH + .052, stZ + .03); mesh.rotation.x = -.16;
    group.add(mesh); scope.defer(() => mesh.removeFromParent());
  };
  slot(stX + stW / 2); slot(stX + stW * 1.5);
  const stationFace = (kind, x) => {
    const map = scope.own(canvasTexture(256, Math.round(256 * (stH - .1) / (stW - .08)), drawStationFace(kind)));
    const material = scope.own(new T.MeshBasicMaterial({ map, transparent: true }));
    scope.defer(luz.tintar(material, 'cartel'));
    const mesh = new T.Mesh(scope.own(new T.PlaneGeometry(stW - .08, stH - .1)), material);
    mesh.position.set(x, stH / 2 - .01, stFront + .004); group.add(mesh); scope.defer(() => mesh.removeFromParent());
  };
  stationFace('recycle', stX + stW / 2); stationFace('waste', stX + stW * 1.5);
  solid(stX - .04, back, stX + 2 * stW + .04, stFront + .03);

  // Flight-information totem (Fase 2): a physical kiosk — grey metal case on a
  // solid plinth with a cap, a four-bar bezel framing a recessed LIVE display,
  // and a clearcoat glass plane floating ~2 cm in front of the LCD. Three real
  // layers, none of them coplanar, so the screen stops reading as a sticker.
  const { fids } = E, fidsD = .35, fidsZ = back + .02 + fidsD / 2, fidsFront = fidsZ + fidsD / 2;
  const screenW = fids.width - .24, screenH = 1.4, screenY = fids.height - .15 - screenH / 2;
  tag(vol('kiosk', [[fids.x, fids.height / 2, fidsZ, fids.width, fids.height, fidsD]]), 'airport.gate.flightBoard');
  vol('steelDark', [[fids.x, .04, fidsZ, fids.width - .06, .08, fidsD + .02], [fids.x, fids.height + .02, fidsZ, fids.width + .04, .04, fidsD + .04]]);
  // Dark back of the screen opening; the display floats 2 mm in front of it.
  vol('bezel', [[fids.x, screenY, fidsFront + .004, screenW + .04, screenH + .04, .008]]);
  vol('bezel', [
    [fids.x, screenY + screenH / 2 + .035, fidsFront + .012, screenW + .14, .07, .024],
    [fids.x, screenY - screenH / 2 - .035, fidsFront + .012, screenW + .14, .07, .024],
    [fids.x - screenW / 2 - .035, screenY, fidsFront + .012, .07, screenH + .14, .024],
    [fids.x + screenW / 2 + .035, screenY, fidsFront + .012, .07, screenH + .14, .024],
  ]);
  updates.push(createFidsDisplay(scope, group, screenW, screenH, new T.Vector3(fids.x, screenY, fidsFront + .010)).update);
  const fidsGlass = new T.Mesh(scope.own(new T.PlaneGeometry(screenW + .02, screenH + .02)), scope.own(new T.MeshPhysicalMaterial({
    color: 0xd6e6f2, metalness: 0, roughness: .12, transparent: true, opacity: .14,
    clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.3, depthWrite: false,
  })));
  fidsGlass.position.set(fids.x, screenY, fidsFront + .028); group.add(fidsGlass); scope.defer(() => fidsGlass.removeFromParent());
  solid(fids.x - fids.width / 2, back, fids.x + fids.width / 2, fidsFront + .05);

  // Floor: the navy mat inside the doors with a yellow back edge (the grey
  // porcelain itself is painted by ExteriorIllusion). Then the polished-porcelain reflection over all of it.
  const flatPlane = (material, width, length, x, y, z) => {
    const mesh = new T.Mesh(scope.own(new T.PlaneGeometry(width, length)), material);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(x, y, z);
    floorGroup.add(mesh); scope.defer(() => mesh.removeFromParent()); return mesh;
  };
  const { bandLine, mat } = E;
  const lineMaterial = scope.own(crearMaterialToon({ color: '#f6c436' }));
  const matZ = d / 2 - .05 - mat.depth / 2;
  const matMaterial = scope.own(crearMaterialToon({ albedo: scope.own(canvasTexture(1024, Math.round(1024 * mat.depth / mat.width), drawMat)) }));
  flatPlane(matMaterial, mat.width, mat.depth, 0, .026, matZ);
  flatPlane(lineMaterial, mat.width, bandLine, 0, .0265, matZ - (mat.depth + bandLine) / 2);
  const gloss = createGlossyFloor(scope, { width: w, depth: d, strength: E.gloss });
  gloss.position.y = .024; gloss.renderOrder = 1; floorGroup.add(gloss); scope.defer(() => gloss.removeFromParent());

  // Sun through the west glazing (light decal: follows the sun, off at night).
  const sunDepth = 4, sunLength = frontPier - back;
  const sunMaterial = scope.own(new T.MeshBasicMaterial({ map: scope.own(canvasTexture(256, 600, (c, a, b) => drawWestSun(c, a, b, E.westBays))), transparent: true, opacity: .2, depthWrite: false }));
  const sun = new T.Mesh(scope.own(new T.PlaneGeometry(sunDepth, sunLength)), sunMaterial);
  sun.rotation.x = -Math.PI / 2; sun.position.set(-w / 2 + sunDepth / 2, .033, (back + frontPier) / 2);
  floorGroup.add(sun); scope.defer(() => sun.removeFromParent());
  scope.defer(luz.registrarDecal(sun, .2));

  // Contact shadows: soft radial dark decals under furniture so pieces sit on
  // the floor instead of floating over the gloss (ambient occlusion, painterly).
  const aoTexture = scope.own(canvasTexture(256, 256, c => {
    const g = c.createRadialGradient(128, 128, 10, 128, 128, 126);
    g.addColorStop(0, 'rgba(43,53,80,.5)'); g.addColorStop(.62, 'rgba(43,53,80,.26)'); g.addColorStop(1, 'rgba(43,53,80,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  }));
  const aoMaterial = scope.own(new T.MeshBasicMaterial({ map: aoTexture, transparent: true, depthWrite: false }));
  const aoBlob = (x, z, w, d) => {
    const blob = flatPlane(aoMaterial, w, d, x, .028, z);
    blob.renderOrder = 2;
    return blob;
  };
  aoBlob(-4.6, -3.35, 3.8, 1.3);   // information desk
  aoBlob(.15, -4.5, 2.5, 1.1);     // bench
  aoBlob(4.55, -4.62, 1.6, .85);   // kiosk
  aoBlob(3.27, -4.46, .9, .9);     // round bin
  aoBlob(6.24, -4.5, 1.8, .95);    // recycling station

  // Ceiling: two navy beams running front to back and recessed light panels.
  vol('hallNavy', E.beams.map(x => [x, H - .225, 0, .5, .45, d]));
  const lights = E.lightsX.flatMap(x => E.lightsZ.map(z => [x, z]));
  vol('lightMetal', lights.map(([x, z]) => [x, H - .025, z, 2.3, .05, 1.7]));
  vol('warmLight', lights.map(([x, z]) => [x, H - .06, z, 2.1, .02, 1.5]));
  group.traverse(object => object.layers.enable(REFLECT_LAYER));
  return { update(dt) { for (const step of updates) step(dt); } };
}
