// Convierte canales FK locales de AnimationSequencerDataModel a GLB para el taller.
// Entrada producida por unreal-reader; sin Unreal Editor ni cambios al retargeter.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Rig } from '../src/core/rig.js';
import { clipFromAnimation } from '../src/core/clip.js';

const [input, skeletonFile, output] = process.argv.slice(2);
if (!output) throw new Error('Uso: node herramientas/unreal-glb.mjs <canales-dir> <skeleton.json> <salida-dir>');
const skeleton = JSON.parse(fs.readFileSync(skeletonFile, 'utf8'));
fs.mkdirSync(output, { recursive: true });
const vector = ([x, y, z]) => [-y / 100, z / 100, x / 100];
// Cambio de base de coordenadas (reflexión): q.xyz -> -C*q.xyz.
const quaternion = ([x, y, z, w]) => [y, -z, -x, w];
function rotator([roll, pitch, yaw]) {
  const [r, p, y] = [roll, pitch, yaw].map(v => v * Math.PI / 360);
  const [sr, sp, sy, cr, cp, cy] = [Math.sin(r), Math.sin(p), Math.sin(y), Math.cos(r), Math.cos(p), Math.cos(y)];
  return quaternion([cr*sp*sy-sr*cp*cy, -cr*sp*cy-sr*cp*sy, cr*cp*sy-sr*sp*cy, cr*cp*cy+sr*sp*sy]);
}
function value(ch, frame) {
  if (!ch.times.length) { assert(ch.hasDefault, 'Canal vacío sin valor por defecto'); return ch.defaultValue; }
  assert(ch.modes.every(m => m === 'RCIM_Linear' || m === 'RCIM_Constant'), 'Interpolación no soportada');
  const exact = ch.times.indexOf(frame);
  if (exact >= 0) return ch.values[exact];
  if (frame <= ch.times[0]) return ch.values[0];
  if (frame >= ch.times.at(-1)) return ch.values.at(-1);
  // No aproximar interpolación cúbica ni mezclar modos.
  assert(ch.modes.length === 1);
  const hi = ch.times.findIndex(t => t > frame), lo = hi - 1;
  if (ch.modes[0] === 'RCIM_Constant') return ch.values[lo];
  return THREE.MathUtils.lerp(ch.values[lo], ch.values[hi], (frame - ch.times[lo]) / (ch.times[hi] - ch.times[lo]));
}
const report = [];
for (const filename of fs.readdirSync(input).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const source = JSON.parse(fs.readFileSync(path.join(input, filename), 'utf8'));
  try {
    const nodes = skeleton.map(b => ({ name: b.name, translation: vector(b.translation), rotation: quaternion(b.rotation), scale: [b.scale[1], b.scale[2], b.scale[0]], children: [] }));
    skeleton.forEach((b, i) => { if (b.parent >= 0) nodes[b.parent].children.push(i); });
    const roots = skeleton.flatMap((b, i) => b.parent < 0 ? [i] : []);
    const gltf = { asset: { version: '2.0', generator: 'Taller Unreal FK importer' }, scene: 0, scenes: [{ nodes: roots }], nodes, animations: [{ name: source.name, samplers: [], channels: [] }], buffers: [], bufferViews: [], accessors: [] };
    const chunks = []; let offset = 0;
    function accessor(values, type, min, max) {
      const data = Buffer.from(new Float32Array(values).buffer);
      const view = gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length }) - 1;
      chunks.push(data); offset += data.length;
      return gltf.accessors.push({ bufferView: view, componentType: 5126, count: values.length / (type === 'SCALAR' ? 1 : type === 'VEC3' ? 3 : 4), type, ...(min ? { min, max } : {}) }) - 1;
    }
    const channels = source.bones.flatMap(b => b.channels);
    assert(channels.every(ch => ch.rate.Numerator === 30 && ch.rate.Denominator === 1), 'FPS inesperado');
    assert(channels.every(ch => ch.times.every((t,i) => Number.isInteger(t) && (i === 0 || t > ch.times[i-1]))), 'Tiempos no ordenados');
    const sourceFrames = channels.reduce((max, ch) => Math.max(max, ch.times.at(-1) ?? 0), 0) + 1;
    const frames = Math.max(2, sourceFrames); // Una pose de un fotograma también es reproducible.
    const times = Array.from({ length: frames }, (_, i) => i / 30);
    const timeAccessor = accessor(times, 'SCALAR', [0], [times.at(-1)]);
    const root = new THREE.Group();
    const bones = nodes.map(n => { const b = new THREE.Bone(); b.name = n.name; b.position.fromArray(n.translation); b.quaternion.fromArray(n.rotation); b.scale.fromArray(n.scale); return b; });
    skeleton.forEach((b, i) => (b.parent < 0 ? root : bones[b.parent]).add(bones[i]));
    root.updateMatrixWorld(true);
    const animTracks = [];
    const omittedCorrectives = [];
    for (const b of source.bones) {
      assert(b.name.endsWith('_CONTROL'), `Control inesperado ${b.name}`);
      const name = b.name.slice(0, -8), index = nodes.findIndex(n => n.name === name);
      if (index < 0 && /^(lowerarm|upperarm|calf|thigh)_(correctiveroot|twistcor_\d+|kneeback)_[lr]$/.test(name)) { omittedCorrectives.push(name); continue; }
      assert(index >= 0, `Hueso ausente: ${name}`);
      for (const [kind, target, type, transform] of [
        ['Translation', 'translation', 'VEC3', vector],
        ['Rotation', 'rotation', 'VEC4', rotator],
        ['Scale', 'scale', 'VEC3', ([x,y,z]) => [y,z,x]],
      ]) {
        const axes = [0,1,2].map(axis => b.channels.find(c => c.type === kind && c.axis === axis));
        assert(axes.every(Boolean), `Faltan canales en ${name}`);
        const values = [];
        for (let f = 0; f < frames; f++) {
          let v = transform(axes.map(ch => value(ch, f)));
          assert(v.every(Number.isFinite));
          if (target === 'rotation') {
            assert(Math.abs(Math.hypot(...v) - 1) < 1e-5);
            if (f && v.reduce((s,x,i) => s + x*values[(f-1)*4+i], 0) < 0) v = v.map(x => -x);
          }
          values.push(...v);
        }
        const sampler = gltf.animations[0].samplers.push({ input: timeAccessor, output: accessor(values, type), interpolation: 'LINEAR' }) - 1;
        gltf.animations[0].channels.push({ sampler, target: { node: index, path: target } });
        const Track = target === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
        animTracks.push(new Track(`${name}.${target === 'rotation' ? 'quaternion' : target === 'translation' ? 'position' : 'scale'}`, times, values));
      }
    }
    const rig = new Rig(root);
    assert(rig.humanoid, 'Rig de origen no reconocido');
    const anim = new THREE.AnimationClip(source.name, times.at(-1), animTracks);
    const canonical = clipFromAnimation(root, anim, { name: source.name, rig });
    assert(Object.keys(canonical.tracks).length >= 20);
    assert(Object.values(canonical.tracks).every(a => a.every(Number.isFinite)));
    gltf.buffers.push({ byteLength: offset });
    let json = Buffer.from(JSON.stringify(gltf));
    json = Buffer.concat([json, Buffer.alloc((4-json.length%4)%4, 32)]);
    const binary = Buffer.concat(chunks);
    const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28+json.length+binary.length, 8);
    const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length); jh.writeUInt32LE(0x4e4f534a, 4);
    const bh = Buffer.alloc(8); bh.writeUInt32LE(binary.length); bh.writeUInt32LE(0x004e4942, 4);
    const file = `${source.name}.glb`;
    const bytes = Buffer.concat([header,jh,json,bh,binary]);
    if (fs.existsSync(path.join(output, file))) assert(fs.readFileSync(path.join(output, file)).equals(bytes), `Ya existe ${file} con otro contenido`);
    else fs.writeFileSync(path.join(output, file), bytes);
    report.push({ file, source: source.source, status: 'converted', sourceFrames, staticPose: sourceFrames === 1, frames, fps: 30, seconds: times.at(-1), animatedBones: source.bones.length - omittedCorrectives.length, omittedCorrectives, canonicalBones: Object.keys(canonical.tracks).length });
  } catch (error) { report.push({ source: source.source, status: 'error', error: error.message }); }
}
fs.writeFileSync(path.join(output, '_conversion.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ converted: report.filter(r => r.status === 'converted').length, errors: report.filter(r => r.status === 'error') }, null, 2));
process.exitCode = report.some(r => r.status === 'error') ? 1 : 0;
