// Opt-in preservation of authored skins. THREE is supplied by each host so the
// Studio and both workshops keep using their own existing Three.js instance.
const installedLoaders = new WeakSet();
const installedMeshes = new WeakSet();
const installedMaterials = new WeakSet();
const backTextures = new WeakMap();
const enabled = root => root?.userData?.spanstoriesPreserveModel === true;

function preserveTextureCoordinates(mesh) {
  if (!mesh.isMesh) return;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const channels=[...new Set(materials.flatMap(m=>Object.values(m||{}).filter(v=>v?.isTexture).map(t=>t.channel||0)))];
  if (!channels.some(c=>c>3)) return;
  if (channels.length>4) throw new Error('Este material necesita más de cuatro canales UV simultáneos.');
  const mapping=new Map(channels.filter(c=>c<4).map(c=>[c,c]));
  const free=[0,1,2,3].filter(c=>!mapping.has(c));
  for(const c of channels.filter(c=>c>3))mapping.set(c,free.shift());
  const attributes=mesh.geometry.attributes;
  const replacements=[...mapping].filter(([from,to])=>from!==to).map(([from,to])=>{
    const attr=attributes[from===0?'uv':`uv${from}`]||attributes[`texcoord_${from}`];
    if(!attr)throw new Error(`Falta el canal UV ${from} del modelo.`);
    return [to===0?'uv':`uv${to}`,attr];
  });
  mesh.geometry=mesh.geometry.clone();
  for(const [name,attr]of replacements)mesh.geometry.setAttribute(name,attr);
  const copies=materials.map(material=>{
    const copy=material.clone();
    if(backTextures.has(material))backTextures.set(copy,backTextures.get(material));
    for(const [name,texture]of Object.entries(material))if(texture?.isTexture&&mapping.get(texture.channel||0)!==(texture.channel||0)){
      copy[name]=texture.clone();copy[name].channel=mapping.get(texture.channel||0);
    }
    return copy;
  });
  mesh.material=Array.isArray(mesh.material)?copies:copies[0];
}

