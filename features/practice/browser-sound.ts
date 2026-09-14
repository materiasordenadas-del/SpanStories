/**
 * Sonidos breves de respuesta para la práctica, sintetizados con Web Audio.
 * No hay archivos que descargar y el volumen queda por debajo de la voz que lee la frase después.
 *
 *   correct    dos notas que suben; cada acierto seguido las sube un semitono, hasta una cuarta
 *   incorrect  dos notas graves y apagadas que bajan: avisa sin castigar
 *   finish     arpegio corto al terminar la sesión
 */

export type PracticeCue = "correct" | "incorrect" | "finish";

type Note = { readonly frequency: number; readonly start: number; readonly duration: number; readonly gain: number; readonly wave: OscillatorType };

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Context === undefined) return null;
  try {
    context ??= new Context();
  } catch {
    return null;
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

const transpose = (frequency: number, semitones: number) => frequency * 2 ** (semitones / 12);

function notesFor(cue: PracticeCue, streak: number): readonly Note[] {
  if (cue === "correct") {
    const lift = Math.min(Math.max(streak - 1, 0), 5);
    return [
      { frequency: transpose(659.25, lift), start: 0, duration: 0.16, gain: 0.16, wave: "triangle" },
      { frequency: transpose(987.77, lift), start: 0.085, duration: 0.36, gain: 0.15, wave: "triangle" },
      { frequency: transpose(1975.53, lift), start: 0.085, duration: 0.22, gain: 0.025, wave: "sine" },
    ];
  }
  if (cue === "incorrect") {
    return [
      { frequency: 233.08, start: 0, duration: 0.14, gain: 0.22, wave: "sine" },
      { frequency: 174.61, start: 0.13, duration: 0.28, gain: 0.22, wave: "sine" },
    ];
  }
  return [523.25, 659.25, 783.99, 1046.5].map((frequency, step) => ({
    frequency, start: step * 0.09, duration: step === 3 ? 0.55 : 0.16, gain: 0.13, wave: "triangle" as const,
  }));
}

/** Plays a cue. False when the browser has no Web Audio. */
export function playPracticeCue(cue: PracticeCue, options: { readonly streak?: number } = {}): boolean {
  const audio = audioContext();
  if (audio === null) return false;

  const now = audio.currentTime + 0.01;
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = cue === "incorrect" ? 900 : 6000;
  filter.connect(audio.destination);

  for (const note of notesFor(cue, options.streak ?? 1)) {
    const start = now + note.start;
    const end = start + note.duration;
    const oscillator = audio.createOscillator();
    const envelope = audio.createGain();
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(note.gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(envelope).connect(filter);
    oscillator.start(start);
    oscillator.stop(end + 0.03);
  }
  return true;
}

/** Whether this browser can play anything at all: cues or speech. */
export function canPlayPracticeSound(): boolean {
  if (typeof window === "undefined") return false;
  return "AudioContext" in window || "webkitAudioContext" in window || "speechSynthesis" in window;
}
