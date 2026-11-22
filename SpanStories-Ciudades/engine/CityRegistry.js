// Adaptación del registro del hotel. Los nombres GLTF nunca se sustituyen por IDs.
export class RegistroCiudad {
  constructor() {
    this.entries = new Map();
    this.roots = new WeakMap();
    this.seleccion = null;
    this.onChange = null;
  }

  registrar(raiz, { id, tipo = 'objeto', etiqueta = raiz?.name, sector } = {}) {
    if (!raiz?.isObject3D || raiz.isScene) throw new Error('Se requiere una raíz Object3D.');
    if (![id, tipo, etiqueta].every(value => typeof value === 'string' && value.trim()))
      throw new Error('ID, tipo y etiqueta obligatorios.');
    if (this.entries.has(id) || this.roots.has(raiz)) throw new Error('Identidad duplicada: ' + id);
    if (raiz.isInstancedMesh && !Array.isArray(raiz.userData.instanceIds))
      throw new Error('InstancedMesh requiere IDs estables y un adaptador individual.');
    if (raiz.userData.instanceBinding &&
        (typeof raiz.userData.instanceBinding.sync !== 'function' || typeof raiz.userData.instanceBinding.bounds !== 'function'))
      throw new Error('Adaptador de instancia incompleto.');
    raiz.userData = { ...raiz.userData, id, tipo, label: etiqueta,
      sector: sector ?? raiz.userData.sector ?? raiz.userData.area ?? '' };
    this.entries.set(id, { id, raiz, tipo, etiqueta, sector: raiz.userData.sector });
    this.roots.set(raiz, id);
    return raiz;
  }

  obtener(id) { return this.entries.get(id)?.raiz ?? null; }
  listar() {
    return [...this.entries.values()].map(({ id, tipo, etiqueta, raiz }) =>
      ({ id, tipo, etiqueta, sector: raiz.userData.sector ?? '' }));
  }

  // Un GLTF puede tener padre e hijo editables; gana el nodo registrado más próximo.
  resolver(objetoOImpacto, instanceId) {
    const hit = objetoOImpacto?.object ? objetoOImpacto : null;
    const object = hit?.object ?? objetoOImpacto;
    const index = hit?.instanceId ?? hit?.batchId ?? instanceId;
    for (let p = object; p; p = p.parent) if (p.userData?.ignorarSeleccion) return null;
    if ((object?.isInstancedMesh || object?.isBatchedMesh) && Number.isInteger(index)) {
      const id = object.userData.instanceIds?.[index];
      return this.entries.get(id) ?? null;
    }
    for (let p = object; p; p = p.parent) {
      const id = this.roots.get(p);
      if (id) return this.entries.get(id) ?? null;
    }
    return null;
  }

  seleccionar(id = null) {
    if (id !== null && !this.entries.has(id)) throw new Error('Objeto desconocido: ' + id);
    this.seleccion = id;
    this.onChange?.(id === null ? null : this.entries.get(id));
    return this.obtener(id);
  }

  elegirImpacto(impactos) {
    for (const hit of impactos) {
      let visible = true;
      for (let p = hit.object; p; p = p.parent) if (!p.visible) { visible = false; break; }
      if (!visible) continue;
      const entry = this.resolver(hit);
      if (entry && entry.raiz.visible && !entry.raiz.userData.ocultoUsuario) return entry;
    }
    return null;
  }

  retirar(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    if (this.seleccion === id) this.seleccionar(null);
    this.entries.delete(id);
    this.roots.delete(entry.raiz);
    return true;
  }
}
