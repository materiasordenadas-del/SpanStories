import * as T from '../engine/three.js';
import {DECOR} from '../routes.js';
import {flattened,normalize,merged} from './DecorGeometry.js';

export function signTexture(kind){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
  if(kind==='speed'){
    c.fillStyle='#d64938';c.beginPath();c.arc(128,128,125,0,Math.PI*2);c.fill();c.fillStyle='#fff9e6';c.beginPath();c.arc(128,128,100,0,Math.PI*2);c.fill();
    c.fillStyle='#243437';c.font='bold 118px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText('30',128,139);
  }else{
    c.fillStyle='#37668b';c.fillRect(0,0,256,256);c.fillStyle='#fff9e6';c.beginPath();c.moveTo(128,22);c.lineTo(235,222);c.lineTo(21,222);c.closePath();c.fill();
    c.strokeStyle='#243437';c.lineWidth=14;c.lineCap='round';c.beginPath();c.arc(133,91,13,0,Math.PI*2);c.fillStyle='#243437';c.fill();
    c.beginPath();c.moveTo(125,117);c.lineTo(115,154);c.lineTo(88,188);c.moveTo(115,154);c.lineTo(145,190);c.moveTo(123,125);c.lineTo(151,144);c.moveTo(122,126);c.lineTo(100,140);c.stroke();
    c.fillStyle='#243437';for(let x=59;x<204;x+=31)c.fillRect(x,202,20,6);
  }
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}
export async function createCityPropPrototypes({loader,style,baseUrl}){
  const gltf=await loader.loadAsync(new URL('props.glb',baseUrl).href),sources=new Map();gltf.scene.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])sources.set(m.uuid,m);});
  const prototypes=new Map(),materials=new Map();
  function material(key,color,{map=null,double=false,lit=false}={}){
    if(materials.has(key))return materials.get(key);
    const source=new T.MeshStandardMaterial({color,map,side:double?T.DoubleSide:T.FrontSide,alphaTest:map?.5:0});
    const result=style.material(source,'decor-prop:'+key);if(lit)result.uniforms.uPropia.value=.35;source.dispose();materials.set(key,result);return result;
  }
  const dark=material('metal','#414a43',{double:true});
  const lights={red:material('red','#da5946',{double:true,lit:true}),green:material('green','#80bf75',{double:true,lit:true}),amber:material('amber','#b8974c',{double:true}),off:material('off','#394b42',{double:true})};
  function node(name){const source=gltf.scene.getObjectByName(name);if(!source)throw new Error('Artículo no encontrado: '+name);return source;}
  const traffic=i=>node('SS_TRAFFIC_LIGHTS_TRAFFIC_COMPONENT_'+String(i).padStart(2,'0'));
  function part(geometry,mat,name){return {geometry,material:mat,name};}
  function pole(height,radius,segments=6){return part(new T.CylinderGeometry(radius,radius*1.18,height,segments).translate(0,height/2,0),dark,'poste');}
  for(const variant of ['red','green']){
    const nearPole=normalize(flattened(traffic(3)),DECOR.trafficHeight);for(const p of nearPole)p.material=dark;
    const head=[];for(let i=20;i<=27;i++)for(const p of flattened(traffic(i))){p.component=i;head.push(p);}
    normalize(head,DECOR.headHeight,{rotateY:Math.PI});
    for(const p of head){p.geometry.translate(0,DECOR.trafficHeight-DECOR.headHeight,0);p.material=p.component===25?(variant==='red'?lights.red:lights.off):p.component===21?(variant==='green'?lights.green:lights.off):p.component===23?lights.off:dark;}
    const near=merged([...nearPole,...head]);
    function low(far){
      const result=[pole(DECOR.trafficHeight,DECOR.poleRadius,far?3:5),part(new T.BoxGeometry(DECOR.headWidth,DECOR.headHeight,DECOR.headDepth).translate(0,DECOR.trafficHeight-DECOR.headHeight/2,0),dark,'caja')];
      for(let i=0;i<3;i++){
        if(far&&((variant==='red'&&i!==0)||(variant==='green'&&i!==2)))continue;
        const m=i===0&&variant==='red'?lights.red:i===2&&variant==='green'?lights.green:lights.off;
        const y=DECOR.trafficHeight-DECOR.headTopInset-i*DECOR.lensStep;
        result.push(part(new T.CircleGeometry(DECOR.lensRadius,far?4:8).translate(0,y,DECOR.headFront),m,'lente-'+i));
      }return merged(result);
    }
    prototypes.set('traffic:'+variant,[near,low(false),low(true)]);
  }
  for(const variant of ['speed','crossing']){
    const face=material('sign-'+variant,'#ffffff',{map:signTexture(variant)}),back=material('sign-back','#d5d3be',{double:true});
    const src=node(variant==='speed'?'SS_SIGNS_CAUTION_SIGN_03':'SS_SIGNS_GUIDANCE_SIGN_02');
    const nearPlate=normalize(flattened(src),DECOR.signWidth,{rotateY:-Math.PI/2});
    for(const p of nearPlate){p.material=back;p.geometry.translate(0,DECOR.signHeight-DECOR.signWidth,0);}
    function front(){return part(new T.PlaneGeometry(DECOR.signWidth,DECOR.signWidth).translate(0,DECOR.signHeight-DECOR.signWidth/2,DECOR.signFront),face,'simbolo-'+variant);}
    const near=merged([pole(DECOR.signHeight-DECOR.signWidth/2,DECOR.signPoleRadius,8),...nearPlate,front()]);
    function low(far){const shape=variant==='speed'?new T.CircleGeometry(DECOR.signWidth/2,far?10:16):new T.PlaneGeometry(DECOR.signWidth,DECOR.signWidth);shape.translate(0,DECOR.signHeight-DECOR.signWidth/2,0);return merged([pole(DECOR.signHeight-DECOR.signWidth/2,DECOR.signPoleRadius,far?3:5),part(shape,back,'placa'),front()]);}
    prototypes.set('sign:'+variant,[near,low(false),low(true)]);
  }
  for(const m of sources.values())m.dispose();gltf.scene.traverse(o=>o.geometry?.dispose());return prototypes;
}
