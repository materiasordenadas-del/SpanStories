// Motion Director: destinos (waypoints), caminos y secuencia de acciones.
// El plan vive en doc.director (en metros, sobre el suelo, relativo al sitio de reposo del personaje) y se compila a:
//   · doc.strips  → tiras de la base (caminar en bucle, acciones, esperas), marcadas con md = id del paso
//   · doc.root    → trayectoria de la raíz por fotograma [x, z, giro], que el motor suma a la pose (Engine.applyRoot)
// No depende de three.js ni del DOM: se prueba con node --test.

const TAU = Math.PI * 2;
const r4 = (x) => +(+x).toFixed(4);
let _n = 1;
export const stepId = () => `md${Date.now().toString(36)}${(_n++).toString(36)}`;

export const DIRECTOR_DEFAULTS = { walkSpeed: 1.35, turnRate: 300, blend: 6, actionBlend: 8, turnFirst: 50 };

export function newDirector() {
  return { start: { x: 0, z: 0, yaw: 0 }, paths: [], steps: [], walk: null, idle: null, speed: 1, targets: [], vars: {}, aims: [] };
}

// ---------- Motion Planning: objetivos, condiciones y grafo ----------
// Un paso es también un nodo: `next` (o `yes` / `no` en una condición) dice a qué paso se sigue.
//   sin definir → el paso siguiente de la lista (una lista simple sigue funcionando igual)
//   null        → el plan termina ahí
// Los objetivos (doc.director.targets) son puntos con nombre en metros [x, y, z]: los usan Ir a, Mirar,
// Alcanzar y las condiciones. Las condiciones se resuelven al compilar, con la posición que tiene el personaje
// en ese momento del plan: el resultado es siempre una animación determinista.

export const CHECKS = [
  ['distance', 'Distancia'],
  ['position', 'Llegó a la posición'],
  ['placement', 'Posición ocupada'],
  ['zone', 'Dentro de la zona'],
  ['bool', 'Decisión / variable'],
];

/** Posición [x, y, z] de un objetivo (opts.targetPos permite que siga a una pieza, a la cámara o a otro actor). */
export function targetPoint(d, id, opts = null) {
  const t = (d?.targets || []).find((x) => x.id === id);
  if (!t) return null;
  const p = opts?.targetPos?.(t) || t.pos;
  return p ? [+p[0] || 0, +p[1] || 0, +p[2] || 0] : null;
}

