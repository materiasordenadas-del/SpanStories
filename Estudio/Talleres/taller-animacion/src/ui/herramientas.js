// Panel «Herramientas» (menú superior): las funciones del add-on de Blender «Herramientas» (Tal Hershkovich, MIT),
// reimplementadas sobre el motor del Taller. Cada bloque explica en una línea qué hace; nada sustituye ni oculta
// los paneles que ya había (Rig, Transformar, Capas…), que siguen igual.
import { h } from './dom.js';
import { IK_CHAINS } from '../core/humanoid.js';
import { createTempIK, createTempWorld, bakeTemp, cancelTemp, bakeChainToFK } from '../core/edit/temp.js';
import { bakeBones, keyFramesOf } from '../core/edit/bake.js';
import { prepareBlend } from '../core/edit/inbetween.js';
import { copyWorld, copyRelative, pasteMatrix } from '../core/edit/matrix.js';
import { offsetCascade, shareKeys, snapshotTracks, tracksOfBone, tracksOfChain, groupKeys, multikeyScale, multikeyRandom } from '../core/edit/keyops.js';
import { addMarker, removeMarker, retimeMarker, markerLimits } from '../core/edit/retime.js';

const TOL = [['0.3', 'Precisa (0,3°)'], ['0.6', 'Normal (0,6°)'], ['1.5', 'Ligera (1,5°)'], ['every', 'Cada fotograma']];

