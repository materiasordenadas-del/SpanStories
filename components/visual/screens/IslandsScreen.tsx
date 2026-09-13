import Link from "next/link";
import type { A1Island } from "@/lib/adapters/a1-catalog";
import { BaselineNav } from "../layouts/BaselineNav";
import { IslandGrid } from "./IslandGrid";
import styles from "./baseline.module.css";

export function IslandsScreen({ islands, moduleCount }: { islands: readonly A1Island[]; moduleCount: number }) {
  return <div className={`${styles.page} standalone-layer`} data-standalone="islands">
    <BaselineNav />
    <main className={styles.islandsPage}>
      <div className={styles.islandsHeader}><div><p className={styles.eyebrow}>A1 · Primeras frases</p><h1>Islas.</h1></div><Link className={`${styles.button} ${styles.secondary}`} href="/progreso">Ver progreso</Link></div>
      <p className={styles.islandsIntro}>{islands.length} islas en {moduleCount} módulos. Cada isla reúne historias que se conectan.</p>
      <IslandGrid islands={islands} />
    </main>
    <footer className={styles.footer}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer>
  </div>;
}
