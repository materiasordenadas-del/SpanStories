import test from 'node:test';
import assert from 'node:assert/strict';
import {sidewalkRuns} from '../src/render/street-layout.js';
test('sidewalks leave carriageway clear at intersections and split into separate runs',()=>{const points=Array.from({length:21},(_,i)=>({x:i*2,z:0})),road={width:6},nodes=[{x:0,z:0},{x:20,z:0},{x:40,z:0}],runs=sidewalkRuns(points,road,nodes);assert.equal(runs.length,2);for(const run of runs){assert.ok(run.length>1);for(const p of run)for(const n of nodes)assert.ok(Math.hypot(p.x-n.x,p.z-n.z)>=4.7);assert.ok(!run.some(p=>p.x<20)||!run.some(p=>p.x>20));}});
