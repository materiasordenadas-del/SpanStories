import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
const version=JSON.parse(await fs.readFile(new URL('../plugin.json',import.meta.url),'utf8')).version;

const obj = {type:'string',description:'Nombre exacto de la malla; omitir usa el personaje elegido en el add-on'};
const ids = {type:'array',items:{type:'string'}};
const rgba = {type:'array',items:{type:'number',minimum:0,maximum:1},minItems:4,maxItems:4,description:'RGBA lineal; usar los colores devueltos por la paleta'};
const advancedTools = [
  ['status','Consulta archivo, personaje, grupos, selección y capas sin cambiar nada',{object_name:obj}],
  ['inspect','Analiza islas UV existentes. Resumen compacto; include_faces opcional',{object_name:obj,include_faces:{type:'boolean'}}],
  ['region_info','Consulta caras y límites 3D de islas concretas sin modificar nada',{object_name:obj,ids},['ids']],
  ['prepare','Crea materiales de trabajo y copias protegidas de Base Color; conserva originales',{object_name:obj,resolution:{type:'integer',enum:[1024,2048,4096]}}],
  ['open_editor','Abre la interfaz propia de tres paneles dentro de Blender',{object_name:obj}],
  ['import_model','Importa GLB/glTF como objetos nuevos sin sustituir los existentes',{filepath:{type:'string'}},['filepath']],
  ['select_regions','Selecciona identificadores de islas para resaltado UV y 3D',{object_name:obj,ids,extend:{type:'boolean'}},['ids']],
  ['select_face','Selecciona la isla de una cara del personaje (as_face=true: solo esa cara)',{object_name:obj,face:{type:'integer',minimum:0},extend:{type:'boolean'},as_face:{type:'boolean'}},['face']],
  ['selection_status','Consulta la selección compartida por UV y modelo: objeto, material, número de islas y caras',{object_name:obj}],
  ['save_group','Guarda las islas seleccionadas bajo un nombre',{object_name:obj,name:{type:'string'}},['name']],
  ['select_group','Selecciona un grupo guardado',{object_name:obj,name:{type:'string'}},['name']],
  ['overlap_report','Inspecciona UV compartidas antes de pintar',{object_name:obj,ids}],
  ['import_reference','Carga y empaqueta PNG/JPG de referencia sin proyectarlo al modelo',{filepath:{type:'string'}},['filepath']],
  ['extract_palette','Extrae colores lineales de la referencia; no asigna anatomía automáticamente',{count:{type:'integer',minimum:1,maximum:24}}],
  ['sample_reference','Cuentagotas de referencia en coordenadas normalizadas, origen inferior izquierdo',{u:{type:'number',minimum:0,maximum:1},v:{type:'number',minimum:0,maximum:1}},['u','v']],
  ['fill','Rellena o borra islas seleccionadas en la capa activa; UV superpuestas requieren confirmación',{object_name:obj,color:rgba,erase:{type:'boolean'},allow_overlap:{type:'boolean'}},['color']],
  ['brush_stroke','Trazo 2D con máscara UV: puntos normalizados, radio en píxeles y color lineal',{object_name:obj,color:rgba,points:{type:'array',items:{type:'array',items:{type:'number'},minItems:2,maxItems:2}},radius:{type:'number',minimum:1,maximum:500},strength:{type:'number',minimum:0,maximum:1},erase:{type:'boolean'},allow_overlap:{type:'boolean'}},['points','color']],
  ['add_layer','Añade una capa de pintura transparente',{object_name:obj,name:{type:'string'}}],
  ['set_layer','Activa una capa y modifica nombre, visibilidad u opacidad',{object_name:obj,index:{type:'integer',minimum:0},visible:{type:'boolean'},opacity:{type:'number',minimum:0,maximum:1},name:{type:'string'}},['index']],
  ['history_step','Deshace o rehace un relleno sin afectar malla ni rig',{object_name:obj,redo:{type:'boolean'}}],
  ['export_png','Exporta Base Color sRGB PNG y manifiesto para Three.js; no sobrescribe por defecto',{object_name:obj,directory:{type:'string'},resolution:{type:'integer',enum:[1024,2048,4096]},overwrite:{type:'boolean'}},['directory']],
  ['export_glb','Combina capas en PNG dentro de GLB glTF 2.0 para GLTFLoader; conserva rig/morphs exportables',{object_name:obj,filepath:{type:'string'},object_names:{type:'array',items:{type:'string'}},overwrite:{type:'boolean'}},['filepath']],
  ['pack_project','Empaqueta imágenes en memoria. No guarda ni sobrescribe .blend',{object_name:obj}],
  ['save_project','Guarda .blend solo ante una instrucción explícita del usuario; sobrescribir requiere overwrite=true',{object_name:obj,filepath:{type:'string'},overwrite:{type:'boolean'}},['filepath']],
  ['restore_originals','Restituye materiales originales conservando capas',{object_name:obj}],
  ['resume','Vuelve a los materiales pintados y sus capas',{object_name:obj}],
].map(([name,description,properties,required=[]])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}}));

