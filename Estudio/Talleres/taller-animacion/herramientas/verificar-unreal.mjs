import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Rig } from '../src/core/rig.js';
import { clipFromAnimation, sampleClip, newPose } from '../src/core/clip.js';

const [folder, targetPath] = process.argv.slice(2);
if (!targetPath) throw new Error('Uso: node herramientas/verificar-unreal.mjs <libreria-dir> <personaje-mixamo.glb>');
globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, data) { this.type = type; Object.assign(this, data); } };
const loader = new GLTFLoader();
function parse(bytes, withoutMaterials = false) {
  if (withoutMaterials) {
    const length = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20,20+length).toString());
    // La prueba de Node no necesita decodificar texturas. Conserva malla, skin e inversas.
    for (const m of json.meshes || []) for (const p of m.primitives) delete p.material;
    delete json.materials; delete json.images; delete json.textures;
    let j = Buffer.from(JSON.stringify(json)); j = Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);
    const rest = bytes.subarray(20+length), header = Buffer.from(bytes.subarray(0,20));
    header.writeUInt32LE(20+j.length+rest.length,8); header.writeUInt32LE(j.length,12);
    bytes = Buffer.concat([header,j,rest]);
  }
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}
const target = await parse(fs.readFileSync(targetPath), true);
const targetRig = new Rig(target.scene);
assert.equal(targetRig.convention, 'mixamo');
assert(targetRig.humanoid);
const results = [];
for (const file of fs.readdirSync(folder).filter(f => f.endsWith('.glb'))) {
  const model = await parse(fs.readFileSync(path.join(folder,file)));
  assert.equal(model.animations.length, 1, file);
  const anim = model.animations[0];
  const sourceRig = new Rig(model.scene);
  const clip = clipFromAnimation(model.scene, anim, { id: file, name: file, rig: sourceRig });
  assert(Object.keys(clip.tracks).length >= 20);
  assert(Object.values(clip.tracks).every(v => v.every(Number.isFinite)));
  assert(clip.hips.every(Number.isFinite));
  const pose = newPose();
  for (const t of [0, clip.duration/2, clip.duration]) {
    sampleClip(clip,t,pose);
    targetRig.applyCanonical(pose);
    target.scene.updateMatrixWorld(true);
    for (const b of targetRig.bones) {
      assert(b.matrixWorld.elements.every(Number.isFinite), `${file}: ${b.name} matriz inválida`);
      assert(Math.abs(b.quaternion.length()-1)<1e-5, `${file}: ${b.name} cuaternión inválido`);
    }
    for (const [id] of Object.entries(targetRig.mapping)) {
      if (id === 'hips') continue;
      const b = targetRig.bone(id), i = targetRig.index.get(b);
      assert(b.position.distanceTo(targetRig.restP[i]) < 1e-6, `${file}: cambió longitud ${b.name}`);
    }
  }
  results.push({ file, frames: clip.frames, duration: clip.duration, mappedBones: Object.keys(clip.tracks).length, sampledFrames: 3, ok: true });
}
const result = { target: targetPath, convention: targetRig.convention, targetMappedBones: Object.keys(targetRig.mapping).length, checked: results.length, clips: results };
fs.writeFileSync(path.join(folder,'_verification.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({ checked: results.length, target: targetPath, convention: targetRig.convention, ok: true }));
