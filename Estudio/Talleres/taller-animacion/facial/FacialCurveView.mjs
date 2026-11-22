// Adapted bounds accumulation from Ekza Studio curve-editor/src/graph/frame.ts.
// Copyright (c) Ekza Studio contributors. MIT; see THIRD_PARTY_NOTICES.md.
export function curveBounds(keys){
  let min=Infinity,max=-Infinity;
  for(const [time,value] of keys){if(!Number.isFinite(time)||!Number.isFinite(value))continue;min=Math.min(min,value);max=Math.max(max,value);}
  if(min>max)return {min:0,max:1};
  const padding=Math.max(.025,(max-min)*.12);
  return {min:Math.max(0,min-padding),max:Math.min(1,max+padding)};
}
export function curveY(value,bounds){return 72-(value-bounds.min)/(bounds.max-bounds.min)*64;}
