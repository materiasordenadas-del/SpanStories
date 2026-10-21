import * as T from '../engine/three.js';
import { caja,cilindro,esfera,pieza } from './Piezas.js';
import { COLORS as C } from '../engine/dimensions.js';

// Piezas de la planta baja del hotel 5 estrellas (piedra clara, vidrio, bronce y latón).
// Pivot abajo-centro y frente hacia +z, como el resto de objetos.

// Puerta giratoria: tambor de vidrio con techo de bronce y cuatro hojas que giran.
export function crearPuertaGiratoria({radio=1.5,alto=2.7}={}) {
  const r=new T.Group(),wings=new T.Group();r.add(wings);
  caja(r,'piso',radio*2+.1,.03,radio*2+.1,C.ink,0,.015,0,false);
  cilindro(r,'techo',radio+.08,.32,C.darkWood,0,alto+.16);cilindro(r,'aro',radio+.1,.06,C.gold,0,alto+.03);
  for(const side of [-1,1]){const glass=pieza(r,'tambor-'+side,new T.CylinderGeometry(radio,radio,alto,24,1,true,side<0?Math.PI*.15:Math.PI*1.15,Math.PI*.7),C.blue,[0,alto/2,0],false);glass.material.side=T.DoubleSide;}
  cilindro(r,'eje',.06,alto,C.gold,0,alto/2);
  for(let i=0;i<4;i++){const wing=new T.Group();wing.rotation.y=i*Math.PI/2;wings.add(wing);
    caja(wing,'hoja-'+i,radio-.12,alto-.1,.04,C.blue,(radio-.12)/2+.06,alto/2,0,false);
    caja(wing,'perfil-'+i,.05,alto-.1,.07,C.darkWood,radio-.06,alto/2,0,false);
    caja(wing,'barra-'+i,radio-.3,.05,.08,C.gold,(radio-.3)/2+.12,1.05,0,false);}
  r.userData.abierta=false;r.userData.accion=()=>{r.userData.abierta=!r.userData.abierta;};
  r.userData.animar=dt=>{if(r.userData.abierta)wings.rotation.y+=dt*.9;};
  return r;
}

// Pilar revestido de piedra clara con zócalo y capitel de bronce.
export function crearPilarPiedra({ancho=.8,fondo=.6,alto=3.8}={}) {
  const r=new T.Group();
  caja(r,'fuste',ancho,alto,fondo,C.stone,0,alto/2);
  caja(r,'zócalo',ancho+.06,.22,fondo+.06,C.darkWood,0,.11,0,false);
  caja(r,'capitel',ancho+.06,.12,fondo+.06,C.gold,0,alto-.06,0,false);
  return r;
}

// Paño de vidrio de piso a techo con montantes de bronce (planta baja acristalada).
export function crearPanoVidrio({ancho=3.6,alto=3.4,modulos=3}={}) {
  const r=new T.Group();
  caja(r,'vidrio',ancho,alto,.05,C.blue,0,alto/2,0,false);
  for(let i=0;i<=modulos;i++)caja(r,'montante-'+i,.07,alto,.1,C.darkWood,-ancho/2+i*ancho/modulos,alto/2,.02,false);
  for(const y of [.06,alto-.06])caja(r,'perfil-'+y,ancho+.07,.12,.1,C.darkWood,0,y,.02,false);
  caja(r,'pasamanos',ancho,.05,.06,C.gold,0,1.05,.06,false);
  return r;
}

// Luminaria empotrada en el plafón: disco emisivo y aro de latón (cuelga hacia abajo).
export function crearDownlight({radio=.16}={}) {
  const r=new T.Group();
  cilindro(r,'aro',radio+.04,.03,C.gold,0,-.015);
  const light=new T.Mesh(new T.CircleGeometry(radio,20),new T.MeshBasicMaterial({color:'#fff1cc'}));light.name='luz';light.rotation.x=Math.PI/2;light.position.y=-.032;r.add(light);
  return r;
}

// Atril del botones con lámpara y timbre: un punto de servicio que el estudiante puede usar.
export function crearAtrilBotones() {
  const r=new T.Group();
  caja(r,'pie',.5,1.05,.4,C.darkWood,0,.525);caja(r,'tapa',.62,.05,.5,C.gold,0,1.075);
  caja(r,'placa',.36,.12,.02,C.gold,0,.75,.21,false);
  cilindro(r,'timbre',.06,.03,C.gold,.12,1.115);esfera(r,'cúpula',.045,C.gold,.12,1.14,0);
  return r;
}

// Carrito portaequipajes de latón con una maleta.
export function crearCarritoEquipaje() {
  const r=new T.Group();
  caja(r,'base',1.1,.06,.6,C.darkWood,0,.3);
  for(const x of [-.5,.5])for(const z of [-.24,.24])cilindro(r,'rueda-'+x+z,.08,.05,C.ink,x,.08,z);
  for(const x of [-.53,.53])caja(r,'poste-'+x,.04,1.5,.04,C.gold,x,1.05);
  caja(r,'arco',1.1,.04,.04,C.gold,0,1.8);
  caja(r,'maleta',.62,.42,.3,C.teal,-.1,.54);caja(r,'maletín',.42,.3,.22,C.peach,.18,.9);
  return r;
}

// Bolardo bajo de bronce que protege la acera de la entrada.
export function crearBolardo() {
  const r=new T.Group();cilindro(r,'cuerpo',.11,.8,C.darkWood,0,.4);cilindro(r,'aro',.12,.05,C.gold,0,.7);esfera(r,'remate',.11,C.darkWood,0,.8);return r;
}

// Jardinera rectangular de piedra con arbustos bajos (exterior).
export function crearJardinera({ancho=3,fondo=1,alto=.6}={}) {
  const r=new T.Group();
  caja(r,'caja',ancho,alto,fondo,C.stone,0,alto/2);caja(r,'tierra',ancho-.12,.04,fondo-.12,C.darkWood,0,alto-.03,0,false);
  const n=Math.max(2,Math.round(ancho/.55));
  for(let i=0;i<n;i++){const b=esfera(r,'arbusto-'+i,.32,i%2?C.leaf:C.green,-ancho/2+.3+i*(ancho-.6)/(n-1),alto+.18,0);b.scale.set(1,.75,.9);}
  return r;
}

// Tótem con el nombre del hotel junto a la acera.
export function crearTotem({alto=2.6}={}) {
  const r=new T.Group();caja(r,'cuerpo',.9,alto,.35,C.green,0,alto/2);caja(r,'base',1.1,.18,.5,C.darkWood,0,.09);caja(r,'filete',.92,.06,.37,C.gold,0,alto-.25,0,false);return r;
}