/** Resuelve una condición con el estado del plan en ese momento: st = { x, z, vars }. */
export function checkCondition(step, st, d, opts = null) {
  const pt = (id) => (id ? targetPoint(d, id, opts) : [st.x, null, st.z]);
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const dist = (a, b) => (a[1] === null || b[1] === null ? flat(a, b) : Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  const me = [st.x, null, st.z];
  switch (step.check || 'distance') {
    case 'distance': {
      const a = pt(step.a);
      const b = pt(step.b);
      if (!a || !b) return false;
      const v = Number.isFinite(step.value) ? step.value : 1;
      return step.op === 'gt' ? dist(a, b) > v : dist(a, b) < v;
    }
    case 'position': {
      const b = pt(step.b);
      return !!b && flat(me, b) <= (Number.isFinite(step.value) ? step.value : 0.3);
    }
    case 'zone': {
      const t = (d.targets || []).find((x) => x.id === step.b);
      const b = pt(step.b);
      if (!t || !b) return false;
      const inside = flat(me, b) <= (t.r || step.value || 1);
      return step.exit ? !inside : inside;
    }
    case 'placement': {
      const b = pt(step.b);
      if (!b) return false;
      const r = Number.isFinite(step.value) ? step.value : 0.4;
      if ((d.targets || []).some((t) => t.id !== step.b && t.solid && flat(targetPoint(d, t.id, opts), b) < r)) return true;
      return !!opts?.occupied?.(b, r);
    }
    case 'bool':
      return !!st.vars[step.var];
    default:
      return false;
  }
}

/** Paso al que se sigue por una salida ('next', 'yes', 'no'). */
export function followStep(d, step, port = 'next') {
  const steps = d.steps || [];
  let v = step[port];
  if (v === undefined && port !== 'next') v = step.next;
  if (v === null) return null;
  if (v !== undefined) {
    const s = steps.find((x) => x.id === v);
    if (s) return s;
  }
  return steps[steps.indexOf(step) + 1] || null;
}
export const entryStep = (d) => (d.steps || []).find((s) => s.id === d.entry) || (d.steps || [])[0] || null;

/** Canal de mirada o alcance en el fotograma f: el evento vigente y el anterior (de dónde viene la transición). */
export function aimAt(events, f) {
  if (!events || !events.length) return null;
  let i = -1;
  for (let k = 0; k < events.length; k++) {
    if (events[k].f <= f) i = k;
    else break;
  }
  if (i < 0) return null;
  return { prev: i > 0 ? events[i - 1] : null, cur: events[i] };
}

/** Diferencia de ángulo más corta (−π, π]. */
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

// ---------- Caminos ----------
/**
 * Muestrea un camino como polilínea densa. curve: Catmull-Rom por los puntos; closed: vuelve al primero.
 * Devuelve { pts: [[x, z]…], len: [0, …] (distancia acumulada), total }.
 */
export function samplePath(points, { curve = true, closed = false, step = 0.05 } = {}) {
  const P = (points || []).map((p) => [+p[0], +p[1]]).filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6);
  const pts = [];
  if (P.length === 1) pts.push(P[0]);
  if (P.length >= 2) {
    const n = P.length;
    const segs = closed && n > 2 ? n : n - 1;
    const at = (i) => (closed && n > 2 ? P[((i % n) + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    for (let i = 0; i < segs; i++) {
      const p0 = at(i - 1);
      const p1 = at(i);
      const p2 = at(i + 1);
      const p3 = at(i + 2);
      const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const k = Math.max(1, Math.ceil(d / step));
      for (let j = 0; j < k; j++) {
        const u = j / k;
        if (!curve || n < 3) pts.push([p1[0] + (p2[0] - p1[0]) * u, p1[1] + (p2[1] - p1[1]) * u]);
        else {
          const u2 = u * u;
          const u3 = u2 * u;
          const c = (a, b, c2, d2) => 0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d2) * u2 + (-a + 3 * b - 3 * c2 + d2) * u3);
          pts.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
        }
      }
    }
    pts.push(closed && n > 2 ? P[0].slice() : P[n - 1].slice());
  }
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, len, total: len[len.length - 1] || 0 };
}

/** Punto y dirección del camino muestreado a la distancia s (se recorta a [0, total]). */
export function pointAt(sp, s) {
  const { pts, len, total } = sp;
  if (!pts.length) return { x: 0, z: 0, dx: 0, dz: 1 };
  if (pts.length === 1) return { x: pts[0][0], z: pts[0][1], dx: 0, dz: 1 };
  s = Math.max(0, Math.min(total, s));
  let lo = 0;
  let hi = len.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (len[mid] <= s) lo = mid;
    else hi = mid;
  }
  const d = len[hi] - len[lo] || 1;
  const u = (s - len[lo]) / d;
  const a = pts[lo];
  const b = pts[hi];
  const dx = (b[0] - a[0]) / d;
  const dz = (b[1] - a[1]) / d;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, dx, dz };
}

/** Distancia a lo largo del camino del punto más cercano a (x, z). */
export function nearestOnPath(sp, x, z) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < sp.pts.length; i++) {
    const d = Math.hypot(sp.pts[i][0] - x, sp.pts[i][1] - z);
    if (d < bd) {
      bd = d;
      best = sp.len[i];
    }
  }
  return { s: best, dist: bd };
}

