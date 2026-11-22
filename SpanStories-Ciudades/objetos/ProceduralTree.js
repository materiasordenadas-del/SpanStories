import * as T from '../engine/three.js';
import {Tree} from '../vendor/ez-tree/tree.js';
import {loadPreset} from '../vendor/ez-tree/presets/index.js';
import {TREE_VARIETY} from '../routes.js';
import {bounds} from './DecorGeometry.js';

// One growth pass per model; near and medium share that exact skeleton.
export function proceduralTreeGeometry(profile,{crownRatio=TREE_VARIETY.crownRatio}={}){
  const tree=new Tree();tree.options.copy(loadPreset('oak_small'));
  const p=tree.options;p.seed=profile.seed;p.bark.textured=false;
  Object.assign(p.branch,{levels:2,children:{0:profile.children,1:profile.twigs,2:0},sections:{0:7,1:5,2:3,3:3},segments:{0:6,1:4,2:3,3:3},
    length:{0:profile.trunk,1:profile.branch,2:profile.tip,3:profile.tip},radius:{0:.21,1:.48,2:.42,3:.2},angle:{1:profile.angle,2:profile.tipAngle,3:35},
    start:{1:profile.start,2:.35,3:.3},gnarliness:{0:profile.gnarl,1:.08,2:.1,3:.02},twist:{0:.04,1:.18,2:0,3:0},force:{direction:{x:profile.lean[0],y:profile.lean[1],z:profile.lean[2]},strength:.008}});
  Object.assign(p.leaves,{count:profile.leafCount,size:profile.leafSize,start:.15,sizeVariance:.35,billboard:'double'});tree.generate();
  const near=[{geometry:tree.branchesMesh.geometry,name:profile.id+'-tronco',part:'bark'},{geometry:tree.leavesMesh.geometry,name:profile.id+'-hojas',part:'leaves'}];
  const lower=tree.createGeometry({sectionStride:2,segmentFactor:.7,leafStride:2,leafScale:1.15,billboard:'single'});
  const medium=[{geometry:lower.branches,name:profile.id+'-tronco-LOD1',part:'bark'},{geometry:lower.leaves,name:profile.id+'-hojas-LOD1',part:'leaves'}];
  const b=bounds(near),scale=1/(b.max.y-b.min.y),width=Math.max(b.max.x-b.min.x,b.max.z-b.min.z)*scale;
  // The native trunk starts at X=Z=0: retain its foot, including asymmetric crowns.
  for(const parts of [near,medium])for(const part of parts)part.geometry.translate(0,-b.min.y,0).scale(scale*crownRatio/width,scale,scale*crownRatio/width);
  const lowerBounds=bounds(medium),lowerHeight=lowerBounds.max.y-lowerBounds.min.y,lowerWidth=Math.max(lowerBounds.max.x-lowerBounds.min.x,lowerBounds.max.z-lowerBounds.min.z);
  for(const part of medium)part.geometry.translate(0,-lowerBounds.min.y,0).scale(crownRatio/lowerWidth,1/lowerHeight,crownRatio/lowerWidth);
  tree.branchesMesh.material.dispose();tree.leavesMesh.material.dispose();return {near,medium};
}
