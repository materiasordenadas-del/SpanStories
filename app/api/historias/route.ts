import {readFile, mkdir, writeFile, rename, readdir, unlink, copyFile, stat} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {withFileLock} from '../../../lib/file-lock.ts';
import {pruneBehaviorRevisionsSoon} from '../../../features/story-studio/behavior-revisions.ts';
import {copyHistoria, isHistoriaId, summarize, validateHistoria, type HistoriaFile, type HistoriaSummary} from '../../../features/story-studio/historia.ts';

/**
 * Historias del Estudio en disco, como archivos .blend:
 *   Estudio/Historias/<id>/historia.json      guardado manual (Ctrl+S)
 *   Estudio/Historias/<id>/historia.json1..3  guardados anteriores
 *   Estudio/Historias/<id>/autoguardado.json  autoguardado (se borra al guardar)
 *   Estudio/Historias/<id>/audio/<sha>.bin    grabaciones de la historia (+ <sha>.json)
 *   Estudio/Historias/recientes.json          últimas abiertas
 *   Estudio/Historias/_papelera/              «Eliminar» mueve aquí; nunca se borra
 */
export const runtime = 'nodejs';
const root = path.join(process.cwd(), 'Estudio/Historias');
const MAX = 160 * 1024 * 1024, BACKUPS = 3;
const allowed = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
// El motor (8877) puede LEER historias (inventario del Editor); escribir sigue exigiendo `allowed`.
const readers = new Set([...allowed, 'http://127.0.0.1:8877', 'http://localhost:8877']);
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
function headers(req: Request) { const o = req.headers.get('origin') ?? ''; return {'Access-Control-Allow-Origin': readers.has(o) ? o : 'http://localhost:3000', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Audio-Meta', 'Cache-Control': 'no-store', 'Vary': 'Origin'}; }
function reply(req: Request, data: unknown, status = 200) { return Response.json(data, {status, headers: headers(req)}); }
async function read<T = unknown>(file: string): Promise<T | null> { try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } }
async function readHistoria(file: string) { const raw = await read(file); return raw ? validateHistoria(raw) : null; }
/** Escritura atómica: archivo temporal + rename (nunca queda un JSON a medias). */
async function atomic(file: string, data: string | Buffer) { const temp = path.join(path.dirname(file), randomUUID() + '.tmp'); await writeFile(temp, data); await rename(temp, file); }
const dirOf = (id: string) => { if (!isHistoriaId(id)) throw Error('Identificador de historia no válido.'); return path.join(root, id); };
async function exists(file: string) { try { await stat(file); return true; } catch { return false; } }
function writable(req: Request) { return process.env.NODE_ENV === 'development' && allowed.has(req.headers.get('origin') ?? new URL(req.url).origin); }

/** Cerrojo exclusivo por historia entre pestañas y procesos (lib/file-lock.ts; recupera cerrojos abandonados). */
async function locked<T>(dir: string, fn: () => Promise<T>): Promise<T | 'busy'> {
  const result = await withFileLock(dir, fn);
  return result === 'missing' ? 'busy' : result;
}
/** Como `locked`, pero sin recrear la carpeta: una historia eliminada (movida a _papelera) no debe reaparecer. */
async function lockedExisting<T>(dir: string, fn: () => Promise<T>): Promise<T | 'busy' | 'missing'> {
  return withFileLock(dir, fn, {create: false});
}

async function recent(): Promise<string[]> { const r = await read<{ids?: unknown}>(path.join(root, 'recientes.json')); return Array.isArray(r?.ids) ? r.ids.filter(isHistoriaId) : []; }
async function touch(id: string) { await mkdir(root, {recursive: true}); const ids = [id, ...(await recent()).filter(x => x !== id)].slice(0, 20); await atomic(path.join(root, 'recientes.json'), JSON.stringify({ids, ultima: id, at: new Date().toISOString()})); }

async function list() {
  let names: string[] = [];
  try { names = (await readdir(root, {withFileTypes: true})).filter(d => d.isDirectory() && isHistoriaId(d.name)).map(d => d.name); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const items: HistoriaSummary[] = [], damaged: string[] = [];
  for (const id of names) {
    try {
      const dir = path.join(root, id), saved = await readHistoria(path.join(dir, 'historia.json')), auto = await readHistoria(path.join(dir, 'autoguardado.json')).catch(() => null);
      const base = saved ?? auto; if (!base) continue;
      items.push(summarize(base, auto, !!saved));
    } catch { damaged.push(id); }
  }
  const ids = await recent(), rank = (id: string) => { const i = ids.indexOf(id); return i < 0 ? Infinity : i; };
  items.sort((a, b) => rank(a.id) - rank(b.id) || Date.parse(b.autosaveAt ?? b.savedAt ?? b.createdAt) - Date.parse(a.autosaveAt ?? a.savedAt ?? a.createdAt));
  return {historias: items, ultima: ids.find(id => items.some(h => h.id === id)) ?? null, damaged};
}

export async function OPTIONS(req: Request) { return new Response(null, {status: 204, headers: headers(req)}); }

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams, id = q.get('id');
    if (!id) return reply(req, await list());
    const dir = dirOf(id);
    const audio = q.get('audio');
    if (audio) {
      if (!/^[a-f0-9]{64}$/.test(audio)) throw Error('Audio no válido.');
      const meta = await read<{mimeType?: string}>(path.join(dir, 'audio', audio + '.json'));
      const bytes = await readFile(path.join(dir, 'audio', audio + '.bin'));
      return new Response(new Uint8Array(bytes), {headers: {...headers(req), 'Content-Type': meta?.mimeType || 'application/octet-stream'}});
    }
    if (q.has('audios')) {
      let files: string[] = []; try { files = (await readdir(path.join(dir, 'audio'))).filter(f => /^[a-f0-9]{64}\.json$/.test(f)); } catch {}
      const metas = []; for (const f of files) { const m = await read(path.join(dir, 'audio', f)); if (m) metas.push(m); }
      return reply(req, {audio: metas});
    }
    const copia = q.get('copia');
    if (copia) { if (!/^[1-9]$/.test(copia)) throw Error('Copia no válida.'); return reply(req, {historia: await readHistoria(path.join(dir, 'historia.json' + copia))}); }
    const historia = await readHistoria(path.join(dir, 'historia.json'));
    let autoguardado: HistoriaFile | null = null, autoError: string | null = null;
    try { autoguardado = await readHistoria(path.join(dir, 'autoguardado.json')); } catch (e) { autoError = (e as Error).message; }
    if (!historia && !autoguardado) return reply(req, {error: 'Esa historia no existe.'}, 404);
    const copias = []; for (let i = 1; i <= BACKUPS; i++) { const h = await read<HistoriaFile>(path.join(dir, 'historia.json' + i)); if (h) copias.push({n: i, savedAt: h.savedAt, revision: h.revision}); }
    return reply(req, {historia, autoguardado, autoError, copias});
  } catch (e) { return reply(req, {error: (e as Error).message}, 400); }
}

