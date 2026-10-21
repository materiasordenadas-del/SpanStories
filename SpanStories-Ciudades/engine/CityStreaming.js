export function firstSector(sectors,position,{radius,transferBudget}) {
  const distance=sector=>{const [x,,z]=position,b=sector.bounds;
    return Math.hypot(x-Math.max(b.min[0],Math.min(b.max[0],x)),z-Math.max(b.min[2],Math.min(b.max[2],z)));};
  const near=sectors.filter(s=>distance(s)<=radius);
  const light=near.filter(s=>(s.transferBytes??s.bytes)<=transferBudget);
  return light.length?light.sort((a,b)=>(a.transferBytes??a.bytes)-(b.transferBytes??b.bytes))[0]:near.sort((a,b)=>distance(a)-distance(b))[0]||sectors[0];
}
