import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";

const islands = [
  ["01", "El mercado", "6/6 lecciones", "completed"],
  ["02", "La casa de la abuela", "2/6 lecciones", "current"],
  ["03", "Trámites", "0/5 lecciones", "locked"],
  ["04", "El último autobús", "0/5 lecciones", "locked"],
  ["05", "Vecinos", "0/6 lecciones", "locked"],
  ["06", "La cocina de la tía", "0/5 lecciones", "locked"],
  ["07", "La azotea", "0/6 lecciones", "locked"],
  ["08", "El domingo", "0/5 lecciones", "locked"],
] as const;

export function IslandsScreen() {
  return <div className={`${styles.page} standalone-layer`} data-standalone="islands">
    <BaselineNav />
    <main className={styles.islandsPage}>
      <div className={styles.islandsHeader}><div><p className={styles.eyebrow}>A1 · Primeras historias</p><h1>Islas.</h1></div><Link className={`${styles.button} ${styles.secondary}`} href="/progreso">Ver progreso</Link></div>
      <p className={styles.islandsIntro}>Cada isla reúne historias que se conectan.</p>
      <section className={styles.islandGrid} aria-label="Islas del módulo El barrio">
        {islands.map(([number, name, lessons, state]) => <Link href={`/islas/${number}`} className={`${styles.islandCard} ${styles[state]}`} data-motion="island-card" key={number}>
          <div className={styles.islandImage} aria-hidden="true"><span>{number}</span></div>
          <div className={styles.islandProgress}><i /></div>
          <h2>{name}</h2><p>{lessons}</p>
        </Link>)}
      </section>
    </main>
    <footer className={styles.footer}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer>
  </div>;
}
import Link from "next/link";
