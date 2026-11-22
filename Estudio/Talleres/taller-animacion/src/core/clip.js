// Clips canónicos: muestreados a fps fijo, rotaciones de mundo relativas a la pose T del personaje,
// traslación de cadera normalizada por la altura de cadera. Sirven para cualquier esqueleto.
import * as THREE from 'three';
import { Rig } from './rig.js';
import { CANON_IDS, mirrorCanon } from './humanoid.js';
import { sampleHorseClip } from './horse-editor.js';

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

export function newPose() {
  return { q: {}, hips: new THREE.Vector3() };
}

export function makeClip({ id, name, tags = [], fps = 30, frames, loop = false, source = 'propio', author = '', tracks, hips }) {
  const clip = { id, name, tags, fps, frames, loop, source, author, tracks, hips: hips || null };
  return withStats(clip);
}

export function withStats(clip) {
  clip.duration = (clip.frames - 1) / clip.fps;
  if (clip.hips) {
    const n = clip.frames - 1;
    const dx = clip.hips[n * 3] - clip.hips[0];
    const dz = clip.hips[n * 3 + 2] - clip.hips[2];
    clip.travel = Math.hypot(dx, dz);
  } else clip.travel = 0;
  return clip;
}

/**
 * Muestrea un clip en el tiempo t (segundos) y escribe en pose.
 * opts: loop, inPlace {x,y,z}, mirror, reverse
 */
export function sampleClip(clip, t, pose, opts = {}) {
  delete pose.native;
  if (clip.native) return sampleHorseClip(clip, t, pose, opts);
  const n = clip.frames;
  const dur = clip.duration;
  let cycles = 0;
  let time = t * (opts.speed || 1);
  if (opts.reverse) time = dur - time;
  if (opts.loop && dur > 0) {
    cycles = Math.floor(time / dur);
    time -= cycles * dur;
  }
  let f = Math.min(Math.max(time * clip.fps, 0), n - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, n - 1);
  const u = f - i0;
  const mir = !!opts.mirror;
  for (const c in clip.tracks) {
    const a = clip.tracks[c];
    _qa.fromArray(a, i0 * 4);
    _qb.fromArray(a, i1 * 4);
    _qa.slerp(_qb, u);
    const target = mir ? mirrorCanon(c) : c;
    const q = pose.q[target] || (pose.q[target] = new THREE.Quaternion());
    if (mir) q.set(_qa.x, -_qa.y, -_qa.z, _qa.w);
    else q.copy(_qa);
  }
  if (clip.hips) {
    const h = clip.hips;
    const x = h[i0 * 3] + (h[i1 * 3] - h[i0 * 3]) * u;
    const y = h[i0 * 3 + 1] + (h[i1 * 3 + 1] - h[i0 * 3 + 1]) * u;
    const z = h[i0 * 3 + 2] + (h[i1 * 3 + 2] - h[i0 * 3 + 2]) * u;
    const last = (n - 1) * 3;
    const dx = h[last] - h[0];
    const dy = h[last + 1] - h[1];
    const dz = h[last + 2] - h[2];
    let px = x + cycles * dx;
    let py = y + cycles * dy;
    let pz = z + cycles * dz;
    const ip = opts.inPlace;
    if (ip) {
      // Quita la tendencia lineal (el avance) del eje bloqueado; conserva el balanceo.
      const k = f / Math.max(1, n - 1);
      if (ip.x) px = x - dx * k - h[0];
      if (ip.y) py = y - dy * k;
      if (ip.z) pz = z - dz * k - h[2];
    } else if (opts.anchor) {
      // Acción del Motion Director: empieza donde está el personaje y conserva su propio avance.
      px -= h[0];
      pz -= h[2];
    }
    pose.hips.set(mir ? -px : px, py, pz);
  } else pose.hips.set(0, 0, 0);
  return pose;
}

/** Mezcla b sobre a con peso w (a se modifica). */
export function blendPose(a, b, w) {
  if (b.native) {
    a.native ||= {};
    a.nativeNeedsRepair ||= b.nativeNeedsRepair;
    for (const [name, p] of Object.entries(b.native)) {
      const old = a.native[name];
      if (old) { old.q.slerp(p.q, w); old.p.lerp(p.p, w); old.s.lerp(p.s, w); }
      else a.native[name] = { q:p.q.clone(), p:p.p.clone(), s:p.s.clone() };
    }
  }
  for (const c in b.q) {
    if (a.q[c]) a.q[c].slerp(b.q[c], w);
    else a.q[c] = b.q[c].clone();
  }
  a.hips.lerp(b.hips, w);
  return a;
}

export function copyPose(src, dst = newPose()) {
  dst.q = {};
  for (const c in src.q) dst.q[c] = src.q[c].clone();
  dst.hips.copy(src.hips);
  return dst;
}

/**
 * Convierte un AnimationClip de three.js (de un GLB/FBX) a clip canónico.
 * sourceRoot: la escena cargada con su esqueleto en reposo.
 */
/**
 * Lector directo de las pistas de una animación: evalúa cada pista con su interpolante y escribe el nodo.
 * Sustituye al AnimationMixer para muestrear: el mezclador dejaba de escribir algunos huesos en tramos finales
 * con claves repetidas (p. ej. iClone «Sit_Bench01» desde 25,5 s) y esos fotogramas salían en pose de reposo.
 */
