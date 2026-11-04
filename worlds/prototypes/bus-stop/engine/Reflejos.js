import * as T from './three.js';
import { luz, entorno } from './Luz25D.js';

/* ── Reflejos ─────────────────────────────────────────────────────────────
   Tres técnicas, de la más barata a la más cara:
     · Vidrio (ventanas, puertas, copas, botellas, vitrinas): refleja el cubo
       de entorno capturado (interior de la sala o la calle, según el lado
       desde el que se mira) con fresnel y dos destellos diagonales pintados.
     · Metal y loza (Luz25D, `reflejo`): el mismo cubo, sobre el toon.
     · Espejos (baños, detrás de la barra) y suelo encerado: espejo plano real,
       la escena se vuelve a dibujar desde la cámara reflejada.
   Un solo interruptor (`setReflejos`) apaga los espejos planos. */

let reflejando = false;          // evita espejos dentro de espejos
let activos = true;
const planos = new Set(), vidrios = new Set();
export function setReflejos(on) { activos = on; for (const m of planos) m.userData.actualizar?.(); }
export function reflejosActivos() { return activos; }

/* ── Vidrio ───────────────────────────────────────────────────────────── */

const VIDRIO_VERT = /* glsl */`
varying vec3 vPos; varying vec3 vNor; varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 p = vec4(position, 1.0); vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  vec4 w = modelMatrix * p; vPos = w.xyz; vNor = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const VIDRIO_FRAG = /* glsl */`
uniform samplerCube uEnvIn; uniform samplerCube uEnvOut;
uniform vec3 uFuera; uniform vec3 uTinte; uniform vec3 uAmb; uniform float uOpacidad; uniform float uFuerza; uniform float uBrillos;
uniform float uEsmerilado;
varying vec3 vPos; varying vec3 vNor; varying vec2 vUv;
void main() {
  vec3 N = normalize(vNor);
  vec3 V = normalize(vPos - cameraPosition);
  if (dot(N, V) > 0.0) N = -N;                       // lámina de dos caras: mira al espectador
  vec3 R = reflect(V, N);
  // Desde fuera (lado de uFuera) refleja la calle; desde dentro, la sala.
  float fuera = step(0.001, dot(cameraPosition - vPos, uFuera));
  vec3 env = mix(textureCube(uEnvIn, R, uEsmerilado).rgb, textureCube(uEnvOut, R, uEsmerilado).rgb, fuera);
  float cosT = clamp(dot(-V, N), 0.0, 1.0);
  float fr = 0.05 + 0.95 * pow(1.0 - cosT, 5.0);
  float refl = clamp(uFuerza * (0.32 + 1.5 * fr), 0.0, 0.96);
  // Destellos pintados: dos bandas diagonales nítidas, más fuertes arriba.
  float d = vUv.x * 0.55 + vUv.y;
  float b1 = 1.0 - smoothstep(0.0, 0.05, abs(d - 0.62));
  float b2 = 1.0 - smoothstep(0.0, 0.018, abs(d - 0.8));
  float brillo = (b1 * 0.32 + b2 * 0.55) * uBrillos * mix(0.4, 1.0, vUv.y);
  vec3 color = mix(uTinte, env, refl) + vec3(brillo);
  float a = clamp(mix(uOpacidad, 1.0, refl * 0.9) + brillo, 0.0, 1.0);
  gl_FragColor = vec4(color * uAmb, a);
  #include <colorspace_fragment>
}`;

/** Vidrio reflectante.  `fuera`: normal (mundo) que apunta a la calle en los
 *  vidrios de fachada; null para vidrio interior (copas, vitrinas, puertas). */
export function crearVidrio({ tinte = '#cfe6ee', opacidad = .12, fuerza = 1, brillos = 1, fuera = null, esmerilado = 0 } = {}) {
  const m = new T.ShaderMaterial({
    vertexShader: VIDRIO_VERT, fragmentShader: VIDRIO_FRAG, transparent: true, depthWrite: false, side: T.DoubleSide,
    uniforms: {
      uEnvIn: entorno.uEnvIn, uEnvOut: entorno.uEnvOut,
      uFuera: { value: fuera ? new T.Vector3(...fuera) : new T.Vector3() }, uTinte: { value: new T.Color(tinte) },
      uAmb: { value: new T.Color(1, 1, 1) }, uOpacidad: { value: opacidad }, uFuerza: { value: fuerza }, uBrillos: { value: brillos },
      uEsmerilado: { value: esmerilado },
    },
  });
  m.name = 'vidrio'; m.userData.sinTrazo = true; m.userData.vidrio = true;
  luz.alCambiar(A => m.uniforms.uAmb.value.set(A.tintes.vidrio).lerp(new T.Color(1, 1, 1), .55));
  return m;
}
export function registrarVidrio(mesh) { vidrios.add(mesh); return mesh; }

/* ── Espejo plano (baños, barra) ──────────────────────────────────────── */

const ESPEJO_VERT = /* glsl */`
uniform mat4 uTexMatrix; varying vec4 vRefl; varying vec2 vUv;
void main() { vUv = uv; vRefl = uTexMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const ESPEJO_FRAG = /* glsl */`
uniform sampler2D tReflejo; uniform vec3 uTinte; uniform float uBrillos; uniform float uActivo; uniform vec3 uApagado;
varying vec4 vRefl; varying vec2 vUv;
void main() {
  vec3 c = texture2DProj(tReflejo, vRefl).rgb * uTinte;
  c = mix(uApagado, c, uActivo);
  float d = vUv.x * 0.5 + vUv.y;
  float b = (1.0 - smoothstep(0.0, 0.03, abs(d - 0.55))) * 0.10 + (1.0 - smoothstep(0.0, 0.012, abs(d - 0.7))) * 0.16;
  // viñeta muy leve en el canto: el azogue envejecido de un espejo de trattoria
  vec2 e = min(vUv, 1.0 - vUv); float canto = smoothstep(0.0, 0.04, min(e.x, e.y));
  c = c * mix(0.82, 1.0, canto) + b * uBrillos;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

/** Espejo real (escena completa, recorte oblicuo en el plano).  La cara +z de
 *  la malla es la que refleja. */
export function crearEspejo(ancho, alto, { tinte = '#e9eef0', resolucion = .55, brillos = 1 } = {}) {
  const rt = new T.WebGLRenderTarget(256, 256, { samples: 2 });
  rt.texture.colorSpace = T.SRGBColorSpace;
  const texMatrix = new T.Matrix4();
  const material = new T.ShaderMaterial({
    vertexShader: ESPEJO_VERT, fragmentShader: ESPEJO_FRAG,
    uniforms: { tReflejo: { value: rt.texture }, uTexMatrix: { value: texMatrix }, uTinte: { value: new T.Color(tinte) },
      uBrillos: { value: brillos }, uActivo: { value: 1 }, uApagado: { value: new T.Color('#aebcc2') } },
  });
  material.userData.sinTrazo = true;
  const mesh = new T.Mesh(new T.PlaneGeometry(ancho, alto), material);
  mesh.name = 'espejo';
  const cam = new T.PerspectiveCamera();
  const plano = new T.Plane(), normal = new T.Vector3(), posEsp = new T.Vector3(), posCam = new T.Vector3(),
    rot = new T.Matrix4(), mirar = new T.Vector3(), vista = new T.Vector3(), objetivo = new T.Vector3(), clip = new T.Vector4(), q = new T.Vector4();
  const tam = new T.Vector2();
  mesh.userData.actualizar = () => { material.uniforms.uActivo.value = activos ? 1 : 0; };
  planos.add(mesh);
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (reflejando || !activos) return;
    posEsp.setFromMatrixPosition(mesh.matrixWorld); posCam.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(mesh.matrixWorld); normal.set(0, 0, 1).applyMatrix4(rot);
    vista.subVectors(posEsp, posCam);
    if (vista.dot(normal) > 0) return;
    vista.reflect(normal).negate().add(posEsp);
    rot.extractRotation(camera.matrixWorld);
    mirar.set(0, 0, -1).applyMatrix4(rot).add(posCam);
    objetivo.subVectors(posEsp, mirar).reflect(normal).negate().add(posEsp);
    cam.position.copy(vista); cam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal); cam.lookAt(objetivo);
    cam.far = camera.far; cam.near = camera.near; cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    texMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse).multiply(mesh.matrixWorld);
    // Recorte oblicuo: lo que queda detrás del espejo no aparece en el reflejo.
    plano.setFromNormalAndCoplanarPoint(normal, posEsp).applyMatrix4(cam.matrixWorldInverse);
    clip.set(plano.normal.x, plano.normal.y, plano.normal.z, plano.constant);
    const P = cam.projectionMatrix.elements;
    q.x = (Math.sign(clip.x) + P[8]) / P[0]; q.y = (Math.sign(clip.y) + P[9]) / P[5]; q.z = -1; q.w = (1 + P[10]) / P[14];
    clip.multiplyScalar(2 / clip.dot(q));
    P[2] = clip.x; P[6] = clip.y; P[10] = clip.z + 1 - .003; P[14] = clip.w;
    renderer.getDrawingBufferSize(tam);
    const w = Math.max(128, Math.round(tam.x * resolucion)), h = Math.max(128, Math.round(tam.y * resolucion));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    reflejando = true;
    const previo = renderer.getRenderTarget(), sombras = renderer.shadowMap.autoUpdate;
    mesh.visible = false; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
    renderer.setRenderTarget(previo); renderer.shadowMap.autoUpdate = sombras; mesh.visible = true;
    reflejando = false;
  };
  return mesh;
}

/* ── Suelo encerado (port de GlossyFloor del aeropuerto) ───────────────── */

const SUELO_VERT = /* glsl */`
uniform mat4 uTexMatrix; varying vec4 vRefl; varying vec3 vWorld;
void main() {
  vRefl = uTexMatrix * vec4(position, 1.0);
  vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SUELO_FRAG = /* glsl */`
uniform sampler2D tReflect; uniform sampler2D tDepth; uniform float uStrength; uniform vec2 uTexel;
uniform mat4 uMirrorView; uniform float uNear; uniform float uFar; uniform float uFalloff; uniform vec4 uRect;
varying vec4 vRefl; varying vec3 vWorld;
float linearDepth(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  if (vWorld.x < uRect.x || vWorld.x > uRect.z || vWorld.z < uRect.y || vWorld.z > uRect.w) discard;
  vec2 uv = vRefl.xy / vRefl.w;
  float gap = max(linearDepth(texture2D(tDepth, uv).x) + (uMirrorView * vec4(vWorld, 1.0)).z, 0.0);
  float fade = exp(-gap / uFalloff);
  vec4 r = texture2D(tReflect, uv) * .4;
  r += texture2D(tReflect, uv + vec2(uTexel.x, 0.0) * 2.5) * .15;
  r += texture2D(tReflect, uv - vec2(uTexel.x, 0.0) * 2.5) * .15;
  r += texture2D(tReflect, uv + vec2(0.0, uTexel.y) * 6.0) * .15;
  r += texture2D(tReflect, uv - vec2(0.0, uTexel.y) * 6.0) * .15;
  vec3 c = r.rgb / max(r.a, 1e-3);
  // las lámparas y ventanas encendidas se ven lejos: los brillos del encerado
  fade = max(fade, .8 * smoothstep(.82, .95, max(c.r, max(c.g, c.b))));
  gl_FragColor = vec4(c, r.a * fade * uStrength);
  #include <colorspace_fragment>
}`;

/** Espejo tenue sobre un suelo: plano de ancho × fondo, centrado en su posición.
 *  `rect` recorta (mundo) para suelos en L. */
export function crearSueloBrillante({ ancho, fondo, fuerza = .3, caida = 1.6, resolucion = .5, rect = [-1e5, -1e5, 1e5, 1e5] }) {
  const target = new T.WebGLRenderTarget(256, 256, { depthTexture: new T.DepthTexture(256, 256) });
  target.texture.colorSpace = T.SRGBColorSpace;
  const texMatrix = new T.Matrix4();
  const material = new T.ShaderMaterial({
    vertexShader: SUELO_VERT, fragmentShader: SUELO_FRAG, transparent: true, depthWrite: false,
    uniforms: { tReflect: { value: target.texture }, tDepth: { value: target.depthTexture }, uMirrorView: { value: new T.Matrix4() },
      uNear: { value: .1 }, uFar: { value: 100 }, uFalloff: { value: caida }, uStrength: { value: fuerza }, uTexMatrix: { value: texMatrix },
      uTexel: { value: new T.Vector2(1 / 256, 1 / 256) }, uRect: { value: new T.Vector4(...rect) } },
  });
  material.userData.sinTrazo = true;
  const mesh = new T.Mesh(new T.PlaneGeometry(ancho, fondo), material);
  mesh.rotation.x = -Math.PI / 2; mesh.renderOrder = 2; mesh.name = 'suelo-encerado';
  mesh.userData.actualizar = () => { mesh.visible = activos; };
  planos.add(mesh);
  const mirror = new T.PerspectiveCamera();
  const plane = new T.Vector3(), normal = new T.Vector3(), eye = new T.Vector3(), look = new T.Vector3(), rotation = new T.Matrix4();
  const size = new T.Vector2(), clear = new T.Color();
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (reflejando) return;
    plane.setFromMatrixPosition(mesh.matrixWorld); eye.setFromMatrixPosition(camera.matrixWorld);
    rotation.extractRotation(mesh.matrixWorld); normal.set(0, 0, 1).applyMatrix4(rotation);
    if (eye.clone().sub(plane).dot(normal) < 0) return;
    const view = plane.clone().sub(eye).reflect(normal).negate().add(plane);
    rotation.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rotation).add(eye);
    const target3 = plane.clone().sub(look).reflect(normal).negate().add(plane);
    mirror.position.copy(view); mirror.up.set(0, 1, 0).applyMatrix4(rotation).reflect(normal); mirror.lookAt(target3);
    mirror.near = camera.near; mirror.far = camera.far; mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(camera.projectionMatrix);
    const u = material.uniforms; u.uMirrorView.value.copy(mirror.matrixWorldInverse); u.uNear.value = camera.near; u.uFar.value = camera.far;
    texMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1)
      .multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse).multiply(mesh.matrixWorld);
    renderer.getDrawingBufferSize(size);
    const w = Math.max(64, Math.round(size.x * resolucion)), h = Math.max(64, Math.round(size.y * resolucion));
    if (target.width !== w || target.height !== h) { target.setSize(w, h); u.uTexel.value.set(1 / w, 1 / h); }
    reflejando = true;
    const previous = renderer.getRenderTarget(), background = scene.background, shadows = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(clear); const alpha = renderer.getClearAlpha();
    scene.background = null; renderer.shadowMap.autoUpdate = false; mesh.visible = false;
    renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(scene, mirror);
    renderer.setRenderTarget(previous); renderer.setClearColor(clear, alpha);
    scene.background = background; renderer.shadowMap.autoUpdate = shadows; mesh.visible = activos;
    reflejando = false;
  };
  return mesh;
}

