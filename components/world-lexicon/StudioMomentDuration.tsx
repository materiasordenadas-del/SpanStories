"use client";
import {useEffect,useState} from 'react';
import {sequenceDuration,type StudioScene} from '@/features/story-studio/model';
import {resizeScene} from '@/features/story-studio/editing';
export function StudioMomentDuration({scene,sequenceId,onChange,onError}:{scene:StudioScene;sequenceId:string;onChange:(scene:StudioScene)=>void;onError:(message:string)=>void}){
  // Tras deshacer, el momento elegido puede no existir ya: se usa el primero de la escena.
  const moment=scene.sequences.find(s=>s.id===sequenceId)??scene.sequences[0],duration=sequenceDuration(moment),[value,setValue]=useState(String(duration)),[mode,setMode]=useState<'pad'|'scale'>('pad');
  useEffect(()=>setValue(String(Number(duration.toFixed(3)))),[duration,sequenceId]);
  return <details><summary>Duración total del momento · {duration.toFixed(1)} s</summary><label>Duración total (s)<input aria-label="Duración total del momento" type="number" min=".05" max="3600" step=".1" value={value} onChange={e=>setValue(e.target.value)}/></label><label>Al ajustar<select aria-label="Ajuste de duración del momento" value={mode} onChange={e=>setMode(e.target.value as 'pad'|'scale')}><option value="pad">Conservar acciones · ajustar espera final</option><option value="scale">Reescalar los tiempos del momento</option></select></label><button onClick={()=>{try{const changed=resizeScene({...scene,sequences:[moment]},Number(value),mode).sequences[0];onChange({...scene,sequences:scene.sequences.map(s=>s.id===sequenceId?changed:s)});}catch(error){onError(error instanceof Error?error.message:'Duración inválida.');}}}>Aplicar duración al momento</button><p>La pausa del estudiante conserva su condición. La velocidad de audio permanece igual.</p></details>;
}
