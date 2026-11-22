"use client";

import { useState } from 'react';
import { DIRECTOR_PACES, type CameraAim, type CameraBody, type CameraRig, type DirectorPace } from '@/features/story-studio/camera-model';
import { aimFor, bodyFor, cameraPoseAt, cameraUses, createCamera, deleteCamera, duplicateCamera, editCamera, placeCameraMove, placeCameraSwitch, type DeleteCameraStrategy } from '@/features/story-studio/camera-editing';
import type { Cue, Sequence, Shot, StudioProject, StudioScene, Vec3 } from '@/features/story-studio/model';
import type { CameraEasing } from '@/features/story-studio/motion-easing';
import { StudioCameraProperties } from './StudioCameraProperties';
import styles from './story-studio.module.css';

/** Longitud focal equivalente (sensor de 24 mm de alto) para un fov vertical: lo que un operador entiende. */
export const fovToMm = (fov: number) => Math.round(12 / Math.tan(fov * Math.PI / 360));
const bodyNames: Record<CameraBody['kind'], string> = { static: 'Fija', follow: 'Sigue a un personaje', path: 'Recorre un camino', orbit: 'Gira alrededor' };
const aimNames: Record<CameraAim['kind'], string> = { fixed: 'Dirección fija', actor: 'Mira a un personaje', group: 'Encuadra a varios', point: 'Mira a un punto u objeto' };
const easingNames: Record<CameraEasing, string> = { linear: 'Velocidad constante', easeIn: 'Arranque suave', easeOut: 'Llegada suave', easeInOut: 'Arranque y llegada suaves' };
const num = (v: string, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const r2 = (n: number) => Math.round(n * 100) / 100;

type Pick = (mode: 'point' | 'entry', message: string, handler: (m: { position?: Vec3; entryId?: string | null; label?: string | null }) => void) => void;
export type CameraRigsProps = {
  project: StudioProject; scene: StudioScene; sequence: Sequence; time: number; ready: boolean;
  view: 'camera' | 'free'; onView: (view: 'camera' | 'free') => void;
  pilot: string | null; onPilot: (cameraId: string | null) => void;
  safeZones: boolean; onSafeZones: (on: boolean) => void;
  change: (next: StudioProject) => void; status: (message: string) => void;
  capture: (fn: (value: { shot: Shot; position: Vec3 }) => void) => void;
  startPick: Pick; goTo: (shot: Shot) => void; select: (cueId: string | null) => void;
  audit: () => void; auditing: boolean; auditNote: string | null;
  autoDirect?: () => void;
  onPace?: (pace: DirectorPace) => void;
};

/** Cámaras con nombre de la escena: se añade debajo de la dirección de cámara existente, sin sustituirla. */
export function StudioCameraRigs(p: CameraRigsProps) {
  const { scene } = p, cameras = scene.cameras ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [pathHeight, setPathHeight] = useState(1.6);
  const selected = cameras.find(c => c.id === selectedId) ?? null;
  const run = <T,>(op: () => T, then: (result: T) => void) => { try { then(op()); } catch (error) { p.status(error instanceof Error ? error.message : 'No se pudo cambiar la cámara.'); } };
  const edit = (fn: (camera: CameraRig) => void) => selected && run(() => editCamera(p.project, scene.id, selected.id, fn), p.change);
  const goTo = (camera: CameraRig) => { const pose = cameraPoseAt(p.project, p.sequence.id, p.time, camera.id); if (pose) { p.goTo(pose); p.status(`Vista en «${camera.name}» a ${p.time.toFixed(1)} s.`); } };
  const remove = (camera: CameraRig, strategy: DeleteCameraStrategy) => run(() => deleteCamera(p.project, scene.id, camera.id, strategy), next => {
    p.change(next); setDeleting(null); if (selectedId === camera.id) setSelectedId(null); if (p.pilot === camera.id) p.onPilot(null);
    p.status(`Cámara «${camera.name}» eliminada. Ctrl + Z para deshacer.`);
  });
  const actorOptions = scene.actors.map(a => <option key={a.id} value={a.id}>{a.name}</option>);
  const easingSelect = (value: CameraEasing | undefined, onChange: (e: CameraEasing) => void, label: string) =>
    <label>{label}<select aria-label={label} value={value ?? 'linear'} onChange={e => onChange(e.target.value as CameraEasing)}>{Object.entries(easingNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>;
  const vec = (value: Vec3, onChange: (v: Vec3) => void, label: string) => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 6 }}>{['X', 'Y', 'Z'].map((axis, i) => <label key={axis} style={{ fontSize: 10 }}>{axis}<input aria-label={`${label} ${axis}`} type="number" step=".1" value={r2(value[i])} onChange={e => { const next = [...value] as [number, number, number]; next[i] = num(e.target.value, value[i]); onChange(next); }} /></label>)}</div>;

  return <>
    <h3>Cámaras con nombre</h3>
    <p className={styles.hint}>Cada cámara tiene un único movimiento y una única orientación. La pista «Cámara» de la línea de tiempo elige cuál se ve (corte ✂ o mezcla ⤳); los planos anteriores siguen funcionando igual.</p>
    <div className={styles.inlineButtons} role="group" aria-label="Vista del escenario">
      <button aria-pressed={p.view === 'camera'} onClick={() => p.onView('camera')} title="Al buscar en la línea de tiempo, la vista sigue a la cámara de la historia">Ver por la cámara</button>
      <button aria-pressed={p.view === 'free'} onClick={() => p.onView('free')} title="Tu vista no salta ni al buscar ni al reproducir: acércate y revisa de cerca mientras el estudiante sigue viendo su cámara (pirámide y recuadro naranjas)">Vista libre</button>
    </div>
    <label className={styles.check}><input type="checkbox" checked={p.safeZones} onChange={e => p.onSafeZones(e.target.checked)} />Zonas seguras (16:9 · 4:3) y zona de subtítulos</label>
    <button className={styles.wideButton} disabled={!p.ready} onClick={() => p.capture(({ shot }) => run(() => createCamera(p.project, scene.id, shot), ({ project, id }) => { p.change(project); setSelectedId(id); p.status('Cámara creada con la vista actual.'); }))}>＋ Nueva cámara desde la vista</button>
    {p.autoDirect && <>
      <label>Ritmo del director automático<select aria-label="Ritmo del director automático" value={scene.autoDirection?.pace ?? 'tranquilo'} onChange={e => p.onPace?.(e.target.value as DirectorPace)}>{DIRECTOR_PACES.map(k => <option key={k} value={k}>{{ tranquilo: 'Tranquilo · planos de 2,5 s o más', normal: 'Normal · planos de 2 s o más', dinamico: 'Dinámico · planos de 1,5 s o más' }[k]}</option>)}</select></label>
      <button className={styles.wideButton} disabled={!scene.actors.length} onClick={p.autoDirect} title="Plano general, quien habla, quien responde y plano conjunto; conserva lo hecho o editado a mano">Proponer planos para los diálogos…</button>
    </>}
    {cameras.map(camera => {
      const uses = cameraUses(p.project, scene.id, camera.id).length, moving = camera.body.kind === 'path' || camera.body.kind === 'orbit';
      return <div key={camera.id} className={styles.optionEditor} data-selected={camera.id === selectedId}>
        <label>{camera.id === selectedId ? '● ' : ''}{camera.name}<small className={styles.coordinates}>{bodyNames[camera.body.kind]} · {aimNames[camera.aim.kind]} · {uses} {uses === 1 ? 'uso' : 'usos'}{camera.origin ? ' · propuesta' : ''}</small></label>
        <div className={styles.inlineButtons}>
          <button onClick={() => setSelectedId(camera.id === selectedId ? null : camera.id)}>{camera.id === selectedId ? 'Cerrar' : 'Editar'}</button>
          <button disabled={!p.ready} onClick={() => goTo(camera)} title="Lleva la vista a esta cámara en el instante actual">Ver</button>
          <button aria-pressed={p.pilot === camera.id} disabled={!p.ready} onClick={() => p.onPilot(p.pilot === camera.id ? null : camera.id)} title="Al mover la vista se actualiza la pose de reposo de esta cámara (un paso de deshacer por gesto)">Pilotar</button>
          <button onClick={() => run(() => placeCameraSwitch(p.project, p.sequence.id, camera.id, p.time), ({ project, id }) => { p.change(project); p.select(id); p.status(`Corte a «${camera.name}».`); })}>✂ Cortar aquí</button>
          <button disabled={!!camera.cutOnly} onClick={() => run(() => placeCameraSwitch(p.project, p.sequence.id, camera.id, p.time, { kind: 'blend', duration: 1, easing: 'easeInOut', route: 'linear' }), ({ project, id }) => { p.change(project); p.select(id); p.status(`Mezcla hacia «${camera.name}».`); })}>⤳ Mezclar aquí</button>
          {moving && <button onClick={() => run(() => placeCameraMove(p.project, p.sequence.id, camera.id, p.time), ({ project, id }) => { p.change(project); p.select(id); p.status(`Movimiento de «${camera.name}» en su pista.`); })}>＋ Movimiento</button>}
          <button onClick={() => run(() => duplicateCamera(p.project, scene.id, camera.id), ({ project, id }) => { p.change(project); setSelectedId(id); })}>Duplicar</button>
          <button className={styles.danger} onClick={() => uses ? setDeleting(camera.id) : remove(camera, { kind: 'remove-cues' })}>Borrar</button>
        </div>
        {deleting === camera.id && <div className={styles.issueNote}>
          <p>«{camera.name}» se usa {uses} {uses === 1 ? 'vez' : 'veces'}. ¿Qué hacemos con esos cambios de cámara?</p>
          <div className={styles.inlineButtons}>
            <button onClick={() => remove(camera, { kind: 'freeze' })} title="Cada cambio pasa a ser un plano fijo con la pose que tenía la cámara en ese instante">Congelar planos</button>
            <button onClick={() => remove(camera, { kind: 'remove-cues' })}>Quitar sus cambios</button>
            {cameras.length > 1 && <><select aria-label="Pasar sus cambios a" value={reassignTo} onChange={e => setReassignTo(e.target.value)}><option value="">Pasar a…</option>{cameras.filter(c => c.id !== camera.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><button disabled={!reassignTo} onClick={() => remove(camera, { kind: 'reassign', cameraId: reassignTo })}>Pasar</button></>}
            <button onClick={() => setDeleting(null)}>Cancelar</button>
          </div>
        </div>}
      </div>;
    })}
    {selected && <>
      <h4>{selected.name}</h4>
      <label>Nombre<input value={selected.name} maxLength={120} onChange={e => edit(c => { c.name = e.target.value || c.name; })} /></label>
      <StudioCameraProperties shot={selected.base} animated={false} onChange={shot => edit(c => { c.base = { ...shot, transition: 0 }; })} onCapture={() => p.capture(({ shot }) => edit(c => { c.base = { ...shot, transition: 0 }; }))} />
      <label>Movimiento<select aria-label="Movimiento de la cámara" value={selected.body.kind} onChange={e => run(() => bodyFor(e.target.value as CameraBody['kind'], scene, selected), body => edit(c => { c.body = body; }))}>{Object.entries(bodyNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {selected.body.kind === 'follow' && (() => { const b = selected.body; return <>
        <label>Personaje<select value={b.actorId} onChange={e => edit(c => { if (c.body.kind === 'follow') c.body.actorId = e.target.value; })}>{actorOptions}</select></label>
        <label>Desplazamiento respecto al personaje (m)</label>{vec(b.offset, v => edit(c => { if (c.body.kind === 'follow') c.body.offset = v; }), 'Desplazamiento')}
        <label className={styles.check}><input type="checkbox" checked={b.space === 'actor'} onChange={e => edit(c => { if (c.body.kind === 'follow') c.body.space = e.target.checked ? 'actor' : 'world'; })} />Gira con el personaje (plano lateral o de espalda)</label>
        <label>Suavizado · {b.smoothing.toFixed(1)} s<input type="range" min="0" max="3" step=".1" value={b.smoothing} onChange={e => edit(c => { if (c.body.kind === 'follow') c.body.smoothing = num(e.target.value, 0); })} /></label>
      </>; })()}
      {selected.body.kind === 'orbit' && (() => { const b = selected.body; return <>
        <label>Alrededor de<select value={b.actorId} onChange={e => edit(c => { if (c.body.kind === 'orbit') c.body.actorId = e.target.value; })}>{actorOptions}</select></label>
        <div className={styles.twoColumns}><label>Radio (m)<input type="number" min=".2" max="200" step=".1" value={b.radius} onChange={e => edit(c => { if (c.body.kind === 'orbit') c.body.radius = Math.min(200, Math.max(.2, num(e.target.value, 2.5))); })} /></label><label>Altura (m)<input type="number" step=".1" value={b.height} onChange={e => edit(c => { if (c.body.kind === 'orbit') c.body.height = num(e.target.value, 1.5); })} /></label></div>
        <div className={styles.twoColumns}><label>Desde (grados)<input type="number" step="5" value={Math.round(b.fromAngle * 180 / Math.PI)} onChange={e => edit(c => { if (c.body.kind === 'orbit') c.body.fromAngle = num(e.target.value, 0) * Math.PI / 180; })} /></label><label>Hasta (grados)<input type="number" step="5" value={Math.round(b.toAngle * 180 / Math.PI)} onChange={e => edit(c => { if (c.body.kind === 'orbit') c.body.toAngle = num(e.target.value, 0) * Math.PI / 180; })} /></label></div>
        <p className={styles.hint}>El giro avanza con los «Movimientos» de su pista en la línea de tiempo.</p>
      </>; })()}
      {selected.body.kind === 'path' && (() => { const b = selected.body; return <>
        <p className={styles.hint}>{b.points.length} {b.points.length === 1 ? 'punto' : 'puntos'}. La cámara recorre el camino con los «Movimientos» de su pista (0 % = primer punto, 100 % = último).</p>
        <div className={styles.twoColumns}><label>Altura sobre el suelo (m)<input type="number" min=".2" max="30" step=".1" value={pathHeight} onChange={e => setPathHeight(Math.min(30, Math.max(.2, num(e.target.value, 1.6))))} /></label>
          <button disabled={!p.ready || b.points.length >= 64} onClick={() => p.startPick('point', 'Haz clic en el suelo para añadir un punto al camino de la cámara.', m => { if (m.position) { const pos = m.position; edit(c => { if (c.body.kind === 'path' && c.body.points.length < 64) c.body.points.push([r2(pos[0]), r2(pos[1] + pathHeight), r2(pos[2])]); }); } })}>Añadir punto con un clic</button></div>
        {b.points.map((pt, i) => <div key={i}><label>Punto {i + 1}</label>{vec(pt, v => edit(c => { if (c.body.kind === 'path') c.body.points[i] = v; }), `Punto ${i + 1}`)}{b.points.length > 1 && <button onClick={() => edit(c => { if (c.body.kind === 'path') c.body.points.splice(i, 1); })}>Quitar punto {i + 1}</button>}</div>)}
        {easingSelect(b.easing, e => edit(c => { if (c.body.kind === 'path') c.body.easing = e; }), 'Ritmo del recorrido')}
      </>; })()}
      <label>Orientación<select aria-label="Orientación de la cámara" value={selected.aim.kind} onChange={e => run(() => aimFor(e.target.value as CameraAim['kind'], scene, selected), aim => edit(c => { c.aim = aim; }))}>{Object.entries(aimNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {selected.aim.kind === 'actor' && (() => { const a = selected.aim; return <>
        <label>Personaje<select value={a.actorId} onChange={e => edit(c => { if (c.aim.kind === 'actor') c.aim.actorId = e.target.value; })}>{actorOptions}</select></label>
        <label>Punto de mira respecto a sus pies (m)</label>{vec(a.offset, v => edit(c => { if (c.aim.kind === 'actor') c.aim.offset = v; }), 'Punto de mira')}
        <label>Suavizado · {a.smoothing.toFixed(1)} s<input type="range" min="0" max="3" step=".1" value={a.smoothing} onChange={e => edit(c => { if (c.aim.kind === 'actor') c.aim.smoothing = num(e.target.value, 0); })} /></label>
      </>; })()}
      {selected.aim.kind === 'group' && (() => { const a = selected.aim; return <>
        {scene.actors.map(actor => <label key={actor.id} className={styles.check}><input type="checkbox" checked={a.actorIds.includes(actor.id)} disabled={a.actorIds.length === 1 && a.actorIds[0] === actor.id} onChange={e => edit(c => { if (c.aim.kind === 'group') c.aim.actorIds = e.target.checked ? [...c.aim.actorIds, actor.id] : c.aim.actorIds.filter(x => x !== actor.id); })} />{actor.name}</label>)}
        <label>Suavizado · {a.smoothing.toFixed(1)} s<input type="range" min="0" max="3" step=".1" value={a.smoothing} onChange={e => edit(c => { if (c.aim.kind === 'group') c.aim.smoothing = num(e.target.value, 0); })} /></label>
      </>; })()}
      {selected.aim.kind === 'point' && (() => { const a = selected.aim; return <>
        {vec(a.point, v => edit(c => { if (c.aim.kind === 'point') { c.aim.point = v; delete c.aim.entryId; } }), 'Punto de mira')}
        <div className={styles.inlineButtons}>
          <button disabled={!p.ready} onClick={() => p.startPick('point', 'Haz clic donde debe mirar la cámara.', m => { if (m.position) { const pos = m.position; edit(c => { c.aim = { kind: 'point', point: pos }; }); } })}>Elegir punto</button>
          <button disabled={!p.ready} onClick={() => p.startPick('entry', 'Haz clic sobre el objeto al que debe mirar la cámara.', m => { if (m.position && m.entryId) { const pos = m.position, entryId = m.entryId; edit(c => { c.aim = { kind: 'point', point: pos, entryId }; }); p.status(`La cámara mira a «${m.label ?? entryId}».`); } else p.status('Ese objeto no tiene palabra en el mapa léxico de este lugar.'); })}>Elegir objeto</button>
        </div>
        {a.entryId && <small className={styles.coordinates}>Objeto léxico: {a.entryId}</small>}
      </>; })()}
      <label>Lente · {(selected.lens?.fov ?? selected.base.fov).toFixed(0)}° · {fovToMm(selected.lens?.fov ?? selected.base.fov)} mm<input aria-label="Lente de la cámara" type="range" min="10" max="100" step="1" value={selected.lens?.fov ?? selected.base.fov} onChange={e => edit(c => { c.lens = { fov: num(e.target.value, 40) }; })} /></label>
      <label className={styles.check}><input type="checkbox" checked={!!selected.cutOnly} onChange={e => edit(c => { if (e.target.checked) c.cutOnly = true; else delete c.cutOnly; })} />Esta cámara solo entra con corte</label>
    </>}
    {!!cameras.length && <><button className={styles.wideButton} disabled={!p.ready || p.auditing} onClick={p.audit} title="El escenario comprueba paredes, oclusiones y encuadre; el resultado aparece en las comprobaciones">{p.auditing ? 'Revisando cámaras…' : 'Revisar cámaras con el escenario'}</button>{p.auditNote && <p className={styles.hint}>{p.auditNote}</p>}</>}
  </>;
}

/** Inspector de un cue de cámara (Switcher o movimiento) seleccionado en la línea de tiempo. */
export function CameraCueInspector({ scene, cue, editCue }: { scene: StudioScene; cue: Extract<Cue, { kind: 'cameraSwitch' | 'cameraMove' }>; editCue: (fn: (cue: Cue) => void) => void }) {
  const cameras = scene.cameras ?? [];
  if (cue.kind === 'cameraMove') return <>
    <label>Cámara<select value={cue.cameraId} onChange={e => editCue(c => { if (c.kind === 'cameraMove') c.cameraId = e.target.value; })}>{cameras.filter(c => c.body.kind === 'path' || c.body.kind === 'orbit').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <div className={styles.twoColumns}><label>Desde · {Math.round(cue.from * 100)} %<input type="range" min="0" max="1" step=".01" value={cue.from} onChange={e => editCue(c => { if (c.kind === 'cameraMove') c.from = num(e.target.value, 0); })} /></label><label>Hasta · {Math.round(cue.to * 100)} %<input type="range" min="0" max="1" step=".01" value={cue.to} onChange={e => editCue(c => { if (c.kind === 'cameraMove') c.to = num(e.target.value, 1); })} /></label></div>
    <label>Ritmo<select value={cue.easing ?? 'linear'} onChange={e => editCue(c => { if (c.kind === 'cameraMove') c.easing = e.target.value as CameraEasing; })}>{Object.entries(easingNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
  </>;
  const t = cue.transition;
  return <>
    <label>Cámara que entra<select value={cue.cameraId} onChange={e => editCue(c => { if (c.kind === 'cameraSwitch') { c.cameraId = e.target.value; c.label = cameras.find(x => x.id === e.target.value)?.name ?? c.label; delete c.origin; } })}>{cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Transición<select value={t.kind} onChange={e => editCue(c => { if (c.kind === 'cameraSwitch') { c.transition = e.target.value === 'cut' ? { kind: 'cut' } : { kind: 'blend', duration: Math.max(.05, Math.min(30, c.duration)), easing: 'easeInOut', route: 'linear' }; delete c.origin; } })}><option value="cut">Corte</option><option value="blend">Mezcla</option></select></label>
    {t.kind === 'blend' && <>
      <label>Duración de la mezcla (s)<input type="number" min=".05" max="30" step=".1" value={t.duration} onChange={e => editCue(c => { if (c.kind === 'cameraSwitch' && c.transition.kind === 'blend') { c.transition.duration = Math.min(30, Math.max(.05, num(e.target.value, 1))); c.duration = Math.max(c.duration, c.transition.duration); delete c.origin; } })} /></label>
      <label>Recorrido<select value={t.route} onChange={e => editCue(c => { if (c.kind === 'cameraSwitch' && c.transition.kind === 'blend') { c.transition.route = e.target.value as 'linear' | 'arc'; delete c.origin; } })}><option value="linear">En línea recta</option><option value="arc">En arco alrededor de los personajes</option></select></label>
      <label>Ritmo<select value={t.easing ?? 'linear'} onChange={e => editCue(c => { if (c.kind === 'cameraSwitch' && c.transition.kind === 'blend') { c.transition.easing = e.target.value as CameraEasing; delete c.origin; } })}>{Object.entries(easingNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
    </>}
  </>;
}

/** Superposición de zonas seguras y zona de subtítulos sobre el visor (solo dirección). */
export function SafeZonesOverlay() {
  const frame = (ratio: number, label: string, color: string) => <div key={label} aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', height: '100%', maxWidth: '100%', aspectRatio: String(ratio), transform: 'translate(-50%,-50%)', border: `1px dashed ${color}`, pointerEvents: 'none' }}><span style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color }}>{label}</span></div>;
  return <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3, containerType: 'size' }}>
    {frame(16 / 9, '16:9', '#7fd3ffcc')}{frame(4 / 3, '4:3', '#ffd166cc')}
    <div style={{ position: 'absolute', left: '10%', right: '10%', bottom: '6%', height: '16%', border: '1px solid #ffffff66', background: '#ffffff12', pointerEvents: 'none' }}><span style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color: '#ffffffaa' }}>Subtítulos</span></div>
  </div>;
}
