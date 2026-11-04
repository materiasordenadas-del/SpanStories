// Ensamblador puro (sin three ni DOM) del kit modular de escaparates hecho en Blender.
// Entrada: manifiesto kit.json + medidas del vano. Salida: lista de colocaciones {modulo,posicion,escala,...} en el sistema
// local del vano (X a lo largo, Y arriba, +Z a la calle; origen centro inferior sobre el muro). La malla viene del GLB.
// Reglas: los barridos solo se escalan a lo largo de su eje; nunca escala negativa; el cierre queda a z=-remetido.
import {rng,hashString} from '../data/rng.js';
import {ensamblarInterior} from './commerce-blender-interior-assembly.js';

const r3=v=>Math.round(v*1000)/1000;
export function crearCatalogo(manifiesto){
  const modulos=new Map(manifiesto.modulos.map(m=>[m.id,m]));
  return {...manifiesto,modulos,modulo(id){const m=modulos.get(id);if(!m)throw Error('Módulo de kit desconocido: '+id);return m;}};
}
const ancho=m=>m.caja.max[0]-m.caja.min[0],alto=m=>m.caja.max[1];

// Elige el kit afín a categoría y perfil cultural; estable por semilla.
export function elegirKit(catalogo,{category='generico',profile=[],region='espana',seed='0'}={}){
  const perfiles=new Set([...(Array.isArray(profile)?profile:[profile]),region]);
  const afines=catalogo.kits.filter(k=>k.afines.includes(category)),pool=afines.length?afines:catalogo.kits;
  const culturales=pool.filter(k=>k.perfiles.some(p=>perfiles.has(p))),lista=culturales.length?culturales:pool;
  return lista[hashString(String(seed)+':kit')%lista.length];
}

