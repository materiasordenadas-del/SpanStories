"use client";

import Link from "next/link";
import type { A1Island } from "@/lib/adapters/a1-catalog";
import { storyKey, useReadingMemory } from "../reading-memory";
import styles from "./baseline.module.css";

export function LockIcon() {
  return <svg aria-hidden="true" focusable="false" className={styles.lockIcon} width="20" height="20" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

export function IslandGrid({ islands }: { islands: readonly A1Island[] }) {
  const { finished } = useReadingMemory();
  return <section className={styles.islandGrid} aria-label="Islas del nivel A1">
    {islands.map((island) => {
      if (!island.published) {
        return <div className={`${styles.islandCard} ${styles.locked}`} key={island.id}>
          <div className={styles.islandImage}><span>{island.number}</span><LockIcon /></div>
          <div className={styles.islandProgress}><i /></div>
          <h2>{island.name}</h2><p>{island.unlockAfter === undefined ? "Próximamente" : `Próximamente, después de «${island.unlockAfter}»`}</p>
        </div>;
      }
      const read = island.stories.filter((story) => finished.includes(storyKey(story.island, story.story))).length;
      const total = island.stories.length;
      const state = read === total ? "completed" : "current";
      return <Link href={island.href} className={`${styles.islandCard} ${styles[state]}`} data-motion="island-card" key={island.id}>
        <div className={styles.islandImage} aria-hidden="true"><span>{island.number}</span></div>
        <div className={styles.islandProgress}><i style={{ width: `${(read / total) * 100}%` }} /></div>
        <h2>{island.name}</h2><p>{read === 0 ? `${total} historias` : `${read} de ${total} historias leídas`}</p>
      </Link>;
    })}
  </section>;
}
