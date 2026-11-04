import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
const $ = id => document.getElementById(id);
const loader = new GLTFLoader();
let inputFile, original, transformed, current, pending = false, loadGeneration = 0;
let saveFolder = '', resultJob = null, saving = false;
let renderer, scene, camera, target = new THREE.Vector3(), radius = 4, azimuth = .55, elevation = .36;
const bytes = n => n < 1e6 ? `${(n / 1000).toFixed(0)} KB` : `${(n / 1e6).toFixed(2)} MB`;
const number = n => new Intl.NumberFormat('es').format(n);
const connectionMessage = 'La app local no responde. Abre Iniciar.cmd en D:\\Español\\SpanStories-GLB-App y vuelve a intentar.';
async function fetchLocal(url, options = {}) {
  const attempts = (!options.method || options.method === 'GET') ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.method === 'POST' ? 120000 : 20000);
    try { return await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' }); }
    catch (error) {
      if (attempt === attempts-1) throw new Error(connectionMessage);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally { clearTimeout(timer); }
  }
}
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
function dispose(model) {
  if (!model) return;
  model.traverse(o => { o.geometry?.dispose(); const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) if (m) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); } });
}
function initViewer() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0xfcfdf9, 1);
    $('viewport').prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(35, 1, .001, 100000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb4c2a8, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.4); light.position.set(-4, 7, 5); scene.add(light);
    new ResizeObserver(() => { const box = $('viewport').getBoundingClientRect(); renderer.setSize(box.width, box.height); camera.aspect = box.width / box.height; camera.updateProjectionMatrix(); draw(); }).observe($('viewport'));
    let dragging = false, lastX, lastY;
    renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); });
    renderer.domElement.addEventListener('pointerup', () => dragging = false);
    renderer.domElement.addEventListener('pointercancel', () => dragging = false);
    renderer.domElement.addEventListener('pointermove', e => { if (!dragging) return; azimuth -= (e.clientX - lastX) * .008; elevation = Math.max(-.6, Math.min(1.35, elevation + (e.clientY - lastY) * .008)); lastX = e.clientX; lastY = e.clientY; draw(); });
    renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); radius = Math.max(.001, Math.min(100000, radius * Math.exp(e.deltaY * .001))); draw(); }, { passive: false });
  } catch (error) { $('empty').querySelector('p').textContent = 'La vista 3D necesita WebGL. Puedes convertir y descargar el archivo igualmente.'; }
}
function draw() {
  if (!renderer) return;
  camera.position.set(target.x + Math.sin(azimuth) * Math.cos(elevation) * radius, target.y + Math.sin(elevation) * radius, target.z + Math.cos(azimuth) * Math.cos(elevation) * radius);
  camera.lookAt(target); renderer.render(scene, camera);
}
function show(model, kind) {
  if (!model || !scene) return;
  if (current) scene.remove(current);
  current = model; scene.add(model);
  const bounds = new THREE.Box3().setFromObject(model);
  bounds.getCenter(target); const size = bounds.getSize(new THREE.Vector3());
  radius = Math.max(size.x, size.y, size.z) * 2.3;
  camera.near = Math.max(.00001, radius / 10000); camera.far = radius * 100; camera.updateProjectionMatrix();
  $('empty').hidden = true; $('viewer-note').hidden = false;
  $('before').classList.toggle('active', kind === 'before'); $('after').classList.toggle('active', kind === 'after'); draw();
}
function parse(buffer) { return new Promise((resolve, reject) => loader.parse(buffer, '', value => resolve(value.scene), reject)); }
async function choose(file) {
  if (pending) return;
  if (!file || !file.name.toLowerCase().endsWith('.glb')) return status('Selecciona un archivo .glb.', true);
  if (file.size > 200 * 1024 * 1024) return status('El límite es 200 MB.', true);
  const generation = ++loadGeneration;
  inputFile = file; $('filename').textContent = file.name; $('filehint').textContent = bytes(file.size);
  $('results').hidden = true; $('after').disabled = true; $('convert').disabled = true;
  status('Abriendo la vista 3D…');
  try {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength < 20) throw new Error('El archivo GLB está incompleto.');
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== buffer.byteLength) throw new Error('Selecciona un GLB válido de versión 2.');
    let model;
    try { model = await parse(buffer); } catch (error) { if (generation === loadGeneration) status('No se pudo mostrar la vista original. Puedes intentar convertirlo.', true); }
    if (generation !== loadGeneration) { dispose(model); return; }
    if (current && scene) scene.remove(current); current = null; dispose(original); dispose(transformed); original = model; transformed = null;
    if (model) { show(model, 'before'); status('Objeto cargado. Ajusta las opciones y transforma.'); }
    $('convert').disabled = false;
  } catch (error) { if (generation === loadGeneration) { inputFile = null; status(error.message, true); } }
}
$('file').addEventListener('change', e => choose(e.target.files[0]));
for (const type of ['dragenter', 'dragover']) $('drop').addEventListener(type, e => { e.preventDefault(); $('drop').classList.add('drag'); });
for (const type of ['dragleave', 'drop']) $('drop').addEventListener(type, e => { e.preventDefault(); $('drop').classList.remove('drag'); if (type === 'drop') choose(e.dataTransfer.files[0]); });
$('ratio').addEventListener('input', () => $('ratio-value').textContent = `${$('ratio').value} %`);
$('before').addEventListener('click', () => show(original, 'before'));
$('after').addEventListener('click', () => show(transformed, 'after'));
$('example').addEventListener('click', async () => {
  if (pending) return;
  $('example').disabled = true;
  try {
    const info = await readResponse(await fetchLocal('/api/example/info'));
    const chunks = [];
    for (let offset = 0; offset < info.bytes; offset += 1024 * 1024) {
      status(`Cargando sofá de ejemplo… ${Math.round(offset / info.bytes * 100)} %`);
      const response = await fetchLocal(`/api/example/chunk?offset=${offset}`);
      if (!response.ok) throw new Error('No se pudo cargar el ejemplo. Selecciona tu GLB.');
      chunks.push(await response.arrayBuffer());
    }
    await choose(new File(chunks, 'sofa-jules.glb', { type: 'model/gltf-binary' }));
  } catch (error) { status(error.message, true); }
  finally { $('example').disabled = false; }
});
async function readResponse(response) {
  let value;
  try { value = await response.json(); } catch { throw new Error('El servidor devolvió una respuesta incompleta. Vuelve a intentar.'); }
  if (!response.ok) throw new Error(value.error || 'No se pudo completar la operación.');
  return value;
}
function updateFolder(value) {
  saveFolder = value.save_folder || '';
  $('save-folder').value = saveFolder;
  $('folder-status').textContent = saveFolder ? `Guardar como se abrirá en: ${saveFolder}` : 'Al guardar podrás elegir la carpeta y el nombre.';
  $('download').textContent = 'Guardar GLB ↓';
}
for (const id of ['choose-folder', 'use-folder']) $(id).addEventListener('click', async () => {
  $('choose-folder').disabled = true; $('use-folder').disabled = true;
  try {
    const value = await readResponse(await fetchLocal(id === 'choose-folder' ? '/api/choose-folder' : '/api/preferences', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ save_folder: $('save-folder').value })
    }));
    updateFolder(value);
  } catch (error) { $('folder-status').textContent = error.message; }
  finally { $('choose-folder').disabled = false; $('use-folder').disabled = false; }
});
$('download').addEventListener('click', async e => {
  e.preventDefault();
  if (saving || !resultJob) return;
  saving = true; $('download').setAttribute('aria-disabled', 'true');
  try {
    const value = await readResponse(await fetchLocal(`/api/save/${resultJob}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: $('download').download, dialog: true })
    }));
    status(value.cancelled ? 'Guardado cancelado. El resultado sigue disponible.' : `GLB guardado en: ${value.path}`);
  } catch (error) { status(error.message, true); }
  finally { saving = false; $('download').removeAttribute('aria-disabled'); }
});
fetchLocal('/api/preferences').then(readResponse).then(updateFolder).catch(error => { $('folder-status').textContent = error.message; });
$('convert').addEventListener('click', async () => {
  if (!inputFile || pending) return;
  pending = true; $('convert').disabled = true; $('file').disabled = true; $('example').disabled = true;
  const controls = ['ratio', 'units', 'axis', 'palette', 'remove-floor']; controls.forEach(id => $(id).disabled = true);
  const settings = { ratio: Number($('ratio').value) / 100, units: $('units').value, axis: $('axis').value, palette: $('palette').value, remove_floor: $('remove-floor').checked };
  $('results').hidden = true; $('after').disabled = true;
  status('Simplificando geometría y preparando colores planos…');
  try {
    const health = await readResponse(await fetchLocal('/api/status'));
    if (!health.ready) throw new Error('No se encontró Blender. Revisa LEEME.md para configurar su ruta.');
    const job = await readResponse(await fetchLocal(`/api/jobs?settings=${encodeURIComponent(JSON.stringify(settings))}`, { method: 'POST', headers: { 'Content-Type': 'model/gltf-binary' }, body: inputFile }));
    let result;
    do { await new Promise(resolve => setTimeout(resolve, 900)); result = await readResponse(await fetchLocal(`/api/jobs/${job.id}`)); } while (result.state === 'processing');
    if (result.state === 'error') throw new Error(result.error);
    const r = result.report;
    resultJob = job.id;
    $('size-result').textContent = bytes(r.output_bytes); $('size-before').textContent = `Antes: ${bytes(r.original_bytes)} · ${Math.round((1 - r.output_bytes / r.original_bytes) * 100)} % menos`;
    $('tri-result').textContent = number(r.output_triangles); $('tri-before').textContent = `Antes: ${number(r.original_triangles)}`;
    // Blender mide X / Y / Z; glTF convierte a X / Z / Y.
    $('dimensions').textContent = [r.dimensions[0], r.dimensions[2], r.dimensions[1]].map(v => v.toFixed(2)).join(' × ');
    $('warnings').textContent = [...r.warnings, ...(r.removed.length ? [`Suelo retirado: ${r.removed.join(', ')}.`] : [])].join(' ');
    $('download').href = `/api/jobs/${job.id}/model.glb`; $('download').download = inputFile.name.replace(/\.glb$/i, '_spanstories.glb');
    $('report').href = `/api/jobs/${job.id}/report`; $('results').hidden = false;
    try { const response = await fetchLocal(`/api/jobs/${job.id}/model`); if (!response.ok) await readResponse(response); const model = await parse(await response.arrayBuffer()); if (current === transformed && scene) scene.remove(current); dispose(transformed); transformed = model; $('after').disabled = false; show(model, 'after'); status('Conversión terminada. Revisa el objeto y descarga tu GLB.'); }
    catch (error) { status('GLB convertido y disponible. No se pudo abrir su vista 3D.', true); }
  } catch (error) { status(error.message, true); }
  finally { pending = false; $('convert').disabled = !inputFile; $('file').disabled = false; $('example').disabled = false; controls.forEach(id => $(id).disabled = false); }
});
initViewer();
fetchLocal('/api/status').then(readResponse).then(value => { if (!value.ready) { status('No se encontró Blender. Revisa LEEME.md para configurar su ruta.', true); } }).catch(error => status(error.message, true));