// o: {w,h,depth,category,region,profile,seed,estado:'abierto'|'cerrado'|'ofertas',kit?,toldo?,bandera?,lado?}
export function ensamblar(catalogo,o){
  const M=catalogo.medidas,R=M.remetido,zg=-R,seed=String(o.seed??'0'),r=rng(hashString(seed+':ensamble'));
  const kit=typeof o.kit==='string'?catalogo.kits.find(k=>k.id===o.kit):o.kit??elegirKit(catalogo,{category:o.category,profile:o.profile,region:o.region,seed});
  if(!kit)throw Error('Kit desconocido');
  const out=[],omitidos=[],w=o.w,h=o.h,cerrado=o.estado==='cerrado';
  const put=(id,x,y,z,sx=1,sy=1,sz=1,extra={})=>{const m=catalogo.modulo(id);out.push({modulo:id,familia:m.familia,posicion:[r3(x),r3(y),r3(z)],escala:[r3(sx),r3(sy),r3(sz)],...extra});return m;};
  if(w<1.3||h<2.2)return {kit:kit.id,colocaciones:[],omitidos:['vano demasiado pequeño'],interior:null,w,h};

  // --- marco: perfil, anchura y lado (dentro del vano o recercado fuera, sobre el muro)
  const estilo=kit.marco,ap=M.ancho_perfil[estilo],fuera=estilo==='piedra',zm=fuera?0:zg;
  const jx=fuera?w/2+ap/2:w/2-ap/2,limpio=fuera?w:w-2*ap,alturaUtil=fuera?h:h-ap;   // hueco libre para vidrio, puerta y caja
  put(`marco.${estilo}.jamba`,-jx,0,zm,1,alturaUtil,1,{tinte:fuera?2:1});put(`marco.${estilo}.jamba`,jx,0,zm,1,alturaUtil,1,{tinte:fuera?2:1});
  put(`marco.${estilo}.dintel`,0,fuera?h+ap/2:h-ap/2,zm,fuera?w+2*ap:w,1,1,{tinte:fuera?2:1});
  if(fuera)put('marco.piedra.clave',0,h,0,1,1,1,{tinte:2});
  // --- hueco remetido (jambas, dintel y suelo del cierre hundido)
  put('hueco.jamba_izq',-w/2,0,0,1,h,1,{tinte:2});put('hueco.jamba_der',w/2,0,0,1,h,1,{tinte:2});
  put('hueco.dintel',0,h,0,w,1,1,{tinte:2});put('hueco.alfeizar',0,0,0,w,1,1,{tinte:2});

  // --- puerta: lado y tamaño reales del módulo; nunca cruza el zócalo
  const puerta=catalogo.modulo(kit.puerta),dw=ancho(puerta),dh=Math.min(alto(puerta),alturaUtil-.05),lado=o.lado??(r()<.5?'der':'izq'),sg=lado==='der'?1:-1;
  const dx=sg*(limpio/2-dw/2-.2),dEsc=dh/alto(puerta);
  put(kit.puerta,dx,0,zg,1,dEsc,1,{lado});
  put('umbral.escalon',dx,0,zg,dw+.3,1,1,{tinte:2});
  // --- zócalo (o vidrio hasta el suelo) y cristales a cada lado de la puerta
  const zoc=kit.zocalo?M.zocalo:.05,tramos=[[-limpio/2,dx-dw/2-.035],[dx+dw/2+.035,limpio/2]],vidrioH=alturaUtil-zoc,yTop=alturaUtil;
  for(const [a,b] of tramos){if(b-a<=.15)continue;
    if(kit.zocalo)put(kit.zocalo,(a+b)/2,0,zg,b-a,1,1,{tinte:kit.zocalo==='zocalo.piedra'?2:1});
    else put(`marco.${estilo}.travesano`,(a+b)/2,.03,zg,b-a,1,1,{tinte:1});}
  const fijos=tramos.filter(([a,b])=>b-a>.3);
  for(const [a,b] of fijos){put('vidrio.pano',(a+b)/2,zoc,zg+.0,b-a,vidrioH,1);}
  for(const x of [dx-dw/2-.035,dx+dw/2+.035])if(fijos.some(([a,b])=>x>a-.1&&x<b+.1))put(`marco.${estilo}.montante`,x,zoc,zg,1,vidrioH,1,{tinte:1});
  // montantes y travesaño de despiece en el ventanal metálico
  if(estilo==='forja')for(const [a,b] of fijos){const n=Math.max(1,Math.round((b-a)/.9));for(let i=1;i<n;i++)put('marco.forja.montante',a+(b-a)*i/n,zoc,zg,1,vidrioH,1,{tinte:1});put('marco.forja.travesano',(a+b)/2,zoc+vidrioH*.62,zg,b-a,1,1,{tinte:1});}
  // montante superior sobre la puerta (si sobra altura)
  const sobrante=yTop-dh;
  if(sobrante>.25){put('vidrio.pano',dx,dh,zg,dw,sobrante,1);put(`marco.${estilo}.travesano`,dx,dh,zg,dw,1,1,{tinte:1});}

  // --- caja somera (cinco caras) + cenefa + tres capas pintadas; profundidad acotada por la huella
  const D=Math.max(.2,Math.min(M.profundidad_max,o.depth??M.caja_fondo)),cajaId=kit.caja[hashString(seed+':caja')%kit.caja.length];
  const volumen=o.interior!=='plano'&&catalogo.modulos.has('suelo.damero_crema'),ordenSlots=['near','counter','far'],capas=kit.capas;
  let interior=null;
  if(volumen){
    // interior con volumen (utilería modelada en Blender); la caja, las capas y la cenefa pintadas solo se usan en modo 'plano'
    interior=ensamblarInterior(catalogo,{category:o.category,limpio,alto:yTop,depth:D,seed,zVidrio:zg,estado:o.estado,puerta:{x0:dx-dw/2-.15,x1:dx+dw/2+.15}});
    out.push(...interior.colocaciones);omitidos.push(...interior.omitidos);
  }else{
    put(cajaId,0,0,zg,limpio,yTop,D);
    if(kit.cenefa)put('caja.cenefa',0,yTop-.41,zg,limpio,1,1,{tinte:1});
    M.capas_fraccion.forEach((f,i)=>{const id=capas[(i+hashString(seed+':capas'))%capas.length],pie=id==='capa.con_pie'&&i===2?'capa.plana':id;
      put(pie,0,0,zg-D*f,limpio-.02,yTop-.02,1,{slot:'capa.'+ordenSlots[i]});});
    if(kit.nichos&&D>=1.0)for(const s of [-1,1])put('nicho.estantes',s*(limpio/2-.65),.5,zg-D+.22,1,Math.min(1.9,yTop-.6),1,{slot:'tile.fondo'});
  }

  // --- rótulo, cornisa, toldo, bandera
  const sw=fuera?w+2*ap:w+.2,ry=h+(fuera?ap+.02:.12),rotulo=catalogo.modulo(kit.rotulo),rh=rotulo.caja.max[1];
  put(kit.rotulo,0,ry,0,sw,1,1,{tinte:1,celda:'rotulo'});
  if(kit.cornisa)put(kit.cornisa,0,ry+rh,0,sw+.1,1,1,{tinte:2});
  const toldoId=o.toldo===false?null:o.toldo===true?(kit.toldos.find(Boolean)??null):kit.toldos[hashString(seed+':toldo')%kit.toldos.length];
  if(toldoId){const m=catalogo.modulo(toldoId),yAt=h+.06;
    if(yAt+m.caja.min[1]>=1.95)put(toldoId,0,yAt,0,sw,1,1,{tinte:1});else omitidos.push('toldo omitido: dejaría la puerta por debajo de 1,95 m');}
  if(kit.bandera&&(o.bandera??r()<.7)){const bx=-sg*(w/2+(fuera?ap:0)+.18);put(kit.bandera,bx,h-.15,0,1,1,1,{celda:'bandera'});}

  // --- estado: persiana con guías y cajón, o carteles de vidrio
  if(cerrado){
    put('persiana.cajon',0,yTop-.30,zg+.01,limpio,1,1);
    put('persiana.panel',0,0,zg+.08,limpio,yTop-.30,1,{celda:'persiana'});
    for(const s of [-1,1])put('persiana.guia',s*(limpio/2-.04),0,zg+.01,1,yTop-.30,1);
  }else{
    const izq=fijos[0]?fijos.find(([a,b])=>b-a>.6):null;
    put('vinilo.estado',dx+(dw>1.5?0:0),1.45,zg+.01,1,1,1,{celda:'estado'});
    if(izq)put(o.estado==='ofertas'?'vinilo.cartel':'vinilo.banda',(izq[0]+izq[1])/2,o.estado==='ofertas'?.6:1.1,zg+.01,o.estado==='ofertas'?1:izq[1]-izq[0],1,1,{celda:'lema'});
  }
  const triangulos=out.reduce((n,c)=>n+catalogo.modulo(c.modulo).triangulos,0);
  return {kit:kit.id,colocaciones:out,omitidos,interior:{zVidrio:zg,profundidad:D,caja:volumen?null:cajaId,limpio,alto:yTop,modo:volumen?'volumen':'plano',receta:interior?.receta??null,piel:interior?.piel??null},triangulos,w,h,estado:o.estado??'abierto'};
}

// Resumen estadístico de variedad: cuántas combinaciones de módulos distintas salen de una muestra de vanos.
export function variedadKit(catalogo,vanos){
  const firmas=new Set(),usados=new Set();let tri=0;
  for(const v of vanos){const e=ensamblar(catalogo,v);firmas.add(e.colocaciones.map(c=>c.modulo).join('|'));for(const c of e.colocaciones)usados.add(c.modulo);tri+=e.triangulos??0;}
  return {vanos:vanos.length,combinaciones:firmas.size,modulosUsados:usados.size,trianguloMedio:Math.round(tri/Math.max(1,vanos.length))};
}
