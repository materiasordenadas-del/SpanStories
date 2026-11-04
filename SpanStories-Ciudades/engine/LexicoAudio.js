// Pronunciación de la palabra tocada.
//   1. Archivo pregrabado de la entrada (audio.url, relativo al mapa) cuando existe.
//   2. Voz del navegador en español como respaldo. Si el dispositivo no tiene ninguna voz en español, NO se lee
//      con una voz de otro idioma: pronunciaría mal y enseñaría mal. Se avisa y queda el botón «Escuchar».
// reproducir() resuelve con: 'archivo' | 'voz' | 'bloqueado' (política de reproducción) | 'ninguno'.
import { LEXICO } from '../routes.js';

export function vozDelNavegador(win = globalThis, config = LEXICO) {
  const synth = win.speechSynthesis, Utterance = win.SpeechSynthesisUtterance;
  if (!synth || !Utterance) return null;
  const elegirVoz = lang => {
    const voces = synth.getVoices?.() ?? [];
    if (voces.length === 0) return { disponible: true, voz: null }; // aún cargando: el navegador elige por `lang`
    const base = lang.slice(0, 2).toLowerCase();
    const voz = voces.find(v => v.lang?.replace('_', '-').toLowerCase() === lang.toLowerCase()) ?? voces.find(v => v.lang?.toLowerCase().startsWith(base));
    return { disponible: !!voz, voz: voz ?? null };
  };
  return {
    hablar(texto, lang = config.speechLang) {
      const { disponible, voz } = elegirVoz(lang);
      if (!disponible) return false;
      synth.cancel();
      const frase = new Utterance(texto);
      frase.lang = voz?.lang ?? lang; if (voz) frase.voice = voz; frase.rate = config.speechRate;
      return new Promise(resolve=>{
        const timeout=setTimeout(()=>resolve(false),3000);
        frase.onstart=()=>{clearTimeout(timeout);resolve(true);};
        frase.onerror=()=>{clearTimeout(timeout);resolve(false);};
        synth.speak(frase);
      });
    },
    detener() { synth.cancel(); }
  };
}

export function crearAudioLexico({ baseUrl, voz = vozDelNavegador(), crearAudio = url => new Audio(url) } = {}) {
  let actual = null;
  const detenerArchivo = () => { if (actual) { try { actual.pause(); } catch { /* sin efecto */ } actual = null; } };

  function reproducirArchivo(url) {
    return new Promise((resolve, reject) => {
      const audio = crearAudio(url);
      actual = audio;
      audio.addEventListener?.('error', () => reject(new Error('archivo no disponible')), { once: true });
      Promise.resolve(audio.play()).then(resolve, reject);
    });
  }

  return {
    async reproducir(entrada) {
      detenerArchivo(); voz?.detener();
      if (entrada.audio && baseUrl) {
        try { await reproducirArchivo(new URL(entrada.audio.url, baseUrl).href); return 'archivo'; }
        catch (error) {
          detenerArchivo();
          if (error?.name === 'NotAllowedError') return 'bloqueado';
        }
      }
      return await voz?.hablar(entrada.speech.text, entrada.speech.lang) ? 'voz' : 'ninguno';
    },
    detener() { detenerArchivo(); voz?.detener(); }
  };
}
