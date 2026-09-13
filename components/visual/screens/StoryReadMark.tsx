"use client";

import { storyKey, useReadingMemory } from "../reading-memory";
import styles from "./baseline.module.css";

export function StoryReadMark({ island, story }: { island: string; story: string }) {
  const { finished } = useReadingMemory();
  return finished.includes(storyKey(island, story)) ? <span className={styles.storyReadMark}>Leída</span> : null;
}
