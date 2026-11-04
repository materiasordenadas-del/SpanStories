// Medidas exclusivas del buffet. Las demás áreas conservan engine/dimensions.js.
// Relaciones calculadas: al cambiar el recinto, se recolocan sus zonas y accesos.
export function planBuffet({ width=27, depth=24, ceiling=5.5 }={}) {
  const wall=.2, aisle=1.5, cap=.14, chairRadius=1.52, tableStep=4.8;
  const room={width,depth,ceiling,wall,west:-width/2,east:width/2,rear:-depth/2,front:depth/2};
  room.eastInner=room.east-wall/2;room.westInner=room.west+wall/2;room.frontInner=room.front-wall/2;
  const gallery={width:4.5,height:5.1,depth:.25,inset:.45,gap:.02};
  gallery.z=room.rear+gallery.inset;gallery.x=Array.from({length:5},(_,i)=>(i-2)*width/5);
  const serviceRear=gallery.z+gallery.depth/2+gallery.gap;
  const canopy={base:3.3,height:.75,margin:.3};
  const island={length:5.6,depth:2.2,radius:.6,niches:2};
  island.x=room.eastInner-aisle-(island.length+cap)/2;
  const carvery={x:island.x,length:4.6,depth:1,radius:.14,niches:3};
  island.z=serviceRear+carvery.depth+cap+2*aisle+(island.depth+cap)/2;
  const breakfast={x:-5,length:8,depth:1,radius:.14,niches:4};
  const westTables={x:Array.from({length:3},(_,i)=>room.westInner+1.45+aisle+chairRadius+i*tableStep),
    z:Array.from({length:3},(_,i)=>serviceRear+breakfast.depth+cap+aisle+chairRadius+i*tableStep)};
  const rightTableX=room.eastInner-aisle-chairRadius;
  const eastTables={x:[rightTableX-tableStep,rightTableX],z:Array.from({length:2},(_,i)=>island.z+(island.depth+cap)/2+aisle+chairRadius+i*tableStep)};
  const door={z:room.front-2.5,width:3,height:3.9};
  const desserts={x:island.x,z:door.z-1,diameter:3};
  const windows={z:[room.rear+3.2,room.rear+8.2,room.rear+13.2],width:3.2,height:3.6,base:.3};
  const rearWindows={x:gallery.x,width:3.75,height:3.8,base:.3,z:room.rear};
  const stage={x:0,width:5.5,depth:3.4,height:.3,wallGap:.1,rotation:Math.PI,
    backdrop:{height:2.8,thickness:.12},screen:{width:3.4,height:1.3,base:1.1},
    pianoX:-1.8,microphoneX:.9,microphoneInset:1.3,equipmentGap:.02,benchGap:.08,
    speakerX:[2.3,-.7],lightX:[1.8,0,-1.8],labelGap:.4,labelWidth:3.2};
  stage.backZ=room.frontInner-stage.wallGap;stage.z=stage.backZ-stage.depth/2;
  stage.view={cam:[stage.x,1.7,stage.z-stage.depth/2-3],target:[stage.x,1.6,stage.z]};
  const decoration={banquette:{x:room.westInner+.9,z:0,width:8},
    art:{x:room.westInner+.14,z:[-7,-2,3,8],base:1.6,panelX:room.westInner+.15,panelWidth:.12,panelHeight:1.1,panelDepth:4.7},
    plants:[[room.westInner+.6,8],[room.eastInner-.6,room.rear+.8],[room.eastInner-.6,5.4],[room.eastInner-.6,room.front-.8]],
    chandeliers:[[westTables.x[1],westTables.z[0]],[westTables.x[1],westTables.z[2]],[westTables.x[2],westTables.z[1]]],
    chandelierBase:3.8,chandelierRadius:1.2,beamsZ:Array.from({length:5},(_,i)=>room.rear+2+i*(depth-4)/4),beamHeight:.16,beamDepth:.22,beamInset:.2,beamBase:ceiling-.2,
    title:{x:-3,z:room.rear+.3,base:4.25,width:7},breakfastLabel:{base:2.1,width:4.3},menu:{z:-4.5,width:1.6,height:.9,base:1.5}};
  const lights=[...decoration.chandeliers.map(([x,z])=>({pos:[x,decoration.chandelierBase,z],color:'#fff0d6',intensidad:.18,radio:5})),
    ...[island,desserts].map(p=>({pos:[p.x,canopy.base,p.z],color:'#fff3dc',intensidad:.2,radio:4})),
    ...windows.z.map(z=>({pos:[room.eastInner-.8,3,z],color:'#f5f4e6',intensidad:.14,radio:4}))];
  return {room,height:.92,aisle,cap,chairRadius,tableStep,serviceRear,gallery,canopy,island,carvery,desserts,breakfast,westTables,eastTables,door,windows,rearWindows,stage,decoration,lights,
    glass:{color:'#c7e0e5',opacity:.16,highlightOpacity:.09},view:{cam:[3.2,1.7,.6],target:[island.x,1.2,island.z]}};
}
export const BUFFET=planBuffet();
