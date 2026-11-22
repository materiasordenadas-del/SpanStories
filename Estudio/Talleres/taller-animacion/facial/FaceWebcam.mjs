import {faceWeights,webcamPreset} from './FaceWebcamCore.mjs';
import {facialPlayerForRig} from './FacialRigAdapter.mjs';

export function mountFaceWebcam({container,root,aliases={},onActive=()=>{}}){
  const section=document.createElement('details');section.open=true;section.id='facial-webcam';
  section.style.scrollMarginTop='100px';
  section.innerHTML=`<summary>Webcam · MediaPipe Face Landmarker</summary>
    <p>Imita tus gestos con el personaje seleccionado. Vídeo procesado en este equipo, sin micrófono.</p>
    <label style="display:block">Modo de gestos <select data-mode aria-label="Modo de gestos webcam"><option value="normal">Normal</option><option value="exaggerated">Gestos exagerados</option><option value="veryExaggerated">Muy exagerados</option></select></label>
    <p data-mode-note>Normal · intensidad habitual y calibración de ojos activa.</p>
    <label>Cámara <select data-camera aria-label="Cámara de captura facial"><option value="">Webcam predeterminada</option></select></label>
    <div><button data-start>Activar webcam</button> <button data-stop disabled>Detener webcam</button></div>
    <video muted playsinline aria-label="Vista previa de webcam" hidden style="width:100%;max-height:180px;object-fit:contain;transform:scaleX(-1);background:#111"></video>
    <div><button data-calibrate disabled>Calibrar rostro neutro</button> <button data-reset>Restablecer calibración webcam</button></div>
    <fieldset data-eyes><legend>Cierre completo de párpados · solo modo Normal</legend>
      <p>Baja el umbral si un ojo queda entreabierto. Los lados corresponden a tus ojos, como en un espejo.</p>
      <label style="display:block">Tu ojo derecho <input data-blink-right aria-label="Umbral de cierre de tu ojo derecho" type="range" min=".15" max="1" step=".01" value=".5"><output data-right-value>0.50</output></label>
      <label style="display:block">Tu ojo izquierdo <input data-blink-left aria-label="Umbral de cierre de tu ojo izquierdo" type="range" min=".15" max="1" step=".01" value=".5"><output data-left-value>0.50</output></label>
      <button data-blink-calibrate disabled>Calibrar cierre de ojos (5 s)</button>
      <p data-blink-status>Parpadeo rápido, independiente de la intensidad del resto del rostro.</p>
    </fieldset>
    <label style="display:block">Intensidad webcam <input data-amount aria-label="Intensidad webcam" type="range" min="0" max="1.5" step=".05" value="1"></label>
    <label style="display:block">Suavizado webcam <input data-smooth aria-label="Suavizado webcam" type="range" min="0" max=".9" step=".05" value=".4"></label>
    <button data-record disabled>Grabar gestos (máx. 30 s)</button> <button data-export disabled>Descargar captura facial JSON</button>
    <p data-status role="status">Cámara apagada. Selecciona Don Quijote y pulsa Activar webcam.</p>
    <small>Para reutilizar la grabación, importa su JSON en la biblioteca facial. MediaPipe no detecta tongueOut; ese canal queda neutro.</small>`;
  container.append(section);
  const q=s=>section.querySelector(s),video=q('video'),camera=q('[data-camera]'),startButton=q('[data-start]'),stopButton=q('[data-stop]'),calibrate=q('[data-calibrate]'),record=q('[data-record]'),download=q('[data-export]'),status=q('[data-status]');
  const player=facialPlayerForRig(root,aliases);
  let worker=null,stream=null,active=false,generation=0,busy=false,raf=0,lastVideo=-1,lastSent=0,lastResult=0,weights={},baseline={},raw=[],face=false,recording=false,samples=[],recordStart=0,initializing=false,initTimer=null,downloaded=false,blinkCalibration=null;
  const blink={left:.5,right:.5},blinkButton=q('[data-blink-calibrate]'),blinkStatus=q('[data-blink-status]');
  const modeSelect=q('[data-mode]');
  modeSelect.onchange=()=>{
    weights={};blinkCalibration=null;
    const normal=modeSelect.value==='normal';q('[data-eyes]').disabled=!normal;blinkButton.disabled=!normal||!face;
    q('[data-mode-note]').textContent=normal?'Normal · intensidad habitual y calibración de ojos activa.':`${modeSelect.selectedOptions[0].textContent} · ${modeSelect.value==='exaggerated'?'1,75':'2,5'} veces la intensidad, con límite de cierre y sin calibración de ojos.`;
    blinkStatus.textContent=normal?'Calibración de ojos disponible. Se conservan tus ajustes.':'La calibración de ojos solo se aplica en Normal. Tus ajustes se conservan.';
  };
  function setBlink(side,value){blink[side]=Math.max(.15,Math.min(1,value));q('[data-blink-'+side+']').value=blink[side];q('[data-'+side+'-value]').textContent=blink[side].toFixed(2);}
  for(const side of ['left','right'])q('[data-blink-'+side+']').oninput=event=>setBlink(side,Number(event.target.value));
  const note=text=>{if(status.textContent!==text)status.textContent=text;};
  function finishRecording(){recording=false;record.textContent='Grabar gestos (máx. 30 s)';download.disabled=samples.length<2;}
  function stop(message='Webcam detenida. Control devuelto a las herramientas del taller.'){
    generation++;active=false;initializing=false;clearTimeout(initTimer);cancelAnimationFrame(raf);worker?.terminate();worker=null;
    stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;video.hidden=true;
    player.restore();weights={};face=false;raw=[];busy=false;finishRecording();
    blinkCalibration=null;blinkButton.disabled=true;
    startButton.disabled=false;stopButton.disabled=true;camera.disabled=false;calibrate.disabled=true;record.disabled=true;onActive(false);note(message);
  }
  async function cameras(){
    if(!navigator.mediaDevices?.enumerateDevices)return;
    const devices=await navigator.mediaDevices.enumerateDevices(),selected=camera.value;
    camera.replaceChildren(new Option('Webcam predeterminada',''),...devices.filter(d=>d.kind==='videoinput').map((d,i)=>new Option(d.label||'Cámara '+(i+1),d.deviceId)));
    if([...camera.options].some(o=>o.value===selected))camera.value=selected;
  }
  async function pump(now){
    if(!active)return;
    raf=requestAnimationFrame(pump);
    if(busy&&now-lastSent>10000){stop('MediaPipe dejó de responder. Puedes volver a activar la webcam.');return;}
    if(busy||video.readyState<2||video.currentTime===lastVideo||now-lastSent<40)return;
    busy=true;lastVideo=video.currentTime;lastSent=now;const token=generation;
    try{
      const bitmap=await createImageBitmap(video);
      if(token!==generation||!worker){bitmap.close();return;}
      worker.postMessage({type:'FRAME',bitmap,time:now},[bitmap]);
    }catch(error){if(token===generation)stop('No se pudo leer la webcam: '+error.message);}
  }
  async function start(){
    if(active||initializing)return;
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){note('La webcam requiere localhost o HTTPS y un navegador compatible.');return;}
    if(!player.report.present.length){note('Este personaje no tiene canales faciales reconocidos. Revisa su mapa de retargeting.');return;}
    initializing=true;startButton.disabled=true;stopButton.disabled=false;camera.disabled=true;const token=++generation;
    note('Solicitando permiso para la webcam…');
    try{
      const acquired=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:25,max:30},...(camera.value?{deviceId:{exact:camera.value}}:{facingMode:'user'})}});
      if(token!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;stream.getVideoTracks()[0].addEventListener('ended',()=>stop('La cámara se desconectó. Puedes volver a activarla.'),{once:true});
      video.srcObject=stream;video.hidden=false;await video.play();if(token!==generation)return;
      await cameras();if(token!==generation)return;
      note('Cargando MediaPipe local…');
      worker=new Worker(new URL('./FaceWebcam.worker.js',import.meta.url));
      initTimer=setTimeout(()=>{if(token===generation)stop('MediaPipe tardó demasiado en cargar. Vuelve a activar la webcam.');},45000);
      worker.onerror=event=>{if(token===generation)stop('No se pudo iniciar MediaPipe: '+event.message);};
      worker.onmessage=({data})=>{
        if(token!==generation)return;
        if(data.type==='ERROR'){stop('Error de MediaPipe: '+data.message);return;}
        if(data.type==='READY'){
          clearTimeout(initTimer);initializing=false;active=true;lastVideo=-1;lastSent=0;lastResult=0;weights={};onActive(true);record.disabled=false;
          note('Webcam activa. Mira a la cámara con el rostro iluminado.');raf=requestAnimationFrame(pump);return;
        }
        if(data.type==='RESULT'){
          busy=false;face=data.face;lastResult=performance.now();raw=data.categories;calibrate.disabled=!face;blinkButton.disabled=modeSelect.value!=='normal'||!face||!!blinkCalibration;
          if(blinkCalibration){
            for(const side of ['left','right']){const name='eyeBlink'+(side==='left'?'Left':'Right'),score=raw.find(c=>c.categoryName===name)?.score||0,rest=Math.min(.85,baseline[name]||0);blinkCalibration[side]=Math.max(blinkCalibration[side],(score-rest)/(1-rest));}
            const remaining=Math.max(0,Math.ceil((blinkCalibration.end-performance.now())/1000));
            blinkStatus.textContent=`Cierra completamente cada ojo y parpadea · ${remaining} s`;
            if(!remaining){for(const side of ['left','right'])if(blinkCalibration[side]>.15)setBlink(side,blinkCalibration[side]*.9);blinkCalibration=null;blinkButton.disabled=!face;blinkStatus.textContent='Cierre calibrado por separado. Comprueba un guiño con cada ojo.';}
          }
          weights=faceWeights(face?raw:[],baseline,weights,Number(q('[data-amount]').value),Number(q('[data-smooth]').value),blink,modeSelect.value);
          const count=raw.filter(c=>player.report.present.includes(c.categoryName)).length;
          note(face?`Rostro detectado · ${count} canales compatibles${recording?' · grabando…':''}`:'No se detecta un rostro. Acércate y mejora la iluminación.');
          if(recording){
            if(face&&(!samples.length||data.time>samples.at(-1).time))samples.push({time:data.time,weights:{...weights}});
            if(data.time-recordStart>=30000){finishRecording();note('Grabación terminada. Puedes descargar el JSON facial.');}
          }
        }
      };
      worker.postMessage({type:'INIT'});
    }catch(error){if(token===generation)stop(({NotAllowedError:'Permiso de cámara denegado. Permite la cámara en el navegador para este sitio.',NotFoundError:'No se encontró una webcam conectada.',NotReadableError:'No se pudo abrir la cámara. Comprueba si otra aplicación la está usando.',OverconstrainedError:'La cámara seleccionada no está disponible. Elige otra cámara.'})[error.name]||error.message);}
  }
  startButton.onclick=start;stopButton.onclick=()=>stop();
  calibrate.onclick=()=>{if(!face)return;baseline=Object.fromEntries(raw.map(c=>[c.categoryName,c.score]));weights={};note('Rostro neutro calibrado. Ahora sonríe, parpadea o abre la boca.');};
  blinkButton.onclick=()=>{if(!face||modeSelect.value!=='normal')return;blinkCalibration={end:performance.now()+5000,left:0,right:0};blinkButton.disabled=true;blinkStatus.textContent='Cierra completamente cada ojo y parpadea durante cinco segundos.';};
  q('[data-reset]').onclick=()=>{baseline={};weights={};note('Calibración webcam restablecida.');};
  record.onclick=()=>{if(recording){finishRecording();note('Grabación terminada. Descarga el JSON para conservarla.');}else{if(samples.length&&!downloaded){note('Descarga la captura anterior antes de iniciar otra.');return;}samples=[];downloaded=false;recording=true;recordStart=performance.now();record.textContent='Finalizar grabación';download.disabled=true;}};
  download.onclick=()=>{try{const preset=webcamPreset(samples),url=URL.createObjectURL(new Blob([JSON.stringify(preset,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='captura-webcam-facial-'+Date.now()+'.json';a.click();downloaded=true;setTimeout(()=>URL.revokeObjectURL(url),10000);note('JSON descargado. Impórtalo en la biblioteca facial para aplicarlo a la historia.');}catch(error){note(error.message);}};
  const visibility=()=>{if(document.hidden&&(active||initializing))stop('Webcam detenida al salir del taller.');};
  document.addEventListener('visibilitychange',visibility);
  cameras().catch(()=>{});
  return {section,start,stop,get active(){return active;},get mouthSmile(){return ((weights.mouthSmileLeft||0)+(weights.mouthSmileRight||0))/2;},get state(){return {active,initializing,face,mode:modeSelect.value,channels:player.report.present.length,recording,samples:samples.length,blink:{...blink},rawBlink:Object.fromEntries(raw.filter(c=>c.categoryName.startsWith('eyeBlink')).map(c=>[c.categoryName,c.score])),appliedBlink:{left:weights.eyeBlinkLeft||0,right:weights.eyeBlinkRight||0}};},
    before(){if(active)player.restore();},
    apply(){if(!active)return;player.apply(performance.now()-lastResult>700?{}:weights);},
    dispose(){stop();document.removeEventListener('visibilitychange',visibility);section.remove();}};
}
