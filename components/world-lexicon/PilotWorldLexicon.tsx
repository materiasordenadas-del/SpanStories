"use client";

import { useMemo } from "react";
import { createBrowserWorldLexiconService, createPreviewWorldLexiconService } from "@/lib/adapters/world-lexicon";
import { WorldLexiconFrame } from "./WorldLexiconFrame";
import styles from "./world-lexicon.module.css";
import { useAuth } from '@/features/accounts/AuthProvider';
import { StoryStudio } from './StoryStudio';
import type { StudioSource } from '@/features/story-studio/model';
import {PublishedStudioPlayer} from './PublishedStudioPlayer';
import {GeneratedPlaces} from './GeneratedPlaces';

const VIEWER_URL = process.env.NODE_ENV==='development' ? "http://127.0.0.1:8877/" : (process.env.NEXT_PUBLIC_WORLD_VIEWER_URL ?? "http://127.0.0.1:8877/");

/** Piloto local: cinco identidades publicadas, sin ampliar el currículo. */
export function PilotWorldLexicon({development=false,localTest=false,draft=false,narrative=false,query='',studio=false,studioSources=[],releaseId}:{development?:boolean;localTest?:boolean;draft?:boolean;narrative?:boolean;query?:string;studio?:boolean;studioSources?:StudioSource[];releaseId?:string}) {
  const {user,loading}=useAuth();
  const owner=user?`user:${user.uid}`:'guest';
  const service = useMemo(() => studio?createPreviewWorldLexiconService():createBrowserWorldLexiconService(undefined,owner), [owner,studio]);
  const alternate=new URLSearchParams(query);
  alternate.set('modo',development?'visor':'desarrollo');
  if(loading)return <main className={styles.page}>Preparando tu sesión…</main>;
  if(releaseId)return <PublishedStudioPlayer key={owner+releaseId} releaseId={releaseId} sources={studioSources} viewerUrl={VIEWER_URL} service={service} owner={owner}/>;
  if(studio)return <StoryStudio key={owner} viewerUrl={VIEWER_URL} service={service} owner={owner} sources={studioSources} />;
  return (
    <main className={styles.page} data-interactive-story>
      {process.env.NODE_ENV==='development'&&<nav className={styles.testing} aria-label="Entorno de prueba">{development?'Desarrollo':'Visor Web'} · <a href={'?'+alternate.toString()}>{development?'Vista previa del Visor Web':'Volver a Desarrollo'}</a> · <a href="?modo=historia">Editar historia</a><GeneratedPlaces query={query}/></nav>}
      <WorldLexiconFrame key={owner} query={query} viewerUrl={VIEWER_URL} service={service} development={development} localTest={localTest} draft={draft} exploration={!development&&!narrative&&!draft&&process.env.NODE_ENV==='development'} title="Barcelona: toca un objeto, escucha la palabra y escríbela" />
    </main>
  );
}
