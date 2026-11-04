// Azar determinista: misma semilla + mismo id = mismo resultado.
export function hashString(text){
  let h=2166136261>>>0;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}

export function rng(seed){
  let a=typeof seed==='number'?seed>>>0:hashString(String(seed));
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}

export const pick=(r,list)=>list[Math.floor(r()*list.length)%list.length];
export const range=(r,a,b)=>a+(b-a)*r();
export function weighted(r,entries){
  const total=entries.reduce((s,[,w])=>s+w,0);let x=r()*total;
  for(const [v,w]of entries){x-=w;if(x<=0)return v;}
  return entries.at(-1)[0];
}
