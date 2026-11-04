import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createKnowledgeEvent } from "../../learner-progress/domain/knowledge.ts";
import { projectKnowledge } from "../../learner-progress/engine/knowledge-projection.ts";
import { InMemoryKnowledgeEventRepository } from "../../learner-progress/repository/knowledge-event-repository.ts";
import { InMemoryPracticeItemRepository } from "../../practice/repository/in-memory-practice-item-repository.ts";
import { practiceTargetKey } from "../../practice/domain/target.ts";
import { createLexiconLookup } from "../domain/lexicon-lookup.ts";
import { validateWorldLexiconMap } from "../domain/scene-map.ts";
import { PILOT_NOUN_ANNOTATIONS, createNounAnnotationIndex } from "../editorial/noun-annotations.ts";
import { WorldLexiconError, createSavedWordsPort, createWorldLexiconService, type AttemptRequest, type WorldKnowledgePort } from "../engine/service.ts";

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const lookup = createLexiconLookup({
  curriculumReleaseId: read("../../../generated/curriculum/a1/release.json").releaseId,
  lexiconReleaseId: "A1-LEXICON-v1.0",
  senses: read("../../../generated/curriculum/a1/senses.json"),
  forms: read("../../../generated/curriculum/a1/forms.json"),
});
const mapResult = validateWorldLexiconMap(read("../../../SpanStories-Ciudades/Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia/vocabulario.json"), lookup);
assert.ok(mapResult.ok);
const map = mapResult.map;
const annotations = createNounAnnotationIndex(PILOT_NOUN_ANNOTATIONS, lookup);
const LEARNER = "guest";
const T0 = Date.parse("2026-10-21T10:00:00Z");

function setup(options: { failRecord?: () => boolean; failSave?: boolean } = {}) {
  const events = new InMemoryKnowledgeEventRepository();
  const items = new InMemoryPracticeItemRepository();
  let clock = T0;
  let saveCalls = 0;
  const knowledge: WorldKnowledgePort = {
    record(event) {
      if (options.failRecord?.()) return false;
      try {
        events.append(createKnowledgeEvent({ ...event, learnerId: LEARNER, occurredAt: new Date(clock).toISOString(), curriculumRelease: lookup.curriculumReleaseId, lexiconRelease: lookup.lexiconReleaseId }));
        return true;
      } catch { return false; }
    },
  };
  const real = createSavedWordsPort(items, () => new Date(clock));
  const savedWords = { saveIfAbsent: async (target: Parameters<typeof real.saveIfAbsent>[0]) => { saveCalls++; if (options.failSave) throw new Error("storage"); return real.saveIfAbsent(target); } };
  const service = createWorldLexiconService({ map, lookup, annotations, knowledge, savedWords });
  return { service, events, items, saveCalls: () => saveCalls, advance: (ms: number) => { clock += ms; } };
}
const req = (entryId: string, typed: string, attemptNo = 1, interactionId = "interaccion-0001"): AttemptRequest => ({ entryId, interactionId, attemptNo, typed });
const arbolKey = practiceTargetKey({ type: "SENSE", senseId: "SENSE-A1-000050" as never, lexemeId: "LEX-A1-000050" as never });

test("una respuesta correcta confirma, guarda la palabra y registra evidencia de producción escrita", async () => {
  const { service, events, items } = setup();
  const response = await service.submitAttempt(req("arbol", "  Árbol "));
  assert.deepEqual({ outcome: response.outcome, display: response.display, saved: response.saved, recorded: response.recorded }, { outcome: "CORRECT", display: "árbol", saved: "NEWLY_SAVED", recorded: true });
  assert.equal((await items.list()).length, 1);
  const log = events.listForLearner(LEARNER);
  assert.deepEqual(log.map((e) => e.kind).sort(), ["PRACTICE", "SAVED"]);
  const practice = log.find((e) => e.kind === "PRACTICE");
  assert.equal(practice?.targetKey, arbolKey);
  assert.equal(practice?.evidence, "FORM_RECALL");
  assert.equal(practice?.outcome, "correct");
  assert.equal(practice?.targetProductive, true);
  assert.equal(practice?.assisted, false);
});

test("una respuesta incorrecta no guarda, no muestra la ortografía y queda registrada", async () => {
  const { service, events, items } = setup();
  const response = await service.submitAttempt(req("casa", "mesa"));
  assert.equal(response.outcome, "INCORRECT");
  assert.equal(response.display, null);
  assert.equal(response.saved, null);
  assert.equal((await items.list()).length, 0);
  const [only] = events.listForLearner(LEARNER);
  assert.equal(events.listForLearner(LEARNER).length, 1);
  assert.equal(only.outcome, "incorrect");
});

