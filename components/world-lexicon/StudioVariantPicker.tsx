'use client';
import {useEffect, useState} from 'react';

type Variante = {id: string; nombre: string};

/** Variantes que el Editor de escenarios guardó para el lugar de esta escena (leídas del proyecto de edición vigente). */
export function StudioVariantPicker({zoneId, value, onChange}: {zoneId: string; value: string | undefined; onChange: (id: string | undefined) => void}) {
  const [variantes, setVariantes] = useState<Variante[] | null>(null);
  useEffect(() => {
    let vivo = true;
    setVariantes(null);
    (async () => {
      try {
        const zona = await (await fetch('/api/city-projects?zone=' + encodeURIComponent(zoneId), {cache: 'no-store'})).json();
        if (!zona.cityId || zona.revision === 'base') return vivo && setVariantes([]);
        const proyecto = await (await fetch('/api/city-projects?city=' + encodeURIComponent(zona.cityId), {cache: 'no-store'})).json();
        const lista = (proyecto.project?.escenario?.variantes ?? []) as Variante[];
        if (vivo) setVariantes(lista.map(v => ({id: v.id, nombre: v.nombre})));
      } catch { if (vivo) setVariantes([]); }
    })();
    return () => { vivo = false; };
  }, [zoneId]);
  if (variantes && !variantes.length && !value) return null;
  return (
    <label>Variante del escenario
      <select aria-label="Variante del escenario" value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}>
        <option value="">Escenario base</option>
        {variantes?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        {value && variantes && !variantes.some(v => v.id === value) && <option value={value}>(variante que ya no existe)</option>}
      </select>
    </label>
  );
}
