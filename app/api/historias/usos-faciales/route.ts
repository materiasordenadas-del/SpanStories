import {readFile, readdir, writeFile, rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {withFileLock} from '../../../../lib/file-lock.ts';
import {isHistoriaId, validateHistoria, type HistoriaFile} from '../../../../features/story-studio/historia.ts';
import {isBehaviorReference, type BehaviorReference} from '../../../../features/story-studio/behavior.ts';
import {readLocalBehavior} from '../../../../features/story-studio/local-behaviors.ts';
import {behaviorUses, facialComponents, replaceBehaviorRefs, type BehaviorReplacement, type FacialUse} from '../../../../features/story-studio/facial-usage.ts';

/**
 * Taller facial · modo General: dónde se usa un componente facial en las historias guardadas en disco, y cambio de
 * las referencias a las versiones nuevas (vueltas a hornear con la corrección) en el autoguardado de cada historia.
 * El Taller lo pide a través del Estudio (mismo origen): GET ?componentes=a,b · POST {id, pares:[{from,to}]}.
 */
export const runtime = 'nodejs';
const root = path.join(process.cwd(), 'Estudio/Historias');
const tallerLibrary = path.join(process.cwd(), 'Estudio/Talleres/taller-animacion/biblioteca/comportamientos');
const allowed = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
async function read<T>(file: string): Promise<T | null> { try { return JSON.parse(await readFile(file, 'utf8')) as T; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } }
async function atomic(file: string, data: string) { const temp = path.join(path.dirname(file), randomUUID() + '.tmp'); await writeFile(temp, data); await rename(temp, file); }

/** Receta facial de una actuación horneada, desde la biblioteca del Taller o desde los recursos importados. */
async function recipeOf(ref: BehaviorReference): Promise<unknown> {
  const url = new URL(ref.url);
  const own = url.pathname.match(/^\/ecosystem\/assets\/([a-f0-9-]{36})\.json$/);
  if (own) {
    // La revisión que la historia guardó: la cabeza, o la archivada al reemplazarla (`_revisiones/<id>.r<N>.json`).
    type Asset = {revision?: number; recipe?: {facial?: unknown}};
    const head = await read<Asset>(path.join(tallerLibrary, own[1] + '.json'));
    if (head && Number.isInteger(ref.revision) && (Number(head.revision) || 0) !== ref.revision) {
      const archived = await read<Asset>(path.join(tallerLibrary, '_revisiones', `${own[1]}.r${ref.revision}.json`));
      if (archived) return archived.recipe?.facial ?? null;
    }
    return head?.recipe?.facial ?? null;
  }
  if (url.pathname === '/api/studio-behaviors') {
    const id = url.searchParams.get('id') ?? '', sha = url.searchParams.get('sha') ?? '';
    try { return (JSON.parse(await readLocalBehavior(id, sha)) as {recipe?: {facial?: unknown}}).recipe?.facial ?? null; } catch { return null; }
  }
  return null;
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== 'development') return Response.json({error: 'Solo en el Estudio local.'}, {status: 403});
  const wanted = new Set((new URL(req.url).searchParams.get('componentes') ?? '').split(',').map(s => s.trim()).filter(s => s && s.length <= 200));
  if (!wanted.size || wanted.size > 50) return Response.json({error: 'Indica de 1 a 50 componentes.'}, {status: 400});
  let names: string[] = [];
  try { names = (await readdir(root, {withFileTypes: true})).filter(d => d.isDirectory() && isHistoriaId(d.name)).map(d => d.name); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const items: FacialUse[] = [], cache = new Map<string, {components: string[]; variants: string[]}>();
  for (const id of names) {
    const dir = path.join(root, id);
    // Lo más reciente: el autoguardado si existe (son los cambios que verá el autor al abrirla).
    let h: HistoriaFile | null = null;
    for (const f of ['autoguardado.json', 'historia.json']) { try { const raw = await read(path.join(dir, f)); if (raw) { h = validateHistoria(raw); break; } } catch { /* dañada: se ignora */ } }
    if (!h) continue;
    for (const use of behaviorUses(h.project)) {
      if (!cache.has(use.behavior.url)) cache.set(use.behavior.url, facialComponents(await recipeOf(use.behavior).catch(() => null)));
      const found = cache.get(use.behavior.url)!, components = found.components.filter(c => wanted.has(c)), variants = found.variants.filter(c => wanted.has(c));
      if (components.length || variants.length) items.push({...use, historiaId: h.id, historiaName: h.name, components: [...components, ...variants], variant: !components.length});
    }
  }
  return Response.json({items});
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin') ?? new URL(req.url).origin;
  if (process.env.NODE_ENV !== 'development' || !allowed.has(origin)) return Response.json({error: 'Solo en el Estudio local.'}, {status: 403});
  const body = await req.json() as {id?: unknown; pares?: unknown};
  const cueIds = (v: unknown) => v === undefined || (Array.isArray(v) && v.length <= 1000 && v.every(c => typeof c === 'string' && c.length <= 180));
  const id = body.id, pares = Array.isArray(body.pares) ? body.pares.filter((p: {from?: unknown; to?: unknown; cueIds?: unknown}) => typeof p?.from === 'string' && isBehaviorReference(p.to) && cueIds(p.cueIds)) as BehaviorReplacement[] : [];
  if (!isHistoriaId(id) || !pares.length) return Response.json({error: 'Historia o actuaciones no válidas.'}, {status: 400});
  const dir = path.join(root, id);
  const result = await withFileLock(dir, async () => {
    // Nunca se toca historia.json ni su revisión: la historia puede estar abierta en otra pestaña, y subirle la
    // revisión dejaba sus autoguardados «antiguos» (descartados en silencio) y su siguiente «Guardar» en 409.
    // Las referencias nuevas van al autoguardado (los cambios sin guardar que el autor verá al abrirla), con la misma
    // revisión que ya tenía; la pestaña abierta, si la hay, recibe el mismo cambio por BroadcastChannel (StudioWorkshop).
    const head = await read(path.join(dir, 'historia.json')), autoFile = path.join(dir, 'autoguardado.json'), auto = await read(autoFile);
    // Un autoguardado de antes del último «Guardar» está obsoleto (el Estudio lo descarta): se parte del guardado.
    const saved = head ? validateHistoria(head) : null, pending = auto ? validateHistoria(auto) : null;
    const base = pending && (!saved || pending.revision >= saved.revision) ? pending : saved;
    if (!base) return 0;
    const h = structuredClone(base), changed = replaceBehaviorRefs(h.project, pares);
    // savedAt se conserva: el reemplazo no debe hacer pasar un autoguardado viejo por el trabajo más reciente.
    if (changed) { validateHistoria(h); await atomic(autoFile, JSON.stringify(h)); }
    return changed;
  }, {create: false});
  if (result === 'busy') return Response.json({error: 'Otro guardado está en curso. Reintenta.'}, {status: 409});
  if (result === 'missing') return Response.json({error: 'Esa historia no existe.'}, {status: 404});
  return Response.json({count: result});
}
