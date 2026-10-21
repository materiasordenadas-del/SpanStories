import * as T from './three.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { disposeObject } from './ThreeResources.js';
import { crearMaterialToon, crearMaterialContorno, conNormalContorno } from './Luz25D.js';
import { PalomaBehavior, CLIPS } from './PalomaBehavior.mjs';
import { PalomaCollisions } from './PalomaCollisions.mjs';

// Animales del exterior de D00: un tigre que corre por la acera de enfrente,
// un conejo que salta por la acera del oeste y una paloma en la acera.
// Son modelos con esqueleto: el material toon de Luz25D no lleva skinning,
// así que se le inyecta aquí (relleno y contorno) sin tocar el motor común.
// NO son `movable`: así no se desplazan los índices guardados por lab.js.

const SKIN_PARS = '#include <skinning_pars_vertex>\n';
const SKIN_BODY = `
  vec3 transformed = position;
  vec3 objectNormal = normal;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>`;

function conSkinning(material) {
  material.vertexShader = SKIN_PARS + material.vertexShader
    .replace('vec4 p = vec4(position, 1.0);\n  vec3 n = normal;', `${SKIN_BODY}\n  vec4 p = vec4(transformed, 1.0);\n  vec3 n = objectNormal;`);
  return material;
}

function contornoConEsqueleto(mesh, material) {
  conNormalContorno(mesh.geometry);
  material.vertexShader = SKIN_PARS + material.vertexShader
    .replace('attribute vec3 outlineNormal;', 'attribute vec3 outlineNormal;')
    .replace('void main() {', `void main() {
  vec3 transformed = position;
  vec3 objectNormal = outlineNormal;
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>`)
    .replace('(m * vec4(position, 1.0))', '(m * vec4(transformed, 1.0))')
    .replace('r * outlineNormal', 'r * objectNormal');
  const hull = new T.SkinnedMesh(mesh.geometry, material);
  hull.bind(mesh.skeleton, mesh.bindMatrix);
  hull.frustumCulled = false; hull.raycast = () => {};
  mesh.parent.add(hull);
  return hull;
}

const loader = new GLTFLoader();

// Copia con esqueleto propio (mismo algoritmo que SkeletonUtils.clone): la
// geometría, los materiales y las texturas se comparten entre las copias.
function paralelo(a, b, fn) { fn(a, b); for (let i = 0; i < a.children.length; i++) paralelo(a.children[i], b.children[i], fn); }
function clonarConEsqueleto(fuente) {
  const deCopia = new Map(), aCopia = new Map(), copia = fuente.clone();
  paralelo(fuente, copia, (a, b) => { deCopia.set(b, a); aCopia.set(a, b); });
  copia.traverse(nodo => {
    if (!nodo.isSkinnedMesh) return;
    const origen = deCopia.get(nodo);
    nodo.skeleton = origen.skeleton.clone();
    nodo.bindMatrix.copy(origen.bindMatrix);
    nodo.skeleton.bones = origen.skeleton.bones.map(b => aCopia.get(b));
    nodo.bind(nodo.skeleton, nodo.bindMatrix);
  });
  return copia;
}

async function cargar(url, scope, { largo, alto, nivel = 'medio', cornea = true }) {
  const absolute = new URL(url, import.meta.url).href;
  const response = await fetch(absolute);
  if (!response.ok) throw new Error(`GLB ${response.status}: ${absolute}`);
  const gltf = await loader.parseAsync(await response.arrayBuffer(), new URL('.', absolute).href);
  if (scope.closed) { disposeObject(gltf.scene); throw new Error('Chunk retired during GLB load'); }
  scope.defer(() => disposeObject(gltf.scene));

  const materiales = new Map(), tintas = [];
  gltf.scene.traverse(object => {
    if (!object.isMesh) return;
    object.frustumCulled = false;
    object.castShadow = true; object.receiveShadow = false;
    const original = object.material;
    if (!materiales.has(original)) {
      const albedo = original.map || null;
      if (albedo) { albedo.anisotropy = 4; albedo.generateMipmaps = true; albedo.minFilter = T.LinearMipmapLinearFilter; }
      const toon = conSkinning(crearMaterialToon({
        color: albedo ? '#ffffff' : `#${original.color.getHexString()}`, albedo, doble: true, bandas: 3,
        transparente: original.transparent, opacidad: original.opacity,
      }));
      scope.own(toon);
      materiales.set(original, toon);
    }
    object.material = materiales.get(original);
    // Solo se perfila el cuerpo; la córnea/ojos transparentes no llevan trazo.
    if (object.isSkinnedMesh && !original.transparent) {
      const relleno = original.map ? '#8a6a4a' : `#${original.color.getHexString()}`;
      const tinta = scope.own(crearMaterialContorno(relleno, nivel));
      tintas.push([object, tinta]);
    }
  });
  const cascos = tintas.map(([mesh, tinta]) => contornoConEsqueleto(mesh, tinta));
  scope.defer(() => cascos.forEach(c => c.removeFromParent()));

  // Mide las palomas con las alas plegadas, no con la envergadura del reposo.
  const clipPaloma = gltf.animations.find(a => a.name === CLIPS.eat);
  const medirPaloma = clipPaloma ? new T.AnimationMixer(gltf.scene) : null;
  if (medirPaloma) { medirPaloma.clipAction(clipPaloma).play(); medirPaloma.update(0); }

  // Normaliza al tamaño real: el eje horizontal más largo es el «largo» del animal.
  const root = new T.Group(); root.add(gltf.scene);
  root.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new T.Vector3());
  const k = largo ? largo / Math.max(size.x, size.z) : alto / size.y;
  gltf.scene.scale.setScalar(k);
  root.updateMatrixWorld(true);
  const box2 = new T.Box3().setFromObject(gltf.scene);
  gltf.scene.position.y -= box2.min.y;
  const centro = box2.getCenter(new T.Vector3());
  gltf.scene.position.x -= centro.x; gltf.scene.position.z -= centro.z;
  // El largo del modelo puede estar en X o en Z: se alinea al eje +Z del grupo.
  const alongX = size.x > size.z;
  if (medirPaloma) { medirPaloma.stopAllAction(); medirPaloma.uncacheRoot(gltf.scene); }
  const pivote = new T.Group(); pivote.add(root);
  if (alongX) root.rotation.y = Math.PI / 2;
  const clip = gltf.animations.find(a => a.name === CLIPS.eat) || gltf.animations[0];
  const ejemplar = fuente => {
    const p = fuente || pivote;
    const escena = p.children[0].children[0];
    const mixer = new T.AnimationMixer(escena);
    const accion = mixer.clipAction(clip);
    accion.play();
    return { pivote: p, mixer, accion, clip, duracion: clip.duration, clips: gltf.animations, escalaModelo: k, giroModelo: root.rotation.y };
  };
  ejemplar.clonar = () => ejemplar(clonarConEsqueleto(pivote));
  return ejemplar;
}

