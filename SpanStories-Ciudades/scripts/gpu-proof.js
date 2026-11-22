import * as T from '../engine/three.js';
import {shaderRuido} from '../engine/CityNoise.js';
import {shaderLadrillo,evaluarLadrillo} from '../engine/CityBrick.js';

export async function comprobarGPU(renderer) {
  const gl=renderer.getContext(),extension=gl.getExtension('EXT_color_buffer_float');
  if(!extension)return{verified:false,reason:'EXT_color_buffer_float no disponible; render visual requiere otra prueba'};
  const golden=await(await fetch('../reports/noise-golden.json')).json();
  const definitions=await(await fetch('../reports/export-surface-source.json')).json();
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1),plane=new T.PlaneGeometry(2,2);
  const target=new T.WebGLRenderTarget(16,1,{type:T.FloatType,format:T.RGBAFormat,depthBuffer:false,stencilBuffer:false});
  const previous=renderer.getRenderTarget(),programsBefore=new Set(renderer.info.programs);const materials=[];
  function measure(code,uniforms,expression) {
    const material=new T.ShaderMaterial({uniforms,vertexShader:'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',fragmentShader:code+'\nvoid main(){int i=int(gl_FragCoord.x);gl_FragColor='+expression+';}',depthTest:false,depthWrite:false});materials.push(material);
    const mesh=new T.Mesh(plane,material);scene.clear();scene.add(mesh);renderer.setRenderTarget(target);renderer.render(scene,camera);
    const values=new Float32Array(64);renderer.readRenderTargetPixels(target,0,0,16,1,values);return values;
  }
  try {
    const rows=golden.samples.slice(0,16),graph={kind:'noise',noise:{scale:1,detail:2,roughness:.5,lacunarity:2,normalize:true,coordinate:'generated'}};
    const helper=shaderRuido(graph),uniforms={points:{value:rows.map(r=>new T.Vector3(...r.coordinate))},scale:{value:rows.map(r=>r.parameters.scale)},detail:{value:rows.map(r=>r.parameters.detail)},roughness:{value:rows.map(r=>r.parameters.roughness)},lacunarity:{value:rows.map(r=>r.parameters.lacunarity)},normalized:{value:rows.map(r=>r.parameters.normalize?1:0)}};
    const code='uniform vec3 points[16];uniform float scale[16],detail[16],roughness[16],lacunarity[16],normalized[16];\n'+helper.code;
    const noise=measure(code,uniforms,'vec4(ssNoiseFbm(points[i]*scale[i],detail[i],roughness[i],lacunarity[i],normalized[i]>.5),0.0,0.0,1.0)');
    const noiseError=Math.max(...rows.map((r,i)=>Math.abs(noise[i*4]-r.factor)));
    const brick=definitions.surfaces.H06_ladrillo,coordinates=Array.from({length:16},(_,i)=>[i*.037-.1,i*.063-.2,0]),brickHelper=shaderLadrillo(brick);
    const values=measure('uniform vec3 points[16];\n'+brickHelper.code,{points:{value:coordinates.map(p=>new T.Vector3(...p))}},'vec4(ssBrickColor(points[i]),ssBrickFactor(points[i]))');
    let brickError=0;coordinates.forEach((p,i)=>{const ref=evaluarLadrillo(brick,p);for(let a=0;a<3;a++)brickError=Math.max(brickError,Math.abs(values[i*4+a]-ref.color[a]));brickError=Math.max(brickError,Math.abs(values[i*4+3]-ref.factor));});
    const compiled=renderer.info.programs.filter(p=>!programsBefore.has(p)).every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS));
    return{verified:compiled&&noiseError<2e-6&&brickError<2e-6,compiled,noiseSamples:rows.length,noiseMaxError:noiseError,noiseReference:golden.reference,brickSamples:16,brickMaxError:brickError,reference:'Noise: Cycles pixels; Brick: float32 source evaluator with independent unit goldens'};
  } finally {renderer.setRenderTarget(previous);scene.clear();target.dispose();plane.dispose();for(const m of materials)m.dispose();}
}
