import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../engine/three.js';
import {CityStyle} from '../engine/CityStyle.js';
import {fragmentoGBuffer,verticeGBuffer} from '../engine/StyleGBuffer.js';
const adapter={composicionFija:true,actual:{uniformes:{}},componer:(s,m)=>fragmentoGBuffer(s,m.userData),componerVertice:verticeGBuffer};
test('el adaptador conserva texturas, UV1, alfa, skin, morph y shaders de árboles',()=>{
  const style=new CityStyle({estilos:adapter}),map=new T.Texture();map.channel=1;
  const src=new T.MeshStandardMaterial({map,vertexColors:true,alphaTest:.4});
  try{
    const m=style.material(src,'rigged',true);assert.equal(m.uniforms.uAlbedo.value,map);
    assert.match(m.vertexShader,/skinning_vertex/);assert.match(m.vertexShader,/morphtarget_vertex/);assert.match(m.vertexShader,/uv1/);
    assert.match(m.fragmentShader,/vCityColor.a/);assert.match(m.fragmentShader,/poolNormal/);assert.match(m.fragmentShader,/:25.0/);
    style.extendMaterial(m,{fragment:s=>s.replace('gl_FragColor = vec4(color, a);','gl_FragColor = vec4(color, 1.0);')});
    assert.match(m.fragmentShader,/poolLight/);assert.equal(m.defaultAttributeValues.poolSurface[0],-1);
  }finally{style.dispose();src.dispose();map.dispose();}
});
test('superficies exportadas y selección mantienen atributos e identidad',()=>{
  const style=new CityStyle({estilos:adapter}),g=new T.BoxGeometry(),s=new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(8),1);
  g.setAttribute('_surface',s);const src=new T.MeshStandardMaterial(),mesh=new T.Mesh(g,src);mesh.userData.ss_noOutline=true;mesh.userData.id='retained';
  try{style.adapt(mesh);assert.equal(mesh.geometry.getAttribute('poolSurface'),s);assert.equal(mesh.userData.id,'retained');assert.equal(mesh.geometry,g);}
  finally{style.dispose();src.dispose();g.dispose();}
});