test("tras un fallo, el acierto es evidencia asistida (el audio se repitió) y no avanza el estado", async () => {
  const { service, events } = setup();
  await service.submitAttempt(req("casa", "mesa", 1));
  const second = await service.submitAttempt(req("casa", "casa", 2));
  assert.equal(second.outcome, "CORRECT");
  const correct = events.listForLearner(LEARNER).find((e) => e.kind === "PRACTICE" && e.outcome === "correct");
  assert.equal(correct?.assisted, true);
});

test("una tilde ausente se acepta con corrección, se guarda y cuenta como asistida", async () => {
  const { service, events } = setup();
  const response = await service.submitAttempt(req("arbol", "arbol"));
  assert.equal(response.outcome, "CORRECT_ACCENT_MISSING");
  assert.equal(response.display, "árbol");
  assert.equal(response.saved, "NEWLY_SAVED");
  assert.equal(events.listForLearner(LEARNER).find((e) => e.kind === "PRACTICE")?.assisted, true);
});

test("artículo: el correcto se acepta y el de género equivocado nunca", async () => {
  const a = setup();
  assert.equal((await a.service.submitAttempt(req("casa", "la casa"))).outcome, "CORRECT");
  const b = setup();
  const wrong = await b.service.submitAttempt(req("casa", "el casa"));
  assert.equal(wrong.outcome, "INCORRECT");
  assert.equal(wrong.reason, "WRONG_ARTICLE");
  assert.equal((await b.items.list()).length, 0);
});

test("duplicados: reenviar el mismo intento no duplica eventos ni palabras", async () => {
  const { service, events, items, saveCalls } = setup();
  const same = req("calle", "calle");
  const [first, second, third] = await Promise.all([service.submitAttempt(same), service.submitAttempt(same), service.submitAttempt(same)]);
  assert.deepEqual(first, second); assert.deepEqual(second, third);
  assert.equal((await service.submitAttempt(same)).saved, "NEWLY_SAVED", "la repetición devuelve el resultado original");
  assert.equal(saveCalls(), 1);
  assert.equal((await items.list()).length, 1);
  assert.equal(events.listForLearner(LEARNER).length, 2);
});

test("duplicados: una vez acertada, la interacción se cierra y no registra más intentos", async () => {
  const { service, events } = setup();
  await service.submitAttempt(req("calle", "calle", 1));
  const late = await service.submitAttempt(req("calle", "mesa", 2));
  assert.equal(late.outcome, "CORRECT");
  assert.equal(events.listForLearner(LEARNER).filter((e) => e.kind === "PRACTICE").length, 1);
});

test("duplicados: volver a acertar una palabra ya guardada no crea otra copia", async () => {
  const { service, items, events } = setup();
  await service.submitAttempt(req("iglesia", "iglesia", 1, "interaccion-0001"));
  const again = await service.submitAttempt(req("iglesia", "iglesia", 1, "interaccion-0002"));
  assert.equal(again.saved, "ALREADY_SAVED");
  assert.equal((await items.list()).length, 1);
  assert.equal(events.listForLearner(LEARNER).filter((e) => e.kind === "SAVED").length, 1);
});

test("guardados concurrentes de la misma palabra desde dos interacciones guardan una sola vez", async () => {
  const { service, items } = setup();
  const [a, b] = await Promise.all([service.submitAttempt(req("arbol", "arbol", 1, "interaccion-0001")), service.submitAttempt(req("arbol", "árbol", 1, "interaccion-0002"))]);
  assert.deepEqual([a.saved, b.saved].sort(), ["ALREADY_SAVED", "NEWLY_SAVED"]);
  assert.equal((await items.list()).length, 1);
});

test("acertar NO declara «Conocida» ni calcula mastery: ni siquiera con varios aciertos seguidos", async () => {
  const { service, events, advance } = setup();
  for (let i = 1; i <= 6; i++) { await service.submitAttempt(req("arbol", "árbol", 1, `interaccion-${String(i).padStart(4, "0")}`)); advance(120_000); }
  const log = events.listForLearner(LEARNER);
  assert.equal(log.some((e) => e.kind === "STATE_DECLARED"), false);
  const projection = projectKnowledge(log, LEARNER, arbolKey, true, new Date(T0 + 7 * 60_000).toISOString());
  assert.notEqual(projection.computedState, "KNOWN");
  assert.equal(projection.declaredState ?? null, null);
  assert.equal(JSON.stringify(log).includes("mastery"), false);
});

