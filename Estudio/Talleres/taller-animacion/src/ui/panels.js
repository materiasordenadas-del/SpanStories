// Paneles: esquema, preparar (personaje, importar, proyectos, selector, máscara, conjunto, cámara),
// animar (transformar, rig, ajustar, tira, capas), biblioteca (animaciones, poses, personajes, objetos),
// barra de herramientas del visor, barra de la línea de tiempo y menús.
import * as THREE from 'three';
import { h, $, $$, setTabs, slug } from './dom.js';
import { CANON_BY_ID, GROUPS, IK_CHAINS, canonLabel, conventionLabel, CANON_IDS } from '../core/humanoid.js';
import { newLayer, uid, INTERPS } from '../core/animation.js';
import { easingEditor } from './easing.js';
import { buildMotionPanel } from './motionpanel.js';
import { horseChainLabel, horseControlPoints } from '../core/horse-editor.js';
import { buildExtraPanels } from './panels2.js';
import { pickFiles, setPrefs, prefs, db } from '../io/storage.js';
import { matchesAnimationProfile, animationProfileLabel, PROFILE_LABELS } from '../core/library-profile.js';
import { animationCategory, categoryLabel, CATEGORY_ORDER } from '../core/library-categories.js';

const D = 180 / Math.PI;
const ALL_PACKS = '__todas';
// Tarjetas de la biblioteca que se crean de una vez (luego llegan más al bajar).
const LIB_BATCH = 60;
const PACK_ORDER = ['Mixamo', 'UAL 1', 'UAL 2', 'Humane', 'Fútbol (mocap)', 'Esperas (100 Idle)', 'Conversación (mocap)', 'Conversación (Michael 8)', 'Vida diaria 1 (mocap)', 'Vida diaria 2 (mocap)', 'Limpieza (mocap)', 'Público y reacciones (mocap)', 'Ejercicio (mocap)', 'Supervivencia (505)', 'Iglesia (Church People)', 'Halloween (mocap)', 'Anime (Genesis 8)', 'Jinete (a caballo)', 'Generados', 'Kimodo guardadas', 'Kimodo', 'Tuyas'];
const PACK_INFO = {
  'Jinete (a caballo)': 'Horse Animset Pro (Malbers): el jinete montado, para el maniquí y cualquier personaje. En Biblioteca › Animales se emparejan con las del caballo',
  'Kimodo guardadas': 'Las de Kimodo que guardaste (biblioteca/kimodo/guardadas) · pestaña «Texto»',
  Kimodo: 'Borradores de Kimodo (biblioteca/kimodo): guarda las que te gusten con ★ en la pestaña «Texto»',
  Mixamo: 'Animaciones de Mixamo (biblioteca/mixamo): descárgalas desde aquí o suelta tus FBX',
  'UAL 1': 'Universal Animation Library 1 · Quaternius · CC0',
  'UAL 2': 'Universal Animation Library 2 · Quaternius · CC0',
  Humane: 'Humane Basics',
  'Fútbol (mocap)': 'Mocap Pack 05 Soccer (UE5)',
  'Esperas (100 Idle)': '100 Idle Animation Pack: de pie, apoyado, en barra/agarradera y sentado (teléfono, dormir) · esqueleto UE4',
  'Conversación (mocap)': 'Mocap Pack 03 Talking and Interacting (UE5): conversación, señalar, asentir, videollamada',
  'Conversación (Michael 8)': 'Conversations Animation Collection · Daz Genesis 8 Male: hablar, discutir, escuchar, indicaciones',
  'Vida diaria 1 (mocap)': 'Mocap Pack 01 Everyday Actions (UE5): puertas, ventanas, sofá, televisión',
  'Vida diaria 2 (mocap)': 'Mocap Pack 07 Everyday Actions 2 (UE5): despertar, ducha, desayuno, perro, coche, oficina',
  'Limpieza (mocap)': 'Mocap Pack 02 Cleaning (UE5): barrer, aspirar, cristales, polvo, platos',
  'Público y reacciones (mocap)': 'Mocap Pack 04 Crowd Reactions (UE5): aplaudir, animar, selfie, móvil',
  'Ejercicio (mocap)': 'Mocap Pack 06 Fitness and Workout (UE5): estiramientos, pesas, saltos',
  'Supervivencia (505)': '505 Survival Mocap (esqueleto UE4): caminar, agacharse, cocinar, fuego, leña, pescar, dormir… (versión en el sitio; las de desplazamiento solo cuando no hay otra)',
  'Iglesia (Church People)': 'Church People: escuchar de pie, sentado y de rodillas; predicar, coro, confesión (masculinas y femeninas)',
  'Halloween (mocap)': 'Mocap Pack 08 Halloween (UE5): zombis, monstruos, hechizos',
  'Anime (Genesis 8)': 'Anime Animations · BVH Daz Genesis 8 (masculinas y femeninas)',
  Generados: 'Hechos por código en esta app',
  Tuyas: 'Importadas, copias y las que guardes',
};

