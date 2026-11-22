// Motion Planning: director de comportamientos con nodos.
// Es otra vista del MISMO plan del Motion Director (doc.director.steps): cada paso es un nodo y sus salidas
// (`next`, o `yes` / `no` en una condición) son los cables. Lo que se edita aquí aparece en la secuencia del
// Motion Director y al revés. Se compila al mismo motor: tiras + trayectoria + mirada y alcance.
import { h, put } from './dom.js';
import { stepId } from '../core/director.js';

const NW = 172; // ancho de un nodo
const NH = 48;
const GX = 212; // rejilla de la colocación automática
const GY = 82;
const TYPES = {
  goto: ['Ir a', 'move'], path: ['Recorrer camino', 'move'], turn: ['Girar', 'move'], action: ['Acción', 'act'], wait: ['Esperar', 'idle'],
  look: ['Look At', 'aim'], reach: ['Reach Target', 'aim'], if: ['Condición', 'logic'], set: ['Decisión', 'logic'], note: ['Narrativa', 'story'],
};

export function mountPlanner(app) {
  const D = app.directorUI;
  const { btn } = D.ui;
  const P = { view: { x: 16, y: 12, k: 1 }, pos: new Map(), wire: null, run: null };
  const dir = () => app.engine.doc.director;
  const steps = () => dir()?.steps || [];
  const step = (id) => steps().find((s) => s.id === id) || null;
  const infoOf = (s) => D.info.steps[steps().indexOf(s)] || null;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'mp-wires');
  const nodesEl = h('div', { class: 'mp-nodes' });
  const world = h('div', { class: 'mp-world' }, svg, nodesEl);
  const canvas = h('div', { class: 'mp-canvas', tabindex: '0', 'aria-label': 'Lienzo de nodos del plan' }, world);
  const side = h('div', { class: 'mp-side md' });
  const bar = h('div', { class: 'mp-bar' });
  const el = h('div', { class: 'mp panel', id: 'pPlanner' }, bar, h('div', { class: 'mp-body' }, canvas, side));

  // ---------- colocación ----------
  /** Posición de cada nodo: la que le diste al arrastrarlo o, si no, una automática siguiendo los cables. */
  function layout() {
    const d = dir();
    P.pos = new Map();
    if (!d) return;
    const grid = new Map();
    const taken = new Set();
    const put = (s, col, row) => {
      const stack = [[s, col, row]];
      while (stack.length) {
        let [n, c, r] = stack.pop();
        if (!n || grid.has(n.id)) continue;
        while (taken.has(`${c},${r}`)) r++;
        taken.add(`${c},${r}`);
        grid.set(n.id, [c, r]);
        if (n.type === 'if') {
          stack.push([D.followStep(n, 'no'), c + 1, r + 1]);
          stack.push([D.followStep(n, 'yes'), c + 1, r]);
        } else stack.push([D.followStep(n, 'next'), c + 1, r]);
      }
    };
    put(D.entry(), 0, 0);
    // lo que el plan no alcanza queda debajo, a la vista
    for (const s of d.steps) if (!grid.has(s.id)) put(s, 0, Math.max(-1, ...[...grid.values()].map((g) => g[1])) + 1);
    for (const s of d.steps) {
      const g = grid.get(s.id);
      P.pos.set(s.id, Number.isFinite(s.gx) && Number.isFinite(s.gy) ? [s.gx, s.gy] : [g[0] * GX, g[1] * GY]);
    }
  }
  const outPort = (s, port) => {
    const p = P.pos.get(s.id);
    return [p[0] + NW, p[1] + (s.type === 'if' ? (port === 'yes' ? 16 : 36) : NH / 2)];
  };
  const inPort = (s) => {
    const p = P.pos.get(s.id);
    return [p[0], p[1] + NH / 2];
  };
  const curve = (a, b) => {
    const dx = Math.max(36, Math.abs(b[0] - a[0]) * 0.5) + (b[0] < a[0] ? 40 : 0);
    return `M${a[0]},${a[1]} C${a[0] + dx},${a[1]} ${b[0] - dx},${b[1]} ${b[0]},${b[1]}`;
  };
  const path = (d, cls) => {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    svg.append(p);
    return p;
  };

  // ---------- dibujo ----------
  function draw() {
    layout();
    const d = dir();
    svg.innerHTML = '';
    nodesEl.innerHTML = '';
    world.style.transform = `translate(${P.view.x}px, ${P.view.y}px) scale(${P.view.k})`;
    canvas.style.backgroundPosition = `${P.view.x}px ${P.view.y}px`;
    canvas.style.backgroundSize = `${24 * P.view.k}px ${24 * P.view.k}px`;
    if (!d || !d.steps.length) {
      nodesEl.append(h('div', { class: 'mp-empty' }, h('b', {}, 'Plan vacío'), h('p', {}, 'Añade nodos con los botones de arriba y se encadenan solos. Arrastra desde el punto de salida de un nodo hasta otro para cambiar el orden o crear una rama.'), h('p', { class: 'muted' }, 'Ejemplo: Ir a → Condición (¿cerca de la silla?) → Sí: Sentarse · No: Esperar')));
      return;
    }
    // cables por los que pasa el plan (para resaltarlos)
    const order = D.info.order || [];
    const ran = new Set();
    for (let i = 0; i + 1 < order.length; i++) ran.add(`${order[i]}>${order[i + 1]}`);
    const entry = D.entry();
    for (const s of d.steps) {
      for (const port of s.type === 'if' ? ['yes', 'no'] : ['next']) {
        const to = D.followStep(s, port);
        const a = outPort(s, port);
        const taken = to && ran.has(`${s.id}>${to.id}`) && (s.type !== 'if' || infoOf(s)?.port === port);
        if (to) path(curve(a, inPort(to)), `w ${port} ${taken ? 'ran' : ''} ${s[port] === undefined ? 'auto' : ''}`);
        else if (s[port] === null) path(`M${a[0]},${a[1]} h14 m0,-5 v10`, `w ${port} end`);
      }
    }
    for (const s of d.steps) {
      const [x, y] = P.pos.get(s.id);
      const inf = infoOf(s);
      const [, cls] = TYPES[s.type] || ['', 'idle'];
      const ports = s.type === 'if' ? [['yes', 'sí'], ['no', 'no']] : [['next', '']];
      const node = h('div', { class: `mp-node ${cls} ${s.id === D.selStep ? 'on' : ''} ${inf && inf.ran === false ? 'skip' : ''} ${s === entry ? 'entry' : ''} ${s.type === 'if' ? 'cond' : ''}`, 'data-id': s.id, style: { left: `${x}px`, top: `${y}px`, width: `${NW}px` }, title: inf && inf.ran === false ? 'El plan no pasa por este nodo' : '' },
        h('span', { class: 'mp-in' }),
        h('div', { class: 'mp-h' }, h('span', { class: 'mp-ic' }, D.ICON[s.type] || '•'), h('span', { class: 'mp-t' }, s === entry ? 'INICIO · ' : '', TYPES[s.type]?.[0] || s.type), h('span', { class: 'mp-f' }, !inf || inf.ran === false ? '—' : s.type === 'if' ? (inf.result ? '✓ sí' : '✗ no') : `${inf.f0}–${inf.f1}`)),
        h('div', { class: 'mp-l' }, D.stepLabel(s)),
        ports.map(([port, label]) => h('span', { class: `mp-out ${port} ${s[port] === null ? 'end' : ''}`, 'data-port': port, title: `Arrastra hasta otro nodo para conectar${label ? ` la salida «${label}»` : ''}. Suelta en el vacío: el plan termina aquí. Doble clic: vuelve al siguiente de la lista.` }, label)));
      nodesEl.append(node);
    }
    paintRun(true);
  }

  // ---------- inspector ----------
  function inspector() {
    const d = dir();
    const s = step(D.selStep);
    side.innerHTML = '';
    if (!s) {
      const vars = [...new Set([...Object.keys(d?.vars || {}), ...steps().filter((x) => (x.type === 'if' && (x.check || '') === 'bool') || x.type === 'set').map((x) => x.var).filter(Boolean)])];
      const cues = app.engine.doc.cues || [];
      put(side,
        h('h3', {}, 'Plan'),
        h('div', { class: 'muted small' }, steps().length ? `${steps().length} nodos · ${(D.info.end / app.engine.fps).toFixed(1)} s · ${(D.info.length || 0).toFixed(1)} m` : 'Sin nodos todavía.'),
        D.info.cut ? h('div', { class: 'md-res no' }, 'Bucle sin fin: el plan se ha cortado.') : null,
        vars.length ? [h('h3', {}, 'Decisiones'), h('div', { class: 'muted small' }, 'Cambia un valor para probar la otra rama.'), vars.map((v) => {
          const c = h('input', { type: 'checkbox' });
          c.checked = !!d.vars?.[v];
          c.onchange = () => D.edit((x) => ((x.vars ||= {})[v] = c.checked));
          return h('label', { class: 'mp-var' }, c, ` ${v}`);
        })] : null,
        cues.length ? [h('h3', {}, 'Marcas para el Estudio'), h('div', { class: 'md-list' }, cues.map((c) => h('div', { class: 'md-row', onclick: () => app.setFrame(c.f) }, h('span', { class: 'md-n', style: { width: '26px' } }, c.f), h('span', { class: 'md-l' }, `${c.who ? `${c.who}: ` : ''}${c.text || c.kind}`))))] : null,
        h('h3', {}, 'Cómo se usa'),
        h('div', { class: 'muted small mp-help' }, 'Clic en un nodo: sus ajustes. Arrastra un nodo para ordenarlo y el punto de salida para conectarlo. Rueda: acercar. Arrastra el fondo: mover. Supr: quitar el nodo elegido.'),
      );
      return;
    }
    const name = h('input', { type: 'text', placeholder: D.stepLabel({ ...s, label: undefined }), title: 'Nombre propio del nodo (vacío: se describe solo)', style: { width: '100%' } });
    name.value = s.label || '';
    name.onchange = () => D.edit(() => (name.value.trim() ? (s.label = name.value.trim()) : delete s.label));
    put(side,
      h('h3', {}, `${D.ICON[s.type] || ''} ${TYPES[s.type]?.[0] || s.type}`),
      name,
      D.stepEditor(s),
      s.type === 'if' ? null : h('div', { class: 'md-edit' }, h('div', { class: 'row' }, h('label', {}, 'Después →', D.ui.portSelect(s, 'next', 'A qué nodo se sigue')))),
      h('div', { class: 'row mp-actions' },
        btn('▶ Desde aquí', 'Reproduce el plan desde este nodo', () => ((app.playing = false), D.play(s.id))),
        s === D.entry() ? null : btn('⚑ Empezar aquí', 'El plan empieza en este nodo', () => D.edit((x) => (x.entry = s.id))),
        btn('⧉ Duplicar', 'Otro nodo igual, a continuación', () => P.add({ ...s, id: undefined, gx: undefined, gy: undefined, next: undefined, yes: undefined, no: undefined }, s)),
        btn('✕ Quitar', 'Quita el nodo (Supr)', () => P.remove(s.id))),
    );
  }

  // ---------- edición ----------
  /** Añade un nodo a continuación del elegido (o al final). En una condición entra por la salida «sí». */
  P.add = (def, after = step(D.selStep)) => {
    const id = stepId();
    D.edit((d) => {
      const n = { ...def, id };
      for (const k of Object.keys(n)) if (n[k] === undefined) delete n[k];
      const a = after && d.steps.find((x) => x.id === after.id);
      if (!a) return d.steps.push(n);
      const i = d.steps.indexOf(a);
      const port = a.type === 'if' ? 'yes' : 'next';
      const was = D.followStep(a, port);
      if (a.type === 'if' && a.no === undefined) a.no = was ? was.id : null; // la salida «no» sigue yendo a donde iba
      d.steps.splice(i + 1, 0, n);
      // en una lista simple basta el orden; solo se cablea si el nodo anterior ya tenía un salto propio
      if (a.type === 'if' || a[port] !== undefined) {
        n.next = was ? was.id : null;
        a[port] = id;
      }
      if (Number.isFinite(a.gx)) Object.assign(n, { gx: a.gx + GX, gy: a.gy });
    });
    P.select(id);
    return id;
  };
  P.remove = (id) => {
    D.edit((d) => {
      const s = d.steps.find((x) => x.id === id);
      if (!s) return;
      const to = D.followStep(s, s.type === 'if' ? 'yes' : 'next');
      // lo que llegaba a él pasa a lo que venía después
      for (const o of d.steps) for (const port of ['next', 'yes', 'no']) if (o[port] === id) o[port] = to ? to.id : null;
      if (d.entry === id) delete d.entry;
      d.steps.splice(d.steps.indexOf(s), 1);
    });
    D.selStep = null;
    P.render();
  };
  P.select = (id) => {
    D.selStep = id;
    D.render();
    D.drawScene();
    P.render();
    // el nodo elegido queda a la vista
    const p = P.pos.get(id);
    if (p && canvas.clientWidth) {
      const x = p[0] * P.view.k + P.view.x;
      const y = p[1] * P.view.k + P.view.y;
      if (x < 0 || x + NW * P.view.k > canvas.clientWidth) P.view.x += canvas.clientWidth / 2 - NW / 2 - x;
      if (y < 0 || y + NH * P.view.k > canvas.clientHeight) P.view.y += canvas.clientHeight / 2 - NH / 2 - y;
      draw();
    }
  };
  P.fit = () => {
    layout();
    const pts = [...P.pos.values()];
    if (!pts.length || !canvas.clientWidth) return;
    const x0 = Math.min(...pts.map((p) => p[0]));
    const y0 = Math.min(...pts.map((p) => p[1]));
    const w = Math.max(...pts.map((p) => p[0])) + NW - x0;
    const hh = Math.max(...pts.map((p) => p[1])) + NH - y0;
    P.view.k = Math.max(0.72, Math.min(1, (canvas.clientWidth - 32) / w, (canvas.clientHeight - 24) / hh));
    P.view.x = 16 - x0 * P.view.k;
    P.view.y = 12 - y0 * P.view.k;
    draw();
  };
  P.tidy = () => {
    D.edit((d) => d.steps.forEach((s) => (delete s.gx, delete s.gy)));
    P.fit();
  };

  // ---------- barra ----------
  function toolbar() {
    const lib = app.library;
    const add = (label, title, def, cls = '') => btn(label, title, () => P.add(typeof def === 'function' ? def() : def), cls);
    const clip = () => (app.libSel && lib.has(app.libSel) ? app.libSel : ['gen_saludar', 'gen_saltar'].find((id) => lib.has(id)) || [...lib.keys()][0]);
    bar.innerHTML = '';
    put(bar,
      h('span', { class: 'mp-g' }, 'Moverse'),
      add('➜ Ir a', 'Camina hasta un objetivo o un punto', { type: 'goto' }),
      add('⟳ Girar', 'Gira en el sitio hacia un objetivo o un ángulo', { type: 'turn', yaw: 0 }),
      h('span', { class: 'mp-g' }, 'Actuar'),
      add('★ Acción', 'Una animación de la biblioteca (la que tengas elegida allí)', () => ({ type: 'action', clip: clip() })),
      lib.has('gen_saltar') ? add('Saltar', 'Acción: saltar', { type: 'action', clip: 'gen_saltar' }) : null,
      lib.has('gen_sentado') ? add('Sentarse', 'Acción: sentarse en un asiento a 45 cm', (() => { const m = D.sitClips?.(); return m ? { type: 'action', clip: m.loop, hold: 1.5, seat: 0.45, sitIn: m.sitIn, sitOut: m.sitOut } : { type: 'action', clip: 'gen_sentado', hold: 1.5, seat: 0.45 }; })()) : null,
      add('⏸ Esperar', 'Se queda quieto un momento', { type: 'wait', seconds: 1 }),
      h('span', { class: 'mp-g' }, 'Objetivos'),
      add('◉ Mirar', 'Look At: desde aquí mira a un objetivo (ojos → cabeza → torso)', { type: 'look' }),
      add('✋ Alcanzar', 'Reach Target: la mano va a un objetivo y lo sigue', { type: 'reach', hand: 'R' }),
      h('span', { class: 'mp-g' }, 'Decidir'),
      add('◇ Condición', 'Comprueba distancia, posición, sitio ocupado, zona o una decisión, y elige la rama', { type: 'if', check: 'distance', op: 'lt', value: 1 }),
      add('⚑ Decisión', 'Fija una decisión (sí / no) que luego comprueba una condición', { type: 'set', var: 'decision', value: true }),
      h('span', { class: 'mp-g' }, 'Narrar'),
      add('❝ Diálogo', 'Marca de diálogo para el Estudio, con su duración', { type: 'note', kind: 'dialog', seconds: 2 }),
      add('Emoción', 'Marca de emoción para el Estudio', { type: 'note', kind: 'emotion' }),
      add('Cámara', 'Marca de cambio de cámara para el Estudio', { type: 'note', kind: 'camera' }),
      h('span', { class: 'grow' }),
      btn('▶ Probar', 'Reproduce el plan entero una vez', () => ((app.playing = false), D.play(0)), 'acc'),
      btn('⊞', 'Ordenar los nodos automáticamente', () => P.tidy()),
      btn('⤢', 'Encajar todo el plan en la vista', () => P.fit()),
    );
  }

  // ---------- interacción ----------
  const toWorld = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left - P.view.x) / P.view.k, (e.clientY - r.top - P.view.y) / P.view.k];
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    const out = e.target.closest?.('.mp-out');
    const node = e.target.closest?.('.mp-node');
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    let mv;
    let up;
    canvas.setPointerCapture?.(e.pointerId);
    if (out && node && e.button === 0) {
      // cable nuevo desde una salida
      const s = step(node.dataset.id);
      const port = out.dataset.port;
      const a = outPort(s, port);
      const temp = path(curve(a, a), `w ${port} temp`);
      mv = (ev) => temp.setAttribute('d', curve(a, toWorld(ev)));
      up = (ev) => {
        const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.mp-node');
        const inside = !!document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.mp-canvas');
        temp.remove();
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
        if (over && over.dataset.id !== s.id) D.edit(() => (s[port] = over.dataset.id));
        else if (!over && inside) D.edit(() => (s[port] = null));
      };
    } else if (node && e.button === 0) {
      const s = step(node.dataset.id);
      const p0 = P.pos.get(s.id).slice();
      mv = (ev) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        moved = true;
        const p = [Math.round((p0[0] + (ev.clientX - sx) / P.view.k) / 4) * 4, Math.round((p0[1] + (ev.clientY - sy) / P.view.k) / 4) * 4];
        P.pos.set(s.id, p);
        Object.assign(node.style, { left: `${p[0]}px`, top: `${p[1]}px` });
        redrawWires();
      };
      up = () => {
        if (moved) {
          const p = P.pos.get(s.id);
          D.edit(() => Object.assign(s, { gx: p[0], gy: p[1] }));
        } else P.select(s.id === D.selStep ? null : s.id);
      };
    } else {
      const v0 = { ...P.view };
      mv = (ev) => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        moved = true;
        P.view.x = v0.x + ev.clientX - sx;
        P.view.y = v0.y + ev.clientY - sy;
        world.style.transform = `translate(${P.view.x}px, ${P.view.y}px) scale(${P.view.k})`;
        canvas.style.backgroundPosition = `${P.view.x}px ${P.view.y}px`;
      };
      up = () => {
        if (!moved && D.selStep) P.select(null);
      };
    }
    const end = (ev) => {
      canvas.removeEventListener('pointermove', mv);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointercancel', end);
      canvas.releasePointerCapture?.(ev.pointerId);
      up(ev);
    };
    canvas.addEventListener('pointermove', mv);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  });
  function redrawWires() {
    svg.innerHTML = '';
    for (const s of steps()) for (const port of s.type === 'if' ? ['yes', 'no'] : ['next']) {
      const to = D.followStep(s, port);
      if (to) path(curve(outPort(s, port), inPort(to)), `w ${port}`);
    }
  }
  canvas.addEventListener('dblclick', (e) => {
    // con el puntero capturado el evento llega al lienzo: se mira qué hay debajo
    const at = document.elementFromPoint(e.clientX, e.clientY);
    const out = at?.closest?.('.mp-out');
    const node = at?.closest?.('.mp-node');
    if (!out || !node) return;
    const s = step(node.dataset.id);
    if (s && s[out.dataset.port] !== undefined) D.edit(() => delete s[out.dataset.port]);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const k = Math.max(0.35, Math.min(1.6, P.view.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    P.view.x = mx - ((mx - P.view.x) / P.view.k) * k;
    P.view.y = my - ((my - P.view.y) / P.view.k) * k;
    P.view.k = k;
    draw();
  }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && D.selStep) {
      e.preventDefault();
      e.stopPropagation();
      P.remove(D.selStep);
    }
  });

  /** Durante la reproducción se ilumina el nodo que se está ejecutando. */
  function paintRun(force = false) {
    const f = app.engine.frame;
    let cur = null;
    const info = D.info.steps;
    const list = steps();
    for (const id of D.info.order || []) {
      const i = list.findIndex((s) => s.id === id);
      const inf = info[i];
      if (inf && inf.ran && f >= inf.f0 - 0.5 && f <= inf.f1 + 0.5 && list[i].type !== 'if' && list[i].type !== 'set') cur = id;
    }
    if (cur === P.run && !force) return;
    P.run = cur;
    for (const n of nodesEl.children) n.classList?.toggle('run', n.dataset?.id === cur);
  }
  P.tick = () => {
    if (el.isConnected && el.offsetParent !== null) paintRun();
  };

  const visible = () => el.isConnected && el.offsetParent !== null;
  P.render = () => {
    if (!visible()) return;
    toolbar();
    draw();
    inspector();
  };
  P.opened = () => {
    P.render();
    if (!P.fitted && steps().length) {
      P.fitted = true;
      P.fit();
    }
  };
  P.el = el;
  D.on(() => P.render());
  return P;
}
