// Paquete para three.js: GLB + módulo cargador + reproductor de prueba + LEEME. ZIP sin dependencias.

export function threeModule() {
  return `// taller-three.js — carga un personaje exportado por Taller de Animación y reproduce sus animaciones.
// Uso:
//   import { cargarPersonaje } from './taller-three.js';
//   const p = await cargarPersonaje('./personaje.glb', escena);
//   p.reproducir('caminar');            // fundido de 0.25 s desde la que suene
//   en tu bucle: p.actualizar(delta);
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function cargarPersonaje(url, escena, { sombras = true } = {}) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const raiz = gltf.scene;
  raiz.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = sombras;
      o.receiveShadow = sombras;
      o.frustumCulled = false;
    }
  });
  escena?.add(raiz);
  const mezclador = new THREE.AnimationMixer(raiz);
  const acciones = {};
  for (const clip of gltf.animations) acciones[clip.name] = mezclador.clipAction(clip);
  let actual = null;
  return {
    raiz,
    mezclador,
    acciones,
    nombres: Object.keys(acciones),
    reproducir(nombre, { fundido = 0.25, bucle = true, velocidad = 1 } = {}) {
      const a = acciones[nombre];
      if (!a) throw new Error('No existe la animación ' + nombre + '. Hay: ' + Object.keys(acciones).join(', '));
      a.reset();
      a.setLoop(bucle ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !bucle;
      a.timeScale = velocidad;
      a.play();
      if (actual && actual !== a) actual.crossFadeTo(a, fundido, false);
      actual = a;
      return a;
    },
    parar() {
      mezclador.stopAllAction();
      actual = null;
    },
    actualizar(delta) {
      mezclador.update(delta);
    },
  };
}
`;
}

export function playerHTML(glbName, clipNames) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Reproductor — ${glbName}</title>
<style>
  html, body { margin: 0; height: 100%; background: #1d2026; color: #e6e9ef; font: 13px system-ui, sans-serif; overflow: hidden; }
  #ui { position: fixed; left: 12px; top: 12px; display: flex; gap: 6px; flex-wrap: wrap; max-width: 70vw; }
  button { background: #2a2f38; color: inherit; border: 1px solid #3a404c; border-radius: 5px; padding: 6px 10px; cursor: pointer; }
  button.on { border-color: #ff7a45; color: #ffd8c6; }
</style>
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
               "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/" } }
</script>
</head>
<body>
<div id="ui"></div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { cargarPersonaje } from './taller-three.js';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const escena = new THREE.Scene();
escena.background = new THREE.Color(0x1d2026);
const camara = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 100);
camara.position.set(2.4, 1.6, 3.4);
const orbit = new OrbitControls(camara, renderer.domElement);
orbit.target.set(0, 0.95, 0);
escena.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3328, 1.2));
const sol = new THREE.DirectionalLight(0xffffff, 2);
sol.position.set(3, 6, 4);
sol.castShadow = true;
escena.add(sol);
const suelo = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.3 }));
suelo.rotation.x = -Math.PI / 2;
suelo.receiveShadow = true;
escena.add(suelo, new THREE.GridHelper(20, 20, 0x56606e, 0x2c323b));
const p = await cargarPersonaje('./${glbName}', escena);
const ui = document.getElementById('ui');
for (const n of p.nombres) {
  const b = document.createElement('button');
  b.textContent = n;
  b.onclick = () => { p.reproducir(n); ui.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
  ui.appendChild(b);
}
if (p.nombres[0]) ui.firstChild.click();
const reloj = new THREE.Clock();
renderer.setAnimationLoop(() => { p.actualizar(reloj.getDelta()); orbit.update(); renderer.render(escena, camara); });
addEventListener('resize', () => { camara.aspect = innerWidth / innerHeight; camara.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
</script>
</body>
</html>
`;
}

export function readme(glbName, clipNames, charName) {
  return `# ${glbName}

Exportado con Taller de Animación para three.js (r180).

- Personaje: ${charName}
- Animaciones (${clipNames.length}): ${clipNames.join(', ')}
- Unidades: metros, Y arriba, el personaje mira hacia +Z.

## Probar

Sirve esta carpeta con cualquier servidor estático (por ejemplo \`npx serve\` o \`python -m http.server\`) y abre \`reproductor.html\`.

## Usar en tu proyecto

\`\`\`js
import { cargarPersonaje } from './taller-three.js';
const p = await cargarPersonaje('./${glbName}', escena);
p.reproducir('${clipNames[0] || 'animacion'}');
// en el bucle de render: p.actualizar(delta);
\`\`\`
`;
}

// ---------- ZIP (sin compresión) ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: [{name, data: Uint8Array|string}] → Blob zip */
export function makeZip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const data = typeof f.data === 'string' ? enc.encode(f.data) : new Uint8Array(f.data);
    const name = enc.encode(f.name);
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true); // UTF-8
    h.setUint16(8, 0, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
