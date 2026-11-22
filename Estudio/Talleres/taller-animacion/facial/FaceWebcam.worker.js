// Classic worker: the MediaPipe WASM loader uses importScripts internally.
let landmarker;
self.onmessage=async({data})=>{
  try{
    if(data.type==='INIT'){
      const {FilesetResolver,FaceLandmarker}=await import('./vendor/mediapipe/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm/',self.location.href).href);
      landmarker=await FaceLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/face_landmarker.task',self.location.href).href,delegate:'CPU'},
        runningMode:'VIDEO',numFaces:1,outputFaceBlendshapes:true,
        minFaceDetectionConfidence:.5,minFacePresenceConfidence:.5,minTrackingConfidence:.5
      });
      self.postMessage({type:'READY'});
    }else if(data.type==='FRAME'){
      try{
        const result=landmarker.detectForVideo(data.bitmap,data.time);
        self.postMessage({type:'RESULT',time:data.time,categories:result.faceBlendshapes?.[0]?.categories||[],face:!!result.faceLandmarks?.length});
      }finally{data.bitmap.close();}
    }
  }catch(error){self.postMessage({type:'ERROR',message:error.message||String(error)});}
};
