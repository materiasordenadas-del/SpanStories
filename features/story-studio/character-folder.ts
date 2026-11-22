// Carpeta de personajes (GLB) que el Estudio recuerda entre sesiones.
// Usa la API de archivos del navegador: el permiso sobre la carpeta lo concede quien usa el Estudio,
// y el identificador `spanstories-personajes` hace que el selector reabra siempre en el último lugar usado.
type Handle = { kind: 'directory' | 'file'; name: string; queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>; requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>; values?: () => AsyncIterable<Handle>; getFile?: () => Promise<File> };
type Picker = {
  showDirectoryPicker?: (o?: { id?: string; mode?: 'read'; startIn?: Handle | string }) => Promise<Handle>;
  showOpenFilePicker?: (o?: { id?: string; multiple?: boolean; startIn?: Handle | string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<Handle[]>;
};
const DB = 'spanstories.studio.preferencias', STORE = 'handles', KEY = 'carpeta-personajes', PICKER_ID = 'spanstories-personajes';
const GLB = [{ description: 'Personajes GLB', accept: { 'model/gltf-binary': ['.glb'] } }];

function api() { return window as unknown as Picker; }
export function canPickFolders() { return typeof window !== 'undefined' && typeof api().showOpenFilePicker === 'function'; }

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function readSaved(): Promise<Handle | null> {
  try {
    const db = await open();
    return await new Promise(resolve => { const r = db.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => resolve((r.result as Handle) ?? null); r.onerror = () => resolve(null); });
  } catch { return null; }
}
async function writeSaved(handle: Handle) {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(handle, KEY); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
  } catch { /* sin almacenamiento: el selector sigue recordando el último lugar por su identificador */ }
}

export async function savedFolderName(): Promise<string | null> { return (await readSaved())?.name ?? null; }

/** Deja elegir la carpeta donde viven los GLB; desde entonces el selector se abre siempre ahí. */
export async function chooseCharacterFolder(): Promise<string | null> {
  const pick = api().showDirectoryPicker;
  if (!pick) return null;
  try {
    const dir = await pick.call(window, { id: PICKER_ID, mode: 'read', startIn: (await readSaved()) ?? 'documents' });
    await writeSaved(dir);
    return dir.name;
  } catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return null; throw e; }
}

/** Abre el selector de archivos en la carpeta recordada. Devuelve los GLB elegidos (vacío si se cancela o no hay API). */
export async function pickCharacterFiles(): Promise<File[] | null> {
  const pick = api().showOpenFilePicker;
  if (!pick) return null;
  try {
    const saved = await readSaved();
    const handles = await pick.call(window, { id: PICKER_ID, multiple: true, types: GLB, ...(saved ? { startIn: saved } : {}) });
    return await Promise.all(handles.map(h => h.getFile!()));
  } catch (e) { if (e instanceof DOMException && e.name === 'AbortError') return []; throw e; }
}
