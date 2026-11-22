// Panel «Editar capa de movimiento» (como Edit Motion Layer de iClone): barra de iconos, pestañas Modo IK / Modo FK /
// Títere directo, escenario negro con el maniquí 3D, puntos de control, candados T/R, palmas para el puño, fila de
// preajustes de pines con IK/FK, barra de claves y los botones Poner clave / Restablecer / Copiar pose / Pegar pose.
// Debajo: Títere directo, Capas de animación, opciones y curvas. La lógica vive en editlayer.js (métodos de la app).
import { h, $ } from './dom.js';
import { IK_CHAINS } from '../core/humanoid.js';
import { bezierEase, easeOf } from '../core/animation.js';
import { prefs, setPrefs } from '../io/storage.js';
import { PIN_PRESETS, pinOf } from './editlayer.js';
import { STAGE_W, STAGE_H, PALM, jointXY as humanoidJointXY, dummyImage } from './dummyrender.js';
import { horseChainLabel, horseControlPoints } from '../core/horse-editor.js';

const HORSE_DIAGRAM = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 352"><g fill="#85898d" stroke="#b0b5ba" stroke-width="3" stroke-linejoin="round"><path d="M109 125 Q162 112 235 126 L271 82 281 55 291 63 299 43 309 65 323 71 343 106 Q339 120 323 115 L302 98 285 143 Q281 170 256 181 L268 270 253 279 245 226 237 181 225 177 230 219 223 268 209 270 214 220 207 174 Q162 191 126 169 L110 218 117 273 103 280 91 218 101 169 Q81 146 109 125Z"/><path d="M126 165 L137 198 155 217 159 265 145 267 140 222 116 196M106 128 Q66 141 73 201 Q49 184 66 150 Q73 120 106 128Z"/></g><text x="200" y="317" text-anchor="middle" fill="#9da4ab" font-family="sans-serif" font-size="12">Patas traseras · Patas delanteras</text></svg>`);

const NS = 'http://www.w3.org/2000/svg';
const LIN = [0.333, 0.333, 0.667, 0.667];
const CURVES = [
  ['Normal', { interp: 'smooth' }, 'Arranca y frena suave. La de siempre.'],
  ['Uniforme', { interp: 'linear' }, 'Velocidad constante, sin acelerar ni frenar (mecánico).'],
  ['Arranca lento', { bezier: [0.55, 0, 1, 0.6] }, 'Empieza despacio y acelera: coger impulso.'],
  ['Frena al llegar', { bezier: [0, 0.4, 0.45, 1] }, 'Sale rápido y se posa despacio: llegar con cuidado.'],
  ['Muy suave', { bezier: [0.7, 0, 0.3, 1] }, 'Mucho reposo al principio y al final, rápido en medio.'],
  ['Toma impulso', { bezier: [0.4, -0.35, 0.6, 1] }, 'Primero va un poco hacia atrás y luego sale (anticipación).'],
  ['Se pasa y vuelve', { bezier: [0.3, 0, 0.4, 1.35] }, 'Llega, se pasa un poco y se asienta (rebote suave).'],
  ['Impulso y rebote', { bezier: [0.5, -0.3, 0.5, 1.3] }, 'Anticipa y además se pasa al llegar: muy vivo.'],
  ['Pausa y salta', { bezier: [0.9, 0, 1, 0.3] }, 'Espera casi todo el tramo y cambia de golpe al final.'],
  ['Escalón', { interp: 'step' }, 'No se mueve hasta la siguiente clave: cambio instantáneo.'],
];

// puntos de control: [hueso canónico, radio, nombre, qué hace]
const JOINTS = [
  ['head', 11, 'Cabeza', 'arrastra: se inclinan cuello y columna'],
  ['neck', 6, 'Cuello', 'arrastra: se dobla la columna'],
  ['upperChest', 9, 'Pecho', 'arrastra: se dobla la columna'],
  ['spine', 8, 'Cintura', 'gira el tronco'],
  ['hips', 11, 'Cadera', 'arrastra: mueve el cuerpo; manos y pies con pin se quedan'],
];
for (const [s, lado] of [['L', 'izq.'], ['R', 'der.']]) {
  JOINTS.push(
    [`shoulder${s}`, 5.5, `Clavícula ${lado}`, 'sube o baja el hombro'],
    [`upperArm${s}`, 8, `Hombro ${lado}`, 'gira el brazo entero'],
    [`lowerArm${s}`, 8, `Codo ${lado}`, 'arrastra: lleva el brazo; la mano va detrás'],
    [`hand${s}`, 9, `Mano ${lado}`, 'arrastra: el brazo la sigue'],
    [`upperLeg${s}`, 8, `Muslo ${lado}`, 'gira la pierna entera'],
    [`lowerLeg${s}`, 8, `Rodilla ${lado}`, 'arrastra: lleva la pierna; el tobillo va detrás'],
    [`foot${s}`, 9, `Pie ${lado}`, 'arrastra: la pierna lo sigue'],
    [`toes${s}`, 5, `Dedos del pie ${lado}`, 'arrastra hacia arriba: de puntillas (el talón sube, los dedos se quedan)'],
  );
}

