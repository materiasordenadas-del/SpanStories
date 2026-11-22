import * as THREE from 'three';

// Corrección opcional por personaje: hay modelos cuyos morphs de sonrisa elevan el labio pero no mueven
// la arcada inferior, y los dientes asoman. Solo actúa si el perfil del personaje la pide:
//   perfiles-personaje.json → personajes.<id>.cuerpo.dientesConSonrisa = { "sube": 0.004, "retrae": 0.006, "hueso": "DEF-teeth.B" }
// (metros por metro de altura del personaje). No modifica geometría, morphs ni la mandíbula.
const estados = new WeakMap();

function estado(vida, cfg) {
  let s = estados.get(vida);
  if (!s) {
    const nombre = cfg?.hueso || 'DEF-teeth.B', limpio = nombre.replace(/[^a-z0-9_]/gi, '');
    const hueso = vida.huesos[nombre] || vida.huesos[limpio] || Object.values(vida.huesos).find(h => h.name === nombre || h.name === limpio);
    s = { hueso, delta: new THREE.Vector3(), aplicado: false };
    estados.set(vida, s);
  }
  return s;
}

// Llamar ANTES de vida.antes()/mixer.update(): resta solo nuestro desplazamiento.
export function restaurarDientes(vida) {
  const s = estados.get(vida);
  if (!s?.aplicado || !s.hueso) return;
  s.hueso.position.sub(s.delta);
  s.hueso.updateMatrix();
  s.aplicado = false;
}

// Llamar DESPUÉS de vida.update(). manual=true evita intervenir con controles faciales manuales.
export function ajustarDientes(vida, cfg, { manual = false, facialSmile = null } = {}) {
  if (!cfg) return;
  const s = estado(vida, cfg);
  restaurarDientes(vida);
  if (!s.hueso || manual || vida.habla) return;
  const historiaManual = Object.entries(vida.historia).some(([n, valor]) =>
    Math.abs(valor) > 1e-5 && /^(jaw|mouth|vis_)/.test(n));
  if (historiaManual) return;
  const p = vida.expr?.pesos || {};
  const sonrisa = Math.min(1, facialSmile ?? (.82 * (p.feliz || 0) + .98 * (p.muyFeliz || 0) + (p.riendo || 0)));
  if (sonrisa < .001 || vida._leer('jawOpen') < .04) return;
  const q = vida.root.getWorldQuaternion(new THREE.Quaternion());
  const mundo = new THREE.Vector3(0, cfg.sube ?? .004, -(cfg.retrae ?? .006))
    .multiplyScalar(vida.altura * sonrisa).applyQuaternion(q);
  s.hueso.parent.updateWorldMatrix(true, false);
  const inversa = new THREE.Matrix3().setFromMatrix4(s.hueso.parent.matrixWorld).invert();
  s.delta.copy(mundo).applyMatrix3(inversa);
  s.hueso.position.add(s.delta);
  s.hueso.updateWorldMatrix(false, true);
  s.aplicado = true;
}
