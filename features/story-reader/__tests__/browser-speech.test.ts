import assert from "node:assert/strict";
import test from "node:test";
import { selectSpanishVoice } from "../browser-speech.ts";

function voice(lang: string, name: string) {
  return { lang, name } as SpeechSynthesisVoice;
}

test("prefers the requested Spanish locale", () => {
  const voices = [voice("es-MX", "México"), voice("es-ES", "España")];
  assert.equal(selectSpanishVoice(voices, "es-ES")?.name, "España");
});

test("falls back to any Spanish voice supplied by the browser", () => {
  const voices = [voice("en-US", "English"), voice("es-US", "Español")];
  assert.equal(selectSpanishVoice(voices, "es-CO")?.name, "Español");
});

test("does not select a voice from another language", () => {
  assert.equal(selectSpanishVoice([voice("en-US", "English")]), undefined);
});
