import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "../../features/worlds/catalog.ts";
import type { Country, Library } from "../../features/worlds/model.ts";

const root = fileURLToPath(new URL("../../", import.meta.url));
async function json<T>(path: string): Promise<T> { return JSON.parse(await readFile(resolve(root, path), "utf8")) as T; }
const library = await json<Library>("content/worlds/library.json");
const countries = await Promise.all(["ar", "co", "es"].map(id => json<Country>(`content/worlds/countries/${id}/country.json`)));
const errors = validateCatalog(library, countries);
async function checkFile(path: string, expectedHash?: string, bytes?: number) {
  const full = resolve(root, path);
  const rel = relative(root, full);
  if (rel.startsWith("..") || isAbsolute(rel)) { errors.push(`Ruta fuera del repositorio: ${path}`); return; }
  try {
    const info = await stat(full);
    if (!info.isFile()) throw new Error("no es un archivo");
    if (bytes !== undefined && info.size !== bytes) errors.push(`Tamaño incorrecto: ${path}`);
    if (expectedHash) {
      const hash = createHash("sha256").update(await readFile(full)).digest("hex");
      if (hash !== expectedHash) errors.push(`Contenido alterado: ${path}`);
    }
  } catch { errors.push(`Archivo ausente: ${path}`); }
}
for (const base of library.places) await checkFile(base.entry);
for (const asset of library.assets) {
  await checkFile(asset.path, asset.sha256, asset.bytes);
  for (const dependency of asset.dependencies) await checkFile(dependency.path, dependency.sha256);
  const mapped = `worlds${decodeURIComponent(asset.url)}`;
  if (mapped !== asset.path) errors.push(`URL y archivo difieren: ${asset.id}`);
}
if (process.argv.includes("--migration")) {
  const migration = await json<{ places: { destination: string; files: { path: string; sha256: string; bytes: number }[] }[] }>("worlds/migration.json");
  const repairs = await json<{ files: { path: string; originalSha256: string; sha256: string; reason: string }[] }>("worlds/repairs.json");
  const repaired = new Map(repairs.files.map(f => [f.path, f]));
  for (const place of migration.places) for (const file of place.files) {
    const path = `${place.destination}/${file.path}`;
    const repair = repaired.get(path);
    if (repair && repair.originalSha256 !== file.sha256) errors.push(`Reparación sin origen verificable: ${path}`);
    await checkFile(path, repair?.sha256 ?? file.sha256, repair ? undefined : file.bytes);
  }
}
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
else console.log(`Catálogo válido: ${countries.length} países, ${library.places.length} lugares, ${library.characters.length} grupos de personajes, ${library.assets.length} recursos únicos. Integridad verificada.`);
