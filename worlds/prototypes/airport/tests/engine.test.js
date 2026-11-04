import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetRegistry, ResourceScope } from '../engine/AssetRegistry.js';
import { ZoneManager } from '../engine/ZoneManager.js';
import { PortalGate } from '../engine/PortalGate.js';
import { LODController } from '../engine/LODController.js';
import { PerformanceController } from '../engine/PerformanceController.js';
import { PlayerController } from '../engine/PlayerController.js';
import { SLICE, DEPARTURE_ROUTE, ARRIVAL_ROUTE, ENTRANCE_HALL } from '../engine/routes.js';

function harness(options = {}) {
  const alive = new Set(), high = new Set(), events = [], errors = [];
  let max = 0;
  const route = Array.from({ length: 7 }, (_, i) => ({ id: `D0${i}` }));
  const manager = new ZoneManager({ route, onError: e => errors.push(e), onEvent: e => events.push(e), loader: async (meta, signal) => {
    await options.beforeLoad?.(meta, signal);
    alive.add(meta.id); max = Math.max(max, alive.size);
    return {
      async prepareHigh() { await options.beforeHigh?.(meta); },
      setActive(value) { if (value) high.add(meta.id); else high.delete(meta.id); assert.ok(high.size <= 1); },
      discardHigh() { high.delete(meta.id); }, update() {},
      dispose() { assert.ok(alive.delete(meta.id)); high.delete(meta.id); },
    };
  } });
  return { manager, alive, high, events, errors, get max() { return max; } };
}
test('deduplicates concurrent loads; retains shared assets until the last lease', async () => {
  const registry = new AssetRegistry(); let loads = 0, disposed = 0;
  const load = async () => { loads++; return {}; };
  const a = registry.acquire('shared', load, () => disposed++), b = registry.acquire('shared', load, () => disposed++);
  assert.equal(await a.ready, await b.ready); assert.equal(loads, 1);
  a.release(); a.release(); assert.equal(disposed, 0);
  b.release(); assert.equal(disposed, 1); assert.deepEqual(registry.snapshot(), []);
});
test('release before resolution disposes the late asset', async () => {
  const registry = new AssetRegistry(); let disposed = 0, resolve;
  const lease = registry.acquire('late', () => new Promise(r => { resolve = r; }), () => disposed++);
  await Promise.resolve(); lease.release(); resolve({}); await lease.ready;
  assert.equal(disposed, 1); assert.deepEqual(registry.snapshot(), []);
});
test('failed resource is retryable and old lease cannot remove a new one', async () => {
  const registry = new AssetRegistry();
  const first = registry.acquire('x', () => { throw Error('offline'); }, () => {});
  await assert.rejects(first.ready);
  const second = registry.acquire('x', async () => 42, () => {});
  first.release(); assert.equal(await second.ready, 42); assert.equal(registry.snapshot().length, 1); second.release();
});
test('last release aborts in-flight transport without aborting another consumer', async () => {
  const registry = new AssetRegistry(); let signal, resolve;
  const a = registry.acquire('net', s => { signal = s; return new Promise(r => { resolve = r; }); }, () => {});
  const b = registry.acquire('net', () => {}, () => {});
  await Promise.resolve(); a.release(); assert.equal(signal.aborted, false);
  b.release(); assert.equal(signal.aborted, true); assert.deepEqual(registry.snapshot(), []);
  resolve({}); await a.ready;
});
test('resource scope cleans listeners/mixers in reverse order, even after a disposer fails', () => {
  const scope = new ResourceScope(), calls = [];
  scope.defer(() => calls.push('asset'));
  scope.mixer({ stopAllAction() { calls.push('stop'); }, uncacheRoot() { calls.push('uncache'); } }, {});
  scope.defer(() => { throw Error('bad cleanup'); });
  assert.throws(() => scope.dispose(), AggregateError); scope.dispose();
  assert.deepEqual(calls, ['stop', 'uncache', 'asset']);
});
test('40 forward/back transitions keep one HIGH, <=3 chunks, then release all', async () => {
  const h = harness(); await h.manager.start();
  for (let i = 0; i < 5; i++) {
    for (const id of ['D01', 'D02', 'D03', 'D04', 'D03', 'D02', 'D01', 'D00']) {
      await h.manager.enter(id); assert.equal(h.high.size, 1); assert.ok(h.alive.size <= 3);
    }
  }
  assert.ok(h.max <= 3); assert.ok(h.events.some(e => e.type === 'DISPOSE'));
  await h.manager.dispose(); assert.equal(h.alive.size, 0);
});
test('backtracking reuses the previous shell and non-adjacent requests are rejected', async () => {
  const h = harness(); await h.manager.start(); await h.manager.enter('D01');
  const before = h.events.filter(e => e.type === 'LOAD_LOW' && e.id === 'D00').length;
  await h.manager.enter('D00');
  assert.equal(h.events.filter(e => e.type === 'LOAD_LOW' && e.id === 'D00').length, before);
  await assert.rejects(h.manager.enter('D05')); assert.equal(h.manager.current, 'D00'); await h.manager.dispose();
});
test('queued rapid moves are serialized', async () => {
  const h = harness(); await h.manager.start();
  await Promise.all(['D01', 'D02', 'D03', 'D02'].map(id => h.manager.enter(id)));
  assert.equal(h.manager.current, 'D02'); assert.ok(h.max <= 3); await h.manager.dispose();
});
test('background load failure leaves the current zone active and permits retry', async () => {
  let fail = true;
  const h = harness({ beforeLoad(meta) { if (meta.id === 'D01' && fail) throw Error('offline'); } });
  await h.manager.start(); assert.equal(h.errors.length, 1);
  await assert.rejects(h.manager.enter('D01')); assert.equal(h.manager.current, 'D00');
  fail = false; await h.manager.enter('D01'); assert.equal(h.manager.current, 'D01'); await h.manager.dispose();
});
test('shader/detail preparation failure leaves previous HIGH untouched', async () => {
  let fail = true;
  const h = harness({ beforeHigh(meta) { if (meta.id === 'D01' && fail) throw Error('shader'); } });
  await h.manager.start(); await assert.rejects(h.manager.enter('D01'));
  assert.deepEqual([...h.high], ['D00']); fail = false; await h.manager.enter('D01'); await h.manager.dispose();
});
test('dispose aborts loading and cleans late results', async () => {
  let release, started;
  const ready = new Promise(r => { started = r; });
  const h = harness({ beforeLoad: () => new Promise(r => { release = r; started(); }) });
  const loading = h.manager.start(); await ready;
  const disposing = h.manager.dispose(); release(); await assert.rejects(loading); await disposing;
  assert.equal(h.alive.size, 0); await assert.rejects(h.manager.enter('D01'));
});
test('dispose during promotion retains no active chunks', async () => {
  let release, started;
  const ready = new Promise(r => { started = r; });
  const h = harness({ beforeHigh: () => new Promise(r => { release = r; started(); }) });
  const loading = h.manager.start(); await ready;
  const disposing = h.manager.dispose(); release(); await assert.rejects(loading); await disposing;
  assert.equal(h.alive.size, 0); assert.equal(h.high.size, 0);
});
test('portal requires signed crossing inside its aperture; pending requests do not duplicate', async () => {
  let calls = 0, resolve;
  const manager = { current: 'D00', enter: () => { calls++; return new Promise(r => { resolve = r; }); } };
  const portal = new PortalGate({ from: 'D00', to: 'D01', origin: { x: 0, y: 0, z: 0 }, normal: { x: 1, z: 0 } });
  assert.equal(await portal.sample({ x: 1, y: 1, z: 0 }, manager), false);
  await portal.sample({ x: -1, y: 1, z: 0 }, manager);
  assert.equal(await portal.sample({ x: 1, y: 1, z: 8 }, manager), false);
  const crossing = portal.sample({ x: 1, y: 1, z: 0 }, manager);
  assert.equal(await portal.sample({ x: 1, y: 1, z: 0 }, manager), false); resolve(); assert.equal(await crossing, true); assert.equal(calls, 1);
});
test('LOD hysteresis and ECO bias avoid oscillation', () => {
  const lod = new LODController();
  assert.equal(lod.update(21), 0); assert.equal(lod.update(23), 1); assert.equal(lod.update(19), 1); assert.equal(lod.update(17), 0);
  assert.equal(lod.update(19, .75), 1); assert.equal(lod.update(100), 3); assert.equal(lod.update(1), 0);
});
test('quality change is explicit by default; suspended frames are ignored', () => {
  const p = new PerformanceController(); const info = { render: { calls: 80, triangles: 10000 }, memory: { geometries: 4, textures: 1 } };
  for (let i = 0; i < 100; i++) p.sample(.04, info);
  assert.equal(p.name, 'STANDARD'); assert.equal(p.last.fps, 25);
  p.set('ECO'); assert.equal(p.profile.dpr, 1); p.sample(20, info); assert.equal(p.last.fps, 25);
});
test('folded slice floor rectangles never overlap', () => {
  for (let i = 0; i < SLICE.length; i++) for (let j = i + 1; j < SLICE.length; j++) {
    const a = SLICE[i], b = SLICE[j];
    const overlapX = Math.abs(a.center[0] - b.center[0]) < (a.width + b.width) / 2;
    const overlapZ = Math.abs(a.center[1] - b.center[1]) < (a.depth + b.depth) / 2;
    assert.ok(!(overlapX && overlapZ), `${a.id} overlaps ${b.id}`);
  }
});
test('both complete routes have non-overlapping floors and aligned four-metre doorways', () => {
  for (const route of [DEPARTURE_ROUTE, ARRIVAL_ROUTE]) {
    for (let i = 0; i < route.length; i++) for (let j = i + 1; j < route.length; j++) {
      const a = route[i], b = route[j];
      assert.ok(Math.abs(a.center[0] - b.center[0]) >= (a.width + b.width) / 2 ||
        Math.abs(a.center[1] - b.center[1]) >= (a.depth + b.depth) / 2, `${a.id} overlaps ${b.id}`);
    }
    for (let i = 0; i < route.length - 1; i++) {
      const a = route[i], b = route[i + 1];
      const east = a.center[0] + a.width / 2 === b.center[0] - b.width / 2;
      const west = a.center[0] - a.width / 2 === b.center[0] + b.width / 2;
      const south = a.center[1] + a.depth / 2 === b.center[1] - b.depth / 2;
      const north = a.center[1] - a.depth / 2 === b.center[1] + b.depth / 2;
      assert.ok(east || west || south || north, `${a.id} and ${b.id} lack a shared edge`);
      const [from, to, axis] = east ? ['east', 'west', 1] : west ? ['west', 'east', 1] : south ? ['south', 'north', 0] : ['north', 'south', 0];
      assert.ok(from in a.openings && to in b.openings, `${a.id} → ${b.id} lacks a portal`);
      assert.equal(a.center[axis] + a.openings[from], b.center[axis] + b.openings[to], `${a.id} → ${b.id} door centres differ`);
    }
  }
});
test('walking is bounded by walls and a four-metre portal changes only to the next zone', async () => {
  const route = DEPARTURE_ROUTE;
  const records = new Map(route.map(meta => [meta.id, { chunk: { colliders: [] } }]));
  const manager = { route, index: 0, current: route[0].id, records,
    async enter(id) { assert.equal(id, route[this.index + 1].id); this.index++; this.current = id; } };
  const player = new PlayerController(manager);
  player.reset(route[0]);
  await player.step(0, 30); assert.ok(player.position.z < route[0].center[1] + route[0].depth / 2 + 20);
  player.position.z = route[0].center[1];
  player.position.x = route[0].center[0] + route[0].width / 2 - .5;
  assert.equal(await player.step(.3, 0), true);
  assert.equal(manager.current, 'D01');
  assert.ok(player.position.x > route[1].center[0] - route[1].width / 2);
});
test('player collision stops at registered interactive fixture', async () => {
  const meta = DEPARTURE_ROUTE[0];
  const manager = { route: [meta], index: 0, current: meta.id,
    records: new Map([[meta.id, { chunk: { colliders: [{ min: { x: -19.6, z: -.4 }, max: { x: -18.4, z: .4 } }] } }]]) };
  const player = new PlayerController(manager, { x: -20.2, z: 0 });
  await player.step(.9, 0); assert.equal(player.position.x, -20.2);
});
test('D00 hall furniture fits the back wall without overlapping', () => {
  const hall = DEPARTURE_ROUTE.find(zone => zone.id === 'D00'), E = ENTRANCE_HALL;
  const pieces = [
    ['desk', ...E.desk.x], ['bench', E.bench.x - E.bench.seats * .33 - .05, E.bench.x + E.bench.seats * .33 + .05],
    ['bin', E.bin.x - .25, E.bin.x + .25], ['fids', E.fids.x - E.fids.width / 2, E.fids.x + E.fids.width / 2],
  ].sort((a, b) => a[1] - b[1]);
  for (const [name, x0, x1] of pieces) assert.ok(x0 > -hall.width / 2 && x1 < hall.width / 2, name);
  for (let i = 1; i < pieces.length; i++) assert.ok(pieces[i][1] > pieces[i - 1][2] + .3, `${pieces[i - 1][0]} / ${pieces[i][0]}`);
  // The desk sits in front of its wood panelling; the signs stay inside the room.
  assert.ok(E.desk.x[0] >= E.woodWall[0] && E.desk.x[1] <= E.woodWall[1] + .5);
  for (const { x, width } of [E.infoSign, E.departuresSign]) assert.ok(Math.abs(x) + width / 2 < hall.width / 2);
  assert.ok(E.checkinSign.width / 2 < hall.depth / 2 && E.checkinSign.width >= 4);
});

