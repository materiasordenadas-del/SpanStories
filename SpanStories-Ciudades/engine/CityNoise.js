/* SPDX-FileCopyrightText: 2009-2010 Sony Pictures Imageworks Inc., et al.
 * SPDX-FileCopyrightText: 2011-2022 Blender Foundation
 * SPDX-License-Identifier: Apache-2.0 AND BSD-3-Clause
 *
 * Port of Cycles util/hash.h and kernel/svm/{noise,fractal_noise,noisetex}.h.
 * Attribution, source hashes and license copies: reports/noise-NOTICE.md.
 * Supported contract: source city's 3D FBM Factor, no distortion. Shader
 * arithmetic is float32; final GPU rounding can differ from Cycles CPU/SSE.
 */
const f = Math.fround;
const add = (a, b) => f(f(a) + f(b));
const mul = (a, b) => f(f(a) * f(b));
const sub = (a, b) => f(f(a) - f(b));
const rot = (value, count) => ((value << count) | (value >>> (32 - count))) >>> 0;

/** Jenkins lookup3, Cycles hash_uint3, including uint32 wrap and negative ints. */
export function hashRuido3(x, y, z) {
  let a = (0xdeadbeef + 25 + (x >>> 0)) >>> 0;
  let b = (0xdeadbeef + 25 + (y >>> 0)) >>> 0;
  let c = (0xdeadbeef + 25 + (z >>> 0)) >>> 0;
  c = ((c ^ b) - rot(b, 14)) >>> 0;
  a = ((a ^ c) - rot(c, 11)) >>> 0;
  b = ((b ^ a) - rot(a, 25)) >>> 0;
  c = ((c ^ b) - rot(b, 16)) >>> 0;
  a = ((a ^ c) - rot(c, 4)) >>> 0;
  b = ((b ^ a) - rot(a, 14)) >>> 0;
  c = ((c ^ b) - rot(b, 24)) >>> 0;
  return c;
}
const fade = t => mul(mul(mul(t, t), t), add(mul(t, sub(mul(t, 6), 15)), 10));
function grad(hash, x, y, z) {
  const h = hash & 15, u = h < 8 ? x : y, v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return add(h & 1 ? -u : u, h & 2 ? -v : v);
}
function perlin(point) {
  const p = point.map(value => {
    const v = f(value), correction = Math.abs(v) >= 1e6 ? .5 : 0;
    return add(f(v % 1e5), correction);
  });
  const [x, y, z] = p.map(Math.floor), [fx, fy, fz] = p.map((value, i) => sub(value, [x, y, z][i]));
  const u = fade(fx), v = fade(fy), w = fade(fz), u1 = sub(1, u), v1 = sub(1, v), w1 = sub(1, w);
  const values = [];
  for (let iz = 0; iz <= 1; iz++) for (let iy = 0; iy <= 1; iy++) for (let ix = 0; ix <= 1; ix++) {
    values.push(grad(hashRuido3(x + ix, y + iy, z + iz), sub(fx, ix), sub(fy, iy), sub(fz, iz)));
  }
  const row = (a, b) => add(mul(values[a], u1), mul(values[b], u));
  return mul(.982, add(mul(w1, add(mul(v1, row(0, 1)), mul(v, row(2, 3)))), mul(w, add(mul(v1, row(4, 5)), mul(v, row(6, 7))))));
}

/** Numeric counterpart for comparing independent Cycles golden samples. */
export function evaluarRuido3(coordinate, {
  scale = 5, detail = 2, roughness = .5, lacunarity = 2, normalize = true,
  distortion = 0, dimensions = '3D', type = 'FBM',
} = {}) {
  if (dimensions !== '3D' || type !== 'FBM' || distortion !== 0) throw new Error('CityNoise supports source 3D FBM with zero distortion');
  const p = coordinate.map(value => mul(value, scale));
  detail = f(Math.min(15, Math.max(0, detail))); roughness = f(Math.max(0, roughness));
  let frequency = 1, amplitude = 1, maxAmplitude = 0, sum = 0;
  for (let octave = 0; octave <= Math.trunc(detail); octave++) {
    sum = add(sum, mul(perlin(p.map(value => mul(frequency, value))), amplitude));
    maxAmplitude = add(maxAmplitude, amplitude); amplitude = mul(amplitude, roughness); frequency = mul(frequency, lacunarity);
  }
  const remainder = sub(detail, Math.floor(detail));
  const normalized = (s, a) => add(f(mul(.5, s) / a), .5);
  if (remainder !== 0) {
    const sum2 = add(sum, mul(perlin(p.map(value => mul(frequency, value))), amplitude));
    const first = normalize ? normalized(sum, maxAmplitude) : sum;
    const second = normalize ? normalized(sum2, add(maxAmplitude, amplitude)) : sum2;
    return add(mul(first, sub(1, remainder)), mul(second, remainder));
  }
  return normalize ? normalized(sum, maxAmplitude) : sum;
}

