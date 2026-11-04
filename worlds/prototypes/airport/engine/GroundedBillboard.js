import * as T from './three.js';
import { crearMaterialToon, profundidadRecortada } from './Luz25D.js';

// A standing illustration is positioned by its visible feet, never by the
// centre of its quad. The same helper can be used for future 2D characters.
export function bottomCenterPlane(scope, width, height) {
  const geometry = scope.own(new T.PlaneGeometry(width, height));
  geometry.translate(0, height / 2, 0);
  return geometry;
}

function trimTransparentPadding(geometry, pixels, width, height) {
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (pixels[(y * width + x) * 4 + 3] < 32) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  if (right < left) return;
  const uv = geometry.getAttribute('uv');
  const u0 = left / width, uSpan = (right + 1 - left) / width;
  const v0 = (height - bottom - 1) / height, vSpan = (bottom + 1 - top) / height;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * uSpan, v0 + uv.getY(i) * vSpan);
  uv.needsUpdate = true;
}

function relightableMaps(image, geometry, neutralize) {
  const albedo = document.createElement('canvas');
  albedo.width = image.width; albedo.height = image.height;
  const context = albedo.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const frame = context.getImageData(0, 0, albedo.width, albedo.height);
  const rgba = frame.data;
  trimTransparentPadding(geometry, rgba, albedo.width, albedo.height);
  const normal = document.createElement('canvas');
  normal.width = Math.min(512, albedo.width);
  normal.height = Math.round(albedo.height * normal.width / albedo.width);
  const nctx = normal.getContext('2d', { willReadFrequently: true });
  // Normal data comes from the original leaf/trunk contours, before removing
  // the illustration's painted lighting from the color texture.
  nctx.drawImage(image, 0, 0, normal.width, normal.height);
  const source = nctx.getImageData(0, 0, normal.width, normal.height).data;
  const result = nctx.createImageData(normal.width, normal.height);
  const sample = (x, y) => {
    const index = (Math.max(0, Math.min(normal.height - 1, y)) * normal.width
      + Math.max(0, Math.min(normal.width - 1, x))) * 4;
    const lightness = (source[index] + source[index + 1] + source[index + 2]) / 765;
    return source[index + 3] / 255 * (.7 + .3 * lightness);
  };
  for (let y = 0; y < normal.height; y++) for (let x = 0; x < normal.width; x++) {
    const i = (y * normal.width + x) * 4;
    const dx = (sample(x + 2, y) - sample(x - 2, y)) * 2.2;
    const dy = (sample(x, y + 2) - sample(x, y - 2)) * 2.2;
    const length = Math.hypot(dx, dy, 1);
    result.data[i] = 128 - dx / length * 127;
    result.data[i + 1] = 128 + dy / length * 127;
    result.data[i + 2] = 128 + 127 / length;
    result.data[i + 3] = 255;
  }
  nctx.putImageData(result, 0, 0);
  if (neutralize) {
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < 32) continue;
      const luminance = .2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2];
      const target = rgba[i + 1] > rgba[i] * 1.04 ? 132 : 138;
      const correction = target - luminance;
      rgba[i] = Math.max(0, Math.min(255, rgba[i] + correction));
      rgba[i + 1] = Math.max(0, Math.min(255, rgba[i + 1] + correction));
      rgba[i + 2] = Math.max(0, Math.min(255, rgba[i + 2] + correction));
    }
    context.putImageData(frame, 0, 0);
  }
  return { albedo, normal };
}

// Albedo + normal map + the shared scene light (Luz25D): the plant keeps its
// flat geometry but its leaves catch the light with a hard, antialiased edge.
// `depth` is the alpha-cut depth material for its sun shadow.
export function relightablePlant(scope, kit, filename, width, height, { neutralize = false } = {}) {
  const geometry = bottomCenterPlane(scope, width, height);
  // Flat normal until the image arrives and its real relief is derived.
  const flatNormal = scope.own(new T.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1));
  flatNormal.needsUpdate = true;
  let material;
  const map = scope.own(new T.TextureLoader().load(new URL(`../assets/${filename}`, import.meta.url).href,
    texture => {
      if (scope.closed) return;
      const images = relightableMaps(texture.image, geometry, neutralize);
      texture.image = images.albedo; texture.needsUpdate = true;
      const normalMap = scope.own(new T.CanvasTexture(images.normal));
      normalMap.minFilter = T.LinearMipmapLinearFilter;
      normalMap.magFilter = T.LinearFilter;
      material.uniforms.uNormal.value = normalMap;
    }));
  map.minFilter = T.LinearMipmapLinearFilter; map.magFilter = T.LinearFilter; map.anisotropy = 4;
  material = scope.own(crearMaterialToon({ albedo: map, normal: flatNormal, fuerzaNormal: .9, corteAlfa: .5, doble: true }));
  const depth = scope.own(profundidadRecortada(map, .5));
  return { geometry, material, depth };
}
