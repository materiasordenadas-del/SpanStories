// Textura de racimos (máscara blanca, el color va por vértice) de las especies ez-tree, idéntica a la vista
// previa aprobada: un lienzo 512x512 con 4 celdas de 256 px (ancha, menuda, aguja, pinnada).
// Se ejecuta en un navegador (canvas 2D); scripts/hornear-arboles.mjs la recorta en una PNG por celda.
export const LEAF_ATLAS_SOURCE=String.raw`
function leafAtlas(size=512){
    const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d'),h=size/2;
    let s=7;const r=()=>(s=(s*16807)%2147483647)/2147483647;
    const cell=(i,draw)=>{g.save();g.translate((i%2)*h,Math.floor(i/2)*h);g.beginPath();g.rect(0,0,h,h);g.clip();draw(h);g.restore();};
    const grey=v=>'rgb('+v+','+v+','+v+')';
    // Racimo de estilo anime: masa de lóbulos con borde de hojas y vetas interiores (blanco = luz, gris = hueco).
    const clump=(H,{lobes,lobeR,leafLen,leafW,edge,inner})=>{
      const pts=[];for(let k=0;k<lobes;k++){const a=k/lobes*Math.PI*2+r()*.5,d=H*(.09+.07*r());pts.push([H/2+Math.cos(a)*d,H*.5+Math.sin(a)*d*.85,H*lobeR*(.75+.35*r())]);}
      pts.push([H/2,H*.5,H*lobeR*1.25]);
      g.fillStyle=grey(232);for(const [x,y,R] of pts){g.beginPath();g.arc(x,y,R,0,7);g.fill();}
      // borde: hojas que sobresalen hacia fuera
      for(let k=0;k<edge;k++){const [x,y,R]=pts[Math.floor(r()*lobes)],a=r()*Math.PI*2,px=x+Math.cos(a)*R*.92,py=y+Math.sin(a)*R*.92;
        g.fillStyle=grey(Math.round(215+40*r()));g.beginPath();g.ellipse(px+Math.cos(a)*leafLen*.4,py+Math.sin(a)*leafLen*.4,leafLen*H,leafW*H,a,0,7);g.fill();}
      // vetas interiores: grupos de hojas más claras arriba y más oscuras abajo
      for(let k=0;k<inner;k++){const [x,y,R]=pts[Math.floor(r()*pts.length)],a=r()*Math.PI*2,d=Math.sqrt(r())*R*.8,px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;
        const v=Math.round(py<H*.5?240+15*r():185+35*r());g.fillStyle=grey(v);g.beginPath();g.ellipse(px,py,leafLen*H*.8,leafW*H*.8,r()*3,0,7);g.fill();}
    };
    cell(0,H=>clump(H,{lobes:6,lobeR:.13,leafLen:.045,leafW:.026,edge:90,inner:70}));
    cell(1,H=>clump(H,{lobes:8,lobeR:.125,leafLen:.024,leafW:.013,edge:220,inner:160}));
    cell(2,H=>{g.lineCap='round';for(let k=0;k<9;k++){const cx=H/2+(r()-.5)*H*.26,cy=H*.5+(r()-.5)*H*.24;
      g.fillStyle=grey(205);g.beginPath();g.arc(cx,cy,H*.07,0,7);g.fill();
      for(let j=0;j<46;j++){const a=r()*Math.PI*2,l=H*(.08+.07*r());g.strokeStyle=grey(Math.round(200+55*r()));g.lineWidth=H*.016;g.beginPath();g.moveTo(cx,cy);g.lineTo(cx+Math.cos(a)*l,cy+Math.sin(a)*l*.75);g.stroke();}}});
    cell(3,H=>{const pts=[];for(let k=0;k<7;k++){const a=k/7*Math.PI*2,d=H*.11;pts.push([H/2+Math.cos(a)*d,H*.5+Math.sin(a)*d*.8]);}
      g.fillStyle=grey(220);for(const [x,y] of pts){g.beginPath();g.arc(x,y,H*.1,0,7);g.fill();}
      for(let k=0;k<60;k++){const [px,py]=pts[Math.floor(r()*pts.length)],a=r()*Math.PI*2,cx=px+Math.cos(a)*H*.08,cy=py+Math.sin(a)*H*.07,L=H*(.08+.04*r());
        for(let j=0;j<8;j++){const t=j/7,x=cx+Math.cos(a)*L*(t-.5),y=cy+Math.sin(a)*L*(t-.5);g.fillStyle=grey(Math.round(y<H*.5?235+20*r():195+35*r()));
          for(const sgn of [-1,1]){g.beginPath();g.ellipse(x+Math.cos(a+sgn*1.3)*H*.016,y+Math.sin(a+sgn*1.3)*H*.016,H*.016,H*.007,a+sgn*1.3,0,7);g.fill();}}}});
    return c;
  }
`;