export const CODIGO_RUIDO = `
uint ssNoiseRot(uint x, uint k) { return (x << k) | (x >> (32u - k)); }
uint ssNoiseHash3(ivec3 q) {
  uint base = 0xdeadbeefu + 25u;
  uint a = base + uint(q.x), b = base + uint(q.y), c = base + uint(q.z);
  c ^= b; c -= ssNoiseRot(b, 14u);
  a ^= c; a -= ssNoiseRot(c, 11u);
  b ^= a; b -= ssNoiseRot(a, 25u);
  c ^= b; c -= ssNoiseRot(b, 16u);
  a ^= c; a -= ssNoiseRot(c, 4u);
  b ^= a; b -= ssNoiseRot(a, 14u);
  c ^= b; c -= ssNoiseRot(b, 24u);
  return c;
}
float ssNoiseGrad3(uint hash, vec3 q) {
  uint h = hash & 15u;
  float u = h < 8u ? q.x : q.y;
  float v = h < 4u ? q.y : ((h == 12u || h == 14u) ? q.x : q.z);
  return ((h & 1u) != 0u ? -u : u) + ((h & 2u) != 0u ? -v : v);
}
vec3 ssNoiseFade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }
float ssNoiseSigned3(vec3 p) {
  vec3 correction = .5 * step(vec3(1000000.0), abs(p));
  // C fmod truncates toward zero, unlike GLSL mod for negative coordinates.
  p = p - trunc(p / 100000.0) * 100000.0 + correction;
  ivec3 cell = ivec3(floor(p)); vec3 q = p - floor(p), fade = ssNoiseFade(q);
  float v0 = ssNoiseGrad3(ssNoiseHash3(cell), q);
  float v1 = ssNoiseGrad3(ssNoiseHash3(cell + ivec3(1,0,0)), q - vec3(1,0,0));
  float v2 = ssNoiseGrad3(ssNoiseHash3(cell + ivec3(0,1,0)), q - vec3(0,1,0));
  float v3 = ssNoiseGrad3(ssNoiseHash3(cell + ivec3(1,1,0)), q - vec3(1,1,0));
  float v4 = ssNoiseGrad3(ssNoiseHash3(cell + ivec3(0,0,1)), q - vec3(0,0,1));
  float v5 = ssNoiseGrad3(ssNoiseHash3(cell + ivec3(1,0,1)), q - vec3(1,0,1));
  float v6 = ssNoiseGrad3(ssNoiseHash3(cell + ivec3(0,1,1)), q - vec3(0,1,1));
  float v7 = ssNoiseGrad3(ssNoiseHash3(cell + ivec3(1,1,1)), q - vec3(1,1,1));
  vec3 g = vec3(1.0) - fade;
  return .9820 * (g.z * (g.y * (v0 * g.x + v1 * fade.x) + fade.y * (v2 * g.x + v3 * fade.x)) +
                      fade.z * (g.y * (v4 * g.x + v5 * fade.x) + fade.y * (v6 * g.x + v7 * fade.x)));
}
float ssNoiseFbm(vec3 p, float detail, float roughness, float lacunarity, bool normalizeValue) {
  detail = clamp(detail, 0.0, 15.0); roughness = max(roughness, 0.0);
  float frequency = 1.0, amplitude = 1.0, maxAmplitude = 0.0, sum = 0.0;
  for (int octave = 0; octave <= 15; octave++) {
    if (octave > int(detail)) break;
    sum += ssNoiseSigned3(frequency * p) * amplitude;
    maxAmplitude += amplitude; amplitude *= roughness; frequency *= lacunarity;
  }
  float remainder = detail - floor(detail);
  if (remainder != 0.0) {
    float sum2 = sum + ssNoiseSigned3(frequency * p) * amplitude;
    return normalizeValue ? mix(.5 * sum / maxAmplitude + .5, .5 * sum2 / (maxAmplitude + amplitude) + .5, remainder) : mix(sum, sum2, remainder);
  }
  return normalizeValue ? .5 * sum / maxAmplitude + .5 : sum;
}
`;

