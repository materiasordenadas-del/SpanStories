// Paneles de las fases 2 y 3: objetos y escenario, cámara de plano, Motion Lab, preferencias y espacios.
import { h, $, $$, slug } from './dom.js';
import { PROPS, SCENERY } from './stage.js';
import { STYLES, DIRECTIONS, LAB_GROUPS, processClip } from '../core/motionlab.js';
import { pickFiles, prefs, setPrefs } from '../io/storage.js';
import { KEY_DEFAULTS, DOC_DEFAULTS } from '../core/animation.js';

export function buildExtraPanels(app, P, { sel }) {
  // ---------- Objetos y escenario ----------
  P.refreshObjects = () => {
    const el = $('#spProps');
    if (!el) return;
    el.innerHTML = '';
    const st = app.stage;
    let hand = app._propHand || 'R';
    el.append(
      h('h3', {}, 'Objetos para la mano'),
      h('div', { class: 'row' }, ...[['L', 'Mano izq.'], ['R', 'Mano der.']].map(([v, l]) => h('button', { class: `btn sm ${hand === v ? 'on' : ''}`, onclick: () => ((app._propHand = v), P.refreshObjects()) }, l))),
    );
    const cards = h('div', { class: 'cards list' });
    for (const d of PROPS) cards.append(h('div', { class: 'card', title: 'Clic: ponerlo en la mano elegida', onclick: () => st.addProp(d, hand) }, h('div', { style: { width: '44px', textAlign: 'center', fontSize: '20px' } }, '🗡'), h('div', {}, h('div', { class: 'cn' }, d.name), h('div', { class: 'cm' }, 'Hecho aquí, a tamaño real'))));
    el.append(cards, h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => pickFiles('.glb,.gltf,.fbx', false).then(([f]) => f && st.addProp({ id: slug(f.name), name: f.name }, hand, f)) }, 'Objeto propio (GLB/FBX)…')));
    if (st.props.length) {
      el.append(h('h3', { style: { marginTop: '10px' } }, 'En las manos'));
      for (const p of st.props) {
        el.append(h('div', { class: 'row' }, h('a', { href: '#', onclick: (e) => (e.preventDefault(), app.select({ kind: 'prop', prop: p })) }, `${p.name} · ${p.hand === 'L' ? 'izq.' : 'der.'}`), h('button', { class: 'btn sm', onclick: () => st.removeProp(p) }, '✕')));
      }
    }
    // escenario
    const edit = h('input', { type: 'checkbox' });
    edit.checked = st.editPieces;
    edit.onchange = () => (st.editPieces = edit.checked);
    el.append(h('h3', { style: { marginTop: '14px' } }, 'Escenario de referencia'), h('div', { class: 'small muted' }, 'Piezas a tamaño real para animar contra ellas. No se exportan.'), h('label', {}, edit, ' Editar: clic en una pieza para moverla, girarla o escalarla'));
    const sc = h('div', { class: 'cards list' });
    for (const d of SCENERY) sc.append(h('div', { class: 'card', title: d.desc, onclick: () => st.addPiece(d) }, h('div', { style: { width: '44px', textAlign: 'center', fontSize: '20px' } }, '🏠'), h('div', {}, h('div', { class: 'cn' }, d.name), h('div', { class: 'cm' }, d.desc))));
    el.append(sc, h('div', { class: 'row' },
      h('button', { class: 'btn sm', onclick: () => pickFiles('.glb,.gltf,.fbx', false).then(([f]) => f && st.addPieceFile(f)) }, 'Pieza propia…'),
      h('button', { class: 'btn sm', title: 'La escena vista desde arriba para colocar las piezas', onclick: () => app.viewport.viewFrom('top') }, 'Mapa (desde arriba)'),
    ));
    for (const p of st.pieces) el.append(h('div', { class: 'row' }, h('a', { href: '#', onclick: (e) => (e.preventDefault(), (st.editPieces = true), app.select({ kind: 'piece', piece: p })) }, p.name), h('button', { class: 'btn sm', onclick: () => st.removePiece(p) }, '✕')));
  };
  P.refreshScenery = P.refreshObjects;
  P.refreshProps = P.refreshObjects;

  // ---------- Cámara de plano ----------
  P.refreshShot = () => {
    const el = $('#spCamara');
    if (!el) return;
    el.innerHTML = '';
    const st = app.stage;
    const vp = app.viewport;
    const s = vp.shot;
    el.append(h('h3', {}, 'Cámara de plano'));
    if (!s) {
      el.append(h('div', { class: 'small muted' }, 'Una cámara para la escena: mira tu animación desde el ángulo con que se va a ver.'), h('div', { class: 'row' }, h('button', { class: 'btn acc sm', onclick: () => (st.setFromView(), P.refreshShot()) }, 'Crear desde esta vista')));
    } else {
      const chk = (label, get, set, title = '') => {
        const c = h('input', { type: 'checkbox' });
        c.checked = !!get();
        c.onchange = () => (set(c.checked), P.refreshShot(), P.refreshTools());
        return h('label', { title, style: { display: 'block' } }, c, ' ', label);
      };
      const num = (label, value, onch, step = 1, w = '62px') => {
        const i = h('input', { type: 'number', value, step, style: { width: w } });
        i.onchange = () => onch(+i.value);
        return h('label', {}, label, ' ', i);
      };
      el.append(
        h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => (st.setFromView(), P.refreshShot()) }, 'Poner donde miro'), h('button', { class: 'btn sm', onclick: () => (st.lookThrough(!s.lookThrough), P.refreshShot(), P.refreshTools()) }, s.lookThrough ? 'Vista libre' : 'Mirar por la cámara')),
        chk('Mirar por la cámara mueve la cámara', () => s.lookThrough, (v) => st.lookThrough(v)),
        chk('Dibujar la cámara en la escena', () => s.show, (v) => (s.show = v)),
        chk('Mini vista en una esquina', () => s.mini, (v) => (s.mini = v)),
        h('div', { class: 'row' }, num('Focal (mm)', s.focal, (v) => st.setFocal(v)), num('Sensor', s.sensor, (v) => ((s.sensor = v), st.setFocal(s.focal)))),
        h('div', { class: 'row' }, 'Formato', sel([['1.7778', '16:9'], ['2.39', '2.39:1 cine'], ['0.5625', '9:16 vertical'], ['1', '1:1'], ['1.3333', '4:3']], String(+s.aspect.toFixed(4)), (v) => {
          st.setAspect(+v);
          const w = s.res[0];
          s.res = [w, Math.round(w / +v)];
          P.refreshShot();
        })),
        h('div', { class: 'row' }, num('Ancho px', s.res[0], (v) => (s.res[0] = v)), num('Alto px', s.res[1], (v) => (s.res[1] = v))),
        h('div', { class: 'row' }, num('Inclinar°', s.roll, (v) => ((s.roll = v), st.applyRollShift())), num('Desplazar X', s.shift[0], (v) => ((s.shift[0] = v), st.applyRollShift()), 0.01), num('Y', s.shift[1], (v) => ((s.shift[1] = v), st.applyRollShift()), 0.01)),
        h('div', { class: 'row' }, num('Recorte cerca', s.cam.near, (v) => ((s.cam.near = v), s.cam.updateProjectionMatrix()), 0.01), num('lejos', s.cam.far, (v) => ((s.cam.far = v), s.cam.updateProjectionMatrix()))),
        h('h3', { style: { marginTop: '8px' } }, 'Guías'),
        chk('Tercios', () => st.guides.thirds, (v) => (st.guides.thirds = v)),
        chk('Centro', () => st.guides.center, (v) => (st.guides.center = v)),
        chk('Diagonales', () => st.guides.diag, (v) => (st.guides.diag = v)),
        chk('Zonas seguras (acción y títulos)', () => st.guides.safe, (v) => (st.guides.safe = v)),
        h('div', { class: 'slider' }, h('span', {}, 'Oscurecer fuera'), (() => {
          const r = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st.outside });
          r.oninput = () => (st.outside = +r.value);
          return r;
        })(), h('span'), h('span')),
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: () => {
            const url = st.snapshot(s.res[0]);
            const a = document.createElement('a');
            a.href = url;
            a.download = `plano_${Math.round(app.engine.frame)}.png`;
            a.click();
          } }, 'Foto del plano (PNG)'),
          h('button', { class: 'btn sm', onclick: () => {
            vp.scene.remove(s.cam, s.helper);
            vp.shot = null;
            P.refreshShot();
            P.refreshTools();
          } }, 'Quitar cámara'),
        ),
      );
    }
    // vista libre
    el.append(
      h('h3', { style: { marginTop: '12px' } }, 'Vista'),
      h('div', { class: 'row' },
        h('button', { class: 'btn sm', onclick: () => vp.setOrtho(vp.camera !== vp.ortho) }, vp.camera === vp.ortho ? 'Con perspectiva' : 'Sin perspectiva'),
        h('button', { class: 'btn sm', onclick: () => app.toggleQuad() }, 'Vista cuádruple'),
      ),
      h('h3', { style: { marginTop: '10px' } }, 'Fondo'),
      h('div', { class: 'row' },
        ...['#1d2026', '#3b4250', '#d9dde3', '#20302a', '#000000'].map((c) => h('button', { class: 'btn sm', style: { background: c, width: '26px', height: '22px' }, onclick: () => vp.bg.set(c) })),
        (() => {
          const g = h('input', { type: 'checkbox' });
          g.checked = vp.grid.visible;
          g.onchange = () => (vp.grid.visible = g.checked);
          return h('label', {}, g, ' Rejilla');
        })(),
      ),
      h('h3', { style: { marginTop: '10px' } }, 'Piel de cebolla'),
      h('div', { class: 'row' }, ...[['onionN', 'Fantasmas', 1], ['onionStep', 'Cada (fot.)', 1]].map(([k, l, step]) => {
        const i = h('input', { type: 'number', min: 1, max: 10, step, value: vp.opts[k], style: { width: '52px' } });
        i.onchange = () => {
          vp.opts[k] = Math.max(1, +i.value);
          vp.updateOnion();
        };
        return h('label', {}, l, ' ', i);
      })),
    );
  };

  // ---------- Motion Lab ----------
  const lab = { clip: null, style: 'ninguno', speed: 1, amp: Object.fromEntries(LAB_GROUPS.map(([g]) => [g, 1])), overlap: 0, smooth: 0, posture: 0, head: 0, chest: 0, bounce: 1, lower: 0, hold: 0, loopFix: 0, direction: 0, strafe: false, mirror: false, reverse: false };
  let labTimer = null;
  function labPreview() {
    clearTimeout(labTimer);
    labTimer = setTimeout(() => {
      const src = app.library.get(lab.clip);
      if (!src) return;
      // Clip de la biblioteca aún sin pistas: se leen y se vuelve a previsualizar.
      if (!src.tracks) return void app.ensureClip(src.id).then((c) => c?.tracks && labPreview());
      const out = processClip(src, lab);
      out.id = '__lab';
      out.name = `${src.name} (Motion Lab)`;
      out.source = 'lab';
      out.pack = '__lab';
      app.library.set('__lab', out);
      const d = app.engine.doc;
      if (!(d.strips.length === 1 && d.strips[0].clipId === '__lab')) app.useClip('__lab', true);
      else {
        d.strips[0].len = out.frames;
        app.changed(false);
      }
    }, 120);
  }
  P.refreshLab = () => {
    const el = $('#spLab');
    if (!el) return;
    el.innerHTML = '';
    if (!lab.clip || !app.library.has(lab.clip)) lab.clip = app.libSel && app.libSel !== '__lab' ? app.libSel : app.engine.doc.strips[0]?.clipId !== '__lab' ? app.engine.doc.strips[0]?.clipId : null;
    const src = lab.clip && app.library.get(lab.clip);
    el.append(
      h('h3', {}, 'Motion Lab'),
      h('div', { class: 'small muted' }, 'Rehace un clip a fondo y guárdalo en Tuyas. Elige el clip en la biblioteca (o pulsa «Usar el de escena»).'),
      h('div', { class: 'row' }, h('b', {}, src ? src.name : 'Sin clip'), h('button', { class: 'btn sm', onclick: () => {
        const id = app.libSel && app.libSel !== '__lab' ? app.libSel : app.engine.doc.strips.find((s) => s.clipId !== '__lab')?.clipId;
        lab.clip = id || lab.clip;
        P.refreshLab();
        labPreview();
      } }, 'Usar el de escena')),
    );
    if (!src) return;
    const slider = (label, key, min, max, step = 1, obj = lab) => {
      const out = h('output', {}, obj[key]);
      const r = h('input', { type: 'range', min, max, step, value: obj[key] });
      r.oninput = () => {
        obj[key] = +r.value;
        out.textContent = r.value;
        labPreview();
      };
      return h('div', { class: 'slider' }, h('span', {}, label), r, out, h('span'));
    };
    el.append(
      h('div', { class: 'row' }, 'Estilo', sel(Object.entries(STYLES).map(([k, v]) => [k, v.label]), lab.style, (v) => ((lab.style = v), labPreview()))),
      slider('Velocidad', 'speed', 0.25, 2.5, 0.05),
      h('h3', { style: { marginTop: '8px' } }, 'Amplitud por zona (1 = igual)'),
      ...LAB_GROUPS.map(([g, l]) => slider(l, g, 0, 2, 0.05, lab.amp)),
      h('h3', { style: { marginTop: '8px' } }, 'Curvas y controles'),
      slider('Solapamiento', 'overlap', 0, 8, 0.5),
      slider('Suavizado', 'smooth', 0, 1, 0.05),
      slider('Postura°', 'posture', -25, 25),
      slider('Pecho°', 'chest', -20, 20),
      slider('Cabeza°', 'head', -30, 30),
      slider('Rebote', 'bounce', 0, 2.5, 0.05),
      slider('Bajar cadera', 'lower', 0, 0.3, 0.01),
      slider('A saltos', 'hold', 0, 6, 1),
      slider('Bucle sin salto', 'loopFix', 0, 20, 1),
      h('h3', { style: { marginTop: '8px' } }, 'Dirección'),
      h('div', { class: 'tiles' }, ...DIRECTIONS.map(([deg, l]) => h('div', { class: `tile ${lab.direction === deg ? 'on' : ''}`, onclick: () => ((lab.direction = deg), P.refreshLab(), labPreview()) }, l))),
      (() => {
        const c = h('input', { type: 'checkbox' });
        c.checked = lab.strafe;
        c.onchange = () => ((lab.strafe = c.checked), labPreview());
        return h('label', {}, c, ' De lado (sigue mirando al frente)');
      })(),
      (() => {
        const c = h('input', { type: 'checkbox' });
        c.checked = lab.mirror;
        c.onchange = () => ((lab.mirror = c.checked), labPreview());
        const c2 = h('input', { type: 'checkbox' });
        c2.checked = lab.reverse;
        c2.onchange = () => ((lab.reverse = c2.checked), labPreview());
        return h('div', { class: 'row' }, h('label', {}, c, ' Espejo'), h('label', {}, c2, ' Al revés'));
      })(),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        h('button', { class: 'btn sm', onclick: () => labPreview() }, 'Ver'),
        h('button', { class: 'btn acc sm', onclick: async () => {
          const name = prompt('Nombre', `${src.name} (${STYLES[lab.style]?.label || 'lab'})`);
          if (!name) return;
          const r = await app.ia.run('motionLab', { clip: lab.clip, estilo: lab.style, velocidad: lab.speed, exagerar: lab.amp, solapamiento: lab.overlap, suavizado: lab.smooth, postura: lab.posture, cabeza: lab.head, pecho: lab.chest, rebote: lab.bounce, bajar: lab.lower, a_saltos: lab.hold, bucle_sin_salto: lab.loopFix, direccion: lab.direction, de_lado: lab.strafe, espejo: lab.mirror, al_reves: lab.reverse, nombre: name });
          app.toast(`Guardado en Tuyas: ${r.nombre}`);
        } }, 'Guardar en Tuyas'),
        h('button', { class: 'btn sm', title: 'Crea las 8 direcciones en Tuyas', onclick: async () => {
          const r = await app.ia.run('ochoDirecciones', { clip: lab.clip, de_lado: lab.strafe });
          app.toast(`${r.clips.length} direcciones en Tuyas`);
        } }, '8 direcciones'),
        h('button', { class: 'btn sm', onclick: () => {
          Object.assign(lab, { style: 'ninguno', speed: 1, overlap: 0, smooth: 0, posture: 0, head: 0, chest: 0, bounce: 1, lower: 0, hold: 0, loopFix: 0, direction: 0, strafe: false, mirror: false, reverse: false });
          for (const k of Object.keys(lab.amp)) lab.amp[k] = 1;
          P.refreshLab();
          labPreview();
        } }, 'Reiniciar'),
      ),
    );
  };
  // al elegir un clip en la biblioteca con el Lab abierto, pasa a ser el del Lab
  const _use = app.useClip.bind(app);
  app.useClip = (id, undoable = true) => {
    _use(id, undoable);
    if (id !== '__lab' && !$('[data-subpane=lab]')?.classList.contains('hidden') && !$('[data-pane=preparar]')?.classList.contains('hidden')) {
      lab.clip = id;
      P.refreshLab();
    }
  };

  // ---------- Preferencias y espacios de trabajo ----------
  P.refreshPrefs = () => {
    const el = $('#spPrefs');
    if (!el) return;
    el.innerHTML = '';
    const pf = prefs('preferencias', { autoKey: true, interp: 'smooth', fps: 30, onion: 2 });
    const save = () => setPrefs('preferencias', pf);
    const ak = h('input', { type: 'checkbox' });
    ak.checked = pf.autoKey;
    ak.onchange = () => {
      pf.autoKey = ak.checked;
      app.autoKey = ak.checked;
      save();
      P.refreshTransport();
    };
    el.append(
      h('h3', {}, 'Preferencias'),
      h('label', { style: { display: 'block' } }, ak, ' Clave automática al empezar'),
      h('div', { class: 'row' }, 'Interpolación de claves nuevas', sel([['auto', 'Automática'], ['smooth', 'Suave'], ['linear', 'Lineal'], ['step', 'Escalón']], pf.interp, (v) => ((pf.interp = v), (KEY_DEFAULTS.interp = v), save()))),
      h('div', { class: 'row' }, 'Fotogramas por segundo', sel([['24', '24'], ['25', '25'], ['30', '30'], ['60', '60']], String(app.engine.doc.fps), (v) => {
        app.pushUndo();
        app.engine.doc.fps = +v;
        pf.fps = +v;
        DOC_DEFAULTS.fps = +v;
        save();
        app.changed();
      })),
      h('h3', { style: { marginTop: '12px' } }, 'Espacios de trabajo'),
      h('div', { class: 'small muted' }, 'Guarda qué paneles se ven y el ancho de las columnas con un nombre.'),
    );
    const spaces = prefs('espacios', []);
    for (const s of spaces) {
      el.append(h('div', { class: 'row' },
        h('a', { href: '#', onclick: (e) => (e.preventDefault(), applySpace(s)) }, s.name),
        h('button', { class: 'btn sm', onclick: () => {
          const n = prompt('Nuevo nombre', s.name);
          if (n) {
            s.name = n;
            setPrefs('espacios', spaces);
            P.refreshPrefs();
            buildWsButtons();
          }
        } }, '✎'),
        h('button', { class: 'btn sm', onclick: () => {
          setPrefs('espacios', spaces.filter((x) => x !== s));
          P.refreshPrefs();
          buildWsButtons();
        } }, '✕'),
      ));
    }
    el.append(h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => {
      const name = prompt('Nombre del espacio', `Mi espacio ${spaces.length + 1}`);
      if (!name) return;
      spaces.push(captureSpace(name));
      setPrefs('espacios', spaces);
      P.refreshPrefs();
      buildWsButtons();
    } }, '+ Guardar el espacio actual')));
  };
  function captureSpace(name) {
    const cs = getComputedStyle(document.documentElement);
    return {
      name,
      hidden: ['#colLeft', '#colRight', '#timelineWrap', '#pTransform', '#pLayers'].filter((s) => $(s).classList.contains('hidden')),
      leftW: cs.getPropertyValue('--leftW').trim(),
      rightW: cs.getPropertyValue('--rightW').trim(),
      left: $('[data-tabs=left] .on')?.dataset.tab,
      right: $('[data-tabs=right] .on')?.dataset.tab,
      setup: $('#setupTabs .on')?.dataset.sub,
      lib: $('#libTabs .on')?.dataset.sub,
    };
  }
  function applySpace(s) {
    ['#colLeft', '#colRight', '#timelineWrap', '#pTransform', '#pLayers'].forEach((sel) => $(sel).classList.toggle('hidden', s.hidden.includes(sel)));
    if (s.leftW) document.documentElement.style.setProperty('--leftW', s.leftW);
    if (s.rightW) document.documentElement.style.setProperty('--rightW', s.rightW);
    if (s.left) P.openLeft(s.left);
    if (s.right) P.openRight(s.right);
    if (s.setup) P.openSetup(s.setup);
    if (s.lib) P.openLib(s.lib);
    const L = !$('#colLeft').classList.contains('hidden');
    const R = !$('#colRight').classList.contains('hidden');
    $('#work').style.gridTemplateColumns = `${L ? 'var(--leftW) 4px' : '0 0'} 1fr ${R ? '4px var(--rightW)' : '0 0'}`;
    // La rejilla tiene cuatro filas (cabecera, menú, trabajo, línea de tiempo): la calcula P.layout().
    P.layout();
    P.refreshAll();
  }
  function buildWsButtons() {
    $$('#workspaces [data-own]').forEach((b) => b.remove());
    for (const s of prefs('espacios', [])) $('#workspaces').append(h('button', { 'data-own': '1', title: 'Espacio propio', onclick: () => applySpace(s) }, s.name.toUpperCase()));
  }
  buildWsButtons();
  const pf = prefs('preferencias', null);
  if (pf) {
    app.autoKey = pf.autoKey !== false;
    KEY_DEFAULTS.interp = pf.interp || 'smooth';
    // fps y piel de cebolla se guardaban pero no se aplicaban: los documentos nuevos usan estos fps.
    if ([24, 25, 30, 60].includes(+pf.fps)) DOC_DEFAULTS.fps = +pf.fps;
    if (Number.isInteger(pf.onion) && pf.onion >= 1 && pf.onion <= 8 && app.viewport?.opts) app.viewport.opts.onionN = pf.onion;
  }
}
