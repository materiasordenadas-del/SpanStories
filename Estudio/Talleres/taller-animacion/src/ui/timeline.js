// Línea de tiempo en canvas: regla, tiras (clips de la base) y claves por capa / por pista.
import * as THREE from 'three';
import { canonLabel, IK_CHAINS } from '../core/humanoid.js';
import { sampleTrack, isQuatTrack, bezierOf } from '../core/animation.js';
import { markerLimits, retimeMarker } from '../core/edit/retime.js';

const ROW = { ruler: 24, strips: 38, layer: 22, track: 18 };
const R2D = 180 / Math.PI;

function niceNum(x) {
  const e = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, x))));
  const m = x / e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
}

export class Timeline {
  constructor(el, app) {
    this.app = app;
    this.el = el;
    this.canvas = document.createElement('canvas');
    el.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.view = { start: -2, ppf: 8 }; // píxeles por fotograma
    this.mode = 'strips'; // strips | keys
    this.selKey = null; // {layer, f}
    this.selKeys = new Set(); // "capa|pista|f" (hoja de claves y curvas)
    this.curveView = { min: -180, max: 180, auto: true, normalize: false, hidden: new Set() };
    this.drag = null;
    this.rows = [];
    this.trackQuery = ''; // busqueda de pistas (hoja de claves), como el Sequencer
    this.trackCount = { shown: 0, total: 0 };
    new ResizeObserver(() => this.resize()).observe(el);
    this.canvas.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', () => this.up());
    this.canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.canvas.addEventListener('dblclick', (e) => this.dbl(e));
    this.canvas.addEventListener('contextmenu', (e) => this.openMenu(e));
    this.canvas.addEventListener('pointermove', (e) => this.hover(e));
    this.canvas.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.some((type) => type === 'text/clip' || type === 'application/x-spanstories-animal')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        this.dropHint = this.xToF(this.localX(e));
        this.draw();
      }
    });
    this.canvas.addEventListener('dragleave', () => {
      this.dropHint = null;
      this.draw();
    });
    this.canvas.addEventListener('drop', async (e) => {
      const id = e.dataTransfer.getData('text/clip');
      const animal = e.dataTransfer.getData('application/x-spanstories-animal');
      this.dropHint = null;
      this.draw();
      if (!id && !animal) return;
      e.preventDefault();
      const frame = Math.max(0, Math.round(this.xToF(this.localX(e))));
      try {
        if (animal) await this.app.animales.insertClip(animal, frame);
        else await this.app.insertLibraryStrips(id.split(',').filter(Boolean), frame);
      } catch (error) {
        this.app.toast(error.message, true);
      }
    });
    this.resize();
  }

  localX(e) {
    return e.clientX - this.canvas.getBoundingClientRect().left;
  }
  localY(e) {
    return e.clientY - this.canvas.getBoundingClientRect().top;
  }

  resize() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    this.draw();
  }

  get labelW() {
    return 150;
  }
  fToX(f) {
    return this.labelW + (f - this.view.start) * this.view.ppf;
  }
  xToF(x) {
    return (x - this.labelW) / this.view.ppf + this.view.start;
  }

  fit() {
    const [a, b] = this.app.engine.range();
    const span = Math.max(10, b - a + 4);
    this.view.ppf = Math.max(1, (this.w - this.labelW - 20) / span);
    this.view.start = a - 2;
    this.draw();
  }

  wheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const f = this.xToF(this.localX(e));
      const k = e.deltaY > 0 ? 0.85 : 1.18;
      this.view.ppf = Math.min(80, Math.max(0.5, this.view.ppf * k));
      this.view.start = f - (this.localX(e) - this.labelW) / this.view.ppf;
    } else this.view.start += e.deltaX / this.view.ppf;
    this.draw();
  }

  buildRows() {
    const eng = this.app.engine;
    const rows = [];
    let y = 0;
    rows.push({ kind: 'ruler', y, h: ROW.ruler });
    y += ROW.ruler;
    rows.push({ kind: 'strips', y, h: ROW.strips, label: 'Base', sub: eng.doc.strips.length ? `${eng.doc.strips.length} tira(s)` : 'suelta un clip aquí' });
    y += ROW.strips;
    for (const l of [...eng.doc.layers].reverse()) {
      rows.push({ kind: 'layer', y, h: ROW.layer, layer: l, label: l.name });
      y += ROW.layer;
      if (this.mode === 'keys' && l.id === eng.doc.activeLayer) {
        // Como el Sequencer: todas las pistas y la del control elegido resaltada; «▾ Sel.» deja solo las elegidas.
        const filter = this.app.onlySelected ? this.app.trackFilter() : null;
        const norm = (x) => x.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
        const q = norm(this.trackQuery.trim());
        const ids = Object.keys(l.tracks).sort();
        let shown = 0;
        for (const id of ids) {
          if (filter && !filter(id)) continue;
          const label = this.trackLabel(id);
          if (q && !norm(label).includes(q) && !norm(id).includes(q)) continue;
          rows.push({ kind: 'track', y, h: ROW.track, layer: l, track: id, label, sel: this.trackIsSelected(id) });
          y += ROW.track;
          shown++;
        }
        this.trackCount = { shown, total: ids.length };
      }
    }
    this.rows = rows;
    return rows;
  }

  /** La pista pertenece al control elegido (hueso, raiz/cadera o cadena IK). */
  trackIsSelected(id) {
    const s = this.app.selection;
    if (!s) return false;
    const rig = this.app.rig;
    const bones = s.kind === 'root' ? [rig?.bone('hips')] : s.kind === 'bone' ? this.app.selectedBones?.() || [s.bone] : [];
    if (bones.some((b) => b && id.slice(2) === b.name && /^[rts]:/.test(id))) return true;
    return !!(s.chain && id.startsWith(`ik:${s.chain}:`));
  }

  /** Clic en el nombre de una pista: elige su control (como en el Sequencer). */
  selectTrackControl(id) {
    const rig = this.app.rig;
    const m = id.match(/^[rts]:(.*)$/);
    if (m) {
      const b = rig.byName.get(m[1]);
      if (b) this.app.select({ kind: 'bone', bone: b });
      return;
    }
    const ik = id.match(/^ik:(\w+):(\w+)$/);
    if (ik) this.app.select({ kind: ik[2] === 'pole' ? 'pole' : 'ik', chain: ik[1] });
  }

  trackLabel(id) {
    const rig = this.app.rig;
    const m = id.match(/^([rts]):(.*)$/);
    if (m) {
      const b = rig.byName.get(m[2]);
      const c = b && rig.canonOf.get(b);
      const kind = { r: 'rot', t: 'pos', s: 'esc' }[m[1]];
      return `${c ? canonLabel(c) : m[2]} · ${kind}`;
    }
    if (id === 'w:') return 'Peso';
    const ik = id.match(/^ik:(\w+):(\w+)$/);
    if (ik) return `${IK_CHAINS[ik[1]]?.label || ik[1]} · ${{ pos: 'IK mover', rot: 'IK girar', pole: 'polo', w: 'IK↔FK %', abs: 'ancla', absq: 'ancla giro', absw: 'ancla %' }[ik[2]] || ik[2]}`;
    return id;
  }

  // ---------- Curvas ----------
  curveTracks() {
    const eng = this.app.engine;
    const l = eng.layer();
    const filter = this.app.trackFilter();
    return Object.keys(l.tracks).filter((id) => id !== 'w:' && (!filter || filter(id)) && l.tracks[id].length).slice(0, 12);
  }

  /** Valores por canal de una clave: cuaterniones como Euler en grados. */
  channels(id, v) {
    if (isQuatTrack(id)) {
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(v));
      return [e.x * R2D, e.y * R2D, e.z * R2D];
    }
    return v.slice(0, 3).map((x) => (id.startsWith('t:') || id.startsWith('ik:') ? x * 100 : id.startsWith('s:') ? x * 100 : x));
  }

  fromChannels(id, ch) {
    if (isQuatTrack(id)) return new THREE.Quaternion().setFromEuler(new THREE.Euler(ch[0] / R2D, ch[1] / R2D, ch[2] / R2D)).toArray();
    return ch.map((x) => x / 100);
  }

  curveRange(tracks) {
    if (!this.curveView.auto) return [this.curveView.min, this.curveView.max];
    let lo = Infinity;
    let hi = -Infinity;
    const eng = this.app.engine;
    for (const id of tracks) {
      for (const k of eng.layer().tracks[id]) {
        for (const v of this.channels(id, k.v)) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
    }
    if (!isFinite(lo)) return [-10, 10];
    const pad = Math.max(2, (hi - lo) * 0.15);
    return [lo - pad, hi + pad];
  }

  drawCurves() {
    const ctx = this.ctx;
    const eng = this.app.engine;
    const W = this.w;
    const H = this.h;
    ctx.fillStyle = '#15171c';
    ctx.fillRect(0, 0, W, H);
    const top = ROW.ruler;
    const tracks = this.curveTracks();
    const [lo, hi] = this.curveRange(tracks);
    this._cr = { lo, hi, top, tracks };
    const yOf = (v) => top + 8 + (1 - (v - lo) / (hi - lo || 1)) * (H - top - 16);
    this.vToY = yOf;
    this.yToV = (y) => lo + (1 - (y - top - 8) / (H - top - 16)) * (hi - lo);
    // rejilla horizontal
    ctx.font = '10px ui-monospace, Consolas, monospace';
    const stepV = niceNum((hi - lo) / 5);
    for (let v = Math.ceil(lo / stepV) * stepV; v <= hi; v += stepV) {
      const y = Math.round(yOf(v)) + 0.5;
      ctx.strokeStyle = Math.abs(v) < 1e-9 ? '#3a404c' : '#23272f';
      ctx.beginPath();
      ctx.moveTo(this.labelW, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.fillStyle = '#6d7480';
      ctx.fillText(+v.toFixed(2), this.labelW + 3, y - 3);
    }
    const step = this.niceStep();
    for (let f = Math.floor(this.view.start / step) * step; this.fToX(f) < W; f += step) {
      const x = Math.round(this.fToX(f)) + 0.5;
      if (x < this.labelW) continue;
      ctx.strokeStyle = '#21252c';
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.fillStyle = '#8b93a1';
      ctx.fillText(String(f), x + 3, top / 2);
    }
    const COLS = ['#ff5a6e', '#7ee07e', '#5aa8ff'];
    const layer = eng.layer();
    const tmpQ = new THREE.Quaternion();
    const tmpV = new THREE.Vector3();
    this._curvePts = [];
    this._handles = [];
    tracks.forEach((id) => {
      const keys = layer.tracks[id];
      const quat = isQuatTrack(id);
      for (let c = 0; c < 3; c++) {
        const key = `${id}#${c}`;
        if (this.curveView.hidden.has(key)) continue;
        ctx.strokeStyle = COLS[c];
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        let first = true;
        const f0 = Math.max(Math.floor(this.xToF(this.labelW)), keys[0].f - 40);
        const f1 = Math.min(Math.ceil(this.xToF(W)), keys[keys.length - 1].f + 40);
        let prevE = null;
        for (let f = f0; f <= f1; f += Math.max(0.25, 1 / this.view.ppf)) {
          let val;
          if (quat) {
            sampleTrack(keys, f, tmpQ);
            const e = new THREE.Euler().setFromQuaternion(tmpQ);
            val = [e.x, e.y, e.z][c] * R2D;
            // continuidad visual del ángulo
            if (prevE !== null) while (val - prevE > 180) val -= 360;
            if (prevE !== null) while (val - prevE < -180) val += 360;
            prevE = val;
          } else {
            sampleTrack(keys, f, tmpV);
            val = this.channels(id, tmpV.toArray())[c];
          }
          const x = this.fToX(f);
          const y = yOf(val);
          if (first) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          first = false;
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        for (const k of keys) {
          const val = this.channels(id, k.v)[c];
          const x = this.fToX(k.f);
          const y = yOf(val);
          const sel = this.selKeys.has(`${layer.id}|${id}|${k.f}`);
          ctx.fillStyle = sel ? '#fff' : COLS[c];
          ctx.fillRect(x - 3, y - 3, 6, 6);
          this._curvePts.push({ x, y, id, f: k.f, c });
          // tangentes de este canal: dos asas para el tramo que sale de la clave elegida
          const nx = keys[keys.indexOf(k) + 1];
          if (sel && nx && (k.i || 'smooth') !== 'step') {
            let v1 = this.channels(id, nx.v)[c];
            if (quat) v1 -= Math.round((v1 - val) / 360) * 360;
            const dt = nx.f - k.f;
            const dv = v1 - val;
            const b = (k.bc && k.bc[c]) || bezierOf(k);
            const pts = [[k.f + b[0] * dt, val + b[1] * dv, x, y, 0], [k.f + b[2] * dt, val + b[3] * dv, this.fToX(nx.f), yOf(v1), 2]];
            for (const [hf, hv, ax, ay, which] of pts) {
              const hx = this.fToX(hf);
              const hy = Math.abs(dv) < 1e-6 ? ay : yOf(hv);
              ctx.strokeStyle = COLS[c];
              ctx.globalAlpha = 0.6;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(hx, hy);
              ctx.stroke();
              ctx.globalAlpha = 1;
              ctx.fillStyle = k.bc && k.bc[c] ? '#fff' : '#15171c';
              ctx.beginPath();
              ctx.arc(hx, hy, 4, 0, Math.PI * 2);
              ctx.fill();
              ctx.stroke();
              this._handles.push({ x: hx, y: hy, id, f: k.f, c, which, f0: k.f, dt, v0: val, dv });
            }
          }
        }
      }
    });
    // leyenda
    ctx.fillStyle = '#14161b';
    ctx.fillRect(0, 0, this.labelW, H);
    ctx.font = '10px system-ui, sans-serif';
    let y = top + 12;
    this._legend = [];
    if (!tracks.length) {
      ctx.fillStyle = '#8b93a1';
      ctx.fillText('Elige un hueso con claves', 8, y);
    }
    for (const id of tracks) {
      ctx.fillStyle = '#cfd5df';
      ctx.fillText(ellipsis(ctx, this.trackLabel(id), this.labelW - 12), 8, y);
      y += 13;
      for (let c = 0; c < 3; c++) {
        const hidden = this.curveView.hidden.has(`${id}#${c}`);
        ctx.fillStyle = hidden ? '#444' : COLS[c];
        ctx.fillText(['X', 'Y', 'Z'][c], 14 + c * 18, y);
        this._legend.push({ x: 14 + c * 18, y, id, c });
      }
      y += 14;
    }
    this.drawMarkers();
    this.drawPlayhead();
  }

  /** Marcadores del retimer (Herramientas): triángulos amarillos en la regla; al arrastrar, fantasma y guía. */
  drawMarkers() {
    const ctx = this.ctx;
    const ms = this.app.engine.doc.markers || [];
    if (!ms.length) return;
    const d = this.drag?.kind === 'marker' ? this.drag : null;
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const m of ms) {
      const f = d && d.id === m.id ? d.to : m.f;
      const x = this.fToX(f);
      if (x < this.labelW || x > this.w) continue;
      if (d && d.id === m.id) {
        ctx.strokeStyle = 'rgba(255,194,61,0.55)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, ROW.ruler);
        ctx.lineTo(x, this.h);
        ctx.stroke();
        ctx.setLineDash([]);
        const x0 = this.fToX(m.f);
        ctx.fillStyle = 'rgba(255,194,61,0.25)';
        ctx.beginPath();
        ctx.moveTo(x0 - 4, ROW.ruler - 9);
        ctx.lineTo(x0 + 4, ROW.ruler - 9);
        ctx.lineTo(x0, ROW.ruler - 1);
        ctx.fill();
      }
      ctx.fillStyle = '#ffc23d';
      ctx.beginPath();
      ctx.moveTo(x - 5, ROW.ruler - 10);
      ctx.lineTo(x + 5, ROW.ruler - 10);
      ctx.lineTo(x, ROW.ruler - 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillText(m.name, x + 6, ROW.ruler - 16);
    }
  }

  markerAt(x, y) {
    if (y > ROW.ruler + 2) return null;
    const ms = this.app.engine.doc.markers || [];
    let best = null;
    let bd = 7;
    for (const m of ms) {
      const dd = Math.abs(this.fToX(m.f) - x);
      if (dd < bd) [best, bd] = [m, dd];
    }
    return best;
  }

  drawPlayhead() {
    const ctx = this.ctx;
    const eng = this.app.engine;
    const x = this.fToX(eng.frame);
    if (x < this.labelW) return;
    ctx.strokeStyle = '#ff4d5e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, this.h);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#ff4d5e';
    roundRect(ctx, x - 14, 2, 28, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '600 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.round(eng.frame)), x, 10);
    ctx.textAlign = 'left';
  }

  downCurves(e) {
    const x = this.localX(e);
    const y = this.localY(e);
    const app = this.app;
    const layer = app.engine.layer();
    if (x < this.labelW) {
      const l = (this._legend || []).find((p) => Math.abs(p.x + 3 - x) < 8 && Math.abs(p.y - 4 - y) < 8);
      if (l) {
        const k = `${l.id}#${l.c}`;
        if (this.curveView.hidden.has(k)) this.curveView.hidden.delete(k);
        else this.curveView.hidden.add(k);
        this.draw();
      }
      return;
    }
    if (y < ROW.ruler) {
      this.drag = { kind: 'scrub' };
      app.setFrame(Math.round(this.xToF(x)));
      return;
    }
    const hd = (this._handles || []).find((q) => Math.abs(q.x - x) < 7 && Math.abs(q.y - y) < 7);
    if (hd) {
      app.pushUndo();
      this.drag = { kind: 'tan', hd };
      return;
    }
    const p = (this._curvePts || []).find((q) => Math.abs(q.x - x) < 6 && Math.abs(q.y - y) < 6);
    if (p) {
      const key = `${layer.id}|${p.id}|${p.f}`;
      if (!e.shiftKey && !this.selKeys.has(key)) this.selKeys.clear();
      this.selKeys.add(key);
      app.pushUndo();
      const k = layer.tracks[p.id].find((q) => q.f === p.f);
      this.drag = { kind: 'curveKey', p, x0: x, y0: y, v0: this.channels(p.id, k.v), f0: p.f, moved: false, axis: null };
      app.setFrame(p.f);
      this.draw();
      app.panels.refreshKeyTools?.();
      return;
    }
    this.drag = { kind: 'box', x0: x, y0: y, add: e.shiftKey };
  }

  moveCurves(e) {
    const d = this.drag;
    const app = this.app;
    const x = this.localX(e);
    const y = this.localY(e);
    if (d.kind === 'tan') {
      // asa de tangente: horizontal = cuándo, vertical = cuánto (solo de este canal)
      const hd = d.hd;
      const k = (app.engine.layer().tracks[hd.id] || []).find((q) => q.f === hd.f0);
      if (!k) return;
      const b = ((k.bc && k.bc[hd.c]) || bezierOf(k)).slice();
      b[hd.which] = +Math.min(1, Math.max(0, (this.xToF(x) - hd.f0) / hd.dt)).toFixed(3);
      if (Math.abs(hd.dv) > 1e-6) b[hd.which + 1] = +Math.min(3, Math.max(-2, (this.yToV(y) - hd.v0) / hd.dv)).toFixed(3);
      (k.bc ||= {})[hd.c] = b;
      d.moved = true;
      app.engine.evaluate(app.engine.frame);
      this.draw();
      return;
    }
    if (d.kind === 'curveKey') {
      const layer = app.engine.layer();
      const keys = layer.tracks[d.p.id];
      const k = keys.find((q) => q.f === d.f0);
      if (!k) return;
      if (!d.axis && Math.hypot(x - d.x0, y - d.y0) > 4) d.axis = e.altKey ? 'both' : Math.abs(x - d.x0) > Math.abs(y - d.y0) ? 'time' : 'value';
      if (d.axis === 'value' || d.axis === 'both') {
        const ch = d.v0.slice();
        ch[d.p.c] = this.yToV(y);
        k.v = this.fromChannels(d.p.id, ch);
      }
      if (d.axis === 'time' || d.axis === 'both') {
        const to = Math.round(this.xToF(x));
        if (to !== k.f && !keys.some((q) => q !== k && q.f === to)) {
          this.selKeys.delete(`${layer.id}|${d.p.id}|${k.f}`);
          k.f = to;
          d.f0 = to;
          keys.sort((a, b) => a.f - b.f);
          this.selKeys.add(`${layer.id}|${d.p.id}|${to}`);
        }
      }
      d.moved = true;
      app.engine.evaluate(app.engine.frame);
      this.draw();
    } else if (d.kind === 'box') {
      d.x1 = x;
      d.y1 = y;
      this.draw();
      const ctx = this.ctx;
      ctx.strokeStyle = '#3dffb0';
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(Math.min(d.x0, x), Math.min(d.y0, y), Math.abs(x - d.x0), Math.abs(y - d.y0));
      ctx.setLineDash([]);
    }
  }

  draw() {
    const ctx = this.ctx;
    const eng = this.app.engine;
    if (!eng || !this.w) return;
    if (this.mode === 'curves') return this.drawCurves();
    const rows = this.buildRows();
    const W = this.w;
    const H = this.h;
    ctx.fillStyle = '#16181d';
    ctx.fillRect(0, 0, W, H);
    const [ra, rb] = eng.range();
    // fuera de rango
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(this.labelW, 0, Math.max(0, this.fToX(ra) - this.labelW), H);
    ctx.fillRect(this.fToX(rb), 0, W, H);
    // filas
    for (const r of rows) {
      if (r.kind === 'ruler') continue;
      const active = r.layer && r.layer.id === eng.doc.activeLayer;
      ctx.fillStyle = r.kind === 'strips' ? '#1c1f26' : r.kind === 'track' ? (r.sel ? '#1d3352' : '#181b20') : active ? '#232833' : '#1a1d23';
      ctx.fillRect(0, r.y, W, r.h - 1);
    }
    // cuadrícula
    const step = this.niceStep();
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.textBaseline = 'middle';
    const f0 = Math.floor(this.view.start / step) * step;
    for (let f = f0; this.fToX(f) < W; f += step) {
      const x = Math.round(this.fToX(f)) + 0.5;
      if (x < this.labelW) continue;
      ctx.strokeStyle = '#262a32';
      ctx.beginPath();
      ctx.moveTo(x, ROW.ruler);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.fillStyle = '#8b93a1';
      ctx.fillText(String(f), x + 3, ROW.ruler / 2);
      ctx.strokeStyle = '#4b5260';
      ctx.beginPath();
      ctx.moveTo(x, ROW.ruler - 7);
      ctx.lineTo(x, ROW.ruler);
      ctx.stroke();
    }
    // marcas de rango
    ctx.fillStyle = '#ff7a45';
    for (const f of [ra, rb]) {
      const x = this.fToX(f);
      if (x >= this.labelW) ctx.fillRect(x - 1, 0, 2, ROW.ruler);
    }
    // tiras
    const sr = rows.find((r) => r.kind === 'strips');
    for (const s of eng.doc.strips) {
      const clip = this.app.library.get(s.clipId);
      const x0 = Math.max(this.labelW, this.fToX(s.start));
      const x1 = this.fToX(s.start + s.len - 1);
      if (x1 < this.labelW) continue;
      const sel = this.app.selStrip === s.id;
      ctx.fillStyle = s.mute ? '#3a3d44' : sel ? '#ff9b6e' : '#d9774f';
      roundRect(ctx, x0, sr.y + 5, Math.max(4, x1 - x0), sr.h - 11, 4);
      ctx.fill();
      if (s.blend > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.moveTo(this.fToX(s.start), sr.y + sr.h - 6);
        ctx.lineTo(this.fToX(s.start + s.blend), sr.y + 5);
        ctx.lineTo(this.fToX(s.start), sr.y + 5);
        ctx.fill();
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, sr.y, Math.max(0, x1 - x0 - 6), sr.h);
      ctx.clip();
      ctx.fillStyle = '#1b1208';
      ctx.font = '600 11px system-ui, sans-serif';
      const flags = [s.loop && '⟳', s.inPlace && '⌖', s.mirror && '⇋', s.reverse && '⇠', s.speed !== 1 && `×${s.speed}`].filter(Boolean).join(' ');
      ctx.fillText(`${s.label || (clip ? clip.name : '¿' + s.clipId + '?')} ${flags}`, x0 + 6, sr.y + sr.h / 2);
      ctx.restore();
      // asas: derecha alarga/acorta, izquierda recorta el principio
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x1 - 5, sr.y + 8, 3, sr.h - 17);
      if (this.fToX(s.start) >= this.labelW) ctx.fillRect(x0 + 2, sr.y + 8, 3, sr.h - 17);
      if (sel) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        roundRect(ctx, x0, sr.y + 5, Math.max(4, x1 - x0), sr.h - 11, 4);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
    if (this.dropHint != null) {
      ctx.fillStyle = '#3dffb0';
      ctx.fillRect(this.fToX(Math.round(this.dropHint)) - 1, sr.y, 2, sr.h);
    }
    // claves
    const filter = this.app.trackFilter();
    for (const r of rows) {
      if (r.kind !== 'layer' && r.kind !== 'track') continue;
      const frames = new Set();
      if (r.kind === 'layer') {
        for (const [id, keys] of Object.entries(r.layer.tracks)) {
          if (this.app.onlySelected && filter && !filter(id)) continue;
          keys.forEach((k) => frames.add(k.f));
        }
      } else r.layer.tracks[r.track]?.forEach((k) => frames.add(k.f));
      const cy = r.y + r.h / 2;
      for (const f of frames) {
        const x = this.fToX(f);
        if (x < this.labelW - 4 || x > W + 4) continue;
        const sel = r.kind === 'track' ? this.selKeys.has(`${r.layer.id}|${r.track}|${f}`) : this.selKey && this.selKey.layer === r.layer.id && this.selKey.f === f;
        diamond(ctx, x, cy, r.kind === 'track' ? 4 : 5, sel ? '#ffffff' : r.kind === 'track' ? '#9fd6ff' : r.layer.lock ? '#777' : '#ffc23d');
      }
    }
    // cabecera de etiquetas
    ctx.fillStyle = '#14161b';
    ctx.fillRect(0, 0, this.labelW, H);
    for (const r of rows) {
      if (r.kind === 'ruler') continue;
      const active = r.layer && r.layer.id === eng.doc.activeLayer;
      ctx.fillStyle = r.sel ? '#0e6bd8' : active ? '#262c38' : '#181a20';
      ctx.fillRect(0, r.y, this.labelW, r.h - 1);
      ctx.fillStyle = r.sel ? '#ffffff' : r.kind === 'track' ? '#9aa3b1' : '#e6e9ef';
      ctx.font = r.kind === 'strips' ? '600 12px system-ui, sans-serif' : r.kind === 'track' ? '10px system-ui, sans-serif' : '11px system-ui, sans-serif';
      const pad = r.kind === 'track' ? 18 : 8;
      ctx.fillText(ellipsis(ctx, r.label, this.labelW - pad - 6), pad, r.y + (r.kind === 'strips' ? 13 : r.h / 2));
      if (r.kind === 'strips') {
        ctx.fillStyle = '#7d8593';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(r.sub, 8, r.y + 27);
      }
      if (r.kind === 'layer' && (r.layer.mute || r.layer.lock || r.layer.solo)) {
        ctx.fillStyle = '#ff7a45';
        ctx.fillText([r.layer.mute && 'M', r.layer.solo && 'S', r.layer.lock && 'L'].filter(Boolean).join(' '), this.labelW - 34, r.y + r.h / 2);
      }
    }
    this.drawMarkers();
    // cabezal
    const x = this.fToX(eng.frame);
    if (x >= this.labelW) {
      ctx.strokeStyle = '#ff4d5e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = '#ff4d5e';
      roundRect(ctx, x - 14, 2, 28, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '600 10px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(eng.frame)), x, 10);
      ctx.textAlign = 'left';
    }
  }

  niceStep() {
    const min = 48 / this.view.ppf;
    for (const s of [1, 2, 5, 10, 20, 30, 50, 100, 200, 500]) if (s >= min) return s;
    return 1000;
  }

  rowAt(y) {
    return this.rows.find((r) => y >= r.y && y < r.y + r.h);
  }

  down(e) {
    // marcador del retimer: arrastrar estira o encoge el tiempo entre sus vecinos (se aplica al soltar)
    const mk = this.markerAt(this.localX(e), this.localY(e));
    if (mk) {
      if (e.button === 2) return;
      this.drag = { kind: 'marker', id: mk.id, from: mk.f, to: mk.f };
      return;
    }
    if (this.mode === 'curves') return this.downCurves(e);
    const x = this.localX(e);
    const y = this.localY(e);
    const r = this.rowAt(y);
    const app = this.app;
    const eng = app.engine;
    if (r && r.kind === 'track' && x < this.labelW) {
      this.selectTrackControl(r.track);
      this.draw();
      return;
    }
    if (r && r.kind === 'track' && x >= this.labelW) {
      const keys = r.layer.tracks[r.track] || [];
      const k = keys.find((q) => Math.abs(this.fToX(q.f) - x) <= 6);
      if (k) {
        const key = `${r.layer.id}|${r.track}|${k.f}`;
        if (!e.shiftKey && !this.selKeys.has(key)) this.selKeys.clear();
        if (e.shiftKey && this.selKeys.has(key)) this.selKeys.delete(key);
        else this.selKeys.add(key);
        app.pushUndo();
        this.drag = { kind: 'selKeys', f0: k.f, last: k.f, moved: false };
        app.setFrame(k.f);
        app.panels.refreshKeyTools?.();
        return;
      }
      this.drag = { kind: 'box', x0: x, y0: y, add: e.shiftKey };
      return;
    }
    if (x < this.labelW) {
      if (r && r.layer) app.setActiveLayer(r.layer.id);
      return;
    }
    const f = this.xToF(x);
    if (!r || r.kind === 'ruler' || (r.kind !== 'strips' && r.kind !== 'layer' && r.kind !== 'track')) {
      this.drag = { kind: 'scrub' };
      app.setFrame(Math.round(f));
      return;
    }
    if (r.kind === 'strips') {
      if (e.button === 2) return; // el clic derecho abre el menú contextual
      for (const s of [...eng.doc.strips].reverse()) {
        const x0 = this.fToX(s.start);
        const x1 = this.fToX(s.start + s.len - 1);
        if (x >= x0 - 2 && x <= x1 + 2) {
          app.selectStrip(s.id);
          app.pushUndo();
          const zone = this.stripZone(s, x);
          if (zone === 'end') this.drag = { kind: 'stripLen', s, f0: f, len0: s.len };
          else if (zone === 'head') this.drag = { kind: 'stripHead', s, f0: f, start0: s.start, len0: s.len, off0: s.offset || 0 };
          else {
            // Las claves que caen dentro de la tira viajan con ella (Alt: mover solo la tira).
            const linked = [];
            if (!e.altKey) for (const l of eng.doc.layers) {
              if (l.lock) continue;
              for (const keys of Object.values(l.tracks)) for (const k of keys) if (k.f >= s.start && k.f <= s.start + s.len - 1) linked.push({ k, keys, f0: k.f });
            }
            this.drag = { kind: 'strip', s, f0: f, start0: s.start, linked };
          }
          return;
        }
      }
      app.selectStrip(null);
      this.drag = { kind: 'scrub' };
      app.setFrame(Math.round(f));
      return;
    }
    // claves
    const near = (frames) => frames.find((k) => Math.abs(this.fToX(k) - x) <= 6);
    const frames = r.kind === 'track' ? (r.layer.tracks[r.track] || []).map((k) => k.f) : eng.keyFrames(r.layer.id);
    const k = near(frames);
    if (k !== undefined) {
      if (r.layer.id !== eng.doc.activeLayer) app.setActiveLayer(r.layer.id);
      this.selKey = { layer: r.layer.id, f: k, track: r.kind === 'track' ? r.track : null };
      app.pushUndo();
      this.drag = { kind: 'key', layer: r.layer.id, from: k, track: this.selKey.track, moved: false };
      app.setFrame(k);
      return;
    }
    this.selKey = null;
    if (r.layer && r.layer.id !== eng.doc.activeLayer) app.setActiveLayer(r.layer.id);
    this.drag = { kind: 'scrub' };
    app.setFrame(Math.round(f));
  }

  move(e) {
    if (!this.drag) return;
    const f = this.xToF(this.localX(e));
    const app = this.app;
    const d = this.drag;
    if (d.kind === 'marker') {
      const [lo, hi] = markerLimits(app.engine, d.id);
      d.to = Math.min(hi, Math.max(lo, Math.round(f)));
      return this.draw();
    }
    if (d.kind === 'curveKey' || d.kind === 'box' || d.kind === 'tan') return this.moveCurves(e);
    if (d.kind === 'selKeys') {
      const to = Math.round(f);
      if (to !== d.last) {
        this.shiftSelected(to - d.last);
        d.last = to;
        d.moved = true;
        app.setFrame(to);
      }
      return;
    }
    if (d.kind === 'scrub') app.setFrame(Math.round(f));
    else if (d.kind === 'strip') {
      d.s.start = Math.max(0, Math.round(d.start0 + f - d.f0));
      for (const m of d.linked || []) m.k.f = m.f0 + d.s.start - d.start0;
      app.changed(false);
    } else if (d.kind === 'stripLen') {
      d.s.len = Math.max(2, Math.round(d.len0 + f - d.f0));
      app.changed(false);
    } else if (d.kind === 'stripHead') {
      // recortar por delante: el final se queda quieto y la tira empieza más adentro del clip
      const dd = Math.max(-d.off0, Math.min(d.len0 - 2, Math.round(f - d.f0)));
      d.s.start = Math.max(0, d.start0 + dd);
      const real = d.s.start - d.start0;
      d.s.len = d.len0 - real;
      d.s.offset = d.off0 + real;
      if (!d.s.offset) delete d.s.offset;
      app.changed(false);
    } else if (d.kind === 'key') {
      const to = Math.round(f);
      if (to !== d.from) {
        const filt = d.track ? (id) => id === d.track : app.onlySelected ? app.trackFilter() : null;
        app.engine.moveKeys(d.layer, d.from, to, filt);
        d.from = to;
        d.moved = true;
        this.selKey.f = to;
        app.setFrame(to);
      }
    }
  }

  up() {
    if (!this.drag) return;
    const d = this.drag;
    this.drag = null;
    if (d.kind === 'marker') {
      if (d.to === d.from) return this.app.setFrame(d.from);
      const app = this.app;
      if (app.engine.layer().lock) return app.toast('La capa está bloqueada', true), this.draw();
      app.pushUndo();
      const o = app.toolsUI?.state || {};
      const r = retimeMarker(app.engine, d.id, d.to, { scope: o.scope || 'all', strips: o.strips !== false });
      app.changed();
      app.toolsUI?.render();
      return app.toast(r ? `Retimer: el tiempo se reparte hasta f${r.to} (${r.moved} claves movidas${o.strips !== false ? ', base incluida' : ''})` : 'Sin cambios');
    }
    if (d.kind === 'box') {
      if (!d.add) this.selKeys.clear();
      if (d.x1 !== undefined) {
        const [x0, x1] = [Math.min(d.x0, d.x1), Math.max(d.x0, d.x1)];
        const [y0, y1] = [Math.min(d.y0, d.y1), Math.max(d.y0, d.y1)];
        const lid = this.app.engine.layer().id;
        if (this.mode === 'curves') {
          for (const p of this._curvePts || []) if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) this.selKeys.add(`${lid}|${p.id}|${p.f}`);
        } else {
          for (const r of this.rows) {
            if (r.kind !== 'track' || r.y + r.h < y0 || r.y > y1) continue;
            for (const k of r.layer.tracks[r.track] || []) {
              const x = this.fToX(k.f);
              if (x >= x0 && x <= x1) this.selKeys.add(`${r.layer.id}|${r.track}|${k.f}`);
            }
          }
        }
      }
      this.draw();
      this.app.panels.refreshKeyTools?.();
      return;
    }
    if (d.kind === 'strip' && d.linked?.length && d.s.start !== d.start0) {
      // al soltar: en cada pista, la clave que viajó gana a la que ya había en ese fotograma
      const moved = new Set(d.linked.map((m) => m.k));
      for (const keys of new Set(d.linked.map((m) => m.keys))) {
        const taken = new Set(keys.filter((k) => moved.has(k)).map((k) => k.f));
        for (let i = keys.length - 1; i >= 0; i--) if (!moved.has(keys[i]) && taken.has(keys[i].f)) keys.splice(i, 1);
        keys.sort((a, b) => a.f - b.f);
      }
      this.selKeys.clear();
    }
    if (d.kind === 'strip' || d.kind === 'stripLen' || d.kind === 'stripHead' || ((d.kind === 'key' || d.kind === 'selKeys' || d.kind === 'curveKey' || d.kind === 'tan') && d.moved)) this.app.changed();
  }

  // ---------- operaciones sobre las claves elegidas ----------
  eachSelected(fn) {
    const eng = this.app.engine;
    for (const s of this.selKeys) {
      const [lid, track, f] = s.split('|');
      const l = eng.doc.layers.find((x) => x.id === lid);
      const k = l?.tracks[track]?.find((q) => q.f === +f);
      if (k) fn(k, l, track);
    }
  }

  shiftSelected(df) {
    const moved = [];
    this.eachSelected((k, l, track) => moved.push({ k, l, track }));
    // comprobar choques
    for (const m of moved) {
      const to = m.k.f + df;
      if (m.l.tracks[m.track].some((q) => q.f === to && !moved.find((x) => x.k === q))) return;
    }
    this.selKeys.clear();
    for (const m of moved) {
      m.k.f += df;
      m.l.tracks[m.track].sort((a, b) => a.f - b.f);
      this.selKeys.add(`${m.l.id}|${m.track}|${m.k.f}`);
    }
    this.app.engine.evaluate(this.app.engine.frame);
    this.draw();
  }

  setInterp(mode) {
    this.app.pushUndo();
    this.eachSelected((k) => {
      k.i = mode;
      delete k.bc;
      if (mode === 'bezier') k.b ||= [0.42, 0, 0.58, 1];
      else delete k.b;
    });
    this.app.changed();
  }

  /** Curva propia (Bézier de tiempo) para el tramo que sale de cada clave elegida. live: sin deshacer ni guardar (arrastre). */
  setBezier(b, live = false) {
    if (!live) this.app.pushUndo();
    this.eachSelected((k) => {
      k.i = 'bezier';
      k.b = b.slice();
      delete k.bc;
    });
    if (live) {
      this.app.engine.evaluate(this.app.engine.frame);
      this.draw();
    } else this.app.changed();
  }

  /** Curva del tramo de la primera clave elegida (para mostrarla en el editor). */
  selectedBezier() {
    let b = null;
    this.eachSelected((k) => (b ||= k.i === 'bezier' && k.b ? k.b : null));
    return b;
  }

  /** Suaviza: cada clave intermedia se acerca al promedio de sus vecinas (quita temblores de la captura). */
  smoothSelectedTracks(amount = 0.5) {
    const l = this.app.engine.layer();
    const filter = this.app.trackFilter();
    this.app.pushUndo();
    let n = 0;
    for (const [id, keys] of Object.entries(l.tracks)) {
      if ((filter && !filter(id)) || keys.length < 3 || /:(w|absw)$/.test(id) || id === 'w:') continue;
      const quat = isQuatTrack(id);
      const src = keys.map((k) => k.v.slice());
      for (let i = 1; i < keys.length - 1; i++) {
        const u = (keys[i].f - keys[i - 1].f) / (keys[i + 1].f - keys[i - 1].f);
        if (quat) {
          const m = new THREE.Quaternion().fromArray(src[i - 1]).slerp(new THREE.Quaternion().fromArray(src[i + 1]), u);
          keys[i].v = new THREE.Quaternion().fromArray(src[i]).slerp(m, amount).toArray();
        } else keys[i].v = src[i].map((x, c) => x + (src[i - 1][c] + (src[i + 1][c] - src[i - 1][c]) * u - x) * amount);
        n++;
      }
    }
    this.app.changed();
    this.app.toast(n ? `${n} clave(s) suavizadas` : 'Hacen falta pistas con 3 claves o más');
  }

  deleteSelected() {
    if (!this.selKeys.size) return false;
    this.app.pushUndo();
    const list = [];
    this.eachSelected((k, l, track) => list.push({ k, l, track }));
    for (const { k, l, track } of list) {
      l.tracks[track] = l.tracks[track].filter((q) => q !== k);
      if (!l.tracks[track].length) delete l.tracks[track];
    }
    this.selKeys.clear();
    this.app.changed();
    return true;
  }

  copySelected() {
    const items = [];
    this.eachSelected((k, l, track) => items.push({ track, f: k.f, v: k.v.slice(), i: k.i, ...(k.b ? { b: k.b.slice() } : {}), ...(k.bc ? { bc: JSON.parse(JSON.stringify(k.bc)) } : {}) }));
    if (!items.length) return false;
    const f0 = Math.min(...items.map((x) => x.f));
    this.keyClip = items.map((x) => ({ ...x, f: x.f - f0 }));
    this.app.toast(`${items.length} clave(s) copiadas`);
    return true;
  }

  pasteKeys() {
    if (!this.keyClip) return false;
    this.app.pushUndo();
    const l = this.app.engine.layer();
    const at = Math.round(this.app.engine.frame);
    this.selKeys.clear();
    for (const k of this.keyClip) {
      const keys = (l.tracks[k.track] ||= []);
      const f = at + k.f;
      const old = keys.findIndex((q) => q.f === f);
      if (old >= 0) keys.splice(old, 1);
      keys.push({ f, v: k.v.slice(), i: k.i, ...(k.b ? { b: k.b.slice() } : {}), ...(k.bc ? { bc: JSON.parse(JSON.stringify(k.bc)) } : {}) });
      keys.sort((a, b) => a.f - b.f);
      this.selKeys.add(`${l.id}|${k.track}|${f}`);
    }
    this.app.changed();
    return true;
  }

  /** Escala en el tiempo las claves elegidas alrededor de la primera (o del cabezal). */
  scaleSelected(factor, pivot = null) {
    const list = [];
    this.eachSelected((k, l, track) => list.push({ k, l, track }));
    if (!list.length) return;
    this.app.pushUndo();
    const p = pivot ?? Math.min(...list.map((x) => x.k.f));
    this.selKeys.clear();
    for (const { k, l, track } of list) {
      k.f = Math.round(p + (k.f - p) * factor);
      const keys = l.tracks[track];
      // quitar duplicados del mismo fotograma (gana la movida)
      l.tracks[track] = keys.filter(q => q === k || q.f !== k.f);
      l.tracks[track].sort((a, b) => a.f - b.f);
      this.selKeys.add(`${l.id}|${track}|${k.f}`);
    }
    this.app.changed();
  }

  /** Simplifica: quita claves que la interpolación ya reproduce (tolerancia en grados/cm). */
  cleanSelectedTracks(tol = 0.5) {
    const eng = this.app.engine;
    const l = eng.layer();
    const filter = this.app.trackFilter();
    this.app.pushUndo();
    let removed = 0;
    for (const [id, keys] of Object.entries(l.tracks)) {
      if (filter && !filter(id)) continue;
      for (let i = keys.length - 2; i >= 1; i--) {
        const k = keys[i];
        const test = keys.filter((q) => q !== k);
        const out = isQuatTrack(id) ? new THREE.Quaternion() : new THREE.Vector3();
        sampleTrack(test, k.f, out);
        const a = this.channels(id, out.toArray());
        const b = this.channels(id, k.v);
        if (Math.max(...a.map((x, j) => Math.abs(x - b[j]))) < tol) {
          keys.splice(i, 1);
          removed++;
        }
      }
    }
    this.app.changed();
    this.app.toast(`${removed} clave(s) sobrantes quitadas`);
  }

  /** Hornea: una clave por fotograma en el rango para lo elegido. */
  bakeSelectedTracks() {
    const eng = this.app.engine;
    const l = eng.layer();
    const filter = this.app.trackFilter();
    this.app.pushUndo();
    for (const [id, keys] of Object.entries(l.tracks)) {
      if (filter && !filter(id)) continue;
      if (keys.length < 2) continue;
      const a = keys[0].f;
      const b = keys[keys.length - 1].f;
      const out = [];
      const tmp = isQuatTrack(id) ? new THREE.Quaternion() : new THREE.Vector3();
      for (let f = a; f <= b; f++) out.push({ f, v: sampleTrack(keys, f, tmp).toArray(), i: 'linear' });
      l.tracks[id] = out;
    }
    this.app.changed();
  }

  dbl(e) {
    const r = this.rowAt(this.localY(e));
    if (r && r.layer && this.localX(e) < this.labelW) this.app.renameLayer(r.layer.id);
    else if (r && r.kind === 'strips') {
      const s = this.stripAt(this.localX(e));
      if (s) this.app.selectStrip(s.id);
    }
  }

  /** Tira bajo la x de la fila Base (la de encima si se solapan). */
  stripAt(x) {
    for (const s of [...this.app.engine.doc.strips].reverse()) {
      if (x >= this.fToX(s.start) - 2 && x <= this.fToX(s.start + s.len - 1) + 2) return s;
    }
    return null;
  }

  /** Zona de la tira bajo el ratón: borde izquierdo (recortar), derecho (alargar) o cuerpo (mover). */
  stripZone(s, x) {
    const x0 = this.fToX(s.start);
    const x1 = this.fToX(s.start + s.len - 1);
    const edge = Math.min(8, Math.max(3, (x1 - x0) / 4));
    if (x > x1 - edge) return 'end';
    if (x < x0 + edge) return 'head';
    return 'body';
  }

  hover(e) {
    if (this.drag) return;
    const x = this.localX(e);
    const r = this.rowAt(this.localY(e));
    let cur = '';
    if (r && r.kind === 'strips' && x >= this.labelW) {
      const s = this.stripAt(x);
      if (s) cur = this.stripZone(s, x) === 'body' ? 'grab' : 'ew-resize';
    }
    if (this.canvas.style.cursor !== cur) this.canvas.style.cursor = cur;
  }

  // ---------- menú contextual (clic derecho) ----------
  closeMenu() {
    this.menuEl?.remove();
    this.menuEl = null;
  }

  openMenu(e) {
    e.preventDefault();
    this.closeMenu();
    const x = this.localX(e);
    const r = this.rowAt(this.localY(e));
    const app = this.app;
    const eng = app.engine;
    const f = Math.round(this.xToF(x));
    const items = [];
    if (r && r.kind === 'strips' && x >= this.labelW) {
      const s = this.stripAt(x);
      if (s) {
        app.selectStrip(s.id);
        const set = (fn) => () => { app.pushUndo(); fn(); app.changed(); app.panels.refreshStrip(); };
        const clip = app.library.get(s.clipId);
        const inside = eng.frame > s.start + 1 && eng.frame < s.start + s.len - 1;
        items.push(
          [`Cortar en el cabezal (f${Math.round(eng.frame)})`, () => app.splitStrip(s.id, eng.frame), !inside],
          [`Cortar aquí (f${f})`, () => app.splitStrip(s.id, f)],
          null,
          [`${s.loop ? '✓ ' : ''}Repetir en bucle`, set(() => { s.loop = !s.loop; })],
          ['Alargar ×2 (repite el clip)', set(() => { s.loop = true; s.len *= 2; })],
          ['Acortar a la mitad', set(() => { s.len = Math.max(2, Math.round(s.len / 2)); })],
          ['Duración original del clip', set(() => { s.len = clip ? Math.round(clip.frames / (s.speed || 1)) : s.len; delete s.offset; }), !clip],
          ['Recortar el final hasta el cabezal', set(() => { s.len = Math.max(2, Math.round(eng.frame) - s.start + 1); }), !inside],
          ['Recortar el principio hasta el cabezal', set(() => { const d = Math.round(eng.frame) - s.start; s.start += d; s.len -= d; s.offset = (s.offset || 0) + d; }), !inside],
          null,
          [`${s.mirror ? '✓ ' : ''}Espejo`, set(() => { s.mirror = !s.mirror; })],
          [`${s.reverse ? '✓ ' : ''}Al revés`, set(() => { s.reverse = !s.reverse; })],
          [`${s.mute ? '✓ ' : ''}Silenciar`, set(() => { s.mute = !s.mute; })],
          null,
          ['Duplicar a continuación', () => { app.pushUndo(); const n = { ...s, id: `s${Date.now().toString(36)}`, start: s.start + s.len }; eng.doc.strips.push(n); app.selectStrip(n.id); app.changed(); }],
          ['Opciones de la tira…', () => app.selectStrip(s.id)],
          ['Quitar la tira', () => { app.pushUndo(); eng.doc.strips = eng.doc.strips.filter((q) => q !== s); app.selStrip = null; app.changed(); app.panels.refreshStrip(); }, false, true],
        );
      }
    }
    if (!items.length) {
      if (r && r.kind === 'strips') items.push(['Suelta un clip de la biblioteca en esta fila para empezar', null, true]);
      else return;
    }
    const m = document.createElement('div');
    m.className = 'tl-ctx';
    for (const it of items) {
      if (!it) { m.append(Object.assign(document.createElement('hr'), {})); continue; }
      const [label, fn, disabled, danger] = it;
      const b = document.createElement('button');
      b.textContent = label;
      b.disabled = !!disabled;
      if (danger) b.className = 'danger';
      b.onclick = () => { this.closeMenu(); fn?.(); };
      m.append(b);
    }
    document.body.append(m);
    const w = m.offsetWidth;
    const hgt = m.offsetHeight;
    Object.assign(m.style, { left: `${Math.min(e.clientX, innerWidth - w - 4)}px`, top: `${Math.max(4, Math.min(e.clientY, innerHeight - hgt - 4))}px` });
    this.menuEl = m;
    const away = (ev) => {
      if (ev.type === 'keydown' && ev.key !== 'Escape') return;
      if (ev.type === 'pointerdown' && m.contains(ev.target)) return;
      this.closeMenu();
      removeEventListener('pointerdown', away, true);
      removeEventListener('keydown', away, true);
    };
    setTimeout(() => {
      addEventListener('pointerdown', away, true);
      addEventListener('keydown', away, true);
    });
  }
}

// estilo del menú contextual (una vez)
if (typeof document !== 'undefined' && !document.getElementById('tl-ctx-style')) {
  const st = document.createElement('style');
  st.id = 'tl-ctx-style';
  st.textContent = `.tl-ctx{position:fixed;z-index:9999;min-width:230px;padding:4px;background:#1f2228;border:1px solid #3a3f48;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.5);display:flex;flex-direction:column;font:12px system-ui,sans-serif}
.tl-ctx button{all:unset;padding:6px 10px;border-radius:4px;color:#e6e8eb;cursor:pointer;white-space:nowrap}
.tl-ctx button:hover:not(:disabled){background:#ff9b6e;color:#1b1208}
.tl-ctx button:disabled{color:#6b717c;cursor:default}
.tl-ctx button.danger{color:#ff8a8a}
.tl-ctx hr{border:0;border-top:1px solid #343840;margin:4px 2px}`;
  document.head.append(st);
}

function diamond(ctx, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function ellipsis(ctx, s, w) {
  if (ctx.measureText(s).width <= w) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1);
  return s + '…';
}
