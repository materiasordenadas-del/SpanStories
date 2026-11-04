import type { KnowledgeEvent } from "../../learner-progress/domain/knowledge.ts";
import { createPracticeItem } from "../../practice/domain/item.ts";
import { practiceTargetKey, type PracticeTarget } from "../../practice/domain/target.ts";
import type { PracticeItemRepository } from "../../practice/repository/practice-item-repository.ts";
import {
  evaluateAttempt,
  type AttemptExpectation,
  type AttemptOutcome,
  type AttemptReason,
} from "../domain/attempt.ts";
import type { LexiconLookup } from "../domain/lexicon-lookup.ts";
import type { WorldLexiconEntry, WorldLexiconMap } from "../domain/scene-map.ts";
import { acceptedArticlesFor, type NounAnnotationIndex } from "../editorial/noun-annotations.ts";

/**
 * Servicio de intentos del mundo interactivo (lado anfitrión).
 *
 * Es la autoridad: valida la palabra contra el registro publicado, registra
 * cada intento como evidencia (`KnowledgeEvent` PRACTICE) y guarda la palabra
 * (`PracticeItem` + evento SAVED) con los contratos existentes.
 *
 * Lo que NO hace, por diseño:
 *   - no emite STATE_DECLARED ni toca `declaredState`: acertar no declara «Conocida»;
 *   - no calcula mastery ni porcentajes: la proyección existente decide el estado
 *     calculado a partir de los eventos, con sus propias reglas de independencia;
 *   - no se fía del visor: recibe texto escrito, nunca un veredicto.
 *
 * Evidencia registrada por intento:
 *   evidence = FORM_RECALL (escribir la forma de la palabra), targetProductive = true.
 *   assisted = true cuando el intento NO es evidencia independiente: segundo intento
 *   o posterior tras un fallo (el audio se repitió) o tilde ausente aceptada.
 *   La proyección existente excluye los éxitos asistidos del avance de estado.
 */

export type SavedStatus = "NEWLY_SAVED" | "ALREADY_SAVED";

export type AttemptRequest = {
  readonly entryId: string;
  readonly interactionId: string;
  readonly attemptNo: number;
  readonly typed: string;
};

export type AttemptResponse = {
  readonly outcome: AttemptOutcome;
  readonly reason: AttemptReason | null;
  /** Solo tras acertar y registrar. Nunca hay ortografía en un fallo. */
  readonly display: string | null;
  readonly saved: SavedStatus | null;
  /** false = el intento no pudo registrarse: el visor no debe mostrar acierto ni la palabra. */
  readonly recorded: boolean;
};

export type WorldKnowledgeEvent = Omit<KnowledgeEvent, "learnerId" | "occurredAt" | "curriculumRelease" | "lexiconRelease"> & {
  readonly eventId: string;
};

export interface WorldKnowledgePort {
  /** Devuelve false si el evento no pudo guardarse (nunca lanza). */
  record(event: WorldKnowledgeEvent): boolean;
}

export interface WorldSavedWordsPort {
  /** Idempotente por objetivo: guardar dos veces la misma palabra conserva el primer guardado. */
  saveIfAbsent(target: PracticeTarget): Promise<SavedStatus>;
}

export type WorldLexiconErrorCode = "UNKNOWN_ENTRY" | "INVALID_REQUEST" | "UNPUBLISHED_ENTRY";

export class WorldLexiconError extends Error {
  readonly code: WorldLexiconErrorCode;
  constructor(code: WorldLexiconErrorCode, message: string) {
    super(message);
    this.name = "WorldLexiconError";
    this.code = code;
  }
}

export interface WorldLexiconService {
  submitAttempt(request: AttemptRequest): Promise<AttemptResponse>;
  entryIds(): readonly string[];
  setScene?(entryIds:readonly string[],storyVersionId:string|null):void;
  recordExposure?(request:{entryId:string;interactionId:string;exposure:'OBJECT'|'AUDIO'}):boolean;
}

