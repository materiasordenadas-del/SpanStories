"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import type { A1Island } from "@/lib/adapters/a1-catalog";
import { storyKey, useReadingMemory } from "../reading-memory";
import { IslandIcon, LockGlyph } from "./IslandIcons";
import styles from "./baseline.module.css";
import levels from "./levels.module.css";

export function LockIcon() {
  return <svg aria-hidden="true" focusable="false" className={styles.lockIcon} width="20" height="20" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>;
}

// Las islas del mismo módulo comparten tono.
const moduleTint = (island: A1Island) => ({ "--tint": `var(--m${island.moduleOrder})` }) as CSSProperties;

export function IslandGrid({ islands }: { islands: readonly A1Island[] }) {
  const { finished } = useReadingMemory();
  return <ul className={levels.grid} aria-label="Islas del nivel A1">
    {islands.map((island) => {
      if (!island.published) {
        return <li key={island.id}><div className={`${levels.card} ${levels.locked}`}>
          <div className={levels.tile} style={moduleTint(island)}><span className={levels.num}>{island.number}</span><span className={levels.badge}><LockGlyph size={14} /></span><IslandIcon className={levels.art} number={island.number} /></div>
          <div className={levels.bar} />
          <h3>{island.name}</h3><p>{island.unlockAfter === undefined ? "Próximamente" : `Próximamente, después de «${island.unlockAfter}»`}</p>
        </div></li>;
      }
      const read = island.stories.filter((story) => finished.includes(storyKey(story.island, story.story))).length;
      const total = island.stories.length;
      return <li key={island.id}><Link className={`${levels.card} ${levels.cardLink}`} data-motion="island-card" href={island.href}>
        <div className={levels.tile} style={moduleTint(island)}><span className={levels.num}>{island.number}</span><IslandIcon className={levels.art} number={island.number} /></div>
        <div className={read > 0 ? `${levels.bar} ${levels.started}` : levels.bar}><i style={{ width: `${total === 0 ? 0 : (read / total) * 100}%` }} /></div>
        <h3>{island.name}</h3><p>{read === 0 ? `${total} historias` : `${read} de ${total} historias leídas`}</p>
      </Link></li>;
    })}
  </ul>;
}
