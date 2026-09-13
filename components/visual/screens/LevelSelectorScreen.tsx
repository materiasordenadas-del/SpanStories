import Link from "next/link";
import { LEVELS } from "@/lib/curriculum";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";

const LEVEL_NAMES = ["Primeras frases", "Vida diaria", "Historias largas", "Matices y humor", "Literatura sin adaptar"] as const;

export function LevelSelectorScreen({ a1IslandCount, a1StoryCount }: { a1IslandCount: number; a1StoryCount: number }) {
  return <div className={`${styles.page} standalone-layer`} data-standalone="levels"><BaselineNav /><main className={styles.levelsPage}><p className={styles.eyebrow}>Contenido · A1 → C1</p><h1>Niveles.</h1><div className={styles.levelRows}>{LEVELS.map((level, index) => {
    const available = level.code === "A1";
    const content = <><span className={styles.levelCode}>{level.code}</span><div><strong>{LEVEL_NAMES[index]}</strong><span>{level.description}</span></div><small>{available ? `${a1IslandCount} islas · ${a1StoryCount} historias` : "Próximamente"}</small></>;
    return available
      ? <Link className={`${styles.levelRow} ${styles.levelLink}`} data-motion="level-row" key={level.code} href="/islas">{content}</Link>
      : <article className={`${styles.levelRow} ${styles.levelSoon}`} data-motion="level-row" key={level.code}>{content}</article>;
  })}</div></main><footer className={styles.footer}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer></div>;
}