const help = {
  version,
  editor_preview:'Abrir el editor activa boca abierta temporal mediante jawOpen/mouthOpen existente. Salir/cambiar personaje restaura la pose. Guardar y exportar no incluyen la pose de pintura. Sin un control compatible no se modifica el personaje.',
  web_export:'GLB autocontenido por defecto, resolución automática verificada y WebP/PNG. No exige 4K ni modifica imágenes de trabajo. ready_file identifica el GLB listo para el visor.',
  self_improvement:{required:true,rule:'Cada error técnico resuelto debe corregirse en la fuente del plugin y del add-on cuando corresponda, con prueba de regresión, instrucciones actualizadas y versión instalada verificada. Reparar solo el personaje no cierra el fallo.',reference:'skills/texture-painter/references/AUTO_MEJORA.md'},
  steps:[
    '1. start_painting: copia los nombres de regions y colors devueltos.',
    '2. paint_named_region: indica region y un color_name, palette_index o hex_color explícito.',
    '3. Repite paint_named_region para las demás regiones solicitadas.',
    '4. export_painting a una carpeta nueva solo si se pidió exportar.'
  ],
  stop_if:['ok=false: sigue el mensaje y detente; no adivines regiones/colores.','needs_region_mapping: el usuario o agente principal debe nombrar las regiones una vez.','needs_overlap_approval: requiere autorización antes de allow_overlap=true.'],
  example:{tool:'paint_named_region',arguments:{region:'CHAQUETA',color_name:'ROJO'}},
  skin:'texturize_skin aplica piel a un personaje sin regiones previas. Los labios existentes se conservan. Revisar labios y zonas con un render; export_painting hornea la piel en el GLB.',
  preservation:'Nunca modifica malla, UV ni rig. Conserva textura original, proporciones y muestreo; selección compartida UV/modelo. No guarda el .blend. PNG/GLB para Three.js.',
};
const simpleTools = [
  ['painter_help','Lee primero si no conoces este complemento. Cuatro pasos para pintar sin conocimientos de Blender',{}],
  ['start_painting','Empieza aquí. Devuelve nombres de regiones y colores; no pinta ni guarda nada',{object_name:obj,reference_path:{type:'string',description:'Opcional: imagen nueva proporcionada por el usuario'}}],
  ['paint_named_region','Pinta automáticamente un grupo por nombre. Copia nombres de start_painting; elige exactamente una opción de color',{object_name:obj,region:{type:'string'},color_name:{type:'string'},palette_index:{type:'integer',minimum:0},hex_color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},layer_name:{type:'string'},allow_overlap:{type:'boolean',description:'Solo true con autorización por UV compartidas'}},['region']],
  ['texturize_skin','Piel procedural sin tocar la textura original. La primera llamada detecta toda la piel y protege los labios; las siguientes ajustan. Por defecto estilo Pixar',{object_name:obj,style:{type:'string',enum:['PIXAR','NATURAL','HIPER']},tone:{type:'string',enum:['Muy claro','Claro','Medio','Canela','Moreno','Oscuro']},hex_color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},subtone:{type:'number',minimum:-1,maximum:1},blush:{type:'number',minimum:0,maximum:1},keep_texture:{type:'number',minimum:0,maximum:1,description:'Sombras conservadas de la textura'},zones:{type:'array',items:{type:'string',enum:['cara','torso','brazos','piernas']}},clean:{type:'boolean',description:'Limpiar manchas finas y restos claros; activo por defecto'},lip_mode:{type:'string',enum:['TEXTURA','COLOR'],description:'TEXTURA conserva los labios existentes'},lip_hex:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},lip_strength:{type:'number',minimum:0,maximum:1},lip_edge:{type:'number',minimum:-1,maximum:1},features:{type:'object',description:'poros, celulas, pecas, lunares, venas, manchas, rojeces, granitos, brillo, aspereza... por nombre'}}],
  ['skin_status','Consulta si el personaje tiene piel, zonas detectadas, estilo y origen de los labios',{object_name:obj}],
  ['remove_skin','Quita la capa de piel y vuelve al material original',{object_name:obj}],
  ['export_painting','Exporta GLB optimizado listo para el visor y PNG editables a una carpeta nueva. No guarda .blend',{object_name:obj,directory:{type:'string'},include_glb:{type:'boolean',default:true,description:'GLB autocontenido por defecto; false solo para solicitar PNG editables'}},['directory']],
].map(([name,description,properties,required=[]])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}}));
const allTools=[...simpleTools,...advancedTools];
const tools=process.env.SSTP_ADVANCED_TOOLS==='1'?allTools:simpleTools;
const actions={start_painting:'agent_start',paint_named_region:'agent_paint',export_painting:'agent_export',texturize_skin:'agent_skin',skin_status:'agent_skin_status',remove_skin:'agent_skin_remove'};

