import * as T from './three.js';
import { createExteriorKit } from './ExteriorIllusion.js';
import { luz, crearMaterialToon, crearMaterialContorno, conNormalContorno, NIVELES_CONTORNO } from './Luz25D.js';

export function disposeObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set(), bitmaps = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    if (object.isInstancedMesh) object.dispose();
    for (const material of [].concat(object.material || [])) materials.add(material);
  });
  for (const material of materials) for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
  for (const texture of textures) {
    for (const image of [].concat(texture.source?.data || [])) if (typeof image?.close === 'function') bitmaps.add(image);
    texture.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
  for (const bitmap of bitmaps) bitmap.close();
  root.removeFromParent(); root.clear();
}

export function createKit() {
  // Same ramp and color management as the existing classroom; source remains untouched.
  const ramp = new T.DataTexture(new Uint8Array([72, 176, 255]), 3, 1, T.RedFormat);
  ramp.minFilter = ramp.magFilter = T.NearestFilter; ramp.needsUpdate = true;
  const colors = {
    wall: 0xf4f1eb, floor: 0xe2e5e1, ceiling: 0xfffdf6, trim: 0xb8cbd2,
    navy: 0x21466b, blue: 0x356f9e, metal: 0x72818a, lightMetal: 0xc7d2d2,
    accent: 0xe6b15e, wood: 0xb98d62, seat: 0x316694, dark: 0x293a49,
    green: 0x569b77, red: 0xb56d67, luggage: 0xca7454, plant: 0x558b67,
    warmLight: 0xffedc6, joint: 0xd6cfc2, concrete: 0xdde0dd, kerbJoint: 0xa3abad, bollard: 0x363f47,
  };
  // Volúmenes: toon de 3 bandas duras con la luz compartida (Luz25D). El panel
  // de luz del techo es emisivo: no se ilumina, se ve igual día y noche.
  const hex = value => `#${value.toString(16).padStart(6, '0')}`;
  const materials = Object.fromEntries(Object.entries(colors).map(([key, color]) => [key, crearMaterialToon({ color: hex(color), bandas: 3 })]));
  materials.warmLight.dispose();
  materials.warmLight = new T.MeshBasicMaterial({ color: colors.warmLight });
  const box = conNormalContorno(new T.BoxGeometry(1, 1, 1));
  const cylinder = conNormalContorno(new T.CylinderGeometry(.5, .5, 1, 8));
  // Un material de trazo por color de relleno (×0,55 en sRGB) y nivel.
  const outlines = new Map();
  const outline = (color, level = 'medio') => {
    const key = `${color}|${level}`;
    if (!outlines.has(key)) outlines.set(key, crearMaterialContorno(hex(colors[color] ?? color), level));
    return outlines.get(key);
  };
  const signs = [
    'FACTURACIÓN', 'SEGURIDAD', 'TIENDAS', 'CAFETERÍA',
    'BAÑOS', 'SALA DE ESPERA', 'PUERTA 12', 'EMBARQUE',
    'SALIDAS', 'EQUIPAJE', 'A TIEMPO', 'PASAPORTES',
    'INFORMACIÓN', 'ENTRADA', 'CONTROL', 'VUELO SS 120',
  ];
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  signs.forEach((label, i) => {
    const x = (i % 4) * 512, y = Math.floor(i / 4) * 256;
    ctx.fillStyle = '#21466b'; ctx.fillRect(x + 5, y + 5, 502, 246);
    ctx.fillStyle = '#e6b15e'; ctx.fillRect(x + 5, y + 241, 502, 10);
    ctx.fillStyle = '#ebf3f4'; ctx.font = label.length > 12 ? 'bold 39px system-ui' : 'bold 51px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.translate(x + 256, y + 128); ctx.scale(.5, 1); ctx.fillText(label, 0, 0, 890); ctx.restore();
  });
  const signTexture = new T.CanvasTexture(canvas); signTexture.colorSpace = T.SRGBColorSpace;
  signTexture.minFilter = T.LinearMipmapLinearFilter; signTexture.magFilter = T.LinearFilter;
  const signMaterial = new T.MeshBasicMaterial({ map: signTexture, side: T.DoubleSide });
  const boardCanvas = document.createElement('canvas'); boardCanvas.width = 512; boardCanvas.height = 256;
  const boardContext = boardCanvas.getContext('2d');
  boardContext.fillStyle = '#132b42'; boardContext.fillRect(0, 0, 512, 256);
  boardContext.fillStyle = '#e3eff2'; boardContext.font = 'bold 28px system-ui'; boardContext.fillText('SALIDAS  /  DEPARTURES', 22, 36);
  boardContext.fillStyle = '#6c91a5'; boardContext.fillRect(20, 47, 472, 2);
  boardContext.font = 'bold 19px system-ui';
  for (const [i, time, code, destination, state] of [
    [0, '08:45', 'SS 120', 'MADRID', 'A TIEMPO'],
    [1, '09:20', 'SS 214', 'MÉXICO', 'A TIEMPO'],
    [2, '10:10', 'SS 308', 'BOGOTÁ', 'EMBARQUE'],
    [3, '11:05', 'SS 422', 'LIMA', 'A TIEMPO'],
  ]) {
    const y = 83 + i * 42;
    boardContext.fillStyle = i % 2 ? '#1d3d56' : '#18364e'; boardContext.fillRect(18, y - 25, 476, 37);
    boardContext.fillStyle = '#e3eff2'; boardContext.fillText(time, 26, y); boardContext.fillText(code, 111, y); boardContext.fillText(destination, 218, y);
    boardContext.fillStyle = state === 'EMBARQUE' ? '#eebd6e' : '#99d4b8'; boardContext.fillText(state, 369, y);
  }
  const boardTexture = new T.CanvasTexture(boardCanvas); boardTexture.colorSpace = T.SRGBColorSpace;
  boardTexture.minFilter = T.LinearMipmapLinearFilter; boardTexture.magFilter = T.LinearFilter;
  const boardMaterial = new T.MeshBasicMaterial({ map: boardTexture, side: T.DoubleSide });
  const corridorCanvas = document.createElement('canvas'); corridorCanvas.width = 512; corridorCanvas.height = 512;
  const c = corridorCanvas.getContext('2d');
  c.fillStyle = '#b5c6ca'; c.fillRect(0, 0, 512, 512);
  c.fillStyle = '#667d8b'; c.beginPath(); c.moveTo(0, 0); c.lineTo(512, 0); c.lineTo(325, 206); c.lineTo(187, 206); c.closePath(); c.fill();
  c.fillStyle = '#e7e6de'; c.beginPath(); c.moveTo(0, 0); c.lineTo(187, 206); c.lineTo(187, 330); c.lineTo(0, 512); c.closePath(); c.fill();
  c.fillStyle = '#d2d7d0'; c.beginPath(); c.moveTo(512, 0); c.lineTo(325, 206); c.lineTo(325, 330); c.lineTo(512, 512); c.closePath(); c.fill();
  c.fillStyle = '#afa99b'; c.beginPath(); c.moveTo(0, 512); c.lineTo(187, 330); c.lineTo(325, 330); c.lineTo(512, 512); c.closePath(); c.fill();
  c.fillStyle = '#36556a'; c.fillRect(187, 206, 138, 124);
  c.fillStyle = '#a5c3c8'; c.fillRect(198, 218, 116, 101);
  c.strokeStyle = '#d5e2df'; c.lineWidth = 4;
  for (const x of [35, 107, 405, 477]) { c.beginPath(); c.moveTo(x, 0); c.lineTo(256 + (x - 256) * .3, 206); c.stroke(); }
  c.strokeStyle = '#8faaa9'; c.lineWidth = 3;
  for (const y of [75, 146, 220]) { const inset = y * .26; c.beginPath(); c.moveTo(inset, y); c.lineTo(512 - inset, y); c.stroke(); }
  c.fillStyle = '#fff0c6';
  for (const [x, y, width] of [[211, 78, 90], [226, 142, 60], [240, 187, 32]]) c.fillRect(x, y, width, 5);
  c.fillStyle = '#21466b'; c.fillRect(216, 215, 80, 22);
  c.fillStyle = '#f6efdc'; c.font = 'bold 12px system-ui'; c.textAlign = 'center'; c.fillText('AEROPUERTO', 256, 230);
  const corridorTexture = new T.CanvasTexture(corridorCanvas); corridorTexture.colorSpace = T.SRGBColorSpace;
  corridorTexture.minFilter = T.LinearMipmapLinearFilter; corridorTexture.magFilter = T.LinearFilter;
  const corridorMaterial = new T.MeshBasicMaterial({ map: corridorTexture, side: T.DoubleSide });
  const glass = new T.MeshBasicMaterial({ color: 0xa9d8ee, transparent: true, opacity: .1, depthWrite: false, side: T.DoubleSide });
  const glassColor = new T.Color(0xa9d8ee);
  const exterior = createExteriorKit();
  // Carteles y pantallas siguen siendo ilustración: sólo se tiñen con el ambiente.
  const untint = [luz.tintar(signMaterial, 'cartel'), luz.tintar(corridorMaterial, 'cartel'),
    luz.alCambiar(A => glass.color.copy(glassColor).multiply(new T.Color(A.tintes.vidrio)))];
  return { box, cylinder, materials, outline, ramp, signMaterial, boardMaterial, corridorMaterial, glass, signs, exterior,
    dispose() { untint.forEach(off => off()); box.dispose(); cylinder.dispose(); ramp.dispose(); signTexture.dispose(); signMaterial.dispose(); boardTexture.dispose(); boardMaterial.dispose(); corridorTexture.dispose(); corridorMaterial.dispose(); glass.dispose(); exterior.dispose(); Object.values(materials).forEach(m => m.dispose()); outlines.forEach(m => m.dispose()); } };
}

