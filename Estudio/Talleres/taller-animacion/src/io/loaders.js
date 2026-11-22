// Carga de GLB/GLTF/FBX desde archivos o URLs.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { FBXLoader as FBXLoaderEjes } from './FBXLoaderEjes.js';
import { BVHLoader } from 'three/addons/loaders/BVHLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { neutralizeHorseFace } from '../core/quadruped.js';

const gltf = new GLTFLoader();
// One shared source with Studio and the facial workshop; keep each host's THREE.
const fullSkinningPath = '/ecosystem/full-skinning.js';
const fullSkinningReady = import(/* @vite-ignore */ fullSkinningPath).then(m=>m.registerFullSkinning(gltf,THREE));
// Chromium's ImageBitmap decoder can reject valid large (4K) embedded PNGs: any GLB with an embedded image over 4 MB uses the HTML image decoder.
// Use the HTML image decoder only for this asset, preserving glTF UV/color setup.
gltf.register(parser=>{if(parser.json.images?.some(i=>(parser.json.bufferViews?.[i.bufferView]?.byteLength||0)>4e6))parser.textureLoader=new THREE.TextureLoader(parser.options.manager).setCrossOrigin(parser.options.crossOrigin).setRequestHeader(parser.options.requestHeader);return {name:'SPANSTORIES_LARGE_TEXTURES'};});
const draco = new DRACOLoader();
draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
gltf.setDRACOLoader(draco);
gltf.setMeshoptDecoder(MeshoptDecoder);
const fbx = new FBXLoader();
// Horse Animset Pro (3ds Max Biped): hinge curves keyed only on Z. The stock
// loader freezes them or writes NaN (mount/dismount), so these files use the
// corrected copy. Every other pack keeps the stock loader.
const fbxEjes = new FBXLoaderEjes();
export const usaLectorEjes = (name) => /jinete \(horse animset pro\)|(^|\/)animales\//i.test(String(name));
const bvh = new BVHLoader();

export function extOf(name) {
  return (name.split('.').pop() || '').toLowerCase();
}

/** Devuelve { root, animations, name } */
export async function loadModel(buffer, name) {
  const ext = extOf(name);
  if (ext === 'glb' || ext === 'gltf') {
    await fullSkinningReady;
    const data = ext === 'gltf' ? new TextDecoder().decode(buffer) : buffer;
    const g = await gltf.parseAsync(data, '');
    const root = g.scene || g.scenes[0];
    root.name = root.name || name;
    neutralizeHorseFace(root);
    return { root, animations: g.animations || [], name };
  }
  if (ext === 'fbx') {
    const root = (usaLectorEjes(name) ? fbxEjes : fbx).parse(buffer, '');
    return { root, animations: root.animations || [], name };
  }
  if (ext === 'bvh') {
    // BVH: solo esqueleto + un clip. La raíz agrupa la jerarquía de huesos para que se lea como un FBX sin malla.
    const { skeleton, clip } = bvh.parse(new TextDecoder().decode(buffer));
    const root = new THREE.Group();
    root.name = name;
    root.add(skeleton.bones[0]);
    clip.name = name.split('/').pop().replace(/\.[^.]+$/, '');
    return { root, animations: [clip], name };
  }
  throw new Error(`Formato no admitido: .${ext} (usa .glb, .gltf, .fbx o .bvh)`);
}

export async function loadModelURL(url, name = url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo leer ${url}`);
  return loadModel(await r.arrayBuffer(), name);
}

export function hasSkin(root) {
  let s = false;
  root.traverse((o) => {
    if (o.isSkinnedMesh) s = true;
  });
  return s;
}

export function hasMesh(root) {
  let s = false;
  root.traverse((o) => {
    if (o.isMesh) s = true;
  });
  return s;
}

/** Ajusta personajes a metros y de pie sobre el suelo (FBX en cm, etc.). */
export function normalizeCharacter(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;
      o.castShadow = true;
      if (o.isSkinnedMesh) {
        o.computeBoundingBox?.();
        const b = o.boundingBox ? o.boundingBox.clone().applyMatrix4(o.matrixWorld) : new THREE.Box3().setFromObject(o);
        box.union(b);
      } else box.union(new THREE.Box3().setFromObject(o));
    }
  });
  if (box.isEmpty()) return 1;
  // Z-arriba sin nodo que lo corrija (AccuRig/Tripo y otros FBX): el personaje está tumbado.
  // De pie, la profundidad (z) nunca supera con creces a la altura (y).
  const sz = box.getSize(new THREE.Vector3());
  if (sz.z > 2 * sz.y && sz.z > 0.6 * sz.x) {
    root.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    root.updateMatrixWorld(true);
    box.set(new THREE.Vector3(box.min.x, box.min.z, -box.max.y), new THREE.Vector3(box.max.x, box.max.z, -box.min.y));
  }
  const h = box.max.y - box.min.y;
  let s = 1;
  if (h > 20) s = 1.75 / h; // centímetros u otra escala
  else if (h < 0.2) s = 1.75 / h;
  if (s !== 1) {
    root.scale.multiplyScalar(s);
    root.updateMatrixWorld(true);
  }
  return s;
}
