// Menú superior: las herramientas del panel «Animar» como menús desplegables sobre el visor.
// Los paneles no se rehacen ni se quitan: se MUEVEN (el mismo nodo) de la columna derecha a un desplegable.
// «Ventana › Herramientas de animación» los devuelve a la columna cuando se prefiera.
import { h, $ } from './dom.js';
import { prefs, setPrefs } from '../io/storage.js';
import './topmenu.css';

// id del menú → nodo que hospeda (en el orden en que estaban en la columna)
const MENUS = [
  { id: 'mover', label: 'Editar movimiento', title: 'Editar capa de movimiento', node: '#pMotion', key: '1' },
  { id: 'transformar', label: 'Transformar', node: '#pTransform', key: '2' },
  { id: 'rig', label: 'Rig', node: '#spRig', sub: 'rig', key: '3' },
  { id: 'ajustar', label: 'Ajustar', node: '#spAjustar', sub: 'ajustar', key: '4' },
  { id: 'tira', label: 'Tira', node: '#spTira', sub: 'tira', key: '5' },
  { id: 'capas', label: 'Capas', node: '#pLayers', key: '6' },
  // Herramientas propias del menú (no vienen de la columna): cada una monta su panel en `el(app)`.
  { id: 'director', label: 'Motion Director', key: '7', own: true, el: (app) => app.directorUI?.el, onOpen: (app) => app.directorUI?.render() },
  { id: 'plan', label: 'Motion Planning', key: '8', own: true, wide: true, el: (app) => app.plannerUI?.el, onOpen: (app) => app.plannerUI?.opened() },
  { id: 'look', label: 'Look At', key: '9', own: true, el: (app) => app.aimUI?.lookEl, onOpen: (app) => app.aimUI?.render() },
  { id: 'reach', label: 'Reach Target', key: '0', own: true, el: (app) => app.aimUI?.reachEl, onOpen: (app) => app.aimUI?.render() },
  // Herramientas (add-on de Blender «Herramientas», MIT, reimplementado): IK/FK sin saltos, controles temporales,
  // horneado, trayectoria, intercalar, copiar/pegar matriz, desfase, compartir claves y retimer.
  { id: 'herramientas', label: 'Herramientas', key: 'q', own: true, el: (app) => app.toolsUI?.el, onOpen: (app) => app.toolsUI?.render() },
];

