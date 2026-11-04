// Expresiones Corporales en three.js: el cuerpo encima de caminar/hablar como capa ADITIVA y la cara por morphs.
//
// El GLB trae los clips como poses absolutas (neutra + delta):
//   EC_neutra (bucle), EC_<gesto>_<M|F>_entrada, EC_<gesto>_<M|F>_bucle, EC_<gesto>_<M|F>_salida
// y el contrato <personaje>_expresiones.json dice, por gesto, los clips, los tiempos y los pesos de morph de la cara.
// makeClipAdditive(clip, 0, EC_neutra) deja en cada clip solo la diferencia con la neutra: se suma a lo que haga la
// capa de abajo (caminar, hablar, idle) sin pisarla.
//
//   import { CapasCuerpo } from './ejemplo_capas.js';
//   const capas = new CapasCuerpo(gltf, contrato, { malla: cara });   // cara: THREE.Mesh con los morphs
//   capas.base('Caminar');                                            // capa normal (opcional)
//   capas.expresion('sorpresa');                                      // entrada -> bucle (hasta que se pida otra)
//   capas.expresion(null);                                            // salida y vuelta a la base
//   en el bucle de render: capas.update(dt);
import * as THREE from 'three';

export class CapasCuerpo {
  constructor(gltf, contrato, { raiz = gltf.scene, malla = null, intensidadCuerpo = 1, intensidadCara = 1 } = {}) {
    this.contrato = contrato;
    this.mixer = new THREE.AnimationMixer(raiz);
    this.clips = Object.fromEntries(gltf.animations.map((c) => [c.name, c]));
    this.malla = malla;
    this.kCuerpo = intensidadCuerpo;
    this.kCara = intensidadCara;
    const neutra = this.clips[contrato.neutra.clip];
    // Todos los clips EC_* (menos la neutra) pasan a aditivos respecto al primer fotograma de la neutra.
    this.aditivos = {};
    for (const [nombre, clip] of Object.entries(this.clips)) {
      if (!nombre.startsWith('EC_') || nombre === contrato.neutra.clip) continue;
      const c = clip.clone();
      THREE.AnimationUtils.makeClipAdditive(c, 0, neutra);
      c.blendMode = THREE.AdditiveAnimationBlendMode;
      this.aditivos[nombre] = c;
    }
    this.accionBase = null;
    this.actual = null;          // {gesto, fase, accion}
    this.cara = { desde: {}, hacia: {}, t: 1, dur: 0.15 };
    this.mixer.addEventListener('finished', (e) => this._alTerminar(e));
  }

  // capa de abajo: cualquier clip normal del GLB (caminar, hablar...) o la neutra
  base(nombre = this.contrato.neutra.clip) {
    const clip = this.clips[nombre];
    if (!clip) throw new Error(`No hay clip ${nombre}`);
    const a = this.mixer.clipAction(clip);
    a.setLoop(THREE.LoopRepeat, Infinity).play();
    if (this.accionBase && this.accionBase !== a) this.accionBase.crossFadeTo(a, 0.3, false);
    this.accionBase = a;
  }

  _accion(nombre, bucle) {
    const a = this.mixer.clipAction(this.aditivos[nombre]);
    a.reset();
    a.setEffectiveWeight(this.kCuerpo);
    a.setLoop(bucle ? THREE.LoopRepeat : THREE.LoopOnce, bucle ? Infinity : 1);
    a.clampWhenFinished = !bucle;
    return a.play();
  }

  expresion(gesto) {
    if (this.actual) {                         // la que hubiera sale (su clip de salida vuelve a la neutra)
      const g = this.contrato.gestos[this.actual.gesto];
      this.actual.accion.fadeOut(0.1);
      const sal = this._accion(g.clips.salida, false);
      sal.fadeIn(0.1);
      this.saliendo = sal;
      this.actual = null;
    }
    const g = gesto && this.contrato.gestos[gesto];
    if (!g || !g.clips) { this._cara({}); return; }
    // la cara entra un poco antes que el cuerpo (adelanto_cara_s) y sale con él
    this._cara(g.cara?.[this.malla?.name] ?? Object.values(g.cara ?? {})[0] ?? {}, g.adelanto_cara_s ?? 0.1);
    const ent = this._accion(g.clips.entrada, false);
    this.actual = { gesto, fase: 'entrada', accion: ent };
  }

  _alTerminar(e) {
    if (this.saliendo && e.action === this.saliendo) { this.saliendo.stop(); this.saliendo = null; return; }
    if (!this.actual || e.action !== this.actual.accion || this.actual.fase !== 'entrada') return;
    const g = this.contrato.gestos[this.actual.gesto];
    const bucle = this._accion(g.clips.bucle, true);   // el bucle empieza donde acaba la entrada: sin salto
    this.actual.accion.stop();
    this.actual = { gesto: this.actual.gesto, fase: 'bucle', accion: bucle };
  }

  _cara(pesos, dur = 0.15) {
    if (!this.malla) return;
    const dic = this.malla.morphTargetDictionary;
    const inf = this.malla.morphTargetInfluences;
    this.cara.desde = Object.fromEntries(Object.entries(dic).map(([n, i]) => [n, inf[i]]));
    this.cara.hacia = Object.fromEntries(Object.keys(dic).map((n) => [n, (pesos[n] ?? 0) * this.kCara]));
    this.cara.t = 0;
    this.cara.dur = Math.max(dur, 1e-3);
  }

  update(dt) {
    this.mixer.update(dt);
    if (this.malla && this.cara.t < 1) {
      this.cara.t = Math.min(1, this.cara.t + dt / this.cara.dur);
      const s = this.cara.t * this.cara.t * (3 - 2 * this.cara.t);
      const dic = this.malla.morphTargetDictionary;
      for (const [n, i] of Object.entries(dic)) {
        const a = this.cara.desde[n] ?? 0, b = this.cara.hacia[n] ?? 0;
        this.malla.morphTargetInfluences[i] = a + (b - a) * s;
      }
    }
  }
}
