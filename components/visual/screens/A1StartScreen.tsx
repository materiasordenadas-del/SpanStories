import Link from "next/link";
import { BaselineNav } from "../layouts/BaselineNav";
import styles from "./baseline.module.css";

export function A1StartScreen() {
  return <div className={`${styles.page} standalone-layer`}><BaselineNav /><main className={styles.startPage}><p className={styles.eyebrow}>Nivel A1 · Primeras frases</p><h1>Vamos a<br /><em>comenzar con A1.</em></h1><p>Historias breves para entender desde el primer día. Empieza por una isla y deja que las palabras vuelvan en la siguiente.</p><Link className={`${styles.button} ${styles.primary}`} href="/islas">Ir a las islas <span aria-hidden>→</span></Link></main><footer className={styles.footer}><span>SpanStories.</span><span>A1 · 2026</span></footer></div>;
}
