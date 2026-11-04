import {hash,random,fbm,clamp} from './random.js';
import {pointInPolygon} from '../geo/projection.js';
export function riverX(z,c){const s=hash(c.seed+':water')%100;return Math.sin(z/c.size*7+s)*c.size*.065+Math.sin(z/c.size*15+s)*c.size*.018;}
export function riverLevel(z,c){return Math.max(1.2,7+(c.size*.5-z)*.012);}
export function sample(t,x,z){const f=(x/(t.width??t.size)+.5)*(t.resolution-1),g=(z/(t.depth??t.size)+.5)*(t.resolution-1),i=clamp(Math.floor(f),0,t.resolution-2),j=clamp(Math.floor(g),0,t.resolution-2),u=clamp(f-i,0,1),v=clamp(g-j,0,1),n=t.resolution;return (t.heights[j*n+i]*(1-u)+t.heights[j*n+i+1]*u)*(1-v)+(t.heights[(j+1)*n+i]*(1-u)+t.heights[(j+1)*n+i+1]*u)*v;}
export function slope(t,x,z){const d=t.size/(t.resolution-1);return Math.hypot(sample(t,x+d,z)-sample(t,x-d,z),sample(t,x,z+d)-sample(t,x,z-d))/(2*d);}
export function roadSurfaceHeight(t,x,z){if(t.config.geography==='geographic')return sample(t,x,z)+.15;let y=Math.max(sample(t,x,z)+.35,t.config.sea+.5);if(t.config.geography==='river'){const d=Math.abs(x-riverX(z,t.config)),gap=Math.max(0,d-t.config.riverWidth*.8);if(gap<85)y=Math.max(y,riverLevel(z,t.config)+2-gap*.1);}return y;}
export function waterAt(t,x,z){const c=t.config;if(c.geography==='geographic'){for(const a of t.waterAreas??[])if(pointInPolygon({x,z},a.rings))return a.y;return -Infinity;}if(sample(t,x,z)<c.sea)return c.sea;if(c.geography==='river'&&Math.abs(x-riverX(z,c))<c.riverWidth*.5)return riverLevel(z,c);for(const l of t.lakes){if(((x-l.x)/l.rx)**2+((z-l.z)/l.rz)**2<1)return l.level;}return -Infinity;}
// A small deterministic particle erosion model: sediment is transported downhill,
// deposited on low gradients and at sinks. This is not a physical fluid simulation.
export function erode(h,n,iterations,seed){const r=random(seed),initial=h.reduce((a,b)=>a+b,0);for(let k=0;k<iterations;k++){let x=1+Math.floor(r()*(n-2)),z=1+Math.floor(r()*(n-2)),sed=0;for(let step=0;step<32;step++){let idx=z*n+x,best=idx;for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const ni=(z+dz)*n+x+dx;if(h[ni]<h[best])best=ni;}const drop=h[idx]-h[best];if(best===idx){h[idx]+=sed;sed=0;break;}const capacity=drop*.28;if(sed>capacity){const dep=(sed-capacity)*.3;h[idx]+=dep;sed-=dep;}else{const cut=Math.min((capacity-sed)*.25,drop*.25);h[idx]-=cut;sed+=cut;}x=best%n;z=Math.floor(best/n);if(x<1||x>n-2||z<1||z>n-2)break;}h[z*n+x]+=sed;}
return {massBefore:initial,massAfter:h.reduce((a,b)=>a+b,0)};}
export function generateTerrain(config){const c={...config},n=c.resolution,h=new Array(n*n),s=hash(`${c.seed}:terrain:${c.stages.terrain}`),lakes=[];
if(c.geography==='lake')lakes.push({id:'lake:0',x:0,z:0,rx:c.size*.15,rz:c.size*.21,level:19});
for(let j=0;j<n;j++)for(let i=0;i<n;i++){const x=(i/(n-1)-.5)*c.size,z=(j/(n-1)-.5)*c.size,u=x/c.size,v=z/c.size;
const warpX=fbm(u*3,v*3,s+120)*.2,warpZ=fbm(u*3-7,v*3+4,s+121)*.2,wu=u+warpX,wv=v+warpZ;
const broad=fbm(wu*3+17,wv*3-9,s),detail=fbm(wu*28,wv*28,s+73,4),ridge=(1-Math.abs(fbm(wu*9,wv*9,s+9,5)))**3;
let y=25+c.relief*(.15+broad*.7+ridge*.5)+detail*c.relief*.15;
if(c.geography==='islands') y-=Math.hypot(u*1.55,v*1.55)**2*c.relief*2+25;
if(c.geography==='coast'||c.geography==='river') y-=(v+.12)*c.relief*.95;
if(c.geography==='mountains')y+=Math.abs(u)*c.relief*.9;
if(c.geography==='river'){const d=Math.abs(x-riverX(z,c)),w=c.riverWidth*.5,bank=Math.max(0,d-w),channel=riverLevel(z,c)-3+bank*.075;const blend=clamp((d-w-c.size*.045)/(c.size*.19),0,1);y=channel*(1-blend)+(y+c.relief*.8*clamp(d/(c.size*.43),0,1))*blend;}
for(const l of lakes){const d=Math.sqrt(((x-l.x)/l.rx)**2+((z-l.z)/l.rz)**2);if(d<1.4)y=Math.min(y,l.level-7+Math.max(0,d-.7)*30);}
h[j*n+i]=y;}
const erosion=erode(h,n,Math.floor(n*n*c.erosion*.5),s+111);
return {size:c.size,resolution:n,heights:h,lakes,config:c,erosion};}
