import Image from "next/image";
import Link from "next/link";
import type { A1Island } from "@/lib/adapters/a1-catalog";
import { LEVELS } from "@/lib/curriculum";
import { BaselineNav } from "../layouts/BaselineNav";
import { IslandGrid } from "./IslandGrid";
import { LockGlyph } from "./IslandIcons";
import { LevelPicker } from "./LevelPicker";
import styles from "./baseline.module.css";
import levels from "./levels.module.css";

const LEVEL_NAMES: Readonly<Record<string, string>> = { A1: "Primeras frases", A2: "Vida diaria", B1: "Historias largas", B2: "Matices y humor", C1: "Literatura sin adaptar" };

/** Los niveles sin publicar muestran islas de muestra bloqueadas: dan forma a la sección sin inventar contenido. */
const PLACEHOLDER_ISLANDS = ["01", "02", "03", "04"] as const;

/** Ilustración de las islas de la cabecera: decorativa, ocupa todo el ancho y se carga primero. */
function Horizon() {
  return <Image className={levels.heroArt} src="/niveles/horizonte-islas.png" alt="" width={3840} height={1280} sizes="100vw" quality={90} loading="eager" fetchPriority="high" />;
}

export function LevelSelectorScreen({ islands, storyCount }: { islands: readonly A1Island[]; storyCount: number }) {
  const entries = LEVELS.map((level) => ({ code: level.code, slug: level.slug, name: LEVEL_NAMES[level.code] ?? level.title, description: level.description }));
  return <div className={`${styles.page} ${levels.screen} standalone-layer`} data-standalone="levels">
    <BaselineNav />
    <section className={levels.hero}>
      <h1>Niveles.</h1>
      <p className={levels.intro}>Cada nivel se divide en islas: grupos de historias que se conectan. Empieza por la primera isla de A1.</p>
      <LevelPicker entries={entries.map(({ code, slug, name }) => ({ code, slug, name }))} />
      <Link className={levels.progressLink} href="/progreso">Ver progreso</Link>
      <Horizon />
    </section>
    <div className={levels.body}>
      <main className={levels.levels}>
        {entries.map((level) => level.code === "A1"
          ? <section aria-labelledby={`${level.slug}-titulo`} className={levels.level} id={level.slug} key={level.code}>
            <div className={levels.levelHead}><h2 id={`${level.slug}-titulo`}><span className={levels.code}>{level.code}</span>{level.name}</h2><p>{islands.length} islas · {storyCount} historias</p></div>
            <IslandGrid islands={islands} />
          </section>
          : <section aria-labelledby={`${level.slug}-titulo`} className={`${levels.level} ${levels.soon}`} id={level.slug} key={level.code}>
            <div className={levels.levelHead}><h2 id={`${level.slug}-titulo`}><span className={levels.code}>{level.code}</span>{level.name}</h2><p>{level.description} Próximamente.</p></div>
            <ul className={levels.grid} aria-label={`Islas del nivel ${level.code}`}>
              {PLACEHOLDER_ISLANDS.map((number) => <li key={number}><div className={`${levels.card} ${levels.locked} ${levels.placeholder}`}>
                <div className={levels.tile}><span className={levels.num}>{number}</span><LockGlyph size={28} /></div>
                <div className={levels.bar} />
                <h3>Próximamente</h3><p>Historias en preparación</p>
              </div></li>)}
            </ul>
          </section>)}
      </main>
    </div>
    <footer className={`${styles.footer} ${levels.footer}`}><span>SpanStories.</span><span>Pre-alfa · 2026</span></footer>
  </div>;
}
