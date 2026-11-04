// Integer hash and independent streams. No dependency on Three.js or browser APIs.
export function hash(s) { let h=2166136261; for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0; }
export function random(seed) {let a=hash(seed);return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
export function noise(x,z,seed){const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;const fade=t=>t*t*(3-2*t);const at=(i,j)=>(hash(`${seed}:${i}:${j}`)/4294967295)*2-1;const u=fade(fx),v=fade(fz);return (at(ix,iz)*(1-u)+at(ix+1,iz)*u)*(1-v)+(at(ix,iz+1)*(1-u)+at(ix+1,iz+1)*u)*v;}
export function fbm(x,z,seed,octaves=5){let sum=0,a=1,n=0;for(let i=0;i<octaves;i++){sum+=noise(x,z,seed+i*53)*a;n+=a;a*=.5;x*=2.03;z*=2.03;}return sum/n;}
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
