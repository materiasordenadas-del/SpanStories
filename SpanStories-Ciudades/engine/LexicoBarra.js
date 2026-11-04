// Barra inferior para escribir la palabra. Nunca contiene la ortografía esperada antes de acertar:
// ni en el texto, ni en el placeholder, ni en atributos ARIA, ni en la longitud del campo.
import { LEXICO } from '../routes.js';

export function crearBarraLexica({ doc = document, anfitrion, config = LEXICO, alEnviar, alEscuchar, alCerrar }) {
  const el = (tag, props = {}, hijos = []) => {
    const nodo = doc.createElement(tag);
    for (const [clave, valor] of Object.entries(props)) {
      if (clave === 'className') nodo.className = valor;
      else if (clave === 'text') nodo.textContent = valor;
      else nodo.setAttribute(clave, valor);
    }
    nodo.append(...hijos);
    return nodo;
  };

  const escuchar = el('button', { type: 'button', className: 'lexico-escuchar', 'aria-label': 'Escuchar la palabra otra vez', text: '🔊' });
  const campo = el('input', {
    type: 'text', name: 'palabra', className: 'lexico-campo', 'aria-label': 'Escribe la palabra que escuchaste', placeholder: 'Escribe la palabra',
    autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', lang: 'es', enterkeyhint: 'send', inputmode: 'text', maxlength: String(config.maxTyped)
  });
  const enviar = el('button', { type: 'button', className: 'lexico-enviar', text: 'Comprobar' });
  const cerrar = el('button', { type: 'button', className: 'lexico-cerrar', 'aria-label': 'Cerrar', text: '✕' });
  const estado = el('p', { className: 'lexico-estado', role: 'status', 'aria-live': 'polite' });
  const fila = el('div', { className: 'lexico-fila' }, [escuchar, campo, enviar, cerrar]);
  // No es un <form>: dentro de un iframe con sandbox sin «allow-forms» el navegador bloquea el envío nativo.
  const raiz = el('div', { className: 'lexico-barra', role: 'group', 'aria-label': 'Escribe la palabra del objeto' }, [fila, estado]);
  raiz.hidden = true;
  raiz.dataset.estado = 'cerrada';
  anfitrion.append(raiz);

  // Escribir no debe activar atajos de otras partes de la página.
  const lanzar = () => { if (!campo.disabled && !campo.readOnly) alEnviar?.(campo.value); };
  for (const tipo of ['keydown', 'keyup', 'keypress']) campo.addEventListener(tipo, e => e.stopPropagation());
  campo.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); lanzar(); } });
  enviar.addEventListener('click', lanzar);
  escuchar.addEventListener('click', () => alEscuchar?.());
  cerrar.addEventListener('click', () => alCerrar?.());

  return {
    raiz, campo, estado, enviar,
    abrir() { raiz.hidden = false; raiz.dataset.estado = 'abierta'; campo.disabled = false; enviar.disabled = false; campo.value = ''; estado.textContent = ''; estado.dataset.tipo = 'info'; },
    cerrar() { raiz.hidden = true; raiz.dataset.estado = 'cerrada'; campo.value = ''; estado.textContent = ''; campo.blur(); },
    enfocar() { campo.focus({ preventScroll: true }); },
    mostrar(tipo, texto) { estado.dataset.tipo = tipo; estado.textContent = texto; raiz.dataset.resultado = tipo; },
    ocupado(valor) { campo.readOnly = valor; enviar.disabled = valor; raiz.setAttribute('aria-busy', String(valor)); },
    // Tras acertar se bloquea el campo; escuchar y cerrar siguen disponibles.
    bloquear() { campo.disabled = true; enviar.disabled = true; raiz.dataset.estado = 'resuelta'; },
    seleccionar() { campo.select?.(); },
    get visible() { return !raiz.hidden; },
    destruir() { raiz.remove(); }
  };
}