/** Tramo [from, to] de un camino muestreado (to < from: hacia atrás). */
function subPath(sp, from, to) {
  const a = Math.max(0, Math.min(sp.total, from));
  const b = Math.max(0, Math.min(sp.total, to));
  const out = [];
  const first = pointAt(sp, a);
  out.push([first.x, first.z]);
  const dir = b >= a ? 1 : -1;
  for (let i = dir > 0 ? 0 : sp.pts.length - 1; i >= 0 && i < sp.pts.length; i += dir) {
    const s = sp.len[i];
    if (dir > 0 ? s > a + 1e-6 && s < b - 1e-6 : s < a - 1e-6 && s > b + 1e-6) out.push(sp.pts[i]);
  }
  const last = pointAt(sp, b);
  out.push([last.x, last.z]);
  return samplePath(out, { curve: false, step: 0.05 });
}

// ---------- Trayectoria de la raíz ----------
/** Estado de la raíz en el fotograma f: { x, z, yaw } (interpolado; antes y después se mantiene). */
export function sampleRoot(root, f, out = { x: 0, z: 0, yaw: 0, y: 0 }) {
  const v = root?.v;
  const n = v ? Math.floor(v.length / 3) : 0;
  if (!n) {
    out.x = out.z = out.yaw = out.y = 0;
    return out;
  }
  const t = Math.max(0, Math.min(n - 1, f));
  const i = Math.min(n - 1, Math.floor(t));
  const j = Math.min(n - 1, i + 1);
  const u = t - i;
  out.x = v[i * 3] + (v[j * 3] - v[i * 3]) * u;
  out.z = v[i * 3 + 1] + (v[j * 3 + 1] - v[i * 3 + 1]) * u;
  out.yaw = v[i * 3 + 2] + angleDiff(v[i * 3 + 2], v[j * 3 + 2]) * u;
  // altura (asientos): solo existe si algún paso la pide
  const ys = root.y;
  out.y = ys && ys.length ? (ys[Math.min(ys.length - 1, i)] || 0) + ((ys[Math.min(ys.length - 1, j)] || 0) - (ys[Math.min(ys.length - 1, i)] || 0)) * u : 0;
  return out;
}

/** Clip de caminar por defecto: el elegido, o el primero de la biblioteca que camina en bucle. */
export function defaultWalk(director, library) {
  if (director?.walk && library.has(director.walk)) return director.walk;
  if (library.has('gen_caminar')) return 'gen_caminar';
  for (const c of library.values()) if (c.loop && /walk|caminar/i.test(c.name)) return c.id;
  return null;
}
export function defaultIdle(director, library) {
  if (director?.idle && library.has(director.idle)) return director.idle;
  if (library.has('gen_reposo')) return 'gen_reposo';
  for (const c of library.values()) if (c.loop && /idle|reposo/i.test(c.name)) return c.id;
  return null;
}

/** Velocidad natural (m/s) de un clip de locomoción en un personaje con altura de cadera H. */
export function clipSpeed(clip, H = 1) {
  if (clip && clip.travel > 0.05 && clip.duration > 0) return (clip.travel * H) / clip.duration;
  return DIRECTOR_DEFAULTS.walkSpeed * (H / 0.95);
}

/**
 * Compila doc.director → doc.strips + doc.root (+ doc.aim: mirada y alcance; doc.cues: marcas narrativas).
 * Recorre el plan como un grafo desde su entrada. Devuelve { end, steps: [{ id, f0, f1, ran, result }] (en el
 * orden de la lista; ran = false si el plan no pasa por ese paso), length, order (ids en orden de ejecución) }.
 * opts: H (altura de cadera, m), yawOf(dx, dz) → giro canónico de una dirección del mundo,
 *       targetPos(t) → [x, y, z] y occupied([x, y, z], r) → bool (los pone la interfaz; sin ellos vale t.pos).
 */
