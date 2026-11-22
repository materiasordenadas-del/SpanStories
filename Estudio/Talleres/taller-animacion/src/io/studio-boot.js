// Dentro del Estudio el Taller pide el personaje de la escena en el primer instante (antes de cargar nada):
// así arranca directamente con él, sin cargar antes el último personaje usado ni esperar a la biblioteca.
// El Estudio contesta a READY con INIT (components/world-lexicon/StudioWorkshop.tsx); behaviors.js lo recoge aquí.
import { setSharedViewport } from './shared-viewport.js';

const CHANNEL = 'spanstories.workshop';
const allowedHosts = new Set([location.origin]);
const params = new URLSearchParams(location.search);
const session = params.get('studioSession');
const hostOrigin = params.get('studioOrigin');
export const studioEmbedded = !!session && allowedHosts.has(hostOrigin) && parent !== window;

/** Precarga: el Estudio puede tener el Taller abierto pero oculto (en espera). Mientras tanto no entra en escena ni dibuja. */
export const studioHold = { held: false, listeners: new Set() };
const setHeld = (v) => {
  if (studioHold.held === !!v) return;
  studioHold.held = !!v;
  for (const fn of studioHold.listeners) fn(studioHold.held);
};

let resolve;
/** Primer INIT del Estudio (el mensaje entero) o null si no está dentro del Estudio. */
export const studioInit = studioEmbedded ? new Promise((r) => (resolve = r)) : Promise.resolve(null);
if (studioEmbedded) {
  let got = false;
  const take = (event) => {
    const m = event.data;
    if (event.source !== parent || event.origin !== hostOrigin || m?.channel !== CHANNEL || m.session !== session || m.version !== 1) return;
    if (m.type === 'VISIBLE') setHeld(m.visible === false);
    if (m.type === 'VIEWPORT_RECT') setSharedViewport(m.rect);
    if (m.type !== 'INIT' || got) return;
    got = true;
    setHeld(m.held === true);
    resolve(m);
  };
  addEventListener('message', take);
  parent.postMessage({ channel: CHANNEL, version: 1, session, type: 'READY', early: true }, hostOrigin);
}

/** URL servida por el Taller para el modelo del personaje de la escena. */
export const studioModelURL = (modelUrl) => '/ecosystem/model?url=' + encodeURIComponent(modelUrl);

/** Espera el INIT como mucho `ms` (si el Estudio tarda, el Taller arranca como siempre y lo recoge después). */
export const studioInitWithin = (ms) => Promise.race([studioInit, new Promise((r) => setTimeout(() => r(null), ms))]);
