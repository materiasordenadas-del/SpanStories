import * as T from './three.js';
import { boxes } from './ThreeResources.js';
import { crearMaterialToon, crearReceptorSombra, luz, normalDesdeAltura } from './Luz25D.js';
import { ACCESS, ENTRANCE_LIMITS, ENTRANCE_RETURNS, accessArc, accessRoadPolygons, accessPavingPolygons } from './EntranceAccessPlan.js';

// Exterior only. Shared geometry, instanced stone/kerbs and the existing shrub art.
export function buildEntranceAccess({ scope, kit, group, origin, pavingMaterial, asphaltMaterial, bushGeometry, bushMaterial, colliders }) {
  const root = new T.Group(); root.name = 'acceso-aeropuerto';
  root.position.set(-origin.x, 0, -origin.z); group.add(root);
  scope.defer(() => root.removeFromParent());
  root.userData.snapWalls = [...ENTRANCE_LIMITS, ...ENTRANCE_RETURNS];
  group.userData.snapWalls = root.userData.snapWalls;
  const add = mesh => { root.add(mesh); scope.defer(() => mesh.removeFromParent()); return mesh; };
  const map = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = scope.own(new T.CanvasTexture(c)); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const polygon = (points, material, y, period = 4) => {
    const shape = new T.Shape(points.map(([x, z]) => new T.Vector2(x, -z)));
    const geo = scope.own(new T.ShapeGeometry(shape)); geo.rotateX(-Math.PI / 2);
    const p = geo.getAttribute('position'), uv = geo.getAttribute('uv');
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / period, -p.getZ(i) / period);
    const mesh = add(new T.Mesh(geo, material)); mesh.position.y = y; mesh.userData.batchGround = true; return mesh;
  };
  const rect = (x0, z0, x1, z1, material, y) => polygon([[x0,z0],[x1,z0],[x1,z1],[x0,z1]], material, y);
  const shadow = scope.own(crearReceptorSombra(.85));
  for (const points of accessRoadPolygons()) {
    const surface = polygon(points, asphaltMaterial, -.124, 8); surface.name = 'calle-acceso';
    const receiver = add(new T.Mesh(surface.geometry, shadow)); receiver.position.y = -.106; receiver.receiveShadow = true; receiver.userData.batchGround = true;
  }
  for (const points of accessPavingPolygons()) {
    const surface = polygon(points, pavingMaterial, .012); surface.name = 'acera-acceso';
    const receiver = add(new T.Mesh(surface.geometry, shadow)); receiver.position.y = .039; receiver.receiveShadow = true; receiver.userData.batchGround = true;
  }
  // The original road continues out of the set, rather than ending in empty sky.
  rect(-100, 10.1, -67, 17.7, asphaltMaterial, -.124);
  rect(-100, 8.2, -67, 10.1, pavingMaterial, .012);
  rect(-100, 17.7, -67, 23.29, pavingMaterial, .012);

  // Quiet lawn outside the enclosure and a garden strip inside the east wall.
  const lawnMap = map(256, 256, (c,w,h) => {
    c.fillStyle = '#7c9b6d'; c.fillRect(0,0,w,h);
    c.fillStyle = '#789668'; c.fillRect(0,0,w,h/2);
    c.fillStyle = '#87a374';
    for(let i=0;i<110;i++) c.fillRect((i*61)%w,(i*37)%h,2,3);
  });
  lawnMap.wrapS = lawnMap.wrapT = T.RepeatWrapping;
  const lawn = scope.own(crearMaterialToon({ albedo: lawnMap }));
  rect(-115,23.5,90,115,lawn,-.16);
  rect(27.6,7.8,33.5,23.5,lawn,.013);
  rect(12.24,-21.25,33.5,7.6,lawn,-.01);
  rect(31.25,-20.9,33.3,7.6,pavingMaterial,.012);

  const transforms = (segments, y, height, thickness) => segments.map(({a,b}) => {
    const dx=b[0]-a[0], dz=b[1]-a[1];
    return { x:(a[0]+b[0])/2, z:(a[1]+b[1])/2, angle:-Math.atan2(dz,dx), length:Math.hypot(dx,dz), y, height, thickness };
  });
  const instancedSegments = (segments, material, y, height, thickness) => {
    const rows = transforms(segments,y,height,thickness);
    const mesh = scope.own(new T.InstancedMesh(kit.box, material, rows.length));
    const m=new T.Matrix4(), q=new T.Quaternion(), axis=new T.Vector3(0,1,0);
    for(let i=0;i<rows.length;i++) {
      const r=rows[i]; q.setFromAxisAngle(axis,r.angle);
      m.compose(new T.Vector3(r.x,r.y,r.z),q,new T.Vector3(r.length+.008,r.height,r.thickness)); mesh.setMatrixAt(i,m);
    }
    mesh.instanceMatrix.needsUpdate=true; mesh.computeBoundingSphere(); return add(mesh);
  };
  // Stone albedo/relief: no painted lighting, so the existing day/night light remains in charge.
  const stoneMap = map(512,512,(c,w,h) => {
    c.fillStyle='#d9d6ca'; c.fillRect(0,0,w,h);
    for(let j=0;j<8;j++) for(let i=-1;i<5;i++) {
      const x=i*128+(j%2)*64, y=j*64;
      c.fillStyle=['#ece8dc','#e8e4d8','#e2dfd3','#eae6d9'][(i+j+8)%4];
      c.fillRect(x+2,y+2,124,60);
    }
  });
  stoneMap.wrapS = stoneMap.wrapT = T.RepeatWrapping;
  const stoneNormal = scope.own(normalDesdeAltura(stoneMap.image,{fuerza:1.3,suavizado:1,repetir:true}));
  const stone = scope.own(crearMaterialToon({albedo:stoneMap,normal:stoneNormal,fuerzaNormal:.35,repetir:[2,1]}));
  const walls=[...ENTRANCE_LIMITS,...ENTRANCE_RETURNS];
  const stoneSections=walls.flatMap(({a,b})=>{
    const count=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);
    const at=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    return Array.from({length:count},(_,i)=>({a:at(i/count),b:at((i+1)/count)}));
  });
  const wallMesh=instancedSegments(stoneSections,stone,ACCESS.wallHeight/2,ACCESS.wallHeight,ACCESS.wallThickness);
  wallMesh.name='cerramiento-piedra'; wallMesh.castShadow=true;
  instancedSegments(walls,kit.materials.navy,.16,.28,.47);
  instancedSegments(walls,kit.materials.lightMetal,3.34,.09,.54);
  instancedSegments(walls,kit.materials.accent,3.255,.035,.452);
  const pillars=[], foliage=[], planterBlocks=[], planterCaps=[], soil=[];
  for(const wall of walls) {
    const length=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
    for(let i=0;i<=Math.ceil(length/7);i++) {
      const t=i/Math.ceil(length/7), x=wall.a[0]+(wall.b[0]-wall.a[0])*t, z=wall.a[1]+(wall.b[1]-wall.a[1])*t;
      pillars.push([x,1.67,z,.58,3.34,.58]);
    }
    colliders.push(new T.Box3(new T.Vector3(Math.min(wall.a[0],wall.b[0])-.22,0,Math.min(wall.a[1],wall.b[1])-.22),
      new T.Vector3(Math.max(wall.a[0],wall.b[0])+.22,3.4,Math.max(wall.a[1],wall.b[1])+.22)));
  }
  boxes(scope,{...kit,materials:{...kit.materials,accessStone:stone},outline:()=>kit.outline('wall','fino')},root,'accessStone',pillars).castShadow=true;
  // Repeat low planted beds along the front wall; leave a clear pedestrian strip by the kerb.
  for(let x=-61;x<12;x+=8) {
    planterBlocks.push([x,.24,22.62,4.8,.48,1.05]);
    planterCaps.push([x,.49,22.62,4.9,.06,1.13]); soil.push([x,.52,22.62,4.45,.025,.8]);
    for(let k=-1;k<=1;k++) foliage.push([x+k*1.35,.52,22.62,1.3,.9]);
  }
  for(const z of [10.3,15.7,21]) {
    planterBlocks.push([30.4,.24,z,1.65,.48,2.8]); planterCaps.push([30.4,.49,z,1.73,.06,2.9]); soil.push([30.4,.52,z,1.4,.025,2.55]);
    for(let k=-1;k<=1;k++) foliage.push([30.4,.52,z+k*.85,1.35,.95]);
  }
  boxes(scope,kit,root,'wall',planterBlocks); boxes(scope,kit,root,'trim',planterCaps); boxes(scope,kit,root,'dark',soil);
  const bushes=scope.own(new T.InstancedMesh(bushGeometry,bushMaterial,foliage.length*2));
  const bm=new T.Matrix4(), bq=new T.Quaternion();
  foliage.forEach(([x,y,z,w,h],i)=>{
    for(let cross=0;cross<2;cross++) {
      bq.setFromAxisAngle(new T.Vector3(0,1,0),cross*Math.PI/2);
      bm.compose(new T.Vector3(x,y,z),bq,new T.Vector3(w/1.5,h/.85,1)); bushes.setMatrixAt(i*2+cross,bm);
    }
  });
  bushes.instanceMatrix.needsUpdate=true; bushes.computeBoundingSphere(); bushes.castShadow=true; add(bushes);

  // Smooth curb stones follow both edges of the bend, then taper to the marked gate.
  const curbSegments=[];
  const chain=points=>{for(let i=1;i<points.length;i++) curbSegments.push({a:points[i-1],b:points[i]});};
  chain([[12,9.95],[ACCESS.turnX,9.95],...accessArc(11.95).slice(1),[24.275,26.5],[24.275,64]]);
  chain([[12,17.85],[ACCESS.turnX,17.85],...accessArc(4.05).slice(1),[17.975,26.5],[17.975,64]]);
  instancedSegments(curbSegments,kit.materials.concrete,-.059,.162,.3);
  const paint=[];
  for(let x=-98;x<-67;x+=4) paint.push({a:[x,13.9],b:[x+2.6,13.9]});
  for(let distance=1.2;distance<Math.PI*4;distance+=4) {
    const theta=-Math.PI/2+distance/8, span=2.6/16;
    paint.push({a:[ACCESS.turnX+8*Math.cos(theta-span),ACCESS.turnZ+8*Math.sin(theta-span)],
      b:[ACCESS.turnX+8*Math.cos(theta+span),ACCESS.turnZ+8*Math.sin(theta+span)]});
  }
  for(let z=22.8;z<62;z+=4) paint.push({a:[ACCESS.centerX,z],b:[ACCESS.centerX,z+2.6]});
  instancedSegments(paint,kit.materials.floor,-.118,.006,.14);
  const arrowGeo=scope.own(new T.ShapeGeometry(new T.Shape([
    new T.Vector2(0,1.45),new T.Vector2(.55,.65),new T.Vector2(.18,.65),new T.Vector2(.18,-1.2),
    new T.Vector2(-.18,-1.2),new T.Vector2(-.18,.65),new T.Vector2(-.55,.65)])));
  arrowGeo.rotateX(-Math.PI/2);
  const arrow=(x,z,yaw)=>{const m=add(new T.Mesh(arrowGeo,kit.materials.floor));m.position.set(x,-.113,z);m.rotation.y=-yaw;m.userData.batchGround=true;};
  arrow(19.625,36,Math.PI); arrow(22.625,36,0);
  arrow(19.625,51,Math.PI); arrow(22.625,51,0);
  for(const [radius,yaw] of [[6.1,Math.PI*.75],[9.9,-Math.PI*.25]]) {
    arrow(ACCESS.turnX+radius/Math.SQRT2,ACCESS.turnZ-radius/Math.SQRT2,yaw);
  }

  // Clear gate span: posts stay outside the user's 8.75 m opening.
  boxes(scope,kit,root,'navy',[[16.39,2.55,28.25,.7,5.1,.7],[25.86,2.55,28.25,.7,5.1,.7],
    [21.125,4.92,28.25,10.17,1.05,.36]]).castShadow=true;
  boxes(scope,kit,root,'accent',[[21.125,4.36,28.25,10.22,.065,.42]]);
  const sign=(text,sub,x,y,z,width,height,reverse=false)=>{
    const tex=map(1024,192,(c,w,h)=>{
      c.fillStyle='#21466b';c.fillRect(0,0,w,h);
      c.fillStyle='#edc783'; c.fillRect(36,h-13,w-72,3);
      c.fillStyle='#fffdf2';c.font='bold 66px system-ui';c.textAlign='center';c.fillText(text,w/2,86);
      c.fillStyle='#c4d5dd';c.font='32px system-ui';c.fillText(sub,w/2,139);
    });
    const material=scope.own(new T.MeshBasicMaterial({map:tex}));scope.defer(luz.tintar(material,'cartel'));
    const m=add(new T.Mesh(scope.own(new T.PlaneGeometry(width,height)),material));m.position.set(x,y,z);if(reverse)m.rotation.y=Math.PI;
  };
  sign('AEROPUERTO','Salidas · Acceso a terminal',21.125,4.92,28.44,8.5,.98);
  sign('SALIDA','Ciudad / vías principales',21.125,4.92,28.06,8.5,.98,true);
  sign('SALIDA ↓','',18.92,3.94,28.45,2.2,.42);
  sign('ENTRADA ↑','',23.32,3.94,28.45,2.2,.42);
  // Pedestrian direction sign and simple lamps, matched to the terminal's navy/gold palette.
  sign('← TERMINAL','Acceso peatonal',28,1.78,20.3,2.7,.68);
  boxes(scope,kit,root,'metal',[[28,1.05,20.2,.1,2.1,.1],
    [28.3,2.9,9.1,.14,5.8,.14],[28.3,2.9,21.8,.14,5.8,.14],
    [28.05,5.7,9.1,1.1,.15,.5],[28.05,5.7,21.8,1.1,.15,.5]]);
  boxes(scope,kit,root,'warmLight',[[28.05,5.6,9.1,.85,.045,.36],[28.05,5.6,21.8,.85,.045,.36]]);
  // Bake the static surfaces by material; curved pavement and arrows need only
  // one draw call per material/pass, without changing their UVs or shadow behaviour.
  const batches=new Map();
  for(const mesh of root.children) if(mesh.userData.batchGround) {
    const key=`${mesh.material.uuid}:${mesh.receiveShadow}`;
    if(!batches.has(key)) batches.set(key,[]);
    batches.get(key).push(mesh);
  }
  for(const meshes of batches.values()) {
    if(meshes.length<2) continue;
    const positions=[],normals=[],uvs=[],indices=[];
    for(const mesh of meshes) {
      mesh.updateMatrix();
      const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrix);
      const p=geometry.getAttribute('position'), n=geometry.getAttribute('normal'), uv=geometry.getAttribute('uv');
      const offset=positions.length/3;
      positions.push(...p.array); normals.push(...n.array); uvs.push(...uv.array);
      const index=geometry.getIndex();
      for(let i=0;i<(index?.count||p.count);i++) indices.push(offset+(index?index.getX(i):i));
      geometry.dispose(); root.remove(mesh);
    }
    const geometry=scope.own(new T.BufferGeometry());
    geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
    geometry.setIndex(indices); geometry.computeBoundingSphere();
    const mesh=add(new T.Mesh(geometry,meshes[0].material)); mesh.receiveShadow=meshes[0].receiveShadow;
    mesh.name='superficies-acceso-agrupadas';
  }
  return root;
}
