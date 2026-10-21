import * as T from '../engine/three.js';
import { caja,cilindro,esfera } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

// Escenario de música en vivo del restaurante. Piezas independientes: el frente mira a +z y se giran
// -90° para mirar al salón (oeste). Pivot abajo-centro, como el resto de objetos.

// Tarima baja de madera con filete de latón y zócalo oscuro.
export function crearTarima({ancho=5.5,fondo=3.4,alto=.3}={}){
  const r=new T.Group();caja(r,'zócalo',ancho,alto-.06,fondo-.1,C.darkWood,0,(alto-.06)/2);
  caja(r,'tablado',ancho,.06,fondo,C.wood,0,alto-.03);caja(r,'filete',ancho+.02,.03,.04,C.gold,0,alto-.06,fondo/2,false);
  return r;
}

// Telón de fondo: panel de listones de nogal con marco de latón (la pantalla LED se monta delante).
export function crearTelon({ancho=5.5,alto=2.8,fondo=.12}={}){
  const r=new T.Group();caja(r,'panel',ancho,alto,fondo,C.darkWood,0,alto/2);
  for(let i=0;i<Math.floor(ancho/.22);i++)caja(r,'listón-'+i,.05,alto-.2,.04,C.wood,-ancho/2+.2+i*.22,alto/2,fondo/2+.02,false);
  caja(r,'remate',ancho+.08,.06,fondo+.04,C.gold,0,alto-.03,0,false);
  return r;
}

// Piano vertical: cuerpo, tapa, teclado de marfil con teclas negras, atril y pedales.
export function crearPiano({ancho=1.5,fondo=.6,alto=1.25}={}){
  const r=new T.Group();caja(r,'cuerpo',ancho,alto-.15,fondo-.12,C.darkWood,0,(alto-.15)/2+.1,-.06);
  caja(r,'tapa',ancho+.04,.05,fondo,C.darkWood,0,alto-.03,-.02);caja(r,'teclado',ancho-.1,.05,.2,C.ivory,0,.76,.2,false);
  for(let i=0;i<9;i++)caja(r,'negra-'+i,.035,.03,.1,C.ink,-ancho/2+.2+i*.145+(i%7===2||i%7===6?.07:0),.795,.16,false);
  for(const x of [-1,1])caja(r,'pata-'+x,.07,.76,.07,C.darkWood,x*(ancho/2-.05),.38,.2,false);
  caja(r,'atril',.5,.28,.03,C.cloth,0,1.05,.1,false);caja(r,'pedal',.06,.02,.12,C.gold,0,.04,.25,false);
  return r;
}

// Micrófono de pie con pie redondo y jirafa corta.
export function crearMicrofono({alto=1.45}={}){
  const r=new T.Group();cilindro(r,'base',.17,.03,C.ink);cilindro(r,'tubo',.014,alto,C.gold,0,alto/2);
  caja(r,'brazo',.012,.012,.22,C.gold,0,alto-.04,.1,false);esfera(r,'cápsula',.04,C.ink,0,alto-.04,.22);
  return r;
}

// Altavoz de escenario sobre trípode corto.
export function crearAltavoz(){
  const r=new T.Group();cilindro(r,'pie',.02,.5,C.ink,0,.25);cilindro(r,'base',.16,.03,C.ink);
  caja(r,'caja',.36,.62,.3,C.ink,0,.81);cilindro(r,'woofer',.11,.03,C.darkWood,0,.72,.155).rotation.x=Math.PI/2;cilindro(r,'tweeter',.045,.03,C.gold,0,.97,.155).rotation.x=Math.PI/2;
  return r;
}
