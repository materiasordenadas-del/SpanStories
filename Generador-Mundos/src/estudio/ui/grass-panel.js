import {GRASS_DEFAULTS} from '../render/grass-config.js';
// Controles del césped, dentro del panel actual. No reconstruyen la ciudad.
const groups={
  'Geometría':[
    ['height','Altura (m)',.02,2,.01],['width','Anchura (m)',.01,.18,.005],['curvature','Curvatura',0,.5,.01],['density','Matas/m²',1,100,1,'rebuild'],['spacing','Separación mínima (m)',.05,1,.01,'rebuild'],['sizeVariation','Variación de tamaños',0,.9,.05],['blades','Hojas por mata',1,6,1,'rebuild'],['smallClumps','Proporción de matas pequeñas',0,1,.05]],
  'Distribución':[
    ['clumping','Agrupación',0,1,.05,'rebuild'],['clumpSize','Tamaño de grupos (m)',.5,12,.5,'rebuild'],['irregularity','Irregularidad',0,1,.05,'rebuild'],['regionalVariation','Variación por regiones',0,1,.05,'rebuild'],['orientation','Orientación dominante (°)',0,360,1],['seed','Semilla',0,2147483647,1,'rebuild'],['mask','Respetar superficies verdes','check']],
  'Apariencia':[
    ['root','Color de raíz','color'],['main','Color principal','color'],['tip','Color de punta','color'],['colorVariation','Variación cromática',0,1,.05],['gradient','Gradiente vertical',0,1,.05],['rootShade','Oscurecimiento de raíces',0,.8,.05],['lighting','Iluminación',.2,1.5,.05],['translucency','Translucidez',0,.5,.01],['groundBlend','Integración con terreno',0,1,.05]],
  'Viento':[
    ['wind','Viento animado','check'],['windDirection','Dirección (°)',0,360,1],['windStrength','Intensidad',0,.8,.01],['windSpeed','Velocidad',0,5,.1],['windFrequency','Frecuencia',.1,3,.1],['windWavelength','Longitud de onda (m)',2,60,1],['windSpatial','Variación espacial',0,1,.05],['flexibility','Flexibilidad',0,2,.05],['windQuality','Ráfagas espaciales',0,1,1]],
  'Distancias y LOD':[
    ['lod0','Detalle hasta (m)',2,50,1],['lod1','Cero geometría desde (m)',3,100,1],['transition','Transición (m)',.25,15,.25],['lod1Density','Densidad relativa LOD 1',0,.3,.005,'rebuild'],['reference','Referencia','select',{camera:'Cámara',character:'Personaje (cámara si no exploras)'}]],
  'Optimización':[
    ['chunkSize','Sector (m)',2,10,1,'rebuild'],['culling','Culling espacial','check'],['maxInstances','Presupuesto de matas',1000,100000,1000,'rebuild'],['maxTriangles','Presupuesto de triángulos',5000,1000000,5000],['chunksPerFrame','Sectores por frame',1,8,1],['adaptive','Calidad automática','check'],['targetFPS','FPS objetivo',20,120,1],['shadows','Proyectar sombras (costoso)','check'],['interaction','Interacción con personaje','check'],['debugChunks','Mostrar bordes de sectores','check'],['debugLOD','Colorear LOD','check']],
};
export class GrassPanel{
  constructor(viewer,onConfigChange=()=>{}){
    this.viewer=viewer;this.field=viewer.grass;this.element=document.createElement('section');this.element.id='grass-panel';
    const changed=this.field.onChange;this.field.onChange=()=>{changed?.();onConfigChange();};
    const c=this.field.config;
    const input=([key,label,min,max,step,apply])=>{
      const id='grass-'+key;let control;
      if(min==='check')control=`<input id="${id}" data-key="${key}" type="checkbox" ${c[key]?'checked':''}>`;
      else if(min==='select')control=`<select id="${id}" data-key="${key}">${Object.entries(max).map(([value,text])=>`<option value="${value}" ${c[key]===value?'selected':''}>${text}</option>`).join('')}</select>`;
      else control=`<input id="${id}" data-key="${key}" data-apply="${apply??''}" type="${min==='color'?'color':'number'}" ${typeof min==='number'?`min="${min}" max="${max}" step="${step}"`:''} value="${c[key]}" style="width:86px">`;
      return `<label style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin:7px 0">${label}${control}</label>`;
    };
    this.element.innerHTML=`<details id="grass-controls"><summary>Césped · James / Breath of the Wild</summary><label class="check"><input id="grass-enabled" data-key="enabled" type="checkbox" checked> Césped en todos los estilos</label>
      <div style="display:flex;gap:5px;margin:9px 0"><button class="btn" id="grass-web">Igual que la web</button><button class="btn" id="grass-city">Ciudad · 12 cm</button><button class="btn" id="grass-forest">Bosque · 80 cm</button></div>
      <label>Calidad <select id="grass-preset">${['bajo','medio','alto','ultra','personalizado'].map(n=>`<option value="${n}" ${n===c.preset?'selected':''}>${n[0].toUpperCase()+n.slice(1)}</option>`).join('')}</select></label>
      <label style="display:flex;justify-content:space-between;margin:9px 0">Extensión de detalle <select id="grass-reach"><option value="custom">Personalizada</option>${[10,20,30,40,50].map(n=>`<option value="${n}" ${c.lod0===n?'selected':''}>${n} metros</option>`).join('')}</select></label>
      <label style="display:flex;justify-content:space-between;margin:9px 0">Densidad <input id="grass-density-slider" aria-label="Densidad del césped" type="range" min="1" max="100" step="1" value="${c.density}" style="width:120px"><output id="grass-density-value">${c.density}</output></label>
      <p class="small">Misma hierba en todos los estilos. Detalle: 5 vértices / 3 triángulos por hoja. LOD 1: 1 triángulo por mata. Fuera del radio, solo material del terreno.</p>
      ${Object.entries(groups).map(([name,controls])=>`<details><summary>${name}</summary>${controls.map(input).join('')}</details>`).join('')}
      <div style="display:flex;gap:5px;margin:10px 0"><button class="btn" id="grass-save">Guardar césped</button><button class="btn" id="grass-load">Cargar césped</button><input type="file" id="grass-file" accept=".json,application/json" hidden></div>
      <p id="grass-message" class="small" role="status"></p><details><summary>Rendimiento del césped</summary><pre id="grass-stats" class="small" style="white-space:pre-wrap"></pre><button class="btn" id="grass-compare">Comparar con / sin césped</button><pre id="grass-comparison" class="small" style="white-space:pre-wrap"></pre><button class="btn" id="grass-gpu">Medir GPU (si está disponible)</button></details></details>`;
    this.element.addEventListener('input',e=>{const key=e.target.dataset.key;if(!key||e.target.dataset.apply==='rebuild')return;this.apply(e.target);});
    this.element.addEventListener('change',e=>{if(e.target.dataset.key)this.apply(e.target);});
    this.element.querySelector('#grass-preset').onchange=e=>{if(e.target.value!=='personalizado')this.field.preset(e.target.value);else this.field.setConfig({preset:'personalizado'});this.sync();};
    // Forma, reparto y viento de la demo de James Smyth; conserva colores, distancias y presupuestos elegidos.
    this.element.querySelector('#grass-web').onclick=()=>{const d=GRASS_DEFAULTS;this.field.setConfig(Object.fromEntries(['height','width','curvature','sizeVariation','blades','smallClumps','density','spacing','clumping','irregularity','regionalVariation','groundBlend','wind','windDirection','windStrength','windSpeed','windFrequency','windWavelength','windSpatial','flexibility','windQuality','lod1Density'].map(k=>[k,d[k]])));this.sync();};
    this.element.querySelector('#grass-city').onclick=()=>{this.field.setConfig({height:.12});this.sync();};
    this.element.querySelector('#grass-forest').onclick=()=>{this.field.setConfig({height:.8});this.sync();};
    this.element.querySelector('#grass-reach').onchange=e=>{if(e.target.value==='custom')return;const n=Number(e.target.value);this.field.setConfig({lod0:n,lod1:Math.min(100,n*2.5),transition:Math.max(2,n*.25),preset:'personalizado'});this.sync();};
    this.element.querySelector('#grass-density-slider').oninput=e=>{this.element.querySelector('#grass-density-value').textContent=e.target.value;};
    this.element.querySelector('#grass-density-slider').onchange=e=>{this.field.setConfig({density:Number(e.target.value),preset:'personalizado'});this.sync();};
    this.element.querySelector('#grass-save').onclick=()=>{const blob=new Blob([this.field.serialize()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cesped-spanstories.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    const file=this.element.querySelector('#grass-file');this.element.querySelector('#grass-load').onclick=()=>file.click();
    file.onchange=async()=>{try{if(!file.files[0])return;if(file.files[0].size>32768)throw Error('Configuración demasiado grande');this.field.load(await file.files[0].text());this.sync();this.message('Configuración cargada.');}catch(e){this.message(e.message);}finally{file.value='';}};
    this.element.querySelector('#grass-gpu').onclick=()=>this.measureGPU();
    this.element.querySelector('#grass-compare').onclick=async e=>{
      e.target.disabled=true;this.message('Midiendo la misma vista; espera unos segundos…');
      try{const result=await this.viewer.compareGrass();this.element.querySelector('#grass-comparison').textContent=`Sin césped: ${result.without.ms.toFixed(2)} ms · ${result.without.fps.toFixed(1)} FPS\nCon césped: ${result.with.ms.toFixed(2)} ms · ${result.with.fps.toFixed(1)} FPS\nCoste césped: ${result.costMs.toFixed(2)} ms (${result.percent.toFixed(1)} %)\nDraw calls adicionales: ${result.with.calls-result.without.calls}\nTriángulos adicionales: ${result.with.triangles-result.without.triangles}\nRender completo sincronizado CPU+GPU.\nMediana de 7 pares; escena/cámara fijas.\nFPS equivalentes de render, no FPS del juego.`;this.message('Comparación terminada; se restauró el césped.');}
      catch(error){this.message(error.message);}finally{e.target.disabled=false;}
    };
    this.timer=setInterval(()=>this.refreshStats(),700);
  }
  mount(parent){parent.append(this.element);}
  message(text){this.element.querySelector('#grass-message').textContent=text;}
  apply(input){try{if(input.type==='number'&&input.value==='')return;const key=input.dataset.key,value=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;this.field.setConfig({[key]:value,preset:'personalizado'});this.element.querySelector('#grass-preset').value='personalizado';if(key==='density'){this.element.querySelector('#grass-density-slider').value=value;this.element.querySelector('#grass-density-value').textContent=value;}this.message('');}catch(e){this.message(e.message);}}
  sync(){const c=this.field.config;for(const el of this.element.querySelectorAll('[data-key]')){if(el.type==='checkbox')el.checked=c[el.dataset.key];else el.value=c[el.dataset.key];}this.element.querySelector('#grass-preset').value=c.preset;this.element.querySelector('#grass-reach').value=[10,20,30,40,50].includes(c.lod0)?String(c.lod0):'custom';this.element.querySelector('#grass-density-slider').value=c.density;this.element.querySelector('#grass-density-value').textContent=c.density;}
  refreshStats(){
    if(!this.element.querySelector('#grass-controls').open)return;
    const g=this.field,s=g.stats,v=this.viewer.stats,mb=n=>(n/1048576).toFixed(2);
    this.element.querySelector('#grass-stats').textContent=`FPS renderizados: ${v.fps}\nFPS promedio (frame): ${g.averageMs?(1000/g.averageMs).toFixed(1):'—'}\nFrame: ${v.frameMs.toFixed(1)} ms\nCPU enviar render: ${v.cpuMs.toFixed(2)} ms\nCPU césped: ${s.cpuMs.toFixed(2)} ms\nGPU escena: ${v.gpuMs==null?'sin medir':v.gpuMs.toFixed(2)+' ms'}\nDraw calls escena: ${v.calls} (medido)\nDraw calls césped: ${g.mesh.visible?s.calls:0} (sin sombras)\nTriángulos escena: ${v.triangles} (enviados)\nTriángulos césped: ${g.mesh.visible?s.triangles:0} (enviados)\nMatas enviadas: ${g.mesh.visible?s.instances:0}\nSectores visibles: ${s.chunks}\nSectores LOD 0 / 1: ${s.lod0} / ${s.lod1}\nPendientes: ${s.queued}\nGeometría: ${mb(s.geometryBytes)} MiB estimados\nTexturas + máscara GPU: ${mb(s.textureBytes)} MiB estimados\nMáscara CPU: ${mb(g.maskPixels?.byteLength??0)} MiB\nBuffers actualizados: ${s.uploads}\nDensidad adaptativa: ${Math.round(g.adaptiveScale*100)}%\nLOD 2: 0 hojas, 0 triángulos`;
  }
  measureGPU(){
    const renderer=this.viewer.renderer,gl=renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if(!ext){this.message('Este dispositivo no ofrece cronómetro GPU WebGL2.');return;}
    const query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);this.viewer.renderFrame();gl.endQuery(ext.TIME_ELAPSED_EXT);let polls=0;
    const poll=()=>{if(gl.getParameter(ext.GPU_DISJOINT_EXT)){gl.deleteQuery(query);this.message('Medición GPU descartada por cambio del reloj.');return;}
      if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){this.viewer.stats.gpuMs=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(query);this.refreshStats();}
      else if(polls++<100)setTimeout(poll,30);else{gl.deleteQuery(query);this.message('GPU no respondió al cronómetro.');}};
    setTimeout(poll,30);
  }
  dispose(){clearInterval(this.timer);this.element.remove();}
}
