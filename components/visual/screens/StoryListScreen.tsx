import Link from "next/link";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";

const stories = [
  ["01", "El primer día en la escuela", "Conoces el aula, a la profesora y a tus compañeros."],
  ["02", "La ficha del grupo", "Una ficha sencilla con nombres, países y preguntas."],
  ["03", "Conocer a un compañero", "Una conversación nueva durante el recreo."],
  ["04", "No entiendo", "Pedir ayuda también es parte de empezar."],
] as const;

export function StoryListScreen({ island }: { island: string }) {
  return <div className={`${styles.page} standalone-layer`}><BaselineNav /><main className={styles.storyListPage}><Link className={styles.backLink} href="/islas">← Volver a Islas</Link><p className={styles.eyebrow}>A1 · Isla {island}</p><h1>Historias.</h1><p className={styles.islandsIntro}>Elige una historia para comenzar.</p><section className={styles.storyList} aria-label="Historias de la isla">{stories.map(([number, title, description]) => <Link className={styles.storyRow} href={`/islas/${island}/${number}`} key={number}><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div><b aria-hidden>→</b></Link>)}</section></main><footer className={styles.footer}><span>SpanStories.</span><span>A1 · 2026</span></footer></div>;
}
