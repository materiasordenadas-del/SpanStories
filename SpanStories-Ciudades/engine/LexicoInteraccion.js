// Controlador de la interacción léxica: toque → objeto → audio + barra → intento → veredicto del anfitrión.
//
// Principios:
//  · La historia controla la cámara. Este módulo no la mueve ni añade navegación; solo lee un toque o clic.
//  · El anfitrión es la autoridad. Aquí no hay ortografía esperada, ni validación, ni progreso, ni «KNOWN».
//  · Se interactúa solo con objetos HABILITADOS en la escena narrativa actual (habilitar()).
//  · El mismo código atiende ratón, lápiz y táctil mediante Pointer Events (un toque corto y casi inmóvil).
import * as T from './three.js';
import { LEXICO } from '../routes.js';
import { crearId } from './LexicoPuertos.js';

const MENSAJES = Object.freeze({
  EMPTY: 'Escribe la palabra.',
  TOO_LONG: 'Es demasiado largo. Escribe solo la palabra.',
  WRONG_WORD: 'Todavía no. Escúchala otra vez e inténtalo de nuevo.',
  WRONG_ARTICLE: 'Casi: revisa el artículo e inténtalo de nuevo.',
  ARTICLE_NOT_ACCEPTED: 'Escribe solo la palabra, sin artículo.'
});

