"use client";

import { useMemo, useState } from "react";
import { createBrowserWorldLexiconService, createPreviewWorldLexiconService } from "@/lib/adapters/world-lexicon";
import { WorldLexiconFrame } from "./WorldLexiconFrame";
import styles from "./world-lexicon.module.css";
import { useAuth } from '@/features/accounts/AuthProvider';
import type { StudioSource } from '@/features/story-studio/model';
import {PublishedStudioPlayer} from './PublishedStudioPlayer';
import {GeneratedPlaces} from './GeneratedPlaces';
import {EngineStage} from './EngineStage';
import {CreationShell} from './CreationShell';
import {HistoriaInicio,type HistoriaAbierta} from './HistoriaInicio';

const VIEWER_URL = process.env.NODE_ENV==='development' ? "http://127.0.0.1:8877/" : (process.env.NEXT_PUBLIC_WORLD_VIEWER_URL ?? "http://127.0.0.1:8877/");

/**
 * Visor de escenarios (estudiante): página propia y ligera.
 * Generador de mundos › Editor de escenarios › Estudio › Talleres: una sola barra (CreationShell).
 * Editor y Estudio comparten un solo motor vivo; cambiar entre ellos no recarga el escenario.
 */
export function PilotWorldLexicon({generator=false,development=false,localTest=false,draft=false,narrative=false,query='',studio=false,studioSources=[],releaseId}:{development?:boolean;localTest?:boolean;draft?:boolean;narrative?:boolean;query?:string;studio?:boolean;studioSources?:StudioSource[];releaseId?:string;generator?:boolean}) {
  const {user,loading}=useAuth();
  const owner=user?`user:${user.uid}`:'guest';
  // Visor Web del estudiante y Editor: acertar no guarda; la palabra se guarda con «Guardar» (cambio de GitHub 4/11).
  const studentService = useMemo(() => createBrowserWorldLexiconService(undefined,owner,{saveOnCorrect:false}), [owner]);
  const previewService = useMemo(() => createPreviewWorldLexiconService(), []);
  // Estudio: primero el menú de historias. El motor no se carga hasta entrar en una (antes caía siempre en Barcelona).
  const [entrada,setEntrada]=useState<{historia:HistoriaAbierta;query:string}|null>(null);
  const historiaParam=new URLSearchParams(query).get('h');
  if(loading)return <main className={styles.page}>Preparando tu sesión…</main>;
  if(studio&&!entrada)return <HistoriaInicio key={owner} sources={studioSources} autoOpen={historiaParam} onOpen={historia=>{
    const params=new URLSearchParams(window.location.search);params.set('modo','estudio');params.set('h',historia.file.id);
    // El lugar de la escena donde se dejó el trabajo (no siempre la primera): al recargar se vuelve a él sin cargar el motor dos veces.
    const lastSequence=historia.file.ui?.sequenceId,scenes=historia.file.project.scenes;
    const zone=(scenes.find(s=>s.sequences.some(q=>q.id===lastSequence))??scenes[0]).zoneId;if(zone)params.set('zone',zone);else params.delete('zone');params.delete('revision');
    window.history.replaceState(window.history.state,'','?'+params.toString());
    setEntrada({historia,query:params.toString()});
  }}/>;
  if(releaseId)return <PublishedStudioPlayer key={owner+releaseId} releaseId={releaseId} sources={studioSources} viewerUrl={VIEWER_URL} service={previewService} owner={owner}/>;
  if(development||studio||generator)return <EngineStage key={owner} viewerUrl={VIEWER_URL} query={entrada?.query??query} initialMode={generator?'generador':studio?'estudio':'editor'}>
    {host=><CreationShell host={host} owner={owner} query={entrada?.query??query} studioSources={studioSources} studentService={studentService} previewService={previewService} localTest={localTest} draft={draft} initialHistoria={entrada?.historia??null}/>}
  </EngineStage>;
  const alternate=new URLSearchParams(query);
  alternate.set('modo','editor');
  return (
    <main className={styles.page} data-interactive-story>
      {process.env.NODE_ENV==='development'&&<nav className={styles.testing} aria-label="Entorno de prueba">Visor de escenarios · <a href={'?'+alternate.toString()}>Volver al Editor de escenarios</a> · <a href="?modo=estudio">Estudio</a> · <a href="?modo=generador">Generador de mundos</a><GeneratedPlaces query={query}/></nav>}
      <WorldLexiconFrame key={owner} query={query} viewerUrl={VIEWER_URL} service={studentService} development={false} localTest={localTest} draft={draft} exploration={!narrative&&!draft&&process.env.NODE_ENV==='development'} title="Barcelona: toca un objeto, escucha la palabra y escríbela" />
    </main>
  );
}
