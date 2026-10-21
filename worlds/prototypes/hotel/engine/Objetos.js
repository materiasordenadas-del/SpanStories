import * as T from './three.js';

export class RegistroObjetos {
  constructor() { this.entries = new Map(); this.roots = new WeakMap(); this.seleccion = null; this.onChange = null; }
  registrar(raiz, { id, tipo, etiqueta }) {
    if (!raiz?.isObject3D || raiz.isScene) throw new Error('Se requiere una raíz de objeto');
    if (![id, tipo, etiqueta].every(v => typeof v === 'string' && v.trim())) throw new Error('ID, tipo y etiqueta obligatorios');
    if (this.entries.has(id) || this.roots.has(raiz)) throw new Error('Identidad duplicada');
    let invalid = false;
    raiz.traverse(o => { if (o.isInstancedMesh || this.roots.has(o)) invalid = true; });
    for (let p = raiz.parent; p; p = p.parent) if (this.roots.has(p)) invalid = true;
    if (invalid) throw new Error('No registrar raíces anidadas ni InstancedMesh sin adaptador');
    raiz.name = id;
    raiz.userData = { ...raiz.userData, id, tipo, label: etiqueta };
    this.entries.set(id, { raiz, id, tipo, etiqueta }); this.roots.set(raiz, id);
    return raiz;
  }
  obtener(id) { return this.entries.get(id)?.raiz ?? null; }
  listar() { return [...this.entries.values()].map(({ id, tipo, etiqueta }) => ({ id, tipo, etiqueta })); }
  resolver(objeto) {
    for (let p = objeto; p; p = p.parent) {
      if (p.userData?.ignorarSeleccion) return null;
      if (this.roots.has(p)) return this.entries.get(this.roots.get(p));
    }
    return null;
  }
  seleccionar(id = null) {
    if (id !== null && !this.entries.has(id)) throw new Error('Objeto desconocido: ' + id);
    this.seleccion = id; this.onChange?.(id === null ? null : this.entries.get(id));
    return this.obtener(id);
  }
  elegirImpacto(impactos) {
    for (const hit of impactos) {
      let visible = true;
      for (let p = hit.object; p; p = p.parent) if (!p.visible) visible = false;
      if (!visible) continue;
      const entry = this.resolver(hit.object);
      if (entry) return entry;
    }
    return null;
  }
  retirar(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (this.seleccion === id) this.seleccionar(null);
    this.entries.delete(id); this.roots.delete(entry.raiz); return true;
  }
}

// Caja independiente: no cambia materiales, cámara ni estilo de objetos.
export function montarSeleccion({ objetos, scene, camera, canvas, selector, estado }) {
  const ray = new T.Raycaster(), pointer = new T.Vector2();
  const caja = new T.Box3Helper(new T.Box3(), 0xe0a458);
  caja.name = 'ayuda-seleccion'; caja.userData.ignorarSeleccion = true;
  caja.visible = false; scene.add(caja);
  selector.replaceChildren();
  const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Sin selección'; selector.append(empty);
  for (const { id, tipo, etiqueta } of objetos.listar()) {
    const opt = document.createElement('option'); opt.value = id; opt.textContent = etiqueta + ' · ' + tipo; selector.append(opt);
  }
  const previous = objetos.onChange;
  const update = entry => {
    selector.value = entry?.id ?? '';
    estado.textContent = entry ? 'Seleccionado: ' + entry.etiqueta : 'Sin selección.';
    caja.visible = Boolean(entry);
    if (entry) caja.box.setFromObject(entry.raiz);
    previous?.(entry);
  };
  objetos.onChange = update;
  const change = () => objetos.seleccionar(selector.value || null);
  const click = event => {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    ray.setFromCamera(pointer, camera);
    const entry = objetos.elegirImpacto(ray.intersectObjects([...objetos.entries.values()].map(e => e.raiz), true));
    objetos.seleccionar(entry?.id ?? null);
  };
  selector.addEventListener('change', change); canvas.addEventListener('click', click);
  update(objetos.seleccion === null ? null : objetos.entries.get(objetos.seleccion));
  return {
    actualizar() {
      const raiz = objetos.obtener(objetos.seleccion);
      let visible = Boolean(raiz);
      for (let p = raiz; p; p = p.parent) if (!p.visible) visible = false;
      caja.visible = visible;
      if (visible) caja.box.setFromObject(raiz);
    },
    destruir() {
      selector.removeEventListener('change', change); canvas.removeEventListener('click', click);
      if (objetos.onChange === update) objetos.onChange = previous;
      caja.removeFromParent(); caja.geometry.dispose(); caja.material.dispose();
    }
  };
}

