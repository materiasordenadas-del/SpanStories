import * as T from './three.js';
import { shaderLadrillo } from './CityBrick.js';
import { shaderRuido } from './CityNoise.js';

// Graphs exportados del material Blender; no contienen iluminación horneada.
export async function prepararSuperficies(gltf) {
  const tasks=[];
  gltf.scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const association=gltf.parser.associations.get(mesh);
    const primitive=gltf.parser.json.meshes?.[association?.meshes]?.primitives?.[association?.primitives??0];
    const sourceGraph=primitive?.extras?.ssSurface || mesh.geometry.userData?.ssSurface || mesh.material?.userData?.ssSurface;
    if(!sourceGraph)return;
    const graph={...sourceGraph,...sourceGraph.atlas};
    mesh.userData.surfaceGraph=graph;
    const indices=[graph.primaryTexture,graph.secondaryTexture,graph.baked?.albedoTexture,graph.baked?.normalTexture].filter(Number.isInteger);
    tasks.push(Promise.all(indices.map(async index=>[index,await gltf.parser.getDependency('texture',index)])).then(pairs=>{
      mesh.userData.surfaceTextures=Object.fromEntries(pairs);
      for(const [index,texture] of pairs){texture.colorSpace=index===graph.baked?.normalTexture?T.NoColorSpace:T.SRGBColorSpace;texture.updateMatrix();}
    }));
  });
  await Promise.all(tasks);
}

