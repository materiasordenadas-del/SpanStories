import Link from "next/link";
import { useEffect, useRef } from "react";
import { markStoryFinished } from "../reading-memory";
import styles from "./baseline.module.css";
import end from "./story-end.module.css";

export type StoryNextStep = {
  readonly islandName: string;
  readonly islandHref: string;
  readonly nextStory?: { readonly href: string; readonly title: string };
  readonly nextIsland?: { readonly name: string; readonly href: string; readonly published: boolean };
};

export type ConsultedWord = { readonly id: string; readonly surface: string };

/** Cierre de la historia: marca la lectura al llegar aquí y ofrece qué hacer después. */
export function StoryEnd({ island, story, title, next, consultedWords, onReopenWord }: {
  island: string;
  story: string;
  title: string;
  next: StoryNextStep;
  consultedWords: readonly ConsultedWord[];
  onReopenWord: (id: string) => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = sectionRef.current;
    if (section === null) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      markStoryFinished(island, story);
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [island, story]);

  return <section aria-labelledby="fin-de-historia" className={end.section} ref={sectionRef}>
    <p className={end.label}>Fin de la historia</p>
    <h2 id="fin-de-historia">Has terminado «{title}».</h2>
    {consultedWords.length > 0 ? <div className={end.words}>
      <h3>Palabras que consultaste</h3>
      <ul lang="es">{consultedWords.map((word) => <li key={word.id}><button onClick={() => onReopenWord(word.id)} type="button">{word.surface}</button></li>)}</ul>
    </div> : null}
    <div className={end.actions}>
      {next.nextStory !== undefined
        ? <Link className={`${styles.button} ${styles.primary}`} href={next.nextStory.href}>Siguiente historia: {next.nextStory.title}</Link>
        : next.nextIsland === undefined
          ? <p className={end.note}>Has llegado al final de A1.</p>
          : next.nextIsland.published
            ? <Link className={`${styles.button} ${styles.primary}`} href={next.nextIsland.href}>Ir a {next.nextIsland.name}</Link>
            : <p className={end.note}>Has terminado la isla «{next.islandName}». La siguiente, «{next.nextIsland.name}», está en preparación.</p>}
      <Link className={`${styles.button} ${styles.secondary}`} href={next.islandHref}>Volver a {next.islandName}</Link>
    </div>
  </section>;
}
