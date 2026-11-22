import path from 'node:path';
import {pruneBehaviorRevisions} from '../../../../features/story-studio/behavior-revisions.ts';

/** Limpieza manual de las revisiones archivadas de actuaciones que ninguna historia usa (POST, solo en el Estudio local). */
export const runtime = 'nodejs';
const allowed = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

export async function POST(req: Request) {
  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  if (process.env.NODE_ENV !== 'development' || !allowed.has(origin)) return Response.json({error: 'Solo en el Estudio local.'}, {status: 403});
  try {
    const result = await pruneBehaviorRevisions({historiasRoot: path.join(process.cwd(), 'Estudio/Historias'), library: path.join(process.cwd(), 'Estudio/Talleres/taller-animacion/biblioteca/comportamientos')});
    return Response.json(result);
  } catch (e) { return Response.json({error: (e as Error).message}, {status: 400}); }
}
