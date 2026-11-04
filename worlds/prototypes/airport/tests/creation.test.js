import test from 'node:test';
import assert from 'node:assert/strict';
import { snapWallPoint, validWall } from '../engine/WallDraft.js';
import { PlayerController } from '../engine/PlayerController.js';

test('snaps endpoints, T junctions and perpendicular continuations exactly', () => {
  const walls = [{ a: [0, 0], b: [4, 0] }];
  assert.deepEqual(snapWallPoint({ x: 4.08, z: .07 }, { walls }), { x: 4, z: 0, snapped: true });
  assert.deepEqual(snapWallPoint({ x: 2.1, z: .07 }, { walls }), { x: 2.1, z: 0, snapped: true });
  assert.deepEqual(snapWallPoint({ x: 4.12, z: 3.02 }, { walls, start: { x: 4, z: 0 } }), { x: 4, z: 3, snapped: false });
  const join = snapWallPoint({ x: 2.09, z: .08 }, { walls, start: { x: 2, z: 3 } });
  assert.deepEqual(join, { x: 2, z: 0, snapped: true });
});

test('joins cannot pull an orthogonal segment off its axis; Alt permits free angles', () => {
  const point = { x: 4.09, z: 3.05 };
  const walls = [{ a: [4.1, 3.1], b: [8, 3.1] }];
  const result = snapWallPoint(point, { walls, start: { x: 4, z: 0 } });
  assert.equal(result.x, 4);
  assert.deepEqual(snapWallPoint(point, { walls, start: { x: 4, z: 0 }, free: true }), { ...point, snapped: false });
});

test('perpendicular drafting also follows a previously diagonal wall', () => {
  const start = { x: 2, z: 2 }, direction = { x: 2, z: 2 };
  const end = snapWallPoint({ x: -.1, z: 4.05 }, { start, direction });
  assert.ok(Math.abs((end.x - start.x) * direction.x + (end.z - start.z) * direction.z) < 1e-9);
  assert.ok(validWall(start, end));
  assert.equal(validWall(start, { x: NaN, z: 0 }), false);
  assert.equal(validWall(start, start), false);
});

function freePlayer() {
  const route = [{ id: 'a', center: [0, 0], width: 10, depth: 10 }, { id: 'b', center: [10, 0], width: 10, depth: 10 }];
  const manager = { route, index: 0, current: 'a', async enter(id) { this.current = id; this.index = route.findIndex(r => r.id === id); } };
  return { player: new PlayerController(manager, { freeRoam: true }), manager };
}

test('free walking outside a room does not load or teleport to a neighbour', async () => {
  const { player, manager } = freePlayer();
  player.position = { x: 4.8, z: 12 };
  assert.equal(await player.step(.4, 0), false);
  assert.equal(manager.current, 'a');
  assert.deepEqual(player.position, { x: 5.2, z: 12 });
});

test('free walking enters only the room actually crossed and preserves coordinates', async () => {
  const { player, manager } = freePlayer();
  player.position = { x: 4.7, z: 2 };
  assert.equal(await player.step(.1, 0), false);
  assert.equal(manager.current, 'a');
  assert.equal(await player.step(.4, 0), true);
  assert.equal(manager.current, 'b');
  assert.ok(Math.abs(player.position.x - 5.2) < 1e-9); assert.equal(player.position.z, 2);
});

test('failed loading preserves the free walker position and releases busy state', async () => {
  const { player, manager } = freePlayer();
  manager.enter = async () => { throw Error('load failed'); };
  player.position = { x: 4.8, z: 2 };
  await assert.rejects(player.step(.4, 0), /load failed/);
  assert.deepEqual(player.position, { x: 4.8, z: 2 }); assert.equal(player.busy, false);
});

test('free walking preserves streaming adjacency when outside the route', async () => {
  const { player, manager } = freePlayer();
  manager.route.push({ id: 'c', center: [20, 0], width: 10, depth: 10 });
  player.position = { x: 19, z: 6 };
  assert.equal(await player.step(0, -2), false);
  assert.equal(manager.current, 'a'); assert.deepEqual(player.position, { x: 19, z: 4 });
});
