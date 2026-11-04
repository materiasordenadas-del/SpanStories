import * as T from './three.js';
import { luz, crearMaterialToon, crearMaterialContorno, conNormalContorno, contornoDe } from './Luz25D.js';
import { adaptarSuperficie } from './CitySurface.js';
import { finishSteps, budgetSteps } from './CityWorkQueue.js';
import { PackedUniforms, syncRenderVariants } from './CityRenderOptimization.js';
import { lightingActivity, specializeLightingShader } from './CityShaderActivity.js';
import { categoriaMaterial, CATEGORIAS } from './StyleShader.js';

// Ajustes de importación: albedo local y motor de luz compartido, sin PBR.
export class CityStyle {
  constructor({estilos=null}={}) { this.materials = new Map(); this.outlines = new Map(); this.owned = new Set();this.packedUniforms=new PackedUniforms(luz.uniformes);this.activity=lightingActivity(luz.uniformes);this.lightingShaders=new WeakMap();this.vertexShaders=new WeakMap();this.outlineShaders=new WeakMap();this.estilos=estilos;this.soltarEstilos=estilos?.composicionFija?null:estilos?.alCambiar(()=>this.recomponer()); }
  compilar(material) {
    const original=this.lightingShaders.get(material);if(!original)return;
    if(this.estilos)Object.assign(material.uniforms,this.estilos.actual.uniformes);
    const shader=this.estilos?this.estilos.componer(original,material):original;
    const vertex=this.vertexShaders.get(material);if(vertex)material.vertexShader=this.estilos?this.estilos.componerVertice(vertex,material):vertex;
    material.fragmentShader=specializeLightingShader(shader,this.activity);material.needsUpdate=true;syncRenderVariants(material);
  }
  compilarContorno(material) {
    const base=this.outlineShaders.get(material);if(!base)return;
    const profile=this.estilos?.actual;
    if(profile)material.uniforms.uEstiloTrazo=profile.uniformes.uEstiloTrazo;
    material.vertexShader=profile?.contorno?profile.contorno(base):base;
    material.needsUpdate=true;syncRenderVariants(material);
  }
  recomponer(){for(const material of this.materials.values())this.compilar(material);for(const material of this.outlines.values())this.compilarContorno(material);}
  fragmentoBase(material){return this.lightingShaders.get(material)||material.fragmentShader;}
  update(){
    this.packedUniforms.update();const activity=lightingActivity(luz.uniformes);
    if(activity.lamps===this.activity.lamps&&activity.rooms===this.activity.rooms)return;
    this.activity=activity;
    for(const material of this.owned){const shader=this.lightingShaders.get(material);if(!shader)continue;
      this.compilar(material);}
  }
  extendMaterial(material,{vertex,fragment}){
    if(vertex)this.vertexShaders.set(material,vertex(this.vertexShaders.get(material)||material.vertexShader));
    const original=this.lightingShaders.get(material)||material.fragmentShader;
    const shader=fragment?fragment(original):original;this.lightingShaders.set(material,shader);
    this.compilar(material);
    return material;
  }
  material(source, key = source.uuid, skinned = false, graph = null, surfaceTextures = {}) {
    // Índices de textura de GLTF son locales a cada archivo, no identidades globales.
    key += ':' + (source.map?.userData?.ssTexture || source.map?.uuid || '-') + ':' + (source.normalMap?.userData?.ssTexture || source.normalMap?.uuid || '-');
    key += (skinned ? ':skin' : ':static') + (source.vertexColors ? ':color' : '');
    const categoria=categoriaMaterial(source,source.name||key);key+=':'+categoria;
    if(graph)key+=':graph:'+JSON.stringify(graph);
    if (this.materials.has(key)) return this.materials.get(key);
    const m = crearMaterialToon({ color: source.color || '#ffffff', albedo: source.map,
      normal: source.normalMap, fuerzaNormal: source.normalScale?.x ?? 1, bandas: 3,
      opacidad: source.opacity, corteAlfa: source.alphaTest,
      transparente: source.transparent, doble: source.side === T.DoubleSide,
      repetir: source.map?.repeat.toArray() || [1, 1], repetirNormal: source.normalMap?.repeat.toArray() || [1, 1] });
    Object.assign(m.uniforms,this.packedUniforms.uniforms);
    m.vertexColors = Boolean(source.vertexColors) && !graph;
    if (m.vertexColors) {
      m.vertexShader = 'varying vec4 vCityColor;\n' + m.vertexShader.replace('void main() {', 'void main() {\n#ifdef USE_COLOR_ALPHA\nvCityColor = color;\n#else\nvCityColor = vec4(color, 1.0);\n#endif');
      m.fragmentShader = 'varying vec4 vCityColor;\n' + m.fragmentShader.replace('vec3 N = normalize(vNor);', 'albedo *= vCityColor.rgb;\na *= vCityColor.a;\nvec3 N = normalize(vNor);');
    }
    // Conservar UV1 y KHR_texture_transform del aula/GLB, incluidos atlases.
    for (const texture of [source.map, source.normalMap]) texture?.updateMatrix();
    m.uniforms.cityAlbedoUV = {value:source.map?.matrix.clone() || new T.Matrix3()};
    m.uniforms.cityNormalUV = {value:source.normalMap?.matrix.clone() || new T.Matrix3()};
    const albedoUV = source.map?.channel ? 'uv' + source.map.channel : 'uv';
    const normalUV = source.normalMap?.channel ? 'uv' + source.normalMap.channel : 'uv';
    const channels = [...new Set([albedoUV, normalUV])].filter(name=>name !== 'uv');
    m.vertexShader = channels.map(name=>'attribute vec2 '+name+';').join('\n') + '\nuniform mat3 cityAlbedoUV; uniform mat3 cityNormalUV;\n' +
      m.vertexShader.replace('vUv = uv * uRepetir; vUvN = uv * uRepNormal;', `vUv = (cityAlbedoUV * vec3(${albedoUV},1.0)).xy; vUvN = (cityNormalUV * vec3(${normalUV},1.0)).xy;`);
    // Inversa transpuesta: conservar la luz con escalas no uniformes del GLB.
    m.vertexShader = m.vertexShader.replace('n = mat3(instanceMatrix) * n;', 'n = cityNormal(mat3(instanceMatrix), n);')
      .replace('mat3(modelMatrix) * n', 'cityNormal(mat3(modelMatrix), n)');
    m.vertexShader = `vec3 cityNormal(mat3 m, vec3 n) { vec3 a=cross(m[1],m[2]), b=cross(m[2],m[0]), c=cross(m[0],m[1]); float d=dot(m[0],a); return mat3(a,b,c)*n / (abs(d)>1e-12 ? d : 1.0); }\n` + m.vertexShader;
    if (skinned) {
      m.vertexShader = '#include <common>\n#include <morphtarget_pars_vertex>\n#include <skinning_pars_vertex>\n' + m.vertexShader;
      m.vertexShader = m.vertexShader.replace('vec4 p = vec4(position, 1.0);\n  vec3 n = normal;',
        '#include <beginnormal_vertex>\n#include <morphinstance_vertex>\n#include <morphnormal_vertex>\n#include <skinbase_vertex>\n#include <skinnormal_vertex>\n#include <begin_vertex>\n#include <morphtarget_vertex>\n#include <skinning_vertex>\nvec4 p = vec4(transformed, 1.0);\nvec3 n = objectNormal;');
    }
    m.userData.sourceName = source.name;
    if(this.estilos?.composicionFija){m.defaultAttributeValues.poolSurface=[-1];m.transparent=false;m.blending=T.NoBlending;}
    m.userData.esPersonaje=Boolean(skinned);
    m.userData.categoria=categoria;m.uniforms.uEstiloCategoria={value:CATEGORIAS[categoria]};
    adaptarSuperficie(m,graph,surfaceTextures);
    // BatchedMesh transforms each original piece without baking its local UV/noise coordinates.
    m.vertexShader = '#include <batching_pars_vertex>\n' + m.vertexShader.replace('#ifdef USE_INSTANCING',
      '#include <batching_vertex>\n#ifdef USE_BATCHING\np = batchingMatrix * p;\nn = cityNormal(mat3(batchingMatrix), n);\n#endif\n#ifdef USE_INSTANCING');
    this.vertexShaders.set(m,m.vertexShader);this.lightingShaders.set(m,m.fragmentShader);this.compilar(m);
    this.materials.set(key, m); this.owned.add(m); return m;
  }
  outline(material) {
    const key = material.userData.colorBase.toArray().join(',');
    if (!this.outlines.has(key)) {
      const m = crearMaterialContorno(material.userData.colorBase, 'fino');
      m.vertexShader = '#include <batching_pars_vertex>\n' + m.vertexShader.replace('mat4 m = modelMatrix;',
        '#include <batching_vertex>\nmat4 m = modelMatrix;\n#ifdef USE_BATCHING\nm = modelMatrix * batchingMatrix;\n#endif');
      this.outlineShaders.set(m,m.vertexShader);this.compilarContorno(m);
      this.outlines.set(key, m); this.owned.add(m);
    }
    return this.outlines.get(key);
  }
  geometry(geometry) {
    const offline = geometry.getAttribute('_outline_normal');
    if (offline) geometry.setAttribute('outlineNormal', offline);
    else conNormalContorno(geometry); // solo derivados añadidos sin atributo preparado
    return geometry;
  }
  adapt(root, gltf = null) {
    return finishSteps(this.adaptSteps(root,gltf));
  }
  adaptAsync(root,gltf=null,options={}) {
    return budgetSteps(this.adaptSteps(root,gltf),options);
  }
  *adaptSteps(root, gltf = null) {
    const meshes = []; root.traverse(o => { if (o.isMesh && !o.userData.cityOutline) meshes.push(o); });
    for (const o of meshes) {
      const surface=o.geometry.getAttribute('_surface')||o.geometry.getAttribute('surface');
      if(this.estilos?.composicionFija&&surface)o.geometry.setAttribute('poolSurface',surface);
      const association = gltf?.parser.associations.get(o);
      const primitive = gltf?.parser.json.meshes?.[association?.meshes]?.primitives?.[association?.primitives ?? 0];
      const extras = primitive?.extras || {};
      o.userData.geometryKey = extras.ssGeometry || `${o.userData.ssGeometry || o.geometry.uuid}:${association?.primitives ?? 0}`;
      const src = Array.isArray(o.material) ? o.material : [o.material];
      o.material = src.map((m, i) => this.material(m, (extras.ssMaterial || m.userData.ssMaterial || m.uuid) + ':' + i, o.isSkinnedMesh || Boolean(o.morphTargetInfluences),o.userData.surfaceGraph,o.userData.surfaceTextures));
      if (!Array.isArray(src) || o.material.length === 1) o.material = o.material[0];
      if (!o.isSkinnedMesh && !o.morphTargetInfluences && !Array.isArray(o.material) && o.geometry.getAttribute('normal')) {
        this.geometry(o.geometry);
        // Pavimentos y bases conservan el contrato sin contorno.
        let ancestor = o; while (ancestor && !ancestor.userData.ssType) ancestor = ancestor.parent;
        const type = ancestor?.userData.ssType || '';
        if(/ground|terrain|road|street|suelo|calle|pavimento|viario|panot|asfalto|bordillo|bici_pintura|marcas|paso_peaton/i.test(type+' '+o.name))this.treeShadowReceiver?.(o.material);
        if (!o.userData.ss_noOutline&&!/ground|terrain|road|street|suelo|calle|pavimento|viario|panot|asfalto|bordillo|bici_pintura|marcas|paso_peaton/i.test(type + ' ' + o.name)) {
          const outline = contornoDe(o, this.outline(o.material)); outline.userData.cityOutline = true; outline.userData.ignorarSeleccion = true;
        }
      }
      o.castShadow = false; o.receiveShadow = false;
      yield;
    }
    return root;
  }
  dispose() { this.soltarEstilos?.();for (const m of this.owned) m.dispose(); this.owned.clear(); this.materials.clear(); this.outlines.clear(); }
  prune(retained) {
    for (const cache of [this.materials,this.outlines]) for (const [key,m] of cache)
      if (!retained.has(m)) {cache.delete(key);if(this.owned.delete(m))m.dispose();}
  }
}