const literal = value => {
  if (!Number.isFinite(value)) throw new Error('Non-finite Blender noise input');
  const text = String(value); return /[.eE]/.test(text) ? text : text + '.0';
};

export function shaderRuido(graph, { coordinateExpression = 'vNoiseGenerated' } = {}) {
  if (graph?.kind !== 'noise') return null;
  const noise = graph.noise || {}, bump = graph.bump || {};
  const dimensions = noise.dimensions ?? '3D', type = noise.type ?? 'FBM';
  if (dimensions !== '3D' || type !== 'FBM' || Number(noise.distortion ?? 0) !== 0) throw new Error('Unsupported source Noise graph; preserve with a separate adapter');
  const coordinate = noise.coordinate ?? 'generated';
  if (!['generated', 'object'].includes(coordinate)) throw new Error('City source Noise requires original Generated or Object coordinates');
  const heightExpression = `ssNoiseFbm((${coordinateExpression}) * ${literal(noise.scale ?? 5)}, ${literal(noise.detail ?? 2)}, ${literal(noise.roughness ?? .5)}, ${literal(noise.lacunarity ?? 2)}, ${noise.normalize === false ? 'false' : 'true'})`;
  const sourceBump = { strength: bump.strength ?? 1, distance: bump.distance ?? 1, invert: bump.invert ?? false, filterWidth: bump.filterWidth ?? .1 };
  const heightFunction = heightExpression.replace(`(${coordinateExpression})`, '(coordinate)');
  const bumpCode = `
float ssNoiseGraphHeight(vec3 coordinate) { return ${heightFunction}; }
vec3 ssNoiseGraphBump(vec3 surfacePosition, vec3 inputNormal, vec3 coordinate) {
  vec3 dx = dFdx(surfacePosition), dy = dFdy(surfacePosition);
  vec3 rx = cross(dy, inputNormal), ry = cross(inputNormal, dx);
  float center = ssNoiseGraphHeight(coordinate);
  float hx = ssNoiseGraphHeight(coordinate + dFdx(coordinate) * ${literal(sourceBump.filterWidth)});
  float hy = ssNoiseGraphHeight(coordinate + dFdy(coordinate) * ${literal(sourceBump.filterWidth)});
  float determinant = dot(dx, rx);
  vec3 gradient = (hx-center) * rx + (hy-center) * ry;
  vec3 result = ${literal(sourceBump.filterWidth)} * abs(determinant) * inputNormal - ${literal(sourceBump.distance * (sourceBump.invert ? -1 : 1))} * sign(determinant) * gradient;
  float magnitude = dot(result, result);
  if (magnitude <= 0.0) return inputNormal;
  result *= inversesqrt(magnitude);
  float strength = max(${literal(sourceBump.strength)}, 0.0);
  vec3 blended = strength * result + (1.0-strength) * inputNormal;
  return dot(blended, blended) > 0.0 ? normalize(blended) : inputNormal;
}
`;
  let colorExpression = null;
  if (graph.colorRamp) {
    const ramp = graph.colorRamp, elements = ramp.elements || [];
    if (ramp.mode !== 'RGB' || ramp.interpolation !== 'LINEAR' || elements.length !== 2 || elements[1].position <= elements[0].position)
      throw new Error('Unsupported source Noise color ramp');
    const [a,b] = elements, color = entry => `vec3(${entry.color.slice(0,3).map(literal).join(',')})`;
    colorExpression = `mix(${color(a)}, ${color(b)}, clamp((${heightExpression} - ${literal(a.position)}) / ${literal(b.position-a.position)}, 0.0, 1.0))`;
  }
  return {
    code: CODIGO_RUIDO + bumpCode, heightExpression, colorExpression, coordinate,
    bump: sourceBump, bumpFunction: 'ssNoiseGraphBump',
    sourceAlgorithm: 'Cycles 5.2 hash_uint3/grad3/tri_mix/snoise_3d/noise_fbm; exact formula, float32 raster rounding',
  };
}
