// Editor de curva de tiempo (Bézier): dos asas que se arrastran, más ajustes hechos.
// Sirve para el tramo que sale de una clave (rotaciones incluidas: curva el avance, no los ángulos) y para la curva de tiempo de una tira.
import { h } from './dom.js';
import { bezierEase, EASE_PRESETS } from '../core/animation.js';

const LINEAR = [0.333, 0.333, 0.667, 0.667];

/**
 * value: [x1, y1, x2, y2] o null (sin curva). onInput(b) mientras se arrastra; onCommit(b | null) al soltar o elegir.
 * allowNone: ofrece «sin curva» (onCommit(null)).
 */
export function easingEditor({ value = null, onInput, onCommit, w = 96, hgt = 64, allowNone = false, title = '' }) {
  let b = (value || LINEAR).slice();
  const cv = h('canvas', { width: w * 2, height: hgt * 2, title: title || 'Arrastra las dos asas: horizontal = cuándo, vertical = cuánto. Por encima o por debajo del marco, el movimiento se pasa o toma impulso.', style: { width: `${w}px`, height: `${hgt}px`, cursor: 'crosshair', borderRadius: '4px', background: '#101216', touchAction: 'none' } });
  const ctx = cv.getContext('2d');
  const pad = 10;
  const yLo = -0.5;
  const yHi = 1.5;
  const X = (x) => (pad + x * (w - 2 * pad)) * 2;
  const Y = (y) => (hgt - pad - ((y - yLo) / (yHi - yLo)) * (hgt - 2 * pad)) * 2;
  const draw = () => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.strokeStyle = '#2b303a';
    ctx.lineWidth = 2;
    ctx.strokeRect(X(0), Y(1), X(1) - X(0), Y(0) - Y(1));
    ctx.strokeStyle = '#59606d';
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo(X(b[0]), Y(b[1]));
    ctx.moveTo(X(1), Y(1));
    ctx.lineTo(X(b[2]), Y(b[3]));
    ctx.stroke();
    ctx.strokeStyle = '#3dffb0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const y = bezierEase(b, u);
      if (i) ctx.lineTo(X(u), Y(y));
      else ctx.moveTo(X(u), Y(y));
    }
    ctx.stroke();
    for (const [x, y, c] of [[b[0], b[1], '#ffc23d'], [b[2], b[3], '#5aa8ff']]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(X(x), Y(y), 7, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  let drag = -1;
  const at = (e) => {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left - pad) / (w - 2 * pad);
    const y = yLo + ((hgt - pad - (e.clientY - r.top)) / (hgt - 2 * pad)) * (yHi - yLo);
    return [Math.min(1, Math.max(0, x)), Math.min(yHi, Math.max(yLo, y))];
  };
  cv.addEventListener('pointerdown', (e) => {
    const [x, y] = at(e);
    const d = (i) => Math.hypot((x - b[i]) * 1.6, y - b[i + 1]);
    drag = d(0) <= d(2) ? 0 : 2;
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag < 0) return;
    const [x, y] = at(e);
    b[drag] = +x.toFixed(3);
    b[drag + 1] = +y.toFixed(3);
    draw();
    onInput?.(b.slice());
  });
  const end = () => {
    if (drag < 0) return;
    drag = -1;
    onCommit?.(b.slice());
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  const presets = h('select', { title: 'Curvas hechas' },
    h('option', { value: '' }, 'Curva…'),
    allowNone ? h('option', { value: 'none' }, 'Sin curva (uniforme)') : null,
    EASE_PRESETS.map(([name], i) => h('option', { value: String(i) }, name)),
  );
  presets.onchange = () => {
    const v = presets.value;
    presets.value = '';
    if (v === 'none') {
      b = LINEAR.slice();
      draw();
      return onCommit?.(null);
    }
    if (v === '') return;
    b = EASE_PRESETS[+v][1].slice();
    draw();
    onCommit?.(b.slice());
  };
  draw();
  return h('div', { class: 'ease-ed', style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } }, cv, presets);
}
