import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFBX } from '../reports/inspeccionar-caballo.mjs';
import { Rig } from '../src/core/rig.js';
import { clipFromAnimation } from '../src/core/clip.js';

// Horse Animset Pro (3ds Max Biped) keys hinge joints only on the Z rotation
// curve. The stock FBXLoader froze them (one key) or produced a [0] track
// (NaN poses). src/io/FBXLoaderEjes.js must keep every key.
const warn = console.warn;
const quiet = (fn) => { console.warn = () => {}; try { return fn(); } finally { console.warn = warn; } };

test('el galope conserva la flexión del carpo, la rodilla y el corvejón', () => {
  const s = quiet(() => readFBX(new URL('../biblioteca/animales/Caballo/clips/H_Gallop.FBX', import.meta.url)));
  const tracks = Object.fromEntries(s.animations[0].tracks.map((t) => [t.name, t]));
  for (const n of ['L_Forearm', 'L_Calf', 'L_HorseLink']) {
    const t = tracks[`${n}.quaternion`];
    assert.ok(t.times.length > 10, `${n}: ${t.times.length} claves`);
    let span = 0;
    const q0 = new THREE.Quaternion().fromArray(t.values, 0);
    for (let i = 1; i < t.times.length; i++) span = Math.max(span, q0.angleTo(new THREE.Quaternion().fromArray(t.values, i * 4)));
    assert.ok(span > THREE.MathUtils.degToRad(20), `${n} se mueve ${THREE.MathUtils.radToDeg(span).toFixed(0)}°`);
  }
});

test('desmontar del jinete no produce poses NaN', () => {
  const s = quiet(() => readFBX(new URL('../biblioteca/paquetes/Jinete (Horse Animset Pro)/Rider_Mount_Dismount_Left.FBX', import.meta.url)));
  const anim = s.animations.find((a) => a.tracks.length);
  for (const t of anim.tracks) assert.equal(t.values.length, t.times.length * t.getValueSize(), t.name);
  const clip = clipFromAnimation(s, anim, { id: 'x', name: 'x', rig: new Rig(s) });
  const bad = Object.entries(clip.tracks).filter(([, a]) => Array.from(a).some((v) => !Number.isFinite(v))).map(([k]) => k);
  assert.deepEqual(bad, []);
});