export function mountHerramientas(app) {
  const el = h('div', { class: 'panel herr', id: 'pHerramientas' });
  const S = { a: null, b: null, tol: '0.6', space: 'world', order: 'sel', scope: 'all', strips: true, clip: null, seed: 1, follow: true, open: new Set(['ikfk', 'temp', 'path']) };
  const eng = () => app.engine;
  const rig = () => app.rig;
  const frame = () => Math.round(eng().frame);
  const btn = (label, title, onclick, cls = '') => h('button', { class: `btn sm ${cls}`, title, onclick }, label);
  const num = (value, oninput, opts = {}) => h('input', { type: 'number', value, step: 1, style: { width: opts.w || '58px' }, ...opts.attrs, onchange: (e) => oninput(+e.target.value) });
  const select = (opts, value, onChange, title = '') => {
    const s = h('select', { title }, opts.map(([v, l]) => h('option', { value: v }, l)));
    s.value = value;
    s.onchange = () => onChange(s.value);
    return s;
  };
  const tolOpts = () => (S.tol === 'every' ? { every: true } : { tolDeg: +S.tol, tolPos: +S.tol * 0.005 });
  const range = () => {
    const [r0, r1] = eng().range();
    const a = S.a ?? r0;
    const b = S.b ?? r1;
    return [Math.max(r0, Math.min(a, b)), Math.min(r1, Math.max(a, b))];
  };
  const done = (msg) => {
    app.changed();
    render();
    if (msg) app.toast(msg);
  };
  const locked = () => {
    if (eng().layer().lock) {
      app.toast('La capa está bloqueada', true);
      return true;
    }
    return false;
  };
  /** Huesos de la selección (para cadenas IK: sus tres huesos; ef: solo el efector). */
  const selBones = ({ ef = false } = {}) => {
    const s = app.selection;
    const r = rig();
    if (!s || !r) return [];
    if (s.kind === 'bone') return app.selectedBones();
    if (s.kind === 'root') return [r.bone('hips')];
    if (s.kind === 'ik' || s.kind === 'pole') {
      const bs = IK_CHAINS[s.chain].bones.map((c) => r.bone(c)).filter(Boolean);
      return ef ? bs.slice(-1) : bs;
    }
    return [];
  };
  const selChain = () => {
    const s = app.selection;
    if (s && (s.kind === 'ik' || s.kind === 'pole')) return s.chain;
    if (s?.kind === 'bone') {
      const c = rig()?.canonOf.get(s.bone);
      for (const [k, d] of Object.entries(IK_CHAINS)) if (d.bones.includes(c)) return k;
    }
    return null;
  };

  const section = (id, title, help, ...body) => {
    const open = S.open.has(id);
    return h('div', { class: `herr-sec ${open ? 'open' : ''}` },
      h('h3', { class: 'herr-h', onclick: () => (open ? S.open.delete(id) : S.open.add(id), render()) }, h('span', { class: 'herr-caret' }, open ? '▾' : '▸'), title),
      open ? h('div', { class: 'herr-body' }, h('p', { class: 'small muted' }, help), ...body) : null);
  };

  // ---------- IK / FK ----------
  function ikfk() {
    const tiles = Object.entries(IK_CHAINS).map(([chain, d]) => {
      const on = !!eng().doc.ik[chain];
      return h('div', { class: `tile ${on ? 'on' : ''}`, title: on ? 'IK: el efector manda. Clic: pasar a FK sin saltos (la pose se hornea a giros)' : 'FK: cada hueso por su cuenta. Clic: pasar a IK sin saltos', onclick: () => (app.setIK(chain, !on), render()) }, `${d.label}: ${on ? 'IK' : 'FK'}`);
    });
    return section('ikfk', 'IK ⇄ FK sin saltos',
      'Cambia un miembro entre IK y FK en el fotograma actual sin que la mano o el pie se muevan (como iClone). La rodilla y el codo solo doblan por su bisagra.',
      h('div', { class: 'tiles' }, ...tiles));
  }

  // ---------- Controles temporales y horneado ----------
  function rangeRow() {
    const [a, b] = range();
    return h('div', { class: 'row small herr-range' },
      h('span', {}, 'Rango'), num(a, (v) => ((S.a = v), render())), h('span', {}, '→'), num(b, (v) => ((S.b = v), render())),
      btn('Todo', 'Todo el rango de la animación', () => ((S.a = S.b = null), render())),
      btn('±15', 'Quince fotogramas antes y después del actual', () => ((S.a = frame() - 15), (S.b = frame() + 15), render())),
      btn('Claves elegidas', 'Del primer al último fotograma con clave elegida en la línea de tiempo', () => {
        const fs = app.rangeFrames();
        if (fs.length) [S.a, S.b] = [fs[0], fs[fs.length - 1]];
        render();
      }));
  }
  function temp() {
    const list = (eng().doc.temp || []).map((t) => h('div', { class: 'md-row herr-temp' },
      h('span', { class: 'md-l' }, `${t.kind === 'ik' ? 'IK' : 'Mundo'} · ${t.label || t.chain || t.bone}`),
      h('span', { class: 'md-f' }, `${t.a}–${t.b} · ${t.keys ?? '?'} claves`),
      btn('Elegir', 'Seleccionar el control', () => {
        if (t.kind === 'ik') app.select({ kind: 'ik', chain: t.chain });
        else app.select({ kind: 'bone', bone: rig().byName.get(t.bone) });
      }),
      btn('🔥 Hornear', 'Pasa lo que se ve a claves FK (solo las necesarias) y quita el control', () => {
        if (locked()) return;
        app.pushUndo();
        const r = bakeTemp(eng(), t.id, tolOpts());
        done(r ? `Horneado: ${r.frames} de ${r.of} fotogramas con clave` : 'No se pudo hornear');
      }, 'acc'),
      btn('✕', 'Cancelar: todo vuelve a como estaba antes de crear el control', () => {
        app.pushUndo();
        cancelTemp(eng(), t.id);
        done('Control temporal cancelado');
      })));
    const chain = selChain();
    return section('temp', 'Controles temporales y horneado',
      'IK temporal: la mano o el pie pasan a ser un objetivo en el mundo durante el rango (mocap incluido); moverlo cambia solo la clave de ese fotograma. Mundo temporal: el hueso conserva su giro de mundo aunque el cuerpo se mueva. Al terminar, «Hornear» lo deja en claves FK.',
      rangeRow(),
      h('div', { class: 'row small' }, h('span', {}, 'Precisión'), select(TOL, S.tol, (v) => (S.tol = v), 'Cuántas claves deja el horneado')),
      h('div', { class: 'row wrap' },
        btn('IK temporal', chain ? `Control IK temporal para ${IK_CHAINS[chain].label}` : 'Elige una mano, un pie, un codo o una rodilla', () => {
          if (!chain) return app.toast('Elige una mano o un pie (o un hueso de su brazo o pierna)', true);
          if (locked()) return;
          app.pushUndo();
          const [a, b] = range();
          const t = createTempIK(eng(), chain, a, b);
          app.select({ kind: 'ik', chain });
          done(t ? `IK temporal en ${IK_CHAINS[chain].label}: ${t.keys} claves en ${a}–${b}. Arrastra la caja verde.` : 'No se pudo crear');
        }, 'acc'),
        btn('Mundo temporal', 'Los huesos elegidos conservan su giro de mundo en el rango (la cadera también su posición)', () => {
          const bs = selBones().filter((b) => !eng().chainOfBone(b));
          if (!bs.length) return app.toast('Elige huesos (cabeza, pecho, cadera, mano en FK…)', true);
          app.pushUndo();
          const [a, b] = range();
          bs.forEach((bone) => createTempWorld(eng(), bone, a, b));
          done(`${bs.length} control(es) en espacio mundo en ${a}–${b}`);
        }),
        btn('Convertir a FK', 'Hornea el IK del miembro elegido a giros FK en el rango (FK temporal: se editan los huesos uno a uno)', () => {
          if (!chain) return app.toast('Elige una mano o un pie', true);
          if (locked()) return;
          app.pushUndo();
          const [a, b] = range();
          const r = bakeChainToFK(eng(), chain, a, b, tolOpts());
          done(`${IK_CHAINS[chain].label} en FK en ${a}–${b}: ${r?.frames ?? 0} claves`);
        }),
        btn('🔥 Hornear lo que se ve', 'Los huesos elegidos guardan como FK lo que se ve (Look At, alcance, IK…) en el rango', () => {
          const bs = selBones();
          if (!bs.length) return app.toast('Elige los huesos que quieres hornear', true);
          if (locked()) return;
          app.pushUndo();
          const [a, b] = range();
          const chains = Object.keys(IK_CHAINS).filter((c) => IK_CHAINS[c].bones.some((x) => bs.includes(rig().bone(x))) && eng().doc.ik[c]);
          // la columna y el hombro también, si el IK los inclinaba para llegar
          const fr = Array.from({ length: b - a + 1 }, (_, i) => a + i);
          for (const c of chains) for (const x of eng().ikBakeBones(c, fr)) if (!bs.includes(x)) bs.push(x);
          const r = bakeBones(eng(), bs, [a, b], { ...tolOpts(), before: () => chains.forEach((c) => (eng().doc.ik[c] = false)) });
          done(`Horneado: ${r.frames} de ${r.of} fotogramas${chains.length ? ' (esos miembros pasan a FK)' : ''}`);
        })),
      list.length ? h('div', { class: 'md-list' }, ...list) : h('p', { class: 'small muted' }, 'No hay controles temporales.'));
  }

  // ---------- Trayectoria ----------
  function path() {
    const pv = app.pathView;
    const o = pv.opts;
    return section('path', 'Trayectoria editable',
      'Dibuja el camino de lo elegido (mano, pie, cadera, cabeza…). Las bolas amarillas son claves: arrástralas en el visor. Mayús: elegir varias; Alt + arrastrar: escalar. Clic: ir a ese fotograma. Atajo: Mayús+P.',
      h('div', { class: 'row wrap' },
        h('div', { class: `tile ${o.on ? 'on' : ''}`, onclick: () => (pv.toggle(), render()) }, o.on ? 'Trayectoria: visible' : 'Trayectoria: oculta'),
        select([['win', 'Alrededor del cabezal'], ['all', 'Todo el rango']], o.mode, (v) => pv.set({ mode: v })),
        o.mode === 'win' ? h('label', { class: 'row small' }, '±', num(o.win, (v) => pv.set({ win: Math.max(5, Math.min(240, v || 30)) }), { w: '50px' })) : null),
      h('label', { class: 'row small', title: 'Al arrastrar una clave, las vecinas hasta ±N fotogramas la acompañan con caída suave (0: solo esa clave)' }, 'Influencia ±', num(o.falloff ?? 6, (v) => pv.set({ falloff: Math.max(0, Math.min(60, v || 0)) }), { w: '50px' }), 'fotogramas'));
  }

  // ---------- Intercalar / mezclar ----------
  function blendSlider(label, mode, min, title) {
    let job = null;
    const input = h('input', { type: 'range', min, max: 1, step: 0.01, value: 0, style: { flex: 1 }, title });
    const out = h('span', { class: 'herr-val' }, '0');
    input.addEventListener('pointerdown', () => {
      const bs = selBones();
      if (!bs.length) return app.toast('Elige primero los huesos (o una mano / un pie)', true);
      if (locked()) return;
      app.pushUndo();
      job = prepareBlend(eng(), bs, frame(), { mode, space: S.space });
    });
    input.addEventListener('input', () => {
      out.textContent = (+input.value).toFixed(2);
      if (!job) return;
      job.apply(+input.value);
      app.evaluate?.();
      app.viewport && app.panels.refreshTransform();
    });
    input.addEventListener('change', () => {
      if (job) app.changed();
      job = null;
      input.value = 0;
      out.textContent = '0';
    });
    return h('label', { class: 'row small herr-slider' }, h('span', { class: 'herr-lab' }, label), input, out);
  }
  function blend() {
    return section('blend', 'Intercalar y mezclar poses',
      'En el fotograma actual y con clave: Intercalar lleva la pose hacia la clave anterior (−1) o la siguiente (+1); Espejo, hacia la pose del otro lado; Base, hacia la animación sin esta capa.',
      h('div', { class: 'row small' }, h('span', {}, 'Espacio'), select([['world', 'Mundo'], ['local', 'Local']], S.space, (v) => (S.space = v))),
      blendSlider('Intercalar', 'inbetween', -1, '−1: clave anterior · 0: como está · 1: clave siguiente'),
      blendSlider('Espejo', 'mirror', 0, '0: como está · 1: la pose del otro lado, reflejada'),
      blendSlider('Base', 'base', 0, '0: como está · 1: la pose sin esta capa'));
  }

  // ---------- Copiar / pegar matriz ----------
  const A = {
    copyWorld() {
      const bs = selBones({ ef: true });
      if (!bs.length) return app.toast('Elige algo que copiar', true);
      S.clip = copyWorld(eng(), bs, frame());
      eng().evaluate(eng().frame);
      render();
      app.toast(`Matriz de mundo copiada: ${bs.length} hueso(s)`);
    },
    pasteWorld(inRange = false) {
      if (S.clip?.kind !== 'world') return app.toast('Copia primero una matriz de mundo', true);
      if (locked()) return;
      app.pushUndo();
      const [a, b] = inRange ? range() : [frame(), frame()];
      pasteMatrix(eng(), S.clip, a, b);
      done(`Pegado en mundo en ${a === b ? `f${a}` : `${a}–${b}`}`);
    },
    copyRelative() {
      const s = app.selection;
      const bs = app.selectedBones();
      const active = s?.kind === 'bone' ? s.bone : null;
      if (!active || bs.length < 2) return app.toast('Elige al menos dos huesos; el último elegido es el activo', true);
      S.clip = copyRelative(eng(), active, bs, frame());
      eng().evaluate(eng().frame);
      render();
      app.toast(`Relación copiada respecto a ${rig().canonOf.get(active) || active.name}`);
    },
    pasteRelative() {
      if (S.clip?.kind !== 'relative') return app.toast('Copia primero una relación', true);
      if (locked()) return;
      app.pushUndo();
      const [a, b] = range();
      const n = pasteMatrix(eng(), S.clip, a, b, tolOpts());
      done(`Relación pegada en ${a}–${b} (${n} claves)`);
    },
  };
  function matrix() {
    const c = S.clip;
    const info = c ? `${c.kind === 'world' ? 'Mundo' : `Relativa a ${rig()?.canonOf.get(rig()?.byName.get(c.active)) || c.active}`} · ${c.items.length} hueso(s) · f${c.f}` : 'Nada copiado';
    return section('matrix', 'Copiar y pegar matriz',
      'Mundo: el hueso vuelve exactamente al mismo sitio y giro del mundo. Relativa: guarda la relación de lo elegido con el hueso activo (el último elegido) y al pegar en un rango la mantiene aunque el activo se mueva (mano en la cadera, en la cabeza…).',
      h('p', { class: 'small' }, info),
      h('div', { class: 'row wrap' },
        btn('Copiar mundo', 'Copia posición y giro de mundo de lo elegido', () => A.copyWorld()),
        btn('Pegar mundo', 'En el fotograma actual (Mayús: en todo el rango de abajo)', (e) => A.pasteWorld(e.shiftKey)),
        btn('Copiar relativa', 'Relación de lo elegido con el activo (selecciona varios: el último es el activo)', () => A.copyRelative()),
        btn('Pegar relativa', 'En el rango de abajo: la relación se mantiene en cada fotograma (claves solo donde hacen falta)', () => A.pasteRelative())),      rangeRow());
  }

  // ---------- Claves ----------
  function keys() {
    let snap = null;
    let groups = null;
    const off = h('input', { type: 'range', min: -12, max: 12, step: 1, value: 0, style: { flex: 1 } });
    const out = h('span', { class: 'herr-val' }, '0');
    off.addEventListener('pointerdown', () => {
      const bs = selBones();
      const layer = eng().layer();
      if (!bs.length) return app.toast('Elige varios huesos (el orden de selección es el orden del desfase)', true);
      if (locked()) return;
      let ordered = bs;
      if (S.order === 'tree') {
        const depth = (b) => {
          let d = 0;
          for (let p = b.parent; p; p = p.parent) d++;
          return d;
        };
        ordered = [...bs].sort((x, y) => depth(x) - depth(y));
      }
      groups = ordered.map((b) => {
        const chain = eng().chainOfBone(b);
        return [...tracksOfBone(layer, b), ...(chain && IK_CHAINS[chain].bones[2] === rig().canonOf.get(b) ? tracksOfChain(layer, chain) : [])];
      }).filter((g) => g.length);
      if (!groups.length) {
        groups = null;
        return app.toast('Esos huesos no tienen claves en la capa activa', true);
      }
      app.pushUndo();
      snap = snapshotTracks(layer, groups.flat());
    });
    off.addEventListener('input', () => {
      out.textContent = off.value;
      if (!groups) return;
      offsetCascade(eng().layer(), groups, +off.value, snap);
      app.evaluate?.();
      app.timeline.draw();
    });
    off.addEventListener('change', () => {
      if (groups) done(`Desfase en cascada: ${off.value} fotograma(s) por hueso`);
      groups = snap = null;
      off.value = 0;
      out.textContent = '0';
    });
    // Multikey: escalar o variar a la vez las claves elegidas (o todas las de los huesos elegidos)
    const mkJob = () => {
      const layer = eng().layer();
      let groups = app.timeline.selKeys?.size ? groupKeys(layer, [...app.timeline.selKeys]) : null;
      if (!groups || !groups.size) {
        const ids = selBones().flatMap((b) => tracksOfBone(layer, b));
        const ch = selChain();
        if (ch) ids.push(...tracksOfChain(layer, ch).filter((id) => /:(pos|rot|pole)$/.test(id)));
        groups = new Map(ids.map((id) => [id, new Set(layer.tracks[id].map((k) => k.f))]));
      }
      return groups.size ? { layer, groups, snap: snapshotTracks(layer, [...groups.keys()]) } : null;
    };
    const mkSlider = (label, min, max, start, title, run) => {
      let job = null;
      const input = h('input', { type: 'range', min, max, step: 0.01, value: start, style: { flex: 1 }, title });
      const out = h('span', { class: 'herr-val' }, String(start));
      input.addEventListener('pointerdown', () => {
        if (locked()) return;
        job = mkJob();
        if (!job) return app.toast('Elige claves en la línea de tiempo, o huesos con claves en la capa activa', true);
        app.pushUndo();
      });
      input.addEventListener('input', () => {
        out.textContent = (+input.value).toFixed(2);
        if (!job) return;
        run(job, +input.value);
        app.evaluate?.();
        app.timeline.draw();
      });
      input.addEventListener('change', () => {
        if (job) done(`Multikey: ${label.toLowerCase()} aplicado`);
        job = null;
        input.value = start;
        out.textContent = String(start);
      });
      return h('label', { class: 'row small herr-slider' }, h('span', { class: 'herr-lab' }, label), input, out);
    };
    const hipsUnit = () => {
      const hb = rig()?.bone('hips');
      const s = hb?.parent ? hb.parent.getWorldScale(hb.position.clone()).x || 1 : 1;
      return (rig()?.hipsHeight || 1) / s;
    };
    const multikey = [
      h('h4', { class: 'herr-sub' }, 'Multikey'),
      h('p', { class: 'small muted' }, 'A la vez, en las claves elegidas (o en todas las de los huesos elegidos): Escalar exagera (>1) o suaviza (<1) el movimiento respecto a su valor neutro; Variar añade un ruido repetible (misma semilla, mismo resultado).'),
      mkSlider('Escalar', 0, 2, 1, '1: sin cambio · 0: al neutro · 2: el doble', (j, v) => multikeyScale(j.layer, j.groups, v, j.snap)),
      mkSlider('Variar', 0, 1, 0, '0: sin cambio · 1: tanto como ya varían', (j, v) => multikeyRandom(j.layer, j.groups, v, j.snap, { seed: S.seed, hips: hipsUnit() })),
      h('div', { class: 'row small' }, h('span', {}, `Semilla ${S.seed}`), btn('🎲 Otra', 'Otra variación', () => ((S.seed = (S.seed % 9973) + 1), render()))),
    ];
    return section('keys', 'Desfase, compartir claves y Multikey',
      'Desfase en cascada: cada hueso elegido se retrasa (o adelanta) un poco más que el anterior: cadera → columna → cabeza (solapamiento). Compartir: todos los huesos elegidos tienen clave en los mismos fotogramas, sin cambiar la curva.',
      h('div', { class: 'row small' }, h('span', {}, 'Orden'), select([['sel', 'El de selección'], ['tree', 'De la raíz a la punta']], S.order, (v) => (S.order = v))),
      h('label', { class: 'row small herr-slider' }, h('span', { class: 'herr-lab' }, 'Desfase'), off, out),
      h('div', { class: 'row wrap' },
        btn('◆ Compartir claves', 'Unir los fotogramas con clave de los huesos elegidos (si hay claves elegidas en la línea de tiempo, solo esos)', () => {
          const bs = selBones();
          const layer = eng().layer();
          const ids = bs.flatMap((b) => tracksOfBone(layer, b));
          const ch = selChain();
          if (ch && eng().doc.ik[ch]) ids.push(...tracksOfChain(layer, ch).filter((id) => !/:(w|absw)$/.test(id)));
          if (ids.length < 2) return app.toast('Elige al menos dos huesos con claves en la capa activa', true);
          if (locked()) return;
          app.pushUndo();
          const sel = app.timeline.selKeys?.size ? new Set(app.rangeFrames()) : null;
          const r = shareKeys(layer, ids, { onlyFrames: sel });
          done(`Compartir claves: ${r.added} clave(s) nuevas en ${r.frames} fotogramas`);
        })),
      ...multikey);
  }

  // ---------- Retimer ----------
  function retimer() {
    const doc = eng().doc;
    const list = (doc.markers || []).map((m) => {
      const [lo, hi] = markerLimits(eng(), m.id);
      return h('div', { class: 'md-row' },
        h('span', { class: 'md-ic' }, '▼'), h('span', { class: 'md-l' }, m.name),
        num(m.f, (v) => {
          if (locked()) return;
          app.pushUndo();
          const r = retimeMarker(eng(), m.id, v, { scope: S.scope, strips: S.strips });
          done(r ? `Retimer: ${m.name} a f${r.to} (${r.moved} claves movidas)` : 'Sin cambios');
        }, { attrs: { min: lo, max: hi, title: `Entre ${lo} y ${hi}: el tiempo entre los marcadores vecinos se estira o se encoge` } }),
        btn('Ir', 'Ir al marcador', () => app.setFrame(m.f)),
        btn('✕', 'Quitar el marcador (no cambia el tiempo)', () => {
          app.pushUndo();
          removeMarker(doc, m.id);
          done();
        }));
    });
    return section('retime', 'Retimer con marcadores',
      'Pon marcadores (tecla M) y arrástralos en la regla de la línea de tiempo (o escribe su fotograma): el tiempo entre sus vecinos se estira o se encoge, sin invertirse nunca. Mueve claves y, si quieres, también la animación de base (mocap).',
      h('div', { class: 'row wrap small' },
        btn('▼ Marcador aquí', 'Añadir un marcador en el fotograma actual (M)', () => {
          app.pushUndo();
          const m = addMarker(doc, frame());
          done(m ? `Marcador ${m.name} en f${m.f}` : 'Ya hay un marcador aquí');
        }, 'acc'),
        select([['all', 'Todas las capas'], ['active', 'Solo la capa activa']], S.scope, (v) => (S.scope = v)),
        h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: S.strips, onchange: (e) => (S.strips = e.target.checked) }), 'También la base (tiras)')),
      list.length ? h('div', { class: 'md-list' }, ...list) : h('p', { class: 'small muted' }, 'Sin marcadores.'));
  }

  // ---------- Pivote temporal relativo ----------
  function pivot() {
    const pv = app.pivotView;
    const names = pv.targets.map((b) => rig().canonOf.get(b) || b.name);
    return section('pivot', 'Pivote temporal',
      'Un punto (esfera turquesa) alrededor del cual giran los huesos elegidos: girar todo el cuerpo sobre la punta de un pie, un brazo alrededor del hombro de otro… Si va pegado a un hueso, lo acompaña en cada fotograma. Mientras está puesto tiene su propio gizmo.',
      h('div', { class: 'row small' }, h('label', { class: 'row small' }, h('input', { type: 'checkbox', checked: S.follow, onchange: (e) => (S.follow = e.target.checked) }), 'Pegado al hueso (relativo)')),
      h('div', { class: 'row wrap' },
        btn('◎ Pivote en lo elegido', 'El pivote va donde está el hueso, la mano o el pie elegido', () => {
          if (!pv.place({ follow: S.follow })) return app.toast('Elige primero dónde poner el pivote', true);
          render();
          app.toast(`Pivote en ${pv.pivotLabel}. Ahora elige qué girar y pulsa «Girar lo elegido».`);
        }, 'acc'),
        btn('Girar lo elegido', 'Los huesos elegidos ahora (la cadera también se traslada; manos y pies en IK, por su objetivo) girarán alrededor del pivote', () => {
          if (!pv.active) return app.toast('Pon primero el pivote', true);
          const bs = selBones({ ef: true });
          if (!bs.length) return app.toast('Elige qué huesos girar (por ejemplo la cadera)', true);
          pv.setTargets(bs);
          pv.setMode('rotate');
          render();
          app.toast(`Gira con los aros turquesa: ${bs.length} hueso(s) alrededor del pivote`);
        }),
        h('div', { class: `tile ${pv.mode === 'rotate' ? 'on' : ''}`, onclick: () => (pv.setMode('rotate'), render()) }, 'Girar'),
        h('div', { class: `tile ${pv.mode === 'translate' ? 'on' : ''}`, onclick: () => (pv.setMode('translate'), render()) }, 'Mover pivote'),
        btn('✕ Quitar', 'Quitar el pivote (vuelve el gizmo normal)', () => (pv.clear(), render()))),
      h('p', { class: 'small' }, pv.active ? `Pivote: ${pv.pivotLabel}${names.length ? ` · gira: ${names.join(', ')}` : ' · falta elegir qué girar'}` : 'Sin pivote.'));
  }

  function render() {
    if (!app.rig) return;
    el.replaceChildren(
      h('p', { class: 'small muted herr-intro' }, 'Herramientas de edición inspiradas en el add-on de Blender «Herramientas» (MIT), hechas para el Taller. Las de los demás menús siguen igual.'),
      ikfk(), temp(), path(), blend(), matrix(), pivot(), keys(), retimer());
  }

  render();
  return { el, render, state: S, actions: A };
}