// Colors that never get an outline: large floors/ceilings and emissive panels.
const NO_OUTLINE = new Set(['floor', 'ceiling', 'warmLight']);
// Outline hierarchy by size: close furniture gets a medium stroke, big
// architecture a thin one; flat decals (floor lines) and whole walls get none,
// their joints read through the neighbouring volumes.
export function outlineLevel(w, h, d) {
  const min = Math.min(w, h, d), max = Math.max(w, h, d);
  if (min < .03 || max >= 9) return null;
  return max >= 2.6 ? 'fino' : 'medio';
}

// Scoped exterior palette: never mutate the shared materials used indoors.
export function createFacadeKit(scope, kit) {
  const colors = { navy: 0x07528b, wall: 0xd8d5d1, lightMetal: 0xb9bec6, roofMetal: 0xd4d9df, trim: 0x719eb9 };
  const materials = { ...kit.materials };
  for (const [key, color] of Object.entries(colors)) {
    if (key === 'roofMetal') continue;
    materials[key] = scope.own(crearMaterialToon({ color: `#${color.toString(16).padStart(6, '0')}`, bandas: 3 }));
  }
  // Satin metal on the three exterior roof copings only. Broad, pale reflected
  // bands stay legible at a distance without darkening the edge into charcoal.
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const metal = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [stop, color] of [
    [0, '#f2f3f4'], [.12, '#dfe3e7'], [.38, '#ccd3da'],
    [.58, '#e4e8eb'], [.78, '#d5dce2'], [1, '#b8c2cc'],
  ]) metal.addColorStop(stop, color);
  ctx.fillStyle = metal; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.beginPath(); ctx.moveTo(65, 0); ctx.lineTo(148, 0); ctx.lineTo(290, 256); ctx.lineTo(207, 256); ctx.fill();
  const map = scope.own(new T.CanvasTexture(canvas)); map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 4;
  materials.roofMetal = scope.own(new T.MeshBasicMaterial({ map }));
  return { ...kit, materials, outline: (color, level) => kit.outline(colors[color] ?? color, level) };
}