export function adaptarSuperficie(material, graph, textures={}) {
  if(!graph)return material;
  const fallback=graph.fallbackColor||[1,1,1];material.uniforms.uColor.value.setRGB(...fallback.slice(0,3));
  material.userData.sourceName=graph.sourceName;material.userData.surfaceGraph=graph;
  material.userData.colorBase.copy(material.uniforms.uColor.value);
  const primary=textures[graph.primaryTexture];
  if(primary){
    material.uniforms.uAlbedo.value=primary;material.defines.USE_ALBEDO='';
    material.uniforms.cityAlbedoUV.value.copy(primary.matrix);
    if(graph.primaryUV){
      if(graph.primaryUV!=='uv'&&!material.vertexShader.includes('attribute vec2 '+graph.primaryUV+';'))material.vertexShader='attribute vec2 '+graph.primaryUV+';\n'+material.vertexShader;
      material.vertexShader=material.vertexShader.replace(/vUv = \(cityAlbedoUV \* vec3\([^;]+;/,`vUv = (cityAlbedoUV * vec3(${graph.primaryUV},1.0)).xy;`);
    }
  }
  material.defaultAttributeValues={...material.defaultAttributeValues,color_1:[0,0,0,0],_ss_h02_uv:[0,0],_ss_h02_pattern:[0]};
  // A different exported color layer must not replace Blender's missing named layer.
  const attribute=graph.colorAttribute||'_ss_source_color';
  material.defaultAttributeValues._ss_source_color=[0,0,0,0];
  material.vertexShader='attribute vec4 '+attribute+'; varying vec4 vSurfaceColor;\n'+material.vertexShader.replace('void main() {','void main() {\nvSurfaceColor='+attribute+';');
  material.fragmentShader='varying vec4 vSurfaceColor;\n'+material.fragmentShader;
  let albedo='vec3 albedo = mix(uColor, vSurfaceColor.rgb, clamp(vSurfaceColor.a,0.0,1.0));';
  if(graph.kind==='atlas') {
    const secondary=textures[graph.secondaryTexture],uv=graph.secondaryUV||'_ss_h02_uv',pattern=graph.patternAttribute||'_ss_h02_pattern';
    if(secondary){
      material.uniforms.citySecondaryAtlas={value:secondary};
      material.uniforms.citySecondaryUV={value:secondary.matrix.clone()};
      const uvDeclaration=uv!=='uv'&&!material.vertexShader.includes('attribute vec2 '+uv+';')?'attribute vec2 '+uv+'; ':'';
      const patternDeclaration=graph.patternAttribute?'attribute float '+pattern+'; ':'';
      const patternExpression=graph.patternAttribute?pattern:Number(graph.patternConstant||0).toFixed(1);
      material.vertexShader=uvDeclaration+patternDeclaration+'uniform mat3 citySecondaryUV; varying vec2 vSurfaceUV; varying float vSurfacePattern;\n'+material.vertexShader.replace('void main() {',`void main() {\nvSurfaceUV=(citySecondaryUV*vec3(${uv},1.0)).xy; vSurfacePattern=${patternExpression};`);
      material.fragmentShader='uniform sampler2D citySecondaryAtlas; varying vec2 vSurfaceUV; varying float vSurfacePattern;\n'+material.fragmentShader;
      albedo='vec3 albedo = mix(tex.rgb, vSurfaceColor.rgb, clamp(vSurfaceColor.a,0.0,1.0));\nalbedo=mix(albedo,texture2D(citySecondaryAtlas,vSurfaceUV).rgb,clamp(vSurfacePattern,0.0,1.0));';
    }else albedo='vec3 albedo = mix(tex.rgb, vSurfaceColor.rgb, clamp(vSurfaceColor.a,0.0,1.0));';
  }
  if(graph.baked?.albedoTexture!==undefined){
    const texture=textures[graph.baked.albedoTexture];
    if(texture){material.uniforms.uAlbedo.value=texture;material.defines.USE_ALBEDO='';albedo='vec3 albedo = tex.rgb;';}
    const normal=textures[graph.baked.normalTexture];
    if(normal){material.uniforms.uNormal.value=normal;material.defines.USE_NMAP='';}
  }
  if((graph.kind==='brick'||graph.kind==='noise')&&!Number.isInteger(graph.baked?.albedoTexture)) {
    const helper=graph.kind==='brick'?shaderLadrillo(graph):shaderRuido(graph);
    const generated=graph.generatedBoundsBlender||{min:[0,0,0],max:[1,1,1]};
    const coordinate=helper.coordinate==='uv'?'ssBrickCoordinate':'vNoiseGenerated';
    if(helper.coordinate==='uv') {
      material.vertexShader='varying vec2 vSurfaceNativeUV;\n'+material.vertexShader.replace('void main() {','void main() {\nvSurfaceNativeUV=vec2(uv.x,1.0-uv.y);');
      material.fragmentShader='varying vec2 vSurfaceNativeUV;\n'+material.fragmentShader.replace('void main() {','void main() {\nvec3 ssBrickCoordinate=vec3(vSurfaceNativeUV,0.0);');
    } else {
      material.uniforms.cityGeneratedMin={value:new T.Vector3(...generated.min)};material.uniforms.cityGeneratedMax={value:new T.Vector3(...generated.max)};
      const sourceCoordinate=helper.coordinate==='object'?'ssNativePosition':'mix(vec3(.5),(ssNativePosition-cityGeneratedMin)/max(abs(extent),vec3(1e-9)),step(vec3(1e-9),abs(extent)))';
      material.vertexShader='uniform vec3 cityGeneratedMin; uniform vec3 cityGeneratedMax; varying vec3 vNoiseGenerated;\n'+material.vertexShader.replace('void main() {',`void main() {\nvec3 ssNativePosition=vec3(position.x,-position.z,position.y); vec3 extent=cityGeneratedMax-cityGeneratedMin; vNoiseGenerated=${sourceCoordinate};`);
      material.fragmentShader='varying vec3 vNoiseGenerated;\n'+material.fragmentShader;
    }
    material.fragmentShader=helper.code+'\n'+material.fragmentShader;
    if(helper.colorExpression)albedo='vec3 albedo = '+helper.colorExpression+';';
    const bump=graph.bump||helper.bump;
    if(bump&&bump.strength>0) {
      const number=n=>Number(n).toPrecision(12),fw=Math.max(bump.filterWidth||.1,1e-6);
      const h=helper.heightExpression,hx=h.replaceAll(coordinate,`(${coordinate}+dFdx(${coordinate})*${number(fw)})`),hy=h.replaceAll(coordinate,`(${coordinate}+dFdy(${coordinate})*${number(fw)})`);
      material.fragmentShader=`vec3 ssSurfaceBump(vec3 n,vec3 p,float hc,float hx,float hy,float fw,float strength,float distance){vec3 px=dFdx(p),py=dFdy(p);vec3 rx=cross(py,n),ry=cross(n,px);float det=dot(px,rx);vec3 g=(hx-hc)*rx+(hy-hc)*ry;vec3 b=fw*abs(det)*n-distance*sign(det)*g;return dot(b,b)>1e-30?normalize(max(strength,0.0)*normalize(b)+(1.0-max(strength,0.0))*n):n;}\n`+material.fragmentShader;
      const distance=bump.distance*(bump.invert?-1:1);
      material.fragmentShader=material.fragmentShader.replace('float dentro = interior(vPos);',`Nrel=ssSurfaceBump(Nrel,vPos,${h},${hx},${hy},${number(fw)},${number(bump.strength)},${number(distance)});\nfloat dentro = interior(vPos);`);
    }
    material.userData.sourceAlgorithm=helper.sourceAlgorithm||'Blender 5.2 Cycles Brick';
  }
  material.fragmentShader=material.fragmentShader.replace('vec3 albedo = tex.rgb * uColor;',albedo);
  material.needsUpdate=true;return material;
}