async function callBridge(action,args){
  const discovery=process.env.SSTP_BRIDGE_FILE||path.join(process.env.LOCALAPPDATA||os.homedir(),'SpanStoriesTexturePainter','bridge.json');
  let cfg;
  try { cfg=JSON.parse(await fs.readFile(discovery,'utf8')); }
  catch { throw new Error('Abre Blender con SpanStories Texture Painter y pulsa Conectar Codex.'); }
  if(!Number.isInteger(cfg.port)||cfg.port<1||cfg.port>65535||typeof cfg.token!=='string')throw new Error('Descubrimiento de Blender inválido');
  const res=await fetch(`http://127.0.0.1:${cfg.port}/api`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${cfg.token}`},body:JSON.stringify({action,arguments:args}),signal:AbortSignal.timeout(185000)});
  if(!res.ok)throw new Error(`Puente Blender HTTP ${res.status}`);
  const data=await res.json(); if(!data.ok)throw new Error(data.error); return data.result;
}

async function handle(msg){
  if(msg.id===undefined)return;
  let result;
  try {
    if(msg.method==='initialize')result={protocolVersion:msg.params?.protocolVersion||'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'spanstories-texture-painter',version}};
    else if(msg.method==='ping')result={};
    else if(msg.method==='tools/list')result={tools};
    else if(msg.method==='tools/call'){
      const name=msg.params?.name; if(!allTools.some(t=>t.name===name))throw new Error('Herramienta desconocida');
      try { const value=name==='painter_help'?help:await callBridge(actions[name]||name,msg.params.arguments||{}); result={content:[{type:'text',text:JSON.stringify(value)}]}; }
      catch(e){result={isError:true,content:[{type:'text',text:e.message}]};}
    }else{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32601,message:'Method not found'}})+'\n');return;}
    process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result})+'\n');
  }catch(e){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32602,message:e.message}})+'\n');}
}
const lines=readline.createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of lines){
  if(!line.trim())continue;
  try { await handle(JSON.parse(line)); }
  catch { process.stderr.write('SSTP: mensaje JSON no válido\n'); }
}