export async function POST(req: Request) {
  if (!writable(req)) return reply(req, {error: 'Guardado local no permitido.'}, 403);
  try {
    if (Number(req.headers.get('content-length')) > MAX) throw Error('La historia supera los 160 MB.');
    const text = await req.text(); if (Buffer.byteLength(text) > MAX) throw Error('La historia supera los 160 MB.');
    const body = JSON.parse(text) as {accion?: string; id?: string; historia?: unknown; expectedRevision?: number | null; name?: string};
    switch (body.accion) {
      case 'guardar': case 'crear': {
        const h = validateHistoria(body.historia), dir = dirOf(h.id);
        const result = await locked(dir, async () => {
          const file = path.join(dir, 'historia.json'), head = await read<HistoriaFile>(file);
          if (body.accion === 'crear' && (head || await exists(path.join(dir, 'autoguardado.json')))) return {status: 409, data: {error: 'Ya existe una historia con ese identificador.'}};
          if (body.accion === 'guardar' && (head?.revision ?? null) !== (body.expectedRevision ?? null)) return {status: 409, data: {error: 'Esta historia se guardó desde otra pestaña. Usa «Guardar como…» para no perder tus cambios, o vuelve a abrirla.', revision: head?.revision ?? null}};
          const revision = body.accion === 'crear' ? 0 : (head?.revision ?? -1) + 1, savedAt = new Date().toISOString();
          const next: HistoriaFile = {...h, revision, savedAt, project: {...h.project, revision}};
          validateHistoria(next);
          // Como .blend1/.blend2: el guardado anterior pasa a ser la copia 1.
          if (head) { for (let i = BACKUPS - 1; i >= 1; i--) if (await exists(file + i)) await copyFile(file + i, file + (i + 1)); await copyFile(file, file + '1'); }
          await atomic(file, JSON.stringify(next));
          await unlink(path.join(dir, 'autoguardado.json')).catch(() => {});
          return {status: 200, data: {historia: next, directory: `Estudio/Historias/${h.id}`}};
        });
        if (result === 'busy') return reply(req, {error: 'Otro guardado está en curso. Reintenta.'}, 409);
        await touch(h.id);
        // Guardada la historia, las revisiones de actuaciones que ninguna historia usa se limpian en segundo plano.
        if (result.status === 200) pruneBehaviorRevisionsSoon();
        return reply(req, result.data, result.status);
      }
      case 'autoguardar': {
        const h = validateHistoria(body.historia), dir = dirOf(h.id);
        const result = await lockedExisting(dir, async () => {
          const at = new Date().toISOString();
          // Un autoguardado que llega tarde (de antes de un «Guardar») no debe reaparecer como cambios sin guardar.
          const head = await read<HistoriaFile>(path.join(dir, 'historia.json')).catch(() => null);
          if (head && head.revision > h.revision) return {at, stale: true};
          await atomic(path.join(dir, 'autoguardado.json'), JSON.stringify({...h, savedAt: at})); return {at, stale: false};
        });
        if (result === 'busy') return reply(req, {error: 'Guardado en curso.', busy: true}, 409);
        if (result === 'missing') return reply(req, {error: 'Esta historia ya no existe (se eliminó o se movió a la papelera).', missing: true}, 410);
        return reply(req, {autosaveAt: result.at, stale: result.stale});
      }
      case 'abrir': { const dir = dirOf(body.id ?? ''); if (!await exists(dir)) throw Error('Esa historia no existe.'); await touch(body.id!); return reply(req, {ok: true}); }
      case 'descartar': {
        const dir = dirOf(body.id ?? ''), auto = path.join(dir, 'autoguardado.json');
        if (!await exists(path.join(dir, 'historia.json'))) throw Error('Esta historia nunca se guardó: su autoguardado es la única copia.');
        // Se aparta (no se borra) por si se descartó por error.
        if (await exists(auto)) await rename(auto, path.join(dir, `autoguardado-descartado-${Date.now()}.json`));
        return reply(req, {ok: true});
      }
      case 'renombrar': {
        const dir = dirOf(body.id ?? ''), name = (body.name ?? '').trim().slice(0, 120); if (!name) throw Error('Escribe un nombre.');
        const result = await locked(dir, async () => {
          for (const f of ['historia.json', 'autoguardado.json']) { const h = await readHistoria(path.join(dir, f)).catch(() => null); if (h) await atomic(path.join(dir, f), JSON.stringify({...h, name, project: {...h.project, name}})); }
          return true;
        });
        if (result === 'busy') return reply(req, {error: 'Otro guardado está en curso. Reintenta.'}, 409);
        return reply(req, {ok: true});
      }
      case 'duplicar': {
        const dir = dirOf(body.id ?? ''), h = await readHistoria(path.join(dir, 'autoguardado.json')).catch(() => null) ?? await readHistoria(path.join(dir, 'historia.json'));
        if (!h) throw Error('Esa historia no existe.');
        const copy = copyHistoria(h, (body.name ?? '').trim() || h.name + ' (copia)'), target = dirOf(copy.id);
        await mkdir(target, {recursive: true}); await atomic(path.join(target, 'historia.json'), JSON.stringify(copy));
        try { await mkdir(path.join(target, 'audio'), {recursive: true}); for (const f of await readdir(path.join(dir, 'audio'))) if (/^[a-f0-9]{64}\.(bin|json)$/.test(f)) await copyFile(path.join(dir, 'audio', f), path.join(target, 'audio', f)); } catch {}
        await touch(copy.id);
        return reply(req, {historia: copy});
      }
      case 'eliminar': {
        const dir = dirOf(body.id ?? ''), trash = path.join(root, '_papelera'); await mkdir(trash, {recursive: true});
        // No se mueve a mitad de un guardado (el cerrojo se suelta antes de mover: Windows no mueve carpetas con archivos abiertos).
        const idle = await lockedExisting(dir, async () => true);
        if (idle === 'busy') return reply(req, {error: 'Se está guardando esta historia. Vuelve a intentarlo en un momento.'}, 409);
        if (idle === 'missing') throw Error('Esa historia no existe.');
        await rename(dir, path.join(trash, `${body.id}-${new Date().toISOString().replace(/[:.]/g, '-')}`));
        return reply(req, {ok: true, papelera: 'Estudio/Historias/_papelera'});
      }
      default: throw Error('Acción desconocida.');
    }
  } catch (e) { return reply(req, {error: (e as Error).message}, 400); }
}