test("si el intento no puede registrarse, no hay acierto visible, no se guarda y se puede reintentar", async () => {
  let failing = true;
  const { service, items } = setup({ failRecord: () => failing });
  const lost = await service.submitAttempt(req("casa", "casa"));
  assert.equal(lost.recorded, false);
  assert.equal(lost.display, null);
  assert.equal(lost.saved, null);
  assert.equal((await items.list()).length, 0);
  failing = false;
  const retry = await service.submitAttempt(req("casa", "casa"));
  assert.equal(retry.recorded, true);
  assert.equal(retry.saved, "NEWLY_SAVED");
});

test("si el guardado falla, el acierto queda registrado pero el estudiante no recibe una confirmación de guardado falsa", async () => {
  const { service } = setup({ failSave: true });
  const response = await service.submitAttempt(req("casa", "casa"));
  assert.equal(response.outcome, "CORRECT");
  assert.equal(response.saved, null);
});

test("solicitudes inválidas o entradas desconocidas se rechazan sin efectos", async () => {
  const { service, events } = setup();
  await assert.rejects(service.submitAttempt(req("no-existe", "x")), (e: unknown) => e instanceof WorldLexiconError && e.code === "UNKNOWN_ENTRY");
  await assert.rejects(service.submitAttempt(req("casa", "casa", 0)), (e: unknown) => e instanceof WorldLexiconError && e.code === "INVALID_REQUEST");
  await assert.rejects(service.submitAttempt(req("casa", "casa", 1, "x")), (e: unknown) => e instanceof WorldLexiconError && e.code === "INVALID_REQUEST");
  await assert.rejects(service.submitAttempt({ entryId: "casa", interactionId: "interaccion-0001", attemptNo: 1, typed: 7 as never }), WorldLexiconError);
  assert.equal(events.listForLearner(LEARNER).length, 0);
});

test("una interacción no puede cambiar de objeto a mitad de camino", async () => {
  const { service } = setup();
  await service.submitAttempt(req("casa", "mesa", 1, "interaccion-0009"));
  await assert.rejects(service.submitAttempt(req("calle", "calle", 2, "interaccion-0009")), (e: unknown) => e instanceof WorldLexiconError && e.code === "INVALID_REQUEST");
});

test("el servicio rechaza un mapa de otra versión del currículo", () => {
  assert.throws(() => createWorldLexiconService({ map: { ...map, curriculumReleaseId: "A1-CURRICULUM-v0" }, lookup, annotations, knowledge: { record: () => true }, savedWords: { saveIfAbsent: async () => "NEWLY_SAVED" } }), WorldLexiconError);
});

test('la escena habilita solo sus objetos y atribuye evidencia a la versión narrativa',async()=>{
  const {service,events}=setup();service.setScene!(['arbol'],'storyver-barcelona-piloto-1');
  await assert.rejects(service.submitAttempt(req('casa','casa')),WorldLexiconError);
  await service.submitAttempt(req('arbol','árbol'));
  assert.ok(events.listForLearner(LEARNER).every(e=>e.storyVersionId==='storyver-barcelona-piloto-1'));
});
test('encontrar y escuchar son exposiciones distintas, sin PRACTICE ni dominio',()=>{
  const {service,events}=setup();service.setScene!(['arbol'],null);
  for(const exposure of ['OBJECT','AUDIO','AUDIO'] as const)assert.ok(service.recordExposure!({entryId:'arbol',interactionId:'exposicion-0001',exposure}));
  const log=events.listForLearner(LEARNER);assert.equal(log.length,2);assert.deepEqual(log.map(e=>e.exposure),['OBJECT','AUDIO']);assert.ok(log.every(e=>e.kind!=='PRACTICE'&&e.kind!=='STATE_DECLARED'));
});
test('reintentar un guardado fallido no duplica el intento ni exige escribir otra respuesta',async()=>{
  const options={failSave:true},state=setup(options),request=req('calle','calle');
  assert.equal((await state.service.submitAttempt(request)).saved,null);
  state.advance(1000);options.failSave=false;
  assert.equal((await state.service.submitAttempt(request)).saved,'NEWLY_SAVED');
  assert.equal(state.events.listForLearner(LEARNER).filter(e=>e.kind==='PRACTICE').length,1);
  assert.equal((await state.items.list()).length,1);
});
