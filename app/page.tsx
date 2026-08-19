import Link from "next/link";
import { LEVELS } from "@/lib/curriculum";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">SpanStories · prototipo funcional</p>
        <h1>Elige tu nivel de español</h1>
        <p className="lead">
          Esta primera fase prueba la navegación Nivel → Módulos antes de construir la isla experimental.
        </p>
      </section>

      <section className="level-grid" aria-label="Niveles disponibles">
        {LEVELS.map((level) => (
          <Link className="card level-card" href={`/niveles/${level.slug}`} key={level.code}>
            <span className="level-code">{level.code}</span>
            <h2>{level.title}</h2>
            <p>{level.description}</p>
            <span className="card-action">Ver 4 módulos →</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
