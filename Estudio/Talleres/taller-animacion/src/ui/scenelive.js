// «En escena» dentro del Estudio: el Taller trabaja sobre el MISMO escenario vivo que el Editor y el Estudio.
// El visor del Taller se vuelve transparente; debajo, el motor del Estudio dibuja la escena y al actor.
//   · la cámara la mueve el Taller y el motor la sigue (VIEW)
//   · la pose la calcula el Taller y el actor de la escena la muestra (POSE), con su luz y lo que lo tapa
//   · el suelo se pregunta al motor (RAY): destinos y caminos caen sobre el suelo real
// Aquí solo se ven encima los controles del rig, el gizmo y los caminos. Si el escenario no responde, el Taller
// sigue como siempre, con su propio visor.
import * as THREE from 'three';
import { $ } from './dom.js';
import { studioEmbedded, studioHold } from '../io/studio-boot.js';
import { applySceneBoneMatrices } from '../core/rig.js';

export function mountSceneLive(app) {
  const vp = app.viewport;
  // pre: dentro del Estudio, mientras se prepara «En escena» el cuerpo propio del Taller ya no se pinta (lo pinta el
  // escenario): así no se compilan sus shaders ni se suben sus texturas (~5 s de bloqueo al abrir el Taller).
  const L = { pre: studioEmbedded, on: false, starting: false, X: new THREE.Matrix4(), Xi: new THREE.Matrix4(), scale: 1, pending: new Map(), bones: [], lastPose: '', lastView: '', saved: null, rect: '' };
  const link = () => app.studioLink;
  // Cuerpo propio «En escena»: material que no se dibuja (visible: false). Antes se pintaba sin color ni profundidad,
  // y aun así cada fotograma pagaba la piel (skinning) de todas sus mallas en la GPU que comparte con el escenario.
  // El clic sobre la malla sigue funcionando: el raycast no mira el material.
  const ghost = new THREE.MeshBasicMaterial({ visible: false });
  let seq = 1;

  const ask = (op, data, timeout = 4000) => new Promise((resolve, reject) => {
    const requestId = `sl${seq++}`;
    const timer = setTimeout(() => {
      L.pending.delete(requestId);
      reject(new Error('El escenario no respondió'));
    }, timeout);
    L.pending.set(requestId, (reply) => {
      clearTimeout(timer);
      if (reply.type === 'WORKSHOP_ERROR' || reply.type === 'WORKSHOP_PAIR_ERROR') reject(new Error(reply.message || 'El escenario rechazó la petición'));
      else resolve(reply);
    });
    link().post('SCENE', { op, requestId, ...data });
  });
  // Estados enviados al escenario (nº → cámara + pose + gizmo) y el último que confirmó haber pintado.
  // El escenario pinta uno o dos fotogramas después (los mensajes pasan por el Estudio): los controles se dibujan con
  // ese mismo estado, así malla, puntos y gizmo van juntos incluso en arrastres muy rápidos.
  L.views = new Map();
  L.viewSeq = 0;
  L.drawn = null;
  L.last = null;
  /** Estado con el que dibujar los controles para ir al paso del escenario (null: el de ahora). */
  L.drawnView = () => {
    if (!L.on || !L.drawn) return null;
    const last = L.last;
    // si el escenario deja de confirmar (otra versión, o se perdió un mensaje), se vuelve al estado de ahora
    if (last && last !== L.drawn && performance.now() - last.t > 400) return null;
    return L.drawn;
  };
  // Búferes para guardar la pose de ahora mientras se dibuja la confirmada (sin crear objetos en cada fotograma).
  const _now = { q: null, p: null, gp: new THREE.Vector3(), gq: new THREE.Quaternion(), gs: new THREE.Vector3(), cp: new THREE.Vector3(), cq: new THREE.Quaternion(), ik: new Map() };
  /**
   * Pone en el visor el estado que el escenario confirmó haber pintado (cámara, huesos, efectores IK y objeto del
   * gizmo) y devuelve la función que deja todo como estaba. Solo para dibujar: nada se guarda ni se clava.
   */
  L.applyDrawn = (v) => {
    const cam = vp.camera;
    const useCam = cam.isPerspectiveCamera;
    if (useCam) {
      _now.cp.copy(cam.position);
      _now.cq.copy(cam.quaternion);
      cam.position.copy(v.p);
      cam.quaternion.copy(v.q);
      cam.updateMatrixWorld();
    }
    // El último estado enviado es el de ahora: no hay pose que cambiar (lo normal con todo quieto).
    // Pareja montada (caballo + jinete): la pose guardada en el estado es la del motor SIN sentar (la cadera del jinete
    // aún no está en la silla) y el escenario recibe las matrices ya sentadas. Restaurarla dejaba los puntos del jinete
    // de pie bajo la silla cada vez que algo se movía (reproducir, arrastrar, cámara que sigue a la selección).
    // Con pareja, los controles usan la pose de ahora (ya sentada) y solo la cámara confirmada.
    const posed = !L.pair && v !== L.last && v.pose && v.pose.q.length === L.bones.length * 4;
    const g = vp.gizmo.object;
    const gz = posed && v.gz && v.gz.o === g ? v.gz : null;
    if (gz) {
      // antes que los huesos: el objeto del gizmo puede ser uno de ellos
      _now.gp.copy(g.position);
      _now.gq.copy(g.quaternion);
      _now.gs.copy(g.scale);
    }
    if (posed) {
      const n = L.bones.length;
      if (!_now.q || _now.q.length !== n * 4) {
        _now.q = new Float32Array(n * 4);
        _now.p = new Float32Array(n * 3);
      }
      for (let i = 0; i < n; i++) {
        const b = L.bones[i];
        b.quaternion.toArray(_now.q, i * 4);
        b.position.toArray(_now.p, i * 3);
        b.quaternion.fromArray(v.pose.q, i * 4);
        b.position.fromArray(v.pose.p, i * 3);
      }
      const ik = app.engine.ikState || {};
      for (const [c, s] of v.ik || []) {
        const st = ik[c];
        if (!st) continue;
        let keep = _now.ik.get(c);
        if (!keep) _now.ik.set(c, (keep = { t: new THREE.Vector3(), q: new THREE.Quaternion(), p: new THREE.Vector3() }));
        keep.t.copy(st.target);
        if (st.targetQ) keep.q.copy(st.targetQ);
        if (st.pole) keep.p.copy(st.pole);
        st.target.copy(s.t);
        if (st.targetQ && s.q) st.targetQ.copy(s.q);
        if (st.pole && s.p) st.pole.copy(s.p);
      }
      if (gz) {
        g.position.copy(gz.p);
        g.quaternion.copy(gz.q);
        g.scale.copy(gz.s);
      }
      app.rig.root.updateMatrixWorld(true);
      if (gz) g.updateMatrixWorld(true);
    }
    return () => {
      if (posed) {
        const n = L.bones.length;
        for (let i = 0; i < n; i++) {
          L.bones[i].quaternion.fromArray(_now.q, i * 4);
          L.bones[i].position.fromArray(_now.p, i * 3);
        }
        const ik = app.engine.ikState || {};
        for (const [c] of v.ik || []) {
          const st = ik[c];
          const keep = _now.ik.get(c);
          if (!st || !keep) continue;
          st.target.copy(keep.t);
          if (st.targetQ) st.targetQ.copy(keep.q);
          if (st.pole) st.pole.copy(keep.p);
        }
        if (gz) {
          g.position.copy(_now.gp);
          g.quaternion.copy(_now.gq);
          g.scale.copy(_now.gs);
        }
        app.rig.root.updateMatrixWorld(true);
        if (gz) g.updateMatrixWorld(true);
      }
      if (useCam) {
        cam.position.copy(_now.cp);
        cam.quaternion.copy(_now.cq);
        cam.updateMatrixWorld();
      }
      // El gizmo guarda su posición y la cámara al dibujarse: se rehacen con el estado de ahora para que el
      // próximo movimiento del ratón se calcule sobre lo real, no sobre lo pintado.
      if (posed || useCam) vp.gizmo.getHelper?.().updateMatrixWorld(true);
    };
  };
  /** Respuestas del motor, reenviadas por el Estudio. */
  // Canal directo con el escenario (lo reparte el Estudio al entrar en escena): vista, pose y confirmaciones van de
  // marco a marco, sin el viaje de ida y vuelta por el Estudio. Si el escenario deja de confirmar por él (se recargó),
  // se vuelve al camino del Estudio, que avisa de la sesión perdida.
  L.port = null;
  L.sentAt = 0;
  L.ackAt = 0;
  L.dropPort = () => {
    if (!L.port) return;
    try { L.port.close(); } catch {}
    L.port = null;
  };
  L.adoptPort = (port) => {
    L.dropPort();
    L.port = port;
    L.ackAt = L.sentAt = performance.now();
    port.onmessage = (ev) => {
      if (L.port !== port) return;
      const d = ev.data;
      if (d?.type === 'WORKSHOP_DRAWN' || d?.type === 'WORKSHOP_LOST') L.receive(d);
    };
    port.start?.();
  };
  /** Vista y pose al escenario: por el canal directo si lo hay; si no, a través del Estudio. */
  const sendState = (op, data) => {
    if (L.port) {
      try {
        L.port.postMessage({ type: op === 'view' ? 'WORKSHOP_VIEW' : 'WORKSHOP_POSE', ...data });
        return;
      } catch {
        L.dropPort();
      }
    }
    link().post('SCENE', { op, ...data });
  };
  L.receive = (reply, ports = null) => {
    if (!reply || typeof reply.type !== 'string') return;
    if (reply.type === 'WORKSHOP_PORT') {
      if (ports?.[0]) L.adoptPort(ports[0]);
      return;
    }
    if (reply.type === 'WORKSHOP_DRAWN') L.ackAt = performance.now();
    const fn = L.pending.get(reply.requestId);
    if (fn) {
      L.pending.delete(reply.requestId);
      fn(reply);
    } else if (reply.type === 'WORKSHOP_DRAWN') {
      // el escenario pintó el estado nº seq: los controles se dibujan con esa misma cámara y esa misma pose
      const v = L.views.get(reply.seq);
      if (v) {
        L.drawn = v;
        for (const k of [...L.views.keys()]) if (k < reply.seq) L.views.delete(k);
      }
    } else if (reply.type === 'WORKSHOP_LOST') void L.restart();
    else if (reply.type === 'WORKSHOP_ERROR' && L.on) L.stop(reply.message);
  };

  function sendRect() {
    const r = $('#viewport').getBoundingClientRect();
    const key = [r.left, r.top, r.width, r.height].map(Math.round).join('|');
    if (key === L.rect) return;
    L.rect = key;
    link().post('SCENE', { op: 'rect', rect: [r.left, r.top, r.width, r.height] });
  }

  /** Mallas del personaje: se siguen dibujando (para poder elegirlas con un clic) pero sin color: se ve el del escenario. */
  function hideBody(hide) {
    for (const [o, m] of vp.original || []) o.material = hide ? ghost : m;
    // Sin cuerpo ni suelo propios no hay sombras que hacer: el mapa de sombras costaba ~1 s de shaders al entrar.
    vp.renderer.shadowMap.enabled = !hide;
    if (!hide) vp.applyShading();
  }
  /** Precargado en el Estudio: compila ya lo que se verá encima del escenario (controles, gizmo, caminos). */
  L.precompile = () => {
    if (L.precompiled || !studioHold.held || !link()?.loaded?.()) return;
    L.precompiled = true;
    const run = () => { try { vp.renderer.compileAsync ? vp.renderer.compileAsync(vp.scene, vp.camera).catch(() => {}) : vp.renderer.compile(vp.scene, vp.camera); } catch {} };
    (window.requestIdleCallback || setTimeout)(run, { timeout: 3000 });
  };

  // Cambiar el sombreado (alambre, gris…) no debe destapar el cuerpo mientras se ve el del escenario.
  const shade = vp.applyShading.bind(vp);
  vp.applyShading = () => {
    shade();
    if (L.on || L.pre) for (const [o] of vp.original || []) o.material = ghost;
  };
  // Las miniaturas de la biblioteca sí necesitan el cuerpo: se destapa solo para esa foto.
  const thumb = app.renderThumb.bind(app);
  app.renderThumb = (id) => {
    if (!L.on && !L.pre) return thumb(id);
    for (const [o, m] of vp.original || []) o.material = m;
    try {
      return thumb(id);
    } finally {
      for (const [o] of vp.original || []) o.material = ghost;
    }
  };

  /** Compila en segundo plano los materiales reales del cuerpo (los necesitan las miniaturas y el visor propio). */
  let warming = null;
  function warm() {
    if (warming || !vp.original?.size || !vp.renderer.compileAsync) return;
    for (const [o, m] of vp.original) o.material = m;
    try {
      warming = vp.renderer.compileAsync(app.rig.root, vp.camera, vp.scene).catch(() => {});
    } finally {
      if (L.on || L.pre) for (const [o] of vp.original) o.material = ghost;
    }
    warming.then(() => (warming = 'done'));
  }
  /** Mientras se abre «En escena» o se compila el cuerpo, el Taller no pinta miniaturas (bloquearían la apertura). */
  L.busy = () => L.pre || L.starting || (warming && warming !== 'done');

  L.start = async () => {
    if (L.on || L.starting || !link()?.embedded || !link().context()) return false;
    L.starting = true;
    try {
      L.rect = '';
      sendRect();
      const anchor = app.animales?.sceneAnchor() || app.rig;
      L.bones = anchor.bones.slice();
      const reply = await ask('begin', { bones: L.bones.map((b) => b.name), modelSpace: anchor.kind === 'quadruped' });
      if (!reply.matched) throw new Error('El personaje del escenario no tiene el mismo esqueleto');
      // Mundo del Taller → mundo del escenario: misma raíz del modelo en los dos lados.
      anchor.root.updateWorldMatrix(true, false);
      L.X.fromArray(reply.matrix).multiply(anchor.root.matrixWorld.clone().invert());
      L.Xi.copy(L.X).invert();
      L.scale = new THREE.Vector3().setFromMatrixScale(L.X).x || 1;
      L.saved = { bg: vp.scene.background, grid: vp.grid.visible, ground: vp.ground.visible, pos: vp.camera.position.clone(), target: vp.orbit.target.clone(), fov: vp.persp.fov };
      // misma vista que tenía el Estudio
      L.beginShot = reply.shot;
      vp.setOrtho(false);
      vp.persp.fov = reply.shot.fov;
      vp.persp.updateProjectionMatrix();
      vp.camera.position.fromArray(reply.shot.position).applyMatrix4(L.Xi);
      vp.orbit.target.fromArray(reply.shot.target).applyMatrix4(L.Xi);
      vp.orbit.update();
      vp.scene.background = null;
      vp.renderer.setClearColor(0x000000, 0);
      vp.grid.visible = vp.ground.visible = false;
      hideBody(true);
      document.body.classList.add('scene-live');
      L.on = true;
      L.passivePose = L.pair ? null : reply.pose;
      if (L.pair) await installPair(L.pair);
      L.drawn = null;
      L.last = null;
      L.views.clear();
      L.pre = false;
      L.lastPose = L.lastView = '';
      // el suelo de destinos y caminos es el del escenario
      app.directorUI.ground = async (ray) => {
        const o = ray.origin.clone().applyMatrix4(L.X);
        const d = ray.direction.clone().transformDirection(L.X);
        const hit = await ask('ray', { origin: o.toArray(), direction: d.toArray() }, 1500).catch(() => null);
        return hit?.position ? new THREE.Vector3().fromArray(hit.position).applyMatrix4(L.Xi) : null;
      };
      // objetivos (Look At, Reach Target): el punto exacto que se toca en la escena, a su altura
      app.directorUI.ground3D = async (ray) => {
        const o = ray.origin.clone().applyMatrix4(L.X);
        const d = ray.direction.clone().transformDirection(L.X);
        const hit = await ask('ray', { origin: o.toArray(), direction: d.toArray() }, 1500).catch(() => null);
        const p = hit?.point || hit?.position;
        return p ? new THREE.Vector3().fromArray(p).applyMatrix4(L.Xi) : null;
      };
      warm();
      L.tries = 0;
      app.toast('En escena: estás editando sobre el escenario de la historia');
      app.onSceneLive?.(true);
      return true;
    } catch (e) {
      console.warn('En escena', e);
      if (L.on) L.stop();
      else link().post('SCENE', { op: 'end' });
      // Al abrir en frío el escenario del Estudio puede no tener aún al actor (o no contestar): se reintenta solo,
      // sin avisar, mientras «En escena» siga siendo lo que se quiere. Antes se rendía al primer fallo.
      if (L.wants() && L.tries < RETRIES.length) {
        clearTimeout(L.retry);
        L.retry = setTimeout(() => { L.retry = 0; if (L.wants() && !L.on) void L.start(); }, RETRIES[L.tries++]);
        return false;
      }
      L.dropPre();
      app.toast(`No se pudo abrir el escenario (${e.message}). Sigues con el visor del Taller.`, true);
      return false;
    } finally {
      L.starting = false;
    }
  };
  const RETRIES = [800, 1500, 2500, 4000, 6000, 8000];
  L.tries = 0;
  L.retry = 0;

  L.stop = (why = null) => {
    if (!L.on) return;
    L.on = false;
    L.routes.clear();
    L.dropPort();
    link()?.post('SCENE', { op: 'end' });
    app.directorUI.ground = null;
    app.directorUI.ground3D = null;
    document.body.classList.remove('scene-live');
    const s = L.saved;
    vp.scene.background = s.bg;
    vp.renderer.setClearColor(0x000000, 1);
    vp.grid.visible = s.grid;
    vp.ground.visible = s.ground;
    vp.persp.fov = s.fov;
    vp.persp.updateProjectionMatrix();
    vp.camera.position.copy(s.pos);
    vp.orbit.target.copy(s.target);
    hideBody(false);
    if (why) app.toast(`Escenario: ${why}`, true);
    app.onSceneLive?.(false);
  };

  async function installPair(pair) {
    const actors = pair.slots.map(({ id, rig }) => ({ id, bones: rig.bones.map(b => b.name) }));
    const reply = await ask('bindPair', { actors });
    for(const slot of pair.slots) slot.stageMatrix=new THREE.Matrix4().fromArray(reply.matrices[slot.id]);
    const oldX = L.X.clone();
    L.X.fromArray(reply.matrices[pair.horse.id]).multiply(pair.horse.origin.clone().invert());
    L.Xi.copy(L.X).invert();
    pair.sceneMatrix=L.X.clone();
    L.scale = new THREE.Vector3().setFromMatrixScale(L.X).x || 1;
    vp.camera.position.applyMatrix4(oldX).applyMatrix4(L.Xi);
    vp.orbit.target.applyMatrix4(oldX).applyMatrix4(L.Xi);
    vp.orbit.update();
    L.selectPairRig();
  }

  L.bindPair = async (pair) => {
    if (L.on) await installPair(pair);
    L.pair = pair;
    L.passivePose = null;
  };
  L.beginEdit = () => { L.passivePose = null; };
  /** El Taller solo tiene la malla activa; los demás personajes los identifica el escenario vivo. */
  L.pickActor = async (ray, isCurrent = () => true) => {
    if (!L.on) return false;
    const origin = ray.origin.clone().applyMatrix4(L.X).toArray();
    const direction = ray.direction.clone().transformDirection(L.X).toArray();
    const reply = await ask('ray', { origin, direction, actorPick: true }, 1500).catch(() => null);
    if (!L.on || !isCurrent() || !reply?.actorId) return false;
    const slot = L.pair?.slots.find(s => s.id === reply.actorId);
    if (slot) {
      if (slot === L.pair.active) return false;
      await app.animales.pedirRig(slot === L.pair.horse ? 'caballo' : 'jinete');
      return true;
    }
    if (reply.actorId === link().context()?.actorId) return false;
    link().post('SCENE', { op: 'selectActor', actorId: reply.actorId });
    return true;
  };
  L.selectPairRig = () => {
    L.bones = app.rig.bones.slice();
    L.drawn = L.last = null;
    L.views.clear();
    L.lastPose = L.lastView = '';
  };
  L.unbindPair = () => {
    if (!L.pair) return;
    L.pair = null;
    if (L.on) {
      link().post('SCENE', { op: 'unbindPair' });
      void L.restart();
    }
  };

  /**
   * El escenario perdió la sesión (se recargó, o pasó por el Editor) mientras el Taller seguía «En escena»: ignoraba
   * la cámara y la pose, y los controles giraban solos sobre un actor congelado. Se vuelve a entrar con la misma vista.
   */
  L.restart = async () => {
    if (!L.on || L.starting) return;
    const saved = L.saved;
    const pos = vp.camera.position.clone();
    const target = vp.orbit.target.clone();
    const fov = vp.persp.fov;
    L.stop();
    if (!(await L.start())) return;
    L.saved = saved; // al salir se vuelve a la vista que había antes de entrar en escena, no a la de este reenganche
    vp.persp.fov = fov;
    vp.persp.updateProjectionMatrix();
    vp.camera.position.copy(pos);
    vp.orbit.target.copy(target);
    vp.orbit.update();
    L.lastView = '';
  };

  /** Cada fotograma: cámara y pose al escenario (solo si cambiaron). */
  const _p = new THREE.Vector3();
  const _t = new THREE.Vector3();
  L.tick = () => {
    if (!L.on) return;
    sendRect();
    _p.copy(vp.camera.position).applyMatrix4(L.X);
    _t.copy(vp.orbit.target).applyMatrix4(L.X);
    const view = `${_p.x.toFixed(3)},${_p.y.toFixed(3)},${_p.z.toFixed(3)},${_t.x.toFixed(3)},${_t.y.toFixed(3)},${_t.z.toFixed(3)},${vp.persp.fov}`;
    const n = L.bones.length;
    if(L.passivePose){
      const {p,q,s,matched,matrices}=L.passivePose;
      if(matrices)applySceneBoneMatrices(app.rig.root,L.bones,matrices,matched);
      else L.bones.forEach((bone,i)=>{
        if(matched&&!matched[i])return;
        bone.position.fromArray(p,i*3);
        bone.quaternion.fromArray(q,i*4);
        bone.scale.fromArray(s,i*3);
      });
      app.rig.root.updateWorldMatrix(true,true);
    }
    const q = new Float32Array(n * 4);
    const p = new Float32Array(n * 3);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const b = L.bones[i];
      b.quaternion.toArray(q, i * 4);
      b.position.toArray(p, i * 3);
      sum += q[i * 4] * (i + 1) + q[i * 4 + 1] * 3 + q[i * 4 + 2] * 7 + q[i * 4 + 3] + p[i * 3] * 11 + p[i * 3 + 1] * 13 + p[i * 3 + 2] * 17;
    }
    let poses;
    if (L.pair && String(L.pair.poseVersion)!==L.lastPose) {
      const relative = new THREE.Matrix4();
      poses = L.pair.slots.map(({ id, rig }) => {
        rig.root.updateWorldMatrix(true, true);
        const inverse = rig.root.matrixWorld.clone().invert();
        const matrix = L.X.clone().multiply(rig.root.matrixWorld).toArray();
        const bones = new Float32Array(rig.bones.length * 16);
        rig.bones.forEach((bone, i) => relative.multiplyMatrices(inverse, bone.matrixWorld).toArray(bones, i * 16));
        return { id, matrix, bones };
      });
    }
    const key = L.pair ? String(L.pair.poseVersion) : sum.toFixed(5);
    const viewChanged = view !== L.lastView;
    const poseChanged = !L.passivePose&&key !== L.lastPose;
    if (!viewChanged && !poseChanged) return;
    // Un nº por estado enviado (cámara y pose juntas): el escenario confirma el último que pintó.
    const seq = ++L.viewSeq;
    const g = vp.gizmo.object;
    const ik = [];
    for (const [c, st] of Object.entries(app.engine.ikState || {})) if (st?.target) ik.push([c, { t: st.target.clone(), q: st.targetQ?.clone() || null, p: st.pole?.clone() || null }]);
    const state = { p: vp.camera.position.clone(), q: vp.camera.quaternion.clone(), t: performance.now(), pose: { q, p }, ik, gz: g ? { o: g, p: g.position.clone(), q: g.quaternion.clone(), s: g.scale.clone() } : null };
    L.views.set(seq, state);
    L.last = state;
    if (L.views.size > 60) L.views.delete(L.views.keys().next().value);
    // el escenario no confirma por el canal directo (se recargó o lo cerró): de vuelta al camino del Estudio
    const now = performance.now();
    if (L.port && L.ackAt < L.sentAt && now - L.sentAt > 1500) L.dropPort();
    if (L.ackAt >= L.sentAt) L.sentAt = now; // se mide desde el primer estado aún sin confirmar
    if (viewChanged) {
      L.lastView = view;
      sendState('view', { position: _p.toArray(), target: _t.toArray(), fov: vp.persp.fov, seq });
    }
    if (poseChanged) {
      L.lastPose = key;
      let matrices;
      if (!poses && app.rig.kind === 'quadruped') {
        app.rig.root.updateWorldMatrix(true, true);
        const inverse = app.rig.root.matrixWorld.clone().invert(), relative = new THREE.Matrix4();
        matrices = L.bones.flatMap(bone => relative.multiplyMatrices(inverse, bone.matrixWorld).toArray());
      }
      sendState('pose', { q, p, seq, ...(poses ? { poses } : {}), ...(matrices ? { matrices } : {}) });
    }
  };

  /**
   * Ruta que rodea los obstáculos del escenario entre dos puntos del plan ([x, z]); síncrona para el compilador.
   * La primera vez devuelve null (línea recta), la pide al motor y recompila el plan cuando llega.
   */
  L.routes = new Map();
  L.route = (from, to) => {
    if (!L.on) return null;
    const key = [from[0], from[1], to[0], to[1]].map((v) => v.toFixed(2)).join(',');
    if (L.routes.has(key)) return L.routes.get(key) || null;
    if (L.routes.size > 200) L.routes.clear();
    L.routes.set(key, null);
    const o = app.rig.restWorldPos.hips;
    const out = (p) => new THREE.Vector3(p[0] + o.x, 0, p[1] + o.z).applyMatrix4(L.X).toArray();
    ask('route', { from: out(from), to: out(to) }, 6000)
      .then((reply) => {
        const r = reply?.route;
        if (!Array.isArray(r) || r.length < 3 || !L.on) return; // dos puntos: la recta ya vale
        const pts = r.map((p) => {
          const v = new THREE.Vector3().fromArray(p).applyMatrix4(L.Xi);
          return [+(v.x - o.x).toFixed(3), +(v.z - o.z).toFixed(3)];
        });
        pts[0] = from.slice();
        pts[pts.length - 1] = to.slice();
        L.routes.set(key, pts);
        const D = app.directorUI;
        if (D?.compile) {
          D.compile();
          app.evaluate();
          app.timeline?.draw();
          D.redraw?.();
        }
      })
      .catch(() => {});
    return null;
  };

  /** Asientos y demás puntos con nombre del escenario vivo: [{ kind, name, pos: [x, y, z], yaw, seat }] en coordenadas del plan. */
  L.points = async () => {
    if (!L.on) return [];
    const reply = await ask('points', {}, 3000).catch(() => null);
    const o = app.rig.restWorldPos.hips;
    return (reply?.items || []).map((a) => {
      const p = new THREE.Vector3().fromArray(a.position).applyMatrix4(L.Xi);
      const d = new THREE.Vector3(a.facing[0], 0, a.facing[1]).transformDirection(L.Xi);
      return { kind: a.kind, name: a.name, pos: [+(p.x - o.x).toFixed(3), +p.y.toFixed(3), +(p.z - o.z).toFixed(3)], yaw: Math.atan2(d.x, d.z), seat: a.seat };
    });
  };

  /** Los demás personajes de la escena, como objetivos: [{ id, name, pos: [x, y, z] (su cabeza, en coordenadas del plan) }]. */
  L.actors = async () => {
    if (!L.on) return [];
    const reply = await ask('actors', {}, 2500).catch(() => null);
    const o = app.rig.restWorldPos.hips;
    return (reply?.items || []).map((a) => {
      const p = new THREE.Vector3().fromArray(a.head).applyMatrix4(L.Xi);
      return { id: a.id, name: a.name, pos: [+(p.x - o.x).toFixed(3), +p.y.toFixed(3), +(p.z - o.z).toFixed(3)] };
    });
  };

  /** El modo y el personaje deciden: «En escena» con el personaje de la historia puesto. */
  L.wants = () => !studioHold.held && app.mode === 'escena' && !!link()?.embedded && !!link().context() && link().ready() &&
    (app.charMeta.id === link().context().characterId || !!app.animales?.sceneAnchor()) && L.wanted !== false;
  L.sync = () => {
    const want = L.wants();
    if (!want) {
      clearTimeout(L.retry);
      L.retry = 0;
      L.tries = 0;
    }
    if (want && !L.on && !L.retry) void L.start();
    else if (!want && L.on) L.stop();
    // Ya no se va a entrar en escena (otro modo, visor propio elegido o Taller sin personaje): el cuerpo vuelve a verse.
    L.precompile();
    const waiting = studioEmbedded && app.mode === 'escena' && L.wanted !== false && (studioHold.held || !link()?.loaded?.());
    if (!want && !waiting) L.dropPre();
  };
  L.dropPre = () => {
    if (!L.pre) return;
    L.pre = false;
    if (!L.on) hideBody(false);
  };
  /** El usuario puede volver al visor propio del Taller sin salir de «En escena». */
  L.setWanted = (on) => {
    L.wanted = on;
    document.body.classList.toggle('scene-preview',!on);
    L.sync();
  };
  addEventListener('pagehide', () => L.stop());
  // El Estudio lo muestra (entra en escena con la vista del Estudio) o lo vuelve a dejar en espera (sale de la escena).
  studioHold.listeners.add((held) => {
    if (held && L.on) {
      L.stop();
      L.pre = true;
      hideBody(true);
    }
    L.sync();
  });
  if (L.pre) {
    hideBody(true);
    setTimeout(() => { if (!L.on && !L.starting) L.dropPre(); }, 20000); // el Estudio no contestó: visor propio
  }
  return L;
}
