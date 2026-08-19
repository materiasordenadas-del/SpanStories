import Link from "next/link";
import { notFound } from "next/navigation";
import { LEVELS, getLevelBySlug, getModuleById } from "@/lib/curriculum";

type ModulePageProps = {
  params: Promise<{ level: string; module: string }>;
};

export function generateStaticParams() {
  return LEVELS.flatMap((level) =>
    level.modules
      .filter((module) => module.status === "experimental")
      .map((module) => ({ level: level.slug, module: String(module.id) })),
  );
}

export default async function ModulePage({ params }: ModulePageProps) {
  const { level: levelSlug, module: moduleId } = await params;
  const level = getLevelBySlug(levelSlug);

  if (!level) {
    notFound();
  }

  const moduleSummary = getModuleById(level, moduleId);

  if (!moduleSummary || moduleSummary.status !== "experimental") {
    notFound();
  }

  return (
    <main className="page-shell">
      <Link className="back-link" href={`/niveles/${level.slug}`}>
        ← Volver a {level.code}
      </Link>

      <section className="hero compact-hero">
        <p className="eyebrow">{level.code} · {moduleSummary.title}</p>
        <h1>{moduleSummary.title}</h1>
        <p className="lead">{moduleSummary.description}</p>
      </section>

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Laboratorio de interfaz</p>
            <h2>Islas</h2>
          </div>
          <p>En esta fase existe una sola isla. Servirá como superficie de prueba antes de construir el lector y el sistema léxico.</p>
        </div>

        <div className="island-grid">
          {moduleSummary.islands.map((island) => (
            <Link
              className="card island-card"
              href={`/niveles/${level.slug}/modulos/${moduleSummary.id}/islas/${island.slug}`}
              key={island.id}
            >
              <div>
                <p className="eyebrow">Isla {island.id}</p>
                <h3>{island.title}</h3>
                <p>{island.description}</p>
              </div>
              <span className="card-action">Entrar a la isla →</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
