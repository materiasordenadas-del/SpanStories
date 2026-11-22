import * as T from './three.js';
import { nextCityTask, CITY_WORK_BUDGET_MS } from './CityWorkQueue.js';

// Prepare the exact materials and texture payloads before admission. Never draw
// a reduced representation, change visibility, or move the editable hierarchy.
export async function prepareCityGpu(root,{renderer,camera,scene,signal,budgetMs=CITY_WORK_BUDGET_MS}={}){
  if(!renderer||!camera)return {objects:0,textures:0};
  const objects=[],textures=new Set(),materials=new Set(),view=new T.Group();
  root.traverseVisible(object=>{
    if(!(object.isMesh||object.isPoints||object.isLine||object.isSprite)||!object.layers.test(camera.layers))return;
    objects.push(object);
    for(const texture of [object._matricesTexture,object._indirectTexture,object._colorsTexture])if(texture?.isTexture)textures.add(texture);
    for(const material of Array.isArray(object.material)?object.material:[object.material])if(material&&!materials.has(material)){
      materials.add(material);
      for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
      for(const uniform of Object.values(material.uniforms||{}))if(uniform.value?.isTexture)textures.add(uniform.value);
    }
  });
  let started=performance.now();
  const yieldBudget=async()=>{signal?.throwIfAborted();if(performance.now()-started>=budgetMs){await nextCityTask();started=performance.now();signal?.throwIfAborted();}};
  try {
    for(const object of objects){
      signal?.throwIfAborted();
      // Compile accepts an Object3D view. Referencing the child here preserves
      // its real parent, world matrix, selection identity and source hierarchy.
      view.children[0]=object;
      await renderer.compileAsync(view,camera,scene);
      signal?.throwIfAborted();
      renderer.initCityObject?.(object);
      await yieldBudget();
    }
    for(const texture of textures){signal?.throwIfAborted();renderer.initTexture(texture);await yieldBudget();}
    return {objects:objects.length,textures:textures.size};
  }finally {view.children.length=0;}
}
