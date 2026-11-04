// Plano 2D del lugar (vista cenital esquemática): zonas, calles, edificios y árboles.
const FILL={school:'#2b3442',plaza:'#3a4250',grass:'#3f6b3a',park:'#3f6b3a',forest:'#2f5a30',pitch:'#3f7a3a',track:'#9a4f3b',pool:'#3f8fbe',
  water:'#3f8fbe',playground:'#8a6a45',farmland:'#6b7a3a',parking:'#4a4f58',sand:'#8a7a50'};

export function drawPlan(canvas,model){
  const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
  const {width:SW,depth:SD}=model.size,k=Math.min(W/SW,H/SD)*.96;
  const X=x=>W/2+x*k,Z=z=>H/2+z*k;
  ctx.fillStyle='#0e131b';ctx.fillRect(0,0,W,H);
  const poly=(ring,fill,stroke)=>{ctx.beginPath();ring.forEach((p,i)=>i?ctx.lineTo(X(p[0]),Z(p[1])):ctx.moveTo(X(p[0]),Z(p[1])));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill('evenodd');}if(stroke){ctx.strokeStyle=stroke;ctx.stroke();}};
  for(const a of model.areas){const f=FILL[a.kind];if(!f)continue;ctx.beginPath();for(const ring of a.rings){ring.forEach((p,i)=>i?ctx.lineTo(X(p[0]),Z(p[1])):ctx.moveTo(X(p[0]),Z(p[1])));ctx.closePath();}ctx.fillStyle=f;ctx.fill('evenodd');}
  ctx.lineCap='round';
  for(const r of model.roads){ctx.strokeStyle=r.type==='vehicle'?'#5c6370':'#454c58';ctx.lineWidth=Math.max(1,r.width*k);ctx.beginPath();r.points.forEach((p,i)=>i?ctx.lineTo(X(p[0]),Z(p[1])):ctx.moveTo(X(p[0]),Z(p[1])));ctx.stroke();}
  ctx.lineWidth=1;
  for(const l of model.lines){ctx.strokeStyle=/wall/.test(l.kind+l.sub)?'#c9c2b4':'#8e959e';ctx.beginPath();l.points.forEach((p,i)=>i?ctx.lineTo(X(p[0]),Z(p[1])):ctx.moveTo(X(p[0]),Z(p[1])));ctx.stroke();}
  for(const b of model.buildings)poly(b.rings[0],b.use==='school'?'#d9cfa8':'#7d8794','#1d2430');
  ctx.fillStyle='#6fae5a';for(const p of model.points)if(p.kind==='tree'){ctx.beginPath();ctx.arc(X(p.x),Z(p.z),Math.max(1.2,2.2*k),0,Math.PI*2);ctx.fill();}
  ctx.fillStyle='#93a0b2';ctx.font='10px system-ui';
  for(const b of model.buildings)if(b.name&&b.use==='school'){const c=b.rings[0].reduce((s,p)=>[s[0]+p[0]/b.rings[0].length,s[1]+p[1]/b.rings[0].length],[0,0]);ctx.fillStyle='#1b222d';ctx.fillText(b.name,X(c[0])-ctx.measureText(b.name).width/2,Z(c[1])+3);}
  ctx.fillStyle='#93a0b2';ctx.fillText('N ↑',W-26,14);
}
