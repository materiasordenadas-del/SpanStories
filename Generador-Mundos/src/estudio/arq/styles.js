// Gramática de estilos: cada estilo describe plantas, crujías, huecos, balcones, molduras,
// cornisas, cubiertas y detalles. La región y el uso del edificio eligen el estilo; la semilla varía.
import {FACADE} from '../geom/palette.js';
import {pick,weighted} from '../data/rng.js';
import {approximateCountry} from '../data/country.js';

// Región de estilos: corrección manual > país registrado en la fuente (OSM) > aproximación por coordenadas.
// Solo los lugares hispanohablantes reciben estilos regionales; el resto usa los genéricos.
export function regionOf(bounds){
  if(['espana','catalunya','andalucia','canarias','latam','europa','generic'].includes(bounds?.regionOverride))return bounds.regionOverride;
  if(bounds?.country?.region)return bounds.country.region;
  return approximateCountry(bounds?.centerLat??40,bounds?.centerLon??-3.7).region;
}

const FRAMES={white:'#f6f3ec',green:'#3e6a52',brown:'#6a4a34',dark:'#3a3a3e',cream:'#ece2c9',blue:'#3c6488',red:'#8a3b33',wood:'#8b5a36',grey:'#9aa0a6'};
const RAILS={iron:'#2d3036',black:'#25272b',green:'#2f4a3c',white:'#f2efe8',wood:'#7a4e2f'};

