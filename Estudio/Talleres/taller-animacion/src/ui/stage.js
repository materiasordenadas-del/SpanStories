// Escena: objetos en la mano, piezas de referencia a tamaño real y cámara de plano.
import * as THREE from 'three';
import { loadModel } from '../io/loaders.js';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });

// ---------- Objetos de mano (hechos aquí, a tamaño real; el agarre en el origen, apuntando a +Y) ----------
function propEspada() {
  const g = new THREE.Group();
  const hoja = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.75, 0.006), mat(0xd8dde3, { metalness: 0.8, roughness: 0.25 }));
  hoja.position.y = 0.5;
  const punta = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), hoja.material);
  punta.position.y = 0.915;
  punta.rotation.y = Math.PI / 4;
  punta.scale.z = 0.25;
  const guarda = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.03), mat(0x6b4b2a));
  guarda.position.y = 0.12;
  const mango = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 10), mat(0x2b1d14));
  mango.position.y = 0.0;
  g.add(hoja, punta, guarda, mango);
  return g;
}
function propBaston() {
  const g = new THREE.Group();
  const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.6, 10), mat(0x7a5531));
  palo.position.y = 0.35;
  const gema = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05), mat(0x5ad1ff, { emissive: 0x1a6a90 }));
  gema.position.y = 1.18;
  g.add(palo, gema);
  return g;
}
function propAntorcha() {
  const g = new THREE.Group();
  const palo = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.016, 0.55, 8), mat(0x5a3d22));
  palo.position.y = 0.12;
  const fuego = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 10), mat(0xffa030, { emissive: 0xff6a00, emissiveIntensity: 1.2 }));
  fuego.position.y = 0.47;
  g.add(palo, fuego);
  return g;
}
function propFarol() {
  const g = new THREE.Group();
  const asa = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 16, Math.PI), mat(0x333333, { metalness: 0.6 }));
  const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 8), mat(0xffe08a, { emissive: 0xffb030, transparent: true, opacity: 0.85 }));
  cuerpo.position.y = -0.13;
  g.add(asa, cuerpo);
  return g;
}
function propEscudo() {
  const g = new THREE.Group();
  const e = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 24), mat(0x8a2f2f));
  e.rotation.z = Math.PI / 2;
  e.position.x = 0.04;
  const borde = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 6, 32), mat(0xb5a06a, { metalness: 0.7 }));
  borde.rotation.y = Math.PI / 2;
  borde.position.x = 0.05;
  g.add(e, borde);
  return g;
}
function propTelefono() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.009), mat(0x1b1d22));
  m.position.y = 0.05;
  const g = new THREE.Group();
  g.add(m);
  return g;
}
function propTaza() {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 16, 1, true), mat(0xf2efe8, { side: THREE.DoubleSide }));
  t.position.y = 0.02;
  g.add(t);
  return g;
}
function propPistola() {
  const g = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.2), mat(0x2a2c30, { metalness: 0.5 }));
  cuerpo.position.set(0, 0.05, 0.06);
  const culata = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.11, 0.04), cuerpo.material);
  culata.rotation.x = -0.25;
  g.add(cuerpo, culata);
  return g;
}

export const PROPS = [
  { id: 'espada', name: 'Espada', make: propEspada },
  { id: 'baston', name: 'Bastón mágico', make: propBaston },
  { id: 'antorcha', name: 'Antorcha', make: propAntorcha },
  { id: 'farol', name: 'Farol', make: propFarol },
  { id: 'escudo', name: 'Escudo', make: propEscudo, hand: 'L' },
  { id: 'pistola', name: 'Pistola (juguete)', make: propPistola },
  { id: 'telefono', name: 'Teléfono', make: propTelefono },
  { id: 'taza', name: 'Taza', make: propTaza },
];

