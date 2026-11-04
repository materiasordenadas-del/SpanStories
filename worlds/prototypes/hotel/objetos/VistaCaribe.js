import * as T from '../engine/three.js';
// Fondo lejano plano, sin luces ni geometría densa (ESTILO.md §1).
export function crearVistaCaribe(){
  const root=new T.Group(),canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#c3dfdf';ctx.fillRect(0,0,1024,512);
  ctx.fillStyle='#6fabbb';ctx.fillRect(0,265,1024,247);
  ctx.fillStyle='#93c4c7';ctx.fillRect(0,265,1024,38);
  ctx.fillStyle='#deeadd';for(const [x,y,w] of [[100,135,120],[580,100,170],[820,170,90]]){ctx.beginPath();ctx.ellipse(x,y,w,15,0,0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#6d998c';ctx.beginPath();ctx.moveTo(0,265);ctx.lineTo(0,250);ctx.lineTo(80,231);ctx.lineTo(165,249);ctx.lineTo(220,265);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#b6d8d5';ctx.lineWidth=3;for(let i=0;i<9;i++){ctx.beginPath();ctx.moveTo(80+i*103,325+(i%3)*42);ctx.lineTo(150+i*103,325+(i%3)*42);ctx.stroke();}
  const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;
  const panel=new T.Mesh(new T.PlaneGeometry(180,70),new T.MeshBasicMaterial({map}));panel.name='panorama-caribe';root.add(panel);return root;
}