// Geometry is shared; per-chunk instance buffers are not.
export function boxes(scope, kit, group, color, transforms, geometry = kit.box) {
  if (!transforms.length) return null;
  const mesh = scope.own(new T.InstancedMesh(geometry, kit.materials[color], transforms.length));
  mesh.userData.creationRoof = color === 'ceiling' || color === 'roofMetal';
  const matrix = new T.Matrix4(), position = new T.Vector3(), scale = new T.Vector3(), rotation = new T.Quaternion();
  transforms.forEach(([x, y, z, w, h, d], i) => {
    matrix.compose(position.set(x, y, z), rotation, scale.set(w, h, d)); mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  group.add(mesh);
  if (!NO_OUTLINE.has(color)) instancedOutline(scope, kit, group, color, transforms, geometry);
  return mesh;
}

// Inverted hull for a batch: one extra draw call, per-instance stroke level.
function instancedOutline(scope, kit, group, color, transforms, geometry) {
  const kept = transforms.map(t => [t, outlineLevel(t[3], t[4], t[5])]).filter(([, level]) => level);
  if (!kept.length) return null;
  // Own copy of the (tiny) geometry: the per-instance level attribute cannot
  // live on the kit's shared box.
  const hull = scope.own(geometry.clone());
  hull.setAttribute('aNivel', new T.InstancedBufferAttribute(new Float32Array(kept.map(([, level]) => NIVELES_CONTORNO[level])), 1));
  const mesh = scope.own(new T.InstancedMesh(hull, kit.outline(color, 'medio'), kept.length));
  const matrix = new T.Matrix4(), position = new T.Vector3(), scale = new T.Vector3(), rotation = new T.Quaternion();
  kept.forEach(([[x, y, z, w, h, d]], i) => { matrix.compose(position.set(x, y, z), rotation, scale.set(w, h, d)); mesh.setMatrixAt(i, matrix); });
  mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
  mesh.raycast = () => {};
  mesh.name = `${color}:contorno`;
  mesh.userData.creationRoof = color === 'ceiling' || color === 'roofMetal';
  group.add(mesh); scope.defer(() => mesh.removeFromParent());
  return mesh;
}

export function sign(scope, kit, group, label, x, y, z, width = 3.4, height = .7, facing = 0) {
  const i = kit.signs.indexOf(label);
  if (i < 0) throw new Error(`Unknown sign: ${label}`);
  const geometry = scope.own(new T.PlaneGeometry(width, height));
  const u0 = (i % 4) / 4, v1 = 1 - Math.floor(i / 4) / 4;
  const uv = geometry.getAttribute('uv');
  for (let j = 0; j < uv.count; j++) uv.setXY(j, u0 + uv.getX(j) / 4, v1 - .25 + uv.getY(j) / 4);
  const mesh = new T.Mesh(geometry, kit.signMaterial); mesh.position.set(x, y, z); mesh.rotation.y = facing;
  group.add(mesh); scope.defer(() => mesh.removeFromParent()); return mesh;
}
