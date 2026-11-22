// Medidas de interacción. Las posiciones arquitectónicas proceden del manifiesto.
 export function createRoutes(overrides = {}) {
   const DIMENSIONS={ceiling:3.2,slab:.2,doorHeight:2.4,playerHeight:1.72,playerRadius:.32,groundY:0,...overrides};
   return {DIMENSIONS,FLOORS:{h:DIMENSIONS.ceiling+DIMENSIONS.slab},FLOOR:{width:20,depth:20},CHAIR:{width:.5,depth:.5,height:.9,seatHeight:.45},LOBBY:{chairCount:2,firstChairX:0,chairZ:0,chairGap:.7,chairSink:0}};
 }
 export const ROUTES=createRoutes();
 export const {DIMENSIONS,FLOORS,FLOOR,CHAIR,LOBBY}=ROUTES;
 export const CITY=Object.freeze({renderWidth:1920,renderHeight:1080,adaptiveWidth:2560,adaptiveHeight:1440,maxDpr:1.25,editorFov:42,near:.1,far:2400,playerHeight:DIMENSIONS.playerHeight,playerRadius:DIMENSIONS.playerRadius,editStep:.25,largeEditStep:1,overviewX:.85,overviewY:.65,overviewZ:1.1,concurrency:2,spawnSearch:80,streamRadius:60,unloadDelay:10000,initialTransferBudget:4*1024*1024,inspectionOffset:[70,65,95],inspectionHeight:12,collisionMinHeight:.65});
 export const COLINA=Object.freeze({
   radius:110, segments:88, crest:[-5,-27], spread:[25,18], rise:4.5, base:-2.5,
   grassBounds:[-20,20,-19,18], foregroundBounds:[-9,9,-4,11],
   tufts:9300, tuftRadius:.19, grassTileSize:1.25,
   bladeHeight:[.075,.28], bladeWidth:[.008,.032], bladeLean:.13,
   sunDirection:[-.24,.112,-1], mistDistance:150
 });
 export const COLINA_ALBA=Object.freeze({
   ...COLINA,
   predawn:true, crest:[-27,-33], spread:[28,24], rise:5.4, base:-2.6,
   grassBounds:[-42,39,-43,18], midfieldBounds:[-17,17,-23,13], foregroundBounds:[-8,8,-7,12],
   tufts:15000, tuftRadius:.22, grassEdgeFalloff:1.65, grassTileSize:1.1,
   bladeHeight:[.13,.43], bladeWidth:[.012,.044], bladeLean:.23,
   sunDirection:[.18,.025,-1], mistDistance:93
 });
 // Colina de Don Quijote (madrugada antes del alba). Todo procedural: ver engine/ColinaQuijote.js.
 export const COLINA_QUIJOTE=Object.freeze({
   predawn:true, radius:260, segments:208, valleyDepth:7, rightFall:5,
   crest:{z:-30, skew:.11, height:3.4, leftLift:4.4, pivot:6, span:34, flat:5.5, front:26, back:17},
   // Segunda pasada contra el fotograma 9 de la referencia: alfombra continua sin suelo a la vista.
   // Más matas y hojas más anchas dentro del presupuesto de triángulos (tests/colina-quijote.test.js, < 2,5 M).
   grass:{bounds:[-96,96,-84,40], tile:12, density:10, leaves:9, segments:3, size:[.7,1.3], width:1.55},
   lod:{full:10, thin:64, farKeep:.24, fadeStart:90, end:118, geometry:12},
   flowers:{bounds:[-45,45,-55,30], clusters:220, clear:[0,14,3]},
   dawnDirection:[.45,-.03,-1], moonDirection:[.26,.40,-1], moonRadius:.036, fogDensity:1/95,
   // Bruma baja lila que se posa sobre la cresta y vela la ladera lejana (no la hierba de los pies).
   // top: altura (m) bajo la que la bruma es plena; falloff: caída por metro por encima; start/full: distancia
   // a la que empieza y llega a su máximo; wisp: cuánto la rompen las manchas que arrastra el viento.
   mist:{amount:.6, top:5.2, falloff:.32, start:18, full:70, wisp:.5, color:[.60,.59,.80]},
   // Luz por defecto (el Estudio la cambia con transiciones de «Luz»): luna llena y apenas un brillo de alba.
   light:{sol:.25, luna:1}
 });
 export const DECOR=Object.freeze({
   baseUrl:'./assets/barcelona-decor/',treeCrownScale:.72,billboardPixels:256,
   treePalette:{anime:'#22c431',ez:'#3d9f37',gold:'#ffbc32'},
   trafficHeight:3.6,headHeight:1.05,headWidth:.44,headDepth:.26,poleRadius:.065,
   lensRadius:.105,lensStep:.29,headTopInset:.18,headFront:.15,
   signHeight:2.9,signWidth:.65,signPoleRadius:.035,signPlateDepth:.035,signFront:.025,
   lodPixels:{tree:[115,38],traffic:[65,18],sign:[55,16]},lodHysteresis:.14,updateMs:200
 });
 export const TREE_VARIETY=Object.freeze({
   baseHeight:7.6,heightStep:.01,heightSteps:13,crownStep:.002,crownSteps:11,neighbors:2,crownRatio:.62,
   models:['anime','gold','ez-spreading','ez-oval','ez-asymmetric','ez-vase'],
   profiles:[
     {id:'ez-spreading',label:'Copa extendida',seed:1204,trunk:4.4,branch:2.25,tip:.85,angle:65,tipAngle:45,children:7,twigs:4,start:.45,leafCount:8,leafSize:.72,gnarl:.035,lean:[0,1,0]},
     {id:'ez-oval',label:'Copa ovalada',seed:9049,trunk:5.1,branch:1.7,tip:.95,angle:40,tipAngle:60,children:7,twigs:4,start:.45,leafCount:8,leafSize:.65,gnarl:.03,lean:[0,1,0]},
     {id:'ez-asymmetric',label:'Ramas asimétricas',seed:7061,trunk:5,branch:2.4,tip:.85,angle:57,tipAngle:65,children:6,twigs:5,start:.48,leafCount:8,leafSize:.68,gnarl:.055,lean:[.22,1,-.12]},
     {id:'ez-vase',label:'Copa abierta',seed:18013,trunk:4.6,branch:2.4,tip:1.05,angle:46,tipAngle:35,children:8,twigs:3,start:.42,leafCount:9,leafSize:.72,gnarl:.025,lean:[0,1,0]}
   ]
 });
