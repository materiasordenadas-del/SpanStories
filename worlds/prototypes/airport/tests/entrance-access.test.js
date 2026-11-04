import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS, ENTRANCE_LIMITS, ENTRANCE_RETURNS, accessArc, accessRoadPolygons, accessPavingPolygons } from '../engine/EntranceAccessPlan.js';

function inside([x,z], polygon) {
  let hit=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++) {
    const [ax,az]=polygon[i], [bx,bz]=polygon[j];
    if((az>z)!==(bz>z) && x<(bx-ax)*(z-az)/(bz-az)+ax) hit=!hit;
  }
  return hit;
}
const road=accessRoadPolygons(), paving=accessPavingPolygons();
const onRoad=p=>road.some(poly=>inside(p,poly));

test('access fits the user gate and provides pavement on both sides',()=>{
  const left=ACCESS.centerX-ACCESS.width/2, right=ACCESS.centerX+ACCESS.width/2;
  assert.ok(left-ACCESS.gateX[0]>1.1); assert.ok(ACCESS.gateX[1]-right>1.1);
  assert.equal(ENTRANCE_LIMITS[1].b[1],ACCESS.gateZ);
  assert.equal(ENTRANCE_LIMITS[2].a[1],ACCESS.gateZ);
  for(const x of [ACCESS.centerX-2.7,ACCESS.centerX,ACCESS.centerX+2.7]) assert.ok(onRoad([x,ACCESS.gateZ]));
  for(const x of [17.55,24.7]) assert.ok(paving.some(poly=>inside([x,ACCESS.gateZ-.1],poly)));
});

test('the road continues through the complete bend and taper without pavement overlaps',()=>{
  const samples=[];
  for(let i=1;i<36;i++) {
    const theta=-Math.PI/2+i/36*Math.PI/2;
    for(const radius of [4.5,6.1,8,9.9,11.5]) samples.push([ACCESS.turnX+radius*Math.cos(theta),ACCESS.turnZ+radius*Math.sin(theta)]);
  }
  for(let z=22.1;z<64;z+=.4) for(const offset of [-2.7,0,2.7]) samples.push([ACCESS.centerX+offset,z]);
  for(const p of samples) {
    assert.ok(onRoad(p),`road gap at ${p}`);
    assert.equal(paving.some(poly=>inside(p,poly)),false,`pavement covers road at ${p}`);
  }
});

test('the bend is tangent to the original road and remains inside the east boundary',()=>{
  const outer=accessArc(ACCESS.radius+ACCESS.terminalWidth/2), inner=accessArc(ACCESS.radius-ACCESS.terminalWidth/2);
  assert.ok(Math.abs(outer[0][1]-10.1)<1e-9); assert.ok(Math.abs(inner[0][1]-17.7)<1e-9);
  assert.ok(outer.every(([x])=>x<33.75));
  assert.deepEqual(ENTRANCE_RETURNS[0].a,ENTRANCE_LIMITS[4].b);
  assert.deepEqual(ENTRANCE_RETURNS[0].b,ENTRANCE_RETURNS[1].a);
});
