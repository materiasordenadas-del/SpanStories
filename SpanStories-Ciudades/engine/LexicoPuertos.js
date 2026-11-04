// Puertos por los que el visor entrega intentos al anfitrión. Ambos exponen la misma interfaz:
//   enviarIntento({entryId, interactionId, attemptNo, typed}) → Promise<respuesta del anfitrión>
// El visor solo envía texto escrito y recibe un veredicto; nunca calcula uno.
//
//  · crearPuertoCallbacks: el visor comparte la aplicación (mismo origen y misma página).
//  · crearPuertoPostMessage: el visor vive en un iframe de otro origen. Comprueba ORIGEN, EMISOR y ESQUEMA
//    de cada respuesta y envía siempre a un origen concreto (nunca «*»).
import { LEXICO } from '../routes.js';

const RESULTADOS = new Set(['CORRECT', 'CORRECT_ACCENT_MISSING', 'INCORRECT']);
const MOTIVOS = new Set(['EMPTY', 'TOO_LONG', 'WRONG_WORD', 'WRONG_ARTICLE', 'ARTICLE_NOT_ACCEPTED']);
const GUARDADO = new Set(['NEWLY_SAVED', 'ALREADY_SAVED']);
const ID_MENSAJE = /^[A-Za-z0-9-]{8,64}$/;
const CLAVES_RESPUESTA = ['outcome', 'reason', 'display', 'saved', 'recorded'];
const esObjeto = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const mismasClaves = (obj, claves) => { const k = Object.keys(obj); return k.length === claves.length && claves.every(c => k.includes(c)); };

export function crearId(cripto = globalThis.crypto) {
  if (cripto?.randomUUID) return cripto.randomUUID();
  const bytes = new Uint8Array(16); cripto?.getRandomValues?.(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('') || String(Date.now()) + String(Math.random()).slice(2);
}

// Valida y copia la respuesta del anfitrión; cualquier forma inesperada se descarta.
export function leerRespuesta(raw) {
  if (!esObjeto(raw) || !mismasClaves(raw, CLAVES_RESPUESTA)) return null;
  if (!RESULTADOS.has(raw.outcome) || typeof raw.recorded !== 'boolean') return null;
  if (raw.reason !== null && !MOTIVOS.has(raw.reason)) return null;
  if (raw.saved !== null && !GUARDADO.has(raw.saved)) return null;
  if (raw.display !== null && (typeof raw.display !== 'string' || raw.display.length > 80)) return null;
  return Object.freeze({ outcome: raw.outcome, reason: raw.reason, display: raw.display, saved: raw.saved, recorded: raw.recorded });
}

export function crearPuertoCallbacks(enviar) {
  if (typeof enviar !== 'function') throw new Error('Se requiere una función enviarIntento.');
  return { async enviarIntento(solicitud) { const r = leerRespuesta(await enviar({ ...solicitud })); if (!r) throw new Error('Respuesta del anfitrión inválida.'); return r; }, destruir() {} };
}

export function origenConcreto(origen) {
  if (typeof origen !== 'string' || origen === '*' || origen === 'null') return false;
  try { return new URL(origen).origin === origen; } catch { return false; }
}

// Origen de la página que nos incrusta, aceptado solo si está en la lista de orígenes configurados.
export function origenDelAnfitrion({ win = window, permitidos = LEXICO.hostOrigins } = {}) {
  if (win.parent === win) return null;
  const candidatos = [];
  if (win.location?.ancestorOrigins?.[0]) candidatos.push(win.location.ancestorOrigins[0]);
  try { if (win.document?.referrer) candidatos.push(new URL(win.document.referrer).origin); } catch { /* referrer inválido */ }
  return candidatos.find(origen => origenConcreto(origen) && permitidos.includes(origen)) ?? null;
}

export function crearPuertoPostMessage({ win = window, objetivo = win.parent, origenAnfitrion, config = LEXICO, programar = setTimeout, cancelar = clearTimeout, nuevoId = crearId } = {}) {
  if (!origenConcreto(origenAnfitrion)) throw new Error('El origen del anfitrión debe ser concreto (no «*»).');
  if (!objetivo || objetivo === win) throw new Error('No hay ventana anfitriona: el visor no está incrustado.');
  const pendientes = new Map();

  function alMensaje(evento) {
    if (evento.origin !== origenAnfitrion || evento.source !== objetivo) return;
    const m = evento.data;
    if (!esObjeto(m) || m.channel !== config.canal || m.version !== config.version || typeof m.id !== 'string' || !ID_MENSAJE.test(m.id)) return;
    const espera = pendientes.get(m.id);
    if (!espera) return;
    if (m.type === 'VERDICT' && mismasClaves(m, ['channel', 'version', 'id', 'type', 'response'])) {
      const respuesta = leerRespuesta(m.response);
      if (!respuesta) return;
      pendientes.delete(m.id); cancelar(espera.temporizador); espera.resolver(respuesta);
    } else if (m.type === 'SAVED' && mismasClaves(m, ['channel', 'version', 'id', 'type', 'saved']) && (m.saved === null || GUARDADO.has(m.saved))) {
      pendientes.delete(m.id); cancelar(espera.temporizador); espera.resolver(m.saved);
    } else if (m.type === 'ERROR' && mismasClaves(m, ['channel', 'version', 'id', 'type', 'code']) && typeof m.code === 'string' && m.code.length <= 32) {
      pendientes.delete(m.id); cancelar(espera.temporizador); espera.rechazar(new Error('El anfitrión rechazó el intento: ' + m.code));
    }
  }
  win.addEventListener('message', alMensaje);

  return {
    registrarExposicion({entryId,interactionId,exposure}){
      objetivo.postMessage({channel:config.canal,version:config.version,type:'EXPOSURE',entryId,interactionId,exposure},origenAnfitrion);
    },
    // «Guardar» del estudiante. Resuelve con 'NEWLY_SAVED' | 'ALREADY_SAVED' | null.
    guardarPalabra({ entryId, interactionId }) {
      const id = nuevoId();
      return new Promise((resolver, rechazar) => {
        const temporizador = programar(() => { pendientes.delete(id); rechazar(new Error('El anfitrión no respondió a tiempo.')); }, config.replyTimeoutMs);
        pendientes.set(id, { resolver, rechazar, temporizador });
        objetivo.postMessage({ channel: config.canal, version: config.version, id, type: 'SAVE', entryId, interactionId }, origenAnfitrion);
      });
    },
    enviarIntento({ entryId, interactionId, attemptNo, typed }) {
      const id = nuevoId();
      return new Promise((resolver, rechazar) => {
        const temporizador = programar(() => { pendientes.delete(id); rechazar(new Error('El anfitrión no respondió a tiempo.')); }, config.replyTimeoutMs);
        pendientes.set(id, { resolver, rechazar, temporizador });
        objetivo.postMessage({ channel: config.canal, version: config.version, id, type: 'ATTEMPT', entryId, interactionId, attemptNo, typed }, origenAnfitrion);
      });
    },
    destruir() {
      win.removeEventListener('message', alMensaje);
      for (const [id, espera] of pendientes) { cancelar(espera.temporizador); espera.rechazar(new Error('Puerto cerrado.')); pendientes.delete(id); }
    }
  };
}
