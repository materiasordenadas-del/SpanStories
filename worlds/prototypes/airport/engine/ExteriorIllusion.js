import * as T from './three.js';
import { bottomCenterPlane } from './GroundedBillboard.js';
import { addEntrancePalms } from './EntrancePalms.js';
import { addExteriorAnimals } from './ExteriorAnimals.js';
import { buildPorticoGarden } from './PorticoGarden.js';
import { buildGateApron } from './GateApron.js';
import { buildEntranceAccess } from './EntranceAccess.js';
import { luz, crearMaterialToon, crearReceptorSombra, contornoDe, normalBaldosa, normalDesdeAltura, conNormalContorno } from './Luz25D.js';
import { boxes, createFacadeKit } from './ThreeResources.js';
import { DEPARTURE_ROUTE, FACADE, CANOPY_SOFFIT, CANOPY_SPOTS, PORTICO_SPOTS, PORTICO_BACK_SPOTS, PORTICO_X, PORTICO_Z, PORTICO_LAWN_EDGE, PORTICO_LAWN_WEST, STREET, ENTRANCE_HALL } from './routes.js';

// Hall floor canvas: 4 slabs across x 8 down = 4.8 m square (120 x 60 cm).
export const HALL_SLABS = [4, 8];
function texture(width, height, draw) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace;
  map.minFilter = T.LinearMipmapLinearFilter; map.magFilter = T.LinearFilter;
  return map;
}
function drawBackdrop(ctx, w, h, apron) {
  // No painted sky: above the rooftops the plane is transparent, so the real
  // sky dome and the volumetric clouds show behind the distant city.
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#76909c';
  for (let i = 0; i < 12; i++) {
    const x = i * 97 - 25, height = 16 + ((i * 17) % 28);
    ctx.fillRect(x, 300 - height, 77, height);
    ctx.fillStyle = '#abc0c3'; ctx.fillRect(x + 8, 300 - height + 7, 58, 5);
    ctx.fillStyle = '#567586';
    for (let pane = 0; pane < 5; pane++) ctx.fillRect(x + 6 + pane * 14, 300 - height + 17, 10, 8);
    ctx.fillStyle = '#76909c';
  }
  ctx.fillStyle = '#8194a0'; ctx.fillRect(0, 296, w, 8);
  if (apron) {
    const ground = ctx.createLinearGradient(0, 304, 0, h);
    ground.addColorStop(0, '#8a9da5'); ground.addColorStop(1, '#6d8089');
    ctx.fillStyle = ground; ctx.fillRect(0, 304, w, h - 304);
    ctx.fillStyle = '#637e8b'; ctx.fillRect(0, 311, w, 12);
    ctx.strokeStyle = '#e0b45e'; ctx.lineWidth = 3;
    for (const shift of [-1, 0, 1]) {
      ctx.beginPath(); ctx.moveTo(w / 2 + shift * 25, 325); ctx.lineTo(w / 2 + shift * 210, h); ctx.stroke();
    }
    ctx.strokeStyle = '#e6e9e4'; ctx.lineWidth = 4;
    for (let y = 348; y < h; y += 46) { ctx.beginPath(); ctx.moveTo(w / 2 - 12, y); ctx.lineTo(w / 2 + 12, y); ctx.stroke(); }
    ctx.fillStyle = '#f5d289';
    for (const [x, y, r] of [[270, 360, 2], [750, 360, 2], [205, 395, 3], [815, 395, 3], [105, 450, 4], [915, 450, 4]]) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = '#dce8e8aa'; ctx.lineWidth = 2;
    for (const y of [353, 412, 478]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(180, y + 16); ctx.moveTo(w, y); ctx.lineTo(w - 180, y + 16); ctx.stroke(); }
    // A distant control tower and terminal stay on this flat painting.
    ctx.fillStyle = '#536d7b'; ctx.fillRect(840, 210, 11, 92); ctx.fillRect(830, 203, 31, 14);
    ctx.fillStyle = '#28485e'; ctx.fillRect(833, 205, 25, 7);
    ctx.fillStyle = '#e6a958'; ctx.fillRect(845, 198, 2, 4);
    ctx.fillStyle = '#4c6b79';
    for (const [x, y] of [[35, 306], [232, 301], [690, 308], [972, 302]]) {
      ctx.fillRect(x, y - 18, 2, 18); ctx.fillRect(x - 13, y - 19, 28, 2);
      ctx.fillStyle = '#f7dc9a'; ctx.fillRect(x - 13, y - 17, 3, 3); ctx.fillRect(x + 12, y - 17, 3, 3);
      ctx.fillStyle = '#4c6b79';
    }
  } else {
    ctx.fillStyle = '#697a82'; ctx.fillRect(0, 304, w, h - 304);
    ctx.fillStyle = '#d9d1bf'; ctx.fillRect(0, 316, w, 9);
    ctx.fillStyle = '#d8d3c7';
    for (let x = 0; x < w; x += 140) { ctx.save(); ctx.translate(x, 398); ctx.transform(1, 0, -.38, 1, 0, 0); ctx.fillRect(0, 0, 48, 7); ctx.restore(); }
    ctx.fillStyle = '#93a9a6';
    for (let x = 35; x < w; x += 188) {
      ctx.fillRect(x, 220, 4, 82);
      ctx.beginPath(); ctx.ellipse(x + 2, 217, 25, 30, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#b4c2c5';
    for (let x = 5; x < w; x += 92) { ctx.fillRect(x, 303, 3, 36); ctx.fillRect(x, 338, 67, 3); }
    ctx.fillStyle = '#d8a66c';
    for (const x of [110, 390, 670, 950]) { ctx.fillRect(x, 295, 3, 5); ctx.fillRect(x - 3, 297, 9, 2); }
  }
}
function drawMid(ctx, w, h, apron) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = apron ? '#a6b9bf' : '#bac3b8';
  for (let i = 0; i < 6; i++) {
    const x = i * 173 - 12, high = i % 2 ? 46 : 62;
    ctx.fillRect(x, h - high, 162, high);
    ctx.fillStyle = '#648596'; ctx.fillRect(x + 9, h - high + 10, 144, 17);
    ctx.fillStyle = apron ? '#a6b9bf' : '#bac3b8';
  }
  ctx.fillStyle = '#5f7d8a'; ctx.fillRect(0, h - 5, w, 5);
}
function drawVehicle(ctx, w, h, bus) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#2a3540aa'; ctx.beginPath(); ctx.ellipse(128, 100, bus ? 108 : 90, 13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = bus ? '#376a8d' : '#dfa953';
  ctx.beginPath(); ctx.moveTo(25, 70); ctx.lineTo(bus ? 30 : 66, bus ? 27 : 40);
  ctx.lineTo(bus ? 212 : 181, bus ? 27 : 40); ctx.lineTo(234, 70); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e5eff0'; ctx.beginPath(); ctx.moveTo(bus ? 40 : 71, bus ? 35 : 44);
  ctx.lineTo(bus ? 205 : 177, bus ? 35 : 44); ctx.lineTo(216, 63); ctx.lineTo(48, 63); ctx.closePath(); ctx.fill();
  ctx.fillStyle = bus ? '#214d69' : '#d99c43'; ctx.fillRect(16, 63, 223, 29);
  ctx.fillStyle = '#253542'; for (const x of [60, 193]) { ctx.beginPath(); ctx.arc(x, 93, 14, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#f9e8b0'; ctx.fillRect(228, 68, 8, 7);
}
// --- D00 entrance forecourt (SpanStories 2.5D: baked flats + thin volumes) ---
// Deterministic noise so every reload bakes the same speckles.
function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}
function drawSidewalk(ctx, w, h) {
  // 4 × 4 square concrete slabs of 1 m (cool light grey, as in the reference).
  // Albedo only: each slab a slightly different tone plus fine aggregate
  // speckles; the joints' relief comes from the slab normal map.
  const rand = seeded(17), n = 4, s = w / n;
  const tones = ['#e2e6e9', '#dde2e5', '#e7eaec', '#d9dee2', '#e0e4e7'];
  for (let tx = 0; tx < n; tx++) for (let tz = 0; tz < n; tz++) {
    ctx.fillStyle = tones[Math.floor(rand() * tones.length)]; ctx.fillRect(tx * s, tz * s, s, s);
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() < .5 ? 'rgba(160,166,168,.35)' : 'rgba(255,255,255,.5)';
    ctx.fillRect(rand() * w, rand() * h, 1.5, 1.5);
  }
  ctx.strokeStyle = 'rgba(138,146,149,.75)'; ctx.lineWidth = 2;
  for (let i = 0; i <= n; i++) {
    ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(w, i * s); ctx.stroke();
  }
}
function drawCrosswalk(ctx, w, h, metresWide, bars, barWidth) {
  // Transparent sheet with only the paint: long white bars running kerb to
  // kerb (along the walking direction), a little worn at the wheel tracks.
  ctx.clearRect(0, 0, w, h);
  const ppm = w / metresWide, pitch = metresWide / bars, rand = seeded(29);
  for (let i = 0; i < bars; i++) {
    const x = (i * pitch + (pitch - barWidth) / 2) * ppm;
    ctx.fillStyle = '#eef0ec'; ctx.fillRect(x, 6, barWidth * ppm, h - 12);
    ctx.fillStyle = 'rgba(190,196,198,.8)';
    for (let k = 0; k < 14; k++) {
      const y = [.28, .72][k % 2] * h + (rand() - .5) * h * .16;
      ctx.beginPath(); ctx.ellipse(x + rand() * barWidth * ppm, y, 2 + rand() * 5, 1.5 + rand() * 3, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
}
function drawStreetBand(ctx, w, h, metresLong, metresWide, markings = true) {
  // One 8 m stretch of the two-lane road (v = kerb to kerb): blue-grey asphalt
  // with aggregate speckles and hairline cracks, darker gutters along both
  // kerbs (contact occlusion) and the white dashed centre line.
  const ppmX = w / metresLong, ppmZ = h / metresWide, rand = seeded(43);
  ctx.fillStyle = '#4a5058'; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 5200; i++) {
    const r = rand();
    ctx.fillStyle = r < .45 ? 'rgba(96,103,112,.9)' : r < .85 ? 'rgba(58,63,70,.9)' : 'rgba(130,136,142,.8)';
    ctx.fillRect(rand() * w, rand() * h, 1 + (i % 3 === 0), 1 + (i % 5 === 0));
  }
  ctx.strokeStyle = 'rgba(52,57,63,.7)'; ctx.lineWidth = 1.5;
  for (const [x, y, len] of [[.3, .3, .1], [.8, .8, .08]]) {
    ctx.beginPath(); ctx.moveTo(x * w, y * h); ctx.lineTo((x + len * .5) * w, (y + .03) * h); ctx.lineTo((x + len) * w, (y - .01) * h); ctx.stroke();
  }
  if (!markings) return;
  for (const [y0, y1] of [[0, .4], [metresWide, metresWide - .4]]) {
    const g = ctx.createLinearGradient(0, y0 * ppmZ, 0, y1 * ppmZ);
    g.addColorStop(0, 'rgba(44,48,54,.75)'); g.addColorStop(1, 'rgba(44,48,54,0)');
    ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1) * ppmZ, w, .4 * ppmZ);
  }
  ctx.fillStyle = '#eceee9';
  for (const x of [.4, 4.4]) ctx.fillRect(x * ppmX, h / 2 - .07 * ppmZ, 2.6 * ppmX, .14 * ppmZ);
}
function drawTactile(ctx, w, h, panels, height = false) {
  // Tactile warning paving: ochre panels of truncated domes. The same drawing,
  // in grey levels, is the height field of its normal map (domes stand out).
  ctx.fillStyle = height ? '#000' : '#cf9a44'; ctx.fillRect(0, 0, w, h);
  const pw = w / panels, cols = 9, rows = 4;
  for (let p = 0; p < panels; p++) {
    ctx.fillStyle = height ? '#303030' : '#d9a64c'; ctx.fillRect(p * pw + 3, 3, pw - 6, h - 6);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = p * pw + (i + .5) * pw / cols, y = (j + .5) * h / rows;
      ctx.fillStyle = height ? '#fff' : '#e6b867';
      ctx.beginPath(); ctx.arc(x, y, h / rows * .27, 0, Math.PI * 2); ctx.fill();
    }
  }
}
export function drawHallFloor(ctx, w, h, cols, rows) {
  // Entrance hall: large-format light-grey porcelain, 120 x 60 cm slabs in a
  // straight grid (no stagger), long side along X; cols x rows per canvas.
  // Each slab gets a near-invisible stone/cement cloud; the grout is a 3 mm
  // line barely darker than the stone (albedo only; the shine is GlossyFloor).
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sx = w / cols, sy = h / rows, tones = ['#c9c9c6', '#cbcbc8', '#c7c7c4', '#cacac7', '#c8c8c5'];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = i * sx, y = j * sy;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, sx, sy); ctx.clip();
    ctx.fillStyle = tones[Math.floor(rnd() * tones.length)]; ctx.fillRect(x, y, sx, sy);
    for (let k = 0; k < 7; k++) {
      const cx = x + rnd() * sx, cy = y + rnd() * sy, r = sy * (.35 + rnd() * .7);
      const light = rnd() < .5, g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, light ? 'rgba(211,211,208,.35)' : 'rgba(190,191,188,.3)');
      g.addColorStop(1, light ? 'rgba(211,211,208,0)' : 'rgba(190,191,188,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, sx, sy);
    }
    ctx.restore();
  }
  ctx.strokeStyle = '#a9aaa7'; ctx.lineWidth = 1.5;
  for (let i = 0; i <= cols; i++) { ctx.beginPath(); ctx.moveTo(i * sx, 0); ctx.lineTo(i * sx, h); ctx.stroke(); }
  for (let j = 0; j <= rows; j++) { ctx.beginPath(); ctx.moveTo(0, j * sy); ctx.lineTo(w, j * sy); ctx.stroke(); }
}
function drawDirectory(ctx, w, h) {
  ctx.fillStyle = '#1d3f61'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#152c44'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.fillStyle = '#e6b15e'; ctx.fillRect(20, 20, w - 40, 6);
  ctx.font = 'bold 21px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#9fc2d4';
  ctx.fillText('AEROPUERTO', w / 2, 58);
  const rows = [
    ['Salidas', 'Departures', 'plane'], ['Facturación', 'Check-in', 'bag'],
    ['Información', 'Information', 'info'], ['Transporte', 'Ground transport', 'bus'],
  ];
  rows.forEach(([es, en, icon], i) => {
    const y = 96 + i * 100;
    ctx.fillStyle = '#e6b15e'; ctx.beginPath(); ctx.roundRect(20, y, 52, 52, 10); ctx.fill();
    ctx.fillStyle = '#1d3f61';
    if (icon === 'plane') { ctx.save(); ctx.translate(46, y + 26); ctx.rotate(-.3); ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(-13, 6); ctx.lineTo(-6, 0); ctx.lineTo(-13, -6); ctx.closePath(); ctx.fill(); ctx.restore(); }
    if (icon === 'bag') { ctx.fillRect(30, y + 12, 32, 30); ctx.beginPath(); ctx.arc(46, y + 13, 9, Math.PI, 0); ctx.fill(); }
    if (icon === 'info') { ctx.font = 'bold 40px system-ui'; ctx.textAlign = 'center'; ctx.fillText('i', 46, y + 40); }
    if (icon === 'bus') { ctx.fillRect(28, y + 14, 36, 22); ctx.beginPath(); ctx.arc(37, y + 40, 5, 0, Math.PI * 2); ctx.arc(55, y + 40, 5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e6b15e'; ctx.fillRect(31, y + 18, 30, 7); }
    ctx.textAlign = 'left'; ctx.fillStyle = '#f2f7f9'; ctx.font = 'bold 27px system-ui';
    ctx.fillText(es, 88, y + 26);
    ctx.fillStyle = '#9fc2d4'; ctx.font = '20px system-ui'; ctx.fillText(en, 88, y + 52);
  });
  ctx.fillStyle = '#e6b15e'; ctx.fillRect(20, h - 26, w - 40, 6);
}
function drawPromo(ctx, w, h) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * .62);
  sky.addColorStop(0, '#7fb2d9'); sky.addColorStop(1, '#cfe6ee');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h * .62);
  ctx.fillStyle = '#8fa8bc'; ctx.beginPath(); ctx.moveTo(0, h * .5); ctx.lineTo(w * .32, h * .26); ctx.lineTo(w * .6, h * .5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7b96ac'; ctx.beginPath(); ctx.moveTo(w * .35, h * .5); ctx.lineTo(w * .68, h * .3); ctx.lineTo(w, h * .5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5d7a68'; ctx.fillRect(0, h * .5, w, h * .12);
  ctx.fillStyle = '#ffffff'; ctx.save(); ctx.translate(w * .68, h * .16); ctx.rotate(-.3);
  ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-20, 7); ctx.lineTo(-9, 0); ctx.lineTo(-20, -7); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.fillStyle = '#1d3f61'; ctx.fillRect(0, h * .62, w, h * .38);
  ctx.fillStyle = '#f2f7f9'; ctx.textAlign = 'left'; ctx.font = 'bold 30px system-ui';
  ctx.fillText('Nuevos lugares.', 24, h * .62 + 46);
  ctx.fillText('Más historias.', 24, h * .62 + 84);
  ctx.fillStyle = '#e6b15e'; ctx.fillRect(24, h * .62 + 104, w - 48, 5);
  ctx.fillStyle = '#ebf3f4'; ctx.font = 'bold 22px system-ui';
  ctx.save(); ctx.translate(34, h * .62 + 148); ctx.rotate(-.3);
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-11, 4.5); ctx.lineTo(-5, 0); ctx.lineTo(-11, -4.5); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.fillText('SpanStories', 56, h * .62 + 155);
}
function drawPalmFronds(ctx, w, h, tone) {
  // tone: 'back' | 'front' — one crown layer drawn with its own baked shading.
  // Each frond is a rib with serrated leaflets, so the silhouette reads lush
  // instead of polygonal. Colors: baked light from upper-left, shade underside.
  ctx.clearRect(0, 0, w, h);
  const [main, shade, lit] = tone === 'back'
    ? ['#41794f', '#356843', '#4e8a5c']
    : ['#5fa26e', '#4f9163', '#82bd8f'];
  const frond = (angle, length, color) => {
    ctx.save(); ctx.translate(w * .5, h * .26); ctx.rotate(angle);
    const rib = t => ({ x: t * length, y: -Math.sin(t * Math.PI * .8) * length * .16 + t * t * length * .3 });
    // Two passes: a wide dark under-layer for mass, then the main leaflets.
    for (const [width, tone, alpha] of [[9.5, shade, .55], [4.8, color, 1]]) {
      ctx.globalAlpha = alpha; ctx.strokeStyle = tone; ctx.lineWidth = width; ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const t = .16 + i * .052, p = rib(t), drop = 12 + i * 1.4;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 16 - i * .4, p.y - 18 + i * .2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 13 - i * .3, p.y + drop); ctx.stroke();
      }
      // Rib spine on top of each pass.
      ctx.lineWidth = width * .7; ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let t = 0; t <= 1.001; t += .1) { const p = rib(t); ctx.lineTo(p.x, p.y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
  };
  const set = tone === 'back'
    ? [[-.35, 118], [.1, 126], [.55, 122], [1.0, 116], [1.5, 110], [2.05, 116], [2.6, 108], [3.3, 114], [4.0, 106]]
    : [[.3, 124], [1.25, 112], [1.85, 108], [2.85, 114], [3.7, 104]];
  set.forEach(([a, l], i) => frond(a, l, i % 3 === 0 ? shade : i % 3 === 1 ? main : lit));
  if (tone === 'front') {
    ctx.fillStyle = '#8cc795';
    for (const [dx, dy] of [[-9, 4], [7, 8], [-2, 13], [12, 2]]) { ctx.beginPath(); ctx.arc(w * .5 + dx, h * .26 + dy, 5, 0, Math.PI * 2); ctx.fill(); }
  }
}
function drawPalmTrunk(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const trunk = ctx.createLinearGradient(w * .44, 0, w * .56, 0);
  trunk.addColorStop(0, '#9a7a56'); trunk.addColorStop(.42, '#b28d64'); trunk.addColorStop(1, '#6e4f36');
  ctx.fillStyle = trunk;
  ctx.beginPath(); ctx.moveTo(w * .47, h); ctx.quadraticCurveTo(w * .44, h * .4, w * .485, h * .26);
  ctx.lineTo(w * .515, h * .26); ctx.quadraticCurveTo(w * .55, h * .4, w * .53, h); ctx.closePath(); ctx.fill();
  // Baked ring bands + lit left edge + coconut cluster at the crown.
  ctx.strokeStyle = 'rgba(90,66,44,.45)'; ctx.lineWidth = 3;
  for (const y of [.36, .45, .54, .63, .72, .81, .9]) { ctx.beginPath(); ctx.moveTo(w * .458, h * y); ctx.lineTo(w * .54, h * y + 4); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(220,190,150,.35)'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(w * .472, h * .98); ctx.quadraticCurveTo(w * .448, h * .4, w * .49, h * .27); ctx.stroke();
  ctx.fillStyle = '#6f5238';
  for (const [dx, dy, r] of [[-7, 10, 6], [6, 12, 5.4], [0, 16, 5]]) { ctx.beginPath(); ctx.arc(w * .5 + dx, h * .26 + dy, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#5a4030';
  for (const [dx, dy, r] of [[-5.4, 11.5, 2.2], [7, 13, 2]]) { ctx.beginPath(); ctx.arc(w * .5 + dx, h * .26 + dy, r, 0, Math.PI * 2); ctx.fill(); }
}
function drawPalm(ctx, w, h) {
  // Full palm (single image) — used for the cross-axis impostor plane.
  drawPalmFronds(ctx, w, h, 'back');
  const trunkLayer = document.createElement('canvas'); trunkLayer.width = w; trunkLayer.height = h;
  drawPalmTrunk(trunkLayer.getContext('2d'), w, h);
  ctx.drawImage(trunkLayer, 0, 0);
  const frontLayer = document.createElement('canvas'); frontLayer.width = w; frontLayer.height = h;
  drawPalmFronds(frontLayer.getContext('2d'), w, h, 'front');
  ctx.drawImage(frontLayer, 0, 0);
}
function drawBlobShadow(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(35,48,58,.42)'); g.addColorStop(.7, 'rgba(35,48,58,.2)'); g.addColorStop(1, 'rgba(35,48,58,0)');
  ctx.fillStyle = g;
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(1, h / w); ctx.translate(-w / 2, -h / 2);
  ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); ctx.fill(); ctx.restore();
}
function drawBush(ctx, w, h) {
  // Organic foliage: dozens of overlapping leaf masses build the silhouette,
  // with baked light from upper-left, shaded core and ground AO.
  ctx.clearRect(0, 0, w, h);
  const blob = (cx, cy, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };
  // Dark back mass defines the full silhouette (irregular edge).
  blob(w * .5, h * .6, h * .37, '#356843');
  blob(w * .26, h * .66, h * .27, '#356843');
  blob(w * .74, h * .64, h * .29, '#356843');
  blob(w * .14, h * .74, h * .18, '#356843');
  blob(w * .86, h * .72, h * .19, '#356843');
  blob(w * .4, h * .42, h * .26, '#356843');
  blob(w * .63, h * .4, h * .23, '#356843');
  // Deterministic scatter of small leaf masses for a jagged, lush edge.
  for (let i = 0; i < 26; i++) {
    const a = i * 2.399963, t = (i % 9) / 9;
    const cx = w * .5 + Math.cos(a) * w * .33 * (.55 + t * .5);
    const cy = h * .6 + Math.sin(a) * h * .3 * (.5 + t * .45) - h * .06;
    blob(cx, cy, h * (.09 + (i % 4) * .022), i % 2 ? '#41794f' : '#356843');
  }
  // Mid and lit masses on top.
  blob(w * .42, h * .5, h * .24, '#4e8a5c');
  blob(w * .64, h * .52, h * .2, '#4e8a5c');
  blob(w * .3, h * .56, h * .16, '#5fa26e');
  blob(w * .36, h * .42, h * .17, '#6fae7d');
  blob(w * .56, h * .36, h * .15, '#82bd8f');
  // Leaf-cluster highlights.
  ctx.fillStyle = '#8cc795';
  for (const [x, y] of [[.3, .38], [.44, .3], [.58, .28], [.7, .4], [.24, .5], [.5, .44], [.64, .46]]) {
    ctx.beginPath(); ctx.ellipse(w * x, h * y, 5.5, 3.2, -.5, 0, Math.PI * 2); ctx.fill();
  }
  // Baked base AO grounds the bush.
  const ao = ctx.createLinearGradient(0, h * .76, 0, h);
  ao.addColorStop(0, 'rgba(35,48,58,0)'); ao.addColorStop(1, 'rgba(35,48,58,.42)');
  ctx.fillStyle = ao; ctx.fillRect(0, h * .76, w, h * .24);
}
function drawSkyPlane(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.save(); ctx.translate(w * .5, h * .5); ctx.rotate(-.22);
  ctx.beginPath(); ctx.moveTo(w * .46, 0); ctx.lineTo(-w * .34, h * .3); ctx.lineTo(-w * .16, 0); ctx.lineTo(-w * .34, -h * .3); ctx.closePath(); ctx.fill();
  ctx.fillRect(-w * .1, -h * .07, w * .34, h * .14);
  ctx.restore();
}
// --- D00 facade enrichment: baked glass reflections, canopy lights, clouds ---
function glassMullions(ctx, w, h, spacing, vertical = true) {
  ctx.fillStyle = 'rgba(24,50,74,.6)';
  for (let x = spacing; x < w - 2; x += spacing) ctx.fillRect(x - 3, 0, 6, h);
  if (vertical) { ctx.fillRect(0, 0, 4, h); ctx.fillRect(w - 4, 0, 4, h); }
}
function glassReflections(ctx, w, h, exterior = false) {
  // Cartoon glass: a clear pane with a sky sheen at the top and crisp diagonal
  // glints (hard-edged, like the reference). Low coverage so the interior
  // stays readable through the glazing behind this overlay.
  const sheen = ctx.createLinearGradient(0, 0, 0, h);
  sheen.addColorStop(0, exterior ? 'rgba(120,205,255,.26)' : 'rgba(110,166,206,.3)');
  sheen.addColorStop(.35, exterior ? 'rgba(120,205,255,.08)' : 'rgba(110,166,206,.12)');
  sheen.addColorStop(1, exterior ? 'rgba(120,205,255,0)' : 'rgba(110,166,206,.04)');
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w * .5, h * .5); ctx.rotate(-.5);
  const d = Math.hypot(w, h);
  const glint = (x, width, alpha) => {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.fillRect(x * d, -d, width * d, d * 2);
  };
  // Wide soft band, then two sharp slivers beside it.
  const soft = ctx.createLinearGradient(-d * .34, 0, -d * .02, 0);
  soft.addColorStop(0, 'rgba(255,255,255,0)'); soft.addColorStop(.5, `rgba(255,255,255,${exterior ? .14 : .26})`); soft.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = soft; ctx.fillRect(-d * .34, -d, d * .32, d * 2);
  glint(-.12, .07, exterior ? .28 : .3); glint(-.02, .018, exterior ? .38 : .34);
  glint(.2, .04, exterior ? .18 : .2); glint(.27, .012, exterior ? .3 : .26);
  ctx.restore();
  // Bright top edge (fresnel-like) and a thin dark bottom edge give the pane body.
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, 0, w, Math.max(2, h * .012));
  ctx.fillStyle = 'rgba(20,50,80,.18)'; ctx.fillRect(0, h - Math.max(2, h * .01), w, Math.max(2, h * .01));
  // Warm interior glow spilling at the bottom of the glass.
  const warm = ctx.createLinearGradient(0, h * .6, 0, h);
  warm.addColorStop(0, 'rgba(255,205,140,0)'); warm.addColorStop(1, exterior ? 'rgba(255,205,140,.1)' : 'rgba(255,205,140,.38)');
  ctx.fillStyle = warm; ctx.fillRect(0, h * .6, w, h * .4);
}
function drawFacadeGlass(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  glassReflections(ctx, w, h, true);
  glassMullions(ctx, w, h, w / 4);
  ctx.fillStyle = 'rgba(24,50,74,.5)'; ctx.fillRect(0, h * .55, w, 6);
}
function drawDoorGlass(ctx, w, h, exterior = false) {
  ctx.clearRect(0, 0, w, h);
  glassReflections(ctx, w, h, exterior);
  ctx.fillStyle = 'rgba(24,50,74,.7)';
  ctx.fillRect(0, 0, 5, h); ctx.fillRect(w - 5, 0, 5, h); ctx.fillRect(w / 2 - 3, 0, 6, h);
  ctx.fillRect(0, h * .52, w, 7);
  // Vertical pull handles at the meeting stiles.
  ctx.fillStyle = 'rgba(20,40,58,.85)';
  ctx.beginPath(); ctx.roundRect(w / 2 - 15, h * .3, 6, h * .34, 3); ctx.fill();
  ctx.beginPath(); ctx.roundRect(w / 2 + 9, h * .3, 6, h * .34, 3); ctx.fill();
}
// Clad wing wall (reference: assets of the old model's wall): warm beige
// panels with thin recessed joints, a horizontal joint at mid height and a
// slightly greyer plinth. `height` returns the matching height map (grooves
// dark) for the normal. Albedo only, no light painted in.
function drawWingCladding(ctx, w, h, metres, wallHeight, height = false) {
  const px = w / metres, py = h / wallHeight;
  ctx.fillStyle = height ? '#fff' : '#d4d0cb'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = height ? '#7a7a7a' : '#cecbc7'; ctx.fillRect(0, h - .16 * py, w, .16 * py);
  ctx.fillStyle = height ? '#000' : '#bbb6b0';
  const line = Math.max(2, Math.round(px * .03));
  for (const fraction of [1 / 3, 2 / 3]) ctx.fillRect(0, Math.round(h * fraction - line / 2), w, line);
}
function drawClerestoryGlass(ctx, w, h) {
  // Reflections only: the clerestory's mullions and transoms are real boxes.
  ctx.clearRect(0, 0, w, h);
  glassReflections(ctx, w, h, true);
}
// Clerestory glass recipe, shared by the D00 facade and the D01 south wall:
// baked reflections (tinted with the ambience) plus a front-only multiply
// filter that deepens the blue without a milky opaque wash, so whatever is
// behind keeps its contrast. Nearest the viewer goes the filter, then the
// reflections, then the view behind.
export const CLERESTORY_GLASS_SPAN = 12;   // metres one reflection texture should cover (≈ D00 clerestory)
export function createClerestoryGlass(scope) {
  const map = scope.own(texture(1024, 184, (c, w2, h2) => drawClerestoryGlass(c, w2, h2)));
  const reflections = scope.own(new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false }));
  scope.defer(luz.tintar(reflections, 'vidrio'));
  const filter = scope.own(new T.MeshBasicMaterial({ color: 0xa6dbff,
    transparent: true, blending: T.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, side: T.FrontSide }));
  const glassBlue = new T.Color(0xa6dbff);
  scope.defer(luz.alCambiar(ambience => filter.color.copy(glassBlue).multiply(new T.Color(ambience.tintes.vidrio))));
  return { reflections, filter };
}
function drawSoffit(ctx, w, h, spots, metres) {
  // Underside of a canopy: navy panels with joints, a darker edge trim and a
  // soft warm halo around each downlight (the fixtures themselves are 3D).
  ctx.fillStyle = '#123f69'; ctx.fillRect(0, 0, w, h);
  const ppm = w / metres, bays = Math.max(1, Math.round(metres / 1.3));
  ctx.fillStyle = '#174b77';
  for (let i = 0; i < bays; i += 2) ctx.fillRect(i * w / bays, 0, w / bays, h);
  ctx.strokeStyle = 'rgba(12,28,44,.65)'; ctx.lineWidth = 3;
  for (let i = 1; i < bays; i++) { ctx.beginPath(); ctx.moveTo(i * w / bays, 0); ctx.lineTo(i * w / bays, h); ctx.stroke(); }
  for (const v of [.22, .78]) { ctx.beginPath(); ctx.moveTo(0, h * v); ctx.lineTo(w, h * v); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(120,160,196,.22)'; ctx.lineWidth = 2;
  for (let i = 1; i < bays; i++) { ctx.beginPath(); ctx.moveTo(i * w / bays + 3, 0); ctx.lineTo(i * w / bays + 3, h); ctx.stroke(); }
  ctx.fillStyle = '#1a3550'; ctx.fillRect(0, 0, w, h * .07); ctx.fillRect(0, h * .93, w, h * .07);
  for (const spot of spots) {
    const [u, v] = Array.isArray(spot) ? spot : [spot, .5];
    const x = u * w, y = h * v, r = ppm * .75;
    const glow = ctx.createRadialGradient(x, y, ppm * .28, x, y, r);
    glow.addColorStop(0, 'rgba(255,214,150,.55)'); glow.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}
function drawBollardSide(ctx, w, h) {
  // Neutral albedo (no painted metal sheen: toon never gets specular): dark
  // charcoal lamp post with a slightly lighter collar under the lamp window
  // and a darker foot. The lamp window itself is an emissive ring.
  ctx.fillStyle = '#363f47'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#4a545c'; ctx.fillRect(0, h * .24, w, h * .04);
  ctx.fillStyle = '#262d33'; ctx.fillRect(0, h * .93, w, h * .07);
}
function drawBollardTop(ctx, w, h) {
  ctx.fillStyle = '#2f373e'; ctx.fillRect(0, 0, w, h);
}
// Night glow behind the glazing: the lit hall seen from the street.
function drawNightGlow(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,214,150,.18)'); g.addColorStop(.55, 'rgba(255,214,150,.42)'); g.addColorStop(1, 'rgba(255,200,130,.62)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
function drawSoil(ctx, w, h) {
  // Sunken soil: irregular low-poly silhouette, dark moist center, lighter dry
  // rim, a few flat speckles. Organic edge via deterministic radial jitter.
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const path = () => {
    ctx.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = i / 18 * Math.PI * 2;
      const r = 1 + Math.sin(i * 2.7) * .05 + Math.sin(i * 5.3) * .03;
      const px = cx + Math.cos(a) * w * .47 * r, py = cy + Math.sin(a) * h * .45 * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  };
  ctx.fillStyle = '#4a3a2b'; path(); ctx.fill();
  ctx.strokeStyle = '#5d4a35'; ctx.lineWidth = 7; path(); ctx.stroke();
  const moist = ctx.createRadialGradient(cx, cy, 4, cx, cy, w * .34);
  moist.addColorStop(0, '#33261c'); moist.addColorStop(1, '#33261c00');
  ctx.fillStyle = moist; path(); ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = 'rgba(126,99,68,.75)';
  for (let i = 0; i < 26; i++) {
    const a = i * 2.399963, t = .12 + (i % 7) / 7 * .8;
    const px = cx + Math.cos(a) * w * .4 * t, py = cy + Math.sin(a) * h * .38 * t;
    ctx.beginPath(); ctx.arc(px, py, 1.6 + (i % 3), 0, Math.PI * 2); ctx.fill();
  }
  // Baked top-light so the soil reads slightly domed, darker toward the walls.
  const shade = ctx.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(255,240,214,.1)'); shade.addColorStop(1, 'rgba(20,12,8,.28)');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
export function createExteriorKit() {
  const maps = {
    apron: texture(1024, 512, (c, w, h) => drawBackdrop(c, w, h, true)),
    curb: texture(1024, 512, (c, w, h) => drawBackdrop(c, w, h, false)),
    apronMid: texture(1024, 128, (c, w, h) => drawMid(c, w, h, true)),
    curbMid: texture(1024, 128, (c, w, h) => drawMid(c, w, h, false)),
    taxi: texture(256, 128, (c, w, h) => drawVehicle(c, w, h, false)),
    shuttle: texture(256, 128, (c, w, h) => drawVehicle(c, w, h, true)),
  };
  const materials = Object.fromEntries(Object.entries(maps).map(([key, map]) => [key,
    new T.MeshBasicMaterial({ map, transparent: ['taxi', 'shuttle', 'apronMid', 'curbMid', 'apron', 'curb'].includes(key), depthWrite: false, side: T.DoubleSide })]));
  // Far painted layers are not relit: they take the ambience tint (atmosphere).
  const untint = Object.values(materials).map(m => luz.tintar(m, 'fondo'));
  return { materials, dispose() { untint.forEach(off => off()); Object.values(materials).forEach(m => m.dispose()); Object.values(maps).forEach(m => m.dispose()); } };
}

export async function buildEntranceForecourt(meta, scope, kit, group, interactive, colliders, worldPosition, doors, registry) {
  const { width: w, depth: d } = meta, edge = d / 2;
  // Soffit plane: 2.9 m deep, centred at edge + 1.35; canvas top = street edge.
  const [porticoWest, porticoEast] = PORTICO_X, [porticoBack, porticoFace] = PORTICO_Z, lawnEdge = PORTICO_LAWN_EDGE;
  const porticoW = porticoEast - porticoWest, porticoD = porticoFace - porticoBack;
  // Portico soffit canvas runs along the walk: u = z (back -> front), v = x (west -> east).
  const porticoSpots = [...PORTICO_SPOTS, ...PORTICO_BACK_SPOTS]
    .map(([x, z]) => [(z - porticoBack) / porticoD, (x - porticoWest) / porticoW]);
  const maps = {
    sidewalk: texture(512, 512, (c, w2, h2) => drawSidewalk(c, w2, h2)),
    crosswalk: texture(512, 512, (c, w2, h2) => drawCrosswalk(c, w2, h2, 7.1, 7, .6)),
    street: texture(512, 512, (c, w2, h2) => drawStreetBand(c, w2, h2, 8, STREET.far - STREET.curb)),
    accessAsphalt: texture(512, 512, (c, w2, h2) => drawStreetBand(c, w2, h2, 8, 8, false)),
    tactile: texture(768, 128, (c, w2, h2) => drawTactile(c, w2, h2, 3)),
    hallFloor: texture(2048, 2048, (c, w2, h2) => drawHallFloor(c, w2, h2, HALL_SLABS[0], HALL_SLABS[1])),
    directory: texture(256, 512, (c, w2, h2) => drawDirectory(c, w2, h2)),
    promo: texture(256, 512, (c, w2, h2) => drawPromo(c, w2, h2)),
    blobShadow: texture(128, 64, (c, w2, h2) => drawBlobShadow(c, w2, h2)),
    skyPlane: texture(128, 64, (c, w2, h2) => drawSkyPlane(c, w2, h2)),
    facadeGlass: texture(512, 312, (c, w2, h2) => drawFacadeGlass(c, w2, h2)),
    doorGlass: texture(256, 354, (c, w2, h2) => drawDoorGlass(c, w2, h2)),
    doorGlassExterior: texture(256, 354, (c, w2, h2) => drawDoorGlass(c, w2, h2, true)),
    // Soffits: the D00 canopy (13 m, centred at x .4) and the two portico spans.
    soffit: texture(1024, 228, (c, w2, h2) => drawSoffit(c, w2, h2, CANOPY_SPOTS.map(x => (x + FACADE.canopyWidth / 2) / FACADE.canopyWidth), FACADE.canopyWidth)),
    soffitPortico: texture(1024, 400, (c, w2, h2) => drawSoffit(c, w2, h2, porticoSpots, porticoD)),
    bollardSide: texture(64, 128, (c, w2, h2) => drawBollardSide(c, w2, h2)),
    bollardTop: texture(64, 64, (c, w2, h2) => drawBollardTop(c, w2, h2)),
    soil: texture(192, 128, (c, w2, h2) => drawSoil(c, w2, h2)),
    nightGlow: texture(64, 128, (c, w2, h2) => drawNightGlow(c, w2, h2)),
  };
  scope.defer(() => Object.values(maps).forEach(m => m.dispose()));
  // Illustrations that are not relit take a tint from the ambience (Luz25D).
  const tinted = (material, kind) => { if (kind) scope.defer(luz.tintar(material, kind)); return material; };
  const flat = (name, cutout = false, kind = null) => tinted(scope.own(new T.MeshBasicMaterial({ map: maps[name], transparent: cutout, depthWrite: !cutout, side: cutout ? T.DoubleSide : T.FrontSide })), kind);
  // Crisp cutout: alphaTest avoids transparency sorting issues between layers.
  const sheer = (name, kind = 'vidrio') => tinted(scope.own(new T.MeshBasicMaterial({ map: maps[name], transparent: true, depthWrite: false })), kind);
  // Big ground surfaces are relit: neutral albedo + slab relief + shared light.
  const slabNormal = scope.own(normalBaldosa());
  const ground = (name, repeat = [1, 1], slabs = null, worldUV = false) => {
    let map = maps[name];
    if (repeat[0] !== 1 || repeat[1] !== 1 || worldUV) {
      map = scope.own(map.clone()); map.wrapS = map.wrapT = T.RepeatWrapping; map.needsUpdate = true;
    }
    map.anisotropy = 4;
    return scope.own(crearMaterialToon({ albedo: map, repetir: repeat,
      ...(slabs ? { normal: slabNormal, repetirNormal: slabs, fuerzaNormal: .45 } : {}) }));
  };
  const outlined = (mesh, color, level = 'medio') => { const hull = contornoDe(mesh, kit.outline(color, level)); scope.defer(() => hull.removeFromParent()); return mesh; };
  const plane = (material, w2, h2, x, y, z, rotY = 0, flat2 = false, down = false) => {
    const object = new T.Mesh(scope.own(new T.PlaneGeometry(w2, h2)), material);
    object.position.set(x, y, z); object.rotation.y = rotY;
    if (flat2) object.rotation.x = down ? Math.PI / 2 : -Math.PI / 2;
    group.add(object); scope.defer(() => object.removeFromParent()); return object;
  };
  const offset = new T.Vector3(worldPosition.x, 0, worldPosition.z);
  const solid = (x, z, w, d) => {
    const box = new T.Box3(
      new T.Vector3(x - w / 2, 0, z - d / 2).add(offset), new T.Vector3(x + w / 2, 3, z + d / 2).add(offset));
    colliders.push(box);
    return box;
  };
  // Anything tagged `movable` can be selected with a right-click in the viewer
  // and nudged with the arrow keys (see lab.js). Each entity moves alone.
  const movable = (object, label, extra = {}) => {
    object.userData.movable = { label, ...extra };
    return object;
  };
  // Ground, front to back: pavement of 1 m concrete slabs up to a raised
  // kerb, a two-lane road one kerb-drop lower with a full-width zebra, and
  // the far pavement. The slab normal map repeats once per metre, so the
  // joints catch the light with a hard edge.
  const { curb, far, drop } = STREET, road = far - curb, roadY = -drop;
  const paving = (x, z, w2, d2, y) => plane(ground('sidewalk', [w2 / 4, d2 / 4], [w2, d2]), w2, d2, x, y, z, 0, true);
  paving(0, (edge + curb) / 2, 14, curb - edge, .012);
  // West strip: from the lawn kerb to the road, and the walk under the portico.
  paving(-27.5, (lawnEdge + curb) / 2, 41, curb - lawnEdge, .014);
  paving((PORTICO_LAWN_WEST - 7) / 2, (porticoBack + lawnEdge) / 2, -7 - PORTICO_LAWN_WEST, lawnEdge - porticoBack, .014);
  paving(-8.5, (far + 23.29) / 2, 79, 23.29 - far, .012);
  plane(ground('street', [79 / 8, 1]), 79, road, -8.5, roadY + .016, (curb + far) / 2, 0, true);
  const zebra = scope.own(crearMaterialToon({ albedo: maps.crosswalk, corteAlfa: .5 }));
  plane(zebra, 7.1, road - .5, 0, roadY + .024, (curb + far) / 2, 0, true);
  // Kerbs: long light-concrete stones whose top sits a touch above the slabs;
  // the vertical face shows the drop to the asphalt. Thin joints every metre
  // on the top and the face (too thin to take an outline).
  const kerbs = [[curb - .15, 1], [far + .15, -1]];
  boxes(scope, kit, group, 'concrete', kerbs.map(([z]) => [-8.5, (roadY + .022) / 2, z, 79, drop + .022, .3]));
  const kerbJoints = [];
  for (const [z, facing] of kerbs) for (let x = -47.5; x < 31; x += 1) {
    kerbJoints.push([x, .023, z, .025, .004, .3], [x, roadY / 2, z + facing * .151, .025, drop, .004]);
  }
  boxes(scope, kit, group, 'kerbJoint', kerbJoints);
  // Tactile warning paving on the door axis, between the door posts and the kerb.
  const tactileHeight = document.createElement('canvas'); tactileHeight.width = 768; tactileHeight.height = 128;
  drawTactile(tactileHeight.getContext('2d'), 768, 128, 3, true);
  const tactileNormal = scope.own(normalDesdeAltura(tactileHeight, { fuerza: 2.4, suavizado: 1.2 }));
  plane(scope.own(crearMaterialToon({ albedo: maps.tactile, normal: tactileNormal, fuerzaNormal: .8 })), 3.9, .6, 0, .02, 8.2, 0, true);
  // Entrance hall floor: grey 120 x 60 cm porcelain in a straight grid.
  // One canvas = HALL_SLABS slabs = a square of HALL_SLABS * slab metres.
  const period = HALL_SLABS[0] * ENTRANCE_HALL.slab[0];
  plane(ground('hallFloor', [w / period, d / period]), w, d, 0, .02, 0, 0, true);
  // The transparent receivers keep the illustrated ground intact while
  // accepting alpha-cut sun shadows from the vertical vegetation.
  // Sun shadows MULTIPLY the ground by the ambience's cold tone (never black).
  for (const [x, z, w2, d2, y] of [
    [0, (edge + curb) / 2, 14, curb - edge, .04], [-14, (lawnEdge + curb) / 2, 16, curb - lawnEdge, .041],
    [(PORTICO_LAWN_WEST - 7) / 2, (porticoBack + lawnEdge) / 2, -7 - PORTICO_LAWN_WEST, lawnEdge - porticoBack, .042],
    [-8.5, (curb + far) / 2, 79, road, roadY + .04],
  ]) plane(scope.own(crearReceptorSombra(.9)), w2, d2, x, y, z, 0, true).receiveShadow = true;
  // View-only garden behind the portico: lawn, layered parallax trees, shrubs
  // and a flat horizon treeline (engine/PorticoGarden.js).
  const garden = buildPorticoGarden({ scope, kit, group, movable });
  // (Facade signage, canopy slab and portal frame live in the D00 shell; here
  // only baked 2D enrichment layers are added on top of that 3D shell.)
  // Glass curtain: baked reflections + mullions over the shell glazing, warm
  // interior glow at the bottom. FrontSide so the interior view is untouched.
  const glassMaterial = sheer('facadeGlass');
  plane(glassMaterial, 3.8, 4.05, -(w + 6.4) / 4, 2.5, edge + .06);
  plane(glassMaterial, 3.8, 4.05, (w + 6.4) / 4, 2.5, edge + .06);
  // At dusk and night the lit hall glows warm behind the glass (night decal).
  const glowMaterial = scope.own(new T.MeshBasicMaterial({ map: maps.nightGlow, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
  const clerestoryHeight = 2.5;
  for (const [x, width, height, y, z] of [[-(w + 6.4) / 4, 3.8, 4.05, 2.5, edge + .05], [(w + 6.4) / 4, 3.8, 4.05, 2.5, edge + .05], [0, w, clerestoryHeight, 5 + clerestoryHeight / 2, edge + .005]]) {
    scope.defer(luz.registrarDecal(plane(glowMaterial, width, height, x, y, z), .85, 'noche'));
  }
  // Keep the original glass finish on the interior face of the moving doors.
  const doorGlassMaterial = tinted(scope.own(new T.MeshBasicMaterial({ map: maps.doorGlass, transparent: true, depthWrite: false, side: T.BackSide })), 'vidrio');
  const exteriorDoorGlass = sheer('doorGlassExterior');
  for (const { panel } of doors) {
    panel.material = doorGlassMaterial;
    const frontPane = new T.Mesh(panel.geometry, exteriorDoorGlass);
    frontPane.position.z = .003; panel.add(frontPane);
    scope.defer(() => frontPane.removeFromParent());
  }
  // Clerestory: reflections over the tall glazing (its bays are 3D in the shell)
  // and the blue multiply filter in front (createClerestoryGlass, shared with D01).
  const { reflections: clerestoryReflections, filter: blueFilter } = createClerestoryGlass(scope);
  plane(clerestoryReflections, w - FACADE.pierWidth, clerestoryHeight, 0, 5 + clerestoryHeight / 2, edge + .015);
  plane(blueFilter, w - FACADE.pierWidth, clerestoryHeight, 0, 5 + clerestoryHeight / 2, edge + .025);
  // Same filter, but lighter, on the lower side panes so they read as glass.
  const sideFilter = scope.own(blueFilter.clone());
  const sideBlue = new T.Color(0xc4e6ff);
  scope.defer(luz.alCambiar(ambience => sideFilter.color.copy(sideBlue).multiply(new T.Color(ambience.tintes.vidrio))));
  for (const x of [-(w + 6.4) / 4, (w + 6.4) / 4]) plane(sideFilter, 3.8, 4.05, x, 2.5, edge + .055);
  // Soffits with panel joints, and one 3D downlight per scene lamp: a metal
  // bezel, a warm emissive lens and a hot centre (emissive, never relit).
  plane(flat('soffit'), FACADE.canopyWidth, FACADE.canopyDepth, 0, CANOPY_SOFFIT - .01, FACADE.canopyZ, 0, true, true);
  plane(flat('soffitPortico'), porticoD, porticoW, (porticoWest + porticoEast) / 2, 5.335, (porticoBack + porticoFace) / 2, 0, true, true).rotation.z = Math.PI / 2;
  const bezelGeometry = scope.own(conNormalContorno(new T.CylinderGeometry(.3, .27, .05, 28)));
  const lensGeometry = scope.own(new T.CircleGeometry(.215, 28));
  const hotGeometry = scope.own(new T.CircleGeometry(.1, 20));
  const lensMaterial = scope.own(new T.MeshBasicMaterial({ color: '#ffe2a6' }));
  const hotMaterial = scope.own(new T.MeshBasicMaterial({ color: '#fffaf0' }));
  for (const [spots, y, z] of [
    [CANOPY_SPOTS.map(x => [x, FACADE.canopyZ]), CANOPY_SOFFIT - .012],
    [[...PORTICO_SPOTS, ...PORTICO_BACK_SPOTS], 5.35 - .012],
  ]) for (const [x, z] of spots) {
    const bezel = new T.Mesh(bezelGeometry, kit.materials.lightMetal);
    bezel.position.set(x, y - .025, z); group.add(bezel); scope.defer(() => bezel.removeFromParent());
    outlined(bezel, 'lightMetal', 'fino');
    for (const [geometry, material, lower] of [[lensGeometry, lensMaterial, .052], [hotGeometry, hotMaterial, .054]]) {
      const disc = new T.Mesh(geometry, material);
      disc.position.set(x, y - lower, z); disc.rotation.x = Math.PI / 2;
      group.add(disc); scope.defer(() => disc.removeFromParent());
    }
  }
  // (No painted light pools under the canopy any more: its spots are scene
  // lamps (AirportChunk) that pool on the relit pavement at dusk and night.)
  // Sky: volumetric toon clouds. Each cloud is a cluster of squashed spheres
  // on a flat base (big puffs in the middle, small ones at the edges) shaded
  // by the shared light in 3 bands: warm white on top, cold blue underside.
  const puffGeometry = scope.own(new T.SphereGeometry(1, 28, 18));
  // Cartoon cloud shading (reference: assets/clouds): bright white crown that
  // falls softly to a sky-blue belly, following the ambience colours.
  const cloudMaterial = scope.own(new T.ShaderMaterial({
    uniforms: { uTop: { value: new T.Color('#ffffff') }, uBelly: { value: new T.Color('#a9c9f0') } },
    vertexShader: 'varying vec3 vN; void main() { vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uTop; uniform vec3 uBelly; varying vec3 vN; void main() { float k = smoothstep(-.55, .45, normalize(vN).y); gl_FragColor = vec4(mix(uBelly, uTop, k), 1.0);\n#include <colorspace_fragment>\n}',
  }));
  scope.defer(luz.alCambiar(A => {
    cloudMaterial.uniforms.uTop.value.set(A.nubes);
    cloudMaterial.uniforms.uBelly.value.set(A.nubes).lerp(new T.Color(A.cielo[1]), .55);
  }));
  const cloud = (width, x, y, z, seed) => {
    let s = seed;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const puffs = new T.Group();
    const add = (px, py, pz, r) => {
      const puff = new T.Mesh(puffGeometry, cloudMaterial);
      puff.position.set(px, py, pz); puff.scale.set(r, r * .86, r * .8);
      puffs.add(puff);
    };
    const half = width / 2;
    // Flat, wide base row of small puffs.
    for (let i = 0, n = Math.round(width * .9); i <= n; i++) {
      const t = i / n * 2 - 1, u = 1 - t * t;
      add(t * half, .15 + rand() * .15, (rand() - .5) * .6, .55 + u * .55 + rand() * .2);
    }
    // Rounded crown: fewer, bigger puffs rising towards the middle.
    for (let i = 0, n = Math.max(3, Math.round(width * .45)); i < n; i++) {
      const t = (i + .5) / n * 2 - 1, u = 1 - t * t;
      add(t * half * .78, .5 + u * width * .12 + rand() * .3, (rand() - .5) * .5 - .2, .7 + u * width * .1 + rand() * .25);
    }
    // One or two top domes.
    add((rand() - .6) * width * .2, width * .17 + .5, -.3, width * .17 + .4);
    if (width > 7) add(width * .16, width * .12 + .5, -.1, width * .12 + .3);
    puffs.position.set(x, y, z);
    group.add(puffs); scope.defer(() => puffs.removeFromParent());
    return puffs;
  };
  // Clouds live high in the real sky BEHIND the terminal (the view from the
  // forecourt looks at the building), above its roof line, never on the flat
  // city painting. lab.js saves nudged positions as `label#traversal-index`,
  // so this slot must keep EXACTLY 4 movables (bollards, palms... follow);
  // extra clouds are appended at the very end of the forecourt. The label is
  // new on purpose: old saved `nube#N` positions (on the painting) are ignored.
  const skyCloud = ([width, x, y, z, seed, turn]) => {
    const c = cloud(width, x, y, z, seed);
    c.rotation.y = turn; c.scale.setScalar(1.35);
    c.traverse(o => { o.frustumCulled = false; });
    return movable(c, 'nube del cielo');
  };
  for (const spec of [
    [16, -24, 36, -26, 11, .2], [12, 6, 42, -32, 29, 0], [10, 28, 34, -22, 47, -.25], [8, -8, 46, -38, 83, .1],
  ]) skyCloud(spec);
  // Lamp bollards: charcoal posts with a glowing lamp window near the top
  // (emissive ring, never relit) under a dark cap (near = 3D, albedo baked).
  const bollardSide = scope.own(crearMaterialToon({ albedo: maps.bollardSide, bandas: 3 }));
  const bollardTop = scope.own(crearMaterialToon({ albedo: maps.bollardTop, bandas: 3 }));
  const bollardGeometry = scope.own(new T.CylinderGeometry(.09, .1, .95, 14));
  const capGeometry = scope.own(new T.CircleGeometry(.09, 14));
  const lampGeometry = scope.own(new T.CylinderGeometry(.094, .094, .22, 14, 1, true));
  const lampMaterial = scope.own(new T.MeshBasicMaterial({ color: '#fff3d4' }));
  for (const x of [-10.7, -3.2, 3.2, 10.7]) {
    const bollard = movable(new T.Group(), 'bolardo');
    bollard.position.set(x, 0, 6.15);
    group.add(bollard); scope.defer(() => bollard.removeFromParent());
    const post = new T.Mesh(bollardGeometry, bollardSide);
    post.position.set(0, .475, 0); post.castShadow = true;
    bollard.add(post); scope.defer(() => post.removeFromParent());
    outlined(post, 0x363f47);
    const lamp = new T.Mesh(lampGeometry, lampMaterial);
    lamp.position.set(0, .8, 0);
    bollard.add(lamp); scope.defer(() => lamp.removeFromParent());
    const cap = new T.Mesh(capGeometry, bollardTop);
    cap.position.set(0, .955, 0); cap.rotation.x = -Math.PI / 2;
    bollard.add(cap); scope.defer(() => cap.removeFromParent());
  }
  // Exterior check-in facade mirrors the portico's width and roof line.
  // Its wall face is coplanar with the entrance glass. The existing street-only
  // swap preserves D01's real shell and furniture when the camera goes inside.
  const facadeKit = createFacadeKit(scope, kit);
  // The check-in wing reaches D01's outer edge, aligned with the road's right end.
  const entranceRoom = DEPARTURE_ROUTE.find(zone => zone.id === 'D00');
  const checkinRoom = DEPARTURE_ROUTE.find(zone => zone.id === 'D01');
  const checkinOuter = checkinRoom.center[0] + checkinRoom.width / 2 - entranceRoom.center[0];
  const wingX = [FACADE.sideInner, checkinOuter], wingZ = [PORTICO_Z[0], FACADE.sideFront], wingTop = FACADE.sideTop - .3;
  const wingW = wingX[1] - wingX[0], wingCX = (wingX[0] + wingX[1]) / 2;
  const wingD = wingZ[1] - wingZ[0], wingCZ = (wingZ[0] + wingZ[1]) / 2;
  const wing = new T.Group(); group.add(wing); scope.defer(() => wing.removeFromParent());
  boxes(scope, facadeKit, wing, 'wall', [[wingCX, wingTop / 2, wingCZ, wingW, wingTop, wingD]]).castShadow = true;
  // The reference's right wing has cladding up to the grey coping and a thin
  // dark joint, rather than the open portico's deep navy soffit band.
  const wingRoofD = FACADE.sideFront - wingZ[0], wingRoofZ = (FACADE.sideFront + wingZ[0]) / 2;
  boxes(scope, facadeKit, wing, 'navy', [[wingCX, wingTop - .025, wingRoofZ, wingW, .05, wingRoofD]]).castShadow = true;
  const copingInset = .045;
  boxes(scope, facadeKit, wing, 'roofMetal', [[wingCX, 6.03, wingRoofZ, wingW - 2 * copingInset, .3, wingRoofD - 2 * copingInset]]);
  // Cladding faces (front and the short west side) share one panel grid.
  const cladding = (metres, x, z, rotY) => {
    const px = 64, cw = Math.round(metres * px), ch = Math.round(wingTop * px);
    const albedo = texture(cw, ch, (c, a, b) => drawWingCladding(c, a, b, metres, wingTop));
    const heightMap = document.createElement('canvas'); heightMap.width = cw; heightMap.height = ch;
    drawWingCladding(heightMap.getContext('2d'), cw, ch, metres, wingTop, true);
    const material = scope.own(crearMaterialToon({ albedo: scope.own(albedo), normal: scope.own(normalDesdeAltura(heightMap, { fuerza: 1.6, suavizado: 1 })), fuerzaNormal: .7 }));
    return plane(material, metres, wingTop, x, wingTop / 2, z, rotY);
  };
  wing.attach(cladding(wingW, wingCX, wingZ[1] + .006, 0));
  wing.attach(cladding(wingD, wingX[0] - .006, wingCZ, -Math.PI / 2));
  paving(wingCX, (wingZ[1] + curb) / 2, wingW, curb - wingZ[1], .012);
  plane(scope.own(crearReceptorSombra(.9)), wingW, curb - wingZ[1], wingCX, .04, (wingZ[1] + curb) / 2, 0, true).receiveShadow = true;
  solid(wingCX, wingCZ, wingW, wingD);
  // Lighting: D01's room rectangle is cut back to the facade line while the
  // wing stands in, so the wing and the pavement in front take the sun.
  const rooms = DEPARTURE_ROUTE.map(({ center: [x, z], width, depth }) => [x - width / 2, z - depth / 2, x + width / 2, z + depth / 2]);
  const streetRooms = rooms.map(([x0, z0, x1, z1], i) => DEPARTURE_ROUTE[i].id === 'D01' ? [x0, z0, x1, Math.min(z1, worldPosition.z + edge)] : [x0, z0, x1, z1]);
  let outside = null, neighbour = null;
  const streetView = on => {
    if (on === outside) return;
    outside = on; wing.visible = on;
    neighbour = group.parent?.parent?.getObjectByName('D01') || null;
    if (neighbour) neighbour.visible = !on;
    luz.salas(on ? streetRooms : rooms);
  };
  scope.defer(() => { if (neighbour) neighbour.visible = true; if (outside) luz.salas(rooms); });
  // The supplied shrub atlas is used directly; both cards share one crop and
  // sit behind the existing planter wall.
  const planters = [[-9.2, 6.8, 1.5], [9.2, 6.8, 1.5]];
  const bushGeometry = bottomCenterPlane(scope, 1.5, .85);
  const bushUv = bushGeometry.getAttribute('uv');
  for (let i = 0; i < bushUv.count; i++) {
    bushUv.setXY(i, (18 + bushUv.getX(i) * 505) / 1983,
      1 - (475 + (1 - bushUv.getY(i)) * 310) / 793);
  }
  bushUv.needsUpdate = true;
  const bushMap = scope.own(new T.TextureLoader().load(new URL('../assets/entrance-shrub-atlas.png', import.meta.url).href));
  bushMap.colorSpace = T.SRGBColorSpace;
  bushMap.minFilter = T.LinearMipmapLinearFilter;
  bushMap.magFilter = T.LinearFilter;
  const bushMaterial = scope.own(new T.MeshBasicMaterial({ map: bushMap, transparent: true, alphaTest: .12, side: T.DoubleSide, depthWrite: true }));
  scope.defer(luz.tintar(bushMaterial, 'vegetacion'));
  const soilShadow = flat('blobShadow', true);
  const soilShadowGeometry = scope.own(new T.PlaneGeometry(1, 1));
  for (const [x, z, w] of planters) {
    const planter = movable(new T.Group(), 'jardinera con arbustos');
    planter.position.set(x, 0, z);
    group.add(planter); scope.defer(() => planter.removeFromParent());
    const wallPiece = (px, py, pz, w2, h2, d2, color) => {
      const piece = new T.Mesh(kit.box, kit.materials[color]);
      piece.position.set(px, py, pz); piece.scale.set(w2, h2, d2);
      planter.add(piece); scope.defer(() => piece.removeFromParent());
      outlined(piece, color);
    };
    wallPiece(0, .28, 0, w, .56, .62, 'floor');
    wallPiece(0, .575, 0, w + .08, .035, .7, 'trim');
    for (const rot of [0, Math.PI / 2]) {
      const foliage = new T.Mesh(bushGeometry, bushMaterial);
      foliage.position.set(0, .53, 0); foliage.rotation.y = rot;
      foliage.scale.set(rot ? .48 : .95, .95, 1);
      planter.add(foliage); scope.defer(() => foliage.removeFromParent());
    }
    const contact = new T.Mesh(soilShadowGeometry, soilShadow);
    contact.position.set(0, .6, 0); contact.rotation.x = -Math.PI / 2;
    contact.scale.set(w * .75, .31, 1);
    planter.add(contact); scope.defer(() => contact.removeFromParent());
    planter.userData.collider = solid(x, z, w, .66);
  }
  // Self-service totems (2.5D: dark box + baked front), faces toward the doors.
  const totems = [
    ['directory', 4.5, 'airport.entrance.directory'],
    ['promo', -4.5, 'airport.entrance.promo'],
  ];
  for (const [name, x, semanticId] of totems) {
    const totem = movable(new T.Group(), 'tótem');
    totem.position.set(x, 0, 6.5);
    group.add(totem); scope.defer(() => totem.removeFromParent());
    const body = new T.Mesh(kit.box, kit.materials.navy);
    body.position.set(0, 1.4, 0); body.scale.set(1.2, 2.8, .4);
    totem.add(body); scope.defer(() => body.removeFromParent());
    outlined(body, 'navy');
    const front = new T.Mesh(scope.own(new T.PlaneGeometry(1.12, 2.68)), flat(name, false, 'cartel'));
    front.position.set(0, 1.4, .21);
    front.userData = { semanticId, zoneId: 'D00', interactionType: 'inspect' };
    totem.add(front); scope.defer(() => front.removeFromParent());
    interactive.push(front);
    const plinth = new T.Mesh(kit.box, kit.materials.accent);
    plinth.position.set(0, .06, 0); plinth.scale.set(1.3, .12, .5);
    totem.add(plinth); scope.defer(() => plinth.removeFromParent());
    outlined(plinth, 'accent');
    totem.userData.collider = solid(x, 6.5, 1.3, .5);
  }
  // The supplied GLB replaces the earlier procedural palms. Each palm is
  // planted in a real planter: solid body + overhanging rim lip, sunken soil
  // that physically hides the trunk's lower cut, and baked contact shadows.
  // Palm and base are SEPARATE movable entities (userData.movable): a
  // right-click on the tree moves only the tree; on the planter, only the
  // base. The trunk→soil AO and the canopy shadow follow the tree as
  // `followers` (scene-level planes nudged along by lab.js, which also keeps
  // them safe from the tree's own 6.4× scale).
  const shadowMaterial = flat('blobShadow', true);
  const shadowGeometry = scope.own(new T.PlaneGeometry(1, 1));
  // The right palm stands in front of the clad wing, as in the reference.
  const palmPositions = [[-6.1, 8.1], [8.1, 8.3]];
  const soilMaterial = tinted(scope.own(new T.MeshBasicMaterial({ map: maps.soil, transparent: true, alphaTest: .5, depthWrite: true, side: T.DoubleSide })), 'vegetacion');
  const soilGeometry = scope.own(new T.PlaneGeometry(1.42, .92));
  const soilY = .63; // a few cm below the rim lip, above the wall top (.62)
  const trees = await addEntrancePalms({ registry, scope, kit, group, positions: palmPositions });
  const boxPiece = (parent, color, px, py, pz, w, h, d) => {
    const piece = new T.Mesh(kit.box, kit.materials[color]);
    piece.position.set(px, py, pz); piece.scale.set(w, h, d);
    parent.add(piece); scope.defer(() => piece.removeFromParent());
    return outlined(piece, color);
  };
  const shadowPlane = (parent, px, py, pz, sx, sy) => {
    const piece = new T.Mesh(shadowGeometry, shadowMaterial);
    piece.position.set(px, py, pz); piece.rotation.x = -Math.PI / 2; piece.scale.set(sx, sy, 1);
    parent.add(piece); scope.defer(() => piece.removeFromParent());
    return piece;
  };
  for (let i = 0; i < palmPositions.length; i++) {
    const [x, z] = palmPositions[i];
    // Planter base: walls + rim lip + sunken soil + planter→floor shadow.
    const planter = movable(new T.Group(), i ? 'base de la palmera del ala' : 'base de la palmera');
    planter.position.set(x, 0, z);
    group.add(planter); scope.defer(() => planter.removeFromParent());
    boxPiece(planter, 'floor', 0, .31, 0, 1.52, .62, 1.02);
    boxPiece(planter, 'trim', 0, .68, -.55, 1.68, .05, .12);
    boxPiece(planter, 'trim', 0, .68, .55, 1.68, .05, .12);
    boxPiece(planter, 'trim', -.77, .68, 0, .12, .05, 1.16);
    boxPiece(planter, 'trim', .77, .68, 0, .12, .05, 1.16);
    const soil = new T.Mesh(soilGeometry, soilMaterial);
    soil.position.set(0, soilY, 0); soil.rotation.x = -Math.PI / 2;
    planter.add(soil); scope.defer(() => soil.removeFromParent());
    shadowPlane(planter, 0, .018, 0, 1.95, 1.4);
    planter.userData.collider = solid(x, z, 1.7, 1.2);
    // Palm tree: sink the trunk until its lowest point sits ~5 cm under the
    // soil so the geometry (not just the position) plants it — the soil hides
    // the cut. The tree then moves alone; its baked AO/shadows follow it.
    const tree = trees[i];
    const bounds = new T.Box3().setFromObject(tree);
    if (bounds.min.y > soilY - .05) tree.position.y -= bounds.min.y - (soilY - .05);
    // The right pair has its own label: saved spots from the old wall are ignored.
    movable(tree, i ? 'palmera del ala' : 'palmera');
    const junction = shadowPlane(group, x, soilY + .004, z - .12, .85, .55);
    const canopy = shadowPlane(group, x + .3, .022, z + .25, 2.2, 1.2);
    tree.userData.movable.followers = [junction, canopy];
  }
  // Distant plane in the sky, over the backdrop rooftops.
  movable(plane(flat('skyPlane', true, 'nubes'), 2.4, 1.1, -7, 11, 30), 'fondo del cielo');
  // Extra sky clouds: after every older movable so saved indices stay put.
  for (const spec of [[13, -46, 32, -8, 101, .9], [11, 44, 33, -10, 131, -.9]]) skyCloud(spec);
  // Animals (not movable, so saved indices stay put). A failed load must not break the scene.
  let animals = null;
  try { animals = await addExteriorAnimals({ scope, group, edge }); group.userData.animals = animals.animals; }
  catch (error) { console.warn('Animales del exterior:', error); }
  // Append after the existing movable objects so their saved indices stay stable.
  buildEntranceAccess({ scope, kit, group, origin: worldPosition, colliders,
    pavingMaterial: ground('sidewalk', [1,1], [4,4], true),
    asphaltMaterial: ground('accessAsphalt', [1,1], null, true), bushGeometry, bushMaterial });
  return { update(dt, camera) {
    garden.update(dt, camera, worldPosition);
    const outsideNow = camera.position.z > worldPosition.z + edge + .2;
    streetView(outsideNow);
    trees.update(dt, outsideNow);
    animals?.update(dt, camera, outsideNow);
  } };
}

export async function buildExteriorIllusion(meta, scope, kit, group, interactive, colliders = [], worldPosition = new T.Vector3(), doors = [], registry) {
  if (!['D00', 'D05', 'A04', 'A05'].includes(meta.id)) return { update() {} };
  const apron = meta.id === 'D05', edge = meta.depth / 2;
  // D05's window: the Blender airport as a 2.5D set (GateApron.js).
  if (apron) return buildGateApron(meta, scope, kit, group);
  const forecourt = meta.id === 'D00' ? await buildEntranceForecourt(meta, scope, kit, group, interactive, colliders, worldPosition, doors, registry) : null;
  const layer = (name, width, height, x, y, z) => {
    const object = new T.Mesh(scope.own(new T.PlaneGeometry(width, height)), kit.exterior.materials[name]);
    object.position.set(x, y, z); group.add(object); scope.defer(() => object.removeFromParent()); return object;
  };
  if (meta.id !== 'D00') {
    layer(apron ? 'apron' : 'curb', 74, 18, 0, 8.8, edge + 37);
    layer(apron ? 'apronMid' : 'curbMid', 38, 4.4, 0, 2.2, edge + 23);
  }
  // D00 keeps its forecourt free of vehicles (style guide: no cars for now).
  const vehicle = meta.id === 'D00' ? null : layer(apron ? 'shuttle' : 'taxi', apron ? 3.6 : 4.1, 1.75, -6, .9, edge + 11);
  if (meta.id === 'A05') {
    vehicle.userData = { semanticId: 'airport.exit.taxi', zoneId: meta.id, interactionType: 'inspect' };
    interactive.push(vehicle);
    const bus = layer('shuttle', 5.2, 2.1, 5, 1.05, edge + 14);
    bus.userData = { semanticId: 'airport.exit.bus', zoneId: meta.id, interactionType: 'inspect' };
    interactive.push(bus);
  }
  let time = 0;
  return { update(dt, camera) { time += dt; if (vehicle) vehicle.position.x = -6 + Math.sin(time * .2) * 4; forecourt?.update(dt, camera); } };
}
