import * as T from './three.js';

// Polished porcelain: a planar mirror of the objects on REFLECT_LAYER, laid as
// a faint, slightly blurred overlay on the floor. Only the tagged room props
// are rendered into the mirror (no sky, street or shell), so it stays cheap and
// never shows the outside. The reflection is the only "shine": the floor keeps
// its toon albedo underneath (ESTILO.md §3, exception asked for the D00 hall).
export const REFLECT_LAYER = 3;
// Panel switch (Contorno-style): every glossy floor shows or hides together.
const floors = new Set(); let glossOn = true;
export function setGlossyFloors(on) { glossOn = on; for (const m of floors) m.visible = on; }

const VERT = /* glsl */`
uniform mat4 uTexMatrix;
varying vec4 vRefl; varying vec3 vWorld;
void main() {
  vRefl = uTexMatrix * vec4(position, 1.0);
  vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */`
uniform sampler2D tReflect; uniform sampler2D tDepth; uniform float uStrength; uniform vec2 uTexel;
uniform mat4 uMirrorView; uniform float uNear; uniform float uFar; uniform float uFalloff;
varying vec4 vRefl; varying vec3 vWorld;
float linearDepth(float d) { float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  vec2 uv = vRefl.xy / vRefl.w;
  // How far the reflected point lies beyond the floor, seen from the mirror
  // camera: feet reflect clearly, the tops of tall things fade out.
  float gap = max(linearDepth(texture2D(tDepth, uv).x) + (uMirrorView * vec4(vWorld, 1.0)).z, 0.0);
  float fade = exp(-gap / uFalloff);
  vec4 r = texture2D(tReflect, uv) * .4;
  r += texture2D(tReflect, uv + vec2(uTexel.x, 0.0) * 3.5) * .15;
  r += texture2D(tReflect, uv - vec2(uTexel.x, 0.0) * 3.5) * .15;
  r += texture2D(tReflect, uv + vec2(0.0, uTexel.y) * 5.0) * .15;
  r += texture2D(tReflect, uv - vec2(0.0, uTexel.y) * 5.0) * .15;
  // Light panels stay visible from far above: the porcelain's highlights.
  vec3 c = r.rgb / max(r.a, 1e-3);
  fade = max(fade, .7 * smoothstep(.8, .9, min(c.r, c.b / .8)));
  // Same strength over the whole floor (no view-angle falloff).
  gl_FragColor = vec4(r.rgb / max(r.a, 1e-3), r.a * fade * uStrength);
  #include <colorspace_fragment>
}`;

export function createGlossyFloor(scope, { width, depth, strength = .3, falloff = 3.5, resolution = .5 }) {
  const target = scope.own(new T.WebGLRenderTarget(256, 256, { depthTexture: new T.DepthTexture(256, 256) }));
  const texMatrix = new T.Matrix4();
  const material = scope.own(new T.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    uniforms: { tReflect: { value: target.texture }, tDepth: { value: target.depthTexture }, uMirrorView: { value: new T.Matrix4() },
      uNear: { value: .1 }, uFar: { value: 100 }, uFalloff: { value: falloff }, uStrength: { value: strength }, uTexMatrix: { value: texMatrix }, uTexel: { value: new T.Vector2(1 / 256, 1 / 256) } },
  }));
  const mesh = new T.Mesh(scope.own(new T.PlaneGeometry(width, depth)), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = glossOn; floors.add(mesh); scope.defer(() => floors.delete(mesh));
  const mirror = new T.PerspectiveCamera(); mirror.layers.set(REFLECT_LAYER);
  const plane = new T.Vector3(), normal = new T.Vector3(), eye = new T.Vector3(), look = new T.Vector3(), rotation = new T.Matrix4();
  const size = new T.Vector2(), clear = new T.Color();
  let busy = false;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (busy || camera === mirror) return;
    plane.setFromMatrixPosition(mesh.matrixWorld); eye.setFromMatrixPosition(camera.matrixWorld);
    rotation.extractRotation(mesh.matrixWorld); normal.set(0, 0, 1).applyMatrix4(rotation);
    if (eye.clone().sub(plane).dot(normal) < 0) return;
    // Mirror the eye and its gaze through the floor plane.
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
    const w = Math.max(64, Math.round(size.x * resolution)), h = Math.max(64, Math.round(size.y * resolution));
    if (target.width !== w || target.height !== h) { target.setSize(w, h); material.uniforms.uTexel.value.set(1 / w, 1 / h); }
    // Render only the room props into the mirror, over a transparent clear.
    busy = true;
    const previous = renderer.getRenderTarget(), background = scene.background, shadows = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(clear); const alpha = renderer.getClearAlpha();
    scene.background = null; renderer.shadowMap.autoUpdate = false; mesh.visible = false;
    renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(scene, mirror);
    renderer.setRenderTarget(previous); renderer.setClearColor(clear, alpha);
    scene.background = background; renderer.shadowMap.autoUpdate = shadows; mesh.visible = glossOn;
    busy = false;
  };
  return mesh;
}
