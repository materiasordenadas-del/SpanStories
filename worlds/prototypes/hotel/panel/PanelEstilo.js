// Sección «Luz y estilo» del panel. Misma lógica en todos los proyectos SpanStories:
// ambiente · contorno · grosor · reflejo. Se monta dentro de <section id="panel-estilo">.
// Las preferencias van a localStorage (por proyecto: `clave`); la URL (?amb=noche) manda.
import { AMBIENTES } from '../engine/Luz25D.js';

export function montarPanelEstilo({ luz, contenedor, clave = 'spanstories.luz.v1', setReflejo = null }) {
  contenedor.innerHTML = `
    <h3>Luz y estilo</h3>
    <label>Ambiente <select data-e="ambiente"></select></label>
    <label><input type="checkbox" data-e="contorno"> Contorno cartoon</label>
    <label data-e-fila="grosor">Grosor del trazo
      <input type="range" data-e="grosor" min="0.6" max="3" step="0.1"> <output data-e="grosor-valor"></output></label>
    ${setReflejo ? '<label><input type="checkbox" data-e="reflejo"> Reflejo del piso</label>' : ''}`;
  const $ = (n) => contenedor.querySelector(`[data-e="${n}"]`);

  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(clave) || '{}') || {}; } catch { prefs = {}; }
  const guardar = () => { try { localStorage.setItem(clave, JSON.stringify(prefs)); } catch { /* sin almacenamiento */ } };

  for (const [k, A] of Object.entries(AMBIENTES)) $('ambiente').append(new Option(A.nombre, k));

  function ponerAmbiente(k) {
    if (!AMBIENTES[k]) return;
    luz.usarAmbiente(k); $('ambiente').value = k; prefs.ambiente = k; guardar();
  }
  function ponerContorno({ activo = prefs.contorno ?? true, grosor = prefs.grosor ?? 1.4 } = {}) {
    luz.contorno({ activo, grosor });
    $('contorno').checked = activo; $('grosor').value = grosor; $('grosor').disabled = !activo;
    $('grosor-valor').textContent = `${Number(grosor).toFixed(1)} px`;
    prefs.contorno = activo; prefs.grosor = grosor; guardar();
  }
  function ponerReflejo(on = prefs.reflejo ?? true) {
    if (!setReflejo) return;
    setReflejo(on); $('reflejo').checked = on; prefs.reflejo = on; guardar();
  }

  $('ambiente').onchange = (e) => ponerAmbiente(e.target.value);
  $('contorno').onchange = (e) => ponerContorno({ activo: e.target.checked });
  $('grosor').oninput = (e) => ponerContorno({ grosor: Number(e.target.value) });
  if (setReflejo) $('reflejo').onchange = (e) => ponerReflejo(e.target.checked);

  ponerAmbiente(new URLSearchParams(location.search).get('amb') || prefs.ambiente || 'manana');
  ponerContorno(); ponerReflejo();
  return { ponerAmbiente, ponerContorno, ponerReflejo };
}
