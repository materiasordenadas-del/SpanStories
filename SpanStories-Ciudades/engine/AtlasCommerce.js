import * as T from './three.js';
// Extensión exclusivamente receptora: el contenido ya está completo en el GLB.
export function captureAtlasCommerce(root){const records=[];root.traverse(o=>{if(!o.isMesh)return;const materials=[o.material].flat();if(o.userData.ss_rol||materials.some(m=>m.userData.ss_rol)){o.userData.ss_noOutline=true;records.push({mesh:o,sources:materials.map(m=>({role:m.userData.ss_rol??o.userData.ss_rol,emissive:m.emissive?.clone()??new T.Color(0),intensity:m.emissiveIntensity??0,map:m.emissiveMap,depthWrite:m.depthWrite,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest}))});}});return records;}
export function adaptAtlasCommerce(style,records,night={value:0}){
  for(const {mesh,sources}of records){mesh.castShadow=false;mesh.receiveShadow=false;const materials=[mesh.material].flat();for(let i=0;i<materials.length;i++){const m=materials[i],src=sources[i]??sources[0];m.depthWrite=src.depthWrite;m.transparent=src.transparent;m.opacity=src.opacity;m.alphaTest=src.alphaTest;m.userData.ss_rol=src.role;m.userData.ss_noOutline=true;
    if(m.userData.atlasCommerce)continue;m.userData.atlasCommerce=true;
    if(src.intensity>0){m.uniforms.uAtlasShopNight=night;m.uniforms.uAtlasShopEmissive={value:src.emissive.multiplyScalar(src.intensity)};m.uniforms.uAtlasShopMap={value:src.map};m.uniforms.uAtlasShopHasMap={value:!!src.map};
      style.extendMaterial(m,{fragment:shader=>'uniform float uAtlasShopNight;\nuniform vec3 uAtlasShopEmissive;\nuniform sampler2D uAtlasShopMap;\nuniform bool uAtlasShopHasMap;\n'+shader.replace('gl_FragColor = vec4(color, a);',(src.role==='luz_interior'?'color = albedo * .78;\n':'')+'vec3 atlasGlow = uAtlasShopHasMap ? texture2D(uAtlasShopMap, vUv).rgb : vec3(1.0);\ncolor += atlasGlow * uAtlasShopEmissive * (.40 + .85 * uAtlasShopNight);\ngl_FragColor = vec4(color, a);')});
    }
  }}
}