export function crearInteraccionLexica({
  canvas, camera, scene, objetos, mapa, resolutor, resaltador, audio, barra, puerto,
  config = LEXICO, Raycaster = T.Raycaster, Vector2 = T.Vector2, nuevoId = crearId, programar = setTimeout, cancelar = clearTimeout, ahora = () => performance.now(), alEstado = null,
  // Visor Web del estudiante: la palabra solo se guarda con «Guardar»; acertar no la guarda.
  guardadoManual = false
}) {
  if (!puerto) throw new Error('La interacción léxica necesita un puerto hacia el anfitrión.');
  let habilitadas = new Set();
  let sesion = null, gesto = null, destruido = false, temporizadorCierre = null;
  const punteros = new Set();
  const emitir = (tipo, datos = {}) => alEstado?.({ tipo, ...datos });

  function detenerCierre() { if (temporizadorCierre !== null) { cancelar(temporizadorCierre); temporizadorCierre = null; } }

  function cerrar(motivo = 'cerrada') {
    detenerCierre();
    if (!sesion) return;
    const { entrada } = sesion;
    sesion = null;
    resaltador.ocultar(); barra.cerrar(); audio.detener();
    emitir('cerrada', { entryId: entrada.id, motivo });
  }

  async function escuchar() {
    if (!sesion) return 'ninguno';
    const actual=sesion,{ entrada } = actual;
    const resultado = await audio.reproducir(entrada);
    if(sesion===actual&&(resultado==='archivo'||resultado==='voz'))puerto.registrarExposicion?.({entryId:entrada.id,interactionId:actual.interactionId,exposure:'AUDIO'});
    if (sesion?.entrada === entrada && (resultado === 'ninguno' || resultado === 'bloqueado'))
      barra.mostrar('info', 'No se pudo reproducir el audio automáticamente. Pulsa 🔊 para escucharlo.');
    return resultado;
  }

  function abrir(entrada, registro) {
    detenerCierre();
    if (sesion && sesion.entrada.id === entrada.id) { void escuchar(); barra.enfocar(); return; }
    if (sesion) { audio.detener(); }
    const raices = resolutor.raicesParaResaltar(entrada, registro, objetos.entries.values());
    resaltador.mostrar(raices);
    sesion = { entrada, sector:registro.sector??registro.raiz?.userData.sector, interactionId: nuevoId(), intentos: 0, pendiente: false, resuelta: false, fallo: null };
    puerto.registrarExposicion?.({entryId:entrada.id,interactionId:sesion.interactionId,exposure:'OBJECT'});
    barra.abrir(); barra.mostrar('info', guardadoManual ? 'Escucha la palabra. Puedes escribirla o guardarla en Práctica.' : 'Escucha y escribe la palabra.');
    barra.enfocar();
    void escuchar();
    emitir('abierta', { entryId: entrada.id, interactionId: sesion.interactionId });
  }

  async function enviar(texto) {
    const actual = sesion;
    if (!actual || actual.pendiente || actual.resuelta) return null;
    if (typeof texto !== 'string' || texto.trim() === '') { barra.mostrar('error', MENSAJES.EMPTY); return null; }
    // Reintento tras un fallo de comunicación con el mismo texto: mismo número de intento, el anfitrión no duplica.
    const numero = actual.fallo && actual.fallo.typed === texto ? actual.fallo.attemptNo : Math.max(actual.intentos, actual.fallo?.attemptNo ?? 0) + 1;
    actual.pendiente = true; barra.ocupado(true); barra.mostrar('info', 'Comprobando…');
    let respuesta;
    try {
      respuesta = await puerto.enviarIntento({ entryId: actual.entrada.id, interactionId: actual.interactionId, attemptNo: numero, typed: texto });
    } catch {
      if (sesion !== actual) return null;
      actual.pendiente = false; actual.fallo = { typed: texto, attemptNo: numero };
      barra.ocupado(false); barra.mostrar('error', 'No pudimos comprobar tu respuesta. Inténtalo de nuevo.');
      emitir('error-comunicacion', { entryId: actual.entrada.id });
      return null;
    }
    if (sesion !== actual) return null; // el estudiante cambió de objeto mientras esperaba
    actual.pendiente = false; actual.fallo = null; barra.ocupado(false);
    if (!respuesta.recorded) {
      actual.fallo = { typed: texto, attemptNo: numero };
      barra.mostrar('error', 'No pudimos registrar este intento. Inténtalo otra vez.');
      emitir('sin-registro', { entryId: actual.entrada.id });
      return respuesta;
    }
    actual.intentos = numero;
    if (respuesta.outcome === 'INCORRECT') {
      barra.mostrar('error', MENSAJES[respuesta.reason] ?? MENSAJES.WRONG_WORD);
      barra.seleccionar();
      emitir('incorrecta', { entryId: actual.entrada.id, intento: numero });
      if (respuesta.reason === 'WRONG_WORD' || respuesta.reason === 'WRONG_ARTICLE' || respuesta.reason === 'ARTICLE_NOT_ACCEPTED') void escuchar();
      return respuesta;
    }
    if(!respuesta.saved&&!guardadoManual){
      actual.fallo={typed:texto,attemptNo:numero};
      barra.mostrar('aviso','La respuesta es correcta, pero no pudimos guardarla. Pulsa Comprobar para reintentar el guardado.');
      return respuesta;
    }
    actual.resuelta = true; barra.bloquear();
    const palabra = respuesta.display ?? '';
    const partes = [`¡Correcto! ${palabra}`.trim()];
    if (respuesta.outcome === 'CORRECT_ACCENT_MISSING') partes.push('Cuidado con la tilde: se escribe así.');
    if (!guardadoManual) partes.push(respuesta.saved === 'NEWLY_SAVED' ? 'Guardada en tus palabras.' : respuesta.saved === 'ALREADY_SAVED' ? 'Ya la tenías guardada.' : 'No pudimos guardarla ahora.');
    barra.mostrar(respuesta.saved || guardadoManual ? 'ok' : 'aviso', partes.join(' '));
    emitir('correcta', { entryId: actual.entrada.id, saved: respuesta.saved, intento: numero });
    // En el Visor Web la barra sigue abierta: el estudiante decide si guarda o cancela.
    if (!guardadoManual) temporizadorCierre = programar(() => { temporizadorCierre = null; if (sesion === actual) cerrar('completada'); }, config.autoCloseMs);
    return respuesta;
  }

  async function guardar() {
    const actual = sesion;
    if (!actual || actual.guardando || actual.guardada || !puerto.guardarPalabra) return null;
    detenerCierre();
    actual.guardando = true; barra.guardadoEstado?.('guardando');
    let saved = null;
    try { saved = await puerto.guardarPalabra({ entryId: actual.entrada.id, interactionId: actual.interactionId }); } catch { saved = null; }
    if (sesion !== actual) return saved;
    actual.guardando = false;
    if (!saved) { barra.guardadoEstado?.('listo'); barra.mostrar('error', 'No pudimos guardar la palabra. Inténtalo otra vez.'); return null; }
    actual.guardada = true; barra.guardadoEstado?.('guardada');
    barra.mostrar('ok', saved === 'NEWLY_SAVED' ? 'Guardada en Práctica.' : 'Ya la tenías guardada en Práctica.');
    emitir('guardada', { entryId: actual.entrada.id, saved });
    temporizadorCierre = programar(() => { temporizadorCierre = null; if (sesion === actual) cerrar('guardada'); }, config.autoCloseMs);
    return saved;
  }

  function impacto(clientX, clientY, filtro) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const punto = new Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    scene.updateMatrixWorld(true); camera.updateMatrixWorld(true);
    const rayo = new Raycaster();
    rayo.setFromCamera(punto, camera);
    // Gana el primer objeto visible del registro (mallas hijas e instancias incluidas). Lo que está delante tapa lo que hay detrás.
    const registro = objetos.elegirImpacto(rayo.intersectObjects(scene.children, true));
    if (!registro) return null;
    const entrada = resolutor.entradaPara(registro, filtro);
    return entrada ? { entrada, registro } : null;
  }
  function tocar(clientX, clientY) {
    const hit = impacto(clientX, clientY, habilitadas);
    if (!hit) return null;
    abrir(hit.entrada, hit.registro);
    return hit.entrada;
  }
  // Autoría: qué entrada del mapa reclama el objeto bajo el cursor, sin abrir la barra ni exigir que esté habilitada.
  function identificar(clientX, clientY) { return impacto(clientX, clientY, null)?.entrada ?? null; }

  const invalidar = () => { if (gesto) gesto.valido = false; };
  const alBajar = e => {
    if (destruido) return;
    punteros.add(e.pointerId);
    if (punteros.size > 1) { invalidar(); return; }
    gesto = { id: e.pointerId, x: e.clientX, y: e.clientY, t: ahora(), valido: (e.button ?? 0) === 0 };
  };
  const alMover = e => { if (gesto && e.pointerId === gesto.id && Math.hypot(e.clientX - gesto.x, e.clientY - gesto.y) > config.tapMovePx) gesto.valido = false; };
  const alSubir = e => {
    punteros.delete(e.pointerId);
    const g = gesto;
    if (!g || g.id !== e.pointerId) return;
    gesto = null;
    if (!g.valido || destruido) return;
    if (ahora() - g.t > config.tapMaxMs || Math.hypot(e.clientX - g.x, e.clientY - g.y) > config.tapMovePx) return;
    tocar(e.clientX, e.clientY);
  };
  const alCancelar = e => { punteros.delete(e.pointerId); if (gesto?.id === e.pointerId) gesto = null; };
  canvas.addEventListener('pointerdown', alBajar);
  canvas.addEventListener('pointermove', alMover);
  canvas.addEventListener('pointerup', alSubir);
  canvas.addEventListener('pointercancel', alCancelar);

  return {
    tocar, identificar, enviar, escuchar, cerrar, guardar,
    // La historia indica qué entradas del mapa están disponibles en la escena actual.
    habilitar(ids) {
      habilitadas = new Set(ids.filter(id => mapa.entries.some(e => e.id === id)));
      if (sesion && !habilitadas.has(sesion.entrada.id)) cerrar('escena');
    },
    get habilitadas() { return [...habilitadas]; },
    get sectorActivo(){return sesion?.sector??null;},
    get activa() { return sesion ? { entryId: sesion.entrada.id, interactionId: sesion.interactionId, intentos: sesion.intentos, resuelta: sesion.resuelta } : null; },
    destruir() {
      destruido = true; cerrar('destruida');
      canvas.removeEventListener('pointerdown', alBajar); canvas.removeEventListener('pointermove', alMover);
      canvas.removeEventListener('pointerup', alSubir); canvas.removeEventListener('pointercancel', alCancelar);
    }
  };
}
