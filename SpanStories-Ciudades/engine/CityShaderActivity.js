// Preserve the shared light engine. Only remove mathematically inactive loops;
// never remove an active lamp/room, change light values, or approximate shading.
export function lightingActivity(uniforms){
  let lamps=0,rooms=0;
  for(let i=0;i<uniforms.uLampColor.value.length;i++){const c=uniforms.uLampColor.value[i];if(c.r!==0||c.g!==0||c.b!==0)lamps=i+1;}
  for(let i=0;i<uniforms.uSalas.value.length;i++){const r=uniforms.uSalas.value[i];if(r.x<r.z&&r.y<r.w)rooms=i+1;}
  return {lamps,rooms};
}
export function specializeLightingShader(shader,{lamps,rooms}){
  return shader.replaceAll('i < N_LAMP;',`i < ${lamps};`).replaceAll('i < N_SALA;',`i < ${rooms};`);
}