function patchMaterial(material) {
  if (!material || installedMaterials.has(material)) return;
  installedMaterials.add(material);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  const backTexture=backTextures.get(material);
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    if(backTexture){
      shader.uniforms.spanstoriesBackMap={value:backTexture};
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <common>','#include <common>\nuniform sampler2D spanstoriesBackMap;')
        .replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
if (!gl_FrontFacing) diffuseColor.rgb = texture2D(spanstoriesBackMap, vMapUv).rgb;
#endif`);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
#ifdef USE_SKINNING
attribute vec4 joints_1;
attribute vec4 weights_1;
#endif`)
      .replace('#include <skinbase_vertex>', `#include <skinbase_vertex>
#ifdef USE_SKINNING
mat4 fullBoneX = getBoneMatrix(joints_1.x);
mat4 fullBoneY = getBoneMatrix(joints_1.y);
mat4 fullBoneZ = getBoneMatrix(joints_1.z);
mat4 fullBoneW = getBoneMatrix(joints_1.w);
#endif`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
#ifdef USE_SKINNING
vec4 fullExtra = weights_1.x * fullBoneX * skinVertex
               + weights_1.y * fullBoneY * skinVertex
               + weights_1.z * fullBoneZ * skinVertex
               + weights_1.w * fullBoneW * skinVertex;
transformed += (bindMatrixInverse * fullExtra).xyz;
#endif`)
      .replace('#include <skinnormal_vertex>', `#ifdef USE_SKINNING
mat4 fullNormalSkin = skinWeight.x * boneMatX + skinWeight.y * boneMatY
                   + skinWeight.z * boneMatZ + skinWeight.w * boneMatW
                   + weights_1.x * fullBoneX + weights_1.y * fullBoneY
                   + weights_1.z * fullBoneZ + weights_1.w * fullBoneW;
fullNormalSkin = bindMatrixInverse * fullNormalSkin * bindMatrix;
objectNormal = vec4(fullNormalSkin * vec4(objectNormal, 0.0)).xyz;
#ifdef USE_TANGENT
objectTangent = vec4(fullNormalSkin * vec4(objectTangent, 0.0)).xyz;
#endif
#endif`);
  };
  material.customProgramCacheKey = function () {
    return previousKey.call(this) + ':spanstories-full-skin-v1:' + !!backTexture;
  };
  material.needsUpdate = true;
}

export function installFullSkinning(root, T) {
  if (!enabled(root)) return;
  root.traverse(mesh => {
    preserveTextureCoordinates(mesh);
    if(mesh.isMesh)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(backTextures.has(material))patchMaterial(material);
    const a = mesh.geometry?.attributes;
    if (!mesh.isSkinnedMesh || !a?.joints_1 || !a?.weights_1 || installedMeshes.has(mesh)) return;
    installedMeshes.add(mesh);
    const base = new T.Vector3(), point = new T.Vector3(), matrix = new T.Matrix4();
    mesh.applyBoneTransform = function (index, target) {
      const attrs = this.geometry.attributes;
      base.copy(target).applyMatrix4(this.bindMatrix);
      target.set(0, 0, 0);
      for (const [indices, weights] of [[attrs.skinIndex, attrs.skinWeight], [attrs.joints_1, attrs.weights_1]]) {
        for (let c = 0; c < 4; c++) {
          const component = ['getX', 'getY', 'getZ', 'getW'][c];
          const weight = weights[component](index);
          if (!weight) continue;
          const b = indices[component](index);
          matrix.multiplyMatrices(this.skeleton.bones[b].matrixWorld, this.skeleton.boneInverses[b]);
          target.addScaledVector(point.copy(base).applyMatrix4(matrix), weight);
        }
      }
      return target.applyMatrix4(this.bindMatrixInverse);
    };
    // Older Three.js releases used this method name for CPU skinning.
    if ('boneTransform' in mesh) mesh.boneTransform = mesh.applyBoneTransform;
    mesh.userData.spanstoriesFullSkin = true;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) patchMaterial(material);
    mesh.customDepthMaterial = new T.MeshDepthMaterial({depthPacking: T.RGBADepthPacking});
    mesh.customDistanceMaterial = new T.MeshDistanceMaterial();
    patchMaterial(mesh.customDepthMaterial);
    patchMaterial(mesh.customDistanceMaterial);
    // Cached bounds may have been computed by the loader with four influences.
    mesh.boundingBox = null;
    mesh.boundingSphere = null;
  });
}

export function registerFullSkinning(loader, T) {
  if (installedLoaders.has(loader)) return loader;
  installedLoaders.add(loader);
  loader.register(parser => {
    const weights = new Map();
    return {
      name: 'SPANSTORIES_PRESERVE_SKIN',
      async beforeRoot() {
        if (!parser.json.scenes?.some(scene => scene.extras?.spanstoriesPreserveModel === true)) return;
        // GLTFLoader normalizes WEIGHTS_0 in place before afterRoot. Preserve
        // accessor data BEFORE mesh creation, rather than trying to undo it.
        const indices = new Set();
        for (const mesh of parser.json.meshes || []) for (const p of mesh.primitives) {
          if (p.attributes.JOINTS_1 !== undefined) indices.add(p.attributes.WEIGHTS_0);
        }
        await Promise.all([...indices].map(async i => weights.set(i, (await parser.getDependency('accessor', i)).clone())));
      },
      async afterRoot(gltf) {
        for (const root of gltf.scenes || [gltf.scene]) {
          if (!enabled(root)) continue;
          const pending=[];
          root.traverse(mesh => {
            if(mesh.isMesh)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
              const index=material?.userData?.spanstoriesBackTexture;
              if(Number.isInteger(index))pending.push(parser.getDependency('texture',index).then(texture=>{
                texture.colorSpace=T.SRGBColorSpace;backTextures.set(material,texture);
              }));
            }
            if (!mesh.isSkinnedMesh) return;
            const assoc = parser.associations.get(mesh);
            const primitive = parser.json.meshes?.[assoc?.meshes]?.primitives?.[assoc?.primitives ?? 0];
            const original = weights.get(primitive?.attributes.WEIGHTS_0);
            if (original) mesh.geometry.setAttribute('skinWeight', original.clone());
          });
          await Promise.all(pending);
          installFullSkinning(root, T);
        }
      }
    };
  });
  return loader;
}
