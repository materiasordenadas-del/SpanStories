import Link from "next/link";
import { notFound } from "next/navigation";
import { LEVELS, getLevelBySlug } from "@/lib/curriculum";

type LevelPageProps = {
  params: Promise<{ level: string }>;
};

export function generateStaticParams() {
  return LEVELS.map((level) => ({ level: level.slug }));
}

export default async function LevelPage({ params }: LevelPageProps) {
  const { level: slug } = await params;
  const level = getLevelBySlug(slug);

  if (!level) {
    notFound();
  }

  return (
    <main className="page-shell">
      <Link className="back-link" href="/">
        ← Volver a niveles
      </Link>

      <section className="hero compact-hero">
        <p className="eyebrow">Nivel {level.code}</p>
        <h1>{level.title}</h1>
        <p className="lead">{level.description}</p>
      </section>

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Fase 1</p>
            <h2>4 módulos de prueba</h2>
          </div>
          <p>El Módulo 1 será el punto de entrada a la isla experimental en la Fase 2.</p>
        </div>

        <div className="module-grid">
          {level.modules.map((module) => (
            <article className="card module-card" key={module.id}>
              <div className="module-number">{module.id}</div>
              <div>
                <div className="module-title-row">
                  <h3>{module.title}</h3>
                  <span className={`status ${module.status}`}>
                    {module.status === "experimental" ? "Siguiente fase" : "Planificado"}
                  </span>
                </div>
                <p>{module.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
