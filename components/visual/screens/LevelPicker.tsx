"use client";

import { useEffect, useState } from "react";
import levels from "./levels.module.css";

export type LevelPickerEntry = { readonly code: string; readonly slug: string; readonly name: string };

export function LevelPicker({ entries }: { entries: readonly LevelPickerEntry[] }) {
  const [current, setCurrent] = useState(entries[0]?.slug);

  useEffect(() => {
    const sections = entries.map((entry) => document.getElementById(entry.slug)).filter((section): section is HTMLElement => section !== null);
    if (sections.length === 0 || !("IntersectionObserver" in window)) return;
    // El selector marca el nivel que ocupa el centro de la pantalla.
    const observer = new IntersectionObserver((items) => {
      for (const item of items) if (item.isIntersecting) setCurrent(item.target.id);
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [entries]);

  return <nav className={levels.levelPicker} aria-label="Ir a un nivel">
    {entries.map((entry) => <a aria-current={current === entry.slug ? "true" : undefined} href={`#${entry.slug}`} key={entry.slug}><b>{entry.code}</b><span>{entry.name}</span></a>)}
  </nav>;
}