const rand = (a, b) => a + Math.random() * (b - a);

export async function addExteriorAnimals({ scope, group, edge }) {
  // Separate bird volumes from the player's deliberately tall 2D colliders.
  // Keep mesh references so moving an object in the editor also moves its bounds.
  const obstaculos = [];
  group.traverse(mesh => {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.customDepthMaterial) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (material?.side === T.BackSide || material?.transparent) return;
    if (!['BoxGeometry', 'CylinderGeometry', 'BufferGeometry'].includes(mesh.geometry.type)) return;
    mesh.geometry.computeBoundingBox();
    obstaculos.push({ mesh, box: new T.Box3() });
  });
  const fachada = new T.Box3(new T.Vector3(-100, -2, -100), new T.Vector3(100, 12, edge + .18));
  const colisiones = new PalomaCollisions();
  const inversa = new T.Matrix4(), matriz = new T.Matrix4();
  const actualizarObstaculos = () => {
    group.updateWorldMatrix(true, true);
    inversa.copy(group.matrixWorld).invert();
    colisiones.boxes = [fachada];
    for (const { mesh, box } of obstaculos) {
      matriz.multiplyMatrices(inversa, mesh.matrixWorld);
      box.copy(mesh.geometry.boundingBox).applyMatrix4(matriz);
      // Pavement is handled by foot support; only raised solids block motion.
      if (box.max.y > .18 && box.max.z > edge && box.min.y < 10) colisiones.boxes.push(box);
    }
  };
  actualizarObstaculos();
  const base = '../assets/animales/';
  const [nuevoTigre, nuevoConejo, nuevaPaloma] = await Promise.all([
    cargar(`${base}running_tiger.glb`, scope, { largo: 2.1, nivel: 'medio' }),
    cargar(`${base}rabbit_rigged.glb`, scope, { largo: .5, nivel: 'fino' }),
    cargar(`${base}paloma_tres_animaciones.glb`, scope, { largo: .56, nivel: 'fino' }),
  ]);
  const tigre = nuevoTigre(), conejo = nuevoConejo();
  const palomas = [nuevaPaloma(), nuevaPaloma.clonar(), nuevaPaloma.clonar()];
  const animales = [tigre, conejo, ...palomas];
  for (const a of animales) { group.add(a.pivote); scope.defer(() => a.pivote.removeFromParent()); }
  tigre.pivote.name = 'Tigre'; conejo.pivote.name = 'Conejo';
  palomas.forEach((p, i) => { p.pivote.name = 'Paloma'; });

  // Persecución sobre el césped del oeste (tras el pórtico), lejos de la cámara:
  // una elipse recorrida a velocidad constante. El conejo va delante y el tigre
  // le sigue a 3 m por el mismo camino.
  const C = { x: -37, z: -3, rx: 8, rz: 4.5, v: 5.6, ventaja: 3 };
  const punto = th => [C.x + C.rx * Math.cos(th), C.z + C.rz * Math.sin(th)];
  const avance = th => Math.hypot(C.rx * Math.sin(th), C.rz * Math.cos(th));   // |dr/dθ|
  let thConejo = 0;
  let thTigre = -C.ventaja / avance(0);
  const colocar = (a, th, y0) => {
    const [x, z] = punto(th), dx = -C.rx * Math.sin(th), dz = C.rz * Math.cos(th);
    a.pivote.position.set(x, .006, z);
    a.pivote.rotation.y = Math.atan2(dx, dz);
  };
  tigre.accion.timeScale = 2;
  conejo.accion.timeScale = 2.4;
  colocar(conejo, thConejo); colocar(tigre, thTigre);

  // Las tres palomas conservan sus sitios, tamaño y materiales del aeropuerto.
  const sitios = [[-3.4, edge + 3.6, 2.4], [-5.4, edge + 4.4, 0.6], [-1.6, edge + 4.9, -1.2]];
  const desfases = [0, 3.3, 6.6];
  group.updateWorldMatrix(true, false);
  const pisoY = group.matrixWorld.elements[13];
  const escalaY = new T.Vector3().setFromMatrixScale(group.matrixWorld).y;
  const apoyar = r => {
    r.p.pivote.updateWorldMatrix(true, true);
    let dedosY = Infinity;
    for (const dedo of r.dedos) dedosY = Math.min(dedosY, dedo.matrixWorld.elements[13]);
    if (Number.isFinite(dedosY)) r.p.pivote.position.y += (pisoY + .005 - dedosY) / escalaY;
  };
  const humano = new T.Vector3();
  const movimientos = palomas.map((p, i) => {
    const [x, z, yaw] = sitios[i];
    p.accion.setLoop(T.LoopRepeat, Infinity);
    p.accion.time = desfases[i];
    p.pivote.position.set(x, 0, z); p.pivote.rotation.y = yaw;
    p.mixer.update(0);
    const dedos = [];
    p.pivote.traverse(n => {
      if (!n.isBone) return;
      if (/^[LR]_(?:frontFinger|leftFinger|rightFinger)/i.test(n.name)) dedos.push(n);
    });
    const r = { p, dedos };
    apoyar(r);
    const acciones = new Map(p.clips.map(c => [c.name, p.mixer.clipAction(c)]));
    for (const nombre of Object.values(CLIPS)) {
      if (!acciones.has(nombre)) throw new Error(`Paloma: falta animación ${nombre}`);
    }
    const posicionInicial = p.pivote.position.clone();
    const suelo = posicionInicial.y;
    let activa = p.accion;
    const adapter = {
      getPosition: () => p.pivote.position,
      getForward: () => ({ x: Math.cos(p.pivote.rotation.y + p.giroModelo), z: -Math.sin(p.pivote.rotation.y + p.giroModelo) }),
      setPosition: v => p.pivote.position.set(v.x, v.y, v.z),
      setVisible: visible => { p.pivote.visible = visible; },
      face: destino => {
        p.pivote.rotation.y = Math.atan2(-(destino.z - p.pivote.position.z), destino.x - p.pivote.position.x) - p.giroModelo;
      },
      play(nombre, loop, inicio = 0) {
        const siguiente = acciones.get(nombre);
        siguiente.reset().setLoop(loop ? T.LoopRepeat : T.LoopOnce, loop ? Infinity : 1);
        siguiente.clampWhenFinished = !loop;
        siguiente.time = inicio;
        siguiente.setEffectiveWeight(1).setEffectiveTimeScale(1).play();
        if (activa && activa !== siguiente) { activa.fadeOut(.15); siguiente.fadeIn(.15); }
        activa = siguiente; p.accion = siguiente;
      },
      update: dt => p.mixer.update(dt),
    };
    p.comportamiento = new PalomaBehavior(adapter, { walkDistance: .16 * p.escalaModelo, flightHeight: .65 * p.escalaModelo, collisions: colisiones });
    p.comportamiento.time = desfases[i];
    p.accion.time = desfases[i];
    p.mixer.update(0);
    // Destino en coordenadas del grupo exterior; y=0 corresponde a su suelo.
    p.volarA = destino => p.comportamiento.flyTo({ x: destino.x, y: (destino.y ?? 0) + suelo, z: destino.z });
    p.reponer = () => { p.pivote.rotation.y = yaw; p.comportamiento.reset(posicionInicial); };
    return r;
  });
  palomas.forEach((p, i) => { p.pivote.name = `Paloma ${i + 1}`; });

  return {
    animals: { tigre, conejo, palomas },
    update(dt, camera, outside) {
      for (const a of animales) a.pivote.visible = outside;
      if (!outside) return;
      actualizarObstaculos();
      thConejo += C.v * dt / avance(thConejo);
      thTigre += C.v * dt / avance(thTigre);
      colocar(conejo, thConejo); colocar(tigre, thTigre);
      tigre.mixer.update(dt); conejo.mixer.update(dt);
      camera.getWorldPosition(humano);
      group.worldToLocal(humano);
      humano.y = 0; // El jugador camina sobre este mismo suelo exterior.
      for (const r of movimientos) {
        r.p.comportamiento.update(dt, humano);
        const c = r.p.comportamiento;
        if (c.state === 'eat' || (['short', 'land'].includes(c.state) && (c.time < 2 || c.time >= 4.7))) apoyar(r);
      }
    },
  };
}