// ---------- iconos (SVG en línea, 20×20) ----------
const ICON = {
  reset: '<circle cx="9" cy="4" r="2.2"/><path d="M9 7v6M6 9.5h6M9 13l-2.4 5M9 13l2.4 5"/><path class="a" d="M15.5 6.5a4.2 4.2 0 1 1-1.4-2.6M14.4 1.8l-.3 2.3 2.3.2"/>',
  mirror: '<circle cx="5.5" cy="4.5" r="1.8"/><path d="M5.5 7v5.5M3 9l2.5-1 2.5 1M5.5 12.5 4 17M5.5 12.5 7 17"/><circle cx="14.5" cy="4.5" r="1.8"/><path d="M14.5 7v5.5M12 9l2.5-1 2.5 1M14.5 12.5 13 17M14.5 12.5 16 17"/><path class="a" d="M10 2v16" stroke-dasharray="1.6 1.6"/>',
  puppet: '<path class="g" d="M7 18v-6.5l-2.2-2.1a1 1 0 0 1 1.4-1.4L8 9.8V3.6a1 1 0 0 1 2 0V9l.5-5a1 1 0 0 1 2 .1L12 9.3l1.4-4a1 1 0 0 1 1.9.6l-1.6 6.3V18z"/><path class="a" d="M2 3h3M3.5 1.5v3"/>',
  limits: '<path class="g" d="M4 16 10 8l6 3"/><circle class="g" cx="10" cy="8" r="2"/><path class="a" d="M6.2 13.2a5.6 5.6 0 0 1 8.4-2.6" stroke-dasharray="1.5 1.4"/>',
  floor: '<path class="g" d="M5 4v8l-2 3h9l1-2-4-1V4"/><path class="a" d="M1 17.5h18"/>',
  skate: '<path d="M5 3v8l-2 3h9l1-2-4-1V3"/><circle class="a" cx="15" cy="6" r="2.4"/><path class="a" d="M15 8.4V12"/><path d="M1 16.5h18"/>',
  prevKey: '<path d="M4 4v12"/><path class="f" d="m11 6-4 4 4 4 4-4z"/>',
  key: '<path class="f a" d="m10 4 6 6-6 6-6-6z"/>',
  nextKey: '<path d="M16 4v12"/><path class="f" d="m9 6-4 4 4 4 4-4z"/>',
  hold: '<path d="M2 6h16v8H2z"/><path class="a" d="M5 10h10M5 10l2-2M5 10l2 2M15 10l-2-2M15 10l-2 2"/>',
  both: '<circle cx="10" cy="3.6" r="1.8"/><path d="M10 6v6M6 8l4-1 4 1M10 12l-2 5M10 12l2 5"/><circle class="f a" cx="5.5" cy="8.6" r="1.5"/><circle class="f a" cx="14.5" cy="8.6" r="1.5"/>',
  kids: '<circle cx="10" cy="3.6" r="1.8"/><path d="M10 6v6M6 8l4-1 4 1"/><path class="a" d="M10 12l-2 5M10 12l2 5"/><circle class="f a" cx="10" cy="12" r="1.5"/>',
  move: '<path d="M10 2v16M2 10h16M10 2 8 4.5M10 2l2 2.5M10 18l-2-2.5M10 18l2-2.5M2 10l2.5-2M2 10l2.5 2M18 10l-2.5-2M18 10l-2.5 2"/>',
  rotate: '<path d="M16 10a6 6 0 1 1-2-4.5"/><path d="M14.6 2.6 14 5.8l3.1.4"/>',
  more: '<path class="f" d="m5 8 5 5 5-5z"/>',
  dots: '<circle cx="10" cy="4" r="2.2" class="f a"/><circle cx="10" cy="10" r="2.2" class="f"/><circle cx="5" cy="9" r="1.8" class="f a"/><circle cx="15" cy="9" r="1.8" class="f a"/><circle cx="7.5" cy="16" r="1.8" class="f"/><circle cx="12.5" cy="16" r="1.8" class="f"/>',
  lockT: '<rect x="5" y="9" width="10" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/><path class="a" d="M8 12h4M10 12v3.6"/>',
  lockR: '<rect x="5" y="9" width="10" height="8" rx="1.5"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/><path class="a" d="M8.4 15.6v-4h2a1.2 1.2 0 0 1 0 2.4h-2m1.8 0 1.6 1.6"/>',
};
const icon = (name, extra = '') => {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 20 20');
  s.setAttribute('class', `ei ${extra}`);
  s.innerHTML = ICON[name];
  return s;
};
const ibtn = (name, title, onclick, { on = false, green = false, disabled = false } = {}) =>
  h('button', { class: `eib ${on ? 'on' : ''} ${green ? 'green' : ''}`, title, onclick, disabled }, icon(name));

