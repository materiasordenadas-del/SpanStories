import * as T from './three.js';
import { luz, crearMaterialToon, normalDesdeAltura } from './Luz25D.js';
import { PORTICO_LAWN_EDGE, PORTICO_LAWN_WEST, PORTICO_Z } from './routes.js';
import { TREES, TREE_ORDER } from '../assets/trees/tree-manifest.js';

// D00 · left portico garden — a view-only lawn behind the colonnade (no player
// access: the walkable area stops at the hall's west edge).
//  - Lawn: flat baked texture.
//  - Mid trees: the hand-painted assets the user supplied (assets/trees/,
//    sliced from their atlas with the black background keyed out). Each tree
//    is 3 stacked 2.5D layers in depth (the art's own dark base, mid tones
//    and highlights), so walking shifts them against each other (parallax)
//    and the flat illustration reads as a volume. Trunk anchored by the
//    image pivot, soft blob shadow, partial camera follow and a very slight
//    hand-drawn-style sway. The three variants are reused at different
//    heights and mirrored.
//  - Horizon: a plain 2D painted treeline (distant = flat 2D, style guide).

const LAWN = { base: '#62a444', stripe: '#6aad4a', tuft: '#56983c', shadow: '#478535' };

function random(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const map = new T.CanvasTexture(canvas); map.colorSpace = T.SRGBColorSpace;
  map.minFilter = T.LinearMipmapLinearFilter; map.magFilter = T.LinearFilter;
  map.anisotropy = 4;
  return map;
}
// A leaf mass: base disc + a lit cap offset to the upper-left (toon, 2 tones).
function shadowBlobTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(30,60,28,.55)');
    g.addColorStop(.7, 'rgba(30,60,28,.28)');
    g.addColorStop(1, 'rgba(30,60,28,0)');
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });
}
function treeTexture(name) {
  const map = new T.TextureLoader().load(new URL(`../assets/trees/${name}-layers.png`, import.meta.url).href);
  map.colorSpace = T.SRGBColorSpace;
  map.minFilter = T.LinearMipmapLinearFilter; map.magFilter = T.LinearFilter; map.anisotropy = 4;
  return map;
}
// Three stacked quads (back / mid / front cells of the layered atlas, painted
// from the art's own dark base, mid tones and highlights), offset in Z so
// walking produces real parallax — the SpanStories fake-3D recipe. Bottom
// pivot at the trunk (pivotX); optional horizontal mirror. One draw call.
function layeredTreeGeometry(width, height, pivotX, flip, depth = .15) {
  const positions = [], uvs = [], indices = [];
  const layers = [[0, -depth, 1], [1, 0, 1], [2, depth * 1.1, .985]];
  for (const [cell, zOff, scale] of layers) {
    const xL = -pivotX * width * scale, xR = (1 - pivotX) * width * scale;
    const z = zOff * width;
    const u0 = (cell + (flip ? 1 : 0)) / 3, u1 = (cell + (flip ? 0 : 1)) / 3;
    const corners = [[xL, 0, z, u0, 0], [xR, 0, z, u1, 0], [xL, height, z, u0, 1], [xR, height, z, u1, 1]];
    const start = positions.length / 3;
    for (const [x, y, zz, u, v] of corners) { positions.push(x, y, zz); uvs.push(u, v); }
    indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}
function drawLawn(ctx, w, h) {
  ctx.fillStyle = LAWN.base; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = LAWN.stripe; ctx.fillRect(0, 0, w, h / 2);
  const rand = random(7);
  ctx.strokeStyle = LAWN.tuft; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    const x = rand() * w, y = rand() * h;
    ctx.beginPath(); ctx.moveTo(x - 3, y + 3); ctx.lineTo(x, y - 3); ctx.lineTo(x + 3, y + 3); ctx.stroke();
  }
}
function drawHorizonTrees(ctx, w, h) {
  // Flat, cool-toned rounded canopies: two rows, no lighting tricks.
  ctx.clearRect(0, 0, w, h);
  const rand = random(91);
  const row = (count, baseY, minR, maxR, color, top) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, baseY, w, h - baseY);
    for (let i = 0; i < count; i++) {
      const x = (i + rand() * .6) / count * w, r = minR + rand() * (maxR - minR);
      ctx.beginPath(); ctx.arc(x, baseY - r * (top + rand() * .35), r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + r * .7, baseY - r * .35, r * .72, 0, Math.PI * 2); ctx.fill();
    }
  };
  row(46, h * .7, 26, 44, '#78ab86', .5);
  row(58, h * .84, 20, 34, '#5f9a64', .15);
  ctx.fillStyle = '#548d52'; ctx.fillRect(0, h * .93, w, h * .07);
}
export function buildPorticoGarden({ scope, kit, group, movable }) {
  const add = object => { group.add(object); scope.defer(() => object.removeFromParent()); return object; };
  // Lawn: west of the portico columns and behind the street pavement, to the horizon
  // (the portico walk is paved over it in ExteriorIllusion).
  const lawnDepth = PORTICO_LAWN_EDGE + 40.2;
  const lawnMap = scope.own(canvasTexture(256, 256, drawLawn));
  lawnMap.wrapS = lawnMap.wrapT = T.RepeatWrapping; lawnMap.repeat.set(41 / 3, (PORTICO_LAWN_EDGE + 40.2) / 3);
  // Near ground: relit by the shared light, the tufts give it a little relief.
  const lawnNormal = scope.own(normalDesdeAltura(lawnMap.image, { fuerza: 1.2, suavizado: .8, repetir: true }));
  const lawn = add(new T.Mesh(scope.own(new T.PlaneGeometry(41, lawnDepth)), scope.own(crearMaterialToon({
    albedo: lawnMap, normal: lawnNormal, repetir: [41 / 3, lawnDepth / 3], fuerzaNormal: .6 }))));
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(-27.5, .006, PORTICO_LAWN_EDGE - lawnDepth / 2);
  // Low curbs around the lawn: along the street pavement, along the portico
  // walk (west of its columns) and across the back end of the walk.
  const walkBack = PORTICO_Z[0], lawnWest = PORTICO_LAWN_WEST;
  for (const [x, z, sx, sz] of [
    [(-48 + lawnWest) / 2, PORTICO_LAWN_EDGE - .03, lawnWest + 48, .14],
    [lawnWest + .04, (walkBack + PORTICO_LAWN_EDGE) / 2, .14, PORTICO_LAWN_EDGE - walkBack],
    [(lawnWest - 7) / 2, walkBack - .03, -7 - lawnWest, .14],
  ]) {
    const curb = add(new T.Mesh(kit.box, kit.materials.trim));
    curb.position.set(x, .05, z); curb.scale.set(sx, .1, sz);
  }
  // Horizon treeline, north and west (flat 2D, far).
  const horizonMap = scope.own(canvasTexture(2048, 256, drawHorizonTrees));
  horizonMap.wrapS = T.RepeatWrapping;
  // Far layers are plain 2D illustrations: not relit, only tinted by the ambience.
  const horizonMaterial = scope.own(new T.MeshBasicMaterial({ map: horizonMap, transparent: true, alphaTest: .5, side: T.DoubleSide }));
  scope.defer(luz.tintar(horizonMaterial, 'fondo'));
  const north = add(new T.Mesh(scope.own(new T.PlaneGeometry(44, 5.5)), horizonMaterial));
  north.position.set(-27, 2.55, -39);
  const westMap = horizonMap.clone(); westMap.repeat.set(1.6, 1); westMap.needsUpdate = true; scope.own(westMap);
  const westMaterial = scope.own(new T.MeshBasicMaterial({ map: westMap, transparent: true, alphaTest: .5, side: T.DoubleSide }));
  scope.defer(luz.tintar(westMaterial, 'fondo'));
  const west = add(new T.Mesh(scope.own(new T.PlaneGeometry(72, 5.5)), westMaterial));
  west.position.set(-48, 2.55, -3); west.rotation.y = Math.PI / 2;
  // Garden trees: the user's hand-painted assets on crossed planes. Exactly
  // ten movable trees, created in the same slot as the old flat treeline so
  // saved positions of later objects keep their `etiqueta#índice` keys.
  const treeMaterials = {};
  for (const name of TREE_ORDER) {
    const map = scope.own(treeTexture(name));
    treeMaterials[name] = scope.own(new T.MeshBasicMaterial({ map, alphaTest: .5, side: T.DoubleSide }));
    scope.defer(luz.tintar(treeMaterials[name], 'vegetacion'));
  }
  const shadowMap = scope.own(shadowBlobTexture());
  const shadowMaterial = scope.own(new T.MeshBasicMaterial({ map: shadowMap, transparent: true, depthWrite: false }));
  const trees = [];
  const rand = random(5);
  let slot = 0;
  for (const [x, z, height] of [
    [-15.2, -.5, 5.6], [-17.6, -3.6, 5.2], [-21.3, -1.2, 6.4],
    [-26.5, -4, 5.8], [-13.6, -9.5, 5.6], [-18.8, -11, 6.8],
    [-24, -12.5, 6.2], [-30.5, -10, 5.8], [-9.4, -15, 6.6],
    [-35, -3, 6],
  ]) {
    const name = TREE_ORDER[slot % TREE_ORDER.length];
    const { aspect, pivotX } = TREES[name];
    const flip = slot % 2 === 1; slot++;
    const width = height * aspect;
    const tree = add(new T.Group());
    tree.position.set(x, 0, z);
    const mesh = new T.Mesh(scope.own(layeredTreeGeometry(width, height, pivotX, flip)), treeMaterials[name]);
    tree.add(mesh); scope.defer(() => mesh.removeFromParent());
    const shadow = new T.Mesh(scope.own(new T.PlaneGeometry(width * 1.15, width * .66)), shadowMaterial);
    shadow.rotation.x = -Math.PI / 2; shadow.position.set(width * .1, .02, -width * .06);
    tree.add(shadow); scope.defer(() => shadow.removeFromParent());
    tree.userData.sway = { phase: rand() * Math.PI * 2, speed: .6 + rand() * .35 };
    trees.push(movable(tree, 'árbol del jardín'));
  }
  // Trees keep a fixed bias toward the forecourt and follow the camera only in
  // part, so the layers stay offset (visible parallax) instead of collapsing.
  const anchor = new T.Vector2(0, 14);
  // The sway advances "on twos" (≈12 steps per second), like hand-drawn
  // animation, so the background never moves more fluidly than the cast.
  let time = 0, clock = 0;
  return {
    update(dt, camera, worldPosition) {
      clock += dt;
      if (clock >= 1 / 12) { time += clock; clock = 0; }
      for (const tree of trees) {
        const base = Math.atan2(anchor.x - tree.position.x, anchor.y - tree.position.z);
        let yaw = base;
        if (camera) {
          const toCamera = Math.atan2(camera.position.x - worldPosition.x - tree.position.x,
            camera.position.z - worldPosition.z - tree.position.z);
          yaw += Math.atan2(Math.sin(toCamera - base), Math.cos(toCamera - base)) * .45;
        }
        const { phase, speed } = tree.userData.sway;
        tree.rotation.set(0, yaw, Math.sin(time * speed + phase) * .012);
      }
    },
  };
}
