import test from 'node:test';
import assert from 'node:assert/strict';
import { PalomaBehavior, CLIPS } from '../engine/PalomaBehavior.mjs';
import { PalomaCollisions } from '../engine/PalomaCollisions.mjs';

function bird(options) {
  let position = { x: 0, y: 0, z: 0 }, visible = true;
  const clips = [];
  const adapter = {
    getPosition: () => position,
    getForward: () => ({ x: 0, z: -1 }),
    setPosition: p => { position = { ...p }; },
    setVisible: v => { visible = v; },
    play: (name, loop) => clips.push([name, loop]), face() {},
  };
  return { behavior: new PalomaBehavior(adapter, options), adapter, clips, visible: () => visible };
}

test('los pasos siguen la orientación y escala del modelo del aeropuerto', () => {
  const { behavior: b, adapter: a } = bird({ walkDistance: 0.32 });
  b.update(4.5); assert.deepEqual(a.getPosition(), { x: 0, y: 0, z: 0 });
  b.update(1); assert.equal(a.getPosition().z, -0.16);
  b.update(4.5); assert.equal(a.getPosition().z, -0.32);
});

test('la proximidad del jugador activa la huida una sola vez', () => {
  const { behavior: b, clips, visible } = bird();
  b.update(0.1, { x: 1, y: 0, z: 0 });
  assert.equal(b.state, 'scare'); assert.equal(b.target.x, -6);
  b.update(3.9); assert.equal(b.state, 'land'); assert.equal(visible(), true);
  b.update(1, { x: 1, y: 0, z: 0 });
  assert.equal(clips.filter(([name]) => name === CLIPS.scare).length, 1);
  b.update(4); assert.equal(b.state, 'eat'); assert.equal(visible(), true);
});

test('el vuelo corto llega al destino elegido y vuelve a comer', () => {
  const { behavior: b, adapter: a, clips } = bird();
  assert.equal(b.flyTo({ x: 1, y: 0.1, z: -2 }), true);
  b.update(2); assert.deepEqual(a.getPosition(), { x: 0, y: 0, z: 0 });
  b.update(1.35); assert(a.getPosition().y > 0.5);
  b.update(3.65); assert.deepEqual(a.getPosition(), { x: 1, y: 0.1, z: -2 });
  assert.equal(b.state, 'eat'); assert.deepEqual(clips.at(-1), [CLIPS.eat, true]);
});

test('cada paloma tiene estado y trayectoria independientes', () => {
  const first = bird(), second = bird();
  first.behavior.frighten({ x: 1, y: 0, z: 0 }); first.behavior.update(4);
  assert.equal(second.behavior.state, 'eat'); assert.equal(second.visible(), true);
  first.behavior.reset({ x: 2, y: 0, z: 1 });
  assert.equal(first.visible(), true); assert.equal(first.behavior.state, 'eat');
});

const wall = (x0, z0, x1, z1, height = 3) => ({ min: { x: x0, y: -.2, z: z0 }, max: { x: x1, y: height, z: z1 } });

test('un desplazamiento grande no atraviesa un obstáculo delgado', () => {
  const collisions = new PalomaCollisions([wall(-2, -1, 2, -.99)]);
  const result = collisions.resolve({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -20 });
  assert(result.hit); assert(result.position.z > -.67);
  assert.equal(result.hit.normal.z, 1);
});

test('al tocar una pared caminando cambia de dirección', () => {
  const b = bird({ collisions: new PalomaCollisions([wall(-2, -.4, 2, -.39)]), walkDistance: .32 });
  let facing;
  b.adapter.face = p => { facing = p; };
  b.behavior.update(6.5);
  assert(b.adapter.getPosition().z > -.07);
  assert(facing.z > b.adapter.getPosition().z);
});

test('la huida evita la fachada aunque el humano venga desde la calle', () => {
  const collisions = new PalomaCollisions([wall(-100, -100, 100, -1)]);
  const b = bird({ collisions });
  assert(b.behavior.frighten({ x: 0, y: 0, z: 1 }));
  assert(b.behavior.target.z > 0);
  assert(collisions.clearPath(b.adapter.getPosition(), b.behavior.target));
});

test('rechaza destinos bloqueados y permite pasar por encima de objetos bajos', () => {
  const collisions = new PalomaCollisions([wall(-.5, 1, .5, 2, .62)]);
  const b = bird({ collisions });
  assert.equal(b.behavior.flyTo({ x: 0, y: 0, z: 1.5 }), false);
  assert(collisions.clearPath({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 3 }));
});

test('un objeto movido durante el vuelo impide atravesarlo y aterrizar dentro', () => {
  const collisions = new PalomaCollisions();
  const b = bird({ collisions });
  assert(b.behavior.flyTo({ x: 0, y: 0, z: 4 }));
  b.behavior.update(2.2);
  collisions.boxes.push(wall(-10, 1, 10, 2, 10));
  b.behavior.update(4.8);
  assert(b.adapter.getPosition().z < .68);
});

test('si un objeto se coloca encima de la paloma la separa por la cara más cercana', () => {
  const collisions = new PalomaCollisions([wall(-1, -1, 1, 1)]);
  const motion = collisions.resolve({ x: 1.1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  assert(motion.hit); assert(motion.position.x > 1.32);
});
