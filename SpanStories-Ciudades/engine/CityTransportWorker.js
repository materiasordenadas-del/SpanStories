import { fetchCityGLBDirect } from './CityTransportCore.js';
import { prepareGLB } from './CityGLBPreparation.js';
self.onmessage=async({data})=>{
  try{
    const result=await fetchCityGLBDirect(data.url,data.options);
    const prepared=data.options.prepareForParse?prepareGLB(result.buffer):null;
    if(prepared){self.postMessage({ok:true,...prepared,transferBytes:result.transferBytes},[prepared.binary]);return;}
    self.postMessage({ok:true,...result},[result.buffer]);
  }catch(error){self.postMessage({ok:false,name:error.name,message:error.message});}
};
