// Estado en el enlace (#...): tiras, capas con claves, rango. Todo en la URL, sin servidor.
import * as THREE from 'three';
import { newDocument, newLayer, isQuatTrack, ikVersion } from '../core/animation.js';

const D = 180 / Math.PI;
const r = (x, n = 2) => +(+x).toFixed(n);

function encodeVal(id, v) {
  if (isQuatTrack(id)) {
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(v));
    return [e.x * D, e.y * D, e.z * D].map((x) => r(x)).join('/');
  }
  return v.map((x) => r(x, 4)).join('/');
}
function decodeVal(id, s) {
  const n = s.split('/').map(Number);
  if (isQuatTrack(id)) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(n[0] / D, n[1] / D, n[2] / D)).toArray();
  }
  return n;
}

/** rig: para escribir huesos mapeados con su nombre canónico (@canon), válidos en otro personaje. */
export function docToHash(doc, rig) {
  const p = new URLSearchParams();
  const canonOfName = new Map(Object.entries(rig.mapping).map(([c, n]) => [n, c]));
  const tname = (id) => {
    const m = id.match(/^([rts]):(.*)$/);
    if (!m) return id;
    const c = canonOfName.get(m[2]);
    return c ? `${m[1]}:@${c}` : id;
  };
  if (doc.strips.length) {
    p.set('s', doc.strips.map((s) => [s.clipId, s.start, s.len, s.blend || 0, r(s.speed || 1, 3), [s.loop && 'l', s.inPlace && 'i', s.mirror && 'm', s.reverse && 'r'].filter(Boolean).join(''), ...(s.warp ? [s.warp.map((x) => r(x, 3)).join('_')] : []), ...(s.root ? ['R' + [s.root.x || 0, s.root.y || 0, s.root.z || 0, s.root.yaw || 0].map((x) => r(x, 3)).join('_')] : []), ...(s.timeMap?.k?.length ? ['T' + s.timeMap.len0 + '_' + s.timeMap.k.map(([x, y]) => `${r(x, 2)}:${r(y, 2)}`).join('_')] : []), ...(s.offset ? ['O' + r(s.offset, 2)] : [])].join('~')).join('|'));
  }
  if (doc.strips.length === 1) p.set('clip', doc.strips[0].clipId);
  for (const l of doc.layers) {
    const byFrame = new Map();
    for (const [id, keys] of Object.entries(l.tracks)) {
      for (const k of keys) {
        if (!byFrame.has(k.f)) byFrame.set(k.f, []);
        byFrame.get(k.f).push(`${tname(id)}=${encodeVal(id, k.v)}${k.i && k.i !== 'smooth' ? '!' + (k.i === 'bezier' ? 'b' + (k.b || [0.42, 0, 0.58, 1]).map((x) => r(x, 3)).join('_') : k.i === 'step' ? 's' : k.i === 'out' ? 'o' : k.i[0]) : k.bc ? '!m' : ''}${k.bc ? Object.entries(k.bc).map(([c, b]) => `!${c}c${b.map((x) => r(x, 3)).join('_')}`).join('') : ''}`);
      }
    }
    const keys = [...byFrame.entries()].sort((a, b) => a[0] - b[0]).map(([f, xs]) => `${r(f / doc.fps, 3)}:${xs.join(',')}`).join('|');
    const flags = [l.mode === 'add' ? 'a' : 'o', l.mute && 'm', l.solo && 's', l.lock && 'k'].filter(Boolean).join('');
    p.append('k', [keys, `id=${l.id}`, `n=${l.name}`, `w=${r(l.weight, 3)}`, `f=${flags}`, l.mask ? `mk=${l.mask.join('.')}` : ''].filter(Boolean).join(';'));
  }
  const ik = Object.entries(doc.ik).filter(([, v]) => v).map(([k]) => k);
  if (ik.length) p.set('ik', ik.join('.'));
  if (doc.floor) p.set('fl', '1');
  if (doc.collide) p.set('co', '1');
  if (doc.reach === false) p.set('re', '0');
  const py = Object.entries(doc.pinY || {}).filter(([, v]) => v).map(([k]) => k);
  if (py.length) p.set('py', py.join('.'));
  if (doc.rangeMode !== 'auto') p.set('r', `${doc.start}~${doc.end}`);
  p.set('iv', String(doc.ikv || 1));
  if (doc.anatomyMode) p.set('am',doc.anatomyMode);
  // marcadores del retimer (Herramientas)
  if (doc.markers?.length) p.set('mr', doc.markers.map((m) => `${m.f}:${encodeURIComponent(m.name)}`).join('|'));
  // Motion Director: viaja el plan (destinos, caminos, acciones); la trayectoria se recompila al abrir.
  if (doc.director && (doc.director.steps?.length || doc.director.paths?.length || doc.director.targets?.length || doc.director.aims?.length)) p.set('md', JSON.stringify(doc.director));
  return p.toString();
}