export function createSavedWordsPort(repository: PracticeItemRepository, now: () => Date = () => new Date()): WorldSavedWordsPort {
  return {
    async saveIfAbsent(target) {
      if (await repository.has(target)) return "ALREADY_SAVED";
      await repository.save(createPracticeItem({ target, savedAt: now(), savedFrom: null }));
      return "NEWLY_SAVED";
    },
  };
}

type PreparedEntry = {
  readonly entry: WorldLexiconEntry;
  readonly target: PracticeTarget;
  readonly targetKey: string;
  readonly expectation: AttemptExpectation;
};

type Closed = { readonly entryId: string; readonly response: AttemptResponse };

const INTERACTION_ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_ATTEMPT_NO = 50;
const CACHE_LIMIT = 1000;

function remember<K, V>(map: Map<K, V>, key: K, value: V): void {
  map.set(key, value);
  if (map.size > CACHE_LIMIT) map.delete(map.keys().next().value as K);
}

export function createWorldLexiconService(input: {
  readonly map: WorldLexiconMap;
  readonly lookup: LexiconLookup;
  readonly annotations: NounAnnotationIndex;
  readonly knowledge: WorldKnowledgePort;
  readonly savedWords: WorldSavedWordsPort;
}): WorldLexiconService {
  const { map, lookup, annotations, knowledge, savedWords } = input;
  if (map.curriculumReleaseId !== lookup.curriculumReleaseId || map.lexiconReleaseId !== lookup.lexiconReleaseId) {
    throw new WorldLexiconError("UNPUBLISHED_ENTRY", "El mapa no corresponde a la versión publicada del currículo.");
  }

  const prepared = new Map<string, PreparedEntry>();
  for (const entry of map.entries) {
    const facts = lookup.senseFacts(entry.senseId);
    if (facts === null || !facts.isA1 || facts.lexemeId !== entry.lexemeId || facts.canonicalForms.length === 0) {
      throw new WorldLexiconError("UNPUBLISHED_ENTRY", `La entrada ${entry.id} no apunta a un Sense A1 publicado.`);
    }
    const target: PracticeTarget = { type: "SENSE", senseId: facts.senseId, lexemeId: facts.lexemeId };
    prepared.set(entry.id, {
      entry,
      target,
      targetKey: practiceTargetKey(target),
      expectation: {
        forms: facts.canonicalForms,
        accentPolicy: entry.accentPolicy,
        acceptedArticles: acceptedArticlesFor(annotations.get(entry.senseId)),
      },
    });
  }

  const done = new Map<string, AttemptResponse>();
  const inflight = new Map<string, Promise<AttemptResponse>>();
  const recordedOutcomes=new Map<string,{verdict:ReturnType<typeof evaluateAttempt>;storyContext:string|null}>();
  const closed = new Map<string, Closed>();
  const boundEntry = new Map<string, string>();
  let saveChain: Promise<unknown> = Promise.resolve();
  let enabled:Set<string>|null=null;
  let storyVersionId:string|null=null;
  const exposures=new Set<string>();

  function saveOnce(target: PracticeTarget): Promise<SavedStatus | null> {
    const run = saveChain.then(async () => {
      try {
        return await savedWords.saveIfAbsent(target);
      } catch {
        return null;
      }
    });
    saveChain = run;
    return run;
  }

  async function process(request: AttemptRequest, item: PreparedEntry, key: string): Promise<AttemptResponse> {
    const previous=recordedOutcomes.get(key);
    const storyContext=previous?previous.storyContext:storyVersionId;
    const verdict = previous?.verdict??evaluateAttempt(request.typed, item.expectation);
    const accepted = verdict.outcome !== "INCORRECT";
    const assisted = request.attemptNo > 1 || verdict.outcome === "CORRECT_ACCENT_MISSING";
    const attemptId = `${request.interactionId}:${request.attemptNo}`;
    const recorded = !!previous||knowledge.record({
      eventId: `world:${attemptId}`,
      kind: "PRACTICE",
      targetKey: item.targetKey,
      storyVersionId: storyContext,
      occurrenceId: null,
      practiceSessionId: request.interactionId,
      attemptId,
      evidence: "FORM_RECALL",
      outcome: accepted ? "correct" : "incorrect",
      assisted,
      targetProductive: true,
    });
    if (!recorded) {
      // Un intento sin registrar no se cachea ni se muestra como acierto: puede reintentarse.
      return { outcome: verdict.outcome, reason: verdict.reason, display: null, saved: null, recorded: false };
    }
    remember(recordedOutcomes,key,{verdict,storyContext});
    let saved: SavedStatus | null = null;
    if (accepted) {
      saved = await saveOnce(item.target);
      if (saved === "NEWLY_SAVED") {
        knowledge.record({
          eventId: `world-saved:${request.interactionId}`,
          kind: "SAVED",
          targetKey: item.targetKey,
          storyVersionId: storyContext,
          occurrenceId: null,
        });
      }
    }
    const response: AttemptResponse = {
      outcome: verdict.outcome,
      reason: verdict.reason,
      display: accepted ? verdict.display : null,
      saved,
      recorded: true,
    };
    if(!accepted||saved)remember(done, key, response);
    if (accepted&&saved) remember(closed, request.interactionId, { entryId: item.entry.id, response });
    return response;
  }

  return {
    entryIds: () => [...prepared.keys()],
    recordExposure(request){
      const item=prepared.get(request.entryId);
      if(!item||!INTERACTION_ID.test(request.interactionId)||!['OBJECT','AUDIO'].includes(request.exposure)||(enabled&&!enabled.has(request.entryId)))return false;
      const eventId=`world-exposure:${request.interactionId}:${request.exposure}`;
      if(exposures.has(eventId))return true;
      const recorded=knowledge.record({eventId,kind:request.exposure==='OBJECT'?'OCCURRENCE_ENCOUNTERED':'OCCURRENCE_OPENED',exposure:request.exposure,targetKey:item.targetKey,storyVersionId,occurrenceId:null});
      if(recorded)exposures.add(eventId);return recorded;
    },
    setScene(ids,version){
      if(ids.some(id=>!prepared.has(id)))throw new WorldLexiconError('UNKNOWN_ENTRY','Entrada narrativa desconocida.');
      enabled=new Set(ids);storyVersionId=version;
    },
    async submitAttempt(request) {
      if (
        typeof request?.entryId !== "string" ||
        typeof request.interactionId !== "string" ||
        !INTERACTION_ID.test(request.interactionId) ||
        !Number.isInteger(request.attemptNo) ||
        request.attemptNo < 1 ||
        request.attemptNo > MAX_ATTEMPT_NO ||
        typeof request.typed !== "string"
      ) {
        throw new WorldLexiconError("INVALID_REQUEST", "Solicitud de intento inválida.");
      }
      const item = prepared.get(request.entryId);
      if (item === undefined) throw new WorldLexiconError("UNKNOWN_ENTRY", "La entrada no existe en el mapa.");
      if(enabled&&!enabled.has(item.entry.id))throw new WorldLexiconError('UNKNOWN_ENTRY','Objeto no habilitado en esta escena.');
      const bound = boundEntry.get(request.interactionId);
      if (bound !== undefined && bound !== item.entry.id) {
        throw new WorldLexiconError("INVALID_REQUEST", "La interacción pertenece a otra entrada.");
      }
      remember(boundEntry, request.interactionId, item.entry.id);

      const finished = closed.get(request.interactionId);
      if (finished !== undefined) return finished.response;
      const key = `${request.interactionId}:${request.attemptNo}`;
      const cached = done.get(key);
      if (cached !== undefined) return cached;
      const pending = inflight.get(key);
      if (pending !== undefined) return pending;

      const run = process(request, item, key).finally(() => inflight.delete(key));
      inflight.set(key, run);
      return run;
    },
  };
}
