"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { storyHref, useReadingMemory } from "../reading-memory";
import styles from "../screens/baseline.module.css";
import navStyles from "./nav.module.css";

const LINKS = [
  { href: "/", label: "Inicio", isCurrent: (path: string) => path === "/" },
  { href: "/niveles", label: "Niveles", isCurrent: (path: string) => path.startsWith("/niveles") },
  { href: "/islas", label: "Islas", isCurrent: (path: string) => path.startsWith("/islas") },
  { href: "/progreso", label: "Progreso", isCurrent: (path: string) => path.startsWith("/progreso") },
] as const;

const READER_PATH = /^\/islas\/[^/]+\/[^/]+$/;

function MenuIcon({ open }: { open: boolean }) {
  return <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24">{open
    ? <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    : <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />}</svg>;
}

export function BaselineNav() {
  const pathname = usePathname();
  const { lastStory } = useReadingMemory();
  const [menuOpen, setMenuOpen] = useState(false);
  // Mientras se lee, la cabecera no compite con la historia.
  const reading = READER_PATH.test(pathname);
  const cta = lastStory === null
    ? { href: "/islas", label: "Empezar", shortLabel: "Empezar" }
    : { href: storyHref(lastStory), label: "Continuar leyendo", shortLabel: "Continuar" };
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={`${styles.nav} ${navStyles.nav} standalone-nav`}>
      <Link className={styles.brand} href="/" aria-label="SpanStories, inicio" onClick={closeMenu}>SpanStories<span>.</span></Link>
      <nav className={`${styles.navLinks} ${navStyles.links}`} aria-label="Navegación principal" data-open={menuOpen} id="menu-principal">
        {LINKS.map((link) => <Link aria-current={link.isCurrent(pathname) ? "page" : undefined} href={link.href} key={link.href} onClick={closeMenu}>{link.label}</Link>)}
      </nav>
      {reading ? null : <Link className={`${styles.button} ${styles.primary} ${navStyles.cta}`} href={cta.href} onClick={closeMenu} title={lastStory === null ? undefined : lastStory.title}><span className={navStyles.ctaLong}>{cta.label}</span><span className={navStyles.ctaShort}>{cta.shortLabel}</span></Link>}
      <button aria-controls="menu-principal" aria-expanded={menuOpen} className={navStyles.menuButton} onClick={() => setMenuOpen((open) => !open)} type="button"><MenuIcon open={menuOpen} /><span>Menú</span></button>
    </header>
  );
}