export function mountTopMenu(app) {
  const bar = $('#menubar');
  const saved = prefs('topmenu', { dock: 'top', pinned: {}, pos: {} });
  // bar: la barra está fija arriba y visible de entrada; solo se oculta si el usuario lo pide
  const T = { dock: saved.dock === 'side' ? 'side' : 'top', bar: saved.bar !== false, open: null, pinned: new Set(Object.keys(saved.pinned || {}).filter((k) => saved.pinned[k])), pos: saved.pos || {} };
  const pops = new Map();
  const buttons = new Map();
  const save = () => setPrefs('topmenu', { dock: T.dock, bar: T.bar, pinned: Object.fromEntries([...T.pinned].map((k) => [k, true])), pos: T.pos });

  // dónde estaba cada panel, para poder devolverlo exactamente allí
  const home = MENUS.filter((m) => !m.own).map((m) => {
    const node = $(m.node);
    return { m, node, parent: node.parentElement, next: node.nextSibling };
  });
  const animPane = $('#colRight [data-pane=animar]');
  const note = h('div', { class: 'docknote' },
    h('p', {}, 'Las herramientas de animación están en el ', h('b', {}, 'menú superior'), ': Editar movimiento, Transformar, Rig, Ajustar, Tira, Capas, Motion Director, Motion Planning, Look At, Reach Target y Herramientas.'),
    h('p', { class: 'muted small' }, 'Cada menú se despliega sobre el visor; con 📌 se queda abierto y se puede arrastrar. Teclas Alt+1…9, Alt+0 y Alt+Q.'),
    h('button', { class: 'btn sm', onclick: () => T.setDock('side') }, 'Volver a ponerlas en esta columna'));

  // ---------- desplegables ----------
  function pop(m) {
    if (pops.has(m.id)) return pops.get(m.id);
    const body = h('div', { class: 'mpop-body' });
    const pin = h('button', { class: 'mpop-b', title: 'Fijar: se queda abierto y se puede arrastrar por el título', onclick: () => T.pin(m.id) }, '📌');
    const head = h('div', { class: 'mpop-head' }, h('span', { class: 'mpop-t' }, m.title || m.label), pin, h('button', { class: 'mpop-b', title: 'Cerrar (Esc)', onclick: () => T.close(m.id) }, '✕'));
    const el = h('div', { class: `mpop hidden ${m.wide ? 'wide' : ''}`, 'data-menu': m.id, role: 'dialog', 'aria-label': m.label }, head, body);
    document.body.append(el);
    // arrastrar por el título (solo fijado: sin fijar va pegado a su botón)
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || !T.pinned.has(m.id)) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      const mv = (ev) => {
        const x = Math.max(0, Math.min(innerWidth - 80, ev.clientX - dx));
        const y = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy));
        Object.assign(el.style, { left: `${x}px`, top: `${y}px` });
        T.pos[m.id] = [x, y];
      };
      const up = () => {
        removeEventListener('pointermove', mv);
        removeEventListener('pointerup', up);
        save();
      };
      addEventListener('pointermove', mv);
      addEventListener('pointerup', up);
    });
    const p = { el, body, pin };
    pops.set(m.id, p);
    return p;
  }
  function place(id) {
    const p = pops.get(id);
    const b = buttons.get(id);
    if (!p || !b) return;
    const pinnedAt = T.pinned.has(id) && T.pos[id];
    const r = b.getBoundingClientRect();
    const w = p.el.offsetWidth || 340;
    const x = pinnedAt ? pinnedAt[0] : Math.max(6, Math.min(innerWidth - w - 6, r.left));
    const y = pinnedAt ? pinnedAt[1] : r.bottom + 4;
    Object.assign(p.el.style, { left: `${Math.max(0, Math.min(x, innerWidth - 80))}px`, top: `${Math.min(y, innerHeight - 60)}px`, maxHeight: `${Math.max(160, innerHeight - Math.min(y, innerHeight - 60) - 10)}px` });
  }
  const isOpen = (id) => pops.has(id) && !pops.get(id).el.classList.contains('hidden');
  function paint() {
    for (const [id, b] of buttons) {
      b.classList.toggle('on', isOpen(id));
      b.setAttribute('aria-expanded', String(isOpen(id)));
      pops.get(id)?.el.classList.toggle('pinned', T.pinned.has(id));
      pops.get(id)?.pin.classList.toggle('on', T.pinned.has(id));
    }
  }

  T.openMenu = (id) => {
    const m = MENUS.find((x) => x.id === id);
    if (!m) return;
    if (!T.bar) T.setBar(true); // pedir un menú (Alt+número, un botón) vuelve a enseñar la barra
    if (T.dock === 'side' && !m.own) {
      // en la columna: el menú lleva al panel
      $('#colRight').classList.remove('hidden');
      app.panels.layout?.();
      app.panels.openRight('animar');
      if (m.sub) app.panels.openAnimSub(m.sub);
      $(m.node).scrollIntoView({ block: 'nearest' });
      return;
    }
    // uno sin fijar a la vez: abrir otro cierra el anterior
    for (const other of pops.keys()) if (other !== id && !T.pinned.has(other)) pops.get(other).el.classList.add('hidden');
    const p = pop(m);
    p.el.classList.remove('hidden');
    place(id);
    m.onOpen?.(app);
    paint();
    // Con Biblioteca › Animales abierta, Editar movimiento y Rig piden el rig de verdad (jinete en Base o Rocinante en su editor).
    if ((id === 'mover' || id === 'rig') && app.animales?.visible) app.animales.pedirRig?.().then(() => app.panels.refreshRig?.());
  };
  T.isOpen = (id) => isOpen(id);
  T.close = (id) => {
    pops.get(id)?.el.classList.add('hidden');
    paint();
  };
  T.toggle = (id) => (isOpen(id) ? T.close(id) : T.openMenu(id));
  T.pin = (id) => {
    if (T.pinned.has(id)) {
      T.pinned.delete(id);
      delete T.pos[id];
    } else {
      T.pinned.add(id);
      const r = pops.get(id).el.getBoundingClientRect();
      T.pos[id] = [r.left, r.top];
    }
    save();
    place(id);
    paint();
  };

  // ---------- mover los paneles ----------
  T.setDock = (dock) => {
    T.dock = dock;
    if (dock === 'top') {
      for (const { m, node } of home) {
        pop(m).body.append(node);
        node.classList.remove('hidden');
      }
      animPane.classList.add('docked-top');
      if (!note.isConnected) animPane.prepend(note);
    } else {
      for (const { node, parent, next } of [...home].reverse()) parent.insertBefore(node, next && next.parentElement === parent ? next : null);
      note.remove();
      animPane.classList.remove('docked-top');
      for (const { m } of home) T.close(m.id);
      // la subpestaña que estaba elegida vuelve a mandar sobre Rig / Ajustar / Tira
      app.panels.openAnimSub($('#animTabs .on')?.dataset.sub || 'rig');
    }
    save();
    paint();
  };

  // ---------- mostrar u ocultar la barra ----------
  const showBar = h('button', { class: 'btn mb-show', title: 'Mostrar la barra de herramientas de animación (Alt+H)', onclick: () => T.setBar(true) }, '▾ Herramientas');
  $('#menuVentana').before(showBar);
  T.setBar = (on) => {
    T.bar = !!on;
    document.body.classList.toggle('nomenubar', !T.bar);
    // sin barra, los desplegables sin fijar no tienen de dónde colgar: se cierran (los fijados siguen)
    if (!T.bar) for (const id of pops.keys()) if (!T.pinned.has(id)) pops.get(id).el.classList.add('hidden');
    save();
    paint();
    app.panels.layout?.();
    app.viewport?.resize?.();
    dispatchEvent(new Event('resize'));
  };

  // ---------- barra ----------
  const side = (sel, label, title) => {
    const b = h('button', { class: 'mb-side', title, onclick: () => {
      $(sel).classList.toggle('hidden');
      app.panels.layout?.();
      paintSides();
    } }, label);
    b.dataset.target = sel;
    return b;
  };
  const sides = [side('#colLeft', '◧ Esquema', 'Mostrar u ocultar la columna izquierda (Esquema y Preparar)'), side('#timelineWrap', '▤ Tiempo', 'Mostrar u ocultar la línea de tiempo'), side('#colRight', 'Biblioteca ◨', 'Mostrar u ocultar la columna derecha (Biblioteca y Texto)')];
  function paintSides() {
    for (const b of sides) b.classList.toggle('on', !$(b.dataset.target).classList.contains('hidden'));
  }
  T.paintSides = paintSides;
  bar.append(sides[0], h('span', { class: 'mb-sep' }));
  for (const m of MENUS) {
    const b = h('button', { class: `mb-menu ${m.own ? 'own' : ''}`, 'aria-haspopup': 'dialog', 'aria-expanded': 'false', title: `${m.label} · Alt+${m.key}`, onclick: () => T.toggle(m.id) }, m.label, h('span', { class: 'mb-caret' }, '▾'));
    buttons.set(m.id, b);
    if (m.id === 'director') bar.append(h('span', { class: 'mb-sep' }));
    bar.append(b);
  }
  bar.append(h('span', { class: 'grow' }), sides[1], sides[2], h('span', { class: 'mb-sep' }), h('button', { class: 'mb-side', title: 'Ocultar esta barra (Alt+H). Vuelve con «▾ Herramientas», arriba a la derecha, o en Ventana', onclick: () => T.setBar(false) }, '▴'));

  // las herramientas propias viven siempre en su menú
  for (const m of MENUS.filter((x) => x.own)) {
    const node = m.el(app);
    if (node) pop(m).body.append(node);
  }

  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      const open = [...pops.keys()].filter((id) => isOpen(id) && !T.pinned.has(id));
      if (open.length && !app.directorUI?.tool) open.forEach(T.close);
      return;
    }
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key.toLowerCase() === 'h') {
      e.preventDefault();
      return T.setBar(!T.bar);
    }
    const m = MENUS.find((x) => x.key === e.key);
    if (m) {
      e.preventDefault();
      T.toggle(m.id);
    }
  });
  addEventListener('resize', () => [...pops.keys()].filter(isOpen).forEach(place));

  T.setDock(T.dock);
  document.body.classList.toggle('nomenubar', !T.bar);
  T.openIds = () => [...pops.keys()].filter(isOpen);
  // «Editar movimiento» y «Rig» arrancan siempre cerrados (aunque estén fijados 📌): solo se abren cuando el usuario los pide en su menú.
  const CERRADOS_AL_ARRANCAR = new Set(['mover', 'rig']);
  for (const id of T.pinned) if (!CERRADOS_AL_ARRANCAR.has(id) && MENUS.find((m) => m.id === id) && (T.dock === 'top' || MENUS.find((m) => m.id === id).own)) T.openMenu(id);
  paintSides();
  return T;
}