/** Figura pequeña de un preajuste de pines: los miembros con pin en ámbar. */
function presetFigure(chains) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 20 24');
  s.setAttribute('class', 'pf');
  const on = (c) => (chains.includes(c) ? 'p' : '');
  s.innerHTML = `<circle class="b" cx="10" cy="3.4" r="2.4"/><path class="b" d="M7 6.6h6l.8 7H6.2z"/>` +
    `<path class="l ${on('handR')}" d="M7 7 4.2 12.6"/><path class="l ${on('handL')}" d="M13 7l2.8 5.6"/>` +
    `<path class="l ${on('footR')}" d="M8.4 13.6 7.6 21"/><path class="l ${on('footL')}" d="M11.6 13.6 12.4 21"/>` +
    `<circle class="d ${on('handR')}" cx="4" cy="13.4" r="1.5"/><circle class="d ${on('handL')}" cx="16" cy="13.4" r="1.5"/>` +
    `<circle class="d ${on('footR')}" cx="7.4" cy="21.6" r="1.5"/><circle class="d ${on('footL')}" cx="12.6" cy="21.6" r="1.5"/>`;
  return s;
}

const svgEl = (tag, attrs = {}, kids = []) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) e.append(k);
  return e;
};

/** Arrastre vertical con umbral: clic si no se movió, onDrag(dy) mientras se arrastra. */
function dragOrClick(target, { onClick, onStart, onDrag, onEnd }) {
  target.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const y0 = e.clientY;
    const x0 = e.clientX;
    let moved = false;
    let raf = 0;
    let last = 0;
    const mv = (ev) => {
      const dy = ev.clientY - y0;
      if (!moved && Math.hypot(ev.clientX - x0, dy) < 4) return;
      if (!moved) {
        moved = true;
        onStart?.();
      }
      last = dy;
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), onDrag?.(last)));
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      if (raf) cancelAnimationFrame(raf);
      if (moved) {
        onDrag?.(last);
        onEnd?.();
      } else onClick?.();
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  });
}

