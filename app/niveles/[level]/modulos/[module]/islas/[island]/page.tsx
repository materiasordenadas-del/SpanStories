import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LEVELS,
  getIslandBySlug,
  getLevelBySlug,
  getModuleById,
} from "@/lib/curriculum";

type IslandPageProps = {
  params: Promise<{ level: string; module: string; island: string }>;
};

export function generateStaticParams() {
  return LEVELS.flatMap((level) =>
    level.modules.flatMap((module) =>
      module.islands.map((island) => ({
        level: level.slug,
        module: String(module.id),
        island: island.slug,
      })),
    ),
  );
}

export default async function IslandPage({ params }: IslandPageProps) {
  const {
    level: levelSlug,
    module: moduleId,
    island: islandSlug,
  } = await params;

  const level = getLevelBySlug(levelSlug);

  if (!level) {
    notFound();
  }

  const moduleSummary = getModuleById(level, moduleId);

  if (!moduleSummary || moduleSummary.status !== "experimental") {
    notFound();
  }

  const island = getIslandBySlug(moduleSummary, islandSlug);

  if (!island) {
    notFound();
  }

  return (
    <main className="page-shell">
      <Link
        className="back-link"
        href={`/niveles/${level.slug}/modulos/${moduleSummary.id}`}
      >
        ← Volver a {moduleSummary.title}
      </Link>

      <section className="hero compact-hero">
        <p className="eyebrow">{level.code} · {moduleSummary.title} · Isla {island.id}</p>
        <h1>{island.title}</h1>
        <p className="lead">{island.description}</p>
      </section>

      <section className="activity-layout">
        <nav className="card activity-nav" aria-label="Etapas de la isla">
          <p className="eyebrow">Recorrido</p>
          {island.activities.map((activity, index) => (
            <a className="activity-nav-link" href={`#${activity.id}`} key={activity.id}>
              <span>{index + 1}</span>
              {activity.title}
            </a>
          ))}
        </nav>

        <div className="activity-list">
          {island.activities.map((activity, index) => (
            <article className="card activity-card" id={activity.id} key={activity.id}>
              <div className="activity-index">{index + 1}</div>
              <div>
                <p className="eyebrow">Etapa {index + 1} de {island.activities.length}</p>
                <h2>{activity.title}</h2>
                <p>{activity.description}</p>
                <p className="activity-note">
                  Contenido provisional: esta etapa existe para validar la estructura de la isla. Su funcionalidad específica llegará en las siguientes fases.
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
