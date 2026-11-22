import * as T from './three.js';
import { TransformControls } from '../vendor/TransformControls.js';
import { capturarObjeto } from './CityEditor.js';
/**
 * Edición directa en el visor, al estilo del editor de three.js / StemStudio:
 * - Gizmo sobre el objeto: mover (W), girar (E), escalar (R); Q alterna global/local.
 * - Ctrl mientras se arrastra (o el botón Imán) ajusta a 0,5 m · 15° · 0,1.
 * - F encuadra, Supr oculta, Esc quita la selección, Ctrl+Z / Ctrl+Y deshacen y rehacen.
 * - Inspector flotante siempre visible con nombre y transformación numérica: no hace falta abrir «Opciones».
 * Cada arrastre del gizmo es UNA entrada del historial del editor (CityEditor), igual que «Aplicar cambios».
 */
export function montarGizmoEditor({ scene, camera, canvas, host, objetos, editor, navigation, focus, status = () => {}, atlas = null }) {
  const gizmo = new TransformControls(camera, canvas);
  gizmo.setSize(.9);
  const helper = gizmo.getHelper();
  // El render estilizado (EstilosCompartidos) dibuja aparte, encima, lo marcado como overlay en la capa 31:
  // así el gizmo se ve siempre por delante de los edificios y no pasa por el sombreado de la ciudad.
  helper.traverse(o => { o.userData.ignorarSeleccion = true; if (o.isMesh || o.isLine) { o.userData.editorOverlay = true; o.layers.set(31); } });
  gizmo.getRaycaster().layers.enableAll();
  helper.userData.ignorarSeleccion = true;
  scene.add(helper);
  let snap = false, ctrl = false, before = null, attached = null, enabled = true, disposed = false;
  // Muchos edificios tienen la geometría en coordenadas del mundo y su origen en (0,0,0): el gizmo se pone en un
  // pivote en el centro de su caja y el cambio del pivote se traslada al objeto (pivote · pivote₀⁻¹ · objeto₀).
  const pivot = new T.Object3D(); pivot.userData.ignorarSeleccion = true; scene.add(pivot);
  const pivotStart = new T.Matrix4(), rootStart = new T.Matrix4(), delta = new T.Matrix4(), local = new T.Matrix4(), box = new T.Box3();
  function placePivot(root) {
    root.updateMatrixWorld(true);
    const caja = cajaDe(root); if (caja) box.copy(caja); else box.setFromObject(root);
    if (box.isEmpty()) root.getWorldPosition(pivot.position); else box.getCenter(pivot.position);
    root.getWorldQuaternion(pivot.quaternion); pivot.scale.set(1, 1, 1); pivot.updateMatrixWorld(true);
    pivotStart.copy(pivot.matrixWorld); rootStart.copy(root.matrixWorld);
  }

  const panel = document.createElement('div');
  panel.className = 'editor-inspector';
  panel.setAttribute('role', 'toolbar');
  panel.setAttribute('aria-label', 'Herramientas de edición');
  const AX = ['x', 'y', 'z'];
  panel.innerHTML = `
    <div class="ei-tools">
      <button type="button" data-tool="translate" title="Mover (W)" aria-pressed="true">✥ <span>Mover</span></button>
      <button type="button" data-tool="rotate" title="Girar (E)" aria-pressed="false">⟳ <span>Girar</span></button>
      <button type="button" data-tool="scale" title="Escalar (R)" aria-pressed="false">⤢ <span>Escalar</span></button>
      <button type="button" data-act="space" title="Ejes globales o locales (Q)">Global</button>
      <button type="button" data-act="snap" title="Imán: ajusta a 0,5 m · 15° · 0,1 (o mantén Ctrl al arrastrar)" aria-pressed="false">🧲 <span>Imán</span></button>
      <button type="button" data-act="focus" title="Encuadrar la selección (F)">◎ <span>Encuadrar</span></button>
      <button type="button" data-act="hide" title="Ocultar el objeto (Supr)">⌫ <span>Ocultar</span></button>
      <button type="button" data-act="undo" title="Deshacer (Ctrl+Z)">↶</button>
      <button type="button" data-act="redo" title="Rehacer (Ctrl+Y)">↷</button>
      <button type="button" data-act="save" title="Guardar la edición en disco (Ctrl+S)">💾 <span>Guardar</span></button>
      <button type="button" data-act="more" title="Lista y búsqueda de objetos, añadir GLB, exportar/abrir proyecto, estilo, calidad y diagnóstico">☰ <span>Más</span></button>
    </div>
    <div class="ei-body">
      <strong class="ei-name">Sin selección</strong>
      <div class="ei-grid" hidden>
        ${[['p', 'Posición', .1], ['r', 'Rotación °', 1], ['s', 'Escala', .05]].map(([k, label, step]) =>
          `<span>${label}</span>${AX.map(a => `<input type="number" step="${step}" data-field="${k}${a}" aria-label="${label} ${a.toUpperCase()}" title="${label} ${a.toUpperCase()}">`).join('')}`).join('')}
      </div>
      <details class="ei-hidden" hidden><summary>Ocultos (<span>0</span>)</summary><ul></ul></details>
      <p class="ei-hint">Clic: seleccionar · arrastrar: girar la vista · derecho/central: desplazar · rueda: acercar</p>
    </div>`;
  host.append(panel);
  const q = s => panel.querySelector(s);
  const field = id => q(`[data-field="${id}"]`);

  // Los elementos de lugares del Generador son proxies sin geometría: se editan si AtlasAssets los vinculó (atlasEditable).
  const editable = root => !!(root && editor && root.parent && (!root.userData.atlasBounds || root.userData.atlasEditable));
  const cajaDe = root => root.userData.atlasBounds ? (root.userData.instanceBinding?.bounds?.() ?? root.userData.atlasBounds) : null;
  function selected() { return objetos.obtener(objetos.seleccion); }
  function setTool(mode) {
    gizmo.setMode(mode);
    for (const b of panel.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === mode));
  }
  function applySnap() {
    const on = snap || ctrl;
    gizmo.setTranslationSnap(on ? .5 : null);
    gizmo.setRotationSnap(on ? T.MathUtils.degToRad(15) : null);
    gizmo.setScaleSnap(on ? .1 : null);
    q('[data-act="snap"]').setAttribute('aria-pressed', String(snap));
  }
  function fill(root) {
    for (const a of AX) {
      field('p' + a).value = +root.position[a].toFixed(3);
      field('r' + a).value = +T.MathUtils.radToDeg(root.rotation[a]).toFixed(1);
      field('s' + a).value = +root.scale[a].toFixed(3);
    }
  }
  function sync() {
    if (disposed) return;
    const root = selected(), canEdit = enabled && editable(root);
    if (canEdit && attached !== root) { attached = root; placePivot(root); gizmo.attach(pivot); }
    else if (canEdit && !gizmo.dragging) placePivot(root);
    if (!canEdit && attached) { gizmo.detach(); attached = null; }
    helper.visible = canEdit;
    panel.hidden = !enabled;
    panel.dataset.editable = String(canEdit);
    q('.ei-name').textContent = root
      ? (root.userData.label ?? root.name ?? 'Objeto') + (root.userData.atlasBounds ? ' · elemento del Generador' : '')
      : (atlas ? 'Lugar del Generador · selecciona un elemento' : 'Sin selección · haz clic en un objeto');
    q('.ei-grid').hidden = !canEdit;
    for (const b of panel.querySelectorAll('[data-tool],[data-act="space"],[data-act="snap"],[data-act="hide"]')) b.disabled = !canEdit;
    q('[data-act="focus"]').disabled = !root;
    const oculto = !!root?.userData.ocultoUsuario, hide = q('[data-act="hide"]');
    hide.innerHTML = oculto ? '👁 <span>Mostrar</span>' : '⌫ <span>Ocultar</span>';
    hide.title = oculto ? 'Volver a mostrar el objeto oculto' : 'Ocultar el objeto (Supr)';
    q('[data-act="undo"]').disabled = !editor || !editor.state.undoStack.length;
    q('[data-act="redo"]').disabled = !editor || !editor.state.redoStack.length;
    q('[data-act="save"]').disabled = !editor;
    q('[data-act="save"]').classList.toggle('ei-dirty', !!editor?.dirty());
    if (canEdit && !gizmo.dragging) fill(root);
    // Objetos ocultos: no se pueden pulsar en la escena, así que se listan aquí para volver a mostrarlos.
    const ocultos = editor ? [...objetos.entries.values()].filter(e => e.raiz.userData.ocultoUsuario) : [];
    const lista = q('.ei-hidden'), firma = ocultos.map(e => e.id).join('|');
    lista.hidden = !ocultos.length; lista.querySelector('summary span').textContent = ocultos.length;
    if (lista.dataset.firma !== firma) {
      lista.dataset.firma = firma;
      lista.querySelector('ul').replaceChildren(...ocultos.map(e => {
        const li = document.createElement('li'), b = document.createElement('button');
        b.type = 'button'; b.dataset.show = e.id; b.textContent = '👁 Mostrar'; b.title = 'Volver a mostrar ' + e.etiqueta;
        li.append(Object.assign(document.createElement('span'), { textContent: e.etiqueta })), li.append(b); return li;
      }));
    }
    if (root?.userData.atlasBounds && atlas) q('.ei-hint').innerHTML = canEdit ? 'Se separa de lo fundido al editarlo; sin pérdida de calidad. <a target="_blank" rel="noopener">Editar su origen en el Generador</a>' : 'Este elemento no se puede editar aquí. <a target="_blank" rel="noopener">Editar este elemento en el Generador</a>';
    else q('.ei-hint').textContent = 'Clic: seleccionar · arrastrar: girar la vista · derecho/central: desplazar · rueda: acercar';
    const link = q('.ei-hint a');
    if (link && atlas) { const url = new URL('http://127.0.0.1:5179/'); url.searchParams.set('lugar', atlas); url.searchParams.set('entidad', objetos.seleccion); link.href = url.href; }
  }

  gizmo.addEventListener('dragging-changed', event => {
    const root = attached; if (!root) return;
    if (event.value) { before = capturarObjeto(root); return; }
    if (!before) return;
    const after = capturarObjeto(root), moved = ['position', 'rotation', 'scale'].some(k => after[k].some((v, i) => Math.abs(v - before[k][i]) > 1e-6));
    // Se vuelve al estado previo y se aplica por el editor: así el arrastre entra en el historial y en «Guardar».
    root.position.fromArray(before.position); root.rotation.set(...before.rotation, before.rotationOrder); root.scale.fromArray(before.scale);
    before = null;
    if (!moved) { root.updateMatrixWorld(true); placePivot(root); return; }
    try { editor.applySelected({ position: after.position, rotation: after.rotation, scale: after.scale }); }
    catch (error) { status(error.message); }
    sync();
  });
  gizmo.addEventListener('objectChange', () => {
    const root = attached; if (!root) return;
    pivot.updateMatrixWorld(true);
    delta.copy(pivot.matrixWorld).multiply(local.copy(pivotStart).invert()).multiply(rootStart);
    if (root.parent) { root.parent.updateMatrixWorld(true); delta.premultiply(local.copy(root.parent.matrixWorld).invert()); }
    delta.decompose(root.position, root.quaternion, root.scale);
    root.updateMatrixWorld(true); root.userData.instanceBinding?.sync(); fill(root);
    if (scene.userData.alCambiarSeleccion) scene.userData.alCambiarSeleccion();
  });

  function apply(data) { try { editor.applySelected(data); } catch (error) { status(error.message); } sync(); }
  panel.addEventListener('change', event => {
    const input = event.target.closest('[data-field]'), root = selected();
    if (!input || !editable(root)) return;
    const read = k => AX.map(a => { const v = field(k + a).valueAsNumber; return Number.isFinite(v) ? v : null; });
    const p = read('p'), r = read('r'), s = read('s');
    if ([...p, ...r, ...s].some(v => v === null) || s.some(v => v === 0)) { fill(root); status('Introduce números válidos (la escala no puede ser 0).'); return; }
    apply({ position: p, rotation: r.map(v => T.MathUtils.degToRad(v)), scale: s });
  });
  async function act(name) {
    const root = selected();
    try {
      if (name === 'space') { gizmo.setSpace(gizmo.space === 'world' ? 'local' : 'world'); q('[data-act="space"]').textContent = gizmo.space === 'world' ? 'Global' : 'Local'; }
      else if (name === 'snap') { snap = !snap; applySnap(); }
      else if (name === 'focus') { if (root) focus(cajaDe(root) ?? root); }
      else if (name === 'hide') {
        if (!editable(root)) return;
        // Ocultar/Mostrar: un objeto oculto se elige desde «☰ Más» (lista de objetos) y aquí se vuelve a mostrar.
        if (root.userData.ocultoUsuario) { apply({ hidden: false }); status('Objeto visible de nuevo · sin guardar.'); }
        else { apply({ hidden: true }); objetos.seleccionar(null); status('Objeto oculto · Ctrl+Z, o elígelo en «☰ Más» y pulsa Mostrar.'); }
      }
      else if (name === 'undo') editor?.undo();
      else if (name === 'redo') editor?.redo();
      else if (name === 'save') { await editor?.save(); }
      else if (name === 'more') { document.getElementById('panel-toggle')?.click(); }
    } catch (error) { status(error.message); }
    sync();
  }
  panel.addEventListener('click', event => {
    const show = event.target.closest('[data-show]');
    if (show) { try { objetos.seleccionar(show.dataset.show); apply({ hidden: false }); status('Objeto visible de nuevo · sin guardar.'); } catch (error) { status(error.message); } sync(); return; }
    const tool = event.target.closest('[data-tool]'), action = event.target.closest('[data-act]');
    if (tool && !tool.disabled) setTool(tool.dataset.tool);
    else if (action && !action.disabled) void act(action.dataset.act);
  });
  // Las teclas se ignoran mientras se escribe en un campo.
  function keydown(event) {
    if (!enabled || navigation?.mode !== 'editor' || event.target.closest?.('input,textarea,select,[contenteditable]')) return;
    if (event.key === 'Control') { ctrl = true; applySnap(); return; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') { event.preventDefault(); void act('save'); return; }
    if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyY' || (event.code === 'KeyZ' && event.shiftKey))) { event.preventDefault(); void act('redo'); return; }
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') { event.preventDefault(); void act('undo'); return; }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const map = { KeyW: 'translate', KeyE: 'rotate', KeyR: 'scale' };
    if (map[event.code] && attached) { event.preventDefault(); setTool(map[event.code]); return; }
    if (event.code === 'KeyQ' && attached) { void act('space'); return; }
    if (event.code === 'KeyF' && selected()) { void act('focus'); return; }
    if ((event.code === 'Delete' || event.code === 'Backspace') && attached) { event.preventDefault(); void act('hide'); return; }
    if (event.code === 'Escape' && objetos.seleccion) { objetos.seleccionar(null); }
  }
  function keyup(event) { if (event.key === 'Control') { ctrl = false; applySnap(); } }
  window.addEventListener('keydown', keydown, true);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', () => { ctrl = false; applySnap(); });
  applySnap(); sync();

  return {
    sync,
    /** true si el gizmo tiene el puntero (encima de un eje o arrastrando): la cámara y la selección no deben reaccionar. */
    active: event => {
      if (!attached || !enabled) return false;
      // Con el evento de pulsación se comprueba en el acto si hay un eje bajo el puntero (sin esperar al hover).
      if (event && !gizmo.dragging && event.type === 'pointerdown') gizmo.pointerHover(gizmo._getPointer(event));
      return gizmo.dragging || gizmo.axis !== null;
    },
    enabled(value) { enabled = !!value; if (!enabled && gizmo.dragging) gizmo.pointerUp({ button: 0 }); sync(); },
    dispose() { disposed = true; window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup); gizmo.detach(); gizmo.dispose(); helper.removeFromParent(); pivot.removeFromParent(); panel.remove(); },
  };
}