export function buildMotionPanel(app) {
  let strength = 1;
  const el = $('#pMotion');
  if (!el) return () => {};
  const ui = prefs('emlUI', { more: false, layers: true, curves: false });
  const saveUI = () => setPrefs('emlUI', ui);

  const curveTile = ([name, spec, tip]) => {
    const svg = svgEl('svg', { viewBox: '0 0 44 34' });
    let d = '';
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const y = spec.bezier ? bezierEase(spec.bezier, u) : spec.interp === 'step' ? (u < 1 ? 0 : 1) : easeOf(spec.interp, {}, u);
      d += `${i ? 'L' : 'M'}${(4 + u * 36).toFixed(1)} ${(26 - y * 18).toFixed(1)}`;
    }
    svg.append(svgEl('path', { d, fill: 'none', stroke: '#8ccf3f', 'stroke-width': '1.6' }));
    return h('button', { class: 'curve-tile', title: tip, onclick: () => {
      if (spec.bezier) app.applyCurve({ bezier: spec.bezier.map((x, i) => +(LIN[i] + (x - LIN[i]) * strength).toFixed(3)) });
      else app.applyCurve({ interp: spec.interp });
    } }, svg, h('span', {}, name));
  };

  /** Cadena IK (mano o pie) de lo elegido, si la hay. */
  const selChain = () => {
    const s = app.selection;
    if (!s) return null;
    if (s.chain) return s.chain;
    if (s.kind === 'bone') {
      if (app.rig.kind === 'quadruped') return horseControlPoints(app.rig).find(p => p.bone === s.bone)?.chain || null;
      const c = app.rig.canonOf.get(s.bone);
      return Object.keys(IK_CHAINS).find((k) => IK_CHAINS[k].bones.includes(c) || `toes${k.slice(-1)}` === c && k.startsWith('foot')) || null;
    }
    return null;
  };

  return function refresh() {
    if (!app.rig || !app.engine) return;
    if (app.dragging) return;
    const rig = app.rig;
    const horse = rig.kind === 'quadruped';
    const horsePoints = horse ? horseControlPoints(rig) : [];
    const jointXY = c => horse ? horsePoints.find(p => p.canon === c)?.xy : humanoidJointXY(c);
    const eng = app.engine;
    const sel = app.selection;
    const mode = app.motionMode || (app.tool === 'rotate' ? 'fk' : 'ik');
    const P = app.puppet;
    el.innerHTML = '';

    // ===== barra superior =====
    const top = h('div', { class: 'eml-top' },
      ibtn('reset', 'Pose de reposo: de pie con los brazos relajados, como clave en este fotograma', () => app.resetPose()),
      ibtn('mirror', 'Reflejar la pose: lo del lado izquierdo pasa al derecho y al revés (en este fotograma)', () => {
        app._lastCopy = 'pose';
        app.copyTransforms();
        app.pasteTransforms({ mode: 'mirror' });
      }),
      h('span', { class: 'sp' }),
      ibtn('puppet', 'Títere directo: el ratón lleva la cadera, una mano o un pie en tiempo real', () => {
        app.motionMode = mode === 'puppet' ? 'ik' : 'puppet';
        if (app.motionMode !== 'puppet') app.puppetStop?.(false);
        app.setTool('ik');
        app.panels.refreshMotion?.();
      }, { green: true, on: mode === 'puppet' }),
      ibtn('limits', 'Límites naturales: las articulaciones no pasan de donde llega un cuerpo real', () => {
        app.limits = !app.limits;
        setPrefs('limits', app.limits);
        app.panels.refreshMotion?.();
      }, { green: true, on: !!app.limits }),
      ibtn('floor', 'Los pies no atraviesan el suelo (en toda la animación)', () => {
        app.pushUndo();
        eng.doc.floor = !eng.doc.floor;
        app.changed();
        app.panels.refreshMotion?.();
      }, { green: true, on: !!eng.doc.floor }),
      ibtn('skate', 'Quitar patinaje de pies: deja cada pie clavado mientras está apoyado', () => app.lockFeet(), { green: true }),
      ibtn('dots', 'Controles sobre el personaje: puntos de colores en las articulaciones (como iClone) o aros', () => {
        app.viewport.setControlStyle(app.viewport.ctlStyle === 'aros' ? 'puntos' : 'aros');
        app.panels.refreshMotion?.();
      }, { green: true, on: app.viewport?.ctlStyle !== 'aros' }),
    );

    // ===== pestañas =====
    const tab = (id, label, title, tool) => h('button', { class: `eml-tab ${mode === id ? 'on' : ''}`, title, onclick: () => {
      if (id !== 'puppet') app.puppetStop?.(false);
      app.motionMode = id;
      app.setTool(tool);
      app.panels.refreshMotion?.();
    } }, label);
    const tabs = h('div', { class: 'eml-tabs' },
      tab('ik', 'Modo IK', 'Arrastra una parte del cuerpo y el resto la sigue con lógica (tecla A)', 'ik'),
      tab('fk', 'Modo FK', 'Gira cada articulación sobre sí misma (tecla E)', 'rotate'),
      tab('puppet', 'Títere directo', 'El ratón lleva la cadera, una mano o un pie en tiempo real (vista previa o grabando)', 'ik'),
    );

    // ===== escenario con el muñeco =====
    const curlL = app.fingerState?.L?.index || 0;
    const curlR = app.fingerState?.R?.index || 0;
    const img = h('img', { class: 'eml-dummy', alt: '', draggable: 'false', src: horse ? HORSE_DIAGRAM : dummyImage(curlL, curlR) });
    const svg = svgEl('svg', { viewBox: `0 0 ${STAGE_W} ${STAGE_H}`, class: 'eml-svg' });
    svg.innerHTML = `<defs>
      <radialGradient id="emlJ" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#f2f2f2"/><stop offset=".45" stop-color="#a9a9a9"/><stop offset="1" stop-color="#5a5a5a"/></radialGradient>
      <radialGradient id="emlJh" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#fff6e8"/><stop offset=".45" stop-color="#d8c3a8"/><stop offset="1" stop-color="#7a6650"/></radialGradient>
      <radialGradient id="emlJs" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#f8ffc8"/><stop offset=".45" stop-color="#b9dc35"/><stop offset="1" stop-color="#4f7210"/></radialGradient>
      <radialGradient id="emlE" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#c9ffb0"/><stop offset=".5" stop-color="#39c43a"/><stop offset="1" stop-color="#0f5b14"/></radialGradient>
    </defs>`;
    const chainSel = selChain();
    let selName = '';
    let selTip = '';
    const joints = horse ? horsePoints.map(p => [p.canon, /Hoof|toes/.test(p.canon) ? 5 : 8, p.label, 'Gira o arrastra este punto de control.']) : JOINTS;
    for (const [canon, r, humanName, humanTip] of joints) {
      const chainId = Object.keys(IK_CHAINS).find(c => IK_CHAINS[c].bones.includes(canon));
      const name = humanName;
      const tip = horse && chainId ? 'Selecciona la articulación o el casco para mover, rotar o usar IK/FK.' : humanTip;
      const xy = jointXY(canon);
      const bone = horse ? horsePoints.find(p => p.canon === canon)?.bone : rig.bone(canon);
      if (!xy) continue;
      const chain = Object.keys(IK_CHAINS).find((c) => IK_CHAINS[c].bones[2] === canon);
      const isSel = !!sel && ((sel.kind === 'bone' && sel.bone === bone) || (sel.kind === 'ik' && sel.chain === chain) || (sel.kind === 'pole' && IK_CHAINS[sel.chain].bones[1] === canon) || (sel.kind === 'many' && sel.bones?.includes?.(bone)) || (sel.kind === 'root' && canon === 'hips'));
      if (isSel && !selName) {
        selName = name;
        selTip = tip;
      }
      const g = svgEl('g', { class: `jt ${isSel ? 'sel' : ''} ${bone ? '' : 'off'}`, transform: `translate(${xy[0]} ${xy[1]})` });
      if (isSel) g.append(svgEl('circle', { r: r + 4, class: 'ring' }));
      const hover = svgEl('circle', { r, class: 'ball', fill: isSel ? 'url(#emlJs)' : 'url(#emlJ)' });
      g.append(hover);
      // efector IK activo: punto verde en el centro (como en iClone)
      if (chain && eng.doc.ik[chain]) g.append(svgEl('circle', { r: r * 0.42, class: 'eff', fill: 'url(#emlE)' }));
      g.append(svgEl('title', {}, [document.createTextNode(`${name} — ${tip}`)]));
      if (bone) {
        if (!horse && canon.startsWith('toes')) {
          const side = canon.slice(-1);
          let base = 0;
          dragOrClick(g, {
            onClick: () => app.select({ kind: 'bone', bone }),
            onStart: () => { base = 0; app._tiptoeStart = true; },
            onDrag: (dy) => {
              const deg = Math.max(0, Math.min(60, base - dy * 1.1));
              app.tiptoe(side, deg, { start: !!app._tiptoeStart });
              app._tiptoeStart = false;
            },
            onEnd: () => app.panels.refreshMotion?.(),
          });
        } else g.addEventListener('click', (e) => {
          e.stopPropagation();
          if (chain && mode !== 'fk' && eng.doc.ik[chain]) app.select({ kind: 'ik', chain });
          else app.select({ kind: 'bone', bone });
        });
      }
      svg.append(g);
    }
    // candados de manos y pies, y las letras T/R sobre el punto cuando tienen pin
    const lockAt = { handR: [-1, 'handR'], handL: [1, 'handL'], footR: [-1, 'footR'], footL: [1, 'footL'] };
    for (const [chain, [side, canon]] of Object.entries(lockAt)) {
      const [jx, jy] = jointXY(canon);
      const isHand = chain.startsWith('hand');
      const lx = isHand ? jx + side * 20 : jx + side * 26;
      const ly = isHand ? jy + 22 : jy - 4;
      const pin = pinOf(app.locks[chain]);
      const pinned = (eng.ikState[chain]?.pin || 0) > 0.5;
      const g = svgEl('g', { class: `lk ${pin ? 'on' : ''}`, transform: `translate(${lx} ${ly})` });
      g.innerHTML = `<rect x="-7" y="-9" width="14" height="18" fill="transparent"/>` +
        `<path class="sh" d="${pin ? 'M-3.4 -1V-4a3.4 3.4 0 0 1 6.8 0v3' : 'M-3.4 -1V-4a3.4 3.4 0 0 1 6.8 0v-.6'}"/>` +
        `<rect class="bd" x="-5" y="-1.2" width="10" height="8" rx="1.4"/><circle class="kh" cx="0" cy="2.6" r="1.1"/>`;
      g.append(svgEl('title', {}, [document.createTextNode(`${IK_CHAINS[chain].label}: ${pinned ? 'anclada en el mundo ahora. ' : ''}${pin ? `pin ${pin} — ${pin === 'TR' ? 'posición (T) y giro (R) fijos' : pin === 'T' ? 'solo la posición (T) fija' : 'solo el giro (R) fijo'} al mover el cuerpo` : 'libre: acompaña al cuerpo'} · clic: libre → TR → T → R`)]));
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        app.toggleLock(chain);
      });
      svg.append(g);
      if (pin) {
        const w = pin.length * 7 + 5;
        const by = jy - (isHand ? 20 : 21);
        const b = svgEl('g', { class: 'tr', transform: `translate(${jx} ${by})` });
        b.innerHTML = `<rect x="${-w / 2}" y="-6" width="${w}" height="11" rx="2.5"/><text y="2.6" text-anchor="middle">${pin}</text>`;
        svg.append(b);
      }
    }
    // palmas grandes: punto verde = efector de la mano; arrastrar arriba/abajo abre o cierra el puño
    for (const side of horse ? [] : ['L', 'R']) {
      const [px, py] = PALM[side];
      const chain = `hand${side}`;
      const curl = side === 'L' ? curlL : curlR;
      const isSel = !!sel && sel.kind === 'ik' && sel.chain === chain;
      const g = svgEl('g', { class: `palm ${isSel ? 'sel' : ''}`, transform: `translate(${px} ${py})` });
      g.innerHTML = `<rect x="-38" y="-62" width="76" height="118" rx="10" fill="transparent"/>` +
        (isSel ? '<circle class="ring" r="11"/>' : '') +
        `<circle class="dot" r="6.5" fill="${isSel ? 'url(#emlJs)' : 'url(#emlE)'}"/>`;
      g.append(svgEl('title', {}, [document.createTextNode(`Palma ${side === 'L' ? 'izquierda' : 'derecha'} — clic: elige el efector de la mano · arrastra hacia abajo: cierra el puño, hacia arriba: abre · doble clic: puño / abierta (ahora ${Math.round(curl)}°)`)]));
      let c0 = curl;
      dragOrClick(g, {
        onClick: () => {
          if (!eng.doc.ik[chain]) app.setIK(chain, true, { quiet: true });
          app.select({ kind: 'ik', chain });
        },
        onStart: () => { c0 = curl; },
        onDrag: (dy) => {
          const v = Math.max(-10, Math.min(95, c0 + dy * 1.4));
          app.palm(side, v);
          img.src = dummyImage(side === 'L' ? v : curlL, side === 'R' ? v : curlR);
        },
        onEnd: () => app.panels.refreshMotion?.(),
      });
      g.addEventListener('dblclick', () => app.palm(side, curl > 45 ? 0 : 90));
      svg.append(g);
    }

    // fila de abajo dentro del escenario: pin T / pin R de lo elegido · preajustes · IK / FK
    const pin = chainSel ? pinOf(app.locks[chainSel]) : '';
    const setTR = (letter) => {
      if (!chainSel) return app.toast?.('Elige una mano o un pie', true);
      const has = new Set(pin.split('').filter(Boolean));
      if (has.has(letter)) has.delete(letter);
      else has.add(letter);
      const v = ['T', 'R'].filter((x) => has.has(x)).join('');
      app.setLock(chainSel, v || false);
    };
    const strip = h('div', { class: 'eml-strip' },
      ibtn('lockT', 'Pin T (posición) de la mano o el pie elegido: se queda en su sitio al mover el cuerpo', () => setTR('T'), { on: pin.includes('T'), disabled: !chainSel }),
      ibtn('lockR', 'Pin R (giro) de la mano o el pie elegido: conserva su orientación al mover el cuerpo', () => setTR('R'), { on: pin.includes('R'), disabled: !chainSel }),
      h('span', { class: 'gap' }),
      PIN_PRESETS.map(([id, name, chains]) => {
        const on = ['handL', 'handR', 'footL', 'footR'].every((c) => !!pinOf(app.locks[c]) === chains.includes(c));
        return h('button', { class: `eib pre ${on ? 'on' : ''}`, title: `Preajuste de pines: ${name}`, onclick: () => app.pinPreset(id) }, presetFigure(chains));
      }),
      h('span', { class: 'gap' }),
      h('button', { class: `eml-ikfk ${chainSel && eng.doc.ik[chainSel] ? 'on' : ''}`, disabled: !chainSel, title: 'IK: el efector (mano o pie) manda y el brazo o la pierna lo siguen', onclick: () => chainSel && (app.setIK(chainSel, true), app.panels.refreshMotion?.()) }, 'IK'),
      h('button', { class: `eml-ikfk ${chainSel && !eng.doc.ik[chainSel] ? 'on' : ''}`, disabled: !chainSel, title: 'FK: cada articulación se gira por su cuenta', onclick: () => chainSel && (app.setIK(chainSel, false), app.panels.refreshMotion?.()) }, 'FK'),
    );
    const pt = app.puppetTarget?.();
    const status = mode === 'puppet'
      ? `Títere · ${!pt ? 'elige la cadera, una mano o un pie' : pt.kind === 'hips' ? 'Cadera' : IK_CHAINS[pt.chain].label}${P ? (P.record ? ' · ● grabando' : ' · vista previa') : ''}`
      : sel ? `${selName || 'Selección'}${chainSel ? ` · ${eng.doc.ik[chainSel] ? 'IK' : 'FK'}${pin ? ` · pin ${pin}` : ''}` : ''}` : 'Elige un punto de control';
    const stage = h('div', { class: 'eml-stage', title: '', style: { aspectRatio: `${STAGE_W} / ${STAGE_H}` } },
      img, svg, h('div', { class: 'eml-status', title: selTip }, status), strip);
    stage.addEventListener('click', (e) => {
      if (e.target === svg || e.target === img) app.select?.(null);
    });

    // ===== barra inferior =====
    const bar = h('div', { class: 'eml-bar' },
      ibtn('both', 'Elegir también el lado contrario (simétrico)', () => app.selectBothSides(), { disabled: !sel }),
      ibtn('kids', 'Elegir también todo lo que cuelga de lo elegido', () => app.selectChildren(), { disabled: !sel }),
      h('span', { class: 'sep' }),
      ibtn('prevKey', 'Clave anterior', () => app.jumpKey(-1)),
      ibtn('key', 'Poner clave en este fotograma (K)', () => app.keySelected()),
      ibtn('nextKey', 'Clave siguiente', () => app.jumpKey(1)),
      h('span', { class: 'sep' }),
      ibtn('hold', 'Mantener la edición en toda la tira: lo que cambies queda igual del principio al final del clip', () => {
        app.holdStrip = !app.holdStrip;
        setPrefs('holdStrip', app.holdStrip);
        app.panels.refreshMotion?.();
      }, { on: !!app.holdStrip }),
      h('span', { class: 'sp' }),
      h('button', { class: `eib more ${ui.more ? 'on' : ''}`, title: 'Más opciones', onclick: () => { ui.more = !ui.more; saveUI(); app.panels.refreshMotion?.(); } }, icon('more')),
    );
    const btns = h('div', { class: 'eml-btns' },
      h('button', { title: 'Guarda la pose de lo elegido (o de todo) en este fotograma (K)', onclick: () => app.keySelected() }, 'Poner clave'),
      h('button', { title: 'Restablecer: quita tus cambios de lo elegido (o de todo) y vuelve a la animación original', onclick: () => app.resetSelected() }, 'Restablecer'),
      h('button', { title: 'Copia la pose de este fotograma (Ctrl+C)', onclick: () => ((app._lastCopy = 'pose'), app.copyTransforms()) }, 'Copiar pose'),
      h('button', { title: 'Pega la pose copiada en este fotograma (Ctrl+V)', onclick: () => app.pasteTransforms({ mode: 'local' }) }, 'Pegar pose'),
    );

    const chk = (label, title, get, set) => {
      const i = h('input', { type: 'checkbox' });
      i.checked = !!get();
      i.onchange = () => set(i.checked);
      return h('label', { class: 'echk', title }, i, h('span', {}, label));
    };
    const docFlag = (key, label, title, def = false) => chk(label, title, () => eng.doc[key] ?? def, (v) => {
      app.pushUndo();
      eng.doc[key] = v;
      app.changed();
    });
    const more = ui.more
      ? h('div', { class: 'eml-more' },
        chk('Mantener la edición en toda la tira', 'Una edición queda igual del principio al final de la tira donde está el cabezal', () => app.holdStrip, (v) => { app.holdStrip = v; setPrefs('holdStrip', v); }),
        chk('Límites naturales', 'Las articulaciones no pasan de donde llega un cuerpo real', () => app.limits, (v) => { app.limits = v; setPrefs('limits', v); }),
        docFlag('reach', 'El cuerpo acompaña a la mano', 'Si la mano no llega, el hombro y la columna se inclinan lo justo', true),
        docFlag('collide', 'Los brazos no atraviesan el cuerpo', 'Si un brazo o una mano se meten en el cuerpo, se apartan solos'),
        docFlag('floor', 'Los pies no atraviesan el suelo', 'Los pies nunca bajan del suelo, en toda la animación'),
        h('div', { class: 'erow' },
          h('button', { class: 'ebtn', title: 'Copia la pose reflejada: lo de un lado, en el otro', onclick: () => app.pasteTransforms({ mode: 'mirror' }) }, '⇋ Pegar reflejada'),
          h('button', { class: 'ebtn', title: 'Puño en las dos manos', onclick: () => { app.palm('L', 90); app.palm('R', 90); } }, 'Dos puños'),
          h('button', { class: 'ebtn', title: 'Abre las dos manos', onclick: () => { app.palm('L', 0); app.palm('R', 0); } }, 'Manos abiertas'),
        ),
      )
      : null;

    // ===== Títere directo (como Direct Puppet de iClone) =====
    const radio = (group, value, label, cur, set, disabled) => {
      const i = h('input', { type: 'radio', name: `pp-${group}`, disabled });
      i.checked = cur === value;
      i.onchange = () => set(value);
      return h('label', { class: `erad ${disabled ? 'off' : ''}` }, i, h('span', {}, label));
    };
    const busy = !!P;
    const puppet = mode === 'puppet'
      ? h('div', { class: 'eml-sec' },
        h('div', { class: 'eml-sec-h' }, 'Títere directo'),
        h('div', { class: 'eml-sec-b' },
          h('div', { class: 'pp-grid' },
            h('div', { class: 'pp-col' },
              h('div', { class: 'pp-h' }, 'Ajustes IK'),
              (() => {
                const i = h('input', { type: 'checkbox', disabled: busy });
                i.checked = !!app.puppetMirror;
                i.onchange = () => app.setPuppetOpts({ mirror: i.checked });
                return h('label', { class: 'echk', title: 'La mano o el pie del otro lado hace el mismo movimiento en espejo' }, i, h('span', {}, 'Reflejar'));
              })(),
              (() => {
                const i = h('input', { type: 'checkbox', disabled: busy });
                i.checked = eng.doc.reach ?? true;
                i.onchange = () => { app.pushUndo(); eng.doc.reach = i.checked; app.changed(); };
                return h('label', { class: 'echk', title: 'El hombro y la columna acompañan a la mano cuando no llega (hombro realista)' }, i, h('span', {}, 'Hombro realista'));
              })(),
            ),
            h('div', { class: 'pp-col' },
              h('div', { class: 'pp-h' }, 'Mover'),
              radio('move', 'screen', 'Según la pantalla', app.puppetRot ? null : app.puppetMove, (v) => app.setPuppetOpts({ move: v, rot: null }), busy),
              radio('move', 'horizontal', 'Horizontal', app.puppetRot ? null : app.puppetMove, (v) => app.setPuppetOpts({ move: v, rot: null }), busy),
              radio('move', 'vertical', 'Vertical', app.puppetRot ? null : app.puppetMove, (v) => app.setPuppetOpts({ move: v, rot: null }), busy),
              h('div', { class: 'pp-h' }, 'Girar'),
              radio('rot', 'screen', 'Según la pantalla', app.puppetRot, (v) => app.setPuppetOpts({ rot: v }), busy),
              radio('rot', 'primary', 'Principal', app.puppetRot, (v) => app.setPuppetOpts({ rot: v }), busy),
              radio('rot', 'secondary', 'Secundario', app.puppetRot, (v) => app.setPuppetOpts({ rot: v }), busy),
            ),
          ),
          busy
            ? h('div', { class: 'pp-live' }, h('b', {}, P.record ? 'Grabando…' : 'Vista previa…'), h('span', {}, 'Pulsa Espacio para parar'))
            : h('div', { class: 'erow' },
              h('button', { class: 'ebtn', disabled: !pt, title: 'Vista previa: el ratón sobre el visor lleva el punto elegido en este fotograma (Espacio)', onclick: () => app.puppetStart({ record: false }) }, '👁 Vista previa'),
              h('button', { class: 'ebtn rec', disabled: !pt, title: 'Grabar: reproduce desde aquí y guarda una clave por fotograma con lo que hace el ratón', onclick: () => app.puppetStart({ record: true }) }, '● Grabar'),
            ),
          h('div', { class: 'small emuted' }, busy ? 'Clic en el visor o Esc también paran.' : pt ? 'Pulsa Espacio para la vista previa.' : 'Elige la cadera, una mano o un pie (punto de control) para activar el títere.'),
          h('label', { class: 'erange', title: 'Cuánto se mueve el control por cada centímetro de ratón' },
            h('span', {}, 'Sensibilidad'),
            (() => {
              const s2 = h('input', { type: 'range', min: 0.2, max: 3, step: 0.1, value: app.puppetSens || 1 });
              s2.oninput = () => { app.puppetSens = +s2.value; if (app.puppet) app.puppet.sens = +s2.value; };
              return s2;
            })(),
          ),
        ),
      )
      : null;

    // ===== Capas de animación =====
    const layers = eng.doc.layers;
    const layerSec = h('div', { class: 'eml-sec' },
      h('button', { class: 'eml-sec-h fold', onclick: () => { ui.layers = !ui.layers; saveUI(); app.panels.refreshMotion?.(); } }, h('span', { class: `car ${ui.layers ? 'open' : ''}` }, '▸'), 'Capas de animación'),
      ui.layers
        ? h('div', { class: 'eml-sec-b' },
          h('div', { class: 'eml-layers' },
            [...layers].reverse().map((l) => {
              const cb = h('input', { type: 'checkbox', title: 'Activar / desactivar la capa' });
              cb.checked = !l.mute;
              cb.onchange = () => app.toggleLayer(l.id, cb.checked);
              const n = Object.keys(l.tracks).length;
              return h('div', { class: `eml-layer ${eng.doc.activeLayer === l.id ? 'on' : ''} ${l.mute ? 'mute' : ''}`, title: 'Clic: editar en esta capa · doble clic: cambiar el nombre', onclick: (e) => { if (e.target !== cb) { app.setActiveLayer(l.id); app.panels.refreshMotion?.(); } }, ondblclick: (e) => { if (e.target === cb) return; const nm = prompt('Nombre de la capa', l.name); if (nm && nm.trim()) { app.pushUndo(); l.name = nm.trim(); app.changed(); app.panels.refreshLayers?.(); app.panels.refreshMotion?.(); } } },
                cb, h('span', { class: 'ln' }, l.name), h('span', { class: 'lc' }, n ? `${n} pista${n > 1 ? 's' : ''}` : 'vacía'));
            }),
          ),
          (() => {
            const l = eng.layer();
            const s3 = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: l.weight ?? 1 });
            const o = h('b', {}, `${Math.round((l.weight ?? 1) * 100)}%`);
            s3.onpointerdown = () => app.pushUndo();
            s3.oninput = () => { l.weight = +s3.value; o.textContent = `${Math.round(l.weight * 100)}%`; app.changed(); };
            return h('label', { class: 'erange', title: `Peso de la capa «${l.name}»: cuánto se nota sobre lo de debajo` }, h('span', {}, 'Peso'), s3, o);
          })(),
          h('div', { class: 'erow' },
            h('button', { class: 'ebtn', title: 'Nueva capa con nombre (las ediciones van a la capa activa)', onclick: () => { const nm = prompt('Nombre de la capa', `Capa ${layers.length}`); if (nm) app.addNamedLayer(nm); } }, '+ Capa'),
            h('button', { class: 'ebtn', title: 'Copia las claves de este fotograma (de lo elegido, o todas) en la capa activa', onclick: () => app.copyFrameKeys() }, 'Copiar claves'),
            h('button', { class: 'ebtn', title: 'Pega las claves copiadas en este fotograma', onclick: () => app.pasteFrameKeys() }, 'Pegar claves'),
          ),
        )
        : null,
    );

    // ===== Curvas =====
    const hasKeys = Object.keys(eng.layer().tracks).length;
    const curveSec = h('div', { class: 'eml-sec' },
      h('button', { class: 'eml-sec-h fold', onclick: () => { ui.curves = !ui.curves; saveUI(); app.panels.refreshMotion?.(); } }, h('span', { class: `car ${ui.curves ? 'open' : ''}` }, '▸'), 'Curva de transición'),
      ui.curves
        ? h('div', { class: 'eml-sec-b' },
          h('div', { class: 'small emuted' }, hasKeys ? 'Cómo va de una clave a la siguiente: se aplica al tramo del cabezal (de lo elegido) o a las claves marcadas.' : 'Cuando hayas movido algo en dos momentos, aquí eliges cómo va de uno a otro.'),
          h('div', { class: 'curve-grid' }, CURVES.map(curveTile)),
          h('label', { class: 'erange', title: 'Cuánto se nota la curva: 0 % = uniforme, 100 % = entera' },
            h('span', {}, 'Fuerza'),
            (() => {
              const s = h('input', { type: 'range', min: 0, max: 1.5, step: 0.05, value: strength });
              const o = h('b', {}, `${Math.round(strength * 100)}%`);
              s.oninput = () => { strength = +s.value; o.textContent = `${Math.round(strength * 100)}%`; };
              return [s, o];
            })(),
          ),
        )
        : null,
    );

    el.append(h('div', { class: 'eml' }, top, tabs, stage, bar, btns, more, puppet, layerSec, curveSec));
  };
}
