import * as T from './three.js';
import { DIMENSIONS } from './routes.js';

// Vista previa de la sala vecina: en vez de mantener la sala real detrás de la
// puerta, se cuelga un cuadro (foto horneada con herramientas/capturar-portales)
// tomado desde 3 m antes de la puerta. Es un solo plano con una textura: sin
// geometría, sin luces y sin lógica. La sala real solo existe al cruzar.
export const PORTAL_CAPTURE = { width: 1280, height: 800, fov: 60, back: 3, eyeY: 1.62 };

/** Geometría del cuadro visto desde `viewer` hacia `target` (metadatos de routes.js), o null si no son vecinas por puerta. */
export function portalGeometry(viewer, target) {
  const [vx, vz] = viewer.center, [tx, tz] = target.center, vo = viewer.openings || {}, to = target.openings || {};
  const lados = [
    ['east', 'west', [1, 0], vx + viewer.width / 2 === tx - target.width / 2],
    ['west', 'east', [-1, 0], vx - viewer.width / 2 === tx + target.width / 2],
    ['south', 'north', [0, 1], vz + viewer.depth / 2 === tz - target.depth / 2],
    ['north', 'south', [0, -1], vz - viewer.depth / 2 === tz + target.depth / 2],
  ];
  for (const [side, other, dir, touching] of lados) {
    if (!touching || vo[side] === undefined || to[other] === undefined) continue;
    const door = side === 'east' ? [vx + viewer.width / 2, vz + vo.east] : side === 'west' ? [vx - viewer.width / 2, vz + vo.west]
      : side === 'south' ? [vx + vo.south, vz + viewer.depth / 2] : [vx + vo.north, vz - viewer.depth / 2];
    const eye = [door[0] - dir[0] * PORTAL_CAPTURE.back, door[1] - dir[1] * PORTAL_CAPTURE.back];
    const far = dir[0] ? (dir[0] > 0 ? tx + target.width / 2 - eye[0] : eye[0] - (tx - target.width / 2))
      : (dir[1] > 0 ? tz + target.depth / 2 - eye[1] : eye[1] - (tz - target.depth / 2));
    return { side, door, dir, eye, far };
  }
  return null;
}

export const portalUrl = (viewerId, targetId) => new URL(`../assets/portales/${viewerId}-${targetId}.webp`, import.meta.url).href;

const VERT = /* glsl */`
varying vec3 vMundo;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vMundo = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */`
uniform sampler2D uFoto; uniform mat4 uCamara;
varying vec3 vMundo;
void main() {
  vec4 c = uCamara * vec4(vMundo, 1.0);
  if (c.w <= 0.0) discard;
  vec2 uv = c.xy / c.w * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
  gl_FragColor = vec4(texture2D(uFoto, uv).rgb, 1.0);
  #include <colorspace_fragment>
}`;

/** Caja interior de `target` (coordenadas locales, root en su centro) que proyecta la foto desde el ojo de la captura:
 *  suelo, techo y paredes salen con la perspectiva correcta y, al no haber tramo vacío, no quedan huecos junto a la puerta.
 *  Devuelve { mesh, promesa } o null si no son vecinas por puerta. */
export function crearCuadroPortal(scope, viewer, target) {
  const g = portalGeometry(viewer, target);
  if (!g) return null;
  const cam = new T.PerspectiveCamera(PORTAL_CAPTURE.fov, PORTAL_CAPTURE.width / PORTAL_CAPTURE.height, PORTAL_CAPTURE.back + .45, 80);
  cam.position.set(g.eye[0], PORTAL_CAPTURE.eyeY, g.eye[1]); cam.lookAt(g.eye[0] + g.dir[0], PORTAL_CAPTURE.eyeY, g.eye[1] + g.dir[1]);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const material = scope.own(new T.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: T.BackSide,
    uniforms: { uFoto: { value: null }, uCamara: { value: new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse) } },
  }));
  // Un poco más adentro que las caras de la sala real, para ganarles el z-fight.
  const inset = .1, w = target.width - 2 * inset, d = target.depth - 2 * inset, h = DIMENSIONS.ceiling - .01;
  const mesh = new T.Mesh(scope.own(new T.BoxGeometry(w, h, d)), material);
  mesh.position.y = h / 2 + .005;
  mesh.name = `${target.id}:vista-desde-${viewer.id}`; mesh.visible = false; mesh.raycast = () => {};
  const promesa = new Promise((resolve, reject) => new T.TextureLoader().load(portalUrl(viewer.id, target.id), texture => {
    texture.colorSpace = T.SRGBColorSpace; texture.anisotropy = 4;
    if (scope.closed) { texture.dispose(); return reject(new Error('cerrado')); }
    scope.own(texture); material.uniforms.uFoto.value = texture; resolve(mesh);
  }, undefined, () => reject(new Error(`sin imagen ${viewer.id}-${target.id}`))));
  return { mesh, promesa };
}
