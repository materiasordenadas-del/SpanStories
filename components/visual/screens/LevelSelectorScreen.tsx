import { LEVELS } from "@/lib/curriculum";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";

export function LevelSelectorScreen() {
  return <div className={`${styles.page} standalone-layer`} data-standalone="levels"><BaselineNav /><main className={styles.levelsPage}><p className={styles.eyebrow}>Contenido · A1 → C1</p><h1>Niveles.</h1><div className={styles.levelRows}>{LEVELS.map((level, index) => {
    const content = <><span className={styles.levelCode}>{level.code}</span><div><strong>{["Primeras frases", "Vida diaria", "Historias largas", "Matices y humor", "Literatura sin adaptar"][index]}</strong><span>{level.description}</span></div><small>{index < 2 ? `${index === 0 ? 11 : 9} islas · ${index === 0 ? 32 : 31} historias` : index === 2 ? "En escritura" : "Previsto"}</small></>;
    return level.code === "A1" ? <Link className={`${styles.levelRow} ${styles.levelLink}`} data-motion="level-row" key={level.code} href="/niveles/a1">{content}</Link> : <article className={styles.levelRow} data-motion="level-row" key={level.code}>{content}</article>;
  })}</div></main><footer className={styles.footer}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer></div>;
}
import Link from "next/link";