// Plantillas de piso: tipo de hueco por planta. w/h en metros; probabilidades 0..1.
export const STYLES={
  madrid_clasico:{
    name:'Madrileño clásico',palette:FACADE.madrid,trim:['#f1e7d3','#efe3cc','#f4ece0'],plinth:['#c9bba1','#bfae93','#d2c4aa'],
    groundH:[4.1,4.8],floorH:[3.2,3.6],bay:[2.9,3.4],margin:1.0,
    plinthKind:'rustic',bands:'every',corner:'quoins',pilasters:.25,
    cornice:{h:.55,p:.5,corbels:.7},parapet:{h:.9,kind:'solid'},roof:[['flat',.45],['mansard',.4],['hipped',.15]],
    frames:[[FRAMES.white,.55],[FRAMES.brown,.2],[FRAMES.green,.15],[FRAMES.cream,.1]],
    rails:[[RAILS.iron,.7],[RAILS.black,.3]],
    shopsOnStreet:.75,groundWindow:{w:1.15,h:2.1,sill:1.0,surround:{w:.16,depth:.12,kind:'keystone'},grille:'flat',pGrille:.45},
    portal:{w:1.9,h:3.4,transom:true,arch:.25},
    floors:{
      first:{kind:'balconera',w:1.15,h:2.65,surround:{w:.16,depth:.13,kind:'pediment'},balcony:{p:.95,depth:.62,continuous:.35,ornament:.6,corbels:true},panes:3},
      middle:{kind:'balconera',w:1.1,h:2.45,surround:{w:.15,depth:.12,kind:'cornice'},balcony:{p:.8,depth:.48,ornament:.3},blind:.25,panes:3},
      top:{kind:'window',w:1.05,h:1.55,surround:{w:.14,depth:.1,kind:'simple'},balcony:{p:.25,depth:.4},blind:.2},
    },
    extras:{ac:.1,flowers:.12,wallLamp:.06,blade:.3,awning:.55},
  },
  madrid_moderno:{
    name:'Residencial años 60-80',palette:FACADE.ladrillo.concat(FACADE.moderno),trim:['#ece7dd','#dedad2'],plinth:['#8f8a84','#a39d94','#cfc6b6'],
    groundH:[3.6,4.2],floorH:[2.85,3.05],bay:[3.0,3.8],margin:.8,
    plinthKind:'stone',bands:'slab',corner:null,pilasters:0,
    cornice:{h:.25,p:.12,corbels:0},parapet:{h:1.0,kind:'rail'},roof:[['flat',1]],
    frames:[[FRAMES.white,.5],[FRAMES.grey,.3],[FRAMES.brown,.2]],rails:[[RAILS.iron,.5],[RAILS.white,.2],[RAILS.black,.3]],
    shopsOnStreet:.8,groundWindow:{w:1.3,h:1.5,sill:1.2,surround:null,grille:'flat',pGrille:.6},
    portal:{w:1.8,h:2.8,transom:false,arch:0},
    floors:{
      first:{kind:'window',w:1.4,h:1.45,sill:.95,surround:null,blind:.45,balcony:{p:.35,depth:1.0,rail:[['solid',.5],['iron',.5]],terrace:.4}},
      middle:{kind:'window',w:1.4,h:1.45,sill:.95,surround:null,blind:.45,balcony:{p:.35,depth:1.0,rail:[['solid',.5],['iron',.5]],terrace:.4}},
      top:{kind:'window',w:1.3,h:1.4,sill:.95,surround:null,blind:.5,balcony:{p:.3,depth:1.1,rail:[['solid',.6],['glass',.4]]}},
    },
    extras:{ac:.35,flowers:.05,wallLamp:0,blade:.25,awning:.4,clothes:.1},
  },
  eixample:{
    name:'Eixample modernista',palette:FACADE.eixample,trim:['#f0e6d4','#e9dcc4'],plinth:['#c2b49b','#b8a88d'],
    groundH:[4.4,5.0],floorH:[3.3,3.7],bay:[2.8,3.2],margin:.9,
    plinthKind:'rustic',bands:'every',corner:null,pilasters:.5,
    cornice:{h:.6,p:.55,corbels:.8},parapet:{h:1.0,kind:'balustrade'},roof:[['flat',1]],
    frames:[[FRAMES.wood,.4],[FRAMES.green,.3],[FRAMES.white,.3]],rails:[[RAILS.iron,.6],[RAILS.green,.4]],
    shopsOnStreet:.85,groundWindow:{w:1.3,h:2.6,sill:.6,surround:{w:.2,depth:.14,kind:'keystone'},grille:'flat',pGrille:.3},
    portal:{w:2.2,h:3.8,transom:true,arch:.4},
    floors:{
      first:{kind:'balconera',w:1.2,h:2.8,surround:{w:.18,depth:.14,kind:'pediment'},balcony:{p:1,depth:.75,continuous:.8,ornament:.9,corbels:true},mirador:.35,panes:4},
      middle:{kind:'balconera',w:1.15,h:2.6,surround:{w:.16,depth:.13,kind:'ears'},balcony:{p:.95,depth:.55,ornament:.7,corbels:true},panes:4},
      top:{kind:'balconera',w:1.05,h:2.2,surround:{w:.15,depth:.12,kind:'simple'},balcony:{p:.7,depth:.45}},
    },
    extras:{ac:.08,flowers:.15,wallLamp:.04,blade:.25,awning:.4},
  },
  andaluz:{
    name:'Andaluz encalado',palette:FACADE.andaluz,trim:['#e8c35f','#d9a441','#e3b768','#c98d3e','#b8573c'],plinth:['#d9a441','#c98d3e','#8a5a3b','#b8573c','#5f7f9c'],
    groundH:[3.6,4.0],floorH:[3.1,3.4],bay:[2.7,3.6],margin:1.0,
    plinthKind:'painted',bands:'top',corner:'pilaster',pilasters:0,
    cornice:{h:.35,p:.25,corbels:0},parapet:{h:.7,kind:'solid'},roof:[['tile',.6],['flat',.4]],
    frames:[[FRAMES.green,.45],[FRAMES.brown,.35],[FRAMES.white,.2]],rails:[[RAILS.black,.7],[RAILS.iron,.3]],
    shopsOnStreet:.35,groundWindow:{w:1.2,h:1.9,sill:.7,surround:{w:.2,depth:.06,kind:'simple'},grille:'box',pGrille:.85},
    portal:{w:1.6,h:3.0,transom:false,arch:.35},
    floors:{
      first:{kind:'balconera',w:1.05,h:2.3,surround:{w:.18,depth:.06,kind:'simple'},balcony:{p:.7,depth:.45},flowers:.6},
      middle:{kind:'balconera',w:1.0,h:2.2,surround:{w:.18,depth:.06,kind:'simple'},balcony:{p:.6,depth:.4},flowers:.5},
      top:{kind:'window',w:.9,h:1.3,surround:{w:.16,depth:.06,kind:'simple'},grille:.4},
    },
    extras:{ac:.12,flowers:.45,wallLamp:.18,blade:.1,awning:.25},
    surroundIsTrimColor:true,
  },
  colonial:{
    name:'Colonial latinoamericano',palette:FACADE.colonial,trim:['#f4ecdc','#efe4cc','#ffffff'],plinth:['#8a5a3b','#5a6f8a','#3f6b52','#b8573c','#d9c9a8'],
    groundH:[4.2,5.0],floorH:[3.6,4.2],bay:[3.0,4.0],margin:1.2,
    plinthKind:'painted',bands:'top',corner:'pilaster',pilasters:.3,
    cornice:{h:.45,p:.3,corbels:0},parapet:{h:.8,kind:'solid'},roof:[['flat',.55],['tile',.45]],
    frames:[[FRAMES.wood,.45],[FRAMES.white,.2],[FRAMES.blue,.15],[FRAMES.green,.2]],rails:[[RAILS.black,.6],[RAILS.wood,.4]],
    shopsOnStreet:.4,groundWindow:{w:1.3,h:2.4,sill:.5,surround:{w:.2,depth:.08,kind:'cornice'},grille:'box',pGrille:.8},
    portal:{w:2.4,h:3.6,transom:false,arch:.6},
    floors:{
      first:{kind:'balconera',w:1.2,h:2.7,surround:{w:.2,depth:.08,kind:'cornice'},balcony:{p:.65,depth:.5},colonialBalcony:.45},
      middle:{kind:'balconera',w:1.15,h:2.6,surround:{w:.2,depth:.08,kind:'simple'},balcony:{p:.5,depth:.5},colonialBalcony:.25},
      top:{kind:'window',w:1.1,h:1.8,surround:{w:.18,depth:.08,kind:'simple'},balcony:{p:.3,depth:.45}},
    },
    extras:{ac:.15,flowers:.25,wallLamp:.2,blade:.15,awning:.15},
    surroundIsTrimColor:true,
  },
  latam_moderno:{
    name:'Barrio latinoamericano',palette:FACADE.colonial.concat(FACADE.ladrillo,FACADE.moderno),trim:['#f1ece2','#e2ddd3'],plinth:['#8f8a84','#a39d94','#6f7f8f'],
    groundH:[3.2,3.8],floorH:[2.7,3.0],bay:[2.6,3.4],margin:.6,
    plinthKind:'painted',bands:'slab',corner:null,pilasters:0,
    cornice:{h:.2,p:.08,corbels:0},parapet:{h:.9,kind:'solid'},roof:[['flat',1]],
    frames:[[FRAMES.grey,.4],[FRAMES.white,.3],[FRAMES.dark,.3]],rails:[[RAILS.black,.7],[RAILS.white,.3]],
    shopsOnStreet:.7,groundWindow:{w:1.4,h:1.3,sill:1.0,surround:null,grille:'flat',pGrille:.95},
    portal:{w:1.1,h:2.3,transom:false,arch:0,garage:.35},
    floors:{
      first:{kind:'window',w:1.4,h:1.25,sill:1.0,surround:null,grille:.6,balcony:{p:.25,depth:.8,rail:[['iron',.6],['solid',.4]]}},
      middle:{kind:'window',w:1.3,h:1.25,sill:1.0,surround:null,grille:.4,balcony:{p:.25,depth:.8,rail:[['iron',.6],['solid',.4]]}},
      top:{kind:'window',w:1.2,h:1.2,sill:1.0,surround:null,grille:.3},
    },
    extras:{ac:.2,flowers:.1,wallLamp:0,blade:.35,awning:.45,tank:.7,rebar:.35},
  },
  oficinas:{
    name:'Oficinas',palette:FACADE.oficinas,trim:['#e6e8ea','#d5d9dd'],plinth:['#7f868d','#5d646b','#cfd3d6'],
    groundH:[4.5,5.5],floorH:[3.5,3.9],bay:[1.8,2.4],margin:.4,
    plinthKind:'glass',bands:'slab',corner:null,pilasters:0,
    cornice:{h:.4,p:.1,corbels:0},parapet:{h:1.2,kind:'solid'},roof:[['flat',1]],
    frames:[[FRAMES.grey,.6],[FRAMES.dark,.4]],rails:[[RAILS.white,1]],
    shopsOnStreet:.4,groundWindow:{w:2.2,h:3.4,sill:.3,surround:null,grille:null,pGrille:0},
    portal:{w:3.0,h:3.4,transom:false,arch:0},
    floors:{
      first:{kind:'ribbon',w:1.75,h:2.3,sill:.8,surround:null},
      middle:{kind:'ribbon',w:1.75,h:2.3,sill:.8,surround:null},
      top:{kind:'ribbon',w:1.75,h:2.3,sill:.8,surround:null},
    },
    extras:{ac:0,flowers:0,wallLamp:0,blade:0,awning:0},
  },
  casa:{
    name:'Casa',palette:FACADE.andaluz.concat(FACADE.madrid.slice(0,6),FACADE.colonial.slice(0,5)),trim:['#f1ece2','#e8dcc4'],plinth:['#b8a88d','#9c8f7c','#c9bba1'],
    groundH:[2.9,3.2],floorH:[2.8,3.0],bay:[2.6,3.4],margin:.9,
    plinthKind:'painted',bands:'none',corner:null,pilasters:0,
    cornice:{h:.2,p:.1,corbels:0},parapet:{h:.5,kind:'solid'},roof:[['hipped',.55],['gabled',.3],['flat',.15]],
    frames:[[FRAMES.white,.4],[FRAMES.green,.3],[FRAMES.brown,.3]],rails:[[RAILS.black,1]],
    shopsOnStreet:0,groundWindow:{w:1.1,h:1.3,sill:.95,surround:{w:.12,depth:.05,kind:'simple'},grille:'flat',pGrille:.4,shutters:.4},
    portal:{w:1.0,h:2.2,transom:false,arch:.1,house:true},
    floors:{
      first:{kind:'window',w:1.05,h:1.3,sill:.95,surround:{w:.12,depth:.05,kind:'simple'},shutters:.45},
      middle:{kind:'window',w:1.0,h:1.3,sill:.95,surround:{w:.12,depth:.05,kind:'simple'},shutters:.45},
      top:{kind:'window',w:1.0,h:1.2,sill:.95,surround:{w:.12,depth:.05,kind:'simple'},shutters:.45},
    },
    extras:{ac:.1,flowers:.2,wallLamp:.3,blade:0,awning:0,chimney:.6},
  },
  publico:{
    name:'Edificio público',palette:FACADE.piedra,trim:['#f1e9d8','#ece2cd'],plinth:['#b9a989','#a8987a'],
    groundH:[5.0,6.0],floorH:[4.2,5.0],bay:[3.4,4.2],margin:1.6,
    plinthKind:'rustic',bands:'every',corner:'quoins',pilasters:1,
    cornice:{h:.9,p:.75,corbels:1},parapet:{h:1.1,kind:'balustrade'},roof:[['flat',.6],['mansard',.4]],
    frames:[[FRAMES.white,.5],[FRAMES.dark,.3],[FRAMES.green,.2]],rails:[[RAILS.black,1]],
    shopsOnStreet:0,groundWindow:{w:1.5,h:2.8,sill:.9,surround:{w:.22,depth:.16,kind:'keystone'},grille:'flat',pGrille:.5,arch:.5},
    portal:{w:3.0,h:4.6,transom:true,arch:.5,monumental:true},
    floors:{
      first:{kind:'balconera',w:1.4,h:3.2,surround:{w:.22,depth:.16,kind:'pediment'},balcony:{p:.4,depth:.6,rail:[['balustre',1]]},panes:4},
      middle:{kind:'window',w:1.35,h:2.6,sill:.8,surround:{w:.2,depth:.15,kind:'cornice'},panes:4},
      top:{kind:'window',w:1.2,h:1.6,surround:{w:.18,depth:.12,kind:'simple'}},
    },
    extras:{ac:0,flowers:0,wallLamp:.3,blade:0,awning:0,flag:.6},
  },
  industrial:{
    name:'Nave',palette:FACADE.industrial,trim:['#d9d6cf'],plinth:['#8f8a84','#a39d94'],
    groundH:[4.5,6],floorH:[4.5,6],bay:[5,7],margin:1.5,
    plinthKind:'stone',bands:'none',corner:null,pilasters:.8,
    cornice:{h:.3,p:.05,corbels:0},parapet:{h:.6,kind:'solid'},roof:[['flat',.5],['gabled',.5]],
    frames:[[FRAMES.grey,1]],rails:[[RAILS.iron,1]],shopsOnStreet:0,
    groundWindow:{w:2.4,h:1.0,sill:3.0,surround:null,grille:null,pGrille:0},
    portal:{w:4.0,h:4.0,garage:1},
    floors:{first:{kind:'window',w:2.4,h:1.0,sill:2.4,surround:null},middle:{kind:'window',w:2.4,h:1.0,sill:2.4,surround:null},top:{kind:'window',w:2.4,h:1.0,sill:2.4,surround:null}},
    extras:{ac:.05,flowers:0,wallLamp:.2,blade:0,awning:0},
  },
  escuela:{
    name:'Escuela',palette:['#efe3c8','#e9d6b0','#f0e6d2','#e2c9a4','#d9e0dc'],trim:['#f4f1ea'],plinth:['#9c9488','#b4ab9c'],
    groundH:[3.6,3.9],floorH:[3.5,3.8],bay:[3.0,3.6],margin:.8,
    plinthKind:'stone',bands:'slab',corner:null,pilasters:.5,
    cornice:{h:.35,p:.15,corbels:0},parapet:{h:1.1,kind:'solid'},roof:[['flat',.8],['hipped',.2]],
    frames:[[FRAMES.white,.6],[FRAMES.green,.2],[FRAMES.grey,.2]],rails:[[RAILS.white,1]],
    shopsOnStreet:0,groundWindow:{w:2.2,h:1.8,sill:.9,surround:null,grille:null,pGrille:0},
    portal:{w:2.4,h:2.8,transom:true,arch:0},
    floors:{first:{kind:'window',w:2.3,h:1.9,sill:.85,surround:null,transom:.72},middle:{kind:'window',w:2.3,h:1.9,sill:.85,surround:null,transom:.72},top:{kind:'window',w:2.3,h:1.9,sill:.85,surround:null,transom:.72}},
    extras:{ac:.05,flowers:0,wallLamp:.1,blade:0,awning:0,clock:1},
  },
  escuela_latam:{
    name:'Colegio latinoamericano',palette:['#f3efe4','#ece6d6','#f6f1e7','#e6eef0'],trim:['#ffffff','#f4f1ea'],plinth:['#2f5e8f','#3d7d4f','#b8573c','#c9a227','#5a6f8a'],
    groundH:[3.4,3.7],floorH:[3.3,3.5],bay:[3.6,4.2],margin:1.0,
    plinthKind:'painted',bands:'slab',corner:null,pilasters:.0,
    cornice:{h:.3,p:.12,corbels:0},parapet:{h:1.0,kind:'solid'},roof:[['flat',1]],
    frames:[[FRAMES.grey,.5],[FRAMES.white,.3],[FRAMES.dark,.2]],rails:[[RAILS.white,.6],[RAILS.black,.4]],
    shopsOnStreet:0,groundWindow:{w:2.2,h:1.3,sill:1.2,surround:null,grille:'flat',pGrille:.7},
    portal:{w:2.6,h:2.7,transom:false,arch:0},
    floors:{first:{kind:'window',w:2.2,h:1.3,sill:1.15,surround:null,grille:.4},middle:{kind:'window',w:2.2,h:1.3,sill:1.15,surround:null,grille:.3},top:{kind:'window',w:2.2,h:1.3,sill:1.15,surround:null}},
    extras:{ac:.05,flowers:0,wallLamp:.1,blade:0,awning:0,clock:.5},
    galleries:true,
  },
  escuela_jp:{
    name:'Escuela (estilo japonés)',palette:['#f1eee6','#ece8de','#efe9dc','#e9e6df'],trim:['#f7f5ef'],plinth:['#a8a39a','#b4ab9c'],
    groundH:[3.8,4.0],floorH:[3.8,4.0],bay:[2.9,3.2],margin:.6,
    plinthKind:'stone',bands:'slab',corner:null,pilasters:.0,
    cornice:{h:.3,p:.08,corbels:0},parapet:{h:1.2,kind:'rail'},roof:[['flat',1]],
    frames:[[FRAMES.grey,.7],[FRAMES.white,.3]],rails:[[RAILS.white,1]],
    shopsOnStreet:0,groundWindow:{w:2.6,h:1.9,sill:.9,surround:null,grille:null,pGrille:0},
    portal:{w:3.2,h:2.8,transom:true,arch:0},
    floors:{first:{kind:'window',w:2.7,h:2.0,sill:.85,surround:null,transom:.72},middle:{kind:'window',w:2.7,h:2.0,sill:.85,surround:null,transom:.72},top:{kind:'window',w:2.7,h:2.0,sill:.85,surround:null,transom:.72}},
    extras:{ac:.0,flowers:0,wallLamp:0,blade:0,awning:0,clock:1},
  },
  gimnasio:{
    name:'Pabellón deportivo',palette:['#e8e2d4','#d9dfe4','#e6d6bd','#c9d3da'],trim:['#f4f1ea','#dfe3e6'],plinth:['#8f8a84','#7f868d'],
    groundH:[7,9],floorH:[7,9],bay:[4.5,5.5],margin:1.2,
    plinthKind:'stone',bands:'none',corner:null,pilasters:1,
    cornice:{h:.35,p:.1,corbels:0},parapet:{h:.5,kind:'solid'},roof:[['barrel',.6],['gabled',.4]],
    frames:[[FRAMES.grey,1]],rails:[[RAILS.white,1]],shopsOnStreet:0,
    groundWindow:{w:3.6,h:1.3,sill:5.2,surround:null,grille:null,pGrille:0},
    portal:{w:3.2,h:3.0,transom:false,arch:0},
    floors:{first:{kind:'window',w:3.6,h:1.3,sill:.5},middle:{kind:'window',w:3.6,h:1.3,sill:.5},top:{kind:'window',w:3.6,h:1.3,sill:.5}},
    extras:{},
  },
  pequeno:{
    name:'Pequeño',palette:FACADE.moderno.concat(FACADE.andaluz),trim:['#ece7dd'],plinth:['#9c9488'],
    groundH:[2.6,3.0],floorH:[2.6,3.0],bay:[3,4],margin:.6,plinthKind:'none',bands:'none',corner:null,pilasters:0,
    cornice:{h:.15,p:.08,corbels:0},parapet:{h:.3,kind:'solid'},roof:[['flat',.6],['gabled',.4]],
    frames:[[FRAMES.white,1]],rails:[[RAILS.iron,1]],shopsOnStreet:0,
    groundWindow:{w:.9,h:.9,sill:1.2,surround:null,grille:null,pGrille:0},portal:{w:.9,h:2.1,house:true},
    floors:{first:{kind:'window',w:.9,h:.9,sill:1.2},middle:{kind:'window',w:.9,h:.9,sill:1.2},top:{kind:'window',w:.9,h:.9,sill:1.2}},
    extras:{},
  },
};

