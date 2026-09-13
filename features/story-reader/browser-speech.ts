const DEFAULT_SPANISH_LOCALE = "es-ES";

function normalizedLanguage(language: string) {
  return language.toLocaleLowerCase("en");
}

export function selectSpanishVoice(
  voices: readonly SpeechSynthesisVoice[],
  locale = DEFAULT_SPANISH_LOCALE,
) {
  const requestedLocale = normalizedLanguage(locale);
  const requestedLanguage = requestedLocale.split("-")[0];

  return voices.find((voice) => normalizedLanguage(voice.lang) === requestedLocale)
    ?? voices.find((voice) => normalizedLanguage(voice.lang).split("-")[0] === requestedLanguage);
}

export function speakSpanish(text: string, locale = DEFAULT_SPANISH_LOCALE) {
  if (typeof window.speechSynthesis === "undefined" || typeof window.SpeechSynthesisUtterance === "undefined") return false;

  const speech = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = locale;
  utterance.rate = 0.9;

  const voice = selectSpanishVoice(speech.getVoices(), locale);
  if (voice !== undefined) utterance.voice = voice;

  speech.cancel();
  speech.speak(utterance);
  return true;
}
