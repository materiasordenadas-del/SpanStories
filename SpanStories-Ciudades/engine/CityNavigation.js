import * as T from './three.js';

// Adapted from hotel/engine/PrimeraPersona.js (yaw, directional movement and
// axis sliding) and airport/engine/PlayerController.js (circle/AABB collision).
// The player owns no city meshes: collision metadata survives batching/culling.
const MODES = new Set(['editor', 'first', 'third']);
const COMPONENTS = ['x', 'y', 'z'];
const component = (point, axis) => point?.[axis] ?? point?.[COMPONENTS.indexOf(axis)];
const boxOf = value => value?.bounds || value?.box || value;
const inputTarget = value => !!value?.closest?.('input,textarea,select,button,[contenteditable="true"],[role="textbox"]');

export function collidesAt(position, obstacles, { radius = .32, height = 1.72 } = {}) {
  for (const obstacle of obstacles || []) {
    if (obstacle?.enabled === false || obstacle?.visible === false) continue;
    const box = boxOf(obstacle);
    if (!box?.min || !box?.max) continue;
    const minY = component(box.min, 'y'), maxY = component(box.max, 'y');
    if (Number.isFinite(minY) && minY >= position.y + height) continue;
    if (Number.isFinite(maxY) && maxY <= position.y + .04) continue;
    const x = T.MathUtils.clamp(position.x, component(box.min, 'x'), component(box.max, 'x'));
    const z = T.MathUtils.clamp(position.z, component(box.min, 'z'), component(box.max, 'z'));
    if ((position.x - x) ** 2 + (position.z - z) ** 2 < radius ** 2) return true;
  }
  return false;
}

/** Mutates feet position; small substeps prevent crossing thin walls. */
export function moveWithCollisions(position, dx, dz, {
  bounds, colliders = [], ground = () => position.y, radius = .32,
  height = 1.72, maxStepHeight = .65,
} = {}) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * .45)));
  const previous = position.clone(), proposal = position.clone();
  for (let step = 0; step < steps; step++) {
    for (const [axis, delta] of [['x', dx / steps], ['z', dz / steps]]) {
      if (!delta) continue;
      proposal.copy(position); proposal[axis] += delta;
      const bound = boxOf(bounds);
      if (bound?.min && bound?.max && (proposal[axis] < component(bound.min, axis) + radius || proposal[axis] > component(bound.max, axis) - radius)) continue;
      const floor = ground(proposal.x, proposal.z);
      if (Number.isFinite(floor)) {
        if (floor - position.y > maxStepHeight) continue;
        proposal.y = floor;
      }
      const obstacles = typeof colliders === 'function' ? colliders(proposal) : colliders;
      if (!collidesAt(proposal, obstacles, { radius, height })) position.copy(proposal);
    }
  }
  return previous.distanceToSquared(position) > 1e-12;
}

