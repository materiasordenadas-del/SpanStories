// Voz del nombre de cada objeto (speechSynthesis). Preferencia: español de Colombia → latinoamericano → cualquiera.
// Sin síntesis disponible no pasa nada: el nombre igual se muestra en pantalla.
const PREFERENCIA = ['es-CO', 'es-419', 'es-US', 'es-MX', 'es-AR', 'es-ES', 'es'];
let voces = [];
function cargar() { try { voces = window.speechSynthesis?.getVoices() ?? []; } catch { voces = []; } }
if (typeof window !== 'undefined' && window.speechSynthesis) { cargar(); window.speechSynthesis.addEventListener?.('voiceschanged', cargar); }

export function elegirVoz(lista = voces) {
  for (const pref of PREFERENCIA) {
    const v = lista.find(v => v.lang?.replace('_', '-').toLowerCase().startsWith(pref.toLowerCase()));
    if (v) return v;
  }
  return null;
}
export function decir(texto, { lento = false } = {}) {
  try {
    const s = window.speechSynthesis; if (!s || !texto) return false;
    s.cancel(); const u = new SpeechSynthesisUtterance(texto);
    const v = elegirVoz(); u.lang = v?.lang || 'es-CO'; if (v) u.voice = v; u.rate = lento ? .75 : .9;
    s.speak(u); return true;
  } catch { return false; }
}
export const vozActual = () => elegirVoz()?.name ?? 'voz del sistema (es-CO)';
