// IndexedDB local: clips propios, personajes, proyectos, poses. Nada sale del equipo.
const DB = 'taller-animacion';
const VER = 2;
// cache: pistas completas por archivo de la biblioteca · indice: fichas ligeras de todos los clips
// (un solo registro) · miniaturas: dibujos de las tarjetas por personaje.
const STORES = ['clips', 'characters', 'projects', 'poses', 'cache', 'indice', 'miniaturas'];

let _db = null;
function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => {
      _db = r.result;
      // Otra pestaña con una versión más nueva: soltar la base para no bloquearla.
      _db.onversionchange = () => { _db.close(); _db = null; };
      res(_db);
    };
    r.onblocked = () => console.warn('IDB: otra pestaña del Taller usa la versión anterior de la base local');
    r.onerror = () => rej(r.error);
  });
}

function tx(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        const s = t.objectStore(store);
        const out = fn(s);
        t.oncomplete = () => res(out && 'result' in out ? out.result : out);
        t.onerror = () => rej(t.error);
      }),
  );
}

export const db = {
  put: (store, value) => tx(store, 'readwrite', (s) => s.put(value)).catch((e) => console.warn('IDB', e)),
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)).catch(() => null),
  keys: (store) => tx(store, 'readonly', (s) => s.getAllKeys()).catch(() => []),
  all: (store) => tx(store, 'readonly', (s) => s.getAll()).catch(() => []),
  del: (store, id) => tx(store, 'readwrite', (s) => s.delete(id)).catch(() => null),
};

export function prefs(key, def) {
  try {
    const v = localStorage.getItem(`taller:${key}`);
    return v === null ? def : JSON.parse(v);
  } catch {
    return def;
  }
}
export function setPrefs(key, value) {
  try {
    localStorage.setItem(`taller:${key}`, JSON.stringify(value));
  } catch {
    /* sin almacenamiento */
  }
}

export function download(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function pickFiles(accept, multiple = true) {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.multiple = multiple;
    i.onchange = () => res([...i.files]);
    i.click();
  });
}
