// Sección «Luz y estilo» del panel. Misma lógica en todos los proyectos SpanStories:
// ambiente · contorno · grosor · reflejo. Se monta dentro de <section id="panel-estilo">.
// Las preferencias van a localStorage (por proyecto: `clave`); la URL (?amb=noche) manda.
import { AMBIENTES } from '../engine/Luz25D.js';

export function montarPanelEstilo({ luz, estilos = null, contenedor, clave = 'spanstories.luz.v1', setReflejo = null }) {
  contenedor.innerHTML = `
    <h3>${estilos ? 'Estilos' : 'Luz y estilo'}</h3>
    ${estilos ? '<label>Estilo visual <select data-e="estilo"></select></label><p data-e="descripcion"></p><div data-e="controles"></div>' : ''}
    <label>Ambiente <select data-e="ambiente"></select></label>
    <label><input type="checkbox" data-e="contorno"> Contorno cartoon</label>
    <label data-e-fila="grosor">Grosor del trazo
      <input type="range" data-e="grosor" min="0.6" max="3" step="0.1"> <output data-e="grosor-valor"></output></label>
    ${setReflejo ? '<label><input type="checkbox" data-e="reflejo"> Reflejo del piso</label>' : ''}`;
  const $ = (n) => contenedor.querySelector(`[data-e="${n}"]`);
  let ultimoEstilo=null;
  function actualizarEstilo() {
    if(!estilos)return;
    if(ultimoEstilo===estilos.activo&&estilos.composicionFija){
      for(const input of $('controles').querySelectorAll('input')){
        const value=estilos.actual.uniformes[input.dataset.estiloControl].value;
        if(document.activeElement!==input)input.value=value;
        input.nextElementSibling.textContent=Number(value).toFixed(2);
      }
      $('ambiente').value=estilos.ambienteVisual;return;
    }
    ultimoEstilo=estilos.activo;
    const select=$('estilo');select.replaceChildren();
    for(const profile of estilos.listar())select.append(new Option(profile.nombre,profile.id));
    select.value=estilos.activo;$('descripcion').textContent=estilos.actual.descripcion||'';
    actualizarAmbientes();
    const controls=$('controles');controls.replaceChildren();
    for(const control of estilos.actual.controles||[]) {
      const label=document.createElement('label'),input=document.createElement('input'),output=document.createElement('output');
      label.append(document.createTextNode(control.nombre+' '));input.type=control.tipo==='color'?'color':'range';
      input.dataset.estiloControl=control.clave;input.setAttribute('aria-label',control.nombre);
      if(input.type==='range'){input.min=control.min;input.max=control.max;input.step=control.paso;}
      const value=estilos.actual.uniformes[control.clave].value;
      input.value=value?.isColor?'#'+value.getHexString():value;output.textContent=input.type==='color'?input.value:Number(input.value).toFixed(2);
      input.oninput=()=>{estilos.ajustar(control.clave,input.type==='color'?input.value:Number(input.value));output.textContent=input.type==='color'?input.value:Number(input.value).toFixed(2);};
      label.append(input,output);controls.append(label);
    }
  }
  let soltarEstilos=null;

  let prefs = {};
  try { prefs = JSON.parse(localStorage.getItem(clave) || '{}') || {}; } catch { prefs = {}; }
  const guardar = () => { try { localStorage.setItem(clave, JSON.stringify(prefs)); } catch { /* sin almacenamiento */ } };

  function actualizarAmbientes(){
    const select=$('ambiente');select.replaceChildren();
    for(const [k,A] of Object.entries({...AMBIENTES,...estilos?.actual.ambientes}))select.append(new Option(A.nombre,k));
    select.value=estilos?.ambienteVisual||luz.ambiente;
  }
  if(estilos){actualizarEstilo();$('estilo').onchange=e=>estilos.seleccionar(e.target.value);soltarEstilos=estilos.alCambiar(actualizarEstilo);}
  else actualizarAmbientes();

  function ponerAmbiente(k) {
    if(!AMBIENTES[k]&&!estilos?.actual.ambientes?.[k])k=luz.ambiente||'manana';
    if(estilos)estilos.usarAmbiente(k);else luz.usarAmbiente(k);
    $('ambiente').value = k; prefs.ambiente = k; guardar();
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

  if(estilos?.composicionFija){
    // El pool manda sobre las preferencias antiguas por navegador/origen.
    $('contorno').closest('label').style.display='none';$('grosor').closest('label').style.display='none';
  }else{
    ponerAmbiente(new URLSearchParams(location.search).get('amb') || prefs.ambiente || estilos?.ambienteVisual || 'manana');
    ponerContorno();
  }
  ponerReflejo();
  return { ponerAmbiente, ponerContorno, ponerReflejo, destruir:()=>soltarEstilos?.() };
}
