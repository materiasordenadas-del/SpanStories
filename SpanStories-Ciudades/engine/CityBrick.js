/* SPDX-FileCopyrightText: 2011-2022 Blender Foundation
 * SPDX-License-Identifier: Apache-2.0
 *
 * Brick texture port of Blender 5.2 Cycles kernel/svm/brick.h.
 * Adapted to GLSL unsigned32 and JavaScript reference functions for SpanStories.
 * Source provenance and license notice: reports/export-citybrick-NOTICE.md.
 */

const clamp = x => Math.min(1, Math.max(0, x));
const f32 = Math.fround;
const numeric = ['scale','mortarSize','mortarSmooth','bias','brickWidth','rowHeight','offset','offsetFrequency','squash','squashFrequency'];

function parameters(graph) {
  const b = graph?.brick ?? graph;
  if (!b) throw new TypeError('Faltan parámetros del nodo Brick original.');
  for (const name of numeric) if (!Number.isFinite(b[name])) throw new TypeError(`Parámetro Brick inválido: ${name}`);
  for (const name of ['color1','color2','mortar']) if (!Array.isArray(b[name]) || b[name].length < 3 || !b[name].slice(0,3).every(Number.isFinite)) throw new TypeError(`Color Brick inválido: ${name}`);
  if (!(b.brickWidth > 0 && b.rowHeight > 0 && b.squash > 0)) throw new RangeError('Las dimensiones originales de Brick deben ser positivas.');
  for (const name of ['offsetFrequency','squashFrequency']) if (!Number.isInteger(b[name]) || b[name] < 0) throw new RangeError(`Frecuencia Brick inválida: ${name}`);
  return b;
}

/** Exact unsigned32 hash from the Blender source, rounded as a C float. */
export function ruidoLadrillo(seed) {
  let n = ((seed >>> 0) + 1013) & 0x7fffffff;
  n = (n >>> 13) ^ n;
  const nn = (Math.imul(n, (Math.imul(Math.imul(n, n), 60493) + 19990303) | 0) + 1376312589) & 0x7fffffff;
  return f32(nn / 2147483648);
}

/** CPU reference for the source tint and mortar Factor; values use float32. */
export function evaluarLadrillo(graph, coordinate) {
  const b = parameters(graph);
  const scale = f32(b.scale), rowHeight = f32(b.rowHeight);
  const px = f32(f32(coordinate[0]) * scale), py = f32(f32(coordinate[1]) * scale);
  const row = Math.floor(f32(py / rowHeight));
  let width = f32(b.brickWidth), offset = 0;
  // Source intentionally enables these together, not independently.
  if (b.offsetFrequency && b.squashFrequency) {
    width = f32(width * (row % b.squashFrequency ? 1 : f32(b.squash)));
    offset = row % b.offsetFrequency ? 0 : f32(width * f32(b.offset));
  }
  const column = Math.floor(f32(f32(px + offset) / width));
  const x = f32(f32(px + offset) - f32(width * column));
  const y = f32(py - f32(rowHeight * row));
  const seed = ((((row | 0) << 16) + (column & 0xffff)) >>> 0);
  const tint = clamp(f32(ruidoLadrillo(seed) + f32(b.bias)));
  let distance = Math.min(x, y, f32(width - x), f32(rowHeight - y));
  let factor;
  if (distance >= f32(b.mortarSize)) factor = 0;
  else if (b.mortarSmooth === 0) factor = 1;
  else {
    distance = f32(1 - f32(distance / f32(b.mortarSize)));
    const t = clamp(f32(distance / f32(b.mortarSmooth)));
    factor = f32(f32(t * t) * f32(3 - f32(2 * t)));
  }
  const brick = b.color1.slice(0,3).map((value, i) => factor === 1 ? f32(value) : f32(f32(f32(1 - tint) * f32(value)) + f32(tint * f32(b.color2[i]))));
  const color = brick.map((value, i) => f32(f32(value * f32(1 - factor)) + f32(f32(b.mortar[i]) * factor)));
  return {tint, factor, color, row, column};
}

function literal(number) {
  const text = Number(number).toPrecision(17);
  return text.includes('.') || /e/i.test(text) ? text : text + '.0';
}
const rgb = values => 'vec3(' + values.slice(0,3).map(literal).join(',') + ')';

/**
 * GLSL3/WebGL2 source-compatible Brick, with no sine hash, fwidth border or tile.
 * Caller declares vec3 ssBrickCoordinate in ORIGINAL Blender coordinates:
 * UV uses vec3(glTFuv.x, 1.0-glTFuv.y, 0.0); generated uses Blender XYZ.
 */
export function shaderLadrillo(graph) {
  const b = parameters(graph);
  const coordinate = b.coordinate === 'uv' ? 'uv' : 'generated';
  const code = `
/* Blender Foundation 2011-2022; Apache-2.0; Cycles svm/brick.h port */
float ssBrickNoise(uint n) {
  n = (n + 1013u) & 0x7fffffffu;
  n = (n >> 13u) ^ n;
  uint nn = (n * (n * n * 60493u + 19990303u) + 1376312589u) & 0x7fffffffu;
  return 0.5 * (float(nn) / 1073741824.0);
}
vec2 ssBrickValues(vec3 co) {
  vec2 p = co.xy * ${literal(b.scale)};
  int row = int(floor(p.y / ${literal(b.rowHeight)}));
  float width = ${literal(b.brickWidth)};
  float offset = 0.0;
  ${b.offsetFrequency && b.squashFrequency ? `width *= (row % ${b.squashFrequency}) != 0 ? 1.0 : ${literal(b.squash)};
  offset = (row % ${b.offsetFrequency}) != 0 ? 0.0 : width * ${literal(b.offset)};` : ''}
  int column = int(floor((p.x + offset) / width));
  float x = (p.x + offset) - width * float(column);
  float y = p.y - ${literal(b.rowHeight)} * float(row);
  uint seed = (uint(row) << 16u) + (uint(column) & 0xffffu);
  float tint = clamp(ssBrickNoise(seed) + ${literal(b.bias)}, 0.0, 1.0);
  float distance = min(min(x,y), min(width-x,${literal(b.rowHeight)}-y));
  float factor;
  if (distance >= ${literal(b.mortarSize)}) factor = 0.0;
  ${b.mortarSmooth === 0 ? 'else factor = 1.0;' : `else {
    distance = 1.0 - distance / ${literal(b.mortarSize)};
    factor = smoothstep(0.0, 1.0, distance / ${literal(b.mortarSmooth)});
  }`}
  return vec2(tint, factor);
}
vec3 ssBrickColor(vec3 co) {
  vec2 data = ssBrickValues(co);
  vec3 color = ${rgb(b.color1)};
  if (data.y != 1.0) color = (1.0-data.x)*color + data.x*${rgb(b.color2)};
  return color*(1.0-data.y) + ${rgb(b.mortar)}*data.y;
}
float ssBrickFactor(vec3 co) { return ssBrickValues(co).y; }
`;
  return {code, colorExpression:'ssBrickColor(ssBrickCoordinate)', heightExpression:'ssBrickFactor(ssBrickCoordinate)', coordinate};
}