test('D01: counter fronts stay clear, belt runs behind the agents', async () => {
  const { CHECKIN: C, DEPARTURES } = await import('../engine/routes.js');
  const depth = DEPARTURES.find(z => z.id === 'D01').depth;
  const deskFront = C.deskZ + C.deskDepth / 2, deskBack = C.deskZ - C.deskDepth / 2;
  const beltFront = deskBack - C.agentAisle;
  assert.ok(beltFront < deskBack, 'belt behind the desks');
  assert.ok(beltFront - C.belt.width > -depth / 2, 'belt inside the room');
  assert.ok(Math.min(...C.queueZ) - deskFront >= 1.5, 'clear waiting space in front of the desks');
});

test('D01 south wall: sky-only clerestory on the wood line, bay features fit between piers', async () => {
  const { CHECKIN: C, DEPARTURES, DIMENSIONS } = await import('../engine/routes.js');
  const depth = DEPARTURES.find(z => z.id === 'D01').depth;
  assert.equal(C.glazing.sill, C.wood.height, 'clerestory sill continues the counter wood line');
  assert.ok(C.glazing.sill > DIMENSIONS.playerHeight, 'sill above eye height: only sky shows');
  assert.equal(C.southBays.length, C.pillarsX.length - 1, 'one feature per inner bay');
  const { bench: B, services: S, lightbox: L } = C, potD = .6;
  C.southBays.forEach((kind, i) => {
    const half = (C.pillarsX[i + 1] - C.pillarsX[i] - C.pillar.width) / 2;
    if (kind === 'anuncio') assert.ok(L.width / 2 + L.frame <= half && L.y + L.height / 2 + L.frame < C.glazing.sill, `poster ${i}`);
    if (kind === 'bancos') {   // bench + gap + pot east of it stay inside the bay
      const benchW = B.seats * B.pitch;
      assert.ok(B.shift - benchW / 2 >= -half && B.shift + benchW / 2 + .15 + potD <= half, `bench ${i}`);
    }
    if (kind === 'servicios') {
      assert.ok((S.vending[0] + S.gap + S.atm[0]) / 2 <= half, `services ${i}`);
      assert.ok(Math.max(S.vending[1], S.atm[1]) < C.glazing.sill, `services under the sill ${i}`);
    }
  });
  assert.ok(C.plantZ + potD / 2 < depth / 2 - .09, 'plants inside the south wall');
  assert.ok(C.pillarsX[C.hangingSign?.pillar] !== undefined, 'hanging sign hangs on a pier');
});
