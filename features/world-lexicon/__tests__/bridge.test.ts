import { test } from "node:test";
import assert from "node:assert/strict";
import { WORLD_LEXICON_CHANNEL, createHostBridge, parseAttemptMessage, type HostReplyMessage } from "../bridge/protocol.ts";
import { WorldLexiconError, type AttemptResponse } from "../engine/service.ts";

const ORIGIN = "https://spanstories.example";
const viewerWindow = { name: "visor" };
const good = { channel: WORLD_LEXICON_CHANNEL, version: 1, id: "mensaje-0001", type: "ATTEMPT", entryId: "casa", interactionId: "interaccion-0001", attemptNo: 1, typed: "casa" };
const verdict: AttemptResponse = { outcome: "CORRECT", reason: null, display: "casa", saved: "NEWLY_SAVED", recorded: true };

function setup(service?: { submitAttempt: () => Promise<AttemptResponse> }) {
  const sent: { message: HostReplyMessage; origin: string }[] = [];
  let calls = 0;
  const bridge = createHostBridge({
    service: service ?? { submitAttempt: async () => { calls++; return verdict; } },
    expectedOrigin: ORIGIN,
    expectedSource: () => viewerWindow,
    postToViewer: (message, origin) => sent.push({ message, origin }),
  });
  return { bridge, sent, calls: () => calls };
}

test("atiende un mensaje válido del origen y la ventana esperados y responde solo a ese origen", async () => {
  const { bridge, sent, calls } = setup();
  assert.equal(await bridge.handle({ origin: ORIGIN, source: viewerWindow, data: good }), true);
  assert.equal(calls(), 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].origin, ORIGIN);
  assert.notEqual(sent[0].origin, "*");
  assert.deepEqual(sent[0].message, { channel: WORLD_LEXICON_CHANNEL, version: 1, id: "mensaje-0001", type: "VERDICT", response: verdict });
});

test("ignora, sin responder, otro origen, otra ventana o una ventana ausente", async () => {
  const { bridge, sent, calls } = setup();
  assert.equal(await bridge.handle({ origin: "https://evil.example", source: viewerWindow, data: good }), false);
  assert.equal(await bridge.handle({ origin: ORIGIN, source: { name: "otra" }, data: good }), false);
  assert.equal(await bridge.handle({ origin: ORIGIN, source: null, data: good }), false);
  assert.equal(await bridge.handle({ origin: "null", source: viewerWindow, data: good }), false);
  assert.equal(calls(), 0);
  assert.equal(sent.length, 0);
});

test("ignora esquemas inválidos: canal, versión, tipo, claves extra o faltantes, tipos y rangos", async () => {
  const { bridge, sent, calls } = setup();
  const bad: unknown[] = [
    null, "texto", [], {}, { ...good, channel: "otro" }, { ...good, version: 2 }, { ...good, type: "VERDICT" },
    { ...good, extra: 1 }, { ...good, id: "x" }, { ...good, attemptNo: 0 }, { ...good, attemptNo: 1.5 }, { ...good, attemptNo: "1" },
    { ...good, typed: 5 }, { ...good, typed: "x".repeat(201) }, { ...good, entryId: "" }, { ...good, interactionId: "mal id" },
    Object.fromEntries(Object.entries(good).filter(([key]) => key !== "typed")),
    { ...good, response: verdict },
  ];
  for (const data of bad) assert.equal(await bridge.handle({ origin: ORIGIN, source: viewerWindow, data }), false, JSON.stringify(data));
  assert.equal(calls(), 0);
  assert.equal(sent.length, 0);
});

test("el visor no puede enviar un veredicto ni la respuesta esperada: el esquema no lo admite", () => {
  assert.equal(parseAttemptMessage({ ...good, expected: "casa" }), null);
  assert.equal(parseAttemptMessage({ ...good, outcome: "CORRECT" }), null);
  assert.notEqual(parseAttemptMessage(good), null);
});

test("un error del servicio responde ERROR con un código, sin detalles internos", async () => {
  const { bridge, sent } = setup({ submitAttempt: async () => { throw new WorldLexiconError("UNKNOWN_ENTRY", "detalle interno secreto"); } });
  assert.equal(await bridge.handle({ origin: ORIGIN, source: viewerWindow, data: good }), true);
  assert.deepEqual(sent[0].message, { channel: WORLD_LEXICON_CHANNEL, version: 1, id: "mensaje-0001", type: "ERROR", code: "UNKNOWN_ENTRY" });
  assert.equal(JSON.stringify(sent[0].message).includes("secreto"), false);
});

test("un fallo inesperado responde INTERNAL", async () => {
  const { bridge, sent } = setup({ submitAttempt: async () => { throw new Error("boom"); } });
  await bridge.handle({ origin: ORIGIN, source: viewerWindow, data: good });
  assert.equal((sent[0].message as { code: string }).code, "INTERNAL");
});

test("el puente no se crea con un origen comodín o inválido", () => {
  for (const expectedOrigin of ["*", "null", "", "spanstories.example", "https://spanstories.example/ruta"]) {
    assert.throws(() => createHostBridge({ service: { submitAttempt: async () => verdict }, expectedOrigin, expectedSource: () => viewerWindow, postToViewer: () => {} }), expectedOrigin);
  }
});

test("«Guardar» del visor: guarda y responde SAVED solo al origen esperado; mensajes mal formados se ignoran", async () => {
  const sent: { message: HostReplyMessage; origin: string }[] = [];
  const saves: unknown[] = [];
  const bridge = createHostBridge({
    service: { submitAttempt: async () => verdict, saveWord: async (r) => { saves.push(r); return "NEWLY_SAVED"; } },
    expectedOrigin: ORIGIN, expectedSource: () => viewerWindow, postToViewer: (message, origin) => sent.push({ message, origin }),
  });
  const save = { channel: WORLD_LEXICON_CHANNEL, version: 1, id: "mensaje-0002", type: "SAVE", entryId: "casa", interactionId: "interaccion-0001" };
  assert.equal(await bridge.handle({ origin: ORIGIN, source: viewerWindow, data: save }), true);
  assert.deepEqual(saves, [{ entryId: "casa", interactionId: "interaccion-0001" }]);
  assert.deepEqual(sent, [{ origin: ORIGIN, message: { channel: WORLD_LEXICON_CHANNEL, version: 1, id: "mensaje-0002", type: "SAVED", saved: "NEWLY_SAVED" } }]);
  assert.equal(await bridge.handle({ origin: "https://evil.example", source: viewerWindow, data: save }), false);
  assert.equal(await bridge.handle({ origin: ORIGIN, source: viewerWindow, data: { ...save, extra: 1 } }), false);
  assert.equal(await bridge.handle({ origin: ORIGIN, source: viewerWindow, data: { ...save, id: "x" } }), false);
  assert.equal(saves.length, 1);
});