// Familias adicionales opcionales; no cambian la selección automática existente.
STYLES.art_deco={...structuredClone(STYLES.madrid_moderno),name:'Art déco (aproximación)',palette:FACADE.piedra.concat(FACADE.moderno),groundH:[4,4.4],floorH:[3,3.4],bands:'every',corner:'pilaster',pilasters:.7};
STYLES.moderno_liso={...structuredClone(STYLES.madrid_moderno),name:'Residencial de fachada lisa',palette:FACADE.moderno,plinthKind:'painted',bands:'none',corner:null,pilasters:0};
for(const tpl of Object.values(STYLES.art_deco.floors)){tpl.h=1.9;tpl.balcony={p:0,depth:.4};tpl.surround={w:.12,depth:.08,kind:'simple'};}
export function styleFromArchitecture(tags={}){
  const text=String(tags['building:architecture']??tags.architectural_style??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[ -]+/g,'_');
  return {art_deco:'art_deco',neoclassical:'publico',neo_classical:'publico',colonial:'colonial',modernisme:'eixample',contemporary:'moderno_liso',modern:'moderno_liso'}[text]??null;
}

// Pesos de estilo por región para edificios residenciales/genéricos según plantas.
function residentialWeights(region,levels,b){
  const old=b.tags?.start_date&&parseInt(b.tags.start_date)<1945;
  switch(region){
    case 'catalunya':return levels>=9?[['madrid_moderno',.7],['oficinas',.3]]:[['eixample',old?.9:.62],['madrid_moderno',old?.1:.38]];
    case 'andalucia':return levels<=3?[['andaluz',.8],['madrid_clasico',.2]]:levels<=6?[['madrid_clasico',.45],['andaluz',.25],['madrid_moderno',.3]]:[['madrid_moderno',.8],['oficinas',.2]];
    case 'canarias':return levels<=3?[['colonial',.6],['andaluz',.4]]:[['madrid_moderno',.7],['madrid_clasico',.3]];
    case 'latam':return levels<=2?[['colonial',old?.9:.55],['latam_moderno',old?.1:.45]]:levels<=5?[['latam_moderno',.6],['colonial',.25],['madrid_clasico',.15]]:[['latam_moderno',.6],['oficinas',.4]];
    case 'espana':return levels>=10?[['madrid_moderno',.6],['oficinas',.4]]:levels<=7?[['madrid_clasico',old?.95:.68],['madrid_moderno',old?.05:.32]]:[['madrid_moderno',.6],['madrid_clasico',.4]];
    default:return levels>=9?[['madrid_moderno',.6],['oficinas',.4]]:[['madrid_clasico',.55],['madrid_moderno',.45]];
  }
}

export function chooseStyle(b,region,r){
  if(b.forceStyle&&STYLES[b.forceStyle])return b.forceStyle;
  switch(b.use){
    case 'religious':return 'iglesia';
    case 'office':return b.levels>=4?'oficinas':'madrid_moderno';
    case 'industrial':return 'industrial';
    case 'house':return region==='andalucia'?weighted(r,[['andaluz',.6],['casa',.4]]):region==='latam'?weighted(r,[['colonial',.5],['casa',.5]]):'casa';
    case 'small':case 'canopy':return 'pequeno';
    case 'school':return 'escuela';
    case 'public':return b.area>600||b.tags?.historic?'publico':weighted(r,residentialWeights(region,b.levels,b));
    case 'commercial':return b.levels>=5&&b.area>1500?'oficinas':weighted(r,residentialWeights(region,b.levels,b));
    default:
      if(b.levels<=1&&b.area<80)return 'pequeno';
      if(b.levels<=2&&b.area<220&&region!=='latam')return region==='andalucia'?'andaluz':'casa';
      return weighted(r,residentialWeights(region,b.levels,b));
  }
}

export {FRAMES,RAILS,pick};
