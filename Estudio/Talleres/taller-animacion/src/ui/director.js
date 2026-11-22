// Motion Director: panel (secuencia, caminos, ajustes) e interacción en el visor
// (Alt+clic = destino, dibujar y editar caminos, control en camino con W/S).
import * as THREE from 'three';
import { h, put } from './dom.js';
import { newDirector, compileDirector, samplePath, nearestOnPath, rootPolyline, stepId, defaultWalk, defaultIdle, clipSpeed, sampleRoot, CHECKS, followStep, entryStep } from '../core/director.js';

const COL = { route: 0x3dffb0, path: 0x4aa8ff, sel: 0xffc23d, goto: 0xff7a45, start: 0xffffff, target: 0xff5fd2, zone: 0x9d8cff };
const R2D = 180 / Math.PI;
const fmt = (n, d = 2) => String(+(+n).toFixed(d));

export function mountDirector(app) {
  const D = { tool: null, selPath: null, selPoint: -1, selStep: null, selTarget: null, info: { end: 0, steps: [], length: 0 }, live: null, ground: null, ground3D: null, listeners: new Set() };
  const vp = app.viewport;
  const el = h('div', { class: 'md panel', id: 'pDirector' });
  const group = new THREE.Group();
  group.name = 'MotionDirector';
  vp.scene.add(group);
  let handles = [];

  // ---------- datos ----------
  const dir = () => app.engine.doc.director;
  const ensure = () => (app.engine.doc.director ||= newDirector());
  const origin = () => {
    const p = app.rig?.restWorldPos?.hips;
    return p ? [p.x, p.z] : [0, 0];
  };
  const toWorld = (p, y = 0.012) => {
    const o = origin();
    return new THREE.Vector3(p[0] + o[0], y, p[1] + o[1]);
  };
  const yawOf = (dx, dz) => {
    const v = new THREE.Vector3(dx, 0, dz).applyQuaternion(app.rig.FqInv);
    return Math.atan2(v.x, v.z);
  };

  // ---------- objetivos (Look At, Reach Target, Ir a, condiciones) ----------
  const r3 = (x) => +(+x).toFixed(3);
  const pieceOf = (t) => (t.ref ? app.stage.pieces.filter((p) => p.id === t.ref.id)[t.ref.n || 0] : null);
  /** Posición viva de un objetivo que sigue a algo (pieza del escenario, cámara) en el mundo; null si es un punto fijo. */
  D.targetWorld = (t, out = new THREE.Vector3()) => {
    if (t.kind === 'camera') return out.copy(vp.camera.position);
    if (t.kind === 'piece') {
      const piece = pieceOf(t);
      if (piece) return out.fromArray(t.off || [0, 0, 0]).applyQuaternion(piece.obj.quaternion).add(piece.obj.position);
    }
    return null;
  };
  /** Posición [x, y, z] del objetivo en coordenadas del plan; los que siguen a algo se ponen al día. */
  D.targetPos = (t) => {
    const w = D.targetWorld(t);
    if (w) {
      const o = origin();
      t.pos = [r3(w.x - o[0]), r3(w.y), r3(w.z - o[1])];
    }
    return t.pos;
  };
  /** ¿Hay una pieza del escenario ocupando ese sitio? (Check Placement) */
  D.occupied = (p, r) => {
    const o = origin();
    const box = new THREE.Box3();
    for (const piece of app.stage.pieces) {
      box.setFromObject(piece.obj).expandByScalar(r);
      if (p[0] + o[0] >= box.min.x && p[0] + o[0] <= box.max.x && p[2] + o[1] >= box.min.z && p[2] + o[1] <= box.max.z) return true;
    }
    return false;
  };
  const copts = () => ({ H: app.rig.hipsHeight, yawOf, targetPos: D.targetPos, occupied: D.occupied, route: app.sceneLive?.on ? app.sceneLive.route : null });
  D.targets = () => dir()?.targets || [];
  D.target = (id) => D.targets().find((t) => t.id === id || t.name === id) || null;
  D.addTarget = ({ name, pos = [0, 1, 1], kind = 'point', ...rest } = {}) => {
    const id = stepId().replace('md', 'tg');
    edit((d) => (d.targets ||= []).push({ id, name: name || `Objetivo ${d.targets.length + 1}`, kind, pos: pos.map(r3), ...rest }));
    D.selTarget = id;
    return id;
  };
  D.removeTarget = (id) => edit((d) => {
    d.targets = (d.targets || []).filter((t) => t.id !== id);
    // lo que apuntaba a él se queda sin objetivo (no se borra el paso)
    for (const s of d.steps) for (const k of ['target', 'a', 'b']) if (s[k] === id) delete s[k];
    d.aims = (d.aims || []).filter((a) => a.target !== id);
  });
  /** Objetivo sobre una pieza del escenario: la sigue si la mueves. Por defecto, el centro de su parte de arriba. */
  D.addPieceTarget = (piece, name) => {
    const box = new THREE.Box3().setFromObject(piece.obj);
    const c = box.getCenter(new THREE.Vector3());
    const off = new THREE.Vector3(c.x, box.max.y, c.z).sub(piece.obj.position).applyQuaternion(piece.obj.quaternion.clone().invert());
    const same = app.stage.pieces.filter((p) => p.id === piece.id);
    const o = origin();
    return D.addTarget({ name: name || piece.name || piece.id, kind: 'piece', ref: { id: piece.id, n: same.indexOf(piece) }, off: off.toArray().map(r3), pos: [c.x - o[0], box.max.y, c.z - o[1]], solid: true });
  };
  /** Pide un punto con un clic en el escenario (sobre una pieza, un objeto de la escena o el suelo). y: altura si cae en el suelo. */
  D.pickPoint = ({ y = null, hint = 'Haz clic en el escenario para colocar el objetivo. Esc cancela.' } = {}) => new Promise((resolve) => {
    if (D.picker) endPick(null);
    if (D.live) stopControl();
    D.picker = { y, resolve };
    D.tool = 'target';
    vp.renderer.domElement.style.cursor = 'crosshair';
    app.toast(hint);
    render();
  });
  const endPick = (value) => {
    const pk = D.picker;
    D.picker = null;
    if (D.tool === 'target') {
      D.tool = null;
      vp.renderer.domElement.style.cursor = '';
    }
    pk?.resolve(value);
    render();
  };
  D.on = (fn) => (D.listeners.add(fn), () => D.listeners.delete(fn));

  /** Recompila el plan a tiras + trayectoria. Con el plan vacío retira lo que el director había puesto. */
  D.compile = () => {
    const doc = app.engine.doc;
    const d = doc.director;
    if (!d || !app.rig) return D.info;
    // Clips de la biblioteca aún sin pistas: se compila ya y otra vez cuando lleguen (el avance sale de sus pistas).
    const lazy = app.docClipIds(doc).filter((id) => app.library.get(id)?.lazy && !app.library.get(id).failed);
    if (lazy.length) app.ensureClips(lazy).then(() => { if (app.engine.doc === doc) { D.compile(); app.evaluate(); app.timeline?.draw(); } });
    if (!d.steps.length) {
      if (doc.root || doc.strips.some((s) => s.md)) {
        doc.strips = doc.strips.filter((s) => !s.md);
        delete doc.root;
      }
      compileDirector(doc, app.library, copts()); // sin pasos: solo la mirada y el alcance puestos a mano
      D.info = { end: 0, steps: [], length: 0 };
      return D.info;
    }
    D.info = compileDirector(doc, app.library, copts());
    app.selStrip = null;
    return D.info;
  };

  /** Cambio del plan con deshacer: fn modifica doc.director. */
  const edit = (fn, { play = false, from = null } = {}) => {
    app.pushUndo();
    const d = ensure();
    const hadOwn = app.engine.doc.strips.some((s) => !s.md) && !d.steps.length;
    fn(d);
    D.compile();
    if (hadOwn && d.steps.length) app.toast('El Motion Director dirige ahora las tiras de la base (Ctrl+Z lo deshace)');
    app.changed();
    app.timeline.fit();
    if (play) D.play(from);
  };
  D.edit = edit;

  /** Reproduce una vez desde el paso indicado (o desde el principio) y se detiene al final. */
  D.play = (stepIdOrFrame = null) => {
    let f = 0;
    if (typeof stepIdOrFrame === 'number') f = stepIdOrFrame;
    else if (stepIdOrFrame) f = Math.max(0, D.info.steps.find((s) => s.id === stepIdOrFrame)?.f0 ?? 0);
    if (!app.playing) app.setFrame(f);
    app.playOnce = true;
    app.playing = true;
    app.playDir = 1;
    app.panels.refreshTransport();
  };

  // ---------- acciones de alto nivel (también las usa la IA) ----------
  D.addGoto = (x, z, opts = {}) => {
    const id = stepId();
    const wasEnd = D.info.end;
    edit((d) => d.steps.push({ id, type: 'goto', to: [+x, +z], ...opts }));
    if (opts.play !== false && !app.playing) D.play(wasEnd && dir().steps.length > 1 ? Math.max(0, wasEnd - 1) : 0);
    return id;
  };
  /** Transiciones reales de sentarse (biblioteca mocap): sentarse, bucle sentado y levantarse. Null si faltan. */
  D.sitClips = () => {
    const ids = [...app.library.keys()];
    const find = (...res) => {
      for (const re of res) {
        const id = ids.find((k) => re.test(k));
        if (id) return id;
      }
      return null;
    };
    const sitIn = find(/standupright_normal01_to_sit_normal01_front/i, /standed_to_sit_chair_01/i, /stand_to_sit/i);
    const loop = find(/sit_normal01_loop01/i, /idle_sit_chair/i, /sit_listen/i);
    const sitOut = find(/sit_normal01_to_standupright_normal01_front01/i, /sit_chair_to_standed/i, /sit_to_stand/i);
    return sitIn && loop ? { sitIn, loop, sitOut } : null; // sin «levantarse», la cadera sube con el fundido corto
  };
  /** Asientos con nombre: los de las piezas del Taller (la silla de prueba) y, en escena, los del escenario vivo. */
  D.seatPoints = async () => {
    const o = origin();
    const out = [];
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (const piece of app.stage?.pieces || []) piece.obj.traverse((ob) => {
      if (ob.userData?.ssPoint !== 'asiento') return;
      ob.getWorldPosition(p);
      ob.getWorldQuaternion(q);
      const fa = ob.userData.ssFacing || [0, 1];
      const f = new THREE.Vector3(fa[0], 0, fa[1]).applyQuaternion(q);
      out.push({ name: ob.name || piece.name || 'Asiento', pos: [p.x - o[0], 0, p.z - o[1]], yaw: Math.atan2(f.x, f.z), seat: ob.userData.ssSeat ?? 0.45 });
    });
    if (app.sceneLive?.on) out.push(...(await app.sceneLive.points()).filter((a) => a.kind === 'asiento'));
    const seen = new Map();
    return out.map((a) => {
      const n = (seen.get(a.name) || 0) + 1;
      seen.set(a.name, n);
      return { ...a, name: `${a.name} ${n}`, pos: a.pos.map(r3) };
    });
  };
  /** Cuánto retrocede la cadera el clip de sentarse (m, a la talla del personaje): se planta ese tramo por delante del asiento. */
  const sitBack = async (id) => {
    const c = id ? await app.ensureClip(id) : null;
    if (!c?.hips || c.frames < 2) return 0;
    const L = (c.frames - 1) * 3;
    return Math.hypot(c.hips[L] - c.hips[0], c.hips[L + 2] - c.hips[2]) * (app.rig?.hipsHeight || 1);
  };
  /** Ir a un asiento (lo crea como objetivo si hace falta) y sentarse en él, de cara hacia donde mira el asiento. */
  D.goSit = async (a, hold = 2) => {
    const m = D.sitClips();
    // de pie delante del asiento y de espaldas a él; al sentarse, la cadera queda sobre su centro
    const back = Math.max(0, (await sitBack(m?.sitIn)) - 0.03);
    const pos = [a.pos[0] + Math.sin(a.yaw) * back, a.pos[1], a.pos[2] + Math.cos(a.yaw) * back].map(r3);
    edit((d) => {
      let t = (d.targets ||= []).find((x) => x.kind === 'seat' && x.name === a.name);
      if (!t) d.targets.push((t = { id: stepId().replace('md', 'tg'), name: a.name, kind: 'seat', pos, seat: a.seat, face: a.yaw }));
      d.steps.push({ id: stepId(), type: 'goto', target: t.id, face: a.yaw });
      d.steps.push(m ? { id: stepId(), type: 'action', clip: m.loop, hold, seat: a.seat, sitIn: m.sitIn, ...(m.sitOut ? { sitOut: m.sitOut } : {}) } : { id: stepId(), type: 'action', clip: 'gen_sentado', hold, seat: a.seat });
    });
  };
  /** Paso «sentarse» a una altura de asiento: con mocap si la biblioteca lo tiene; si no, el sentado generado. */
  D.addSit = (seat = 0.45, hold = 1.5) => {
    const m = D.sitClips();
    return m ? D.addAction(m.loop, { hold, seat, sitIn: m.sitIn, sitOut: m.sitOut }) : D.addAction('gen_sentado', { hold, seat });
  };
  D.addAction = (clip, opts = {}) => {
    if (!app.library.has(clip)) throw new Error(`No existe el clip ${clip}`);
    const id = stepId();
    edit((d) => d.steps.push({ id, type: 'action', clip, ...opts }));
    return id;
  };
  D.addWait = (seconds = 1) => {
    const id = stepId();
    edit((d) => d.steps.push({ id, type: 'wait', seconds }));
    return id;
  };
  D.addTurn = (deg) => {
    const id = stepId();
    edit((d) => d.steps.push({ id, type: 'turn', yaw: (deg * Math.PI) / 180 }));
    return id;
  };
  D.addPath = (points, opts = {}) => {
    const id = stepId();
    edit((d) => d.paths.push({ id, name: opts.name || `Camino ${d.paths.length + 1}`, points: points.map((p) => [+p[0], +p[1]]), curve: opts.curve !== false, closed: !!opts.closed }));
    D.selPath = id;
    return id;
  };
  D.followPath = (pathId, opts = {}) => {
    const id = stepId();
    edit((d) => d.steps.push({ id, type: 'path', path: pathId, ...opts }));
    return id;
  };
  /** Añade un nodo de cualquier tipo (Motion Planning): look, reach, if, set, note… */
  D.addStep = (step) => {
    const id = step.id || stepId();
    edit((d) => d.steps.push({ ...step, id }));
    return id;
  };
  D.clear = () => {
    edit((d) => {
      d.steps = [];
    });
    D.selStep = null;
  };
  D.state = () => ({
    inicio: dir()?.start || { x: 0, z: 0, yaw: 0 },
    pasos: (dir()?.steps || []).map((s, i) => ({ ...s, etiqueta: stepLabel(s), fotogramas: D.info.steps[i]?.ran !== false && D.info.steps[i] ? [D.info.steps[i].f0, D.info.steps[i].f1] : null, ...(D.info.steps[i]?.result !== undefined ? { resultado: D.info.steps[i].result } : {}) })),
    orden: D.info.order || [], bucle_cortado: !!D.info.cut,
    objetivos: D.targets().map((t) => ({ id: t.id, nombre: t.name, tipo: t.kind || 'point', posicion: D.targetPos(t), ...(t.r ? { radio: t.r } : {}) })),
    mirada_y_alcance: app.engine.doc.aim || null, marcas: app.engine.doc.cues || [],
    caminos: (dir()?.paths || []).map((p) => ({ id: p.id, nombre: p.name, puntos: p.points, curva: p.curve !== false, cerrado: !!p.closed, metros: +samplePath(p.points, { curve: p.curve !== false, closed: p.closed }).total.toFixed(2) })),
    fin: D.info.end, metros: +(D.info.length || 0).toFixed(2), herramienta: D.tool,
  });

  // ---------- herramientas ----------
  D.setTool = (t) => {
    if (D.picker) endPick(null);
    if (D.live) stopControl();
    D.tool = D.tool === t ? null : t;
    if (D.tool === 'draw' && !dir()?.paths.find((p) => p.id === D.selPath)) D.selPath = null;
    vp.renderer.domElement.style.cursor = D.tool ? 'crosshair' : '';
    render();
  };

  /** Punto del suelo bajo el cursor, en coordenadas del plan. El modo escena puede sustituir el suelo (D.ground). */
  async function groundAt(e) {
    const rect = vp.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    vp.raycaster.setFromCamera(ndc, vp.camera);
    let p = null;
    if (D.ground) p = await D.ground(vp.raycaster.ray, e);
    else p = vp.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!p) return null;
    const o = origin();
    return [+(p.x - o[0]).toFixed(3), +(p.z - o[1]).toFixed(3)];
  }
  /** Punto 3D bajo el cursor: una pieza del escenario, la escena viva del Estudio o el suelo. Coordenadas del plan [x, y, z]. */
  async function pick3D(e) {
    const rect = vp.renderer.domElement.getBoundingClientRect();
    vp.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), vp.camera);
    let p = null;
    if (D.ground3D) p = await D.ground3D(vp.raycaster.ray, e);
    else p = vp.raycaster.intersectObject(app.stage.sceneryGroup, true)[0]?.point.clone() || vp.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!p) return null;
    const o = origin();
    return [r3(p.x - o[0]), r3(p.y), r3(p.z - o[1])];
  }
  const hitHandle = (e) => {
    if (!handles.length) return null;
    const rect = vp.renderer.domElement.getBoundingClientRect();
    vp.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), vp.camera);
    return vp.raycaster.intersectObjects(handles, false)[0]?.object.userData || null;
  };

  let drag = null;
  let press = null;
  const canvas = vp.renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    press = { x: e.clientX, y: e.clientY };
    const hit = hitHandle(e);
    if (!hit) return;
    // arrastrar un punto del camino, un destino o el inicio: la cámara no gira
    vp.orbit.enabled = false;
    drag = { hit, moved: false };
    canvas.setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  }, true);
  canvas.addEventListener('pointermove', async (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4) return;
    if (drag.hit.kind === 'target') {
      // un objetivo se arrastra a su misma altura; con Mayús sube y baja
      const t = D.target(drag.hit.id);
      if (!t) return;
      const rect = canvas.getBoundingClientRect();
      vp.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), vp.camera);
      const o = origin();
      const at = new THREE.Vector3(t.pos[0] + o[0], t.pos[1], t.pos[2] + o[1]);
      const n = e.shiftKey ? vp.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize().negate() : new THREE.Vector3(0, 1, 0);
      const hit = vp.raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, at), new THREE.Vector3());
      if (!hit) return;
      if (!drag.moved) {
        app.pushUndo();
        drag.moved = true;
        if (t.kind && t.kind !== 'point') {
          // al moverlo a mano deja de seguir a la pieza o a la cámara
          t.kind = 'point';
          delete t.ref;
          delete t.off;
        }
      }
      t.pos = e.shiftKey ? [t.pos[0], r3(Math.max(0, hit.y)), t.pos[2]] : [r3(hit.x - o[0]), t.pos[1], r3(hit.z - o[1])];
      D.compile();
      app.evaluate();
      drawScene();
      return;
    }
    const p = await groundAt(e);
    if (!p || !drag) return;
    if (!drag.moved) {
      app.pushUndo();
      drag.moved = true;
    }
    const d = ensure();
    const k = drag.hit;
    if (k.kind === 'pathPoint') d.paths.find((x) => x.id === k.path).points[k.index] = p;
    else if (k.kind === 'goto') d.steps.find((x) => x.id === k.step).to = p;
    else if (k.kind === 'start') Object.assign(d.start, { x: p[0], z: p[1] });
    D.compile();
    app.evaluate();
    drawScene();
  });
  const endDrag = (e) => {
    if (!drag) return false;
    const { hit, moved } = drag;
    drag = null;
    vp.orbit.enabled = true;
    canvas.releasePointerCapture?.(e.pointerId);
    if (moved) {
      app.changed();
      app.timeline.fit();
    } else if (hit.kind === 'pathPoint') {
      D.selPath = hit.path;
      D.selPoint = hit.index;
      render();
    } else if (hit.kind === 'goto') {
      D.selStep = hit.step;
      render();
    } else if (hit.kind === 'target') {
      D.selTarget = hit.id;
      render();
      drawScene();
      for (const fn of D.listeners) fn();
    }
    return true;
  };
  /** Llamado por el visor antes de elegir huesos: devuelve true si el clic era del director. */
  D.pointerUp = (e) => {
    if (endDrag(e)) return true;
    if ((e.button ?? 0) !== 0) return false;
    if (!press || Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4) return false;
    const tool = e.altKey ? 'waypoint' : D.tool;
    if (!tool || tool === 'control') return false;
    if (tool === 'target') {
      void (async () => {
        const p = await pick3D(e);
        if (!p) return app.toast('Haz clic sobre el escenario', true);
        if (p[1] < 0.03 && Number.isFinite(D.picker?.y)) p[1] = r3(D.picker.y);
        endPick(p);
      })();
      return true;
    }
    void (async () => {
      const p = await groundAt(e);
      if (!p) return app.toast('Haz clic sobre el suelo', true);
      if (tool === 'waypoint') D.addGoto(p[0], p[1]);
      else if (tool === 'start') {
        edit((d) => Object.assign(d.start, { x: p[0], z: p[1] }));
        D.setTool(null);
      } else if (tool === 'draw') {
        const path = dir()?.paths.find((x) => x.id === D.selPath);
        if (!path) D.addPath([p]);
        else edit(() => path.points.push(p));
        D.selPoint = dir().paths.find((x) => x.id === D.selPath).points.length - 1;
        render();
      }
    })();
    return true;
  };
  canvas.addEventListener('dblclick', (e) => {
    if (D.tool !== 'draw') return;
    e.stopPropagation();
    // el doble clic añade dos veces el último punto: se quita el repetido y se termina
    const path = dir()?.paths.find((x) => x.id === D.selPath);
    if (path && path.points.length > 2) {
      const a = path.points.at(-1);
      const b = path.points.at(-2);
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05) path.points.pop();
    }
    D.setTool(null);
    D.compile();
    app.changed();
  }, true);

  // ---------- control en camino (W/S en vivo) ----------
  const keys = new Set();
  function startControl(pathId) {
    const path = dir()?.paths.find((p) => p.id === pathId);
    if (!path || path.points.length < 2) return app.toast('El camino necesita al menos dos puntos', true);
    if (D.tool) D.setTool(null);
    app.pushUndo();
    app.playing = false;
    const d = ensure();
    const sp = samplePath(path.points, { curve: path.curve !== false, closed: path.closed });
    // empieza donde quedó el plan: el punto del camino más cercano
    const end = D.info.final || { x: d.start.x, z: d.start.z };
    const s0 = d.steps.length ? nearestOnPath(sp, end.x, end.z).s : 0;
    D.live = { path: pathId, sp, s: s0, step: null, speed: clipSpeed(app.library.get(defaultWalk(d, app.library)), app.rig.hipsHeight) * (d.speed || 1), t: performance.now() };
    D.tool = 'control';
    keys.clear();
    render();
    app.toast('Control en camino: mantén W o ↑ para avanzar, S o ↓ para volver. Esc termina.');
    requestAnimationFrame(tickControl);
  }
  function stopControl() {
    if (!D.live) return;
    D.live = null;
    D.tool = null;
    keys.clear();
    // las esperas de menos de un cuarto de segundo son ruido de soltar la tecla
    const d = dir();
    d.steps = d.steps.filter((s) => !(s.live && s.type === 'wait' && (s.seconds || 0) < 0.25));
    d.steps.forEach((s) => delete s.live);
    D.compile();
    app.changed();
    app.timeline.fit();
    render();
  }
  function tickControl(now) {
    const L = D.live;
    if (!L) return;
    const dt = Math.min(0.1, (now - L.t) / 1000);
    L.t = now;
    const d = dir();
    const fwd = keys.has('w') || keys.has('arrowup');
    const back = keys.has('s') || keys.has('arrowdown');
    const move = fwd === back ? 0 : fwd ? 1 : -1;
    const last = d.steps.at(-1);
    if (move) {
      const s1 = Math.max(0, Math.min(L.sp.total, L.s + move * L.speed * dt));
      if (s1 !== L.s) {
        if (last?.live && last.type === 'path' && Math.sign(last.to - last.from || move) === move) last.to = s1;
        else d.steps.push({ id: stepId(), type: 'path', path: L.path, from: L.s, to: s1, live: true });
        L.s = s1;
      }
    } else if (d.steps.length) {
      if (last?.live && last.type === 'wait') last.seconds += dt;
      else d.steps.push({ id: stepId(), type: 'wait', seconds: dt, live: true });
    }
    D.compile();
    app.engine.frame = Math.max(0, D.info.end - 1);
    app.evaluate();
    app.timeline.draw();
    drawScene();
    requestAnimationFrame(tickControl);
  }
  window.addEventListener('keydown', (e) => {
    if (e.target.matches?.('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    if (D.live) {
      if (k === 'escape' || k === 'enter') stopControl();
      else if (['w', 's', 'arrowup', 'arrowdown'].includes(k)) keys.add(k);
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (k === 'escape' && D.tool) {
      if (D.picker) endPick(null);
      else D.setTool(null);
      e.stopImmediatePropagation();
    } else if ((k === 'delete' || k === 'backspace') && D.selPoint >= 0 && dir()?.paths.find((p) => p.id === D.selPath)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      edit((d) => {
        const p = d.paths.find((x) => x.id === D.selPath);
        p.points.splice(D.selPoint, 1);
        if (!p.points.length) {
          d.paths = d.paths.filter((x) => x !== p);
          d.steps = d.steps.filter((s) => s.path !== p.id);
        }
      });
      D.selPoint = -1;
      render();
    } else if (k === 'enter' && D.tool === 'draw') {
      D.setTool(null);
      e.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()), true);

  // ---------- dibujo en el visor ----------
  const lineMat = (color, dashed = false) => {
    const m = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.08 }) : new THREE.LineBasicMaterial({ color });
    m.depthTest = false;
    m.transparent = true;
    return m;
  };
  function drawScene() {
    for (const o of [...group.children]) {
      o.geometry?.dispose();
      o.material?.dispose();
    }
    group.clear();
    handles = [];
    const d = dir();
    if (!d || !app.rig) return;
    const H = app.rig.hipsHeight / 0.95;
    const add = (obj, data) => {
      obj.renderOrder = 12;
      group.add(obj);
      if (data) {
        obj.userData = data;
        handles.push(obj);
      }
      return obj;
    };
    const line = (pts, color, dashed = false, y = 0.012) => {
      if (pts.length < 2) return;
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((p) => toWorld(p, y))), lineMat(color, dashed));
      if (dashed) l.computeLineDistances();
      add(l);
    };
    const flat = (geo, color, p, data, opacity = 0.95) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity, side: THREE.DoubleSide }));
      m.position.copy(toWorld(p, 0.014));
      return add(m, data);
    };
    // recorrido real (lo que hará el personaje)
    if (app.engine.doc.root) line(rootPolyline(app.engine.doc.root), COL.route, false, 0.016);
    // caminos y sus puntos
    for (const path of d.paths) {
      const sel = path.id === D.selPath;
      const sp = samplePath(path.points, { curve: path.curve !== false, closed: path.closed, step: 0.1 });
      line(sp.pts, sel ? COL.sel : COL.path, true);
      path.points.forEach((p, i) => {
        const on = sel && i === D.selPoint;
        flat(new THREE.SphereGeometry((on ? 0.075 : 0.055) * H, 14, 10), on ? COL.start : sel ? COL.sel : COL.path, p, { kind: 'pathPoint', path: path.id, index: i }).position.y = 0.05 * H;
      });
    }
    // destinos de los pasos «ir a»
    for (const s of d.steps) {
      if (s.type !== 'goto' || s.target || !Array.isArray(s.to)) continue;
      const ring = flat(new THREE.RingGeometry(0.07 * H, (s.id === D.selStep ? 0.13 : 0.1) * H, 28), s.id === D.selStep ? COL.start : COL.goto, s.to, { kind: 'goto', step: s.id });
      ring.rotation.x = -Math.PI / 2;
    }
    // objetivos: rombo a su altura, con su plomada; las zonas, con su círculo en el suelo
    const used = new Set([...(app.engine.doc.aim?.look || []), ...(app.engine.doc.aim?.handL || []), ...(app.engine.doc.aim?.handR || [])].map((a) => a.t));
    for (const t of d.targets || []) {
      const p = D.targetPos(t);
      if (t.kind === 'camera') continue; // está en el ojo de la cámara: no hay nada que dibujar
      const on = t.id === D.selTarget;
      const m = flat(new THREE.OctahedronGeometry((on ? 0.07 : 0.05) * H), on ? COL.start : t.r ? COL.zone : COL.target, [p[0], p[2]], { kind: 'target', id: t.id }, used.has(t.id) || on ? 0.95 : 0.6);
      m.position.y = Math.max(0.05 * H, p[1]);
      if (p[1] > 0.12) {
        const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([toWorld([p[0], p[2]], 0.012), toWorld([p[0], p[2]], p[1])]), lineMat(t.r ? COL.zone : COL.target, true));
        l.computeLineDistances();
        add(l);
      }
      if (t.r) {
        const ring = flat(new THREE.RingGeometry(Math.max(0.01, t.r - 0.025), t.r, 48), COL.zone, [p[0], p[2]], null, 0.55);
        ring.rotation.x = -Math.PI / 2;
      }
    }
    // inicio: flecha que indica hacia dónde mira
    if (d.steps.length || d.start.x || d.start.z || d.start.yaw) {
      const a = flat(new THREE.ConeGeometry(0.07 * H, 0.2 * H, 3), COL.start, [d.start.x, d.start.z], { kind: 'start' }, 0.8);
      const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.start.yaw).applyQuaternion(app.rig.Fq);
      a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), fwd.setY(0).normalize());
    }
  }

  // ---------- panel ----------
  const btn = (label, title, fn, cls = '') => h('button', { class: `btn sm ${cls}`, title, onclick: fn }, label);
  const num = (value, onChange, { step = 0.1, min = null, max = null, w = 58, title = '' } = {}) => {
    const i = h('input', { type: 'number', step, title, style: { width: `${w}px` } });
    if (min !== null) i.min = min;
    if (max !== null) i.max = max;
    i.value = value;
    i.onchange = () => Number.isFinite(+i.value) && onChange(+i.value);
    return i;
  };
  const clipName = (id) => app.library.get(id)?.name || id || '—';
  const tname = (id) => D.target(id)?.name || 'objetivo sin elegir';
  const HANDS = { R: 'Mano derecha', L: 'Mano izquierda', both: 'Las dos manos' };
  const NOTES = { dialog: 'Diálogo', emotion: 'Emoción', camera: 'Cámara' };
  const condLabel = (s) => {
    const c = s.check || 'distance';
    if (c === 'distance') return `¿${s.a ? tname(s.a) : 'Personaje'} a ${s.op === 'gt' ? 'más' : 'menos'} de ${fmt(s.value ?? 1, 2)} m de ${tname(s.b)}?`;
    if (c === 'position') return `¿Llegó a ${tname(s.b)}?`;
    if (c === 'placement') return `¿${tname(s.b)} está ocupado?`;
    if (c === 'zone') return `¿${s.exit ? 'Fuera' : 'Dentro'} de ${tname(s.b)}?`;
    return `¿${s.var || 'decisión'}?`;
  };
  const stepLabel = (s) => {
    if (s.label) return s.label;
    if (s.type === 'goto' && s.target) return `Ir a ${tname(s.target)}${s.stop ? ` · a ${fmt(s.stop, 2)} m` : ''}`;
    if (s.type === 'goto' && !Array.isArray(s.to)) return 'Ir a… (elige un objetivo)';
    if (s.type === 'look') return s.target ? `Mirar a ${tname(s.target)}` : 'Dejar de mirar';
    if (s.type === 'reach') return `${HANDS[s.hand || 'R']}: ${s.target ? `alcanzar ${tname(s.target)}` : 'soltar'}`;
    if (s.type === 'if') return condLabel(s);
    if (s.type === 'set') return `${s.var || 'decisión'} = ${s.value !== false ? 'sí' : 'no'}`;
    if (s.type === 'note') return `${NOTES[s.kind || 'dialog']}: ${s.text || '…'}`;
    if (s.type === 'turn' && s.target) return `Girar hacia ${tname(s.target)}`;
    if (s.type === 'goto') return `Ir a (${fmt(s.to[0], 1)}, ${fmt(s.to[1], 1)})`;
    if (s.type === 'path') {
      const p = dir().paths.find((x) => x.id === s.path);
      return `${Number.isFinite(s.from) && s.to < s.from ? 'Volver por' : 'Recorrer'} ${p?.name || 'camino borrado'}`;
    }
    if (s.type === 'action') return `${clipName(s.clip)}${(s.loops || 1) > 1 ? ` ×${s.loops}` : ''}${s.hold ? ` · mantener ${fmt(s.hold, 1)} s` : ''}${Number.isFinite(s.seat) ? ` · asiento ${fmt(s.seat)} m` : ''}`;
    if (s.type === 'wait') return `Esperar ${fmt(s.seconds || 0, 1)} s`;
    if (s.type === 'turn') return `Girar a ${Math.round((s.yaw || 0) * R2D)}°`;
    return s.type;
  };
  const ICON = { goto: '➜', path: '〰', action: '★', wait: '⏸', turn: '⟳', look: '◉', reach: '✋', if: '◇', set: '⚑', note: '❝' };

  /** Selector de objetivo. none: texto de la opción vacía. Incluye «＋ nuevo con un clic». */
  const targetSelect = (value, onChange, { none = '— elegir —', y = null, title = 'Objetivo' } = {}) => {
    const sel = h('select', { title, style: { maxWidth: '150px' } }, h('option', { value: '' }, none), D.targets().map((t) => h('option', { value: t.id }, t.name)), h('option', { value: '+' }, '＋ Nuevo con un clic…'));
    sel.value = value || '';
    sel.onchange = async () => {
      if (sel.value !== '+') return onChange(sel.value || null);
      sel.value = value || '';
      const p = await D.pickPoint({ y });
      if (p) onChange(D.addTarget({ pos: p }));
    };
    return sel;
  };
  const choose = (value, options, onChange, title = '') => {
    const sel = h('select', { title }, options.map(([v, l]) => h('option', { value: v }, l)));
    sel.value = value;
    sel.onchange = () => onChange(sel.value);
    return sel;
  };
  const text = (value, onChange, { w = 120, placeholder = '', title = '' } = {}) => {
    const i = h('input', { type: 'text', placeholder, title, style: { width: `${w}px` } });
    i.value = value || '';
    i.onchange = () => onChange(i.value.trim());
    return i;
  };
  /** A qué paso se sigue por una salida: el siguiente de la lista, terminar, o uno concreto. */
  const portSelect = (s, port, title) => {
    const sel = h('select', { title, style: { maxWidth: '150px' } }, h('option', { value: '' }, 'el siguiente de la lista'), h('option', { value: '-' }, '■ terminar aquí'), dir().steps.filter((x) => x !== s).map((x) => h('option', { value: x.id }, `${dir().steps.indexOf(x) + 1}. ${stepLabel(x)}`)));
    sel.value = s[port] === null ? '-' : s[port] || '';
    sel.onchange = () => edit(() => (sel.value === '' ? delete s[port] : (s[port] = sel.value === '-' ? null : sel.value)));
    return sel;
  };
  const headY = () => r3(app.rig?.restWorldPos?.head?.y ?? 1.5);
  const chestY = () => r3((app.rig?.restWorldPos?.upperChest || app.rig?.restWorldPos?.chest || app.rig?.restWorldPos?.hips)?.y ?? 1.1);

  function stepEditor(s) {
    const set = (k, v) => edit(() => (v === null || v === undefined ? delete s[k] : (s[k] = v)));
    const row = (...kids) => h('div', { class: 'row' }, ...kids);
    const lab = (label, ...kids) => h('label', {}, label, ...kids);
    if (s.type === 'look') {
      const part = (key, label) => {
        const c = h('input', { type: 'checkbox' });
        c.checked = s.parts?.[key] !== false;
        c.onchange = () => edit(() => (s.parts = { ...(s.parts || {}), [key]: c.checked }));
        return h('label', {}, c, label);
      };
      return h('div', { class: 'md-edit' },
        row(lab('Mira a', targetSelect(s.target, (v) => set('target', v), { none: '— deja de mirar —', y: headY() }))),
        row(part('eyes', ' Ojos'), part('head', ' Cabeza'), part('chest', ' Torso')),
        row(lab('Intensidad', num(Math.round((s.weight ?? 1) * 100), (v) => set('weight', Math.max(0, Math.min(1, v / 100))), { step: 10, min: 0, max: 100, w: 52 }), '%'), lab('Transición', num(s.blend ?? 0.45, (v) => set('blend', Math.max(0, v)), { step: 0.1, min: 0, w: 52 }), 's'), h('label', { title: 'Segundos que el plan espera aquí (0: sigue con lo siguiente mientras gira la cabeza)' }, 'Espera', num(s.hold || 0, (v) => set('hold', Math.max(0, v)), { step: 0.5, min: 0, w: 52 }), 's')));
    }
    if (s.type === 'reach') return h('div', { class: 'md-edit' },
      row(lab('Mano', choose(s.hand || 'R', [['R', 'Derecha'], ['L', 'Izquierda'], ['both', 'Las dos']], (v) => set('hand', v))), lab('Alcanza', targetSelect(s.target, (v) => set('target', v), { none: '— suelta —', y: chestY() }))),
      row(lab('Palma', choose(s.palm || '', [['', 'Libre'], ['down', 'Hacia abajo (apoyar)']], (v) => set('palm', v || null), 'Cómo se orienta la mano al llegar')), lab('Transición', num(s.blend ?? 0.5, (v) => set('blend', Math.max(0, v)), { step: 0.1, min: 0, w: 52 }), 's'), h('label', { title: 'Segundos que el plan espera aquí mientras la mano llega' }, 'Espera', num(s.hold ?? (s.target ? 0.7 : 0.4), (v) => set('hold', Math.max(0, v)), { step: 0.1, min: 0, w: 52 }), 's')));
    if (s.type === 'if') {
      const c = s.check || 'distance';
      const inf = D.info.steps[dir().steps.indexOf(s)];
      const zone = (id) => !!D.target(id)?.r;
      return h('div', { class: 'md-edit' },
        row(lab('Comprueba', choose(c, CHECKS, (v) => set('check', v)))),
        c === 'distance' ? row(lab('De', targetSelect(s.a, (v) => set('a', v), { none: 'el personaje' })), lab('a', targetSelect(s.b, (v) => set('b', v))), choose(s.op || 'lt', [['lt', 'menos de'], ['gt', 'más de']], (v) => set('op', v)), num(s.value ?? 1, (v) => set('value', Math.max(0, v)), { step: 0.1, min: 0, w: 52 }), 'm') : null,
        c === 'position' ? row(lab('Posición', targetSelect(s.b, (v) => set('b', v))), lab('Margen', num(s.value ?? 0.3, (v) => set('value', Math.max(0.01, v)), { step: 0.05, min: 0.01, w: 52 }), 'm')) : null,
        c === 'placement' ? row(lab('Sitio', targetSelect(s.b, (v) => set('b', v))), h('label', { title: 'Está ocupado si hay una pieza del escenario u otro objetivo sólido a menos de esta distancia' }, 'Radio', num(s.value ?? 0.4, (v) => set('value', Math.max(0.05, v)), { step: 0.05, min: 0.05, w: 52 }), 'm')) : null,
        c === 'zone' ? row(lab('Zona', targetSelect(s.b, (v) => set('b', v))), choose(s.exit ? '1' : '', [['', 'está dentro'], ['1', 'está fuera']], (v) => set('exit', v ? true : null)), s.b ? h('label', { title: 'Radio de la zona alrededor del objetivo' }, 'Radio', num(D.target(s.b)?.r || 1, (v) => edit(() => (D.target(s.b).r = Math.max(0.1, v))), { step: 0.25, min: 0.1, w: 52 }), 'm') : null) : null,
        c === 'bool' ? row(lab('Decisión', text(s.var, (v) => set('var', v || null), { placeholder: 'acepta_la_invitacion', title: 'Nombre de la decisión del estudiante o variable' })), (() => {
          const cb = h('input', { type: 'checkbox' });
          cb.checked = !!dir().vars?.[s.var];
          cb.disabled = !s.var;
          cb.onchange = () => edit((d) => ((d.vars ||= {})[s.var] = cb.checked));
          return h('label', { title: 'Valor con el que se prueba ahora: cámbialo para ver la otra rama' }, cb, ' vale sí');
        })()) : null,
        row(lab('Sí →', portSelect(s, 'yes', 'A dónde sigue si se cumple')), lab('No →', portSelect(s, 'no', 'A dónde sigue si no se cumple'))),
        inf?.ran ? h('div', { class: `md-res ${inf.result ? 'yes' : 'no'}` }, inf.result ? '✓ Ahora se cumple: sigue por «Sí»' : '✗ Ahora no se cumple: sigue por «No»') : null);
    }
    if (s.type === 'set') return h('div', { class: 'md-edit' }, row(lab('Decisión', text(s.var, (v) => set('var', v || null), { placeholder: 'nombre' })), lab('pasa a', choose(s.value === false ? '0' : '1', [['1', 'sí'], ['0', 'no']], (v) => set('value', v === '1')))));
    if (s.type === 'note') return h('div', { class: 'md-edit' },
      row(lab('Tipo', choose(s.kind || 'dialog', Object.entries(NOTES), (v) => set('kind', v))), lab('Quién', text(s.who, (v) => set('who', v || null), { w: 80, placeholder: 'personaje' })), lab('Dura', num(s.seconds || 0, (v) => set('seconds', Math.max(0, v)), { step: 0.5, min: 0, w: 52 }), 's')),
      row(text(s.text, (v) => set('text', v), { w: 280, placeholder: s.kind === 'emotion' ? 'alegría, sorpresa…' : s.kind === 'camera' ? 'primer plano, plano general…' : '¿Cómo te llamas?', title: 'El Estudio recibe esta marca con su tiempo' })));
    if (s.type === 'goto') return h('div', { class: 'md-edit' },
      row(lab('Hasta', targetSelect(s.target, (v) => edit(() => {
        if (v) s.target = v;
        else {
          // vuelve a ser un punto fijo: el sitio donde estaba el objetivo
          const p = D.target(s.target)?.pos;
          if (p && !Array.isArray(s.to)) s.to = [p[0], p[2]];
          delete s.target;
        }
      }), { none: 'un punto fijo', y: 0 })), s.target ? h('label', { title: 'Se detiene a esta distancia del objetivo y queda mirando hacia él (delante de una persona, junto a una mesa)' }, 'Se detiene a', num(s.stop || 0, (v) => set('stop', Math.max(0, v) || null), { step: 0.1, min: 0, w: 52 }), 'm') : null),
      row(!s.target && Array.isArray(s.to) ? [h('label', {}, 'X', num(s.to[0], (v) => edit(() => (s.to = [v, s.to[1]])))), h('label', {}, 'Z', num(s.to[1], (v) => edit(() => (s.to = [s.to[0], v]))))] : null, h('label', {}, 'Velocidad', num(s.speed || 1, (v) => set('speed', v), { step: 0.1, min: 0.2, max: 4, w: 52 }))),
      row(h('label', { title: 'Hacia dónde queda mirando al llegar (vacío: hacia donde venía andando)' }, 'Al llegar mira a', num(Number.isFinite(s.face) ? Math.round(s.face * R2D) : '', (v) => set('face', (v * Math.PI) / 180), { step: 15, w: 60 }), '°'), Number.isFinite(s.face) ? btn('×', 'Quitar', () => set('face', null)) : null));
    if (s.type === 'action') return h('div', { class: 'md-edit' },
      row(lab('Animación', (() => {
        // cualquier animación de la biblioteca, buscando por nombre
        const listId = 'mdClips';
        let dl = document.getElementById(listId);
        if (!dl) document.body.append((dl = h('datalist', { id: listId })));
        if (dl.childElementCount !== app.library.size) {
          dl.innerHTML = '';
          for (const c of app.library.values()) dl.append(h('option', { value: c.name }, c.pack || c.source || ''));
        }
        const i = h('input', { type: 'text', list: listId, title: 'Escribe para buscar en la biblioteca', style: { width: '190px' } });
        i.value = clipName(s.clip);
        i.onfocus = () => i.select();
        i.onchange = () => {
          const q = i.value.trim().toLowerCase();
          const all = [...app.library.values()];
          const c = all.find((x) => x.name.toLowerCase() === q) || all.find((x) => x.id.toLowerCase() === q) || all.find((x) => x.name.toLowerCase().includes(q));
          if (c) set('clip', c.id);
          else i.value = clipName(s.clip);
        };
        return i;
      })())),
      row(h('label', {}, 'Repeticiones', num(s.loops || 1, (v) => set('loops', Math.max(1, Math.round(v))), { step: 1, min: 1, w: 48 })), h('label', { title: 'Segundos que se queda en la última pose (sentado, agachado…)' }, 'Mantener', num(s.hold || 0, (v) => set('hold', Math.max(0, v)), { step: 0.5, min: 0, w: 52 }), 's'), h('label', {}, 'Velocidad', num(s.speed || 1, (v) => set('speed', Math.max(0.1, v)), { step: 0.1, min: 0.1, max: 4, w: 52 }))),
      row(h('label', { title: 'Altura del asiento en metros (una silla: 0,45). La cadera queda encima sea cual sea la talla del personaje. Vacío: como venga en la animación' }, 'Asiento a', num(Number.isFinite(s.seat) ? s.seat : '', (v) => set('seat', v), { step: 0.05, min: 0, w: 56 }), 'm'), Number.isFinite(s.seat) ? btn('×', 'Sin asiento', () => set('seat', null)) : null));
    if (s.type === 'wait') return h('div', { class: 'md-edit' }, row(h('label', {}, 'Segundos', num(s.seconds || 1, (v) => set('seconds', Math.max(0.1, v)), { step: 0.5, min: 0.1 }))));
    if (s.type === 'turn') return h('div', { class: 'md-edit' }, row(lab('Hacia', targetSelect(s.target, (v) => set('target', v), { none: 'un ángulo', y: 0 })), s.target ? null : h('label', {}, 'Mirar a', num(Math.round((s.yaw || 0) * R2D), (v) => set('yaw', (v * Math.PI) / 180), { step: 15 }), '°')));
    if (s.type === 'path') {
      const p = dir().paths.find((x) => x.id === s.path);
      const total = p ? samplePath(p.points, { curve: p.curve !== false, closed: p.closed }).total : 0;
      const pct = (v) => Math.round(((Number.isFinite(v) ? v : null) ?? 0) / (total || 1) * 100);
      return h('div', { class: 'md-edit' }, row(
        h('label', {}, 'Desde', num(pct(s.from ?? 0), (v) => set('from', (v / 100) * total), { step: 5, min: 0, max: 100, w: 52 }), '%'),
        h('label', {}, 'Hasta', num(pct(s.to ?? total), (v) => set('to', (v / 100) * total), { step: 5, min: 0, max: 100, w: 52 }), '%'),
        h('label', {}, 'Velocidad', num(s.speed || 1, (v) => set('speed', v), { step: 0.1, min: 0.2, max: 4, w: 52 }))));
    }
    return null;
  }

  function actionPicker() {
    const box = h('div', { class: 'md-pick' });
    const input = h('input', { class: 'search', placeholder: 'Buscar acción: jump, sit, saludar…', style: { margin: '0 0 4px', width: '100%' } });
    const list = h('div', { class: 'md-picklist' });
    const fill = () => {
      const q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      const found = [...app.library.values()].filter((c) => !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)).slice(0, 30);
      for (const c of found) list.append(h('button', { class: 'item', title: `${c.pack || c.source || ''} · ${c.duration.toFixed(1)} s`, onclick: () => (D.addAction(c.id), (D.picking = false), render()) }, c.name, h('small', {}, ` ${c.duration.toFixed(1)} s`)));
      if (!found.length) list.append(h('div', { class: 'muted small' }, 'Nada con ese nombre'));
    };
    input.oninput = fill;
    fill();
    setTimeout(() => input.focus(), 0);
    box.append(input, list);
    return box;
  }

  function render() {
    const d = dir() || newDirector();
    const lib = app.library;
    const seg = (id, label, title) => h('button', { class: `seg ${D.tool === id ? 'on' : ''}`, title, 'aria-pressed': String(D.tool === id), onclick: () => D.setTool(id) }, label);
    const hints = {
      waypoint: 'Haz clic en el suelo: el personaje va andando hasta allí. Cada clic añade otro destino.',
      draw: 'Haz clic en el suelo para ir poniendo puntos. Doble clic o Intro termina. Arrastra un punto para moverlo; Supr lo borra.',
      control: 'Mantén W o ↑ para avanzar por el camino, S o ↓ para volver. Suelta para detenerte. Esc termina.',
      start: 'Haz clic en el suelo donde empieza el personaje.',
    };
    el.innerHTML = '';
    el.append(
      h('h3', {}, 'Motion Director'),
      h('div', { class: 'segs' },
        seg('waypoint', '◎ Destinos', 'Destinos con clic (también Alt+clic en cualquier momento): el personaje anda hasta cada punto'),
        seg('draw', '✎ Dibujar camino', 'Dibuja un camino con puntos para que el personaje lo recorra'),
      ),
      h('div', { class: 'mhint' }, hints[D.tool] || 'Alt+clic en el suelo añade un destino. Añade después acciones (saltar, sentarse…) y se encadenan solas.'),
    );

    // Secuencia
    const seq = h('div', { class: 'md-list' });
    d.steps.forEach((s, i) => {
      const inf = D.info.steps[i];
      const on = s.id === D.selStep;
      seq.append(h('div', { class: `md-row ${on ? 'on' : ''} ${inf && inf.ran === false ? 'skip' : ''}`, title: inf && inf.ran === false ? 'El plan no pasa por este paso (lo salta una condición o un salto)' : '', onclick: () => ((D.selStep = on ? null : s.id), render(), drawScene(), D.listeners.forEach((fn) => fn())) },
        h('span', { class: 'md-n' }, `${i + 1}`), h('span', { class: 'md-ic' }, ICON[s.type] || '•'), h('span', { class: 'md-l' }, stepLabel(s)),
        h('span', { class: 'md-f' }, !inf ? '' : inf.ran === false ? '—' : s.type === 'if' ? (inf.result ? 'sí' : 'no') : `${inf.f0}–${inf.f1}`),
        btn('▶', 'Reproducir desde este paso', (e) => (e.stopPropagation(), (app.playing = false), D.play(s.id))),
        btn('↑', 'Antes', (e) => (e.stopPropagation(), i > 0 && edit((x) => x.steps.splice(i - 1, 0, x.steps.splice(i, 1)[0])))),
        btn('↓', 'Después', (e) => (e.stopPropagation(), i < d.steps.length - 1 && edit((x) => x.steps.splice(i + 1, 0, x.steps.splice(i, 1)[0])))),
        btn('✕', 'Quitar este paso', (e) => (e.stopPropagation(), edit((x) => x.steps.splice(i, 1)))),
      ));
      if (on) put(seq, stepEditor(s), s.type === 'if' ? null : h('div', { class: 'md-edit md-next' }, h('div', { class: 'row' }, h('label', { title: 'Motion Planning: a qué paso se sigue al terminar este' }, 'Después →', portSelect(s, 'next', 'A dónde sigue')))));
    });
    if (!d.steps.length) seq.append(h('div', { class: 'muted small', style: { padding: '6px 2px' } }, 'Sin pasos todavía. Empieza con un destino o una acción.'));
    const quick = [['gen_saltar', 'Saltar'], ['gen_sentado', 'Sentarse'], ['gen_saludar', 'Saludar']].filter(([id]) => lib.has(id));
    put(el,
      h('h3', {}, `Secuencia${D.info.end ? ` · ${(D.info.end / app.engine.fps).toFixed(1)} s · ${fmt(D.info.length || 0, 1)} m` : ''}`),
      seq,
      h('div', { class: 'row md-add' },
        btn('+ Destino', 'Añadir un destino con clic en el suelo', () => D.setTool('waypoint'), D.tool === 'waypoint' ? 'on' : ''),
        btn('+ Acción…', 'Elegir una animación de la biblioteca', () => ((D.picking = !D.picking), render()), D.picking ? 'on' : ''),
        ...quick.map(([id, label]) => btn(`+ ${label}`, `Añadir «${label}» al final`, () => (id === 'gen_sentado' ? D.addSit(0.45) : D.addAction(id)))),
        app.libSel && lib.has(app.libSel) ? btn(`+ ${lib.get(app.libSel).name}`, 'Añadir la animación elegida en la Biblioteca', () => D.addAction(app.libSel)) : null,
        D.seatList ? choose('', [['', D.seatList.length ? '— elige asiento —' : '(no hay asientos)'], ...D.seatList.map((a, i) => [String(i), a.name])], (v) => { if (v !== '') D.goSit(D.seatList[+v]).catch((e) => app.toast(e.message, true)); D.seatList = null; render(); }, 'Va hasta el asiento y se sienta en él')
          : btn('+ Sentarse en…', 'Ir a una silla o banco con nombre y sentarse (silla de prueba o asientos del escenario)', async () => { D.seatList = await D.seatPoints().catch(() => []); if (!D.seatList.length) app.toast('No hay asientos: añade «Mesa y silla» o abre el Taller en escena', true); render(); }),
        btn('+ Espera', 'Quedarse quieto un momento', () => D.addWait(1)),
        btn('+ Girar', 'Girar en el sitio', () => D.addTurn(Math.round(((D.info.final?.yaw || 0) * R2D + 90) / 15) * 15)),
        btn('◇ Motion Planning', 'Abrir el editor de nodos: condiciones, miradas, alcances y ramas', () => app.topmenu?.openMenu('plan')),
      ),
      D.info.cut ? h('div', { class: 'md-res no' }, 'El plan entra en un bucle sin fin: se ha cortado. Revisa los saltos «Después →».') : null,
    );
    if (D.picking) el.append(actionPicker());

    // Caminos
    const paths = h('div', { class: 'md-list' });
    for (const p of d.paths) {
      const on = p.id === D.selPath;
      const total = samplePath(p.points, { curve: p.curve !== false, closed: p.closed }).total;
      const chk = (label, key, def, title) => {
        const c = h('input', { type: 'checkbox' });
        c.checked = p[key] ?? def;
        c.onchange = () => edit(() => (p[key] = c.checked));
        return h('label', { title, onclick: (e) => e.stopPropagation() }, c, label);
      };
      paths.append(h('div', { class: `md-row ${on ? 'on' : ''}`, onclick: () => ((D.selPath = p.id), (D.selPoint = -1), render(), drawScene()) },
        h('span', { class: 'md-ic' }, '〰'), h('span', { class: 'md-l', title: 'Doble clic: cambiar el nombre', ondblclick: () => {
          const n = prompt('Nombre del camino', p.name);
          if (n) edit(() => (p.name = n));
        } }, p.name), h('span', { class: 'md-f' }, `${p.points.length} pts · ${fmt(total, 1)} m`),
        btn('Auto ▶', 'Auto en camino: lo recorre solo de principio a fin', (e) => (e.stopPropagation(), D.followPath(p.id), D.play(dir().steps.at(-1).id))),
        btn('🎮', 'Control en camino: tú lo llevas con W/S y queda grabado', (e) => (e.stopPropagation(), startControl(p.id)), D.live?.path === p.id ? 'on' : ''),
        btn('✎', 'Seguir añadiendo puntos a este camino', (e) => (e.stopPropagation(), (D.selPath = p.id), (D.tool = null), D.setTool('draw'))),
        btn('✕', 'Borrar el camino (y los pasos que lo recorren)', (e) => (e.stopPropagation(), edit((x) => {
          x.paths = x.paths.filter((y) => y !== p);
          x.steps = x.steps.filter((s) => s.path !== p.id);
        }))),
      ));
      if (on) paths.append(h('div', { class: 'md-edit' }, h('div', { class: 'row' }, chk(' Curva suave', 'curve', true, 'Pasa por los puntos con curvas; sin marcar, tramos rectos'), chk(' Cerrado', 'closed', false, 'Vuelve al primer punto (circuito)'),
        btn('⇄ Invertir', 'Recorrerlo en el otro sentido', () => edit(() => p.points.reverse())))));
    }
    if (!d.paths.length) paths.append(h('div', { class: 'muted small', style: { padding: '6px 2px' } }, 'Ningún camino. Pulsa «Dibujar camino» y marca puntos en el suelo.'));
    el.append(h('h3', {}, 'Caminos'), paths);

    // Ajustes
    const loco = [...lib.values()].filter((c) => c.loop && /walk|run|jog|sprint|sneak|crouch|caminar|correr|andar/i.test(`${c.name} ${c.id}`));
    const idle = [...lib.values()].filter((c) => c.loop && /idle|reposo|stand|breath|espera/i.test(`${c.name} ${c.id}`));
    const pick = (list, value, onChange, title) => {
      const s = h('select', { title, style: { maxWidth: '150px' } }, list.map((c) => h('option', { value: c.id }, `${c.name}${c.pack ? ` · ${c.pack}` : ''}`)));
      s.value = value || '';
      s.onchange = () => onChange(s.value);
      return s;
    };
    el.append(
      h('h3', {}, 'Ajustes'),
      h('div', { class: 'row' },
        h('label', {}, 'Andar', pick(loco, defaultWalk(d, lib), (v) => edit((x) => (x.walk = v)), 'Animación con la que se desplaza')),
        h('label', {}, 'Quieto', pick(idle, defaultIdle(d, lib), (v) => edit((x) => (x.idle = v)), 'Animación de las esperas y los giros')),
      ),
      h('div', { class: 'row' },
        h('label', { title: 'Multiplica la velocidad de todos los desplazamientos' }, 'Velocidad', num(d.speed || 1, (v) => edit((x) => (x.speed = Math.max(0.2, v))), { step: 0.1, min: 0.2, max: 4, w: 52 })),
        h('label', { title: 'Dónde empieza el personaje' }, 'Inicio', num(d.start.x, (v) => edit((x) => (x.start.x = v)), { w: 52, title: 'X' }), num(d.start.z, (v) => edit((x) => (x.start.z = v)), { w: 52, title: 'Z' }), num(Math.round(d.start.yaw * R2D), (v) => edit((x) => (x.start.yaw = (v * Math.PI) / 180)), { step: 15, w: 52, title: 'Hacia dónde mira (grados)' }), '°'),
        btn('⌖', 'Colocar el inicio con un clic en el suelo', () => D.setTool('start'), D.tool === 'start' ? 'on' : ''),
      ),
      h('div', { class: 'row' },
        btn('▶ Reproducir plan', 'Reproduce la secuencia entera una vez', () => ((app.playing = false), D.play(0)), 'acc'),
        btn('🎥 Seguir', 'La cámara acompaña al personaje', () => ((vp.opts.follow = !vp.opts.follow), app.panels.refreshTools(), render()), vp.opts.follow ? 'on' : ''),
        btn('Vaciar plan', 'Quita todos los pasos (los caminos se conservan)', () => D.clear()),
      ),
    );
  }

  /** Tras cualquier cambio del documento (también deshacer o abrir un proyecto). */
  D.sync = () => {
    const d = dir();
    if (d?.steps.length && app.rig) {
      // tiempos de cada paso: se recalculan sin tocar el documento si ya estaba compilado
      const copy = { ...app.engine.doc, strips: [], root: null };
      D.info = compileDirector(copy, app.library, copts());
    } else D.info = { end: 0, steps: [], length: 0 };
    if (D.selStep && !d?.steps.find((s) => s.id === D.selStep)) D.selStep = null;
    if (D.selTarget && !D.target(D.selTarget)) D.selTarget = null;
    render();
    drawScene();
    for (const fn of D.listeners) fn();
  };
  D.ui = { btn, num, choose, text, targetSelect, portSelect, headY, chestY };
  D.stepEditor = stepEditor;
  D.stepLabel = stepLabel;
  D.ICON = ICON;
  D.followStep = (s, port) => followStep(dir(), s, port);
  D.entry = () => (dir() ? entryStep(dir()) : null);
  D.el = el;
  D.render = render;
  D.drawScene = drawScene;
  D.redraw = () => drawScene();
  D.rootAt = (f) => sampleRoot(app.engine.doc.root, f);
  D.startControl = startControl;
  D.stopControl = stopControl;
  render();
  return D;
}
