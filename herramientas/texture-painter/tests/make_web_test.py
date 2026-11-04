from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
ENGINE=Path(r'D:\Español\SpanStories-worktrees\visor-mundo-20261021\SpanStories-Ciudades')
out=ROOT/'evidence'/'threejs-check.html'
html='''<!doctype html><meta charset="utf-8"><title>Validación Three.js de Lamine</title>
<style>body{margin:0;background:#19212b;color:#eee;font:14px system-ui}canvas{display:block}pre{position:fixed;top:12px;left:16px;background:#15202bbb;padding:12px;max-width:470px;white-space:pre-wrap}</style>
<pre id="status">Cargando GLB local…</pre>
<script type="module">
import * as THREE from THREE_URI;
import { GLTFLoader } from LOADER_URI;
const status=document.querySelector('#status');
try {
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,900);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#25313d');
 scene.add(new THREE.HemisphereLight(0xffffff,0x505060,2.3));const sun=new THREE.DirectionalLight(0xffffff,2.6);sun.position.set(2,4,5);scene.add(sun);
 const gltf=await new GLTFLoader().loadAsync(GLB_URI);scene.add(gltf.scene);scene.updateMatrixWorld(true);
 let meshes=0,uvMeshes=0,textureMaterials=0,morphMeshes=0,skins=0,wrongColorSpace=0,wrongFlipY=0;
 gltf.scene.traverse(o=>{if(!o.isMesh)return;meshes++;if(o.geometry.attributes.uv)uvMeshes++;if(o.morphTargetInfluences?.length)morphMeshes++;if(o.isSkinnedMesh)skins++;for(const m of (Array.isArray(o.material)?o.material:[o.material])){if(m.map){textureMaterials++;if(m.map.colorSpace!==THREE.SRGBColorSpace)wrongColorSpace++;if(m.map.flipY!==false)wrongFlipY++;}}});
 const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());const aspect=1100/900,half=size.y*.62;
 const camera=new THREE.OrthographicCamera(-half*aspect,half*aspect,half,-half,.001,1000);camera.position.set(center.x,center.y,center.z+Math.max(size.x,size.y,size.z)*3);camera.lookAt(center);
 renderer.render(scene,camera);await new Promise(r=>requestAnimationFrame(r));renderer.render(scene,camera);
 const passed=meshes>0&&uvMeshes>0&&textureMaterials>=4&&morphMeshes>0&&wrongColorSpace===0&&wrongFlipY===0;
 const result={passed,three:THREE.REVISION,meshes,uvMeshes,textureMaterials,morphMeshes,skins,wrongColorSpace,wrongFlipY,webgl:renderer.getContext().getParameter(renderer.getContext().VERSION)};
 window.__SSTP_RESULT=result;status.textContent=JSON.stringify(result,null,2);document.documentElement.dataset.test=passed?'passed':'failed';
}catch(e){status.textContent=e.stack;document.documentElement.dataset.test='failed';}
</script>'''
html=html.replace('THREE_URI',json.dumps((ENGINE/'vendor'/'three.module.js').as_uri())).replace('LOADER_URI',json.dumps((ENGINE/'vendor'/'GLTFLoader.js').as_uri())).replace('GLB_URI',json.dumps((ROOT/'evidence'/'Lamine-export'/'Lamine_ThreeJS.glb').as_uri()))
out.write_text(html,encoding='utf-8')
print(out.as_uri())
