// Selector de tipos de árbol del lugar (panel Escena, junto al enlace al generador). No toca panel/.
const n=v=>Number(v).toLocaleString('es-ES');
const tri=(t,nivel)=>t.niveles?.[nivel]?.triangulos??t.triangulos;
const etiqueta=(t,nivel)=>t.nombre+' · '+n(t.alturaM[0])+'–'+n(t.alturaM[1])+' m · '+n(tri(t,nivel))+' tri';
const GRUPOS=[['arbol','Árboles'],['arbusto','Arbustos'],['palmera','Palmeras'],['seto','Setos']];

export function montarSelectorVegetacion({host,vegetacion,status=()=>{},documento=globalThis.document}){
  const el=(tag,props={},...children)=>{const e=documento.createElement(tag);Object.assign(e,props);e.append(...children);return e;};
  const filas=el('div',{className:'vegetacion-filas'}),estado=el('p',{className:'vegetacion-estado'}),catalogo=el('details',{className:'vegetacion-catalogo'});
  estado.setAttribute('role','status');estado.setAttribute('aria-live','polite');
  const restablecer=el('button',{type:'button',textContent:'Restablecer originales'});
  // Nivel de detalle: uno fijo para todos los árboles del lugar (no cambia con la distancia).
  const detalle=el('select',{className:'vegetacion-detalle'});detalle.setAttribute('aria-label','Nivel de detalle de los árboles');
  const filaDetalle=el('label',{className:'vegetacion-fila'},el('span',{textContent:'Nivel de detalle del lugar (todos los árboles)'}),detalle);
  const caja=el('fieldset',{className:'vegetacion-selector'},el('legend',{textContent:'Árboles del lugar'}),
    el('p',{className:'vegetacion-ayuda',textContent:'Máximo 4 tipos por lugar. Cambiar un tipo conserva la posición, el giro y la escala de cada árbol.'}),
    filaDetalle,filas,restablecer,catalogo,estado);
  host.append(caja);
  let ocupado=false,disposed=false;
  const mensaje=text=>{if(disposed)return;estado.textContent=text;status(text);};
  function render(){
    if(disposed)return;
    if(!vegetacion.catalogo){filas.replaceChildren(el('p',{textContent:vegetacion.error??'Cargando catálogo…'}));restablecer.disabled=detalle.disabled=true;return;}
    const niveles=vegetacion.catalogo.niveles??{};detalle.replaceChildren(...Object.entries(niveles).map(([id,nombre])=>new Option(nombre+(id===vegetacion.detalleExportado?' (exportado)':''),id,false,id===vegetacion.detalle)));
    detalle.disabled=ocupado||!Object.keys(niveles).length;filaDetalle.hidden=!Object.keys(niveles).length;
    const tipos=vegetacion.tiposLugar();filas.replaceChildren();
    if(!tipos.length)filas.append(el('p',{textContent:'Este lugar no tiene árboles exportados.'}));
    for(const t of tipos){
      const origen=vegetacion.tipo(t.origen),select=el('select',{disabled:ocupado});select.setAttribute('aria-label','Tipo para '+(origen?.nombre??t.origen));
      select.dataset.origen=t.origen;
      const usados=new Set(tipos.filter(o=>o!==t).map(o=>o.actual));
      for(const [tipo,titulo]of GRUPOS){const lista=vegetacion.catalogo.tipos.filter(x=>x.tipo===tipo);if(!lista.length)continue;
        const grupo=el('optgroup',{label:titulo});
        for(const x of lista){const op=new Option(etiqueta(x,vegetacion.detalle),x.id,false,x.id===t.actual);op.disabled=usados.has(x.id);grupo.append(op);}
        select.append(grupo);}
      select.onchange=async()=>{
        const destino=select.value,nombre=vegetacion.tipo(destino)?.nombre??destino;ocupado=true;render();mensaje('Cambiando a '+nombre+'…');
        try{await vegetacion.cambiar(t.origen,destino);mensaje((origen?.nombre??t.origen)+' → '+nombre+' · guardado en este navegador.');}
        catch(e){mensaje(e.message);}finally{ocupado=false;render();}
      };
      const cambiado=t.actual!==t.origen?' (antes: '+(origen?.nombre??t.origen)+')':'';
      filas.append(el('label',{className:'vegetacion-fila'},el('span',{textContent:(t.tipo?.nombre??t.actual)+cambiado+' · '+n(t.ejemplares)+' árboles'}),select));
    }
    restablecer.disabled=ocupado||!tipos.some(t=>t.actual!==t.origen)&&vegetacion.detalle===vegetacion.detalleExportado;
    const tabla=el('table',{},el('thead',{},el('tr',{},...['Tipo','Clase','Triáng.','KB'].map(h=>el('th',{textContent:h})))),
      el('tbody',{},...vegetacion.catalogo.tipos.map(x=>el('tr',{},el('td',{textContent:x.nombre}),el('td',{textContent:x.tipo==='arbusto'?'arbusto':'árbol'}),el('td',{textContent:n(tri(x,vegetacion.detalle))}),el('td',{textContent:n(Math.round(x.bytes/1024))})))));
    catalogo.replaceChildren(el('summary',{textContent:'Catálogo completo · '+vegetacion.catalogo.tipos.length+' tipos'}),tabla);
  }
  detalle.onchange=async()=>{const nivel=detalle.value,nombre=vegetacion.catalogo.niveles[nivel];ocupado=true;render();mensaje('Cambiando el detalle a '+nombre+'…');
    try{await vegetacion.cambiarDetalle(nivel);mensaje('Detalle '+nombre+' · guardado en este navegador.');}catch(e){mensaje(e.message);}finally{ocupado=false;render();}};
  restablecer.onclick=async()=>{ocupado=true;render();try{await vegetacion.restablecer();mensaje('Árboles originales restablecidos.');}catch(e){mensaje(e.message);}finally{ocupado=false;render();}};
  vegetacion.iniciar().then(render,e=>mensaje(e.message));render();
  return ()=>{disposed=true;caja.remove();};
}
