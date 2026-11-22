import {mkdir, open, stat, unlink} from 'node:fs/promises';
import path from 'node:path';

/**
 * Cerrojo exclusivo en disco (un archivo creado con `wx`) entre pestañas y procesos.
 * Un cerrojo más antiguo que `staleMs` pertenece a un proceso que murió a medio escribir:
 * se retira y se vuelve a intentar, para que un cierre inesperado no bloquee para siempre los guardados.
 */
export type FileLockOptions = {
  /** Nombre del archivo de cerrojo dentro de `dir`. */
  name?: string;
  /** Edad a partir de la cual el cerrojo se considera abandonado. */
  staleMs?: number;
  /** Crear `dir` si no existe (por defecto sí). Con `false`, una carpeta inexistente devuelve 'missing'. */
  create?: boolean;
};

export async function withFileLock<T>(dir: string, fn: () => Promise<T>, {name = 'guardando.lock', staleMs = 60000, create = true}: FileLockOptions = {}): Promise<T | 'busy' | 'missing'> {
  if (create) await mkdir(dir, {recursive: true});
  else { try { if (!(await stat(dir)).isDirectory()) return 'missing'; } catch { return 'missing'; } }
  const lock = path.join(dir, name);
  let handle;
  try { handle = await open(lock, 'wx'); } catch {
    try { if (Date.now() - (await stat(lock)).mtimeMs > staleMs) { await unlink(lock); handle = await open(lock, 'wx'); } } catch {}
    if (!handle) return 'busy';
  }
  try { return await fn(); } finally { await handle.close(); await unlink(lock).catch(() => {}); }
}
