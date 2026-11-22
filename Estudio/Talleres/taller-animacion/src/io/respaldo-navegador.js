// Espejo en disco de lo que el Taller guarda en localStorage (proyecto facial, borradores, ajustes).
// - Al arrancar: lo que falta en el navegador se restaura desde disco; lo que falta o cambió en disco se sube.
// - Después: cada setItem de una clave del Taller se copia a disco (con espera de 800 ms).
// - Nunca borra nada en disco y nunca rompe el Taller: si el servidor no responde, el navegador sigue como siempre.
const API = '/api/respaldo-navegador';
const PREFIJOS = [
  'spanstories.facial-project.v1:',
  'spanstories.facial-draft.v1:',
  'spanstories.facial-gain.v1:',
  'spanstories.acting-style.v1:',
  'spanstories.character-physics.v1:',
  'taller:',
];
const clave = (k) => typeof k === 'string' && PREFIJOS.some((p) => k.startsWith(p) && k.length > p.length);

let iniciado = null;
const pendientes = new Map();
let temporizador = 0;
let enVuelo = false;
export const estadoRespaldo = { activo: false, ultimoError: '', guardados: 0, restaurados: 0 };

async function fetchJson(url, opciones = {}, ms = 2500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opciones, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function vaciar() {
  if (enVuelo || !pendientes.size) return;
  enVuelo = true;
  const lote = [...pendientes].map(([k, v]) => ({ clave: k, valor: v.valor, fecha: v.fecha }));
  try {
    await fetchJson(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: lote }) }, 8000);
    for (const it of lote) if (pendientes.get(it.clave)?.valor === it.valor) pendientes.delete(it.clave);
    estadoRespaldo.guardados += lote.length;
    estadoRespaldo.ultimoError = '';
  } catch (e) {
    estadoRespaldo.ultimoError = String(e.message || e);
    programar(15000); // se reintenta; los datos siguen en el navegador
  } finally {
    enVuelo = false;
    if (pendientes.size && !temporizador) programar(800);
  }
}
function programar(ms) {
  clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    temporizador = 0;
    vaciar();
  }, ms);
}
function encolar(k, valor) {
  pendientes.set(k, { valor, fecha: Date.now() });
  programar(800);
}

export function iniciarRespaldoNavegador() {
  if (iniciado) return iniciado;
  iniciado = (async () => {
    let almacen;
    try {
      almacen = window.localStorage;
      void almacen.length;
    } catch {
      return estadoRespaldo; // sin localStorage no hay nada que respaldar
    }
    const original = Storage.prototype.setItem;
    // 1) restaurar lo que falta y subir lo que no está en disco
    try {
      const { items } = await fetchJson(API);
      const enDisco = new Map(items.map((i) => [i.clave, i.valor]));
      for (const [k, v] of enDisco) {
        if (clave(k) && almacen.getItem(k) === null) {
          original.call(almacen, k, v);
          estadoRespaldo.restaurados++;
        }
      }
      for (let i = 0; i < almacen.length; i++) {
        const k = almacen.key(i);
        if (clave(k)) {
          const v = almacen.getItem(k);
          if (enDisco.get(k) !== v) encolar(k, v);
        }
      }
      estadoRespaldo.activo = true;
    } catch (e) {
      estadoRespaldo.ultimoError = String(e.message || e);
    }
    // 2) espejo continuo
    Storage.prototype.setItem = function (k, v) {
      original.call(this, k, v);
      try {
        if (this === almacen && clave(k)) encolar(k, String(v));
      } catch { /* el respaldo nunca interrumpe al Taller */ }
    };
    window.addEventListener('pagehide', () => {
      if (pendientes.size && navigator.sendBeacon) {
        const lote = [...pendientes].map(([k, v]) => ({ clave: k, valor: v.valor, fecha: v.fecha }));
        try { navigator.sendBeacon(API, new Blob([JSON.stringify({ items: lote })], { type: 'application/json' })); } catch { /* ignorar */ }
      }
    });
    return estadoRespaldo;
  })();
  return iniciado;
}
