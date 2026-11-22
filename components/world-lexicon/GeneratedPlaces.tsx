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

/** Selector de lugar de la barra común: cambia el lugar del motor compartido sin recargar la página. */
export function PlacePicker({zone:engineZone,revision,onChange,className,service=null,onService}:{zone:string|null;revision:string|null;onChange:(zone:string,revision:string|null)=>void;className?:string;
  /** Escenario de servicio que se está viendo (restaurante, farmacia…); null = el motor. */service?:string|null;onService?:(id:string|null)=>void}){
  const zone=service?'servicio:'+service:engineZone;
  const [places,setPlaces]=useState<{id:string;label:string;revision:string;history:string[];versions:number}[]>([]),[error,setError]=useState('');
  // Todas las zonas que sabe abrir el motor: ciudades manuales (Barcelona, Madrid…), establecimientos y lugares generados.
  const [zones,setZones]=useState<{id:string;label:string;group:string}[]>([]);
  useEffect(()=>{const controller=new AbortController();fetch('/api/generated-places',{cache:'no-store',signal:controller.signal}).then(async r=>{const result=await r.json();if(Array.isArray(result.zones))setZones(result.zones);if(!r.ok)throw Error(result.error);setPlaces(result.places);setError('');}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[zone]);
  const atlas=zone?.startsWith('atlas-')?zone:'',selected=places.find(p=>p.id===atlas);
  const groups=[...new Set(zones.map(z=>z.group))];
  const known=!zone||zones.some(z=>z.id===zone)||places.some(p=>p.id===zone);
  return <span className={className}>
    <label title="Lugar que ven el Editor y el Estudio"><span>Lugar</span><select aria-label="Lugar" value={zone??''} onChange={e=>{const v=e.target.value;if(!v)return;if(v.startsWith('servicio:')){onService?.(v.slice(9));return;}onService?.(null);if(v!==engineZone)onChange(v,null);}}>
      {!zone&&<option value="">Cargando…</option>}
      {groups.map(g=><optgroup key={g} label={g}>{zones.filter(z=>z.group===g).map(z=><option key={z.id} value={z.id}>{z.label}</option>)}</optgroup>)}
      {places.length>0&&<optgroup label="Generador de mundos">{places.map(p=><option key={p.id} value={p.id}>{p.label} · v{p.versions}</option>)}</optgroup>}
      {zone&&!known&&<option value={zone}>{zone}</option>}
    </select></label>
    {selected&&!service&&<select aria-label="Versión del lugar" title="Versión del lugar" value={revision??''} onChange={e=>onChange(selected.id,e.target.value||null)}><option value="">Actual · v{selected.versions}</option>{selected.history.map((r,i)=><option key={r} value={r}>v{i+1} guardada</option>)}</select>}
    {error&&<small role="alert" title={error}>Lugares no disponibles</small>}
  </span>;
}
