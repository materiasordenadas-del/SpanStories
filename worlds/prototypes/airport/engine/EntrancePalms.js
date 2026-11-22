import * as T from './three.js';
import { GLBAssetSource } from './GLBAssetSource.js';
import { crearMaterialToon, crearMaterialContorno, contornoDe, profundidadRecortada, conContornoAlfa } from './Luz25D.js';

// Palmera del frente (assets/palma-frontal.glb, modelo de Sketchfab en cm con
// la orientación del FBX): las mallas se hornean a metros, con la altura total
// normalizada a 1 y el pie en y = 0. Así el viento (por fracción de altura) y
// la escala siguen el mismo esquema que la palmera anterior. Tronco y copa
// comparten el mismo atlas; el contorno cartoon solo va en el tronco, porque
// la copa son láminas con recorte alfa.
const ALTURA_FINAL = .66;   // fracción de la altura real del modelo (copa bajo el soffit de 7,2 m)

export async function addEntrancePalms({ registry, scope, kit, group, positions }) {
  const source = new GLBAssetSource(registry);
  // Module-relative absolute URL: the loader resolves against document.baseURI,
  // which differs between the viewer page and dev previews.
  const url = new URL('../assets/palma-frontal.glb', import.meta.url).href;
  const model = await source.instantiateStatic(url, scope);
  model.updateMatrixWorld(true);
  const partes = [];
  model.traverse(object => { if (object.isMesh) partes.push(object); });
  if (partes.length < 2) throw new Error('La palmera GLB debe traer tronco y hojas');
  const baked = partes.map(mesh => scope.own(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)));
  const total = new T.Box3();
  for (const g of baked) { g.computeBoundingBox(); total.union(g.boundingBox); }
  const alto = total.max.y - total.min.y;
  for (const g of baked) { g.translate(0, -total.min.y, 0); g.scale(1 / alto, 1 / alto, 1 / alto); g.computeBoundingBox(); }
  const original = partes[0].material;
  const wind = { uTiempo: { value: 0 }, uViento: { value: 0 } };
  // Wind: sway only the crown (top of the height), with a slow gust plus a
  // per-leaf flutter. uViento fades 0↔1 so it only runs outside.
  const sway = `
  {
    float h = smoothstep(.78, 1.0, position.y);
    float r = length(position.xz);
    float fase = modelMatrix[3].x * .7 + modelMatrix[3].z * .3;
    float racha = sin(uTiempo * 1.1 + fase) * .6 + sin(uTiempo * 2.3 + fase * 1.7) * .4;
    float aleteo = sin(uTiempo * 5.5 + position.x * 40.0 + position.z * 30.0 + fase);
    float a = uViento * h * (racha * .014 + aleteo * .004 * (.3 + r * 8.0));
    p.x += a; p.z += a * .5; p.y -= abs(a) * .3 * r * 8.0;
  }`;
  const crearMaterial = conTrazoAlfa => {
    const m = scope.own(crearMaterialToon({ color: '#ffffff', albedo: original.map, corteAlfa: original.alphaTest || .3, doble: true }));
    Object.assign(m.uniforms, wind);
    m.vertexShader = 'uniform float uTiempo; uniform float uViento;\n' + m.vertexShader
      .replace('vec4 p = vec4(position, 1.0);', 'vec4 p = vec4(position, 1.0);' + sway);
    if (conTrazoAlfa) conContornoAlfa(m, '#356f31');   // copa: trazo cartoon en el borde de cada fronda
    m.needsUpdate = true;
    return m;
  };
  const materialCopa = crearMaterial(true), materialTronco = crearMaterial(false);
  const ink = scope.own(crearMaterialContorno('#8a6a4a', 'fino'));
  const esTronco = partes.map(mesh => /stem|trunk|tronco/i.test(mesh.name) || /stem|trunk|tronco/i.test(mesh.parent?.name || ''));
  const trees = positions.map(([x, z], index) => {
    const tree = new T.Group(); tree.name = 'Palmera 3D';
    partes.forEach((_, i) => {
      const mesh = new T.Mesh(baked[i], esTronco[i] ? materialTronco : materialCopa);
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (esTronco[i]) { const hull = contornoDe(mesh, ink); hull.castShadow = false; }
      else mesh.customDepthMaterial = scope.own(profundidadRecortada(original.map, original.alphaTest || .3));
      tree.add(mesh);
    });
    tree.position.set(x, .64, z - .12);
    tree.rotation.y = index === 0 ? -.5 : .65;
    tree.scale.setScalar(alto * ALTURA_FINAL);
    group.add(tree); scope.defer(() => tree.removeFromParent());
    return tree;
  });
  // Always called; `outside` decides whether the wind blows (eased in/out).
  trees.update = (dt, outside) => {
    const target = outside ? 1 : 0, u = wind.uViento;
    u.value += (target - u.value) * Math.min(1, dt * 2);
    if (u.value > .001) wind.uTiempo.value += dt;
  };
  return trees;
}
