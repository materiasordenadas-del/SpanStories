"use client";
import {useEffect,useState} from 'react';

export function GeneratedPlaces({query}:{query:string}){
  const [places,setPlaces]=useState<{id:string;label:string;revision:string;history:string[];versions:number}[]>([]),[error,setError]=useState('');
  const zone=new URLSearchParams(query).get('zone')??'';
  const revision=new URLSearchParams(query).get('revision')??'',selected=places.find(p=>p.id===zone);
  useEffect(()=>{const controller=new AbortController();fetch('/api/generated-places',{cache:'no-store',signal:controller.signal}).then(async r=>{const result=await r.json();if(!r.ok)throw Error(result.error);setPlaces(result.places);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[]);
  return <span> · <label>Lugares del generador <select aria-label="Lugares del generador" value={zone.startsWith('atlas-')?zone:''} onChange={e=>{const params=new URLSearchParams(query);if(e.target.value)params.set('zone',e.target.value);else params.delete('zone');for(const key of ['historia','borrador','publicacion','revision'])params.delete(key);window.location.assign('?'+params.toString());}}>
    <option value="">Barcelona</option>{places.map(p=><option key={p.id} value={p.id}>{p.label} · v{p.versions}</option>)}
  </select></label>{selected&&<select aria-label="Versión del lugar" value={revision} onChange={e=>{const params=new URLSearchParams(query);if(e.target.value)params.set('revision',e.target.value);else params.delete('revision');window.location.assign('?'+params.toString());}}><option value="">Actual · v{selected.versions}</option>{selected.history.map((r,i)=><option key={r} value={r}>v{i+1} guardada</option>)}</select>}{zone.startsWith('atlas-')&&<> · <a href={'http://127.0.0.1:5179/?lugar='+encodeURIComponent(zone)+(revision?'&revision='+encodeURIComponent(revision):'')} target="_blank" rel="noopener noreferrer">Editar lugar</a></>}{!places.length&&<> · <a href="http://127.0.0.1:5179/" target="_blank" rel="noopener noreferrer">Abrir generador</a></>}{error&&<small role="alert">{error}</small>}</span>;
}