/** Editor orbit + mutually exclusive first/third person controls. */
export function crearNavegacionCiudad({
  camera, canvas, target = new T.Vector3(), scene = null, spawn = [0, 0, 0],
  bounds = null, colliders = () => [], ground = () => spawn[1], avatar = null,
  onMode = () => {}, changed = () => {}, speed = 4.8, radius = .32,
  eventRoot = globalThis.window, documentRoot = globalThis.document,
} = {}) {
  if (!camera || !canvas) throw new Error('Navigation requires camera and canvas');
  let mode = 'editor', editorEnabled = true, yaw = 0, pitch = 0, followDistance = 5;
  let pointer = null, disposed = false, avatarRoot = null, mixer = null, walkAction = null, idleAction = null, activeAction = null;
  let cityBounds = bounds, spawnPoint = [...spawn], editorSnapshot = null;
  const position = new T.Vector3(...spawn), keys = new Set(), listeners = [];
  const direction = new T.Vector3(), offset = new T.Vector3(), desired = new T.Vector3(), aim = new T.Vector3();
  const spherical = new T.Spherical(), ray = new T.Ray(), hit = new T.Vector3(), collisionBox = new T.Box3();
  const avatarCarrier = new T.Group(); avatarCarrier.name = 'SharedCharacterController';
  avatarCarrier.userData.navigationAvatar = true; avatarCarrier.visible = false;
  scene?.add(avatarCarrier);
  const listen = (object, name, fn, options) => { if (!object?.addEventListener) return; object.addEventListener(name, fn, options); listeners.push(() => object.removeEventListener(name, fn, options)); };
  const locked = () => documentRoot?.pointerLockElement === canvas;
  const clearKeys = () => { keys.clear(); pointer = null; };
  function syncAngles() {
    camera.getWorldDirection(direction);
    yaw = Math.atan2(-direction.x, -direction.z);
    pitch = Math.asin(T.MathUtils.clamp(direction.y, -1, 1));
  }
  function look(dx, dy) {
    yaw -= dx * .0024; pitch = T.MathUtils.clamp(pitch - dy * .0024, -1.2, 1.2);
    // Pointer events only update intent. The frame loop places the camera once,
    // using the same follow interpolation and collision query as walking.
  }
  function orbit(dx, dy, pan = false) {
    offset.copy(camera.position).sub(target);
    if (pan) {
      const distance = offset.length(), scale = distance * .002;
      direction.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(-dx * scale);
      desired.set(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(dy * scale);
      direction.add(desired); target.add(direction); camera.position.add(direction);
    } else {
      spherical.setFromVector3(offset); spherical.theta -= dx * .004; spherical.phi -= dy * .004;
      spherical.phi = T.MathUtils.clamp(spherical.phi, .04, Math.PI - .04);
      camera.position.copy(target).add(offset.setFromSpherical(spherical));
    }
    camera.lookAt(target); changed();
  }
  function cameraDistance(point,obstacles){
    direction.copy(point).sub(aim);const distance=direction.length();direction.normalize();ray.set(aim,direction);let allowed=distance;
    for(const obstacle of obstacles||[]){
      const box=boxOf(obstacle);if(!box?.min||!box?.max||obstacle.enabled===false||obstacle.visible===false)continue;
      if(!box.isBox3){collisionBox.min.set(component(box.min,'x'),component(box.min,'y'),component(box.min,'z'));collisionBox.max.set(component(box.max,'x'),component(box.max,'y'),component(box.max,'z'));}
      if(ray.intersectBox(box.isBox3?box:collisionBox,hit))allowed=Math.min(allowed,Math.max(.45,aim.distanceTo(hit)-.2));
    }
    return allowed;
  }
  function placeCamera(dt) {
    if (mode === 'editor') return;
    const floor = ground(position.x, position.z);
    if (Number.isFinite(floor) && Math.abs(floor - position.y) <= .65) position.y = floor;
    avatarCarrier.position.copy(position);
    if (mode === 'first') {
      camera.position.copy(position); camera.position.y += 1.66;
      direction.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      target.copy(camera.position).add(direction); camera.lookAt(target); return;
    }
    aim.copy(position); aim.y += 1.3;
    desired.set(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(followDistance).add(aim);
    const obstacles = typeof colliders === 'function' ? colliders(position,followDistance+radius) : colliders;
    const allowed=cameraDistance(desired,obstacles);
    desired.copy(aim).addScaledVector(direction, allowed);
    const cameraFloor = ground(desired.x, desired.z); if (Number.isFinite(cameraFloor)) desired.y = Math.max(desired.y, cameraFloor + .35);
    camera.position.lerp(desired, dt ? 1 - Math.exp(-12 * dt) : 1);
    // A smoothed path can cross a corner even when its destination is clear.
    // Clip the actual position too, using the same spatial candidates.
    const actualDistance=camera.position.distanceTo(aim),actualAllowed=cameraDistance(camera.position,obstacles);
    if(actualAllowed<actualDistance)camera.position.copy(aim).addScaledVector(direction,actualAllowed);
    target.copy(aim); camera.lookAt(target);
  }
  function setMode(next) {
    if (!MODES.has(next)) throw new Error(`Unknown navigation mode: ${next}`);
    if (next === mode) return;
    clearKeys();
    if (locked()) documentRoot.exitPointerLock?.();
    if (mode === 'editor') { editorSnapshot = { position: camera.position.clone(), target: target.clone() }; syncAngles(); }
    mode = next; avatarCarrier.visible = next === 'third';
    canvas.style.cursor = next === 'editor' ? '' : 'grab';
    if (next === 'editor' && editorSnapshot) { camera.position.copy(editorSnapshot.position); target.copy(editorSnapshot.target); camera.lookAt(target); }
    else { if (next === 'third') pitch = -.24; placeCamera(0); }
    onMode(next); changed();
  }
  function setAvatar(root, animations = []) {
    mixer?.stopAllAction(); if (mixer && avatarRoot) mixer.uncacheRoot(avatarRoot);
    avatarCarrier.clear(); avatarRoot = root; mixer = null; walkAction = idleAction = activeAction = null;
    if (!root) return;
    // Carrier controls travel; the imported rig remains intact under a scale wrapper.
    const wrapper = new T.Group(); wrapper.name = 'SamuelScale'; wrapper.add(root);
    root.updateMatrixWorld(true); const box = new T.Box3().setFromObject(root), size = box.getSize(new T.Vector3());
    if (size.y > 0) {
      wrapper.scale.setScalar(1.72 / size.y);
      wrapper.position.set(-(box.min.x + box.max.x) * .5 * wrapper.scale.x, -box.min.y * wrapper.scale.y, -(box.min.z + box.max.z) * .5 * wrapper.scale.z);
    }
    avatarCarrier.add(wrapper);
    const walk = animations.find(clip => /^Walking$/i.test(clip.name)) || animations.find(clip => /walk/i.test(clip.name));
    const idle = animations.find(clip => /^(Idle|restpose)$/i.test(clip.name));
    if (walk || idle) {
      mixer = new T.AnimationMixer(root);
      // Reuse the existing walk clip in-place: horizontal hip/root translations
      // stay at their first value; rotations and vertical foot motion are preserved.
      const inPlace = clip => {
        const copy = clip.clone();
        for (const track of copy.tracks) if (/(hips|root).*\.position$/i.test(track.name) && track.getValueSize() === 3) {
          for (let i = 3; i < track.values.length; i += 3) { track.values[i] = track.values[0]; track.values[i + 2] = track.values[2]; }
        }
        return copy;
      };
      if (walk) walkAction = mixer.clipAction(inPlace(walk));
      if (idle) idleAction = mixer.clipAction(inPlace(idle));
    }
    avatarCarrier.position.copy(position); avatarCarrier.visible = mode === 'third'; changed();
  }
  function animateAvatar(moving, dt) {
    const action = moving ? walkAction : idleAction;
    if (action && action !== activeAction) { activeAction?.fadeOut(.15); action.reset().fadeIn(.15).play(); activeAction = action; }
    if (!action && activeAction) activeAction.paused = !moving;
    mixer?.update(dt);
  }
  function update(dt) {
    if (disposed || mode === 'editor') return false;
    const seconds = T.MathUtils.clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    let moved = false;
    if (!inputTarget(documentRoot?.activeElement)) {
      const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const side = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      offset.set(-Math.sin(yaw) * forward + Math.cos(yaw) * side, 0, -Math.cos(yaw) * forward - Math.sin(yaw) * side);
      if (offset.lengthSq()) {
        offset.normalize().multiplyScalar(speed * seconds * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1.65 : 1));
        moved = moveWithCollisions(position, offset.x, offset.z, { bounds: cityBounds, colliders, ground, radius });
        if (moved) avatarCarrier.rotation.y = Math.atan2(offset.x, offset.z);
      }
    } else keys.clear();
    if (mode === 'third') animateAvatar(moved, seconds);
    placeCamera(seconds); if (moved) changed(); return moved;
  }
  function focus(root) {
    if (mode !== 'editor' || !root) return;
    const box = root.isBox3 ? root : new T.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new T.Vector3()), size = box.getSize(new T.Vector3());
    offset.copy(camera.position).sub(target).normalize(); if (!offset.lengthSq()) offset.set(.6, .5, .6).normalize();
    const distance = Math.max(size.x, size.y, size.z, 2) / (2 * Math.tan(T.MathUtils.degToRad(camera.fov || 40) / 2)) * 1.4;
    target.copy(center); camera.position.copy(center).addScaledVector(offset, distance); camera.lookAt(target); changed();
  }
  listen(eventRoot, 'keydown', event => {
    if (mode === 'editor' || inputTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Escape') { setMode('editor'); return; }
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right)|Shift(Left|Right))$/.test(event.code)) { keys.add(event.code); event.preventDefault?.(); }
  });
  listen(eventRoot, 'keyup', event => keys.delete(event.code));
  listen(eventRoot, 'blur', clearKeys);
  listen(documentRoot, 'visibilitychange', () => { if (documentRoot.hidden) clearKeys(); });
  listen(documentRoot, 'pointerlockchange', clearKeys);
  listen(canvas, 'contextmenu', event => event.preventDefault());
  listen(canvas, 'pointerdown', event => {
    if (mode === 'editor' && (!editorEnabled || !(event.button === 1 || event.button === 2 || event.altKey))) return;
    pointer = { x: event.clientX, y: event.clientY, pan: event.button === 1 || event.shiftKey, id: event.pointerId };
    canvas.setPointerCapture?.(event.pointerId);
    if (mode === 'first' && event.button === 0 && canvas.requestPointerLock && !locked()) {
      try { const request = canvas.requestPointerLock(); request?.catch?.(() => {}); } catch { /* Drag fallback works without pointer lock. */ }
    }
  });
  const pointerMove = event => {
    if (!pointer && !(mode !== 'editor' && locked())) return;
    const dx = locked() ? event.movementX || 0 : event.clientX - pointer.x;
    const dy = locked() ? event.movementY || 0 : event.clientY - pointer.y;
    if (pointer) { pointer.x = event.clientX; pointer.y = event.clientY; }
    if (mode === 'editor') { if (editorEnabled) orbit(dx, dy, pointer?.pan); }
    else look(dx, dy);
  };
  listen(eventRoot || canvas, 'pointermove', pointerMove);
  listen(eventRoot || canvas, 'pointerup', () => { pointer = null; });
  listen(eventRoot || canvas, 'pointercancel', () => { pointer = null; });
  listen(canvas, 'wheel', event => {
    if (mode === 'first' || (mode === 'editor' && !editorEnabled)) return;
    event.preventDefault();
    if (mode === 'third') { followDistance = T.MathUtils.clamp(followDistance * Math.exp(event.deltaY * .001), 1.4, 12); placeCamera(0); }
    else { offset.copy(camera.position).sub(target); const length = T.MathUtils.clamp(offset.length() * Math.exp(event.deltaY * .001), .4, Math.max(2000, camera.far * .6)); camera.position.copy(target).add(offset.setLength(length)); camera.lookAt(target); }
    changed();
  }, { passive: false });
  if (avatar) setAvatar(avatar);
  return {
    get mode() { return mode; }, get yaw() { return yaw; }, get pitch() { return pitch; },
    position, target, avatarCarrier, setMode, update, focus, setAvatar,
    setEditorEnabled(value) { editorEnabled = !!value; if (!value) pointer = null; },
    setBounds(value) { cityBounds = value; },
    setSpawn(value) { spawnPoint = [...value]; position.set(...spawnPoint); clearKeys(); placeCamera(0); },
    teleport(value) { position.set(...value); clearKeys(); placeCamera(0); changed(); },
    dispose() { disposed = true; clearKeys(); if (locked()) documentRoot.exitPointerLock?.(); listeners.splice(0).forEach(remove => remove()); mixer?.stopAllAction(); if (mixer && avatarRoot) mixer.uncacheRoot(avatarRoot); avatarCarrier.removeFromParent(); },
  };
}