export function buildPanels(app) {
  const P = {};
  const state = { libPack: prefs('libPack', ALL_PACKS), libCat: null, libOpen: new Set(), libSearch: '', libView: prefs('libView', 'grid'), libProfile: prefs('libProfile', ''), libMotion: '', libDuration: '', libSort: 'name', olFilter: '', expanded: new Set() };

  // ---------- pestañas ----------
  $$('.tabs').forEach((tabs) => {
    const col = tabs.parentElement;
    tabs.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      setTabs(tabs, 'data-tab', b.dataset.tab, col, 'data-pane');
      if (b.dataset.tab === 'biblioteca') P.refreshLibrary();
    });
  });
  const subtabs = (id, onChange) => {
    const el = $(id);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sub]');
      if (!b) return;
      setTabs(el, 'data-sub', b.dataset.sub, el.parentElement, 'data-subpane');
      onChange?.(b.dataset.sub);
    });
    return (v) => setTabs(el, 'data-sub', v, el.parentElement, 'data-subpane');
  };
  const openSetup = subtabs('#setupTabs', () => P.refreshSetup());
  P.openAnimSub = subtabs('#animTabs', () => P.refreshDoc());
  const openLib = subtabs('#libTabs', () => P.refreshLibrary());

  const openLeft = (t) => setTabs($('[data-tabs=left]'), 'data-tab', t, $('#colLeft'), 'data-pane');
  const openRight = (t) => setTabs($('[data-tabs=right]'), 'data-tab', t, $('#colRight'), 'data-pane');
  $('#workspaces').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ws]');
    if (!b) return;
    $$('#workspaces button').forEach((x) => x.classList.toggle('on', x === b));
    const ws = b.dataset.ws;
    if (ws === 'preparar') {
      openLeft('preparar');
      openSetup('personaje');
      openRight('animar');
    } else if (ws === 'animar') {
      openLeft('esquema');
      openRight('animar');
    } else if (ws === 'explorar') {
      openLeft('preparar');
      openSetup('conjunto');
      openRight('biblioteca');
      openLib('animaciones');
    } else if (ws === 'escena') {
      openLeft('preparar');
      openSetup('camara');
      openRight('biblioteca');
      openLib('objetos');
    } else if (ws === 'lab') {
      openLeft('preparar');
      openSetup('lab');
      openRight('biblioteca');
      openLib('animaciones');
    }
    P.refreshSetup();
    P.refreshLibrary();
  });

  // columnas redimensionables
  $$('.gutter').forEach((g) => {
    g.addEventListener('pointerdown', (e) => {
      const side = g.dataset.gutter;
      const x0 = e.clientX;
      const w0 = side === 'left' ? $('#colLeft').offsetWidth : $('#colRight').offsetWidth;
      const mv = (ev) => {
        const w = Math.max(180, Math.min(560, w0 + (side === 'left' ? ev.clientX - x0 : x0 - ev.clientX)));
        document.documentElement.style.setProperty(side === 'left' ? '--leftW' : '--rightW', `${w}px`);
      };
      const up = () => {
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
    });
    g.addEventListener('dblclick', () => document.documentElement.style.removeProperty(g.dataset.gutter === 'left' ? '--leftW' : '--rightW'));
  });

  // ---------- menús ----------
  const menus = $$('.menu');
  menus.forEach((m) => m.querySelector('.btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = m.classList.contains('open');
    menus.forEach((x) => x.classList.remove('open'));
    if (!open) m.classList.add('open');
    if (m.id === 'menuDescargar') buildDownload();
    if (m.id === 'menuVentana') buildWindow();
    if (m.id === 'menuGuardar') buildSave();
  }));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.drop')) menus.forEach((x) => x.classList.remove('open'));
  });
  const item = (title, sub, fn) => h('button', { class: 'item', onclick: () => (menus.forEach((x) => x.classList.remove('open')), fn()) }, title, sub ? h('small', {}, sub) : null);
  // Todas las formas de guardar, a la vista en la cabecera (antes estaban repartidas en la columna izquierda oculta,
  // en el modo Maniquí y dentro de DESCARGAR).
  function buildSave() {
    const d = $('#dropGuardar');
    d.innerHTML = '';
    d.append(
      h('h4', {}, 'PROYECTO'),
      item('Guardar (Ctrl+S)', `Guarda «${app.projectName}» en este navegador`, () => app.saveProject()),
      item('Guardar como… (Ctrl+Shift+S)', 'Un proyecto nuevo con otro nombre', () => app.saveProject(true)),
      item('Proyectos guardados…', 'Abrir, recuperar el autoguardado o borrar', () => P.showProjects()),
      h('h4', {}, 'BIBLIOTECA › TUYAS'),
      item('✔ Corrección general', 'Reemplaza la animación de la biblioteca por la corregida, para todos (sin crear otra)', () => app.modes?.correctGeneral()),
      item('⧉ Hacer mi copia', 'Guarda lo que se ve en Tuyas y la abre para editar', () => app.makeMyCopy()),
    );
  }
  /** Abre la columna izquierda en Preparar › Proyectos. */
  P.showProjects = () => {
    $('#colLeft').classList.remove('hidden');
    $('[data-tabs="left"] [data-tab="preparar"]')?.click();
    $('#setupTabs [data-sub="proyectos"]')?.click();
    P.refreshProjects();
    layout();
  };
  function buildDownload() {
    const d = $('#dropDescargar');
    d.innerHTML = '';
    d.append(
      h('h4', {}, 'THREE.JS'),
      item('Paquete three.js (.zip)', 'GLB con todas las animaciones + cargador taller-three.js + reproductor.html', () => app.exportThree({ which: 'ambos', destino: 'zip' }).catch((e) => app.toast(e.message, true))),
      item('Paquete three.js en exportaciones/', 'Lo mismo, guardado en la carpeta del proyecto', () => app.exportThree({ which: 'ambos', destino: 'disco' }).catch((e) => app.toast(e.message, true))),
      h('h4', {}, 'LO QUE ESTÁ EN ESCENA'),
      item('FBX (con Blender)', 'Blender convierte el GLB a FBX en segundo plano', () => app.exportFBX({ which: 'actual' }).catch((e) => app.toast(e.message, true))),
      item('Animación en GLB (con personaje)', 'El rango que se reproduce, horneado sobre su propio esqueleto', () => app.downloadCurrent(true)),
      item('Animación en GLB (solo esqueleto)', 'Sin malla: para importarla sobre un personaje que ya tengas', () => app.downloadCurrent(false)),
      item('Personaje en reposo', 'Malla + esqueleto, sin animación (impórtalo primero en tu motor)', () => app.downloadRest()),
      item('Guardar en Tuyas', 'Tu copia de lo que se ve, en la biblioteca', () => app.makeMyCopy()),
      item('Clip de biblioteca (.json)', 'Formato propio, sirve para cualquier esqueleto', () => app.downloadClipJSON()),
      h('h4', {}, 'CONJUNTO'),
      item('Conjunto marcado (GLB, solo esqueleto)', 'Una toma por animación marcada', () => app.downloadSet(false)),
      item('Conjunto marcado (GLB, con personaje)', null, () => app.downloadSet(true)),
      h('h4', {}, 'PROYECTO'),
      item('Proyecto (.taller.json)', 'Tiras, capas y claves', () => app.downloadProject()),
    );
  }
  function buildWindow() {
    const d = $('#dropVentana');
    d.innerHTML = '';
    const tog = (label, sel, cls = 'hidden') => {
      const el = $(sel);
      const cb = h('input', { type: 'checkbox' });
      cb.checked = !el.classList.contains(cls);
      cb.onchange = () => {
        el.classList.toggle(cls, !cb.checked);
        layout();
      };
      return h('label', {}, cb, ' ', label);
    };
    d.append(h('h4', {}, 'PANELES'), tog('Columna izquierda', '#colLeft'), tog('Columna derecha', '#colRight'), tog('Línea de tiempo', '#timelineWrap'), tog('Transformar', '#pTransform'), tog('Capas', '#pLayers'),
      item('Mostrar todo', null, () => {
        ['#colLeft', '#colRight', '#timelineWrap', '#pTransform', '#pLayers'].forEach((s) => $(s).classList.remove('hidden'));
        layout();
      }),
      h('h4', {}, 'HERRAMIENTAS DE ANIMACIÓN'),
      (() => {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = app.topmenu?.bar !== false;
        cb.onchange = () => app.topmenu?.setBar(cb.checked);
        return h('label', { title: 'La barra fija con Editar movimiento, Transformar, Rig… Motion Planning, Look At y Reach Target (Alt+H)' }, cb, ' Barra superior de herramientas');
      })(),
      item(`${app.topmenu?.dock === 'top' ? '✓ ' : ''}En el menú superior`, 'Editar movimiento, Transformar, Rig, Ajustar, Tira y Capas como desplegables sobre el visor', () => app.topmenu?.setDock('top')),
      item(`${app.topmenu?.dock === 'side' ? '✓ ' : ''}En la columna derecha`, 'Como antes: dentro de la pestaña Animar', () => app.topmenu?.setDock('side')));
  }
  function layout() {
    const L = !$('#colLeft').classList.contains('hidden');
    const R = !$('#colRight').classList.contains('hidden');
    $('#work').style.gridTemplateColumns = `${L ? 'var(--leftW) 4px' : '0 0'} 1fr ${R ? '4px var(--rightW)' : '0 0'}`;
    document.body.style.gridTemplateRows = `44px var(--menuH, 0px) 1fr ${$('#timelineWrap').classList.contains('hidden') ? '0' : 'var(--tlH)'}`;
    app.topmenu?.paintSides?.();
  }
  P.layout = layout;
  layout(); // respeta las columnas que arrancan cerradas (clase hidden en index.html)

  // ---------- altura del panel inferior (línea de tiempo) ----------
  // Asa encima del panel: arrastrar cambia su altura; doble clic lo deja solo con los controles (y lo restaura).
  // Así el visor gana sitio cuando la ventana es pequeña. La altura se recuerda en este navegador.
  (() => {
    const wrap = $('#timelineWrap');
    if (!wrap) return;
    const KEY = 'taller.alturaLineaTiempo';
    const root = document.documentElement;
    const grip = h('div', { class: 'tl-grip', role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': 'Altura del panel de la línea de tiempo', title: 'Arrastra para cambiar la altura del panel · doble clic: solo los controles / restaurar' });
    wrap.prepend(grip);
    const minimo = () => Math.ceil($('#tbar')?.getBoundingClientRect().height || 34) + 8;
    const poner = (px, guardar = true) => {
      const v = Math.max(minimo(), Math.min(Math.round(innerHeight * 0.7), Math.round(px)));
      // Dentro del Estudio (escenario compartido) el panel ocupa lo que deja el panel inferior del Estudio:
      // se le pide al Estudio esa altura y el escenario crece o mengua (el Taller recibe el nuevo hueco).
      if (root.classList.contains('shared-stage') && app.studioLink?.post) { app.studioLink.post('SCENE', { op: 'dock', tl: v }); return; }
      root.style.setProperty('--tlH', v + 'px');
      if (guardar) try { localStorage.setItem(KEY, String(v)); } catch {}
    };
    try { const v = Number(localStorage.getItem(KEY)); if (v > 0) root.style.setProperty('--tlH', v + 'px'); } catch {}
    let antes = 230;
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      grip.classList.add('on');
      const y0 = e.clientY, h0 = wrap.getBoundingClientRect().height;
      const mover = (ev) => poner(h0 - (ev.clientY - y0));
      const soltar = () => { grip.classList.remove('on'); grip.removeEventListener('pointermove', mover); grip.removeEventListener('pointerup', soltar); grip.removeEventListener('pointercancel', soltar); };
      grip.addEventListener('pointermove', mover);
      grip.addEventListener('pointerup', soltar);
      grip.addEventListener('pointercancel', soltar);
    });
    grip.addEventListener('dblclick', () => {
      const ahora = wrap.getBoundingClientRect().height;
      if (ahora > minimo() + 4) { antes = ahora; poner(minimo()); }
      else poner(antes > minimo() + 4 ? antes : 230);
    });
  })();

  // ---------- barra del visor ----------
  const toolLabels = {
    '✥': 'Mover', '⟳': 'Rotar', '⤢': 'Escalar', '⇋ X': 'Espejo X',
    '⇄': 'Elegir lado opuesto', '⇣': 'Elegir hueso hijo', '⇡': 'Elegir hueso padre',
    '⬚': 'Seleccionar por caja · B', '⇊': 'Añadir huesos hijos', '⇆': 'Añadir ambos lados',
    '⧉': 'Copiar · Ctrl+C', '📋': 'Pegar · Ctrl+V', '📋⇋': 'Pegar reflejado · Ctrl+Mayús+V',
    '🌐': 'Pegar orientación global', '⏱': 'Copiar a lo largo del tiempo',
    '🦴': 'Huesos', '▦': 'Malla de alambre', '◐': 'Gris sin texturas', '◌': 'Rayos X',
    '◎': 'Controles del personaje', '👻': 'Poses anteriores y siguientes',
    '🎥': 'Seguir al personaje', '⌂': 'Centrar personaje · F',
    '⊞': 'Cuatro vistas · Ctrl+Alt+Q', '📷': 'Ver por la cámara de escena',
  };
  const toolMenu = (label, ...items) => h('details', { class: 'tool-menu', name: 'viewport-tools' },
    h('summary', {}, label), h('div', { class: 'tool-options', 'aria-label': label }, ...items));
  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('#vtools .tool-menu')) $$('#vtools .tool-menu[open]').forEach((menu) => { menu.open = false; });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    $$('#vtools .tool-menu[open]').forEach((menu) => { menu.open = false; menu.querySelector('summary').focus(); });
  });
  function buildTools() {
    const v = $('#vtools');
    v.innerHTML = '';
    const toggles = new Set(['⇋ X', '🦴', '▦', '◐', '◌', '◎', '👻', '🎥', '⊞', '📷']);
    const btn = (label, title, on, fn) => h('button', { title, class: on ? 'on' : '', 'aria-pressed': toggles.has(label) || ['✥', '⟳', '⤢'].includes(label) ? String(!!on) : null, onclick: (event) => {
      const menu = event.currentTarget.closest('details');
      if (menu) { menu.open = false; menu.querySelector('summary').focus(); }
      fn();
    } }, toolLabels[label] || label);
    const vp = app.viewport;
    // Con Biblioteca › Animales abierta, elegir una herramienta de edición pide el rig (jinete en Base o Rocinante en su editor).
    const tool = (t) => () => { app.setTool(t); if (app.animales?.visible) app.animales.pedirRig?.().then(() => P.refreshRig?.()); };
    v.append(
      h('div', { class: 'grp' },
        btn('🖐 Arrastrar', 'Arrastrar (A / T): tira de una parte del cuerpo y el resto la sigue con lógica. Mano o pie: el brazo o la pierna los siguen. Rodilla o codo: llevan el miembro entero. Cabeza o pecho: se dobla la columna. Cadera: mueve el cuerpo y los pies con candado se quedan', app.tool === 'ik', tool('ik')),
        btn('✥', 'Mover (W / G)', app.tool === 'move', tool('move')),
        btn('⟳', 'Rotar (E / R)', app.tool === 'rotate', tool('rotate')),
        btn('⤢', 'Escalar (S) — solo huesos libres', app.tool === 'scale', tool('scale')),
      ),
      h('div', { class: 'grp' },
        h('label', { class: 'tool-setting' }, 'Ejes', sel([['local', 'Local'], ['global', 'Global']], app.space, (x) => {
          app.space = x;
          app.attachGizmo();
        }, 'Ejes del gizmo')),
        h('label', { class: 'tool-setting' }, 'Giro', sel([['0', 'Libre'], ['5', 'Pasos de 5°'], ['15', 'Pasos de 15°']], String(app.snap), (x) => {
          app.snap = +x;
          app.attachGizmo();
        }, 'Ajuste de giro')),
        h('label', { class: 'tool-setting', title: 'Tamaño del gizmo en pantalla (+ / −). Rotar ya usa aros grandes que rodean la articulación.' }, 'Gizmo',
          h('input', { type: 'range', min: 0.5, max: 3, step: 0.05, value: vp.gizmoScale, style: { width: '64px' }, oninput: (e) => vp.setGizmoScale(e.target.value) })),
        btn('⇋ X', 'Espejo X: girar un lado gira el otro (ambos con clave)', app.mirrorX, () => {
          app.mirrorX = !app.mirrorX;
          buildTools();
        }),
      ),
      toolMenu('Seleccionar',
        btn('⇄', 'Elegir el lado opuesto', false, () => {
          const s = app.selection;
          if (s?.kind === 'bone') {
            const c = app.rig.canonOf.get(s.bone);
            if (c && /[LR]$/.test(c) && c !== 'upperChest') {
              const o = app.rig.bone(c.slice(0, -1) + (c.endsWith('L') ? 'R' : 'L'));
              if (o) app.select({ kind: 'bone', bone: o });
            }
          } else if (s && s.chain) app.select({ kind: s.kind, chain: s.chain.slice(0, -1) + (s.chain.endsWith('L') ? 'R' : 'L') });
        }),
        btn('⇣', 'Elegir el hijo', false, () => {
          const s = app.selection;
          if (s?.kind === 'bone') {
            const k = s.bone.children.find((c) => app.rig.index.has(c));
            if (k) app.select({ kind: 'bone', bone: k });
          }
        }),
        btn('⇡', 'Elegir el padre', false, () => {
          const s = app.selection;
          if (s?.kind === 'bone' && app.rig.index.has(s.bone.parent)) app.select({ kind: 'bone', bone: s.bone.parent });
        }),
        btn('⬚', 'Selección por caja (B) — Mayús+clic en un control también añade', false, () => vp.startBoxSelect()),
        btn('⇊', 'Añadir todos los hijos (la mano con sus dedos…)', false, () => app.selectChildren()),
        btn('⇆', 'Añadir el otro lado', false, () => app.selectBothSides()),
      ),
      toolMenu('Copiar y pegar',
        btn('⧉', 'Copiar transformaciones de lo elegido (Ctrl+C)', false, () => ((app._lastCopy = 'pose'), app.copyTransforms())),
        btn('📋', 'Pegar aquí (Ctrl+V)', false, () => app.pasteTransforms({ mode: 'local' })),
        btn('📋⇋', 'Pegar reflejado al otro lado (Ctrl+Mayús+V)', false, () => app.pasteTransforms({ mode: 'mirror' })),
        btn('🌐', 'Pegar en global: misma orientación en el mundo', false, () => app.pasteTransforms({ mode: 'global' })),
        btn('⏱', 'Copiar a lo largo del tiempo (claves elegidas o todo el rango)', false, () => ((app._lastCopy = 'pose'), app.copyTransforms({ overTime: true }))),
        // Herramientas: matriz de mundo (posición + giro exactos) y relativa (respecto al hueso activo)
        btn('🌐⧉', 'Copiar matriz de mundo: posición y giro exactos (Herramientas)', false, () => app.toolsUI?.actions.copyWorld()),
        btn('🌐📋', 'Pegar matriz de mundo: vuelve al mismo sitio del mundo (Herramientas)', false, () => app.toolsUI?.actions.pasteWorld()),
        btn('⛓⧉', 'Copiar matriz relativa al hueso activo (el último elegido) (Herramientas)', false, () => app.toolsUI?.actions.copyRelative()),
        btn('⛓📋', 'Pegar relativa en el rango de Herramientas: la relación se mantiene aunque el activo se mueva', false, () => app.toolsUI?.actions.pasteRelative()),
      ),
      toolMenu('Mostrar',
        btn('🦴', 'Mostrar huesos', vp.opts.bones, () => {
          vp.setBones(!vp.opts.bones);
          buildTools();
        }),
        btn('▦', 'Alambre', vp.opts.wire, () => {
          vp.opts.wire = !vp.opts.wire;
          vp.applyShading();
          buildTools();
        }),
        btn('◐', 'Gris: formas sin color', vp.opts.grey, () => {
          vp.opts.grey = !vp.opts.grey;
          vp.applyShading();
          buildTools();
        }),
        btn('◌', 'Rayos X: ver los controles a través del cuerpo', vp.opts.xray, () => {
          vp.opts.xray = !vp.opts.xray;
          vp.applyShading();
          buildTools();
        }),
        btn('◎', 'Controles del rig', vp.opts.controls, () => {
          vp.opts.controls = !vp.opts.controls;
          buildTools();
        }),
        btn('👻', 'Piel de cebolla: fotogramas antes (naranja) y después (azul)', vp.opts.onion, () => {
          vp.opts.onion = !vp.opts.onion;
          vp.updateOnion();
          buildTools();
        }),
        btn('〰', 'Trayectoria editable de lo elegido: arrastra las bolas amarillas (claves) en el visor (Mayús+P)', !!app.pathView?.opts.on, () => {
          app.pathView?.toggle();
          buildTools();
        }),
      ),
      toolMenu('Cámara',
        btn('🎥', 'Seguir al personaje', vp.opts.follow, () => {
          vp.opts.follow = !vp.opts.follow;
          buildTools();
        }),
        btn('⌂', 'Reencuadrar (F)', false, () => vp.reframe()),
        btn('⊞', 'Vista cuádruple (Ctrl+Alt+Q): arriba, frente, lado y la tuya', !!vp.quad, () => app.toggleQuad()),
        btn('📷', 'Mirar por la cámara de plano', !!vp.shot?.lookThrough, () => {
          app.stage.ensureShot();
          app.stage.lookThrough(!vp.shot.lookThrough);
          buildTools();
        }),
      ),
    );
  }
  function sel(opts, value, onChange, title = '') {
    const s = h('select', { title }, opts.map(([v, l]) => h('option', { value: v }, l)));
    s.value = value;
    s.onchange = () => onChange(s.value);
    return s;
  }
  $('#vaxes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) app.viewport.viewFrom(b.dataset.view);
  });
  P.refreshTools = () => {
    buildTools();
    P.refreshMotion?.();
  };

  // ---------- barra de la línea de tiempo ----------
  function buildTbar() {
    const t = $('#tbar');
    t.innerHTML = '';
    const eng = app.engine;
    const b = (label, title, fn, cls = '') => h('button', { title, onclick: fn, class: cls }, label);
    const [ra, rb] = app.playbackRange();
    const animalBar=app.animales?.barra?.();
    const frameIn = h('input', { type: 'number', value: Math.round(eng.frame), title: 'Fotograma actual' });
    frameIn.onchange = () => app.setFrame(+frameIn.value);
    const startIn = h('input', { type: 'number', value: ra, title: 'Primer fotograma del rango' });
    const endIn = h('input', { type: 'number', value: rb, title: 'Último fotograma del rango' });
    const setRange = () => {
      app.pushUndo();
      eng.doc.rangeMode = 'manual';
      eng.doc.start = +startIn.value;
      eng.doc.end = Math.max(+startIn.value + 1, +endIn.value);
      app.changed();
    };
    startIn.onchange = endIn.onchange = setRange;
    P._frameIn = frameIn;
    t.append(
      h('div', { class: 'grp' },
        b('↶', 'Deshacer (Ctrl+Z)', () => app.undo()),
        b('↷', 'Rehacer (Ctrl+Shift+Z)', () => app.redo()),
        b('🗑', 'Limpiar: quita todas las claves y capas (se puede deshacer)', () => {
          if (!confirm('¿Quitar todas las claves y capas de esta animación?')) return;
          app.pushUndo();
          eng.doc.layers = [newLayer('base', 'Base')];
          eng.doc.activeLayer = 'base';
          Object.keys(eng.doc.ik).forEach((k) => (eng.doc.ik[k] = false));
          app.changed();
        }),
        b('⧉ Mi copia', 'Hacer mi copia: guarda lo que se ve en Tuyas y lo abre para editar', () => app.makeMyCopy()),
        b('🔗', 'Copiar un enlace con exactamente esto', () => app.copyLink()),
      ),
      h('div', { class: 'grp' },
        b('⟳', 'Bucle', () => {
          app.loopPlay = !app.loopPlay;
          buildTbar();
        }, app.loopPlay ? 'on' : ''),
        sel([['0.25', '×0.25'], ['0.5', '×0.5'], ['1', '×1'], ['1.5', '×1.5'], ['2', '×2']], String(app.speed), (x) => (app.speed = +x), 'Velocidad de reproducción'),
      ),
      ...(animalBar?[animalBar]:[]),
      h('div', { class: 'grp' },
        b('|◀', 'Al inicio del rango', () => app.setFrame(ra)),
        b('◂◆', 'Clave anterior (↑)', () => app.jumpKey(-1)),
        b('◀', 'Reproducir hacia atrás', () => app.togglePlay(-1), app.playing && app.playDir < 0 ? 'on' : ''),
        b(app.playing && app.playDir > 0 ? '❚❚' : '▶', 'Reproducir / pausa (Espacio)', () => app.togglePlay(1), app.playing && app.playDir > 0 ? 'on' : ''),
        b('◆▸', 'Clave siguiente (↓)', () => app.jumpKey(1)),
        b('▶|', 'Al final del rango', () => app.setFrame(rb)),
      ),
      h('div', { class: 'grp' },
        b('●', 'Clave automática: lo que mueves queda con clave en este fotograma', () => {
          app.autoKey = !app.autoKey;
          buildTbar();
        }, `rec ${app.autoKey ? 'on' : ''}`),
        b('◆', 'Clave de lo elegido aquí (K)', () => app.keySelected()),
        b('◆◆', 'Clave de toda la pose: fija aquí el cuerpo entero tal como se ve', () => app.keyPose()),
        b('◇✕', 'Borrar clave aquí (Supr)', () => app.deleteKeyHere()),
      ),
      h('div', { class: 'grp' },
        b('TIRAS', 'Ver tiras y resumen de claves por capa', () => {
          app.timeline.mode = 'strips';
          buildTbar();
          app.timeline.draw();
        }, app.timeline.mode === 'strips' ? 'on' : ''),
        b('CLAVES', 'Hoja de claves: cada pista de la capa activa (caja para elegir, Ctrl+C/V, Supr)', () => {
          app.timeline.mode = 'keys';
          buildTbar();
          app.timeline.draw();
        }, app.timeline.mode === 'keys' ? 'on' : ''),
        app.timeline.mode === 'keys' ? h('input', { type: 'search', placeholder: 'Buscar pistas', value: app.timeline.trackQuery, title: 'Filtra las pistas por nombre (como el Sequencer)', style: { width: '110px' }, oninput: (e) => {
          app.timeline.trackQuery = e.target.value;
          app.timeline.buildRows();
          app.timeline.draw();
          const c = $('#tlCount');
          if (c) c.textContent = `${app.timeline.trackCount.shown} de ${app.timeline.trackCount.total}`;
        } }) : null,
        app.timeline.mode === 'keys' ? h('span', { id: 'tlCount', class: 'muted small', title: 'Pistas a la vista / total de la capa' }, `${app.timeline.trackCount.shown} de ${app.timeline.trackCount.total}`) : null,
        b('CURVAS', 'Editor de curvas: arrastra un punto (vertical = valor, horizontal = tiempo, Alt = libre)', () => {
          app.timeline.mode = 'curves';
          buildTbar();
          app.timeline.draw();
        }, app.timeline.mode === 'curves' ? 'on' : ''),
        b('▾ Sel.', 'Solo lo seleccionado', () => {
          app.onlySelected = !app.onlySelected;
          buildTbar();
          app.timeline.draw();
        }, app.onlySelected ? 'on' : ''),
        b('AJUSTAR', 'Toda la animación a la vista', () => app.timeline.fit()),
      ),
      ...(app.timeline.mode !== 'strips' ? [keyTools()] : []),
      h('div', { class: 'grp' }, h('span', { class: 'muted' }, 'Fotograma'), frameIn),
      h('div', { class: 'grp' },
        sel([['auto', 'Rango: todo'], ['manual', 'Rango: manual']], eng.doc.rangeMode, (x) => {
          app.pushUndo();
          eng.doc.rangeMode = x;
          if (x === 'manual') {
            eng.doc.start = ra;
            eng.doc.end = rb;
          }
          app.changed();
        }),
        startIn,
        endIn,
        h('span', { class: 'muted' }, `${eng.fps} fps · ${((rb - ra) / eng.fps).toFixed(2)} s`),
      ),
    );
  }
  P.refreshTransport = buildTbar;
  P.refreshKeyTools = () => app.timeline.mode !== 'strips' && buildTbar();

  function keyTools() {
    const tl = app.timeline;
    const n = tl.selKeys.size;
    const interp = sel([['', n ? `${n} clave(s): interpolación…` : 'Interpolación…'], ...INTERPS], '', (v) => v && tl.setInterp(v), 'Interpolación de las claves elegidas');
    const factor = h('input', { type: 'number', step: 0.1, value: 1, style: { width: '52px' }, title: 'Factor de escala en el tiempo' });
    const b = (label, title, fn) => h('button', { title, onclick: fn }, label);
    return h('div', { class: 'grp' },
      interp,
      factor,
      b('↔', 'Escalar en el tiempo las claves elegidas (desde la primera)', () => tl.scaleSelected(+factor.value || 1)),
      b('⧉', 'Copiar claves (Ctrl+C)', () => ((app._lastCopy = 'keys'), tl.copySelected())),
      b('📋', 'Pegar claves en el cabezal (Ctrl+V)', () => tl.pasteKeys()),
      b('✎ Curva', n ? 'Curva propia del tramo que sale de las claves elegidas: lento, rápido, con impulso o pasándose' : 'Elige antes una o más claves', (e) => {
        if (!n) return app.toast('Elige antes una o más claves (clic, Mayús+clic o caja)', true);
        const old = $('#easePop');
        if (old) return old.remove();
        const btnEl = e.currentTarget;
        let first = true;
        const ed = easingEditor({ value: tl.selectedBezier(), w: 190, hgt: 130,
          onInput: (v) => {
            if (first) app.pushUndo();
            first = false;
            tl.setBezier(v, true);
          },
          onCommit: (v) => {
            if (first) app.pushUndo();
            first = true;
            tl.setBezier(v, true);
            app.changed(false);
          } });
        const r = btnEl.getBoundingClientRect();
        const pop = h('div', { id: 'easePop', style: { position: 'fixed', left: `${Math.min(r.left, innerWidth - 330)}px`, bottom: `${innerHeight - r.top + 6}px`, zIndex: 50, background: '#1c1f26', border: '1px solid #3a404c', borderRadius: '6px', padding: '8px', boxShadow: '0 6px 24px #000a' } },
          h('div', { class: 'small muted', style: { marginBottom: '4px' } }, `Curva de ${n} clave(s) → siguiente`), ed);
        document.body.append(pop);
        const close = (ev) => {
          if (pop.contains(ev.target) || ev.target === btnEl) return;
          pop.remove();
          window.removeEventListener('pointerdown', close, true);
        };
        window.addEventListener('pointerdown', close, true);
      }),
      b('✕', 'Borrar claves elegidas (Supr)', () => tl.deleteSelected()),
      b('〰', 'Suavizar: quita temblores acercando cada clave al promedio de sus vecinas (lo elegido o toda la capa)', () => tl.smoothSelectedTracks()),
      b('🧹', 'Limpiar: quita claves que sobran (lo elegido o toda la capa)', () => tl.cleanSelectedTracks()),
      b('🔥', 'Hornear: una clave por fotograma', () => tl.bakeSelectedTracks()),
      tl.mode === 'curves' ? b(tl.curveView.auto ? 'Auto' : 'Fijo', 'Escala vertical automática', () => {
        tl.curveView.auto = !tl.curveView.auto;
        buildTbar();
        tl.draw();
      }) : null,
    );
  }

  // ---------- Esquema ----------
  ['#olIK', '#olPole', '#olFingers'].forEach((s) => ($(s).onchange = () => P.refreshOutliner()));
  $('#olSearch').oninput = (e) => {
    state.olFilter = e.target.value.toLowerCase();
    P.refreshOutliner();
  };
  P.refreshOutliner = () => {
    const tree = $('#outliner');
    tree.innerHTML = '';
    const rig = app.rig;
    if (!rig) return;
    const showIK = $('#olIK').checked;
    const showPole = $('#olPole').checked;
    const showFingers = $('#olFingers').checked;
    const ikAt = {};
    for (const [chain, def] of Object.entries(IK_CHAINS)) {
      const end = rig.bone(def.bones[2]);
      const mid = rig.bone(def.bones[1]);
      if (end) ikAt[end.name] = { chain, kind: 'ik', label: `IK: ${def.label}` };
      if (mid) ikAt[`${mid.name}#pole`] = { chain, kind: 'pole', label: `Polo: ${chain.startsWith('hand') ? 'codo' : 'rodilla'} ${chain.endsWith('L') ? 'izq.' : 'der.'}` };
    }
    const depth = (b) => {
      let d = 0;
      let o = b.parent;
      while (o && rig.index.has(o)) {
        d++;
        o = o.parent;
      }
      return d;
    };
    for (const b of rig.bones) {
      const c = rig.canonOf.get(b);
      if (!showFingers && c && CANON_BY_ID[c].group.startsWith('fingers')) continue;
      if (!showFingers && !c && /thumb|index|middle|ring|pinky|finger|dedo/i.test(b.name)) continue;
      if (state.olFilter && !b.name.toLowerCase().includes(state.olFilter) && !(c && canonLabel(c).toLowerCase().includes(state.olFilter))) continue;
      const d = depth(b);
      const side = c ? (c.endsWith('L') ? 'var(--L)' : c.endsWith('R') && c !== 'upperChest' ? 'var(--R)' : 'var(--warn)') : '#555';
      const row = h('div', { class: 'node', 'data-bone': b.name, style: { paddingLeft: `${4 + d * 10}px` }, onclick: () => app.select({ kind: 'bone', bone: b }) },
        h('span', { class: 'dot', style: { background: side } }),
        b.name,
        c ? h('span', { class: 'tag' }, `· ${canonLabel(c)}`) : null,
      );
      tree.append(row);
      const pole = ikAt[`${b.name}#pole`];
      if (pole && showPole) tree.append(ikRow(pole, d + 1));
      const ik = ikAt[b.name];
      if (ik && showIK) tree.append(ikRow(ik, d + 1));
    }
    P.highlightOutliner();
  };
  function ikRow(info, d) {
    const on = app.engine.doc.ik[info.chain];
    const sw = h('span', { class: 'sw', title: 'Encender/apagar IK', onclick: (e) => {
      e.stopPropagation();
      app.setIK(info.chain, !on);
    } }, on ? 'ON' : 'off');
    return h('div', { class: `node ikrow ${on ? '' : 'off'}`, 'data-ik': `${info.kind}:${info.chain}`, style: { paddingLeft: `${4 + d * 10}px` }, onclick: () => on && app.select({ kind: info.kind, chain: info.chain }) }, info.kind === 'ik' ? '■' : '◆', info.label, sw);
  }
  P.highlightOutliner = () => {
    const s = app.selection;
    $$('#outliner .node').forEach((n) => {
      const on = s && ((s.kind === 'bone' && n.dataset.bone === s.bone.name) || (s.chain && n.dataset.ik === `${s.kind}:${s.chain}`));
      n.classList.toggle('sel', !!on);
      if (on) n.scrollIntoView({ block: 'nearest' });
    });
  };

  // ---------- Transformar ----------
  P.refreshTransform = () => {
    const el = $('#pTransform');
    const s = app.selection;
    if (app.dragging && el.dataset.k === keyOf(s)) {
      updateTransformValues();
      return;
    }
    el.innerHTML = '';
    el.dataset.k = keyOf(s);
    el.append(h('h3', {}, 'Transformar'));
    if (!s) {
      el.append(h('div', { class: 'muted' }, 'Nada elegido: pulsa un control en el visor, en el esquema o en el selector.'));
      return;
    }
    const tf = h('div', { class: 'tf' });
    el.append(tf);
    const rig = app.rig;
    let name = '';
    if (s.kind === 'bone') {
      const c = rig.canonOf.get(s.bone);
      name = rig.kind === 'quadruped' ? horseControlPoints(rig).find(p => p.bone === s.bone)?.label || s.bone.name : `${s.bone.name}${c ? ' · ' + canonLabel(c) : ''}`;
    } else if (s.kind === 'root') name = 'Raíz (cadera en el suelo)';
    else if (s.kind === 'prop') name = `Objeto · ${s.prop.name} (mano ${s.prop.hand === 'L' ? 'izq.' : 'der.'})`;
    else if (s.kind === 'piece') name = `Escenario · ${s.piece.name}`;
    else name = `${s.kind === 'ik' ? 'IK' : 'Polo'} · ${app.rig.kind === 'quadruped' ? horseChainLabel(s.chain) : IK_CHAINS[s.chain].label}`;
    tf.append(h('div', { class: 'name' }, name));
    if (s.kind === 'prop' || s.kind === 'piece') {
      const o = s.kind === 'prop' ? s.prop.obj : s.piece.obj;
      const row = (label, get, set, step) => h('div', { class: 'grid3' }, h('span', { class: 'muted' }, label), ...[0, 1, 2].map((i) => {
        const inp = h('input', { type: 'number', step, value: (+get()[i]).toFixed(3) });
        inp.onchange = () => {
          const v = get().slice();
          v[i] = +inp.value;
          set(v);
        };
        return inp;
      }), h('span'));
      tf.append(
        row('Posición', () => o.position.toArray(), (v) => o.position.fromArray(v), 0.01),
        row('Giro°', () => [o.rotation.x, o.rotation.y, o.rotation.z].map((x) => x * D), (v) => o.rotation.set(v[0] / D, v[1] / D, v[2] / D), 1),
        h('div', { class: 'small muted' }, s.kind === 'prop' ? 'Se coloca con el gizmo (W mover, E girar, S escalar). Va pegado a la mano y sale en las exportaciones.' : 'Pieza de referencia: no se exporta.'),
        h('div', { class: 'row' },
          s.kind === 'prop' ? h('button', { class: 'btn sm', onclick: () => app.stage.resetProp(s.prop) }, 'Volver al agarre') : null,
          s.kind === 'prop' ? h('button', { class: 'btn sm', title: 'Enciende el IK de esa mano: mueve la caja verde y el brazo la sigue', onclick: () => {
            const ch = `hand${s.prop.hand}`;
            app.setIK(ch, true);
            app.select({ kind: 'ik', chain: ch });
          } }, 'El brazo sigue al objeto') : null,
          h('button', { class: 'btn sm', onclick: () => (s.kind === 'prop' ? app.stage.removeProp(s.prop) : app.stage.removePiece(s.piece)) }, 'Quitar'),
        ),
      );
      return;
    }
    const mkRow = (label, kind) => {
      const ins = [0, 1, 2].map((i) => {
        const inp = h('input', { type: 'number', step: kind === 'rot' ? 1 : 0.01, 'data-tf': `${kind}${i}` });
        inp.onchange = () => setFromInputs(kind);
        return inp;
      });
      // ↺ vuelve esa fila al reposo (como el «reset» por propiedad del Anim Details de Unreal); ◆ guarda clave
      const canReset = s.kind === 'bone' || s.kind === 'root';
      return h('div', { class: 'grid3', style: { gridTemplateColumns: '56px 1fr 1fr 1fr 22px 22px' } }, h('span', { class: 'muted' }, label), ...ins,
        canReset ? h('button', { class: 'kd', title: 'Volver al reposo', onclick: () => resetRow(kind) }, '↺') : h('span'),
        h('button', { class: 'kd', title: 'Clave', onclick: () => app.keySelected() }, '◆'));
    };
    const isHips = s.kind === 'root' || (s.kind === 'bone' && rig.canonOf.get(s.bone) === 'hips');
    if (isHips || s.kind === 'ik' || s.kind === 'pole') tf.append(mkRow('Ubicación', 'pos'));
    if (s.kind === 'bone' || s.kind === 'ik' || s.kind === 'root') tf.append(mkRow('Rotación°', 'rot'));
    if (s.kind === 'bone') tf.append(mkRow('Escala', 'scl'));
    if (s.kind === 'ik' || s.kind === 'pole') {
      // Stretch y Softness de la cadena (leg_stretch / leg_softness del Control Rig)
      const opts = app.engine.doc.ikOpts?.[s.chain] || {};
      const setOpt = (patch) => {
        app.pushUndo();
        const d = app.engine.doc;
        d.ikOpts = { ...(d.ikOpts || {}), [s.chain]: { stretch: false, soft: 0, ...(d.ikOpts?.[s.chain] || {}), ...patch } };
        app.changed();
      };
      const cb = h('input', { type: 'checkbox', onchange: (e) => setOpt({ stretch: e.target.checked }) });
      cb.checked = !!opts.stretch;
      const softOut = h('span', { class: 'muted', style: { minWidth: '30px', textAlign: 'right' } }, (opts.soft || 0).toFixed(2));
      tf.append(
        h('label', { class: 'row small', style: { gap: '6px', alignItems: 'center' }, title: 'Si el objetivo queda lejos, el brazo o la pierna se estiran (hasta +30 %) en vez de quedarse cortos' }, cb, 'Stretch'),
        h('label', { class: 'row small', style: { gap: '6px', alignItems: 'center' }, title: 'Softness: cerca de la extensión total la rodilla o el codo se estiran con suavidad, sin el chasquido del IK' }, 'Softness',
          h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: opts.soft || 0, style: { flex: 1 }, oninput: (e) => (softOut.textContent = (+e.target.value).toFixed(2)), onchange: (e) => setOpt({ soft: +e.target.value }) }), softOut),
      );
    }
    if (s.kind === 'ik' || s.kind === 'pole') {
      const st = app.engine.ikState[s.chain] || { weight: 1, pin: 0, reach: 0 };
      const f = () => Math.round(app.engine.frame);
      const out = h('span', { class: 'muted', style: { minWidth: '34px', textAlign: 'right' } }, `${Math.round(st.weight * 100)}%`);
      const sl = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: st.weight, title: '0 % = FK (la animación tal cual) · 100 % = IK (manda la caja). Con claves cambia a lo largo del tiempo.', style: { flex: 1 } });
      let undo = false;
      sl.oninput = () => {
        if (!undo) app.pushUndo();
        undo = true;
        app.engine.keyIKWeight(s.chain, +sl.value, f());
        app.engine.evaluate(app.engine.frame);
        out.textContent = `${Math.round(sl.value * 100)}%`;
        app.timeline.draw();
      };
      sl.onchange = () => ((undo = false), app.changed());
      const [, rb] = app.engine.range();
      tf.append(
        h('div', { class: 'row', style: { alignItems: 'center', gap: '6px' } }, h('span', { class: 'muted' }, 'FK'), sl, h('span', { class: 'muted' }, 'IK'), out),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', title: 'Deja la mano o el pie fijo en este punto del mundo, haga lo que haga el cuerpo (apoyarse en una mesa, pie plantado)', onclick: () => app.pinSelected() }, '📌 Anclar aquí'),
          h('button', { class: 'btn sm', title: 'Anclar solo durante un tramo, con entrada y salida suaves', onclick: () => {
            const r = prompt('Anclar desde-hasta (fotogramas)', `${f()}-${Math.min(rb, f() + 20)}`);
            const m = r && r.match(/(-?\d+)\D+(-?\d+)/);
            if (m) app.pinSelected(+m[1], +m[2]);
          } }, '📌 Tramo…'),
          h('button', { class: 'btn sm', title: 'Quitar las anclas: vuelve a seguir la animación', onclick: () => app.unpinSelected() }, 'Soltar'),
        ),
        h('div', { class: 'small muted' }, st.reach > 1.002 ? '⚠ El objetivo queda fuera del alcance: la cadena se estira del todo.' : st.pin > 0.5 ? 'Anclada en el mundo en este fotograma.' : 'Sigue a la animación; lo que muevas se suma encima.'),
      );
    }
    const hasKey = app.engine.keyFrames(app.engine.doc.activeLayer, app.trackFilter()).includes(Math.round(app.engine.frame));
    tf.append(
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => app.keySelected() }, hasKey ? '◆ Clave (hay)' : '◇ Poner clave'),
        h('button', { class: 'btn sm', onclick: () => app.deleteKeyHere() }, 'Borrar clave'),
        h('button', { class: 'btn sm', title: 'Quita todas las claves de esto en la capa activa', onclick: () => {
          app.pushUndo();
          const f = app.trackFilter();
          const l = app.engine.layer();
          for (const id of Object.keys(l.tracks)) if (f(id)) delete l.tracks[id];
          app.changed();
        } }, 'Restablecer'),
      ),
      h('div', { class: 'small muted' }, `Capa activa: ${app.engine.layer().name}${app.engine.layer().lock ? ' (bloqueada)' : ''}`),
    );
    updateTransformValues();
  };
  const keyOf = (s) => (!s ? '' : s.kind === 'bone' ? `b:${s.bone.name}` : `${s.kind}:${s.chain || ''}`);
  function updateTransformValues() {
    const s = app.selection;
    if (!s) return;
    const set = (k, v) => {
      const i = $(`[data-tf="${k}"]`);
      if (i && document.activeElement !== i) i.value = (+v).toFixed(k.startsWith('rot') ? 1 : 3);
    };
    if (s.kind === 'bone' || s.kind === 'root') {
      const b = s.kind === 'root' ? app.rig.bone('hips') : s.bone;
      const e = new THREE.Euler().setFromQuaternion(b.quaternion);
      set('rot0', e.x * D);
      set('rot1', e.y * D);
      set('rot2', e.z * D);
      ['x', 'y', 'z'].forEach((a, i) => {
        set(`pos${i}`, b.position[a]);
        set(`scl${i}`, b.scale[a]);
      });
    } else {
      const st = app.engine.ikState[s.chain];
      if (!st) return;
      const p = s.kind === 'ik' ? st.target : st.pole;
      ['x', 'y', 'z'].forEach((a, i) => set(`pos${i}`, p[a]));
      const e = new THREE.Euler().setFromQuaternion(st.targetQ);
      set('rot0', e.x * D);
      set('rot1', e.y * D);
      set('rot2', e.z * D);
    }
  }
  /** ↺ de una fila: rotación, ubicación o escala del hueso vuelven a su reposo (con clave en este fotograma). */
  function resetRow(kind) {
    const s = app.selection;
    if (!s || (s.kind !== 'bone' && s.kind !== 'root')) return;
    const rig = app.rig;
    const b = s.kind === 'root' ? rig.bone('hips') : s.bone;
    const i = rig.index.get(b);
    if (i === undefined) return;
    const f = Math.round(app.engine.frame);
    app.pushUndo();
    if (kind === 'rot') app.engine.keyBone(b, rig.restQ[i].clone(), null, f);
    else if (kind === 'pos') app.engine.keyBone(b, null, rig.restP[i].clone(), f);
    else app.engine.keyBone(b, null, null, f, rig.restS[i].clone());
    app.changed();
  }
  function setFromInputs(kind) {
    const s = app.selection;
    const v = [0, 1, 2].map((i) => +$(`[data-tf="${kind}${i}"]`).value);
    const f = Math.round(app.engine.frame);
    app.pushUndo();
    if (s.kind === 'bone' || s.kind === 'root') {
      const b = s.kind === 'root' ? app.rig.bone('hips') : s.bone;
      if (kind === 'rot') app.engine.keyBone(b, new THREE.Quaternion().setFromEuler(new THREE.Euler(v[0] / D, v[1] / D, v[2] / D)), null, f);
      else if (kind === 'scl') app.engine.keyBone(b, null, null, f, new THREE.Vector3(...v.map((x) => x || 1)));
      else app.engine.keyBone(b, null, new THREE.Vector3(...v), f);
    } else if (kind === 'pos') app.engine.keyIK(s.chain, s.kind === 'ik' ? { pos: new THREE.Vector3(...v) } : { pole: new THREE.Vector3(...v) }, f);
    else app.engine.keyIK(s.chain, { quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(v[0] / D, v[1] / D, v[2] / D)) }, f);
    app.changed();
  }

  // ---------- Rig (qué controles se ven, IK/FK) ----------
  P.refreshRig = () => {
    const el = $('#spRig');
    el.innerHTML = '';
    const vis = app.viewport.handleVis;
    const horseLabels = {ikHandL:'IK delantera izq.',ikHandR:'IK delantera der.',armL:'Pata delantera izq.',armR:'Pata delantera der.',poleL:'Polo delantero izq.',poleR:'Polo delantero der.',shoulderL:'Base delantera izq.',shoulderR:'Base delantera der.',ikFootL:'IK trasera izq.',ikFootR:'IK trasera der.',legL:'Pata trasera izq.',legR:'Pata trasera der.',kneeL:'Polo trasero izq.',kneeR:'Polo trasero der.'};
    const tile = (key, label, cls = '') => {
      if (app.rig.kind === 'quadruped') label = horseLabels[key] || label;
      const t = h('div', { class: `tile ${cls} ${vis[key] ? 'on' : ''}`, title: 'Mostrar / ocultar', onclick: () => {
        vis[key] = !vis[key];
        t.classList.toggle('on', vis[key]);
      } }, label);
      return t;
    };
    const ikTile = (chain) => {
      const on = app.engine.doc.ik[chain];
      return h('div', { class: `tile ${on ? 'on' : ''}`, title: on ? 'IK: el efector manda (clic: volver a FK)' : 'FK: cada hueso por su cuenta (clic: IK)', onclick: () => {
        app.setIK(chain, !on);
      } }, `${app.rig.kind === 'quadruped' ? horseChainLabel(chain) : IK_CHAINS[chain].label}: ${on ? 'IK' : 'FK'}`);
    };
    const An = app.animales;
    const caballo = !!An?.enEditor?.();
    el.append(
      // Biblioteca › Animales abierta: elegir de quién es el rig (jinete en la capa Base o Rocinante en el editor de cuatro patas).
      ...(An?.visible ? [
        h('h3', {}, 'Rig de'),
        h('div', { class: 'tiles' },
          h('div', { class: `tile ${!caballo && An.enBase?.() ? 'on' : ''}`, title: 'El jinete con sus puntos y círculos; la escena queda en la capa Base (cada animación en su tira)', onclick: () => An.pedirRig('jinete').then(() => P.refreshRig()) }, caballo ? 'Jinete' : app.charMeta?.name || 'Jinete'),
          h('div', { class: `tile ${caballo ? 'on' : ''}`, title: 'Rocinante en el editor de cuatro patas: articulaciones, objetivos IK y polos', onclick: () => An.pedirRig('caballo').then(() => P.refreshRig()) }, 'Rocinante'),
        ),
      ] : []),
      ...(app.rig.kind === 'quadruped' ? [
        h('h3',{},'Anatomía'),
        h('label',{class:'row'},'Restricciones',sel([
          ['anatomico','Anatómico'],['estilizado','Estilizado'],['libre','Libre'],
        ],app.engine.doc.anatomyMode||'anatomico',x=>{
          app.pushUndo();app.engine.doc.anatomyMode=x;app.changed();
        },'El mismo perfil limita IK y FK; Libre permite poses especiales')),
        h('div',{class:'small muted'},'Círculos: articulaciones · cuadrados: objetivos IK · rombos violetas: polos auxiliares.'),
      ] : []),
      h('h3', {}, 'Mostrar'),
      h('div', { class: 'tiles' },
        tile('hips', 'Cadera'), tile('spine', 'Columna y cabeza'),
        ...(app.rig.kind === 'quadruped' ? [] : [tile('fingersL', 'Dedos izq.'), tile('fingersR', 'Dedos der.')]),
        tile('ikHandL', 'Caja IK mano izq.'), tile('ikHandR', 'Caja IK mano der.'),
        tile('armL', 'Brazo izq.'), tile('armR', 'Brazo der.'),
        tile('poleL', 'Polo codo izq.'), tile('poleR', 'Polo codo der.'),
        tile('shoulderL', 'Hombro izq.'), tile('shoulderR', 'Hombro der.'),
        tile('ikFootL', 'Caja IK pie izq.'), tile('ikFootR', 'Caja IK pie der.'),
        tile('legL', 'Pierna izq.'), tile('legR', 'Pierna der.'),
        tile('kneeL', 'Polo rodilla izq.'), tile('kneeR', 'Polo rodilla der.'),
        tile('root', 'Círculo raíz', 'wide'),
      ),
      h('h3', { style: { marginTop: '10px' } }, 'IK / FK'),
      h('div', { class: 'tiles' }, ikTile('handL'), ikTile('handR'), ikTile('footL'), ikTile('footR')),
      h('div', { class: 'small muted', style: { marginTop: '6px' } }, 'Con la herramienta 🖐 IK (tecla A), arrastra una mano o un pie y el brazo o la pierna lo siguen; un codo o una rodilla mueven su polo. Con Rotar (E) giras cada hueso (FK). Sin claves, IK reproduce la animación tal cual.'),
      h('h3', { style: { marginTop: '10px' } }, 'Contacto con el suelo'),
      h('div', { class: 'tiles' },
        h('div', { class: `tile wide ${app.engine.doc.floor ? 'on' : ''}`, title: 'Los pies no bajan de la altura del suelo, en toda la animación', onclick: () => {
          app.pushUndo();
          app.engine.doc.floor = !app.engine.doc.floor;
          app.changed();
          P.refreshRig();
        } }, `Los pies no atraviesan el suelo: ${app.engine.doc.floor ? 'sí' : 'no'}`),
      ),
      h('div', { class: 'row', style: { marginTop: '6px' } },
        h('button', { class: 'btn sm', title: 'Busca los tramos en que cada pie está apoyado y lo ancla ahí: quita el patinaje', onclick: () => app.lockFeet() }, '📌 Fijar pies apoyados'),
        h('button', { class: 'btn sm', title: 'Quita todas las anclas de los pies en la capa activa', onclick: () => {
          app.pushUndo();
          app.engine.unpinIK('footL');
          app.engine.unpinIK('footR');
          app.changed();
        } }, 'Soltar pies'),
      ),
      h('h3', { style: { marginTop: '10px' } }, 'Espejo de la pose'),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => (app.pushUndo(), app.engine.mirrorSide(Math.round(app.engine.frame), 'L'), app.changed()) }, 'Izq. → der.'),
        h('button', { class: 'btn sm', onclick: () => (app.pushUndo(), app.engine.mirrorSide(Math.round(app.engine.frame), 'R'), app.changed()) }, 'Der. → izq.'),
      ),
    );
  };

  // ---------- Ajustar (deslizadores) ----------
  P.refreshAdjust = () => {
    const el = $('#spAjustar');
    el.innerHTML = '';
    const a = app.engine.doc.adjust;
    const sl = (key, label, min, max, step = 1) => {
      const out = h('output', {}, a[key]);
      const r = h('input', { type: 'range', min, max, step, value: a[key] });
      r.oninput = () => {
        a[key] = +r.value;
        out.textContent = r.value;
        app.engine.evaluate(app.engine.frame);
      };
      r.onpointerdown = () => app.pushUndo();
      r.onchange = () => app.changed(false);
      r.ondblclick = () => {
        app.pushUndo();
        a[key] = key === 'speed' ? 1 : 0;
        app.changed();
        P.refreshAdjust();
      };
      return h('div', { class: 'slider' }, h('span', {}, label), r, out, h('span', { class: 'muted', title: 'Doble clic en el deslizador: a cero' }, '↺'));
    };
    el.append(
      h('h3', {}, 'Ajustar el clip'),
      h('div', { class: 'small muted' }, 'Cambian toda la animación base, sin claves. Doble clic: a cero.'),
      sl('armsV', 'Brazos ↕', -45, 45),
      sl('armsH', 'Brazos ↔', -45, 45),
      sl('posture', 'Postura', -25, 25),
      sl('chestH', 'Pecho ↔', -30, 30),
      sl('chestV', 'Pecho ↕', -25, 25),
      sl('headV', 'Cabeza ↕', -35, 35),
      sl('headH', 'Cabeza ↔', -50, 50),
      sl('speed', 'Velocidad', 0.25, 2.5, 0.05),
    );
  };

  // ---------- Dirección de movimiento de la tira (Motion Direction Control de iClone) ----------
  const mdOpts = { to: 'prev', translate: true, rotate: true };
  function motionDirection(s) {
    const root = s.root || { x: 0, y: 0, z: 0, yaw: 0 };
    const field = (key, label, step) => {
      const i = h('input', { type: 'number', step, value: +(root[key] || 0).toFixed(3), style: { width: '62px' } });
      i.onchange = () => {
        app.pushUndo();
        s.root = { x: 0, y: 0, z: 0, yaw: 0, ...(s.root || {}), [key]: +i.value || 0 };
        app.changed();
      };
      return h('label', {}, label, ' ', i);
    };
    const radio = (v, label) => {
      const i = h('input', { type: 'radio', name: 'mdTo' });
      i.checked = mdOpts.to === v;
      i.onchange = () => (mdOpts.to = v);
      return h('label', {}, i, ' ', label);
    };
    const cb = (key, label) => {
      const i = h('input', { type: 'checkbox' });
      i.checked = mdOpts[key];
      i.onchange = () => (mdOpts[key] = i.checked);
      return h('label', {}, i, ' ', label);
    };
    return h('div', { class: 'md-box', style: { marginTop: '8px', border: '1px solid #3a404c', borderRadius: '6px', padding: '6px' } },
      h('h3', { style: { margin: '0 0 4px' } }, 'Dirección de movimiento'),
      h('div', { class: 'small muted' }, 'Gira y coloca el clip para que continúe donde acaba el anterior (o acabe donde empieza el siguiente).'),
      h('div', { class: 'row small' }, 'Alinear con:', radio('prev', 'Clip anterior'), radio('next', 'Clip siguiente')),
      h('div', { class: 'row small' }, 'Parte: Raíz', cb('translate', 'Trasladar'), cb('rotate', 'Rotar')),
      h('div', { class: 'row small' }, field('x', 'X', 0.01), field('y', 'Y', 0.01), field('z', 'Z', 0.01)),
      h('div', { class: 'row small' }, field('yaw', 'Giro Y°', 1)),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', title: 'Calcula el giro y el desplazamiento de la raíz', onclick: () => {
          app.pushUndo();
          const r = app.engine.alignStrip(s.id, mdOpts);
          if (!r) return app.toast(mdOpts.to === 'next' ? 'No hay clip siguiente en la fila Base' : 'No hay clip anterior en la fila Base', true);
          app.changed();
          P.refreshStrip();
        } }, 'Alinear'),
        h('button', { class: 'btn sm', title: 'Vuelve a como estaba antes del último Alinear', onclick: () => {
          app.pushUndo();
          app.engine.revertStripAlign(s.id);
          app.changed();
          P.refreshStrip();
        } }, 'Revertir'),
      ),
    );
  }

  // ---------- Tira seleccionada ----------
  P.refreshStrip = () => {
    const el = $('#spTira');
    el.innerHTML = '';
    const s = app.engine.doc.strips.find((x) => x.id === app.selStrip);
    if (!s) {
      el.append(h('div', { class: 'muted' }, 'Pulsa una tira en la línea de tiempo (fila Base) para ver sus opciones. Arrastra clips de la biblioteca a esa fila para encadenarlos.'));
      return;
    }
    const c = app.library.get(s.clipId);
    let warp0 = s.warp ? s.warp.slice() : null;
    const num = (key, label, step = 1, min = 0) => {
      const i = h('input', { type: 'number', value: s[key], step, min, style: { width: '70px' } });
      i.onchange = () => {
        app.pushUndo();
        s[key] = +i.value;
        app.changed();
      };
      return h('label', {}, label, ' ', i);
    };
    const chk = (key, label, title = '') => {
      const i = h('input', { type: 'checkbox' });
      i.checked = s[key] === undefined ? key === 'lockX' || key === 'lockZ' : !!s[key];
      i.onchange = () => {
        app.pushUndo();
        s[key] = i.checked;
        app.changed();
      };
      return h('label', { title }, i, ' ', label);
    };
    el.append(
      h('h3', {}, 'Tira'),
      h('div', { style: { fontWeight: 700, marginBottom: '6px' } }, c ? c.name : s.clipId),
      h('div', { class: 'row' }, num('start', 'Inicio'), num('len', 'Duración')),
      h('div', { class: 'row' }, num('speed', 'Velocidad', 0.05, 0.05), num('blend', 'Fundido', 1)),
      h('div', { class: 'row' }, chk('loop', 'Repetir'), chk('mirror', 'Espejo', 'Intercambia izquierda y derecha'), chk('reverse', 'Al revés'), chk('mute', 'Silenciar')),
      h('h3', { style: { marginTop: '8px' } }, 'En el sitio'),
      h('div', { class: 'row' }, chk('inPlace', 'Activo'), chk('lockX', 'Lateral'), chk('lockZ', 'Avance'), chk('lockY', 'Altura')),
      h('h3', { style: { marginTop: '8px' } }, 'Curva de tiempo'),
      easingEditor({ value: s.warp || null, allowNone: true, w: 150, hgt: 90, title: 'Reparte la velocidad dentro de la tira: mismo principio y mismo final, pero arrancando lento, frenando al llegar…',
        onInput: (v) => {
          s.warp = v;
          app.engine.evaluate(app.engine.frame);
        },
        onCommit: (v) => {
          if (warp0) s.warp = warp0;
          else delete s.warp;
          app.pushUndo();
          if (v) s.warp = v;
          else delete s.warp;
          warp0 = s.warp ? s.warp.slice() : null;
          app.changed(false);
        } }),
      h('div', { class: 'small muted' }, s.warp ? 'La tira ya no va a velocidad uniforme.' : 'Velocidad uniforme.'),
      c && c.travel > 0.05 ? h('div', { class: 'small muted' }, `El clip avanza ${(c.travel * app.rig.hipsHeight).toFixed(2)} m`) : h('div', { class: 'small muted' }, 'Este clip ya va en el sitio'),
      motionDirection(s),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'btn sm', onclick: () => {
          app.pushUndo();
          s.len = c ? Math.round(c.frames / (s.speed || 1)) : s.len;
          app.changed();
        } }, 'Duración del clip'),
        h('button', { class: 'btn sm', onclick: () => {
          app.pushUndo();
          const n = { ...s, id: uid('s'), start: s.start + s.len };
          app.engine.doc.strips.push(n);
          app.selStrip = n.id;
          app.changed();
        } }, 'Duplicar'),
        h('button', { class: 'btn sm', onclick: () => {
          app.pushUndo();
          app.engine.doc.strips = app.engine.doc.strips.filter((x) => x !== s);
          app.selStrip = null;
          app.changed();
        } }, 'Quitar'),
      ),
    );
  };

  // ---------- Capas ----------
  P.refreshLayers = () => {
    const el = $('#pLayers');
    el.innerHTML = '';
    const eng = app.engine;
    const d = eng.doc;
    const active = eng.layer();
    const add = h('button', { class: 'btn sm', title: 'Nueva capa encima de la elegida: lo próximo con clave va ahí', onclick: () => {
      app.pushUndo();
      const i = d.layers.indexOf(active);
      const l = newLayer(uid('capa'), `Capa ${d.layers.length}`);
      d.layers.splice(i + 1, 0, l);
      d.activeLayer = l.id;
      app.changed();
    } }, '+ CAPA');
    const move = (dir) => {
      const i = d.layers.indexOf(active);
      const j = i + dir;
      if (active.id === 'base' || j < 1 || j >= d.layers.length) return;
      app.pushUndo();
      [d.layers[i], d.layers[j]] = [d.layers[j], d.layers[i]];
      app.changed();
    };
    el.append(h('div', { class: 'row' }, h('h3', { style: { margin: 0, flex: 1 } }, 'Capas'), add, h('button', { class: 'btn sm', title: 'Subir', onclick: () => move(1) }, '▲'), h('button', { class: 'btn sm', title: 'Bajar', onclick: () => move(-1) }, '▼')));
    const flag = (l, key, label, title) =>
      h('span', { class: `f ${(key === 'mode' ? l.mode === 'add' : l[key]) ? 'on' : ''}`, title, onclick: (e) => {
        e.stopPropagation();
        if (l.id === 'base' && key === 'mode') return app.toast('Base siempre es aditiva');
        app.pushUndo();
        if (key === 'mode') l.mode = l.mode === 'add' ? 'over' : 'add';
        else l[key] = !l[key];
        app.changed();
      } }, label);
    for (const l of [...d.layers].reverse()) {
      const nKeys = Object.values(l.tracks).reduce((a, k) => a + k.length, 0);
      el.append(
        h('div', { class: `lrow ${l === active ? 'on' : ''}`, onclick: () => app.setActiveLayer(l.id), ondblclick: () => app.renameLayer(l.id), title: `${Object.keys(l.tracks).length} pistas, ${nKeys} claves` },
          h('span', { class: 'ln' }, l.name, h('span', { class: 'muted small' }, ` · ${nKeys}◆`)),
          flag(l, 'mode', 'A', 'Aditiva (encendido) / Sustituye (apagado)'),
          flag(l, 'mute', 'M', 'Silenciar: se guarda pero no suena'),
          flag(l, 'solo', 'S', 'Solo: las demás capas callan'),
          flag(l, 'lock', 'L', 'Bloquear: no acepta claves, pero suena'),
        ),
      );
    }
    el.append(h('div', { class: 'locked' }, 'La animación · bloqueada'));
    el.append(h('div', { class: 'small muted', style: { margin: '4px 0' } }, `Las claves van a «${active.name}». + CAPA pone una encima.`));
    const w = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: active.weight, disabled: active.id === 'base' });
    const wo = h('output', {}, `${Math.round(active.weight * 100)}%`);
    w.onpointerdown = () => app.pushUndo();
    w.oninput = () => {
      active.weight = +w.value;
      wo.textContent = `${Math.round(active.weight * 100)}%`;
      app.engine.evaluate(app.engine.frame);
    };
    w.onchange = () => app.changed(false);
    const keyW = h('button', { class: 'btn sm', title: 'Clave del peso aquí: el peso sigue sus claves', disabled: active.id === 'base', onclick: () => {
      app.pushUndo();
      setKey(active, 'w:', app.engine.frame, [active.weight, 0, 0]);
      app.changed();
    } }, '◆');
    el.append(h('div', { class: 'slider' }, h('span', {}, 'Peso'), w, wo, keyW));
    const mask = h('select', { title: 'Máscara: qué partes del cuerpo toca esta capa' }, h('option', { value: '' }, 'Máscara: todo el cuerpo'), GROUPS.map((g) => h('option', { value: g.id }, `Solo ${g.label}`)), h('option', { value: '_custom' }, 'Personalizada… (Preparar › Máscara)'));
    mask.value = active.mask ? (active.mask.length === 1 ? active.mask[0] : '_custom') : '';
    mask.onchange = () => {
      app.pushUndo();
      if (mask.value === '') active.mask = null;
      else if (mask.value === '_custom') {
        openLeft('preparar');
        openSetup('mascara');
        P.refreshSetup();
        return;
      } else active.mask = [mask.value];
      app.changed();
    };
    el.append(h('div', { class: 'row' }, mask));
    const ib = (label, title, fn, dis = false) => h('button', { class: 'btn sm', title, onclick: fn, disabled: dis }, label);
    el.append(
      h('div', { class: 'iconbar' },
        ib('⤓ Fusionar abajo', 'Funde esta capa con la de debajo', () => {
          app.pushUndo();
          app.engine.mergeDown(active.id);
          app.changed();
        }, active.id === 'base'),
        ib('⧉ Duplicar', 'Copia de la capa y sus claves, encima', () => {
          app.pushUndo();
          const c = JSON.parse(JSON.stringify(active));
          c.id = uid('capa');
          c.name = `${active.name} copia`;
          d.layers.splice(d.layers.indexOf(active) + 1, 0, c);
          d.activeLayer = c.id;
          app.changed();
        }),
        ib('↺ A la base aquí', 'En este fotograma, devuelve a la animación original todo lo que esta capa toca', () => {
          app.pushUndo();
          const f = Math.round(app.engine.frame);
          for (const [id, keys] of Object.entries(active.tracks)) {
            if (id === 'w:') continue;
            const ident = id.startsWith('r:') || id.endsWith(':rot') ? [0, 0, 0, 1] : [0, 0, 0];
            if (active.mode === 'add') setKey(active, id, f, ident);
          }
          app.changed();
        }),
        ib('▤ Aplanar todo', 'Todas las capas a Base, fotograma a fotograma', () => {
          if (!confirm('¿Aplanar todas las capas en Base? (se puede deshacer)')) return;
          app.pushUndo();
          app.engine.flatten();
          app.changed();
        }),
        ib('✕ Borrar', 'Borrar la capa', () => {
          app.pushUndo();
          d.layers = d.layers.filter((x) => x !== active);
          d.activeLayer = d.layers[d.layers.length - 1].id;
          app.changed();
        }, active.id === 'base'),
      ),
    );
  };

  // ---------- Preparar ----------
  P.refreshSetup = () => {
    refreshCharacterPane();
    refreshImport();
    P.refreshProjects();
    refreshPicker();
    refreshMask();
    refreshSet();
    refreshCamera();
  };

  function refreshCharacterPane() {
    const el = $('#spPersonaje');
    el.innerHTML = '';
    const rig = app.rig;
    if (!rig) return;
    const mapped = Object.keys(rig.mapping).length;
    el.append(
      h('h3', {}, 'Personaje'),
      h('div', { style: { fontWeight: 700 } }, app.charMeta.name),
      h('div', { class: 'small muted' }, `${conventionLabel(rig.convention)} · ${rig.bones.length} huesos · ${mapped}/${CANON_IDS.length} reconocidos · altura de cadera ${rig.hipsHeight.toFixed(2)} m`),
      rig.humanoid ? null : h('div', { style: { color: 'var(--R)' } }, 'No hay esqueleto humanoide reconocido: los clips no se aplicarán hasta mapearlo.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => mappingModal() }, 'Editar mapeo de huesos'),
      ),
      h('h3', { style: { marginTop: '12px' } }, 'Cambiar de personaje'),
      charList(true),
      h('div', { class: 'row' }, h('button', { class: 'btn acc sm', onclick: () => pickFiles('.glb,.gltf,.fbx').then((f) => app.importFiles(f, 'char')) }, 'Importar personaje (GLB/FBX con esqueleto)')),
      h('div', { class: 'small muted' }, 'Sus huesos se emparejan con los del sistema (Mixamo, AccuRig/Reallusion, Unreal/Quaternius, Rigify, VRM o genérico) y las descargas salen sobre su propio esqueleto. Se guarda en este navegador.'),
    );
  }

  function charList(compact = false) {
    const box = h('div', { class: `cards ${compact ? 'list' : ''}` });
    for (const c of app.characters) {
      const on = c.id === app.charMeta.id;
      box.append(
        h('div', { class: `card ${on ? 'on' : ''}`, title: 'Doble clic: ponérselo', ondblclick: () => app.wearCharacter(c.id), onclick: () => compact && app.wearCharacter(c.id) },
          h('div', { style: { width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', background: '#2a2e36' } }, c.kind === 'builtin' ? '🧍' : c.kind === 'url' ? '🧍‍♂️' : '👤'),
          h('div', {}, h('div', { class: 'cn' }, c.name), h('div', { class: 'cm' }, on ? 'Puesto ahora' : c.kind === 'builtin' ? 'Incluido' : c.kind === 'url' ? 'Biblioteca' : 'Tuyo (navegador)')),
          c.kind === 'idb' ? h('button', { class: 'del', title: 'Borrar de este navegador', onclick: async (e) => {
            e.stopPropagation();
            if (!confirm(`¿Borrar «${c.name}» de este navegador?`)) return;
            await db.del('characters', c.id);
            app.characters = app.characters.filter((x) => x !== c);
            P.refreshCharacters();
          } }, '✕') : null,
        ),
      );
    }
    return box;
  }
  P.refreshCharacters = () => {
    refreshCharacterPane();
    const el = $('#spChars');
    el.innerHTML = '';
    el.append(h('h3', {}, 'Personajes'), charList(false), h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => pickFiles('.glb,.gltf,.fbx').then((f) => app.importFiles(f, 'char')) }, 'Importar personaje')));
  };

  function mappingModal() {
    const rig = app.rig;
    const names = rig.bones.map((b) => b.name);
    const draft = { ...rig.mapping };
    const rows = CANON_IDS.map((c) => {
      const s = h('select', {}, h('option', { value: '' }, '—'), names.map((n) => h('option', { value: n }, n)));
      s.value = draft[c] || '';
      s.onchange = () => (s.value ? (draft[c] = s.value) : delete draft[c]);
      return h('tr', {}, h('td', {}, canonLabel(c)), h('td', {}, s));
    });
    app.modal(
      h('div', {},
        h('h2', {}, 'Mapeo de huesos'),
        h('p', { class: 'small muted' }, 'Qué hueso de tu personaje hace de cada hueso del sistema. Se recuerda para este personaje.'),
        h('table', { class: 'maptable' }, rows),
        h('div', { class: 'row', style: { marginTop: '10px' } },
          h('button', { class: 'btn acc', onclick: () => {
            setPrefs(`map:${app.charMeta.id}`, draft);
            rig.setMapping(draft);
            app.viewport.buildHandles();
            app.closeModal();
            app.changed();
            P.refreshAll();
          } }, 'Aplicar'),
          h('button', { class: 'btn', onclick: () => {
            setPrefs(`map:${app.charMeta.id}`, null);
            app.closeModal();
            app.wearCharacter(app.charMeta.id);
          } }, 'Detectar de nuevo'),
          h('button', { class: 'btn', onclick: () => app.closeModal() }, 'Cancelar'),
        ),
      ),
    );
  }

  function refreshImport() {
    const el = $('#spImportar');
    el.innerHTML = '';
    el.append(
      h('h3', {}, 'Importar animación'),
      h('div', { class: 'small muted' }, 'FBX o GLB sobre nuestro esqueleto, Mixamo, AccuRig/ActorCore (Reallusion), Unreal (UE4/UE5), Rigify o VRM. Se lee aquí y solo se guarda la animación, nunca el personaje.'),
      h('div', { class: 'row' }, h('button', { class: 'btn acc', onclick: () => pickFiles('.glb,.gltf,.fbx,.json').then((f) => app.importFiles(f, 'anim')) }, 'Elegir archivos…')),
      h('div', { class: 'small muted' }, 'El movimiento por el suelo queda en la cadera: «En el sitio» (en la tira) lo quita sin perder saltos ni balanceo.'),
      h('h3', { style: { marginTop: '12px' } }, 'Importar personaje'),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => pickFiles('.glb,.gltf,.fbx').then((f) => app.importFiles(f, 'char')) }, 'Personaje con esqueleto…')),
      h('div', { class: 'small muted' }, 'También puedes soltar los archivos sobre el visor.'),
      h('h3', { style: { marginTop: '12px' } }, 'Carpetas de la biblioteca'),
      h('div', { class: 'small muted' }, 'La app lee en su sitio lo que haya en taller-animacion/biblioteca/ y en las carpetas de biblioteca/rutas.json (ahora: biblioteca/paquetes). Cada paquete sale como librería aparte.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => app.scanLibrary() }, 'Volver a leer'),
        h('button', { class: 'btn sm', onclick: async () => {
          for (const c of await db.all('cache')) await db.del('cache', c.id);
          app.toast('Caché vaciada: se reconvertirá todo');
          app.scanLibrary();
        } }, 'Reconvertir todo'),
      ),
    );
  }

  P.refreshProjects = async () => {
    const el = $('#spProyectos');
    el.innerHTML = '';
    el.append(
      h('h3', {}, 'Proyecto'),
      h('div', { style: { fontWeight: 700 } }, app.projectName),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => app.newProject() }, 'Nuevo'),
        h('button', { class: 'btn sm', onclick: () => pickFiles('.json').then((f) => app.importFiles(f)) }, 'Abrir… (Ctrl+O)'),
        h('button', { class: 'btn sm acc', onclick: () => app.saveProject() }, 'Guardar (Ctrl+S)'),
        h('button', { class: 'btn sm', onclick: () => app.saveProject(true) }, 'Guardar como…'),
      ),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => app.downloadProject() }, 'Descargar archivo'),
        h('button', { class: 'btn sm', onclick: () => app.copyLink() }, 'Copiar enlace'),
      ),
      h('h3', { style: { marginTop: '10px' } }, 'En este navegador'),
    );
    const list = (await db.all('projects')).filter((p) => !String(p.id).startsWith('studio:')).sort((a, b) => b.date - a.date);
    for (const p of list) {
      el.append(
        h('div', { class: 'row', style: { justifyContent: 'space-between' } },
          h('a', { href: '#', onclick: (e) => (e.preventDefault(), app.openProject(p)) }, p.id === 'auto' ? '↺ Recuperar (autoguardado)' : p.name),
          h('span', { class: 'small muted' }, new Date(p.date).toLocaleString()),
          p.id !== 'auto' ? h('button', { class: 'btn sm', onclick: async () => {
            if (!confirm(`¿Borrar el proyecto «${p.name}»?`)) return;
            await db.del('projects', p.id);
            P.refreshProjects();
          } }, '✕') : null,
        ),
      );
    }
  };

  // ---------- Selector (cuerpo y mano) ----------
  let pickerView = 'body';
  function refreshPicker() {
    const el = $('#spSelector');
    el.innerHTML = '';
    el.className = 'subpane picker';
    const rig = app.rig;
    if (!rig) return;
    el.append(
      h('h3', {}, 'Selector'),
      h('div', { class: 'row' },
        ...[['body', 'Cuerpo'], ['handL', 'Mano izq.'], ['handR', 'Mano der.']].map(([v, l]) => h('button', { class: `btn sm ${pickerView === v ? 'on' : ''}`, onclick: () => {
          pickerView = v;
          refreshPicker();
        } }, l)),
      ),
    );
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    const sel = app.selection;
    const dot = (x, y, r, canon, extra = null) => {
      const b = canon && rig.bone(canon);
      const c = document.createElementNS(NS, extra ? 'rect' : 'circle');
      if (extra) {
        c.setAttribute('x', x - r);
        c.setAttribute('y', y - r);
        c.setAttribute('width', r * 2);
        c.setAttribute('height', r * 2);
      } else {
        c.setAttribute('cx', x);
        c.setAttribute('cy', y);
        c.setAttribute('r', r);
      }
      const side = canon ? (canon.endsWith('L') ? '#4aa8ff' : canon.endsWith('R') && canon !== 'upperChest' ? '#ff5a6e' : '#ffc23d') : '#3dffb0';
      const isSel = extra ? sel && sel.chain === extra.chain && sel.kind === extra.kind : sel && sel.kind === 'bone' && sel.bone === b;
      c.setAttribute('fill', isSel ? '#fff' : (extra || b) ? side : '#444');
      c.setAttribute('stroke', '#000');
      c.setAttribute('opacity', (extra && !app.engine.doc.ik[extra.chain]) ? 0.35 : 1);
      const t = document.createElementNS(NS, 'title');
      t.textContent = extra ? `${extra.kind === 'ik' ? 'IK' : 'Polo'} ${IK_CHAINS[extra.chain].label}` : canonLabel(canon);
      c.append(t);
      c.addEventListener('click', (e) => {
        if (extra) {
          if (!app.engine.doc.ik[extra.chain]) app.setIK(extra.chain, true);
          app.select(extra);
        } else if (b) app.select({ kind: 'bone', bone: b });
        refreshPicker();
      });
      svg.append(c);
    };
    if (pickerView === 'body') {
      svg.setAttribute('viewBox', '0 0 200 362');
      const sil = document.createElementNS(NS, 'path');
      sil.setAttribute('d', 'M100 18 a16 18 0 1 1 0.1 0 M78 60 h44 l40 6 l10 70 h-8 l-12 -60 l-12 4 v60 l8 120 h-18 l-12 -110 h-4 l-12 110 h-18 l8 -120 v-60 l-12 -4 l-12 60 h-8 l10 -70 z');
      sil.setAttribute('fill', '#2a2e36');
      sil.setAttribute('stroke', '#3a404c');
      svg.append(sil);
      // el personaje mira hacia ti: su izquierda está a tu derecha
      dot(100, 22, 9, 'head');
      dot(100, 50, 5, 'neck');
      dot(100, 74, 8, 'upperChest');
      dot(100, 92, 8, 'chest');
      dot(100, 110, 8, 'spine');
      dot(100, 132, 10, 'hips');
      for (const [s, x] of [['L', 1], ['R', -1]]) {
        dot(100 + x * 16, 64, 5, `shoulder${s}`);
        dot(100 + x * 32, 70, 6, `upperArm${s}`);
        dot(100 + x * 50, 102, 6, `lowerArm${s}`);
        dot(100 + x * 62, 134, 6, `hand${s}`);
        dot(100 + x * 76, 150, 6, null, { kind: 'ik', chain: `hand${s}` });
        dot(100 + x * 66, 100, 4, null, { kind: 'pole', chain: `hand${s}` });
        dot(100 + x * 16, 150, 7, `upperLeg${s}`);
        dot(100 + x * 18, 210, 6, `lowerLeg${s}`);
        dot(100 + x * 20, 270, 6, `foot${s}`);
        dot(100 + x * 22, 288, 4, `toes${s}`);
        dot(100 + x * 36, 278, 6, null, { kind: 'ik', chain: `foot${s}` });
        dot(100 + x * 30, 206, 4, null, { kind: 'pole', chain: `foot${s}` });
      }
      // Interruptores IK/FK junto a cada miembro (como el selector del Control Rig).
      const ikfk = (x, y, chain) => {
        const on = !!app.engine.doc.ik[chain];
        const t = document.createElementNS(NS, 'text');
        Object.entries({ x, y, 'font-size': 9, 'text-anchor': 'middle', fill: on ? '#3dffb0' : '#8a93a3', style: 'cursor:pointer;font-weight:600' }).forEach(([k, v]) => t.setAttribute(k, v));
        t.textContent = on ? 'IK' : 'FK';
        const tt = document.createElementNS(NS, 'title');
        tt.textContent = `${IK_CHAINS[chain].label}: ${on ? 'IK (pulsa para FK)' : 'FK (pulsa para IK)'}`;
        t.append(tt);
        t.addEventListener('click', () => {
          app.setIK(chain, !on);
          refreshPicker();
        });
        svg.append(t);
      };
      ikfk(186, 128, 'handL'); ikfk(14, 128, 'handR'); ikfk(150, 246, 'footL'); ikfk(50, 246, 'footR');
      // Cuadrícula de dedos de las dos manos (columnas = dedos, filas = falanges).
      const lab = document.createElementNS(NS, 'text');
      Object.entries({ x: 100, y: 312, 'font-size': 9, 'text-anchor': 'middle', fill: '#8a93a3' }).forEach(([k, v]) => lab.setAttribute(k, v));
      lab.textContent = 'Dedos';
      svg.append(lab);
      const order = ['little', 'ring', 'middle', 'index', 'thumb'];
      for (const [s, x0] of [['R', 22], ['L', 118]]) {
        const fs = s === 'L' ? [...order].reverse() : order;
        fs.forEach((f, i) => { for (let n = 1; n <= 3; n++) dot(x0 + i * 13, 322 + (3 - n) * 12, 4.5, `${f}${n}${s}`); });
      }
    } else {
      const s = pickerView === 'handL' ? 'L' : 'R';
      svg.setAttribute('viewBox', '0 0 200 220');
      const palm = document.createElementNS(NS, 'rect');
      Object.entries({ x: 55, y: 110, width: 90, height: 90, rx: 18, fill: '#2a2e36', stroke: '#3a404c' }).forEach(([k, v]) => palm.setAttribute(k, v));
      svg.append(palm);
      dot(100, 190, 9, `hand${s}`);
      const fx = { thumb: s === 'L' ? 165 : 35, index: s === 'L' ? 128 : 72, middle: 100, ring: s === 'L' ? 72 : 128, little: s === 'L' ? 48 : 152 };
      for (const [f, x] of Object.entries(fx)) {
        for (let n = 1; n <= 3; n++) {
          const y = f === 'thumb' ? 150 - n * 22 : 100 - (n - 1) * 30;
          const xx = f === 'thumb' ? x + (s === 'L' ? -1 : 1) * n * 6 : x;
          dot(xx, y, 7, `${f}${n}${s}`);
        }
      }
    }
    el.append(svg, h('div', { class: 'small muted' }, 'Azul: lado izquierdo del personaje · rojo: derecho · verde: IK (al pulsarlo se enciende).'));
    if (pickerView !== 'body') {
      // Deslizadores de dedos: cerrar toda la mano, cada dedo y abrir (spread). Cada cambio guarda clave.
      const s = pickerView === 'handL' ? 'L' : 'R';
      const st = app.fingerState?.[s] || { thumb: 0, index: 0, middle: 0, ring: 0, little: 0, spread: 0 };
      // se aplica al soltar (applyPose guarda un paso de deshacer por llamada)
      const slider = (key, label, min, max, val) => h('label', { class: 'row small', style: { gap: '6px', alignItems: 'center' } },
        h('span', { style: { width: '72px' } }, label),
        h('input', { type: 'range', min, max, step: 1, value: val, style: { flex: 1 },
          onchange: (e) => { app.setFingers(s, { [key]: +e.target.value }); refreshPicker(); } }));
      const avg = Math.round((st.index + st.middle + st.ring + st.little) / 4);
      el.append(h('h3', {}, 'Dedos'),
        slider('all', 'Cerrar mano', 0, 90, avg),
        ...[['thumb', 'Pulgar'], ['index', 'Índice'], ['middle', 'Medio'], ['ring', 'Anular'], ['little', 'Meñique']].map(([k, l]) => slider(k, l, 0, 90, st[k])),
        slider('spread', 'Abrir', -10, 20, st.spread));
    }
  }
  P.refreshPicker = refreshPicker;
  P.refreshMotion = buildMotionPanel(app);

  function refreshMask() {
    const el = $('#spMascara');
    el.innerHTML = '';
    const l = app.engine.layer();
    el.append(h('h3', {}, `Máscara de «${l.name}»`), h('div', { class: 'small muted' }, 'Qué partes del cuerpo toca la capa elegida. Todo marcado = sin máscara.'));
    const cur = new Set(l.mask || GROUPS.map((g) => g.id));
    for (const g of GROUPS) {
      const cb = h('input', { type: 'checkbox' });
      cb.checked = cur.has(g.id);
      cb.onchange = () => {
        app.pushUndo();
        if (cb.checked) cur.add(g.id);
        else cur.delete(g.id);
        l.mask = cur.size === GROUPS.length ? null : [...cur];
        app.changed();
      };
      el.append(h('label', { style: { display: 'block', padding: '3px 0' } }, cb, ' ', g.label));
    }
  }

  function refreshSet() {
    const el = $('#spConjunto');
    el.innerHTML = '';
    const set = app.sets.find((s) => s.id === app.activeSet) || app.sets[0];
    const s = h('select', {}, app.sets.map((x) => h('option', { value: x.id }, `${x.name} — ${x.clips.length} animaciones`)));
    s.value = set.id;
    s.onchange = () => {
      app.activeSet = s.value;
      setPrefs('activeSet', s.value);
      refreshSet();
      P.refreshLibrary();
    };
    const name = h('input', { value: set.name, title: 'Nombre del conjunto (y del archivo): letras, cifras y _' });
    name.onchange = () => {
      set.name = slug(name.value) || 'conjunto';
      save();
    };
    const desc = h('input', { value: set.desc || '', placeholder: 'Descripción' });
    desc.onchange = () => {
      set.desc = desc.value;
      save();
    };
    const ip = h('input', { type: 'checkbox' });
    ip.checked = !!set.inPlace;
    ip.onchange = () => {
      set.inPlace = ip.checked;
      save();
    };
    const save = () => {
      setPrefs('sets', app.sets);
      refreshSet();
    };
    el.append(
      h('h3', {}, 'Conjunto para descargar'),
      h('div', { class: 'row' }, s, h('button', { class: 'btn sm', onclick: () => {
        const id = uid('set');
        app.sets.push({ id, name: `set${app.sets.length + 1}`, desc: '', clips: [] });
        app.activeSet = id;
        save();
      } }, '+ Nuevo')),
      h('div', { class: 'row' }, name),
      h('div', { class: 'row' }, desc),
      h('label', {}, ip, ' Todas en el sitio'),
      h('div', { class: 'small muted', style: { margin: '6px 0' } }, `Se escribe sobre: ${app.charMeta.name}. Marca animaciones en la biblioteca (casilla de cada tarjeta).`),
    );
    for (const item of set.clips) {
      const c = app.library.get(item.id);
      const n = h('input', { value: item.name, style: { width: '120px' } });
      n.onchange = () => {
        item.name = slug(n.value);
        save();
      };
      el.append(h('div', { class: 'row' }, h('span', { style: { flex: 1 } }, c ? c.name : `(falta) ${item.id}`), n, h('button', { class: 'btn sm', onclick: () => {
        set.clips = set.clips.filter((x) => x !== item);
        save();
        P.refreshLibrary();
      } }, '✕')));
    }
    el.append(
      h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'btn acc sm', onclick: () => app.downloadSet(false) }, 'Descargar (solo esqueleto)'),
        h('button', { class: 'btn sm', onclick: () => app.downloadSet(true) }, 'Con personaje'),
        app.sets.length > 1 ? h('button', { class: 'btn sm', onclick: () => {
          if (!confirm(`¿Borrar el conjunto ${set.name}? (las animaciones se quedan)`)) return;
          app.sets = app.sets.filter((x) => x !== set);
          app.activeSet = app.sets[0].id;
          save();
        } }, 'Borrar conjunto') : null,
      ),
    );
  }
  P.refreshSet = refreshSet;

  function refreshCamera() {
    if (P.refreshShot) return P.refreshShot();
    const el = $('#spCamara');
    el.innerHTML = '';
    const vp = app.viewport;
    const fov = h('input', { type: 'range', min: 10, max: 90, value: vp.persp.fov });
    const mm = h('output', {}, `${Math.round(18 / Math.tan((vp.persp.fov * Math.PI) / 360))} mm`);
    fov.oninput = () => {
      vp.persp.fov = +fov.value;
      vp.persp.updateProjectionMatrix();
      mm.textContent = `${Math.round(18 / Math.tan((vp.persp.fov * Math.PI) / 360))} mm`;
    };
    const saved = prefs('camara', null);
    el.append(
      h('h3', {}, 'Cámara'),
      h('div', { class: 'slider' }, h('span', {}, 'Ángulo'), fov, mm, h('span')),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => vp.setOrtho(vp.camera !== vp.ortho) }, vp.camera === vp.ortho ? 'Perspectiva' : 'Sin perspectiva'),
        h('button', { class: 'btn sm', onclick: () => {
          setPrefs('camara', { p: vp.camera.position.toArray(), t: vp.orbit.target.toArray(), fov: vp.persp.fov });
          app.toast('Cámara guardada');
          refreshCamera();
        } }, 'Guardar esta vista'),
        saved ? h('button', { class: 'btn sm', onclick: () => {
          vp.camera.position.fromArray(saved.p);
          vp.orbit.target.fromArray(saved.t);
          vp.persp.fov = saved.fov;
          vp.persp.updateProjectionMatrix();
        } }, 'Ir a la vista guardada') : null,
      ),
      h('h3', { style: { marginTop: '10px' } }, 'Fondo'),
      h('div', { class: 'row' },
        ...['#1d2026', '#3b4250', '#d9dde3', '#20302a', '#000000'].map((c) => h('button', { class: 'btn sm', style: { background: c, width: '26px', height: '22px' }, onclick: () => vp.bg.set(c) })),
        h('label', {}, (() => {
          const g = h('input', { type: 'checkbox' });
          g.checked = vp.grid.visible;
          g.onchange = () => (vp.grid.visible = g.checked);
          return g;
        })(), ' Rejilla'),
      ),
      h('div', { class: 'small muted', style: { marginTop: '8px' } }, 'Cámara de plano con encuadre, escenario de referencia (muro, mesa, casa, árboles) y vista cuádruple: fase 2.'),
    );
  }

  // ---------- Biblioteca ----------
  // Descargar de Mixamo: marcador que se arrastra a la barra de marcadores y se pulsa en mixamo.com.
  // Abre la ventana puente del Taller, que envía el descargador (public/mixamo-descargador.js).
  const MIXAMO_CARGADOR = `(()=>{const O='${location.origin.replace('localhost', '127.0.0.1')}';if(!/mixamo\\.com$/.test(location.hostname)){alert('Pulsa este marcador en mixamo.com, con tu sesión iniciada.');return}const w=window.open(O+'/mixamo-puente.html','tallerMixamo','width=480,height=720');if(!w){alert('Permite las ventanas emergentes de mixamo.com y vuelve a pulsar.');return}window.__tallerPuente=w;window.__tallerOrigen=O;if(window.__tallerMixamo){setTimeout(()=>window.__tallerMixamo.conectar(w),1500);return}addEventListener('message',function f(e){if(e.origin===O&&e.source===w&&e.data&&e.data.tipo==='codigo'){removeEventListener('message',f);(0,eval)(e.data.codigo)}})})()`;
  const mixamoBox = () => {
    const nums = h('span', { class: 'small muted' }, '…');
    fetch('/api/mixamo/estado').then((r) => r.json()).then((e) => {
      nums.textContent = `${e.nHechos} descargadas aquí${e.fallos.length ? ` · ${e.fallos.length} con error` : ''}${e.enMarcha ? ' · descargando ahora' : ''}`;
    }).catch(() => (nums.textContent = ''));
    const marcador = h('a', { class: 'btn sm acc', href: `javascript:${encodeURIComponent(MIXAMO_CARGADOR)}`, title: 'Arrástralo a la barra de marcadores del navegador',
      onclick: (e) => {
        e.preventDefault();
        app.toast('Arrastra el botón a la barra de marcadores y púlsalo en mixamo.com');
      } }, '⬇ Taller ← Mixamo');
    const caja = h('details', { class: 'small', ontoggle: () => (state.mixamoOpen = caja.open), style: { margin: '6px 0', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: '4px' } },
      h('summary', { style: { cursor: 'pointer' } }, h('b', {}, 'Descargar de Mixamo'), ' · ', nums),
      h('ol', { style: { margin: '6px 0', paddingLeft: '18px' } },
        h('li', {}, 'Arrastra ', marcador, ' a la barra de marcadores (una vez).'),
        h('li', {}, 'Abre ', h('a', { href: 'https://www.mixamo.com/#/?page=1&type=Motion', target: '_blank', rel: 'noopener', style: { color: 'var(--acc)' } }, 'mixamo.com'), ', entra con tu cuenta y pulsa el marcador.'),
        h('li', {}, 'En la ventanita del Taller, pulsa «Descargar». Cada animación se comprueba y se guarda en biblioteca/mixamo; aparece aquí sola.'),
      ),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: async () => {
          try {
            await navigator.clipboard.writeText(MIXAMO_CARGADOR);
            app.toast('Copiado: pégalo en la consola (F12) de mixamo.com');
          } catch {
            prompt('Copia esto y pégalo en la consola (F12) de mixamo.com:', MIXAMO_CARGADOR);
          }
        } }, 'Copiar para la consola'),
        h('span', { class: 'muted' }, 'Lo ya descargado no se repite; puedes pausar y seguir otro día.'),
      ),
    );
    caja.open = !!state.mixamoOpen;
    return caja;
  };

  P.libProgress = (msg, k) => {
    const el = $('#libInfo');
    if (!el) return;
    el.dataset.progress = msg;
    if (!P._clipShown) el.innerHTML = `<div class="muted small">${msg}</div><div class="progress"><div style="width:${Math.round(k * 100)}%"></div></div>`;
  };

  P.showClipInfo = (c) => {
    P._clipShown = c;
    const el = $('#libInfo');
    el.innerHTML = '';
    el.append(
      h('div', { class: 't' }, c.name),
      h('div', { class: 'small muted' }, `${c.duration.toFixed(2)} s · ${c.frames} f · ${c.fps} fps${c.loop ? ' · bucle' : ''} · ${c.travel > 0.05 ? `avanza ${(c.travel * (app.rig?.hipsHeight || 1)).toFixed(2)} m` : 'en el sitio'}`),
      h('div', { class: 'chips' }, h('span', { class: 'chip' }, categoryLabel(animationCategory(c)))),
      h('div', { class: 'small muted' }, `${packOf(c)}${c.author ? ' · ' + c.author : ''}`),
    );
  };

  const packOf = (c) => (c.mine ? 'Tuyas' : c.source === 'generado' ? 'Generados' : c.pack || 'Otros');

  P.refreshLibrary = () => {
    const tab = $('#libTabs .on')?.dataset.sub;
    if (tab === 'poses') return P.refreshPoses();
    if (tab === 'personajes') return P.refreshCharacters();
    if (tab === 'objetos') return refreshProps();
    if (tab === 'animales') return app.animales?.refresh();
    const el = $('#spAnim');
    el.innerHTML = '';
    const all = [...app.library.values()].filter((c) => c.id !== '__lab');
    const packs =[...new Set(all.map(packOf))].sort((a, b) => (PACK_ORDER.indexOf(a) + 99) % 99 - (PACK_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b));
    if (state.libPack !== ALL_PACKS && !packs.includes(state.libPack)) state.libPack = ALL_PACKS;
    // 1) librería: una a la vez, o «Todas las librerías» para buscar por categoría en todas (cada tarjeta dice su librería)
    const packButton = (p, label, n) => h('button', { class: `library-choice ${p === state.libPack ? 'on' : ''}`, 'aria-pressed': String(p === state.libPack), title: PACK_INFO[p] || label, onclick: () => {
      state.libPack = p;
      setPrefs('libPack', p);
      P.refreshLibrary();
    } }, h('span', {}, label), h('span', { class: 'library-count' }, n));
    const packSel = h('div', { class: 'library-packs' }, packButton(ALL_PACKS, 'Todas las librerías', all.length), packs.map((p) => packButton(p, p, all.filter((c) => packOf(c) === p).length)));
    const inPack = state.libPack === ALL_PACKS ? all : all.filter((c) => packOf(c) === state.libPack);
    const profileButtons = h('div', { class: 'library-profiles', role: 'group', 'aria-label': 'Animaciones masculinas y femeninas' },
      [['', 'Todas'], ...Object.entries(PROFILE_LABELS)].map(([id, label]) => h('button', {
        class: `library-choice ${state.libProfile === id ? 'on' : ''}`, 'aria-pressed': String(state.libProfile === id),
        onclick: () => { state.libProfile = id; setPrefs('libProfile', id); P.refreshLibrary(); },
      }, label, h('span', { class: 'library-count' }, inPack.filter((c) => matchesAnimationProfile(c, id)).length))),
    );
    // 2) categorías › subcategorías (recuentos con el filtro de perfil aplicado)
    const forProfile = inPack.filter((c) => matchesAnimationProfile(c, state.libProfile));
    const tree = new Map();
    for (const c of forProfile) {
      const { cat, sub } = animationCategory(c);
      if (!tree.has(cat)) tree.set(cat, new Map());
      tree.get(cat).set(sub, (tree.get(cat).get(sub) || 0) + 1);
    }
    const catNames = [...tree.keys()].sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 99) % 99 - (CATEGORY_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b, 'es'));
    const pick = (cat, sub) => { state.libCat = cat ? { cat, sub } : null; if (cat) state.libOpen.add(cat); P.refreshLibrary(); };
    const isOn = (cat, sub) => (cat ? state.libCat?.cat === cat && (state.libCat?.sub || null) === (sub || null) : !state.libCat);
    const catSel = h('div', { class: 'library-categories library-tree' },
      h('button', { class: `library-choice ${isOn(null) ? 'on' : ''}`, 'aria-pressed': String(isOn(null)), onclick: () => pick(null) }, h('span', {}, 'Todas las categorías'), h('span', { class: 'library-count' }, forProfile.length)),
      catNames.map((cat) => {
        const subs = [...tree.get(cat).entries()].sort((a, b) => a[0].localeCompare(b[0], 'es'));
        const total = subs.reduce((s, [, n]) => s + n, 0);
        const open = state.libOpen.has(cat) || state.libCat?.cat === cat;
        return h('div', { class: 'library-cat' },
          h('div', { class: 'library-cat-row' },
            h('button', { class: 'library-cat-toggle', 'aria-expanded': String(open), title: open ? 'Plegar' : 'Desplegar', onclick: () => { open ? state.libOpen.delete(cat) : state.libOpen.add(cat); P.refreshLibrary(); } }, open ? '▾' : '▸'),
            h('button', { class: `library-choice ${isOn(cat, null) ? 'on' : ''}`, 'aria-pressed': String(isOn(cat, null)), onclick: () => pick(cat, null) }, h('span', {}, cat), h('span', { class: 'library-count' }, total))),
          open ? h('div', { class: 'library-subs' }, subs.map(([sub, n]) => h('button', { class: `library-choice sub ${isOn(cat, sub) ? 'on' : ''}`, 'aria-pressed': String(isOn(cat, sub)), onclick: () => pick(cat, sub) }, h('span', {}, sub), h('span', { class: 'library-count' }, n)))) : null);
      }),
    );
    const search = h('input', { class: 'search', type: 'search', 'aria-label': 'Buscar animaciones', placeholder: 'Buscar nombre, categoría o etiqueta…', value: state.libSearch });
    search.oninput = () => {
      state.libSearch = search.value;
      clearTimeout(state._t);
      const cursor = search.selectionStart;
      state._t = setTimeout(() => {
        P.refreshLibrary();
        const next = $('#spAnim .search');
        next?.focus();
        next?.setSelectionRange(cursor, cursor);
      }, 250);
    };
    const set = app.sets.find((s) => s.id === app.activeSet) || app.sets[0];
    const viewBtns = h('div', { class: 'row' },
      h('span', { class: 'muted small', style: { flex: 1 } }, 'Vista'),
      h('button', { class: `btn sm ${state.libView === 'grid' ? 'on' : ''}`, onclick: () => ((state.libView = 'grid'), setPrefs('libView', 'grid'), P.refreshLibrary()) }, 'Miniaturas'),
      h('button', { class: `btn sm ${state.libView === 'list' ? 'on' : ''}`, onclick: () => ((state.libView = 'list'), setPrefs('libView', 'list'), P.refreshLibrary()) }, 'Lista'),
    );
    const selectFilter = (label, key, options) => {
      const select = h('select', { 'aria-label': label }, options.map(([value, text]) => h('option', { value }, text)));
      select.value = state[key];
      select.onchange = () => { state[key] = select.value; P.refreshLibrary(); };
      return h('label', {}, h('span', {}, label), select);
    };
    const filters = h('div', { class: 'library-filters' },
      selectFilter('Movimiento', 'libMotion', [['', 'Todos'], ['loop', 'En bucle'], ['once', 'Sin bucle'], ['travel', 'Con desplazamiento'], ['stationary', 'En el sitio']]),
      selectFilter('Duración', 'libDuration', [['', 'Cualquiera'], ['short', 'Hasta 2 s'], ['medium', 'Más de 2 a 5 s'], ['long', 'Más de 5 s']]),
      selectFilter('Ordenar', 'libSort', [['name', 'Nombre A–Z'], ['duration', 'Menor duración'], ['durationDesc', 'Mayor duración']]),
    );
    const reset = () => { state.libCat = null; state.libSearch = ''; state.libMotion = ''; state.libDuration = ''; state.libProfile = ''; setPrefs('libProfile', ''); P.refreshLibrary(); };
    const normalize = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const words = normalize(state.libSearch).trim().split(/\s+/).filter(Boolean);
    let list = forProfile.filter((c) => {
      const k = animationCategory(c);
      if (state.libCat && (k.cat !== state.libCat.cat || (state.libCat.sub && k.sub !== state.libCat.sub))) return false;
      if (!words.every((word) => normalize([c.name, k.cat, k.sub, packOf(c), c.ruta || '', ...(c.tags || [])].join(' ').replace(/[_/]+/g, ' ')).includes(word))) return false;
      if (state.libMotion === 'loop' && !c.loop || state.libMotion === 'once' && c.loop) return false;
      if (state.libMotion === 'travel' && !(c.travel > 0.05) || state.libMotion === 'stationary' && c.travel > 0.05) return false;
      if (state.libDuration === 'short' && c.duration > 2 || state.libDuration === 'medium' && (c.duration <= 2 || c.duration > 5) || state.libDuration === 'long' && c.duration <= 5) return false;
      return true;
    });
    list.sort((a, b) => (state.libSort === 'duration' ? a.duration - b.duration : state.libSort === 'durationDesc' ? b.duration - a.duration : 0) || a.name.localeCompare(b.name, 'es', { numeric: true }));
    const cards = h('div', { class: `cards ${state.libView === 'list' ? 'list' : ''}` });
    // Por tandas: solo se crean las primeras tarjetas y llegan más al bajar. Con los mismos filtros
    // (refresco de fondo, clic) se conservan las ya mostradas.
    const firma = JSON.stringify([state.libPack, state.libProfile, state.libCat, state.libSearch, state.libMotion, state.libDuration, state.libSort, state.libView]);
    if (state._libFirma !== firma) { state._libFirma = firma; state.libShown = LIB_BATCH; }
    P._thumbObs?.disconnect();
    P._moreObs?.disconnect();
    // Dibujo de la tarjeta solo cuando se ve (y con sus pistas, que se leen entonces).
    const thumbObs = (P._thumbObs = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) {
        thumbObs.unobserve(e.target);
        app.requestThumb(e.target.dataset.clip, e.target);
      }
    }, { rootMargin: '200px' }) : null);
    const makeCard = (c) => {
      const th = h('canvas', { class: 'th', width: 96, height: 96 });
      th.dataset.clip = c.id;
      const inSet = set.clips.some((x) => x.id === c.id);
      const tick = h('input', { type: 'checkbox', class: 'tick', title: `Marcar para el conjunto ${set.name}` });
      tick.checked = inSet;
      tick.onclick = (e) => e.stopPropagation();
      tick.onchange = () => {
        if (tick.checked) set.clips.push({ id: c.id, name: slug(c.name) });
        else set.clips = set.clips.filter((x) => x.id !== c.id);
        setPrefs('sets', app.sets);
        refreshSet();
      };
      const card = h('div', { class: `card ${app.libSel === c.id ? 'on' : ''}`, draggable: 'true', title: 'Clic: ponerla en escena · arrastrar a la fila Base: encadenarla',
        onclick: () => {
          app.useClip(c.id);
          // Solo cambia la marca de la tarjeta elegida: el panel no se rehace.
          for (const x of cards.querySelectorAll('.card.on')) x.classList.remove('on');
          card.classList.add('on');
        },
        ondragstart: (e) => e.dataTransfer.setData('text/clip', c.id),
        onmouseenter: () => P.showClipInfo(c),
      },
        th,
        h('div', {}, h('div', { class: 'cn' }, c.name), h('div', { class: 'cm' }, `${c.duration.toFixed(2)} s${c.loop ? ' · bucle' : ''}${c.travel > 0.05 ? ' · avanza' : ''}`), h('div', { class: 'library-tags' }, categoryLabel(animationCategory(c))), h('div', { class: 'library-profile-label' }, `${animationProfileLabel(c)}${state.libPack === ALL_PACKS ? ' · ' + packOf(c) : ''}`)),
        tick,
        c.mine ? h('button', { class: 'del', title: 'Borrar', onclick: (e) => {
          e.stopPropagation();
          if (confirm(`¿Borrar «${c.name}» de Tuyas?`)) app.deleteMine(c.id);
        } }, '✕') : null,
      );
      if (thumbObs) thumbObs.observe(th);
      else app.requestThumb(c.id, th);
      return card;
    };
    const showMore = () => {
      const from = cards.querySelectorAll('.card').length;
      const to = Math.min(list.length, Math.max(from + LIB_BATCH, from === 0 ? state.libShown : 0));
      for (let i = from; i < to; i++) cards.insertBefore(makeCard(list[i]), more);
      state.libShown = Math.max(state.libShown, to);
      more.hidden = to >= list.length;
      more.textContent = `Mostrar más (${list.length - to})`;
    };
    const more = h('button', { class: 'btn sm library-more', onclick: () => showMore() });
    cards.append(more);
    showMore();
    // Al acercarse al final de la lista llega la siguiente tanda.
    if ('IntersectionObserver' in window) {
      const moreObs = (P._moreObs = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting) && !more.hidden) showMore(); }, { rootMargin: '300px' }));
      moreObs.observe(more);
    }
    const wide = $('#work').classList.contains('library-wide');
    const expand = h('button', { class: 'btn sm', 'aria-expanded': String(wide), onclick: () => { $('#work').classList.toggle('library-wide'); P.refreshLibrary(); } }, wide ? 'Reducir biblioteca' : 'Ampliar biblioteca');
    const header = h('div', { class: 'library-header' }, h('div', { class: 'row' }, h('strong', { class: 'grow' }, 'Biblioteca de animaciones'), expand), profileButtons, search, filters);
    const nav = h('nav', { class: 'library-nav', 'aria-label': 'Librerías y categorías' }, h('h3', {}, 'Librerías'), packSel, h('h3', {}, 'Categorías'), catSel);
    const results = h('div', { class: 'library-results' }, h('h3', {}, `${state.libPack === ALL_PACKS ? 'Todas las librerías' : state.libPack || 'Sin librerías'}${state.libCat ? ' · ' + state.libCat.cat + (state.libCat.sub ? ' › ' + state.libCat.sub : '') : ''}`), h('div', { class: 'small muted library-source' }, PACK_INFO[state.libPack] || ''), viewBtns,
      h('div', { class: 'row' }, h('span', { class: 'grow', role: 'status' }, `${list.length} de ${inPack.length} animaciones`), h('button', { class: 'btn sm', onclick: reset }, 'Limpiar filtros')),
      h('div', { class: 'small muted library-hint' }, 'Clic para usar · Arrastra a Base para encadenar'), cards);
    if (!list.length) results.append(h('div', { class: 'library-empty' }, 'No hay animaciones con estos filtros.', h('button', { class: 'btn', onclick: reset }, 'Mostrar todas en esta librería')));
    if (state.libPack === 'Mixamo') results.append(mixamoBox());
    el.append(header, h('div', { class: 'library-body' }, nav, results));
  };

  P.refreshPoses = () => {
    const el = $('#spPoses');
    el.innerHTML = '';
    const onlySel = h('input', { type: 'checkbox' });
    onlySel.checked = !!app.poseOnlySelected;
    onlySel.onchange = () => (app.poseOnlySelected = onlySel.checked);
    el.append(h('h3', {}, 'Poses del cuerpo'), h('label', { class: 'small' }, onlySel, ' Solo en los huesos elegidos'));
    const body = h('div', { class: 'cards list' });
    const bodyPoses = [...app.library.values()].filter((c) => (c.tags || []).includes('poses') && c.frames <= 80);
    for (const c of bodyPoses) {
      body.append(h('div', { class: 'card', onclick: () => {
        const pose = { q: {}, hips: null };
        const p = { q: {}, hips: new THREE.Vector3() };
        Promise.all([import('../core/clip.js'), app.ensureClip(c.id)]).then(([{ sampleClip }]) => {
          if (!c.tracks) return;
          sampleClip(c, 0, p);
          pose.q = p.q;
          app.applyPose(pose, { bones: app.poseOnlySelected && app.selection?.kind === 'bone' ? new Set([app.selection.bone]) : null });
        });
      } }, h('div', { style: { width: '44px', textAlign: 'center' } }, '🧍'), h('div', {}, h('div', { class: 'cn' }, c.name), h('div', { class: 'cm' }, packOf(c)))));
    }
    for (const p of app.bodyPoses) {
      body.append(h('div', { class: 'card', onclick: () => {
        const q = Object.fromEntries(Object.entries(p.q).map(([k, v]) => [k, new THREE.Quaternion().fromArray(v)]));
        app.applyPose({ q, hips: new THREE.Vector3().fromArray(p.hips) }, { bones: app.poseOnlySelected && app.selection?.kind === 'bone' ? new Set([app.selection.bone]) : null });
      } }, h('div', { style: { width: '44px', textAlign: 'center' } }, '★'), h('div', {}, h('div', { class: 'cn' }, p.name), h('div', { class: 'cm' }, 'Tuya')), h('button', { class: 'del', onclick: async (e) => {
        e.stopPropagation();
        await db.del('poses', p.id);
        app.bodyPoses = app.bodyPoses.filter((x) => x !== p);
        P.refreshPoses();
      } }, '✕')));
    }
    el.append(body, h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => app.saveBodyPose() }, 'Guardar la pose de este fotograma')));
    // manos
    let side = app._handSide || 'both';
    const amount = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: 1 });
    el.append(
      h('h3', { style: { marginTop: '12px' } }, 'Poses de la mano'),
      h('div', { class: 'row' }, ...[['L', 'Izq.'], ['R', 'Der.'], ['both', 'Ambas']].map(([v, l]) => h('button', { class: `btn sm ${side === v ? 'on' : ''}`, onclick: () => {
        app._handSide = v;
        P.refreshPoses();
      } }, l))),
      h('div', { class: 'slider' }, h('span', {}, 'Cuánto'), amount, h('span'), h('span')),
    );
    const hands = h('div', { class: 'cards list' });
    const allHands = [...app.handPoses.map((x) => ({ ...x, builtin: true })), ...app.savedHands.map((x) => ({ ...x, q: Object.fromEntries(Object.entries(x.q).map(([k, v]) => [k, new THREE.Quaternion().fromArray(v)])) }))];
    for (const hp of allHands) {
      hands.append(h('div', { class: 'card', title: 'Clic: aplicar · Ctrl+clic: su espejo', onclick: (e) => app.applyHandPose(hp, side, +amount.value, e.ctrlKey) },
        h('div', { style: { width: '44px', textAlign: 'center' } }, '✋'), h('div', {}, h('div', { class: 'cn' }, hp.name), h('div', { class: 'cm' }, hp.builtin ? 'Incluida' : 'Tuya'))));
    }
    el.append(hands, h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => app.saveHandPose(side === 'L' ? 'L' : 'R') }, 'Guardar mano de este fotograma')));
  };

  function refreshProps() {
    P.refreshObjects?.();
  }

  // ---------- refrescos globales ----------
  P.refreshDoc = () => {
    P.refreshLayers();
    P.refreshStrip();
    P.refreshAdjust();
    P.refreshRig();
    P.refreshMotion();
    buildTbar();
    if (!$('[data-pane=preparar]').classList.contains('hidden')) {
      refreshMask();
      refreshPicker();
    }
  };
  P.refreshAll = () => {
    buildTools();
    P.refreshOutliner();
    P.refreshTransform();
    P.refreshDoc();
    P.refreshSetup();
    P.refreshCharacters();
    P.refreshLibrary();
  };
  P.selectPack = (p) => {
    state.libPack = p;
    state.libCat = null;
    setPrefs('libPack', p);
    openRight('biblioteca');
    openLib('animaciones');
    P.refreshLibrary();
  };
  P.openSetup = openSetup;
  P.openLeft = openLeft;
  P.openRight = openRight;
  P.openLib = openLib;
  buildExtraPanels(app, P, { sel });
  const _setup = P.refreshSetup;
  P.refreshSetup = () => {
    _setup();
    P.refreshLab?.();
    P.refreshPrefs?.();
  };
  const _origFrame = app.setFrame.bind(app);
  app.setFrame = (f) => {
    _origFrame(f);
    if (P._frameIn && document.activeElement !== P._frameIn) P._frameIn.value = Math.round(f);
  };
  return P;
}

function setKey(layer, id, f, v) {
  const keys = (layer.tracks[id] ||= []);
  const fr = Math.round(f);
  const k = keys.find((x) => x.f === fr);
  if (k) k.v = v;
  else {
    keys.push({ f: fr, v, i: 'smooth' });
    keys.sort((a, b) => a.f - b.f);
  }
}
