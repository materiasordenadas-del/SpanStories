"use client";

import { LIGHT_LIMITS, LIGHT_PRESETS, lightLabel, type LightPreset, type SceneLight } from '@/features/story-studio/light';
import { CAMERA_EASINGS, type CameraEasing } from '@/features/story-studio/motion-easing';
import styles from './story-studio.module.css';

const easingNames: Record<CameraEasing, string> = { linear: 'Ritmo constante', easeIn: 'Empieza despacio', easeOut: 'Termina despacio', easeInOut: 'Suave al empezar y al terminar' };
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Dos niveles (sol y luna) con puntos de partida con nombre. */
export function StudioLightLevels({ light, onChange, label }: { light: SceneLight; onChange: (next: SceneLight) => void; label: string }) {
  const slider = (key: keyof SceneLight, name: string) =>
    <label>{name} · {Math.round(light[key] * 100)} %<input aria-label={`${label}: ${name}`} type="range" min={LIGHT_LIMITS[key][0]} max={LIGHT_LIMITS[key][1]} step=".01" value={light[key]}
      onChange={e => onChange({ ...light, [key]: r2(Number(e.target.value)) })} /></label>;
  return <>
    <div className={styles.inlineButtons} role="group" aria-label={`${label}: puntos de partida`} style={{ flexWrap: 'wrap' }}>
      {(Object.keys(LIGHT_PRESETS) as LightPreset[]).map(k => {
        const p = LIGHT_PRESETS[k], on = p.light.sol === light.sol && p.light.luna === light.luna;
        return <button key={k} aria-pressed={on} onClick={() => onChange({ ...p.light })}>{p.label}</button>;
      })}
    </div>
    {slider('sol', 'Sol')}
    {slider('luna', 'Luna')}
  </>;
}

/**
 * Transición de luz seleccionada en la pista «Luz»: lleva la luz desde la que había al empezar (`from`)
 * hasta la elegida, a lo largo de la duración del clip y con la curva indicada.
 */
export function StudioLightCueInspector({ from, light, easing, name, onLight, onEasing, onName }: {
  from: SceneLight; light: SceneLight; easing?: CameraEasing; name: string;
  onLight: (next: SceneLight) => void; onEasing: (e: CameraEasing) => void; onName: (name: string) => void;
}) {
  return <>
    <label>Nombre de la transición<input value={name} maxLength={180} onChange={e => onName(e.target.value)} /></label>
    <p className={styles.hint}>Desde {lightLabel(from)} → hasta {lightLabel(light)}. Alarga o acorta el clip en la pista «Luz» para que la transición dure más o menos.</p>
    <StudioLightLevels light={light} onChange={onLight} label="Luz al terminar" />
    <label>Ritmo de la transición<select aria-label="Ritmo de la transición de luz" value={easing ?? 'linear'} onChange={e => onEasing(e.target.value as CameraEasing)}>
      {CAMERA_EASINGS.map(k => <option key={k} value={k}>{easingNames[k]}</option>)}
    </select></label>
  </>;
}