export const URBAN_TREES=Object.freeze({
  models:[{id:'anime',file:'anime_nature_tree_01.glb',weight:.38,crownRatio:.62},{id:'jabami',file:'jabami_anime_tree_v1.glb',weight:.31},{id:'sakura',file:'sakura_tree_01.glb',weight:.28},{id:'gold',file:'anime_tree_2.glb',weight:.03,atlas:true}],
  heights:[6.46,7.6,8.74],crowns:[.96,1,1.08],neighbors:2,
  // The four complete palettes approved in the original-model comparator.
  palettes:[['#668935','#839d40','#9aab4c','#597b31'],['#75833c','#919b4e','#657733','#a0a35a'],['#83a345','#a0b65a','#75923c','#b1bd67'],['#4e7939','#689047','#426c30','#7e9b4b']],
  referenceHeight:7.6,shadowTint:[.48,.59,.50],brown:'#c9a77e',grey:'#d1d5d0',brownGain:1.04,greyGain:1.14,
  atlasCell:512,atlasPadding:8,atlasColumns:4,softness:.28,sunGain:1.22,
  shadow:{resolution:2048,radius:32,distance:110,near:.1,far:230,move:3,margin:14,eyeHeight:1.66,softness:1.5,biasWorld:.008,slopeBiasWorld:.025,groundTint:[.66,.66,.64],foliageTint:[.30,.42,.27],barkTint:[.34,.36,.30]}
});

// Interacción léxica del visor. El anfitrión (aplicación SpanStories) es la autoridad de la validación y del progreso.
export const LEXICO=Object.freeze({
  canal:'spanstories.world-lexicon',version:1,
  // Un toque es un gesto corto y casi inmóvil; arrastrar o pellizcar no abre una palabra.
  tapMaxMs:700,tapMovePx:10,
  // Selección: halo anaranjado alrededor del objeto y un velo anaranjado claro sobre él.
  highlightColor:'#ff8a1f',highlightPixels:3,highlightTint:'#ffc98a',highlightTintOpacity:.5,
  autoCloseMs:3600,replyTimeoutMs:8000,maxTyped:60,speechRate:.85,speechLang:'es-ES',
  // Orígenes de la aplicación anfitriona que pueden recibir intentos. Producción: añadir aquí el dominio de SpanStories.
  hostOrigins:Object.freeze(['http://localhost:3000','http://127.0.0.1:3000','http://localhost:3100','http://127.0.0.1:3100'])
});
// Framing ratios are relative to the actor's measured bounds, not hand-tuned city coordinates.
// pathHandle: radio de referencia de un punto de camino; pathLift: altura de las marcas sobre el suelo; pathStep: paso de
// la curva dibujada (el mismo que routeSamples en features/story-studio/path.ts); pathWidth: ancho de la franja del camino;
// pathScreen: radio mínimo aparente de un punto (fracción de su distancia a la cámara); pathDisc / pathGoal: radio de los
// discos de los puntos intermedios y del de llegada; pathActor: radio del disco bajo un personaje (fracción de su
// altura); pathArrow: separación de las flechas de sentido sobre la franja.
export const STORY_STUDIO=Object.freeze({frameMargin:1.2,shotHeight:{general:1,medio:.65,primero:.32},pathHandle:.13,pathLift:.03,pathStep:.15,pathWidth:.14,pathScreen:.011,pathDisc:.2,pathGoal:.34,pathActor:.26,pathArrow:1.5,pathMax:50,pathPoints:66});
