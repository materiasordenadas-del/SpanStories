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
            <p className="eyebrow">Fase 2</p>
            <h2>4 módulos de prueba</h2>
          </div>
          <p>Solo el Módulo 1 está abierto. Los otros tres permanecen reservados para fases posteriores.</p>
        </div>

        <div className="module-grid">
          {level.modules.map((module) => {
            const content = (
              <>
                <div className="module-number">{module.id}</div>
                <div>
                  <div className="module-title-row">
                    <h3>{module.title}</h3>
                    <span className={`status ${module.status}`}>
                      {module.status === "experimental" ? "Abrir módulo" : "Planificado"}
                    </span>
                  </div>
                  <p>{module.description}</p>
                </div>
              </>
            );

            if (module.status === "experimental") {
              return (
                <Link
                  className="card module-card module-card-link"
                  href={`/niveles/${level.slug}/modulos/${module.id}`}
                  key={module.id}
                >
                  {content}
                </Link>
              );
            }

            return (
              <article className="card module-card module-card-planned" key={module.id}>
                {content}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