function trackSampler(root, anim) {
  const items = [];
  for (const track of anim.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const node = THREE.PropertyBinding.findNode(root, parsed.nodeName);
    const prop = parsed.propertyName;
    if (!node || !['quaternion', 'position', 'scale'].includes(prop) || parsed.propertyIndex !== undefined) continue;
    items.push({ node, prop, it: track.createInterpolant() });
  }
  return (t) => {
    for (const { node, prop, it } of items) {
      const v = it.evaluate(t);
      if (prop === 'quaternion') node.quaternion.set(v[0], v[1], v[2], v[3]).normalize();
      else node[prop].set(v[0], v[1], v[2]);
    }
  };
}

export function clipFromAnimation(sourceRoot, anim, { id, name, tags = [], fps = 30, source = 'importado', author = '', rig = null, loopPorNombre = true } = {}) {
  const r = rig || new Rig(sourceRoot);
  if (!r.humanoid) throw new Error('El esqueleto no parece humanoide (faltan cadera, brazos o piernas).');
  r.resetToRest();
  // Reposo tumbado respecto a la animación (FBX de Mixamo): enderezarlo antes de medir.
  // Se mira con un mezclador aparte para que el de abajo empiece limpio.
  const sample = trackSampler(sourceRoot, anim);
  {
    sample(0);
    sourceRoot.updateMatrixWorld(true);
    const F0 = r.currentFrame();
    if (F0) r.alignRestTo(F0);
    r.resetToRest();
  }
  const dur = Math.max(anim.duration, 1 / fps);
  const frames = Math.max(2, Math.round(dur * fps) + 1);
  const ids = Object.keys(r.Tw);
  const tracks = Object.fromEntries(ids.map((c) => [c, new Float32Array(frames * 4)]));
  const hips = new Float32Array(frames * 3);
  const pose = newPose();
  for (let i = 0; i < frames; i++) {
    const t = Math.min(i / fps, dur - 1e-5);
    r.resetToRest();
    sample(Math.max(0, t));
    sourceRoot.updateMatrixWorld(true);
    r.captureCanonical(pose);
    for (const c of ids) {
      const q = pose.q[c];
      // continuidad del signo
      if (i > 0) {
        const a = tracks[c];
        const dot = a[(i - 1) * 4] * q.x + a[(i - 1) * 4 + 1] * q.y + a[(i - 1) * 4 + 2] * q.z + a[(i - 1) * 4 + 3] * q.w;
        if (dot < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      }
      q.toArray(tracks[c], i * 4);
    }
    pose.hips.toArray(hips, i * 3);
  }
  r.resetToRest();
  sourceRoot.updateMatrixWorld(true);
  // ¿Es un bucle? (primer y último fotograma casi iguales, o el nombre lo dice)
  const loop = cierraBucle(tracks, frames) || (loopPorNombre && /loop|idle|walk|run|jog|sprint|caminar|correr/i.test(name || anim.name));
  return makeClip({ id, name: name || anim.name, tags, fps, frames, loop, source, author, tracks, hips });
}

/** Primer y último fotograma casi iguales en todas las pistas. */
export function cierraBucle(tracks, frames) {
  let diff = 0;
  for (const c in tracks) {
    const a = tracks[c];
    const l = (frames - 1) * 4;
    diff = Math.max(diff, 1 - Math.abs(a[0] * a[l] + a[1] * a[l + 1] + a[2] * a[l + 2] + a[3] * a[l + 3]));
  }
  return diff < 0.002;
}

export function clipToJSON(clip) {
  return {
    formato: 'taller-animacion/clip@1',
    id: clip.id, name: clip.name, tags: clip.tags, fps: clip.fps, frames: clip.frames, loop: clip.loop,
    source: clip.source, author: clip.author,
    ...(clip.native ? { native:clip.native, character:clip.character, animal:clip.animal } : {}),
    tracks: Object.fromEntries(Object.entries(clip.tracks).map(([k, v]) => [k, Array.from(v, (x) => +x.toFixed(5))])),
    hips: clip.hips ? Array.from(clip.hips, (x) => +x.toFixed(5)) : null,
  };
}

export function clipFromJSON(j) {
  const tracks = {};
  for (const [k, v] of Object.entries(j.tracks)) if (CANON_IDS.includes(k)) tracks[k] = Float32Array.from(v);
  const clip = makeClip({ ...j, tracks, hips: j.hips ? Float32Array.from(j.hips) : null });
  if (j.native) Object.assign(clip, { native:j.native, character:j.character, animal:j.animal });
  return clip;
}

/** Clip de una sola pose a partir de una pose canónica. */
export function clipFromPose(pose, { id, name, tags = [], frames = 2 }) {
  const tracks = {};
  for (const c in pose.q) {
    const a = new Float32Array(frames * 4);
    for (let i = 0; i < frames; i++) pose.q[c].toArray(a, i * 4);
    tracks[c] = a;
  }
  const hips = new Float32Array(frames * 3);
  for (let i = 0; i < frames; i++) pose.hips.toArray(hips, i * 3);
  return makeClip({ id, name, tags, frames, loop: true, source: 'propio', tracks, hips });
}
