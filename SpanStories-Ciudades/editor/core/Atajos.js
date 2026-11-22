// Atajos de teclado: despacha eventos a las acciones registradas. Opcionales: todo se puede hacer con el ratón.
// Se ignoran mientras se escribe en un campo, y no actúan fuera del modo Editor.
export function montarAtajos({ acciones, contexto, activo = () => true, alEscape = () => {} }) {
  const enCampo = t => !!t?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]');
  async function tecla(e) {
    if (!activo() || e.defaultPrevented || enCampo(e.target)) return;
    if (e.key === 'Escape') { alEscape(); return; }
    const accion = acciones.porEvento(e);
    if (!accion) return;
    e.preventDefault(); e.stopPropagation();
    try { await acciones.ejecutar(accion.id, contexto()); } catch (error) { contexto().estado?.(error.message); }
  }
  window.addEventListener('keydown', tecla, true);
  return { dispose() { window.removeEventListener('keydown', tecla, true); } };
}