export function compileDirector(doc, library, opts = {}) {
  const { H = 1, yawOf = (dx, dz) => Math.atan2(dx, dz) } = opts;
  const d = doc.director;
  if (!d) return { end: 0, steps: [], length: 0 };
  const fps = doc.fps || 30;
  const sec = (v, def) => Math.max(0, Math.round((Number.isFinite(v) ? v : def) * fps));
  // Eventos de mirada y alcance (canales look, handL, handR) y marcas narrativas
  const aim = { look: [], handL: [], handR: [] };
  const cues = [];
  const finishAim = () => {
    // Mirada y alcance puestos a mano en la línea de tiempo (paneles Look At y Reach Target)
    for (const a of d.aims || []) {
      const ch = aim[a.ch];
      if (ch) ch.push({ f: Math.max(0, Math.round(a.f || 0)), t: a.target || null, b: sec(a.blend, 0.45), w: a.w ?? 1, ...(a.palm ? { palm: a.palm } : {}), ...(a.parts ? { parts: a.parts } : {}), aim: a.id });
    }
    for (const ch of Object.values(aim)) ch.sort((p, q) => p.f - q.f);
    if (aim.look.length || aim.handL.length || aim.handR.length) doc.aim = aim;
    else delete doc.aim;
    if (cues.length) doc.cues = cues;
    else delete doc.cues;
  };
  // Sin pasos no hay plan que dirija las tiras: solo se compilan la mirada y el alcance puestos a mano.
  if (!(d.steps || []).length) {
    finishAim();
    return { end: 0, steps: [], length: 0, order: [] };
  }
  const walkId = defaultWalk(d, library);
  const idleId = defaultIdle(d, library);
  const turnStep = ((d.turnRate || DIRECTOR_DEFAULTS.turnRate) * Math.PI) / 180 / fps;
  const strips = [];
  const root = []; // por fotograma: [x, z, yaw]
  const corrections = []; // avance propio de una acción, que se funde con la tira siguiente
  const seats = []; // acciones sobre un asiento: la cadera sube o baja hasta su altura
  const info = [];
  const paths = new Map((d.paths || []).map((p) => [p.id, p]));
  let x = +d.start?.x || 0;
  let z = +d.start?.z || 0;
  let yaw = +d.start?.yaw || 0;
  let f = 0;
  let length = 0;

  const addStrip = (clipId, n, step, extra = {}) => {
    const clip = library.get(clipId);
    if (!clip || n <= 0) return null;
    const prev = strips[strips.length - 1];
    const blend = prev ? Math.min(extra.blend ?? DIRECTOR_DEFAULTS.blend, n) : 0;
    // misma animación seguida (dos tramos andando): se alarga la tira en vez de cortar el paso
    if (prev && prev.clipId === clipId && prev.loop && extra.loop && !extra.anchor && prev.speed === (extra.speed || 1)) {
      prev.len += n;
      return prev;
    }
    if (prev) prev.len += blend; // la anterior sigue debajo durante el fundido
    const s = { id: `${step.id}_${strips.length}`, clipId, start: f, len: n, blend, speed: extra.speed || 1, loop: !!extra.loop, inPlace: !!extra.inPlace, mirror: false, reverse: false, md: step.id };
    if (extra.anchor) s.anchor = true;
    strips.push(s);
    return s;
  };
  const hold = (n) => {
    for (let i = 0; i < n; i++) root.push([x, z, yaw]);
    f += n;
  };
  const turnTo = (target, step) => {
    const diff = angleDiff(yaw, target);
    const n = Math.ceil(Math.abs(diff) / turnStep);
    if (n < 1) return;
    addStrip(idleId || walkId, n, step, { loop: true, inPlace: true });
    const y0 = yaw;
    for (let i = 0; i < n; i++) root.push([x, z, y0 + (diff * i) / n]);
    yaw = y0 + diff;
    f += n;
  };
  /** Anda por una polilínea muestreada que empieza donde está el personaje. */
  const walk = (sp, step) => {
    if (sp.total < 0.02) return;
    const clip = library.get((step.clip && library.has(step.clip) && step.clip) || walkId);
    const speed = (step.metros ?? clipSpeed(clip, H)) * (step.speed || 1) * (d.speed || 1);
    const first = pointAt(sp, Math.min(0.15, sp.total));
    const want = yawOf(first.dx, first.dz);
    // de espaldas o de lado al destino: primero gira en el sitio, luego echa a andar
    if (Math.abs(angleDiff(yaw, want)) > (DIRECTOR_DEFAULTS.turnFirst * Math.PI) / 180) turnTo(want, step);
    const n = Math.max(2, Math.round((sp.total / Math.max(0.05, speed)) * fps));
    if (clip) addStrip(clip.id, n, step, { loop: true, inPlace: clip.travel > 0.05, speed: (step.speed || 1) * (d.speed || 1) });
    for (let i = 0; i < n; i++) {
      const p = pointAt(sp, (sp.total * i) / n);
      const t = yawOf(p.dx, p.dz);
      const dy = angleDiff(yaw, t);
      yaw += Math.max(-turnStep, Math.min(turnStep, dy));
      root.push([p.x, p.z, yaw]);
    }
    const end = pointAt(sp, sp.total);
    x = end.x;
    z = end.z;
    f += n;
    length += sp.total;
  };

  const vars = { ...(d.vars || {}) };
  const idle = (seconds, step) => {
    const n = Math.round((seconds || 0) * fps);
    if (n <= 0) return;
    addStrip((step.clip && library.has(step.clip) && step.clip) || seated?.loop || idleId, n, step, { loop: true, inPlace: true });
    hold(n);
    if (seated?.loop) seated.entry.f1 = f;
  };
  /** Clip ya cargado y con fotogramas (los de la biblioteca llegan después: se recompila entonces). */
  const ready = (id) => {
    const c = id && library.get(id);
    return c && !c.lazy && c.frames > 1 ? c : null;
  };
  /** Avance propio de un clip (un salto, un paso atrás hacia la silla): la raíz lo recoge y se funde con lo siguiente. */
  const travelOf = (clip, loops = 1) => {
    if (!clip.hips || !(clip.travel > 0.02)) return;
    const last = (clip.frames - 1) * 3;
    const cx = (clip.hips[last] - clip.hips[0]) * loops * H;
    const cz = (clip.hips[last + 2] - clip.hips[2]) * loops * H;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const wx = cx * c + cz * sn;
    const wz = -cx * sn + cz * c;
    x += wx;
    z += wz;
    corrections.push({ f, dx: -wx, dz: -wz });
  };
  // Sentado: el bucle sentado sigue en las esperas y, antes de moverse, se levanta con su clip (mocap) si lo hay.
  let seated = null;
  const standUp = (step) => {
    const st = seated;
    seated = null;
    const up = ready(st?.up);
    if (!up) return; // sin clip de levantarse: la cadera baja con el fundido corto de siempre
    st.entry.f1 = f;
    st.entry.rout = up.frames;
    addStrip(up.id, up.frames, step, { anchor: true, blend: DIRECTOR_DEFAULTS.actionBlend });
    hold(up.frames);
    travelOf(up);
  };
  const rec = new Map();
  const order = [];
  let cur = entryStep(d);
  let guard = 0;
  let cut = false;
  while (cur) {
    const step = cur;
    const r = rec.get(step.id) || { id: step.id, f0: f, f1: f, ran: true, visits: 0 };
    // un bucle que no avanza o que no acaba se corta: el plan siempre termina
    if (++guard > 400 || r.visits >= 24 || f > 36000) {
      cut = true;
      break;
    }
    r.visits++;
    rec.set(step.id, r);
    if (seated && ['goto', 'path', 'turn', 'action'].includes(step.type)) standUp(step);
    const f0 = f;
    let port = 'next';
    if (step.type === 'goto') {
      const tp = step.target ? targetPoint(d, step.target, opts) : null;
      let to = tp ? [tp[0], tp[2]] : Array.isArray(step.to) ? step.to : null;
      if (to) {
        const goal = to;
        const dd = Math.hypot(to[0] - x, to[1] - z);
        const stop = Math.max(0, +step.stop || 0);
        // se detiene a «stop» metros del objetivo (delante de una persona, junto a una mesa)
        if (stop > 0) to = dd > stop + 0.02 ? [x + ((to[0] - x) * (dd - stop)) / dd, z + ((to[1] - z) * (dd - stop)) / dd] : null;
        // en el escenario vivo, la ruta rodea los obstáculos; si no la hay (aún), en línea recta
        const via = to && step.straight !== true ? opts.route?.([x, z], to) : null;
        if (to) walk(samplePath(via && via.length > 2 ? [[x, z], ...via.slice(1, -1), to] : [[x, z], to], { curve: false }), step);
        if (Number.isFinite(step.face)) turnTo(step.face, step);
        else if (stop > 0 && step.faceTarget !== false && Math.hypot(goal[0] - x, goal[1] - z) > 0.02) turnTo(yawOf(goal[0] - x, goal[1] - z), step);
      }
    } else if (step.type === 'path') {
      const path = paths.get(step.path);
      if (path && path.points?.length >= 2) {
        const sp = samplePath(path.points, { curve: path.curve !== false, closed: !!path.closed });
        const from = Number.isFinite(step.from) ? step.from : 0;
        const to = Number.isFinite(step.to) ? step.to : sp.total;
        const a = pointAt(sp, from);
        // hasta el comienzo del tramo, en línea recta
        if (Math.hypot(a.x - x, a.z - z) > 0.05) walk(samplePath([[x, z], [a.x, a.z]], { curve: false }), step);
        walk(subPath(sp, from, to), step);
      }
    } else if (step.type === 'action') {
      const clip = library.get(step.clip);
      if (clip) {
        const speed = step.speed || 1;
        const loops = Math.max(1, step.loops || 1);
        const sitting = Number.isFinite(step.seat) && clip.hips;
        // Sentarse de verdad: clip de transición (mocap) y luego el bucle sentado durante «hold».
        const down = sitting ? ready(step.sitIn) : null;
        const s0 = f;
        if (down) {
          addStrip(down.id, down.frames, step, { anchor: true, blend: step.blend ?? DIRECTOR_DEFAULTS.actionBlend });
          hold(down.frames);
          travelOf(down);
        }
        const n = down
          ? Math.max(2, Math.round(Math.max(0.3, step.hold ?? 1.5) * fps))
          : Math.max(2, Math.round((clip.frames * loops) / speed)) + Math.max(0, Math.round((step.hold || 0) * fps));
        addStrip(clip.id, n, step, { loop: down ? true : loops > 1, anchor: true, speed, blend: step.blend ?? DIRECTOR_DEFAULTS.actionBlend });
        // Asiento a una altura dada (m): la cadera de la pose sentada queda encima, sea cual sea la talla del personaje.
        if (sitting) {
          const hf = down ? 0 : clip.frames - 1;
          const hipY = H * (1 + clip.hips[hf * 3 + 1]);
          const entry = { f0: s0, f1: f + n, off: step.seat + 0.1 * H - hipY, ...(down ? { rin: down.frames } : {}) };
          seats.push(entry);
          seated = { entry, up: step.sitOut, loop: down ? clip.id : null };
        }
        hold(n);
        if (!down) travelOf(clip, loops);
      }
    } else if (step.type === 'wait') {
      const n = Math.max(1, Math.round((step.seconds || 0) * fps) || step.frames || 1);
      addStrip((step.clip && library.has(step.clip) && step.clip) || seated?.loop || idleId, n, step, { loop: true, inPlace: true });
      hold(n);
      if (seated?.loop) seated.entry.f1 = f;
    } else if (step.type === 'turn') {
      const tp = step.target ? targetPoint(d, step.target, opts) : null;
      const target = tp ? yawOf(tp[0] - x, tp[2] - z) : Array.isArray(step.to) ? yawOf(step.to[0] - x, step.to[1] - z) : Number.isFinite(step.yaw) ? step.yaw : yaw;
      turnTo(target, step);
    } else if (step.type === 'look') {
      // Look At: desde aquí mira al objetivo (sin objetivo: deja de mirar). No detiene el plan salvo que se pida.
      aim.look.push({ f, t: step.target || null, b: sec(step.blend, 0.45), w: step.weight ?? 1, ...(step.parts ? { parts: step.parts } : {}), step: step.id });
      idle(step.hold, step);
    } else if (step.type === 'reach') {
      // Reach Target: la mano va al objetivo y lo sigue (sin objetivo: lo suelta).
      for (const S of step.hand === 'both' ? ['L', 'R'] : [step.hand === 'L' ? 'L' : 'R']) aim[`hand${S}`].push({ f, t: step.target || null, b: sec(step.blend, 0.5), w: step.weight ?? 1, ...(step.palm ? { palm: step.palm } : {}), step: step.id });
      idle(step.hold ?? (step.target ? 0.7 : 0.4), step);
    } else if (step.type === 'if') {
      r.result = checkCondition(step, { x, z, vars }, d, opts);
      port = r.result ? 'yes' : 'no';
    } else if (step.type === 'set') {
      if (step.var) vars[step.var] = step.value !== false;
    } else if (step.type === 'note') {
      // Nodos narrativos de SpanStories (diálogo, emoción, cámara): marcas con tiempo para el Estudio.
      cues.push({ f, kind: step.kind || 'dialog', text: step.text || '', ...(step.who ? { who: step.who } : {}), frames: Math.round((step.seconds || 0) * fps), step: step.id });
      idle(step.seconds, step);
    }
    r.f1 = Math.max(f0, f - 1);
    r.port = port;
    order.push(step.id);
    cur = followStep(d, step, port);
  }
  for (const step of d.steps || []) info.push(rec.get(step.id) || { id: step.id, f0: -1, f1: -1, ran: false, visits: 0 });
  root.push([x, z, yaw]);
  // El avance propio de una acción se cambia por el de la raíz a lo largo del fundido de la tira siguiente.
  for (const c of corrections) {
    const n = DIRECTOR_DEFAULTS.blend;
    for (let i = 0; i < n && c.f + i < root.length; i++) {
      const w = 1 - i / n;
      root[c.f + i] = [root[c.f + i][0] + c.dx * w, root[c.f + i][1] + c.dz * w, root[c.f + i][2]];
    }
  }
  doc.strips = strips;
  doc.root = { v: root.flatMap((p) => [r4(p[0]), r4(p[1]), r4(p[2])]) };
  if (seats.length) {
    const ys = new Array(root.length).fill(0);
    const n = DIRECTOR_DEFAULTS.actionBlend;
    for (const s of seats) {
      const rin = s.rin || n;
      const rout = s.rout || n;
      for (let i = s.f0; i < Math.min(root.length, s.f1 + rout); i++) ys[i] = r4(s.off * Math.min(1, (i - s.f0) / rin, i < s.f1 ? 1 : 1 - (i - s.f1) / rout));
    }
    // la última pose se mantiene: si el plan acaba sentado, sigue sentado
    if (seats.at(-1).f1 >= root.length - 1) ys[root.length - 1] = r4(seats.at(-1).off);
    doc.root.y = ys;
  }
  finishAim();
  doc.rangeMode = 'auto';
  return { end: f, steps: info, length, final: { x, z, yaw }, order, cut, vars };
}

/** Recorrido compilado como puntos [x, z] (para dibujarlo en el visor). */
export function rootPolyline(root, every = 2) {
  const v = root?.v || [];
  const out = [];
  for (let i = 0; i < v.length; i += 3 * every) out.push([v[i], v[i + 1]]);
  if (v.length >= 3) out.push([v[v.length - 3], v[v.length - 2]]);
  return out;
}
