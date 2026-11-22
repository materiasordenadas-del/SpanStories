// Visor 3D: escena, cámara, controles del rig (anillos, cajas IK, polos, círculo raíz), gizmo y piel de cebolla.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CANON_BY_ID, IK_CHAINS } from '../core/humanoid.js';
import { horseControlPoints, horseChains, horseChainLabel } from '../core/horse-editor.js';
import { anatomicalSystem } from '../core/anatomical-constraints.js';
import { prefs, setPrefs } from '../io/storage.js';

/** Altura mínima de la cámara sobre el suelo (metros): nunca lo atraviesa. */
const FLOOR_CLEARANCE = 0.05;
const COL = { L: 0x4aa8ff, R: 0xff5a6e, C: 0xffc23d, ik: 0x3dffb0, pole: 0xc58bff, sel: 0xffffff, pin: 0xffa02e, far: 0xff3b3b, hips: 0xff8a2a, finger: 0x5dffa0 };
// Puntos de control (iClone): centro naranja, lado derecho del personaje verde lima, izquierdo cian.
const DOT = { C: 0xf5a623, R: 0x8cc63f, L: 0x3bb0d8, sel: 0xd6ff5c, pin: 0xffffff };

function sideOf(canon) {
  if (!canon) return 'C';
  if (canon.endsWith('L')) return 'L';
  if (canon.endsWith('R') && canon !== 'upperChest') return 'R';
  return 'C';
}