/** PUT ?id=&sha=: guarda una grabación dentro de la carpeta de la historia (contenido verificado por su sha256). */
export async function PUT(req: Request) {
  if (!writable(req)) return reply(req, {error: 'Guardado local no permitido.'}, 403);
  try {
    const q = new URL(req.url).searchParams, dir = dirOf(q.get('id') ?? ''), id = q.get('sha') ?? '';
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error('Audio no válido.');
    const bytes = Buffer.from(await req.arrayBuffer());
    if (!bytes.length || bytes.length > 64 * 1024 * 1024) throw Error('Tamaño de audio no válido.');
    if (sha(bytes) !== id) throw Error('La grabación llegó dañada.');
    const meta = JSON.parse(decodeURIComponent(req.headers.get('x-audio-meta') ?? '%7B%7D')) as Record<string, unknown>;
    const clean = {id, name: String(meta.name ?? 'Grabación').slice(0, 200), kind: meta.kind === 'sound' ? 'sound' : 'voice', mimeType: typeof meta.mimeType === 'string' && /^audio\/[\w.+-]+(;.*)?$/.test(meta.mimeType) ? meta.mimeType : 'audio/webm', duration: Number(meta.duration) || 0, bytes: bytes.length, createdAt: typeof meta.createdAt === 'string' && Number.isFinite(Date.parse(meta.createdAt)) ? meta.createdAt : new Date().toISOString()};
    if (!await exists(dir)) return reply(req, {error: 'Esta historia ya no existe (se eliminó o se movió a la papelera).'}, 410);
    const folder = path.join(dir, 'audio'); await mkdir(folder, {recursive: true});
    if (!await exists(path.join(folder, id + '.bin'))) await atomic(path.join(folder, id + '.bin'), bytes);
    await atomic(path.join(folder, id + '.json'), JSON.stringify(clean));
    return reply(req, {ok: true});
  } catch (e) { return reply(req, {error: (e as Error).message}, 400); }
}
