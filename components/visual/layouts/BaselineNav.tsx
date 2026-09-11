import Link from "next/link";
import styles from "../screens/baseline.module.css";

export function BaselineNav() {
  return (
    <header className={`${styles.nav} standalone-nav`}>
      <Link className={styles.brand} href="/" aria-label="SpanStories, inicio">SpanStories<span>.</span></Link>
      <nav className={styles.navLinks} aria-label="Navegación principal">
        <Link href="/">Inicio</Link><Link href="/niveles">Niveles</Link><Link href="/islas">Islas</Link><Link href="/progreso">Progreso</Link>
      </nav>
      <div className={styles.language} aria-label="Idioma"><span className={styles.languageActive}>ES</span><span>EN</span></div>
      <Link className={`${styles.button} ${styles.primary}`} href="/niveles">Empezar</Link>
    </header>
  );
}
