// Clona solo el estilo afectado. Los estilos compartidos permanecen inmutables.
export function facadeStyle(style,profile){
  if(!profile||!Object.keys(profile).length)return style;
  const result=structuredClone(style);
  if(profile.bayWidth!=null)result.bay=[profile.bayWidth,profile.bayWidth];
  if(profile.doorWidth!=null)result.portal.w=profile.doorWidth;
  if(profile.doorHeight!=null)result.portal.h=profile.doorHeight;
  for(const floor of Object.values(result.floors)){
    if(profile.windowWidth!=null)floor.w=profile.windowWidth;
    if(profile.windowHeight!=null)floor.h=profile.windowHeight;
    if(profile.balconyProbability!=null){floor.balcony={depth:.5,p:0,...floor.balcony,p:profile.balconyProbability};if(profile.balconyProbability>0)floor.kind='balconera';}
  }
  return result;
}
