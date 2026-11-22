// Look At (miradas automáticas) y Reach Target (la mano alcanza y sigue un objetivo): paneles del menú superior.
// Los dos trabajan sobre los objetivos del Motion Director (doc.director.targets) y dejan eventos en la línea de
// tiempo (doc.director.aims): «desde este fotograma mira a…», «desde este fotograma suelta». El Motion Planning
// añade los suyos con nodos; el motor (Engine.applyLook y el IK) los evalúa todos juntos desde doc.aim.
import * as THREE from 'three';
import { h, put } from './dom.js';
import { stepId } from '../core/director.js';

const CH = { look: 'Mirada', handR: 'Mano derecha', handL: 'Mano izquierda' };
const KIND = { point: 'punto', piece: 'pieza', camera: 'cámara', actor: 'personaje' };

export function mountAim(app) {
  const D = app.directorUI;
  const { btn, num, choose, targetSelect, headY, chestY } = D.ui;
  const A = {
    look: { target: null, w: 1, blend: 0.45, parts: { eyes: true, head: true, chest: true } },
    reach: { target: null, hand: 'R', palm: '', blend: 0.5 },
    lookEl: h('div', { class: 'md aim panel', id: 'pLook' }),
    reachEl: h('div', { class: 'md aim panel', id: 'pReach' }),
    actors: null,
  };
  const dir = () => app.engine.doc.director;
  const frame = () => Math.round(app.engine.frame);
  const fmt = (n, d = 2) => String(+(+n).toFixed(d));

  /** Pone un evento en la línea de tiempo: desde f, el canal apunta a target (null: lo suelta). Sustituye al que hubiera en ese fotograma. */
  A.set = (ch, target, opts = {}) => {
    const f = Math.max(0, Math.round(opts.f ?? frame()));
    D.edit((d) => {
      d.aims = (d.aims || []).filter((a) => !(a.ch === ch && a.f === f));
      d.aims.push({ id: stepId().replace('md', 'am'), ch, f, target: target || null, ...(opts.blend !== undefined ? { blend: opts.blend } : {}), ...(opts.w !== undefined && opts.w !== 1 ? { w: opts.w } : {}), ...(opts.palm ? { palm: opts.palm } : {}), ...(opts.parts ? { parts: opts.parts } : {}) });
      d.aims.sort((a, b) => a.f - b.f);
    });
  };
  A.remove = (id) => D.edit((d) => (d.aims = (d.aims || []).filter((a) => a.id !== id)));
  A.clear = (chs) => D.edit((d) => (d.aims = (d.aims || []).filter((a) => !chs.includes(a.ch))));

  // ---------- objetivos ----------
  async function newByClick(y) {
    const p = await D.pickPoint({ y });
    return p ? D.addTarget({ pos: p }) : null;
  }
  function targetsBox(defY, onNew) {
    const list = h('div', { class: 'md-list' });
    for (const t of D.targets()) {
      const on = t.id === D.selTarget;
      const p = D.targetPos(t);
      const setPos = (i, v) => D.edit(() => {
        // al escribir su posición deja de seguir a la pieza o a la cámara
        if (t.kind !== 'point') {
          t.kind = 'point';
          delete t.ref;
          delete t.off;
        }
        t.pos = t.pos.map((x, k) => (k === i ? v : x));
      });
      list.append(h('div', { class: `md-row ${on ? 'on' : ''}`, onclick: () => ((D.selTarget = on ? null : t.id), D.drawScene(), render()) },
        h('span', { class: `md-ic tg ${t.r ? 'zone' : ''}` }, '◆'), h('span', { class: 'md-l' }, t.name),
        h('span', { class: 'md-f' }, `${KIND[t.kind || 'point']}${t.r ? ` · zona ${fmt(t.r, 1)} m` : ''} · ${fmt(p[1], 2)} m`),
        btn('✕', 'Quitar este objetivo (lo que apuntaba a él se queda sin objetivo)', (e) => (e.stopPropagation(), D.removeTarget(t.id)))));
      if (on) {
        const name = h('input', { type: 'text', style: { width: '120px' }, title: 'Nombre' });
        name.value = t.name;
        name.onchange = () => name.value.trim() && D.edit(() => (t.name = name.value.trim()));
        const solid = h('input', { type: 'checkbox' });
        solid.checked = !!t.solid;
        solid.onchange = () => D.edit(() => (solid.checked ? (t.solid = true) : delete t.solid));
        list.append(h('div', { class: 'md-edit' },
          h('div', { class: 'row' }, name, h('label', {}, 'X', num(p[0], (v) => setPos(0, v), { w: 54 })), h('label', { title: 'Altura sobre el suelo' }, 'Alto', num(p[1], (v) => setPos(1, Math.max(0, v)), { w: 54, step: 0.05 })), h('label', {}, 'Z', num(p[2], (v) => setPos(2, v), { w: 54 }))),
          h('div', { class: 'row' },
            h('label', { title: 'Con radio, el objetivo es también una zona (Check Trigger Zone). 0: sin zona' }, 'Zona', num(t.r || 0, (v) => D.edit(() => (v > 0 ? (t.r = v) : delete t.r)), { step: 0.25, min: 0, w: 54 }), 'm'),
            h('label', { title: 'Sólido: ocupa su sitio (Check Placement lo cuenta como ocupado)' }, solid, ' Sólido'),
            btn('⌖ Recolocar', 'Colocarlo con un clic en el escenario', async () => {
              const q = await D.pickPoint({ y: p[1] });
              if (q) D.edit(() => Object.assign(t, { kind: 'point', pos: q, ref: undefined, off: undefined }));
            })),
          h('div', { class: 'muted small' }, 'En el visor: arrástralo para moverlo; con Mayús sube y baja.')));
      }
    }
    if (!D.targets().length) list.append(h('div', { class: 'muted small', style: { padding: '6px 2px' } }, 'Sin objetivos. Crea uno con un clic sobre el escenario, una pieza o la cámara.'));
    const pieces = app.stage.pieces;
    const add = h('div', { class: 'row md-add' },
      btn('⌖ Punto con clic', 'Haz clic en el escenario: sobre una mesa, una puerta o el suelo', async () => onNew(await newByClick(defY()))),
      btn('◎ Cámara', 'Un objetivo que sigue a la cámara: el personaje mira al espectador', () => onNew(D.target('Cámara')?.id || D.addTarget({ name: 'Cámara', kind: 'camera', pos: [0, 1.5, 3] }))),
      pieces.length ? choose('', [['', '▦ Pieza del escenario…'], ...pieces.map((p, i) => [String(i), p.name || p.id])], (v) => v !== '' && onNew(D.addPieceTarget(pieces[+v])), 'Un objetivo sobre una pieza: la sigue si la mueves') : null,
      app.sceneLive?.on ? btn('☺ Personajes de la escena', 'Los demás personajes de la escena del Estudio, como objetivos (su cabeza)', async () => {
        const items = await app.sceneLive.actors();
        if (!items.length) return app.toast('No hay más personajes en esta escena', true);
        let last = null;
        for (const a of items) last = D.target(a.name)?.id || D.addTarget({ name: a.name, kind: 'actor', ref: { id: a.id }, pos: a.pos, solid: true });
        onNew(last);
        app.toast(`${items.length} personaje(s) de la escena añadidos como objetivos`);
      }) : null);
    return [list, add];
  }

  /** Eventos de un canal: los puestos a mano (se pueden quitar) y los que pone el plan (se editan en su nodo). */
  function eventsBox(chs) {
    const list = h('div', { class: 'md-list' });
    const aim = app.engine.doc.aim || {};
    const rows = chs.flatMap((ch) => (aim[ch] || []).map((e) => ({ ch, e }))).sort((a, b) => a.e.f - b.e.f);
    const f = frame();
    for (const { ch, e } of rows) {
      const live = rows.filter((x) => x.ch === ch && x.e.f <= f).at(-1)?.e === e;
      list.append(h('div', { class: `md-row ${live ? 'on' : ''}`, title: 'Ir a ese fotograma', onclick: () => app.setFrame(e.f) },
        h('span', { class: 'md-n', style: { width: '26px' } }, e.f), h('span', { class: 'md-ic' }, e.t ? (ch === 'look' ? '◉' : '✋') : '○'),
        h('span', { class: 'md-l' }, `${chs.length > 1 ? `${CH[ch]}: ` : ''}${e.t ? D.target(e.t)?.name || 'objetivo borrado' : ch === 'look' ? 'deja de mirar' : 'suelta'}`),
        h('span', { class: 'md-f' }, e.step ? 'plan' : `${fmt(e.b / app.engine.fps, 2)} s`),
        e.aim ? btn('✕', 'Quitar', (ev) => (ev.stopPropagation(), A.remove(e.aim))) : btn('◇', 'Lo pone un nodo del Motion Planning: abrir', (ev) => (ev.stopPropagation(), (D.selStep = e.step), app.topmenu?.openMenu('plan'), app.plannerUI?.select(e.step)))));
    }
    if (!rows.length) list.append(h('div', { class: 'muted small', style: { padding: '6px 2px' } }, 'Nada todavía. Elige un objetivo y pulsa el botón de arriba en el fotograma donde debe empezar.'));
    return list;
  }

  function renderLook() {
    const S = A.look;
    if (S.target && !D.target(S.target)) S.target = null;
    const part = (key, label) => {
      const c = h('input', { type: 'checkbox' });
      c.checked = S.parts[key] !== false;
      c.onchange = () => ((S.parts = { ...S.parts, [key]: c.checked }), 0);
      return h('label', {}, c, label);
    };
    const eyes = app.engine.rig?.eyeBones;
    A.lookEl.innerHTML = '';
    put(A.lookEl,
      h('h3', {}, 'Look At · mirada automática'),
      h('div', { class: 'row' }, h('label', {}, 'Mira a', targetSelect(S.target, (v) => ((S.target = v), render()), { none: '— elige un objetivo —', y: headY() }))),
      h('div', { class: 'row' }, part('eyes', ' Ojos'), part('head', ' Cabeza'), part('chest', ' Torso'),
        h('label', {}, 'Intensidad', num(Math.round(S.w * 100), (v) => (S.w = Math.max(0, Math.min(1, v / 100))), { step: 10, min: 0, max: 100, w: 52 }), '%'),
        h('label', { title: 'Lo que tarda en girar hacia el objetivo: primero los ojos, luego la cabeza y al final el torso' }, 'Transición', num(S.blend, (v) => (S.blend = Math.max(0, v)), { step: 0.1, min: 0, w: 52 }), 's')),
      h('div', { class: 'row' },
        btn(`◉ Mirar desde aquí (f ${frame()})`, 'Desde este fotograma el personaje mira al objetivo y lo sigue si se mueve', () => (S.target ? A.set('look', S.target, { blend: S.blend, w: S.w, parts: Object.values(S.parts).every(Boolean) ? undefined : { ...S.parts } }) : app.toast('Elige primero a qué mira', true)), 'acc'),
        btn('○ Dejar de mirar aquí', 'Desde este fotograma vuelve a la animación', () => A.set('look', null, { blend: S.blend })),
        (dir()?.aims || []).some((a) => a.ch === 'look') ? btn('Quitar todo', 'Quita las miradas puestas a mano (las del plan siguen)', () => A.clear(['look'])) : null),
      eyes && !eyes.length ? h('div', { class: 'muted small' }, 'Este personaje no tiene huesos de ojo: la mirada la llevan la cabeza y el torso.') : null,
      h('h3', {}, 'En la línea de tiempo'), eventsBox(['look']),
      h('h3', {}, 'Objetivos'), ...targetsBox(headY, (id) => id && ((S.target = id), render())),
    );
  }

  function renderReach() {
    const S = A.reach;
    if (S.target && !D.target(S.target)) S.target = null;
    const chs = S.hand === 'both' ? ['handR', 'handL'] : [`hand${S.hand}`];
    const reachOn = h('input', { type: 'checkbox' });
    reachOn.checked = app.engine.doc.reach !== false;
    reachOn.onchange = () => {
      app.pushUndo();
      app.engine.doc.reach = reachOn.checked;
      app.changed();
    };
    const st = chs.map((c) => app.engine.ikState[c]).filter((x) => x && x.reachW > 0.5 && x.reach > 1.02);
    A.reachEl.innerHTML = '';
    put(A.reachEl,
      h('h3', {}, 'Reach Target · alcanzar objetos'),
      h('div', { class: 'row' }, h('label', {}, 'Mano', choose(S.hand, [['R', 'Derecha'], ['L', 'Izquierda'], ['both', 'Las dos']], (v) => ((S.hand = v), render()))),
        h('label', {}, 'Alcanza', targetSelect(S.target, (v) => ((S.target = v), render()), { none: '— elige un objetivo —', y: chestY() }))),
      h('div', { class: 'row' }, h('label', {}, 'Palma', choose(S.palm, [['', 'Libre'], ['down', 'Hacia abajo (apoyar)']], (v) => (S.palm = v), 'Cómo se orienta la mano al llegar')),
        h('label', {}, 'Transición', num(S.blend, (v) => (S.blend = Math.max(0, v)), { step: 0.1, min: 0, w: 52 }), 's'),
        h('label', { title: 'Si el brazo no llega, el hombro y la columna se inclinan lo justo' }, reachOn, ' El cuerpo acompaña')),
      h('div', { class: 'row' },
        btn(`✋ Alcanzar desde aquí (f ${frame()})`, 'Desde este fotograma la mano va al objetivo y lo sigue si se mueve', () => {
          if (!S.target) return app.toast('Elige primero qué alcanza', true);
          chs.forEach((c) => A.set(c, S.target, { blend: S.blend, palm: S.palm || undefined }));
        }, 'acc'),
        btn('○ Soltar aquí', 'Desde este fotograma la mano vuelve a la animación', () => chs.forEach((c) => A.set(c, null, { blend: S.blend }))),
        (dir()?.aims || []).some((a) => a.ch !== 'look') ? btn('Quitar todo', 'Quita los alcances puestos a mano (los del plan siguen)', () => A.clear(['handL', 'handR'])) : null),
      st.length ? h('div', { class: 'md-res no' }, 'En este fotograma el objetivo queda fuera del alcance del brazo: acerca al personaje (un «Ir a» que se detenga antes) o mueve el objetivo.') : null,
      h('h3', {}, 'En la línea de tiempo'), eventsBox(['handR', 'handL']),
      h('h3', {}, 'Objetivos'), ...targetsBox(chestY, (id) => id && ((S.target = id), render())),
    );
  }

  const visible = (el) => el.isConnected && el.offsetParent !== null;
  function render() {
    if (visible(A.lookEl)) renderLook();
    if (visible(A.reachEl)) renderReach();
  }
  A.render = render;
  D.on(render);

  // Objetivos vivos (una pieza que se arrastra, la cámara que orbita): la pose se pone al día sin reproducir.
  let sig = '';
  let lastFrame = -1;
  const _w = new THREE.Vector3();
  A.tick = () => {
    const d = dir();
    if (!d?.targets?.length || !app.engine.doc.aim) return;
    let s = '';
    for (const t of d.targets) if (t.kind === 'piece' || t.kind === 'camera') {
      const w = D.targetWorld(t, _w);
      if (w) s += `${w.x.toFixed(3)},${w.y.toFixed(3)},${w.z.toFixed(3)};`;
    }
    if (s !== sig) {
      const pieceMoved = sig && app.selection?.kind === 'piece';
      sig = s;
      if (!app.playing) app.engine.evaluate(app.engine.frame);
      if (pieceMoved) D.drawScene();
    }
    // el botón «desde aquí» enseña el fotograma actual
    const f = frame();
    if (f !== lastFrame && !app.playing && !A.lookEl.contains(document.activeElement) && !A.reachEl.contains(document.activeElement)) {
      lastFrame = f;
      render();
    }
  };
  // El motor pregunta dónde están los objetivos que siguen a algo.
  app.engine.resolveTarget = (t, out) => D.targetWorld(t, out);
  return A;
}