export class Viewport {
  constructor(container, app) {
    this.app = app;
    this.container = container;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setClearColor(0x000000, 1); // opaco; «En escena» lo vuelve transparente para ver el escenario del Estudio debajo
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.bg = new THREE.Color(0x1d2026);
    this.scene.background = this.bg;
    this.persp = new THREE.PerspectiveCamera(35, 1, 0.01, 500);
    this.persp.position.set(2.6, 1.7, 3.6);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 500);
    this.camera = this.persp;
    this.orbit = new OrbitControls(this.camera, r.domElement);
    this.orbit.target.set(0, 0.95, 0);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.12;

    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3328, 1.1);
    this.scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 2.2));
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 20 });
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0x9fb7ff, 0.6);
    fill.position.set(-4, 3, -3);
    this.scene.add(fill);

    this.grid = new THREE.GridHelper(40, 40, 0x56606e, 0x2c323b);
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.8;
    this.scene.add(this.grid);
    const ground = (this.ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.28 })));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.charHolder = new THREE.Group();
    this.scene.add(this.charHolder);
    this.handles = new THREE.Group();
    this.handles.renderOrder = 10;
    this.scene.add(this.handles);
    this.ghosts = new THREE.Group();
    this.scene.add(this.ghosts);
    this.skelHelper = null;

    this.gizmo = new TransformControls(this.camera, r.domElement);
    // Tamaño del gizmo: base por modo (rotar = aros grandes, como el Control Rig) × factor del usuario (+/-).
    this.gizmoScale = Math.min(3, Math.max(0.5, +prefs('gizmoScale', 1) || 1));
    this.gizmo.setSize(0.8);
    // Rotación limpia: solo los tres aros X/Y/Z. Fuera el aro de pantalla (E) y la esfera trackball (XYZE):
    // con el gizmo grande, esa esfera tapaba el cuerpo y robaba los clics a otras articulaciones.
    const tg = this.gizmo._gizmo;
    for (const grp of [tg?.gizmo?.rotate, tg?.picker?.rotate]) for (const hd of [...(grp?.children || [])]) if (hd.name === 'E' || hd.name === 'XYZE') grp.remove(hd);
    this.scene.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      app.onGizmoDrag(e.value);
    });
    // Cada movimiento del ratón solo marca el cambio; las claves y la pose se calculan una vez por fotograma, justo
    // antes de pintar (app.flushGizmo en el bucle): sin trabajo repetido y sin fotograma de retraso.
    this.gizmo.addEventListener('objectChange', () => app.queueGizmoChange());

    this.opts = { bones: false, controls: true, wire: false, grey: false, xray: false, onion: false, onionN: 2, onionStep: 3, follow: false };
    // Estilo de los controles sobre el personaje: «puntos» (círculos de colores en las articulaciones, como los de
    // Edit Motion Layer de iClone) o «aros» (formas del Control Rig). Por defecto, puntos.
    try { this.ctlStyle = JSON.parse(localStorage.getItem('taller:ctlStyle') || '"puntos"') === 'aros' ? 'aros' : 'puntos'; } catch { this.ctlStyle = 'puntos'; }
    this.handleVis = { torso: true, hips: true, spine: true, fingersL: false, fingersR: false, ikHandL: true, ikHandR: true, armL: true, armR: true, poleL: true, poleR: true, shoulderL: true, shoulderR: true, ikFootL: true, ikFootR: true, legL: true, legR: true, kneeL: true, kneeR: true, root: true };

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    let down = null;
    r.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    r.domElement.addEventListener('pointerup', (e) => {
      // Motion Director: Alt+clic = destino, puntos de camino y arrastre de sus marcas
      if (app.directorUI?.pointerUp(e)) return (down = null);
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
      if (this.gizmo.dragging || this.gizmo.axis) return;
      const pg = app.pivotView?.gizmo;
      if (pg && (pg.dragging || pg.axis)) return; // gizmo del pivote temporal (Herramientas)
      this.pick(e);
    });
    r.domElement.addEventListener('dblclick', (e) => this.pick(e, true));
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.updateOrtho();
  }

  updateOrtho() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const d = this.camera.position.distanceTo(this.orbit.target);
    const half = Math.tan((this.persp.fov * Math.PI) / 360) * d;
    this.ortho.top = half;
    this.ortho.bottom = -half;
    this.ortho.left = (-half * w) / h;
    this.ortho.right = (half * w) / h;
    this.ortho.updateProjectionMatrix();
  }

  setOrtho(on) {
    const from = this.camera;
    const to = on ? this.ortho : this.persp;
    if (from === to) return;
    to.position.copy(from.position);
    to.quaternion.copy(from.quaternion);
    this.camera = to;
    this.orbit.object = to;
    this.gizmo.camera = to;
    if (this.app.pivotView) this.app.pivotView.gizmo.camera = to;
    this.updateOrtho();
  }

  viewFrom(dir) {
    const t = this.orbit.target;
    const d = this.camera.position.distanceTo(t);
    const v = { front: [0, 0, 1], back: [0, 0, -1], right: [-1, 0, 0], left: [1, 0, 0], top: [0, 1, 0.0001], persp: [0.6, 0.35, 0.85] }[dir];
    this.camera.position.copy(t).add(new THREE.Vector3(...v).normalize().multiplyScalar(d));
    this.camera.lookAt(t);
    this.setOrtho(dir !== 'persp');
  }

  setCharacter(root, { reframe = true } = {}) {
    this.charHolder.clear();
    this.charHolder.add(root);
    this.original = new Map();
    root.traverse((o) => {
      if (o.isMesh) this.original.set(o, o.material);
    });
    this.buildHandles();
    this.applyShading();
    this.setBones(this.opts.bones);
    if (reframe) this.reframe();
  }

  reframe() {
    const rig = this.app.rig;
    if (!rig) return;
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    rig.bones.forEach((b) => box.expandByPoint(new THREE.Vector3().setFromMatrixPosition(b.matrixWorld)));
    if (box.isEmpty()) box.setFromObject(rig.root);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const h = Math.max(size.y, size.x, 0.5) * 1.15;
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
    this.orbit.target.copy(c);
    this.camera.position.copy(c).addScaledVector(dir, h / (2 * Math.tan((this.persp.fov * Math.PI) / 360)) + size.z);
    this.updateOrtho();
  }

  applyShading() {
    // Los materiales que crea el sombreado (gris, alambre, rayos X) se liberan al cambiarlo; los del modelo nunca.
    for (const m of this._shadeMats || []) m.dispose();
    const made = (this._shadeMats = []);
    const grey = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.7 });
    made.push(grey);
    for (const [o, m] of this.original || []) {
      let mat = this.opts.grey ? grey : m;
      if (this.opts.wire || this.opts.xray) {
        mat = (Array.isArray(mat) ? mat : [mat]).map((x) => {
          const c = x.clone();
          made.push(c);
          c.wireframe = this.opts.wire;
          if (this.opts.xray) {
            c.transparent = true;
            c.opacity = 0.45;
            c.depthWrite = false;
          }
          return c;
        });
        if (mat.length === 1) mat = mat[0];
      }
      o.material = mat;
    }
  }

  setBones(on) {
    this.opts.bones = on;
    if (this.skelHelper) {
      this.scene.remove(this.skelHelper);
      this.skelHelper.dispose?.();
      this.skelHelper = null;
    }
    if (on && this.app.rig) {
      this.skelHelper = new THREE.SkeletonHelper(this.app.rig.root);
      this.skelHelper.material.depthTest = false;
      this.skelHelper.material.transparent = true;
      this.skelHelper.renderOrder = 9;
      this.scene.add(this.skelHelper);
    }
  }

  // ---------- Controles del rig ----------
  /** Cambia el estilo de los controles del personaje: «puntos» o «aros». */
  setControlStyle(style) {
    this.ctlStyle = style === 'aros' ? 'aros' : 'puntos';
    try { localStorage.setItem('taller:ctlStyle', JSON.stringify(this.ctlStyle)); } catch { /* sin almacenamiento */ }
    this.buildHandles();
    this.app.attachGizmo?.();
  }

  buildHandles() {
    // Tiradores del rig anterior: geometría y material propios de cada uno (se rehacen al cambiar de personaje).
    this.handles.traverse((o) => { if (o.isMesh || o.isLine) { o.geometry?.dispose?.(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.()); } });
    this.handles.clear();
    this.handleList = [];
    const rig = this.app.rig;
    if (!rig) return;
    if (this.ctlStyle !== 'aros') return this.buildDots();
    const H = rig.hipsHeight;
    const mk = (geo, color, data) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }));
      m.renderOrder = 11;
      m.userData = data;
      this.handles.add(m);
      this.handleList.push(m);
      return m;
    };
    const controls = rig.kind === 'quadruped' ? horseControlPoints(rig) : Object.entries(rig.mapping).map(([canon, name]) => ({ canon, bone: rig.byName.get(name) }));
    for (const { canon, bone, group, label } of controls) {
      if (!bone) continue;
      const def = CANON_BY_ID[canon];
      const finger = (group || def.group).startsWith('fingers');
      let r = finger ? 0.011 : 0.05;
      if (canon === 'hips') r = 0.16;
      else if (/spine|chest/i.test(canon)) r = 0.13;
      else if (canon === 'head') r = 0.11;
      else if (canon === 'neck') r = 0.06;
      else if (/upperLeg/.test(canon)) r = 0.08;
      else if (/lowerLeg|upperArm/.test(canon)) r = 0.06;
      r *= H / 0.95;
      // Estilo Control Rig: cadera = octógono naranja horizontal; columna/cuello/cabeza = aros planos y gruesos;
      // dedos = bolitas verdes fáciles de tocar; resto = aro fino del color de su lado.
      const spineLike = /spine|chest|neck|head/i.test(canon);
      let geo;
      if (canon === 'hips') geo = new THREE.TorusGeometry(r * 1.25, r * 0.07, 3, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8);
      else if (finger) geo = new THREE.SphereGeometry(r * 1.4, 10, 8);
      else if (spineLike) geo = new THREE.TorusGeometry(r, r * 0.1, 2, 36).scale(1.15, 0.8, 1);
      else geo = new THREE.TorusGeometry(r, r * 0.07, 6, 28);
      const color = canon === 'hips' ? COL.hips : finger ? COL.finger : COL[sideOf(canon)];
      mk(geo, color, { kind: 'bone', bone, canon, group, label, color });
    }
    for (const [chain, def] of Object.entries(IK_CHAINS)) {
      const s = 0.07 * (H / 0.95);
      const side = chain.endsWith('L') ? 'L' : 'R';
      const isHand = chain.startsWith('hand');
      const label = rig.kind === 'quadruped' ? horseChainLabel(chain) : def.label;
      mk(new THREE.BoxGeometry(s * (isHand ? 1.4 : 1), s, s * (isHand ? 1.2 : 1)), COL[side], { kind: 'ik', chain, label, color: COL[side] }).material.wireframe = true;
      // Polo: esfera del color de su lado, unida al codo/rodilla por una línea (la línea no se elige).
      const pole = mk(new THREE.SphereGeometry(s * 0.42, 14, 10), COL[side], { kind: 'pole', chain, label: `Polo ${label}`, color: COL[side] });
      const link = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xdddddd, depthTest: false, transparent: true, opacity: 0.7 }));
      link.renderOrder = 11;
      link.frustumCulled = false;
      this.handles.add(link);
      pole.userData.link = link;
      // Pie: huella plana en el suelo (como el Control Rig); se elige igual que la caja IK del pie.
      if (!isHand) {
        const w = 0.075 * H;
        const len = 0.3 * H;
        const outline = (k) => {
          const sh = new THREE.Shape();
          sh.absellipse(0, len * 0.18, w * k, len * 0.42 * k, 0, Math.PI, false);
          sh.absellipse(0, -len * 0.22, w * 0.8 * k, len * 0.3 * k, Math.PI, Math.PI * 2, false);
          return sh;
        };
        const outer = outline(1);
        outer.holes.push(new THREE.Path(outline(0.8).getPoints(24)));
        mk(new THREE.ShapeGeometry(outer, 24).rotateX(-Math.PI / 2), COL[side], { kind: 'print', chain, label: def.label, color: COL[side] });
      }
    }
    // Raíz: hexágono en el suelo + flecha hacia donde mira el personaje (gira en Y con la herramienta Rotar).
    mk(new THREE.RingGeometry(0.46 * H, 0.5 * H, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2), COL.C, { kind: 'root', color: COL.C });
    const a = 0.1 * H;
    const tip = 0.4 * H;
    const arrow = new THREE.Shape();
    arrow.moveTo(0, tip).lineTo(-a * 1.2, tip - a * 1.4).lineTo(-a * 0.45, tip - a * 1.4).lineTo(-a * 0.45, 0.1 * H).lineTo(a * 0.45, 0.1 * H).lineTo(a * 0.45, tip - a * 1.4).lineTo(a * 1.2, tip - a * 1.4).closePath();
    // la forma apunta a +Y; rotateX(-90°) la lleva a -Z y rotateY(180°) a +Z = «delante» con yaw 0
    mk(new THREE.ShapeGeometry(arrow).rotateX(-Math.PI / 2).rotateY(Math.PI), COL.C, { kind: 'root', arrow: true, color: COL.C });
    this.selRing = null;
  }

  updateHandles() {
    const rig = this.app.rig;
    if (!rig || !this.handleList) return;
    if (this.ctlStyle !== 'aros') return this.updateDots();
    const sel = this.app.selection;
    const show = this.opts.controls;
    const eng = this.app.engine;
    const v = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    // Dedos a la vista solos al elegir la mano, su caja IK o un dedo (como al acercarse a la mano en el Control Rig).
    let autoF = null;
    if (sel?.kind === 'ik' && sel.chain?.startsWith('hand')) autoF = sel.chain.slice(-1);
    else if (sel?.kind === 'bone') {
      const c = rig.canonOf.get(sel.bone);
      if (c && (/^hand[LR]$/.test(c) || CANON_BY_ID[c]?.group.startsWith('fingers'))) autoF = c.slice(-1);
    }
    for (const m of this.handleList) {
      const d = m.userData;
      let vis = show;
      let selected = false;
      if (d.kind === 'bone') {
        d.bone.matrixWorld.decompose(v, q, s);
        m.position.copy(v);
        // anillo perpendicular al hueso
        const child = d.bone.children.find((c) => c.isBone || rig.index.has(c));
        if (d.canon === 'hips') m.quaternion.copy(rig.Fq);
        else if (child) {
          const cp = new THREE.Vector3().setFromMatrixPosition(child.matrixWorld);
          const dir = cp.sub(v);
          if (dir.lengthSq() > 1e-12) m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
          if (rig.kind !== 'quadruped' && !/^(hand|foot|head|toes)/.test(d.canon)) m.position.lerp(new THREE.Vector3().setFromMatrixPosition(child.matrixWorld), 0.35);
        } else m.quaternion.copy(q);
        const g = d.group || CANON_BY_ID[d.canon].group;
        const side = sideOf(d.canon);
        if (g === 'torso' && d.canon === 'hips') vis &&= this.handleVis.hips;
        else if (g === 'torso' || g === 'head') vis &&= this.handleVis.spine;
        else if (g.startsWith('fingers')) vis &&= this.handleVis[g] || autoF === side;
        else if (/shoulder/.test(d.canon)) vis &&= this.handleVis[`shoulder${side}`];
        else if (g.startsWith('arm')) {
          vis &&= this.handleVis[`arm${side}`];
          if (rig.kind !== 'quadruped' && eng.doc.ik[`hand${side}`] && /upperArm|lowerArm/.test(d.canon)) vis = false;
        } else if (g.startsWith('leg')) {
          vis &&= this.handleVis[`leg${side}`];
          if (rig.kind !== 'quadruped' && eng.doc.ik[`foot${side}`] && /upperLeg|lowerLeg/.test(d.canon)) vis = false;
        }
        selected = (sel && sel.kind === 'bone' && sel.bone === d.bone) || (this.app.multi && this.app.multi.has(d.bone));
      } else if (d.kind === 'ik' || d.kind === 'pole') {
        const st = eng.ikState[d.chain];
        const on = eng.doc.ik[d.chain];
        const side = d.chain.endsWith('L') ? 'L' : 'R';
        const isHand = d.chain.startsWith('hand');
        vis &&= !!(st && on) && this.handleVis[d.kind === 'ik' ? (isHand ? `ikHand${side}` : `ikFoot${side}`) : isHand ? `pole${side}` : `knee${side}`];
        if (st) {
          const X = this.app.displayXform;
          if (d.kind === 'ik') {
            m.position.copy(st.target);
            m.quaternion.copy(st.targetQ);
            if (X) { this.app.ikDisplayPos(d.chain, m.position); m.quaternion.premultiply(new THREE.Quaternion().setFromRotationMatrix(X)); }
          } else {
            m.position.copy(st.pole);
            if (X) m.position.applyMatrix4(X);
            const mid = rig.kind === 'quadruped' ? horseChains(rig)[d.chain]?.[1] : rig.bone(IK_CHAINS[d.chain].bones[1]);
            if (d.link && mid) {
              mid.getWorldPosition(v);
              const pa = d.link.geometry.attributes.position;
              pa.setXYZ(0, v.x, v.y, v.z);
              pa.setXYZ(1, m.position.x, m.position.y, m.position.z);
              pa.needsUpdate = true;
            }
          }
        }
        if (d.link) d.link.visible = vis;
        selected = sel && sel.kind === d.kind && sel.chain === d.chain;
      } else if (d.kind === 'print') {
        // huella bajo el pie: misma visibilidad que la caja IK del pie
        const st = eng.ikState[d.chain];
        const side = d.chain.endsWith('L') ? 'L' : 'R';
        vis &&= !!(st && eng.doc.ik[d.chain]) && this.handleVis[`ikFoot${side}`] && !this.app.displayXform; // montado: sin huella en el suelo
        if (st) {
          m.position.set(st.target.x, 0.003, st.target.z);
          m.rotation.set(0, this.yawOf(this.footDir(d.chain, v)), 0);
        }
        selected = sel && sel.kind === 'ik' && sel.chain === d.chain;
      } else if (d.kind === 'root') {
        vis &&= this.handleVis.root;
        const hb = rig.bone('hips');
        if (hb) {
          hb.getWorldPosition(v);
          const y = this.yawOf(this.facingDir(s));
          m.position.set(v.x, 0.002, v.z);
          m.rotation.set(0, y, 0);
        }
        selected = sel && sel.kind === 'root';
      }
      // Mientras se arrastra el gizmo (girar, mover o escalar) solo queda a la vista el control elegido.
      if (this.gizmo.dragging && !selected) vis = false;
      if (d.link && this.gizmo.dragging && !selected) d.link.visible = false;
      m.visible = vis;
      // caja IK: roja si el objetivo queda fuera del alcance, naranja si está anclada en el mundo
      const ist = d.kind === 'ik' ? eng.ikState[d.chain] : null;
      const ikCol = ist && ist.reach > 1.002 ? COL.far : selected ? COL.sel : ist && ist.pin > 0.5 ? COL.pin : d.color ?? COL.ik;
      m.material.wireframe = d.kind === 'ik' ? !(ist && ist.pin > 0.5) : m.material.wireframe;
      m.material.color.setHex(d.kind === 'ik' ? ikCol : selected ? COL.sel : d.color ?? COL.C);
      m.material.opacity = selected ? 1 : 0.85;
    }
  }

  // ---------- Puntos de control (como Edit Motion Layer de iClone) ----------
  /**
   * Un círculo plano de cara a la cámara en cada articulación: naranja en el centro del cuerpo, verde en el lado
   * derecho del personaje y cian en el izquierdo. Semitransparentes y sin borde; el elegido se agranda y se aclara,
   * y solo él lleva el gizmo. Mano y pie en IK: el punto es su efector (sigue al objetivo). Dedos: puntos pequeños
   * a la vista al elegir esa mano.
   */
  buildDots() {
    const rig = this.app.rig;
    const H = rig.hipsHeight;
    const disc = new THREE.CircleGeometry(1, 28);
    const mk = (data, r, color) => {
      const m = new THREE.Mesh(disc.clone(), new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
      m.renderOrder = 12;
      m.userData = { ...data, r, color, dot: true };
      m.scale.setScalar(r);
      this.handles.add(m);
      this.handleList.push(m);
      return m;
    };
    const MAIN = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR', 'lowerArmL', 'lowerArmR', 'handL', 'handR', 'upperLegL', 'upperLegR', 'lowerLegL', 'lowerLegR', 'footL', 'footR', 'toesL', 'toesR'];
    const controls = rig.kind === 'quadruped' ? horseControlPoints(rig) : Object.entries(rig.mapping).map(([canon, name]) => ({ canon, bone: rig.byName.get(name) }));
    for (const { canon, bone, group, label } of controls) {
      if (!bone) continue;
      const finger = CANON_BY_ID[canon]?.group.startsWith('fingers');
      if (rig.kind !== 'quadruped' && !finger && !MAIN.includes(canon)) continue;
      let r = 0.045 * H;
      if (canon === 'hips' || canon === 'head') r = 0.058 * H;
      else if (/spine|chest/i.test(canon)) r = 0.05 * H;
      else if (/shoulder|neck|toes/.test(canon)) r = 0.032 * H;
      else if (finger) r = 0.014 * H;
      mk({ kind: 'bone', bone, canon, group, label }, r, DOT[sideOf(canon)]);
    }
    // efectores IK de manos y pies (en lugar del punto del hueso cuando la cadena está en IK)
    for (const chain of Object.keys(IK_CHAINS)) {
      const label=rig.kind==='quadruped'?horseChainLabel(chain):IK_CHAINS[chain].label;
      const ik=mk({kind:'ik',chain,label:`Objetivo IK · ${label}`},.05*H,DOT[chain.endsWith('L')?'L':'R']);
      if(rig.kind==='quadruped') {
        ik.geometry.dispose();ik.geometry=new THREE.RingGeometry(.72,1,4).rotateZ(Math.PI/4);
        const pole=mk({kind:'pole',chain,label:`Polo auxiliar · ${label} (no es una articulación)`},.028*H,COL.pole);
        pole.geometry.dispose();pole.geometry=new THREE.RingGeometry(.65,1,4);
        const link=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:COL.pole,depthTest:false,transparent:true,opacity:.45}));
        link.frustumCulled=false;this.handles.add(link);pole.userData.link=link;
      }
    }
    this.selRing = null;
  }

  updateDots() {
    const rig = this.app.rig;
    const sel = this.app.selection;
    const eng = this.app.engine;
    const camQ = this.camera.quaternion;
    const v = new THREE.Vector3();
    const show = this.opts.controls;
    let autoF = null;
    if (sel?.kind === 'ik' && sel.chain?.startsWith('hand')) autoF = sel.chain.slice(-1);
    else if (sel?.kind === 'bone') {
      const c = rig.canonOf.get(sel.bone);
      if (c && (/^hand[LR]$/.test(c) || CANON_BY_ID[c]?.group.startsWith('fingers'))) autoF = c.slice(-1);
    }
    // tamaño casi constante en pantalla: crece un poco al alejarse (como en iClone)
    const dist = this.camera.isOrthographicCamera ? rig.hipsHeight * 3.2 : this.camera.position.distanceTo(this.orbit.target);
    const k = THREE.MathUtils.clamp(dist / (rig.hipsHeight * 3.2), 0.75, 2.2);
    for (const m of this.handleList) {
      const d = m.userData;
      let vis = show;
      let selected = false;
      if (d.kind === 'bone') {
        d.bone.getWorldPosition(v);
        if (d.canon === 'head' && rig.kind !== 'quadruped') {
          const child = d.bone.children.find((c) => rig.index.has(c));
          if (child) v.lerp(new THREE.Vector3().setFromMatrixPosition(child.matrixWorld), 0.45);
        }
        m.position.copy(v);
        const g = d.group || CANON_BY_ID[d.canon].group;
        const side = sideOf(d.canon);
        if (d.canon === 'hips') vis &&= this.handleVis.hips;
        else if (g === 'torso' || g === 'head') vis &&= this.handleVis.spine;
        else if (g.startsWith('fingers')) vis &&= this.handleVis[g] || autoF === side;
        else if (/shoulder/.test(d.canon)) vis &&= this.handleVis[`shoulder${side}`];
        else if (g.startsWith('arm')) vis &&= this.handleVis[`arm${side}`] && !(rig.kind!=='quadruped' && /^hand/.test(d.canon) && eng.doc.ik[`hand${side}`]);
        else if (g.startsWith('leg')) vis &&= this.handleVis[`leg${side}`] && !(rig.kind!=='quadruped' && /^foot/.test(d.canon) && eng.doc.ik[`foot${side}`]);
        const poleBone = sel?.kind === 'pole' && (rig.kind === 'quadruped' ? horseChains(rig)[sel.chain]?.[1] : rig.bone(IK_CHAINS[sel.chain]?.bones[1]));
        selected = (sel && sel.kind === 'bone' && sel.bone === d.bone) || (sel?.kind === 'root' && d.canon === 'hips') || poleBone === d.bone || !!(this.app.multi && this.app.multi.has(d.bone));
      } else if (d.kind === 'ik') {
        const st = eng.ikState[d.chain];
        const side = d.chain.endsWith('L') ? 'L' : 'R';
        vis &&= !!(st && eng.doc.ik[d.chain]) && this.handleVis[d.chain.startsWith('hand') ? `ikHand${side}` : `ikFoot${side}`];
        if (st) m.position.copy(st.target);
        if (st && this.app.displayXform) this.app.ikDisplayPos(d.chain, m.position); // jinete montado
        selected = sel && sel.kind === 'ik' && sel.chain === d.chain;
      } else if (d.kind==='pole') {
        const st=eng.ikState[d.chain],side=d.chain.endsWith('L')?'L':'R';
        vis &&= !!(st&&eng.doc.ik[d.chain]) && this.handleVis[d.chain.startsWith('hand')?`pole${side}`:`knee${side}`];
        if(st) {
          m.position.copy(st.pole);
          if (this.app.displayXform) m.position.applyMatrix4(this.app.displayXform);
          const knee=horseChains(rig)[d.chain]?.[1];
          if(knee&&d.link) {
            knee.getWorldPosition(v);const a=d.link.geometry.attributes.position;
            a.setXYZ(0,v.x,v.y,v.z);a.setXYZ(1,m.position.x,m.position.y,m.position.z);a.needsUpdate=true;
          }
        }
        selected=sel?.kind==='pole'&&sel.chain===d.chain;
      }
      if (this.gizmo.dragging && !selected) vis = false;
      m.visible = vis;
      if(d.link)d.link.visible=vis;
      m.quaternion.copy(camQ);
      const pinned = d.kind === 'ik' && (eng.ikState[d.chain]?.pin || 0) > 0.5;
      m.scale.setScalar(d.r * k * (selected ? 1.3 : 1));
      const state=rig.kind==='quadruped'&&selected ? anatomicalSystem(rig)?.status.get(d.bone) : null;
      const limitColor=state ? state.limited?0xff5555:state.near?0xffc23d:0x3dffb0 : null;
      m.material.color.setHex(limitColor ?? (d.kind==='ik'&&eng.ikState[d.chain]?.limited?COL.far:selected ? DOT.sel : pinned ? DOT.pin : d.color));
      m.material.opacity = selected ? 0.95 : 0.72;
    }
  }

  /** Ángulo Y (rad) de una dirección en el suelo, con +Z = 0. */
  yawOf(dir) {
    return Math.atan2(dir.x, dir.z);
  }

  /** Hacia dónde mira el cuerpo: el «delante» de reposo girado con la cadera, aplanado al suelo. */
  facingDir(out = new THREE.Vector3()) {
    const rig = this.app.rig;
    const hb = rig?.bone('hips');
    const rq = rig?.restWorldQ?.hips;
    out.copy(rig?.frame?.fwd || new THREE.Vector3(0, 0, 1));
    if (hb && rq) out.applyQuaternion(hb.getWorldQuaternion(new THREE.Quaternion()).multiply(rq.clone().invert()));
    out.y = 0;
    return out.lengthSq() > 1e-8 ? out.normalize() : out.set(0, 0, 1);
  }

  /** Dirección del pie (tobillo → dedos) aplanada; sin dedos, la del cuerpo. */
  footDir(chain, out = new THREE.Vector3()) {
    const rig = this.app.rig;
    const side = chain.endsWith('L') ? 'L' : 'R';
    const f = rig?.bone(`foot${side}`);
    const t = rig?.bone(`toes${side}`);
    if (f && t) {
      out.setFromMatrixPosition(t.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(f.matrixWorld));
      out.y = 0;
      if (out.lengthSq() > 1e-8) return out.normalize();
    }
    return this.facingDir(out);
  }

  async pick(e, dbl = false) {
    const pickId = this.pickId = (this.pickId || 0) + 1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const vis = (this.handleList || []).filter((m) => m.visible);
    const hits = this.raycaster.intersectObjects(vis, false);
    if (hits.length) {
      // preferir lo más pequeño (dedos, cajas) cuando hay varias capas
      hits.sort((a, b) => a.distance - b.distance);
      const d = hits[0].object.userData;
      this.app.select(d.kind === 'bone' ? { kind: 'bone', bone: d.bone } : d.kind === 'print' ? { kind: 'ik', chain: d.chain } : { kind: d.kind, chain: d.chain }, e.shiftKey);
      return;
    }
    const st = this.app.stage;
    if (st) {
      const prop = st.pickProp(this.raycaster);
      if (prop) return this.app.select({ kind: 'prop', prop });
      const piece = st.pickPiece(this.raycaster);
      if (piece) return this.app.select({ kind: 'piece', piece });
    }
    if (!dbl && (e.button ?? 0) === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && this.app.sceneLive?.on) {
      if (await this.app.sceneLive.pickActor(this.raycaster.ray, () => pickId === this.pickId)) return;
      if (pickId !== this.pickId) return;
    }
    // Clic sobre la malla: hueso más cercano al punto.
    const meshes = [];
    this.charHolder.traverse((o) => o.isMesh && o.visible && meshes.push(o));
    const mh = this.raycaster.intersectObjects(meshes, false);
    if (mh.length && this.app.rig) {
      const p = mh[0].point;
      let best = null;
      let bd = Infinity;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      for (const [canon, name] of Object.entries(this.app.rig.mapping)) {
        const bone = this.app.rig.byName.get(name);
        a.setFromMatrixPosition(bone.matrixWorld);
        const child = bone.children.find((c) => this.app.rig.index.has(c));
        if (child) b.setFromMatrixPosition(child.matrixWorld);
        else b.copy(a);
        const seg = new THREE.Line3(a, b);
        const cp = seg.closestPointToPoint(p, true, new THREE.Vector3());
        const dd = cp.distanceTo(p);
        if (dd < bd) {
          bd = dd;
          best = bone;
        }
      }
      if (best) {
        this.app.select({ kind: 'bone', bone: best }, e.shiftKey);
        return;
      }
    }
    if (!e.shiftKey) this.app.select(null);
  }

  attachGizmo(obj, mode, space, { yOnly = false } = {}) {
    if (!obj) {
      this.gizmo.detach();
      return;
    }
    this.gizmo.showX = this.gizmo.showZ = !yOnly;
    this.gizmo.attach(obj);
    this.gizmo.setMode(mode);
    this.gizmo.setSpace(space === 'local' ? 'local' : 'world');
    this.applyGizmoSize();
  }

  /** Tamaño en pantalla según el modo: al tocar una articulación (incluso una falange) los aros de giro rodean bien la zona. */
  applyGizmoSize() {
    const base = { rotate: 2, translate: 1, scale: 0.9 }[this.gizmo.mode] ?? 1;
    this.gizmo.setSize(base * this.gizmoScale);
  }

  setGizmoScale(v) {
    this.gizmoScale = Math.round(Math.min(3, Math.max(0.5, +v || 1)) * 100) / 100;
    setPrefs('gizmoScale', this.gizmoScale);
    this.applyGizmoSize();
    return this.gizmoScale;
  }

  // ---------- Piel de cebolla ----------
  updateOnion() {
    // Cada fantasma lleva materiales (y esqueleto clonado) propios: se liberan antes de rehacerlos.
    // La geometría la comparte con el personaje (SkeletonUtils.clone), así que no se toca.
    for (const ghost of this.ghosts.children) ghost.traverse((o) => { if (o.isMesh) o.material?.dispose?.(); if (o.isSkinnedMesh) o.skeleton?.dispose?.(); });
    this.ghosts.clear();
    if (!this.opts.onion || !this.app.rig || this.app.playing) return;
    const eng = this.app.engine;
    const f0 = eng.frame;
    const rig = this.app.rig;
    const n = this.opts.onionN;
    for (let i = -n; i <= n; i++) {
      if (!i) continue;
      const f = f0 + i * this.opts.onionStep;
      eng.evaluate(f);
      const ghost = SkeletonUtils.clone(rig.root);
      const color = i < 0 ? 0xff7a45 : 0x45c8ff;
      const alpha = 0.28 * (1 - (Math.abs(i) - 1) / n);
      ghost.traverse((o) => {
        if (o.isMesh) {
          o.material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, depthWrite: false });
          o.castShadow = false;
        }
      });
      this.ghosts.add(ghost);
    }
    eng.evaluate(f0);
  }

  // ---------- Selección por caja (B) ----------
  startBoxSelect() {
    if (this._box) return;
    const el = this.renderer.domElement;
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;border:1px dashed #3dffb0;background:#3dffb022;pointer-events:none;display:none';
    this.container.appendChild(div);
    this.orbit.enabled = false;
    this.app.toast('Arrastra una caja sobre los controles (Mayús: añadir, Esc: cancelar)');
    let a = null;
    const rect = () => el.getBoundingClientRect();
    const down = (e) => {
      a = [e.clientX, e.clientY, e.shiftKey];
      div.style.display = 'block';
    };
    const move = (e) => {
      if (!a) return;
      const r = rect();
      const x0 = Math.min(a[0], e.clientX) - r.left;
      const y0 = Math.min(a[1], e.clientY) - r.top;
      Object.assign(div.style, { left: `${x0}px`, top: `${y0}px`, width: `${Math.abs(e.clientX - a[0])}px`, height: `${Math.abs(e.clientY - a[1])}px` });
    };
    const finish = (e) => {
      cleanup();
      if (!a || !e) return;
      const r = rect();
      const [x0, x1] = [Math.min(a[0], e.clientX), Math.max(a[0], e.clientX)];
      const [y0, y1] = [Math.min(a[1], e.clientY), Math.max(a[1], e.clientY)];
      const picked = [];
      for (const m of this.handleList || []) {
        if (!m.visible || m.userData.kind !== 'bone') continue;
        const p = m.position.clone().project(this.camera);
        const sx = r.left + ((p.x + 1) / 2) * r.width;
        const sy = r.top + ((1 - p.y) / 2) * r.height;
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && p.z < 1) picked.push(m.userData.bone);
      }
      const prev = a[2] ? this.app.selectedBones() : [];
      this.app.selectMany([...new Set([...prev, ...picked])]);
    };
    const esc = (e) => e.key === 'Escape' && (cleanup(), (a = null));
    const cleanup = () => {
      el.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('keydown', esc);
      div.remove();
      this.orbit.enabled = true;
      this._box = null;
    };
    el.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('keydown', esc);
    this._box = cleanup;
  }

  // ---------- Vista cuádruple y cámara de plano ----------
  _renderView(cam, x, y, w, h) {
    const r = this.renderer;
    r.setViewport(x, y, w, h);
    r.setScissor(x, y, w, h);
    r.setScissorTest(true);
    r.render(this.scene, cam);
  }

  _orthoCam(dir) {
    this._quadCams ||= {};
    const c = (this._quadCams[dir] ||= new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 500));
    const t = this.orbit.target;
    const v = { top: [0, 1, 0.0001], front: [0, 0, 1], right: [-1, 0, 0] }[dir];
    c.position.copy(t).add(new THREE.Vector3(...v).multiplyScalar(10));
    c.lookAt(t);
    return c;
  }

  /**
   * Punto de mundo de lo seleccionado (hueso, raíz, control IK/polo, accesorio o pieza), o null sin selección.
   * Es el centro de la pantalla y de la órbita en todo momento (como el Editor de escenarios y el Estudio).
   */
  selectionPivot(out = new THREE.Vector3()) {
    const s = this.app.selection, rig = this.app.rig;
    if (!s || !rig) return null;
    if (s.kind === 'bone' && s.bone) return s.bone.getWorldPosition(out);
    if (s.kind === 'root') { const hb = rig.bone('hips'); return hb ? hb.getWorldPosition(out) : null; }
    if (s.kind === 'prop' || s.kind === 'piece') { const obj = s.kind === 'prop' ? s.prop?.obj : s.piece?.obj; return obj ? obj.getWorldPosition(out) : null; }
    // IK y polos: el proxy del gizmo está donde se ve el control (también sobre la silla del jinete montado).
    const g = this.gizmo.object;
    return g ? g.getWorldPosition(out) : null;
  }

  followSelection() {
    const now = performance.now(), dt = Math.min(0.1, (now - (this._pivotT || now)) / 1000);
    this._pivotT = now;
    // Durante un arrastre (gizmo o puntos del rig) la cámara no se mueve: si no, el arrastre se realimenta. Al soltar, se recentra.
    const p = this.selectionPivot(this._pivotP ||= new THREE.Vector3());
    const ok = !!p && [p.x, p.y, p.z].every(Number.isFinite);
    // Con algo seleccionado, desplazar la vista no tiene sentido (el centro lo manda la selección): el arrastre orbita.
    this.orbit.enablePan = !ok;
    if (!ok) return false;
    if (this.app.dragging || this.gizmo.dragging) return true;
    const d = p.sub(this.orbit.target);
    // Suavizado corto (≈0,1 s): elegir otra pieza no es un salto; seguir algo que se mueve es casi exacto.
    if (d.lengthSq() > 1e-6) d.multiplyScalar(1 - Math.exp(-dt * 22));
    this.orbit.target.add(d);
    this.camera.position.add(d);
    return true;
  }

  render() {
    if (this.followSelection()) { /* lo seleccionado manda el centro */ }
    else if (this.opts.follow && this.app.rig) {
      const hb = this.app.rig.bone('hips');
      if (hb) {
        const p = hb.getWorldPosition(new THREE.Vector3());
        const d = p.clone().sub(this.orbit.target);
        d.y = 0;
        this.orbit.target.add(d);
        this.camera.position.add(d);
      }
    }
    this.orbit.update();
    // La cámara no atraviesa el suelo (y=0 es el suelo bajo los pies del personaje, también «En escena»): ni ella ni
    // el punto al que mira bajan de él. Se puede mirar desde abajo, a ras de suelo, pero nunca desde debajo.
    // Solo en perspectiva: las vistas ortográficas (frente, lado, abajo…) son planos técnicos.
    if (this.camera === this.persp) {
      if (this.orbit.target.y < 0) this.orbit.target.y = 0;
      if (this.camera.position.y < FLOOR_CLEARANCE) this.camera.position.y = FLOOR_CLEARANCE;
    }
    // «En escena»: el escenario vivo pinta con uno o dos fotogramas de retraso (los mensajes pasan por el Estudio).
    // Los controles se dibujan con la cámara Y la pose que el escenario acaba de pintar: malla, puntos y gizmo van
    // juntos aunque se arrastre muy rápido (antes solo se esperaba a la cámara y los controles iban por delante).
    const live = this.app.sceneLive;
    const sync = live?.drawnView?.() || null;
    if (!sync || !live.applyDrawn) return this._draw();
    const restore = live.applyDrawn(sync);
    try {
      return this._draw();
    } finally {
      restore();
    }
  }

  _draw() {
    this.updateHandles();
    if (this.camera === this.ortho) this.updateOrtho();
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    const W = size.x;
    const H = size.y;
    const shot = this.shot;
    if (shot) {
      shot.helper.visible = shot.show && !shot.lookThrough && !this.quad;
      if (shot.lookThrough) {
        // mirar por la cámara: la vista mueve la cámara
        shot.cam.position.copy(this.camera.position);
        shot.cam.quaternion.copy(this.camera.quaternion);
        shot.cam.updateMatrixWorld();
      }
      shot.helper.update();
    }
    if (this.quad) {
      const w = Math.floor(W / 2);
      const h = Math.floor(H / 2);
      const views = [[this._orthoCam('top'), 0, h], [this._orthoCam('front'), w, h], [this._orthoCam('right'), 0, 0], [this.camera, w, 0]];
      const d = this.camera.position.distanceTo(this.orbit.target);
      const half = Math.tan((this.persp.fov * Math.PI) / 360) * d;
      for (const [cam, x, y] of views) {
        if (cam.isOrthographicCamera && cam !== this.ortho) {
          cam.top = half;
          cam.bottom = -half;
          cam.left = (-half * w) / h;
          cam.right = (half * w) / h;
          cam.updateProjectionMatrix();
        } else if (cam.isPerspectiveCamera) {
          cam.aspect = w / h;
          cam.updateProjectionMatrix();
        }
        this._renderView(cam, x, y, w, h);
      }
      this.persp.aspect = W / H;
      this.persp.updateProjectionMatrix();
    } else if (shot && shot.lookThrough) {
      // encuadre con la relación de aspecto de la cámara; fuera, más oscuro
      const a = shot.aspect;
      let w = W;
      let h = W / a;
      if (h > H) {
        h = H;
        w = H * a;
      }
      const x = (W - w) / 2;
      const y = (H - h) / 2;
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
      const bg = this.scene.background;
      r.setClearColor(0x000000);
      this.scene.background = null;
      r.clear();
      this.scene.background = bg;
      shot.cam.aspect = a;
      shot.cam.updateProjectionMatrix();
      this._renderView(shot.cam, x, y, w, h);
      shot.frameRect = { x, y: H - y - h, w, h };
    } else {
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
      r.render(this.scene, this.camera);
      if (shot && shot.mini) {
        const mw = Math.round(W * (shot.miniSize || 0.28));
        const mh = Math.round(mw / shot.aspect);
        shot.cam.aspect = shot.aspect;
        shot.cam.updateProjectionMatrix();
        const vis = [this.handles.visible, this.gizmo.getHelper().visible, shot.helper.visible];
        this.handles.visible = false;
        this.gizmo.getHelper().visible = false;
        shot.helper.visible = false;
        this._renderView(shot.cam, W - mw - 8, 8, mw, mh);
        [this.handles.visible, this.gizmo.getHelper().visible, shot.helper.visible] = vis;
      }
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    this.app.stage?.drawOverlay();
  }
}