/* ── Captura del entorno (cubos) ──────────────────────────────────────── */

const cubos = {};
/** Captura el cubo interior (desde `dentro`) y el exterior (desde `fuera`).
 *  Se repite al cambiar de ambiente: de noche el vidrio refleja las lámparas. */
export function capturarEntorno(renderer, scene, { dentro, fuera, tam = 256 }) {
  for (const clave of ['in', 'out']) cubos[clave] ??= new T.WebGLCubeRenderTarget(tam, { generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter, type: T.HalfFloatType });
  entorno.uEnvIn.value = entorno.neutro; entorno.uEnvOut.value = entorno.neutro;
  const ocultos = [];
  scene.traverse(o => { if (o.visible && (o.material?.userData?.vidrio || planos.has(o))) { o.visible = false; ocultos.push(o); } });
  reflejando = true;
  for (const [clave, punto] of [['in', dentro], ['out', fuera]]) {
    const cc = new T.CubeCamera(.05, 80, cubos[clave]);
    cc.position.set(...punto); scene.add(cc); cc.update(renderer, scene); scene.remove(cc);
  }
  reflejando = false;
  for (const o of ocultos) o.visible = true;
  entorno.uEnvIn.value = cubos.in.texture; entorno.uEnvOut.value = cubos.out.texture;
}
