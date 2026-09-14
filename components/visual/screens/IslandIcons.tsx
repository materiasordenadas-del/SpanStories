import type { ReactNode } from "react";

const INK = "#201e1d";
const SEA = "#1d4e5f";

/** Dibujo de cada isla de A1 por número global. Decorativo: el nombre de la isla va siempre en texto. */
const ICONS: Readonly<Record<string, ReactNode>> = {
  "01": <><path fill="#fff" d="M10 12h28a4 4 0 0 1 4 4v13a4 4 0 0 1-4 4H22l-8 7v-7h-4a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" /><path fill={SEA} d="M30 28h22a4 4 0 0 1 4 4v11a4 4 0 0 1-4 4h-3v7l-8-7H30a4 4 0 0 1-4-4V32a4 4 0 0 1 4-4z" /></>,
  "02": <><rect fill="#fff" x="8" y="16" width="48" height="34" rx="4" /><circle fill={SEA} cx="23" cy="29" r="5.5" /><path d="M14 43c3-7 15-7 18 0M38 27h12M38 34h12M38 41h7" /></>,
  "03": <><path fill="#fff" d="M16 28v24h32V28" /><path fill={SEA} d="M28 52V38h8v14" /><path d="M10 31 32 12l22 19" /></>,
  "04": <><circle fill="#fff" cx="32" cy="35" r="19" /><path d="M32 35V24M32 35l8 5M25 10h14M32 10v6" /><circle fill={SEA} stroke="none" cx="32" cy="35" r="3" /></>,
  "05": <><path fill="#fff" d="M32 19c-7-5-15-5-22-3v32c7-2 15-2 22 3 7-5 15-5 22-3V16c-7-2-15-2-22 3z" /><path d="M32 19v32" /><path fill={SEA} d="M40 15v14l3.5-3 3.5 3V14" /></>,
  "06": <><path d="M12 54h40" /><path fill={SEA} d="M32 50S16 36 16 24a16 16 0 0 1 32 0c0 12-16 26-16 26z" /><circle fill="#fff" cx="32" cy="24" r="6" /></>,
  "07": <><path fill="#fff" d="M13 24h38l-3 30H16z" /><path d="M24 24v-4a8 8 0 0 1 16 0v4" /><path stroke={SEA} strokeWidth="5" d="M17 37h30" /></>,
  "08": <><path fill={SEA} d="M8 20h48v8a4 4 0 0 0 0 8v8H8v-8a4 4 0 0 0 0-8z" /><path stroke="#fff" strokeDasharray="3 4" d="M40 24v16" /><path stroke="#fff" d="M17 29h14M17 35h9" /></>,
  "09": <><path d="M25 22v-6h14v6" /><rect fill={SEA} x="10" y="22" width="44" height="30" rx="4" /><path stroke="#fff" d="M22 26v22M42 26v22" /></>,
  "10": <><path fill="#fff" d="M12 12h40a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H30l-10 9v-9h-8a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" /><path stroke={SEA} strokeWidth="3" d="M26.5 22a5.5 5.5 0 1 1 7.5 5.2c-1.6.7-2 1.8-2 3.3" /><circle fill={SEA} stroke="none" cx="32" cy="36" r="2" /></>,
  "11": <><rect fill="#fff" x="15" y="9" width="34" height="46" rx="3" /><circle fill={SEA} cx="32" cy="21" r="5" /><path d="M23 32h18M23 39h18M23 46h11" /></>,
};

export function IslandIcon({ number, className }: { number: string; className?: string }) {
  return <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <g fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{ICONS[number] ?? ICONS["11"]}</g>
  </svg>;
}

export function LockGlyph({ size }: { size: number }) {
  return <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" strokeWidth="2" /></svg>;
}
