"use client";

const DAY_MS = 86_400_000;
const timeFormat = new Intl.DateTimeFormat("es", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("es", { day: "numeric", month: "short" });

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function daysAgo(date: Date, now: Date) {
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  return Math.round((start(now) - start(date)) / DAY_MS);
}

/** «Hoy, 10:42», «Ayer, 19:30» o «12 sept, 17:10». */
export function formatMoment(date: Date, now = new Date()) {
  const days = daysAgo(date, now);
  const time = timeFormat.format(date);
  if (days <= 0) return `Hoy, ${time}`;
  if (days === 1) return `Ayer, ${time}`;
  return `${dayFormat.format(date)}, ${time}`;
}

/** «hoy», «ayer», «hace 3 días» o «12 sept». */
export function formatSince(date: Date, now = new Date()) {
  const days = daysAgo(date, now);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return days < 7 ? `hace ${days} días` : dayFormat.format(date);
}

/** «hoy», «ayer» o «el 12 sept». Una fecha aún sin confirmar por el servidor cuenta como hoy. */
export function formatOn(date: Date | null, now = new Date()) {
  if (date === null) return "hoy";
  const days = daysAgo(date, now);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `el ${dayFormat.format(date)}`;
}

export const inviteUrl = (code: string) => `${window.location.origin}/join/${code}`;

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