// ---------- Piezas de referencia ----------
function wall() {
  const m = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 0.25), mat(0x9a8f80));
  m.position.y = 0.5;
  return m;
}
function tableChair() {
  const g = new THREE.Group();
  const madera = mat(0x8a6240);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.75), madera);
  top.position.y = 0.73;
  g.add(top);
  for (const [x, z] of [[-0.55, -0.32], [0.55, -0.32], [-0.55, 0.32], [0.55, 0.32]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.71, 0.05), madera);
    p.position.set(x, 0.355, z);
    g.add(p);
  }
  const silla = new THREE.Group();
  const asiento = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.04, 0.45), madera);
  asiento.position.y = 0.45;
  const resp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.04), madera);
  resp.position.set(0, 0.72, 0.2);
  silla.add(asiento, resp);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.04), madera);
    p.position.set(x, 0.225, z);
    silla.add(p);
  }
  silla.position.set(0, 0, 0.65);
  // punto «Silla» para el Motion Director: se sienta mirando a la mesa (-z)
  silla.name = 'Silla';
  Object.assign(silla.userData, { ssPoint: 'asiento', ssSeat: 0.45, ssFacing: [0, -1] });
  g.add(silla);
  return g;
}
function house() {
  const g = new THREE.Group();
  const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(6, 5.4, 6), mat(0xd9cbb2));
  cuerpo.position.y = 2.7;
  const techo = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2, 4), mat(0x8c3b2e));
  techo.position.y = 6.4;
  techo.rotation.y = Math.PI / 4;
  const puerta = new THREE.Mesh(new THREE.BoxGeometry(1, 2.1, 0.1), mat(0x5a3b22));
  puerta.position.set(0, 1.05, 3.02);
  g.add(cuerpo, techo, puerta);
  return g;
}
function tree(h = 8) {
  const g = new THREE.Group();
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * h / 8, 0.25 * h / 8, h * 0.45, 8), mat(0x6b4a2f));
  tronco.position.y = h * 0.225;
  const copa = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.3, 1), mat(0x4f7d3a, { flatShading: true }));
  copa.position.y = h * 0.68;
  g.add(tronco, copa);
  return g;
}
function cityBlock() {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const hgt = 8 + ((i * 7 + (side > 0 ? 3 : 0)) % 5) * 4;
      const b = new THREE.Mesh(new THREE.BoxGeometry(8, hgt, 10), mat([0x9fa6ad, 0xb7a995, 0x8d9aa6, 0xc4b8a8][i % 4]));
      b.position.set(side * 11, hgt / 2, -8 - i * 11);
      g.add(b);
    }
  }
  const calle = new THREE.Mesh(new THREE.PlaneGeometry(14, 70), mat(0x3a3d42));
  calle.rotation.x = -Math.PI / 2;
  calle.position.set(0, 0.005, -35);
  g.add(calle);
  return g;
}
function villageStreet() {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const c = house();
      c.scale.setScalar(0.8);
      c.position.set(side * 10, 0, -8 - i * 12);
      c.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      g.add(c);
      const valla = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 8), mat(0xe8e2d6));
      valla.position.set(side * 5.5, 0.45, -8 - i * 12);
      g.add(valla);
      const t = tree(6);
      t.position.set(side * 7, 0, -14 - i * 12);
      g.add(t);
    }
  }
  return g;
}
function clearing() {
  const g = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = 14 + (i % 3) * 3;
    const t = tree(6 + (i % 4) * 2.5);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    g.add(t);
  }
  return g;
}

export const SCENERY = [
  { id: 'muro', name: 'Muro a la cintura', desc: 'Un muro de 1 m: cobertura, saltarlo, apoyarse', make: wall, at: [0, 0, -1.2] },
  { id: 'mesa', name: 'Mesa y silla', desc: 'Mesa de 75 cm y silla con asiento a 45 cm', make: tableChair, at: [0, 0, -1.4] },
  { id: 'casa', name: 'Casa', desc: 'Plantas de 2,7 m, puerta de 2,1 m', make: house, at: [0, 0, -9] },
  { id: 'arbol', name: 'Árbol', desc: 'Entre 5 y 15 m', make: () => tree(9), at: [3, 0, -4] },
  { id: 'manzana', name: 'Manzana de ciudad', desc: 'Edificios como cajas a los lados de una calle', make: cityBlock, at: [0, 0, 0] },
  { id: 'calle', name: 'Calle de pueblo', desc: 'Casas con valla y árboles', make: villageStreet, at: [0, 0, 0] },
  { id: 'claro', name: 'Claro del bosque', desc: 'Árboles alrededor, tú en el centro', make: clearing, at: [0, 0, 0] },
];

export class Stage {
  constructor(app) {
    this.app = app;
    this.vp = app.viewport;
    this.props = []; // {id, name, obj, hand}
    this.pieces = []; // {id, obj}
    this.sceneryGroup = new THREE.Group();
    this.vp.scene.add(this.sceneryGroup);
    this.editPieces = false;
    this.overlay = document.createElement('canvas');
    this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;width:100%;height:100%';
    this.vp.container.appendChild(this.overlay);
    this.guides = { thirds: true, center: false, diag: false, safe: false };
    this.outside = 0.7;
  }