export function hashToDoc(hash, rig) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const doc = newDocument();
  if (['anatomico','estilizado','libre'].includes(p.get('am'))) doc.anatomyMode=p.get('am');
  const s = p.get('s');
  if (s) {
    doc.strips = s.split('|').map((x, i) => {
      const [clipId, start, len, blend, speed, fl = '', ...extra] = x.split('~');
      // extras opcionales: curva de tiempo (4 números) y dirección de la tira «R x_y_z_yaw»
      const rootF = extra.find((e) => e.startsWith('R'));
      const tmF = extra.find((e) => e.startsWith('T'));
      const offF = extra.find((e) => e.startsWith('O'));
      const warp = extra.find((e) => !/^[RTO]/.test(e)) || '';
      const wp = warp.split('_').map(Number);
      const rv = rootF ? rootF.slice(1).split('_').map(Number) : null;
      // retimer (Herramientas): «T<len0>_x:y_x:y…»
      const tmParts = tmF ? tmF.slice(1).split('_') : null;
      const tm = tmParts && tmParts.length > 2 ? { len0: +tmParts[0], k: tmParts.slice(1).map((p) => p.split(':').map(Number)).filter((p) => p.length === 2 && p.every(isFinite)) } : null;
      return { ...(offF && isFinite(+offF.slice(1)) && +offF.slice(1) ? { offset: +offF.slice(1) } : {}), ...(tm && tm.k.length >= 2 ? { timeMap: tm } : {}), ...(wp.length === 4 && wp.every(isFinite) ? { warp: wp } : {}), ...(rv && rv.length === 4 && rv.every(isFinite) ? { root: { x: rv[0], y: rv[1], z: rv[2], yaw: rv[3] } } : {}), id: `s${i}`, clipId, start: +start, len: +len, blend: +blend, speed: +speed || 1, loop: fl.includes('l'), inPlace: fl.includes('i'), mirror: fl.includes('m'), reverse: fl.includes('r') };
    });
  } else if (p.get('clip')) {
    doc.strips = [{ id: 's0', clipId: p.get('clip'), start: 0, len: -1, blend: 0, speed: 1, loop: true, inPlace: true }];
  }
  const layers = p.getAll('k');
  if (layers.length) {
    doc.layers = [];
    for (const raw of layers) {
      const parts = raw.split(';');
      const meta = {};
      const keyParts = [];
      for (const part of parts) {
        const m = part.match(/^(id|n|w|f|mk)=(.*)$/);
        if (m) meta[m[1]] = m[2];
        else keyParts.push(part);
      }
      const l = newLayer(meta.id || `capa${doc.layers.length}`, meta.n || 'Capa');
      if (meta.w) l.weight = +meta.w;
      const fl = meta.f || 'a';
      l.mode = fl.includes('o') ? 'over' : 'add';
      l.mute = fl.includes('m');
      l.solo = fl.includes('s');
      l.lock = fl.includes('k');
      if (meta.mk) l.mask = meta.mk.split('.');
      for (const block of keyParts.join(';').split('|').filter(Boolean)) {
        const i = block.indexOf(':');
        const t = +block.slice(0, i);
        const f = Math.round(t * doc.fps);
        for (const item of block.slice(i + 1).split(',')) {
          const eq = item.indexOf('=');
          if (eq < 0) continue;
          let id = item.slice(0, eq);
          let val = item.slice(eq + 1);
          let interp = 'smooth';
          let bez = null;
          let bc = null;
          // tangentes por canal: !<canal>c<x1_y1_x2_y2> al final
          val = val.replace(/!(\d)c([-\d._e]+)/g, (_, c, nums) => {
            const b = nums.split('_').map(Number);
            if (b.length === 4 && b.every(isFinite)) (bc ||= {})[c] = b;
            return '';
          });
          const bang = val.indexOf('!');
          if (bang >= 0) {
            interp = { l: 'linear', s: 'step', a: 'auto', i: 'in', o: 'out', b: 'bezier' }[val[bang + 1]] || 'smooth';
            if (interp === 'bezier') bez = val.slice(bang + 2).split('_').map(Number);
            val = val.slice(0, bang);
          }
          // compatibilidad: nombre suelto sin prefijo = rotación de hueso
          if (!/^(r|t|s|ik|w):/.test(id) && !id.startsWith('ik:')) id = `r:${id}`;
          const m = id.match(/^([rts]):@(.*)$/);
          if (m) {
            const real = rig.mapping[m[2]];
            if (!real) continue;
            id = `${m[1]}:${real}`;
          }
          const keys = (l.tracks[id] ||= []);
          keys.push({ f, v: decodeVal(id, val), i: interp, ...(bez && bez.length === 4 && bez.every(isFinite) ? { b: bez } : {}), ...(bc ? { bc } : {}) });
        }
      }
      for (const k of Object.values(l.tracks)) k.sort((a, b) => a.f - b.f);
      doc.layers.push(l);
    }
    if (!doc.layers.find((l) => l.id === 'base')) doc.layers.unshift(newLayer('base', 'Base'));
    doc.layers.sort((a, b) => (a.id === 'base' ? -1 : b.id === 'base' ? 1 : 0));
  }
  if (p.get('ik')) for (const k of p.get('ik').split('.')) if (k in doc.ik) doc.ik[k] = true;
  // versión del IK: los enlaces antiguos (sin «iv») que traen polos se leen como entonces
  doc.ikv = p.get('iv') ? +p.get('iv') || 1 : undefined;
  doc.ikv = ikVersion(doc);
  if (p.get('mr')) doc.markers = p.get('mr').split('|').map((x, i) => { const [f, n] = x.split(':'); return { id: `mk${i}`, f: +f, name: decodeURIComponent(n || `M${i + 1}`) }; }).filter((m) => isFinite(m.f));
  if (p.get('fl')) doc.floor = true;
  if (p.get('co')) doc.collide = true;
  if (p.get('re') === '0') doc.reach = false;
  if (p.get('py')) for (const k of p.get('py').split('.')) doc.pinY[k] = true;
  if (p.get('r')) {
    const [a, b] = p.get('r').split('~').map(Number);
    doc.rangeMode = 'manual';
    doc.start = a;
    doc.end = b;
  }
  if (p.get('md')) {
    try {
      const d = JSON.parse(p.get('md'));
      if (d && Array.isArray(d.steps) && Array.isArray(d.paths) && d.start) doc.director = d;
    } catch {
      /* plan ilegible: se ignora */
    }
  }
  return doc;
}
