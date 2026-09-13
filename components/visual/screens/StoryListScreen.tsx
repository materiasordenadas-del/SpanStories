import Link from "next/link";
import type { A1Island } from "@/lib/adapters/a1-catalog";
import { BaselineNav } from "../layouts/BaselineNav";
import { StoryReadMark } from "./StoryReadMark";
import styles from "./baseline.module.css";

export function StoryListScreen({ island, previousIsland }: { island: A1Island; previousIsland?: A1Island }) {
  return <div className={`${styles.page} standalone-layer`}><BaselineNav /><main className={styles.storyListPage}>
    <Link className={styles.backLink} href="/islas">← Volver a Islas</Link>
    <p className={styles.eyebrow}>A1 · Isla {island.number} · {island.moduleName}</p>
    <h1>{island.name}.</h1>
    {island.published
      ? <p className={styles.islandsIntro}>Elige una historia para comenzar.</p>
      : <div className={styles.islandLockedNote}><p>Esta isla todavía no tiene historias publicadas.</p>{previousIsland === undefined ? null : <Link className={`${styles.button} ${styles.secondary}`} href={previousIsland.href}>Ir a {previousIsland.name}</Link>}</div>}
    <section className={styles.storyList} aria-label="Historias de la isla">{island.stories.map((story) => {
      const content = <><span>{story.story}</span><div><h2>{story.title}</h2>{story.blurb === undefined ? null : <p>{story.blurb}</p>}</div></>;
      return island.published
        ? <Link className={styles.storyRow} href={story.href} key={story.id}>{content}<div className={styles.storyRowEnd}><StoryReadMark island={story.island} story={story.story} /><b aria-hidden>→</b></div></Link>
        : <div className={`${styles.storyRow} ${styles.storyRowLocked}`} key={story.id}>{content}</div>;
    })}</section>
  </main><footer className={styles.footer}><span>SpanStories.</span><span>A1 · 2026</span></footer></div>;
}