  // ---------- objetos en la mano ----------
  async addProp(def, hand = def.hand || 'R', file = null) {
    const rig = this.app.rig;
    const bone = rig.bone(`hand${hand}`);
    if (!bone) return this.app.toast('Este personaje no tiene mano mapeada', true);
    let obj;
    if (file) {
      const m = await loadModel(await file.arrayBuffer(), file.name);
      obj = m.root;
      const box = new THREE.Box3().setFromObject(obj);
      const h = box.max.y - box.min.y;
      if (h > 5) obj.scale.multiplyScalar(1 / 100);
    } else obj = def.make();
    obj.traverse((o) => o.isMesh && (o.castShadow = true));
    const holder = new THREE.Group();
    holder.name = `objeto_${def.id}_${hand}`;
    holder.add(obj);
    bone.add(holder);
    // compensar la escala del mundo del hueso y orientar: agarre en la palma, apuntando "hacia delante" del puño
    this.app.engine.evaluate(this.app.engine.frame);
    bone.updateMatrixWorld(true);
    const ws = bone.getWorldScale(new THREE.Vector3());
    holder.scale.setScalar(1 / (ws.x || 1));
    const H = rig.hipsHeight;
    const out = rig.frame.left.clone().multiplyScalar(hand === 'L' ? 1 : -1);
    // en la pose T la palma mira abajo y los dedos hacia fuera: el objeto sale por delante del puño
    const worldOffset = out.clone().multiplyScalar(0.085 * H / 0.95);
    const inv = bone.matrixWorld.clone().invert();
    const p0 = bone.getWorldPosition(new THREE.Vector3());
    holder.position.copy(p0.clone().add(worldOffset).applyMatrix4(inv));
    const wq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), rig.frame.fwd);
    const restBoneQ = rig.restWorldQ[`hand${hand}`] || new THREE.Quaternion();
    holder.quaternion.copy(restBoneQ.clone().invert().multiply(wq));
    this.props.push({ id: def.id, name: def.name, obj: holder, hand });
    this.app.toast(`${def.name} en la mano ${hand === 'L' ? 'izquierda' : 'derecha'} · elígelo para ajustar el agarre`);
    this.app.panels.refreshProps?.();
    return holder;
  }

  removeProp(p) {
    p.obj.parent?.remove(p.obj);
    this.props = this.props.filter((x) => x !== p);
    if (this.app.selection?.kind === 'prop') this.app.select(null);
    this.app.panels.refreshProps?.();
  }

  resetProp(p) {
    const def = PROPS.find((d) => d.id === p.id) || { id: p.id, name: p.name, make: () => new THREE.Group() };
    const inner = p.obj.children[0];
    this.removeProp(p);
    this.addProp(def, p.hand).then((h) => {
      if (h && inner && !PROPS.find((d) => d.id === p.id)) {
        h.clear();
        h.add(inner);
      }
    });
  }

  clearPropsForRig() {
    for (const p of [...this.props]) this.removeProp(p);
  }

  // ---------- escenario ----------
  addPiece(def, at = null) {
    const obj = def.make();
    obj.userData.piece = def.id;
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    obj.position.fromArray(at || def.at);
    this.sceneryGroup.add(obj);
    this.pieces.push({ id: def.id, name: def.name, obj });
    this.app.panels.refreshScenery?.();
    return obj;
  }

  async addPieceFile(file) {
    const m = await loadModel(await file.arrayBuffer(), file.name);
    const obj = m.root;
    this.sceneryGroup.add(obj);
    this.pieces.push({ id: 'archivo', name: file.name, obj });
    this.app.panels.refreshScenery?.();
  }

  removePiece(p) {
    this.sceneryGroup.remove(p.obj);
    this.pieces = this.pieces.filter((x) => x !== p);
    if (this.app.selection?.kind === 'piece') this.app.select(null);
    this.app.panels.refreshScenery?.();
  }

  pickPiece(ray) {
    if (!this.editPieces) return null;
    const hit = ray.intersectObject(this.sceneryGroup, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o.parent && o.parent !== this.sceneryGroup) o = o.parent;
    return this.pieces.find((p) => p.obj === o) || null;
  }

  pickProp(ray) {
    const roots = this.props.map((p) => p.obj);
    const hit = ray.intersectObjects(roots, true)[0];
    if (!hit) return null;
    return this.props.find((p) => {
      let o = hit.object;
      while (o) {
        if (o === p.obj) return true;
        o = o.parent;
      }
      return false;
    });
  }

  // ---------- cámara de plano ----------
  ensureShot() {
    if (this.vp.shot) return this.vp.shot;
    const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 200);
    cam.position.copy(this.vp.camera.position);
    cam.quaternion.copy(this.vp.camera.quaternion);
    const helper = new THREE.CameraHelper(cam);
    this.vp.scene.add(cam, helper);
    this.vp.shot = { cam, helper, aspect: 16 / 9, show: true, lookThrough: false, mini: false, miniSize: 0.28, focal: 50, sensor: 36, res: [1920, 1080], roll: 0, shift: [0, 0] };
    this.setFocal(50);
    return this.vp.shot;
  }

  setFromView() {
    const s = this.ensureShot();
    s.cam.position.copy(this.vp.camera.position);
    s.cam.quaternion.copy(this.vp.camera.quaternion);
    s.target = this.vp.orbit.target.toArray();
    this.applyRollShift();
  }

  setFocal(mm) {
    const s = this.ensureShot();
    s.focal = mm;
    // la focal se mide sobre el lado largo; fov vertical de three
    const hfov = 2 * Math.atan(s.sensor / 2 / mm);
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / s.aspect);
    s.cam.fov = THREE.MathUtils.radToDeg(s.aspect >= 1 ? vfov : hfov);
    s.cam.updateProjectionMatrix();
  }

  setAspect(a) {
    const s = this.ensureShot();
    s.aspect = a;
    s.cam.aspect = a;
    this.setFocal(s.focal);
  }

  applyRollShift() {
    const s = this.ensureShot();
    s.cam.updateMatrixWorld();
    s.cam.rotateZ(THREE.MathUtils.degToRad(s.roll || 0) - (s._rollApplied || 0));
    s._rollApplied = THREE.MathUtils.degToRad(s.roll || 0);
    const [sx, sy] = s.shift;
    if (sx || sy) {
      const w = 1000;
      const h = w / s.aspect;
      s.cam.setViewOffset(w, h, -sx * w, sy * w, w, h);
    } else s.cam.clearViewOffset();
    s.cam.updateProjectionMatrix();
  }

  lookThrough(on) {
    const s = this.ensureShot();
    if (on && !s.lookThrough) {
      this._savedView = { p: this.vp.camera.position.clone(), t: this.vp.orbit.target.clone() };
      this.vp.camera.position.copy(s.cam.position);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(s.cam.quaternion);
      this.vp.orbit.target.copy(s.cam.position).addScaledVector(dir, s.target ? s.cam.position.distanceTo(new THREE.Vector3().fromArray(s.target)) : 4);
      this.vp.setOrtho(false);
      this.vp.persp.fov = s.cam.fov;
      this.vp.persp.updateProjectionMatrix();
    }
    s.lookThrough = on;
  }

  drawOverlay() {
    const c = this.overlay;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const s = this.vp.shot;
    if (!s || !s.lookThrough || this.vp.quad || !s.frameRect) return;
    const { x, y, w, h } = s.frameRect;
    ctx.fillStyle = `rgba(0,0,0,${this.outside})`;
    ctx.fillRect(0, 0, W, y);
    ctx.fillRect(0, y + h, W, H - y - h);
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, W - x - w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const line = (x0, y0, x1, y1) => {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    };
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    if (this.guides.thirds) {
      for (const k of [1 / 3, 2 / 3]) {
        line(x + w * k, y, x + w * k, y + h);
        line(x, y + h * k, x + w, y + h * k);
      }
    }
    if (this.guides.center) {
      line(x + w / 2 - 12, y + h / 2, x + w / 2 + 12, y + h / 2);
      line(x + w / 2, y + h / 2 - 12, x + w / 2, y + h / 2 + 12);
    }
    if (this.guides.diag) {
      line(x, y, x + w, y + h);
      line(x + w, y, x, y + h);
    }
    if (this.guides.safe) {
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x + w * 0.05, y + h * 0.05, w * 0.9, h * 0.9);
      ctx.strokeRect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.8);
      ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillText(`${s.focal} mm · ${s.res[0]}×${s.res[1]}`, x + 6, y + h - 8);
  }

  /** Foto de la cámara de plano (o de la vista) a PNG. */
  snapshot(width = 1280) {
    const s = this.vp.shot;
    const cam = s ? s.cam : this.vp.camera;
    const aspect = s ? s.aspect : this.vp.camera.aspect || 16 / 9;
    const w = width;
    const h = Math.round(width / aspect);
    const rt = new THREE.WebGLRenderTarget(w, h, { samples: 4 });
    const r = this.vp.renderer;
    const vis = [this.vp.handles.visible, this.vp.gizmo.getHelper().visible, s?.helper.visible];
    this.vp.handles.visible = false;
    this.vp.gizmo.getHelper().visible = false;
    if (s) s.helper.visible = false;
    const oldAspect = cam.aspect;
    if (cam.isPerspectiveCamera) {
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
    }
    r.setRenderTarget(rt);
    r.render(this.vp.scene, cam);
    const buf = new Uint8Array(w * h * 4);
    r.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    r.setRenderTarget(null);
    rt.dispose();
    if (cam.isPerspectiveCamera) {
      cam.aspect = oldAspect;
      cam.updateProjectionMatrix();
    }
    [this.vp.handles.visible, this.vp.gizmo.getHelper().visible] = vis;
    if (s) s.helper.visible = vis[2];
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    cv.getContext('2d').putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }
}
