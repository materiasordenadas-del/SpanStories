"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import t from "./teacher.module.css";

export function PlusIcon() {
  return <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" /></svg>;
}

export function MenuIcon() {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>;
}

export function ChevronIcon() {
  return <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" fill="none" stroke="#605d5d" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>;
}

export function ChartIcon() {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" /></svg>;
}

export function TaskIcon() {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m8 12.3 2.7 2.7L16.2 9.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;
}

function DotsIcon() {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2" fill="currentColor" /><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="19" cy="12" r="2" fill="currentColor" /></svg>;
}

/** Barra de «X de Y». */
export function Bar({ value, total, label }: { value: number; total: number; label: string }) {
  return <div aria-label={label} className={t.bar} role="img"><i style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }} /></div>;
}

/** Menú «…» de una tarjeta. Se cierra al elegir, al pulsar fuera o con Escape. */
export function MoreMenu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => { if (!wrapRef.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return <div className={t.moreWrap} ref={wrapRef}>
    <button aria-expanded={open} aria-label={label} className={t.dots} onClick={() => setOpen(!open)} type="button"><DotsIcon /></button>
    {open ? <div className={t.menu}>{children(() => setOpen(false))}</div> : null}
  </div>;
}

/* ── Avatares ── */

const TINTS = ["#fdeee9", "#e7f0f1", "#f8f1e6", "#eaeef5", "#eef3e8"];
const SKINS = ["#e9b48f", "#c68a62", "#f2cfb1", "#e0b48c", "#9a6646"];
const HAIRS = ["#3a2a22", "#1f1a17", "#c99a45", "#141212", "#6b3b24"];
const SHIRTS = ["#1b2a4a", "#ff5a3c", "#1d4e5f", "#201e1d"];

type AvatarLook = { readonly tint: string; readonly skin: string; readonly hair: string; readonly shirt: string; readonly long: boolean };

function hash(seed: string) {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Siempre el mismo aspecto para la misma cuenta. No representa a la persona: solo distingue tarjetas. */
function avatarLook(seed: string): AvatarLook {
  const value = hash(seed);
  return {
    tint: TINTS[value % TINTS.length],
    skin: SKINS[(value >>> 3) % SKINS.length],
    hair: HAIRS[(value >>> 6) % HAIRS.length],
    shirt: SHIRTS[(value >>> 9) % SHIRTS.length],
    long: ((value >>> 12) & 1) === 1,
  };
}

export const tintStyle = (tint: string) => ({ "--tint": tint }) as CSSProperties;
export const avatarTint = (seed: string) => avatarLook(seed).tint;

/** Figura plana sin rostro. */
export function AvatarFigure({ seed }: { seed: string }) {
  const look = avatarLook(seed);
  const fringe = look.long
    ? "M26 33c1-9 7-14 14-14s13 5 14 14c-4-4-9-6-14-6s-10 2-14 6z"
    : "M26 33c0-10 6-15 14-15s14 5 14 15c-3-4-8-6-14-6s-11 2-14 6z";
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 80 80">
    {look.long ? <path d="M25 35c0-11 7-18 15-18s15 7 15 18v17H25z" fill={look.hair} /> : null}
    <path d="M13 80c0-16 12-26 27-26s27 10 27 26z" fill={look.shirt} />
    <rect x="34" y="42" width="12" height="14" rx="5" fill={look.skin} />
    <circle cx="40" cy="34" r="14" fill={look.skin} />
    <path d={fringe} fill={look.hair} />
    <path d="M34 56l6 6 6-6" fill="none" stroke="#fff" strokeOpacity=".55" strokeLinecap="round" strokeWidth="2" />
  </svg>;
}

/** Silueta discontinua: invitación que nadie ha usado. */
export function PendingFigure() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 80 80"><circle cx="40" cy="33" r="13" fill="none" stroke="#aaa4a3" strokeWidth="2.2" strokeDasharray="5 4" /><path d="M14 80c0-15 11-25 26-25s26 10 26 25" fill="none" stroke="#aaa4a3" strokeWidth="2.2" strokeDasharray="5 4" /></svg>;
}

export function MiniAvatar({ seed }: { seed: string }) {
  return <span aria-hidden="true" className={t.mini} style={tintStyle(avatarTint(seed))}><AvatarFigure seed={seed} /></span>;
}
