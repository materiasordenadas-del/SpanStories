import {readdir, readFile, stat, unlink} from 'node:fs/promises';
import path from 'node:path';
import {validateHistoria} from './historia.ts';
import {behaviorUses} from './facial-usage.ts';

/**
 * Las actuaciones del Taller se reemplazan en su sitio y la revisión que sale se archiva en
 * `biblioteca/comportamientos/_revisiones/<id>.r<N>.json` (herramientas/ecosystem.mjs). Aquí se limpian las
 * revisiones que ninguna historia usa, para no acumular archivos huérfanos.
 */
export const REVISION_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const ARCHIVED = /^([a-f0-9-]{36})\.r(\d{1,9})\.json$/;
const HISTORIA_FILES = /^(historia\.json[1-9]?|autoguardado[\w.-]*\.json)$/;

async function dirs(root: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(root, {withFileTypes: true}); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e; }
  return entries.filter(d => d.isDirectory()).map(d => path.join(root, d.name));
}

/**
 * Claves `<id>.r<N>` que alguna historia (guardada, sus copias .json1..3, autoguardados y la papelera) referencia.
 * Devuelve null si algún archivo de historia no se puede leer: ante la duda no se borra nada.
 */
export async function referencedRevisions(historiasRoot: string): Promise<Set<string> | null> {
  const used = new Set<string>(), folders: string[] = [];
  for (const dir of await dirs(historiasRoot)) {
    if (path.basename(dir) === '_papelera') folders.push(...await dirs(dir)); else folders.push(dir);
  }
  for (const dir of folders) {
    let names: string[];
    try { names = (await readdir(dir)).filter(n => HISTORIA_FILES.test(n)); } catch { return null; }
    for (const name of names) {
      try {
        const h = validateHistoria(JSON.parse(await readFile(path.join(dir, name), 'utf8')));
        for (const use of behaviorUses(h.project)) used.add(`${use.behavior.id}.r${Number(use.behavior.revision) || 0}`);
      } catch { return null; }
    }
  }
  return used;
}

/** Borra de `_revisiones` lo no referenciado y más viejo que el margen (por defecto 3 días). */
export async function pruneBehaviorRevisions({historiasRoot, library, now = Date.now(), graceMs = REVISION_GRACE_MS}: {historiasRoot: string; library: string; now?: number; graceMs?: number}) {
  const folder = path.join(library, '_revisiones');
  let names: string[];
  try { names = (await readdir(folder)).filter(n => ARCHIVED.test(n)); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {kept: 0, deleted: [] as string[], skipped: false}; throw e; }
  const used = await referencedRevisions(historiasRoot);
  if (!used) return {kept: names.length, deleted: [] as string[], skipped: true};
  const deleted: string[] = [];
  for (const name of names) {
    const [, id, n] = name.match(ARCHIVED)!;
    if (used.has(`${id}.r${n}`)) continue;
    const file = path.join(folder, name);
    if (now - (await stat(file)).mtimeMs < graceMs) continue;
    await unlink(file).catch(() => {}); deleted.push(name);
  }
  return {kept: names.length - deleted.length, deleted, skipped: false};
}

let lastRun = 0;
/** Tras guardar una historia: limpieza en segundo plano, como mucho una vez cada 10 minutos. */
export function pruneBehaviorRevisionsSoon(cwd = process.cwd()) {
  const now = Date.now();
  if (now - lastRun < 10 * 60 * 1000) return;
  lastRun = now;
  void pruneBehaviorRevisions({historiasRoot: path.join(cwd, 'Estudio/Historias'), library: path.join(cwd, 'Estudio/Talleres/taller-animacion/biblioteca/comportamientos')}).catch(() => {});
}
