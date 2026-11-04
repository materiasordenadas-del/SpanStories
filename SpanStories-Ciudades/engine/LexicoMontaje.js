// Monta la interacción léxica de una zona. Se usa solo en modo aprendizaje (?aprendizaje).
// No toca cámara, navegación ni editor: solo escucha toques sobre el lienzo.
import { LEXICO } from '../routes.js';
import { leerMapaLexico, crearResolutorLexico } from './LexicoMapa.js';
import { crearResaltador } from './LexicoResaltado.js';
import { crearAudioLexico } from './LexicoAudio.js';
import { crearBarraLexica } from './LexicoBarra.js';
import { crearInteraccionLexica } from './LexicoInteraccion.js';
import { crearPuertoPostMessage, origenDelAnfitrion } from './LexicoPuertos.js';

// `puerto` permite inyectar un adaptador por callbacks cuando el visor comparte la aplicación.
// Sin puerto, se usa postMessage con el origen del anfitrión que incrusta el visor (lista cerrada en routes.js).
export async function montarLexico({ zone, manifest, scene, camera, renderer, canvas, objetos, anfitrion, puerto = null, win = window, fetcher = fetch, estado = () => {}, alEstado = null }) {
  if (!zone.lexiconUrl) return null;
  const respuesta = await fetcher(zone.lexiconUrl);
  if (!respuesta.ok) throw new Error('No se pudo cargar el vocabulario de la zona.');
  let raw=await respuesta.json();
  // Preparación local del editor: solo afecta a este navegador y a este piloto.
  if(new URLSearchParams(win.location.search).has('borrador')){
    try{const draft=JSON.parse(win.localStorage.getItem('spanstories.narrative-draft:'+zone.id));if(draft?.zoneId===zone.id&&draft.lexicon)raw=draft.lexicon;}catch{/* usar fuente */}
  }
  const mapa = leerMapaLexico(raw);
  if (mapa.zoneId !== zone.id) throw new Error('El vocabulario no corresponde a esta zona.');

  let puertoActivo = puerto;
  if (!puertoActivo) {
    const origen = origenDelAnfitrion({ win, permitidos: LEXICO.hostOrigins });
    if (!origen) { estado('Vocabulario no disponible: este visor no está incrustado en SpanStories.'); return null; }
    puertoActivo = crearPuertoPostMessage({ win, origenAnfitrion: origen });
  }

  const resolutor = crearResolutorLexico(mapa, { objetosManifest: manifest.objects });
  const resaltador = crearResaltador({ renderer,camera });
  const audio = crearAudioLexico({ baseUrl: zone.lexiconUrl });
  let interaccion = null;
  const barra = crearBarraLexica({ anfitrion, alEnviar: texto => interaccion?.enviar(texto), alEscuchar: () => interaccion?.escuchar(), alCerrar: () => interaccion?.cerrar('usuario') });
  interaccion = crearInteraccionLexica({ canvas, camera, scene, objetos, mapa, resolutor, resaltador, audio, barra, puerto: puertoActivo, alEstado });

  return {
    mapa, interaccion,
    renderizarResaltado:()=>resaltador.renderizar(),
    destruir() { interaccion.destruir(); barra.destruir(); resaltador.destruir(); audio.detener(); puertoActivo.destruir?.(); }
  };
}
