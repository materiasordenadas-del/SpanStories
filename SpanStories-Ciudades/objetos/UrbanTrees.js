import * as T from '../engine/three.js';
import {URBAN_TREES as C} from '../routes.js';
import {flattened,normalize,bounds} from './DecorGeometry.js';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {splitAtlasTree} from './TreeAtlasParts.js';
import {createTreeTextureAtlas} from './TreeAtlas.js';
import {foliageSamples} from './TreeAppearance.js';

export function addTreeVariationShader(style,material){
  material.uniforms.uTreePalette={value:C.palettes.flat().map(c=>new T.Color(c))};
  material.uniforms.uSombraColor={value:new T.Color().setRGB(...C.shadowTint)};
  material.uniforms.uTreeBrown={value:new T.Color(C.brown).multiplyScalar(C.brownGain)};
  material.uniforms.uTreeGrey={value:new T.Color(C.grey).multiplyScalar(C.greyGain)};
  style.extendMaterial(material,{
    vertex:shader=>'attribute vec4 treeAtlas; attribute float treePart; attribute vec2 treeFoliage; varying vec4 vTreeAtlas; varying float vTreePart; varying vec3 vTreeVariation; varying vec3 vTreeLeafColor; uniform vec3 uTreePalette[16];\n'+shader.replace('void main() {',`void main() {
      vTreeAtlas=treeAtlas; vTreePart=treePart;vTreeVariation=vec3(0.0,0.5,1.0);
      #ifdef USE_INSTANCING_COLOR
      vTreeVariation=instanceColor;
      #endif
      #ifdef USE_BATCHING_COLOR
      vTreeVariation=getBatchingColor(getIndirectIndex(gl_DrawID));
      #endif
      int palette=int(clamp(vTreeVariation.x,0.0,1.0)*3.0+0.5)*4;
      float tone=clamp(treeFoliage.x,0.0,3.0); int lo=int(floor(tone)); int hi=min(lo+1,3);
      vTreeLeafColor=mix(uTreePalette[palette+lo],uTreePalette[palette+hi],fract(tone))*treeFoliage.y*vTreeVariation.z;`),
    fragment:shader=>'varying vec4 vTreeAtlas; varying float vTreePart; varying vec3 vTreeVariation; varying vec3 vTreeLeafColor; uniform vec3 uTreeBrown; uniform vec3 uTreeGrey;\n'+shader
      .replace('uniform sampler2D uAlbedo;','uniform highp sampler2DArray uAlbedo;')
      // Hardware repeat and independent layer mipmaps match the source texture.
      // The depth pass samples the exact same UVs, layer and alpha silhouette.
      .replace('texture2D(uAlbedo, vUv)','texture(uAlbedo,vec3(vUv*vTreeAtlas.zw,vTreeAtlas.x))')
      .replace('texture2D(uNormal, vUvN)','texture2D(uNormal,vTreeAtlas.xy+fract(vUvN)*vTreeAtlas.zw)')
      .replace('vec3 albedo = tex.rgb * uColor;',`vec3 bark=tex.rgb*mix(uTreeBrown,uTreeGrey,vTreeVariation.y);
        vec3 leaf=vec3(dot(tex.rgb,vec3(.2126,.7152,.0722)));
        vec3 albedo=mix(bark,leaf,step(.5,vTreePart))*uColor;`)
      // Exactly the comparator's order: texture -> black-foot curve -> spatial
      // vertex palette -> lighting. Tinting before the curve washes out greens.
      .replace('albedo *= vCityColor.rgb;','albedo *= mix(vCityColor.rgb,vTreeLeafColor,step(.5,vTreePart));')
      // Cutout surfaces are opaque after alpha rejection. Fractional framebuffer
      // alpha incorrectly composites white page colour through every leaf edge.
      .replace('gl_FragColor = vec4(color, a);','gl_FragColor = vec4(color, 1.0);')
      .replace(/#ifdef TRES_BANDAS[\s\S]*?#endif/,'float lit=smoothstep(umbral - '+C.softness+',umbral + 0.65,nl);')
      .replace('vec3 luzColor = mix(uLuzColor, uInColor, dentro);','vec3 luzColor = mix(uLuzColor, uInColor, dentro)*'+C.sunGain+';')
  });material.userData.urbanTree=true;
}

export async function createUrbanTreePrototypes({loader,style,baseUrl,renderer}){
  const response=await fetch(new URL('tree-lods.json',baseUrl));if(!response.ok)throw new Error('Faltan LOD de árboles');const lods=await response.json();
  const models=[];
  for(const model of C.models){
    const gltf=await loader.loadAsync(new URL(model.file,baseUrl).href);let parts=flattened(gltf.scene);
    if(model.atlas){const mixed=parts[0];parts=splitAtlasTree(mixed);mixed.geometry.dispose();mixed.material.dispose();}
    else for(const part of parts)part.part=/trunk|tronc|bark/i.test(part.name)?'bark':'leaves';
    normalize(parts,1);
    if(model.crownRatio){const b=bounds(parts),width=Math.max(b.max.x-b.min.x,b.max.z-b.min.z);for(const p of parts)p.geometry.scale(model.crownRatio/width,1,model.crownRatio/width);}
    models.push({model,parts,gltf});
  }
  const all=models.flatMap(m=>m.parts),atlas=createTreeTextureAtlas(all,renderer);
  const source=new T.MeshStandardMaterial({color:'#ffffff',map:atlas.map,normalMap:atlas.normalMap,normalScale:new T.Vector2(.75,.75),vertexColors:true,alphaTest:.5,side:T.DoubleSide});
  const material=style.material(source,'urban-trees-atlas');source.dispose();addTreeVariationShader(style,material);
  const prototypes=new Map();
  for(const {model,parts,gltf}of models){
    const near=[],medium=[];
    for(const part of parts){
      const g=part.geometry,position=g.attributes.position,cell=atlas.cells.get(part.material.uuid),cells=[],types=[],colors=[];
      const foliage=part.part==='leaves'?foliageSamples(g,C.referenceHeight):new Float32Array(position.count*2);
      for(let i=0;i<position.count;i++){
        cells.push(...cell);types.push(part.part==='leaves'?1:0);
        colors.push(1,1,1);
      }
      g.setAttribute('treeAtlas',new T.Float32BufferAttribute(cells,4));g.setAttribute('treePart',new T.Float32BufferAttribute(types,1));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      g.setAttribute('treeFoliage',new T.Float32BufferAttribute(foliage,2));
      near.push(g);const lower=g.clone(),lod=lods[model.file]?.find(l=>l.name===part.name);if(lod)lower.setIndex(lod.indices);medium.push(lower);
    }
    const merge=geometries=>{const geometry=mergeGeometries(geometries);if(!geometry)throw new Error('Atributos de árbol incompatibles');geometry.computeBoundingBox();geometry.computeBoundingSphere();for(const g of geometries)g.dispose();return [{geometry,material,name:'tree-'+model.id}];};
    prototypes.set('tree:'+model.id,[merge(near),merge(medium),null]);
    gltf.scene.traverse(o=>{o.geometry?.dispose();});
  }
  const textures=new Set();for(const p of all){for(const value of Object.values(p.material))if(value?.isTexture)textures.add(value);p.material.dispose();}
  for(const t of textures){t.dispose();t.image?.close?.();}
  prototypes.urbanMaterial=material;prototypes.urbanAtlas=atlas;
  return prototypes;
}
