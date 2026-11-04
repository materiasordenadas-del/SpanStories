import {SHOP_CATEGORIES} from '../data/shop-categories.js';
import {validateCommerce} from '../data/commerces.js';
export class CommercePanel{
  constructor(host,{select,apply,undo,focus,retry,changeDesign}={}){this.host=host;this.actions={select,apply,undo,focus,retry,changeDesign};this.query='';}
  update(state){
    const entries=state.built?.commerce?.entries??[],selected=entries.find(c=>c.id===state.selectedCommerceId),host=this.host;host.replaceChildren();
    const title=document.createElement('h3');title.textContent='Comercios procedurales';host.append(title);
    const designLabel=document.createElement('label');designLabel.className='field';designLabel.textContent='Diseño de los comercios';const design=document.createElement('select');design.setAttribute('aria-label','Diseño de los comercios');design.add(new Option('Claude · pintado','claude'));design.add(new Option('Blender · volumen','blender'));design.value=state.options.commerceDesign??'claude';design.disabled=state.busy;design.onchange=()=>this.actions.changeDesign?.(design.value);designLabel.append(design);host.append(designLabel);
    const coverage=document.createElement('p');coverage.className='small';const status=state.source?.osm?.commerceCoverage;coverage.textContent=status?.complete===false?'Comercios no descargados · se muestran propuestas inferidas':`${entries.length} escaparates · ${entries.filter(c=>!c.inferred).length} enlazados a OSM · resto inferido`;host.append(coverage);
    if(state.mode==='real'){const retry=document.createElement('button');retry.className='btn';retry.textContent='Reintentar comercios';retry.disabled=state.busy||!state.source||state.settings.offline;retry.onclick=()=>this.actions.retry();host.append(retry);}
    const search=document.createElement('input');search.placeholder='Buscar comercio o categoría';search.setAttribute('aria-label','Buscar comercio');search.value=this.query;search.onchange=()=>{this.query=search.value;this.update(state);};host.append(search);
    const pick=document.createElement('select');pick.setAttribute('aria-label','Seleccionar comercio');pick.add(new Option('Selecciona un escaparate',''));
    const filtered=entries.filter(c=>(this.query?`${c.name} ${c.label} ${c.id}`.toLowerCase().includes(this.query.toLowerCase()):!state.selectedId||c.buildingId===state.selectedId));for(const c of filtered.slice(0,200))pick.add(new Option(`${c.name} · ${c.inferred?'inferido':'OSM'} · ${c.id}`,c.id));if(selected&&![...pick.options].some(o=>o.value===selected.id))pick.add(new Option(selected.name,selected.id));pick.value=selected?.id??'';pick.onchange=()=>this.actions.select(pick.value);host.append(pick);
    if(!selected)return;
    const note=document.createElement('p');note.className='small';note.textContent=`${selected.inferred?'Interpretación procedural, sin tienda registrada':'Fuente: '+selected.sourceId} · ${selected.horario??'Horario desconocido'} · profundidad ${selected.depth.toFixed(2)} m`;host.append(note);
    const controls={};const field=(key,label,input)=>{const l=document.createElement('label');l.className='field';const caption=document.createElement('span');caption.textContent=label;l.append(caption,input);input.setAttribute('aria-label',label);controls[key]=input;host.append(l);};
    const category=document.createElement('select');SHOP_CATEGORIES.forEach(c=>category.add(new Option(c.label,c.id)));category.value=selected.category;field('category','Categoría del comercio',category);
    const layout=document.createElement('select');['Escaparate clásico','Composición lateral','Exposición central'].forEach((v,i)=>layout.add(new Option(v,String(i))));layout.value=String(selected.layout);field('layout','Composición',layout);
    const name=document.createElement('input');name.value=selected.name;name.maxLength=80;field('name','Nombre del rótulo',name);
    const seed=document.createElement('input');seed.value=selected.seed;seed.maxLength=100;field('seed','Semilla del comercio',seed);
    const statusControl=document.createElement('select');[['auto','Según horario (mediodía)'],['open','Abierto'],['closed','Cerrado'],['offers','Ofertas']].forEach(([v,t])=>statusControl.add(new Option(t,v)));statusControl.value=selected.state;field('state','Estado del comercio',statusControl);
    const save=document.createElement('button');save.className='btn';save.textContent='Aplicar comercio';save.disabled=state.busy;save.onclick=async()=>{try{await this.actions.apply(selected.id,validateCommerce({category:category.value,layout:Number(layout.value),name:name.value,seed:seed.value,state:statusControl.value}));}catch(e){note.textContent=e.message;}};
    const view=document.createElement('button');view.className='btn';view.textContent='Ver escaparate';view.onclick=()=>this.actions.focus(selected);
    const undo=document.createElement('button');undo.className='btn';undo.textContent='Deshacer comercio';undo.disabled=state.busy;undo.onclick=()=>this.actions.undo();host.append(save,view,undo);
  }
}
