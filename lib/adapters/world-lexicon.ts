"use client";

import sensesJson from "@/generated/curriculum/a1/senses.json";
import formsJson from "@/generated/curriculum/a1/forms.json";
import releaseJson from "@/generated/curriculum/a1/release.json";
import pilotMapJson from "@/SpanStories-Ciudades/Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia/vocabulario.json";
import {
  PILOT_NOUN_ANNOTATIONS,
  createLexiconLookup,
  createNounAnnotationIndex,
  createWorldLexiconService,
  validateWorldLexiconMap,
  type WorldKnowledgePort,
  type WorldLexiconMap,
  type WorldLexiconService,
  type WorldSavedWordsPort,
} from "@/features/world-lexicon";
import { currentLearner, recordKnowledge } from "./lexical-knowledge";
import { savePracticeTargetIfAbsent } from "./practice";
import { practiceTargetKey } from '@/features/practice/domain/target';

/**
 * Conecta el mundo interactivo con el progreso real de SpanStories en este navegador:
 *   intentos y guardado → `recordKnowledge` (KnowledgeEvent) y palabras guardadas (PracticeItem).
 * No declara estados ni calcula mastery: eso lo decide `projectKnowledge` con sus propias reglas.
 */

export const LEXICON_RELEASE_ID = "A1-LEXICON-v1.0";

type RawSense = { readonly id: string; readonly lexemeId: string; readonly item: string; readonly isA1: boolean };
type RawForm = { readonly lexemeId: string; readonly surface: string; readonly relationType: string };

export function browserLexiconLookup() {
  return createLexiconLookup({
    curriculumReleaseId: releaseJson.releaseId,
    lexiconReleaseId: LEXICON_RELEASE_ID,
    senses: sensesJson as unknown as readonly RawSense[],
    forms: formsJson as unknown as readonly RawForm[],
  });
}

/** El mapa piloto de Barcelona, validado contra el registro publicado. Lanza si no es válido. */
export function pilotWorldLexiconMap(): WorldLexiconMap {
  const result = validateWorldLexiconMap(pilotMapJson, browserLexiconLookup());
  if (!result.ok) throw new Error(`Mapa léxico inválido: ${result.issues.map((i) => `${i.entryId ?? "mapa"}:${i.code}`).join(", ")}`);
  return result.map;
}

export function createBrowserKnowledgePort(owner=currentLearner()): WorldKnowledgePort {
  return { record: (event) => recordKnowledge(event, owner) };
}

export function createBrowserSavedWordsPort(owner=currentLearner()): WorldSavedWordsPort {
  return { saveIfAbsent: (target) => savePracticeTargetIfAbsent(target,owner) };
}

export function createBrowserWorldLexiconService(map: WorldLexiconMap = pilotWorldLexiconMap(),owner=currentLearner()): WorldLexiconService {
  const lookup = browserLexiconLookup();
  return createWorldLexiconService({
    map,
    lookup,
    annotations: createNounAnnotationIndex(PILOT_NOUN_ANNOTATIONS, lookup),
    knowledge: createBrowserKnowledgePort(owner),
    savedWords: createBrowserSavedWordsPort(owner),
  });
}

/** Author previews exercise the real evaluator without changing a learner's saved words/progress. */
export function createPreviewWorldLexiconService():WorldLexiconService{
  const lookup=browserLexiconLookup(),saved=new Set<string>();
  return createWorldLexiconService({map:pilotWorldLexiconMap(),lookup,annotations:createNounAnnotationIndex(PILOT_NOUN_ANNOTATIONS,lookup),knowledge:{record:()=>true},savedWords:{async saveIfAbsent(target){const key=practiceTargetKey(target);if(saved.has(key))return 'ALREADY_SAVED';saved.add(key);return 'NEWLY_SAVED';}}});
}
