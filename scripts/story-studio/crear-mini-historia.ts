// Escribe las minihistorias de prueba (cues antiguos y Switcher) de cámaras como historia real del Estudio (aparece en el menú de historias).
// Uso: node scripts/story-studio/crear-mini-historia.ts [--force]
// No sobrescribe una copia existente salvo con --force: puede contener cambios hechos a mano en el Estudio.
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateHistoria } from '../../features/story-studio/historia.ts';
import { buildMiniHistoria, buildMiniSwitcher } from '../../features/story-studio/__tests__/fixtures/mini-historia.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const h of [buildMiniHistoria(), buildMiniSwitcher()].map(validateHistoria)) {
  const dir = path.join(root, 'Estudio', 'Historias', h.id), file = path.join(dir, 'historia.json');
  if (existsSync(file) && !process.argv.includes('--force')) {
    console.log(`Ya existe ${path.relative(root, file)}; no se sobrescribe (usa --force para regenerarla).`);
    continue;
  }
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(h, null, 1) + '\n');
  console.log(`Minihistoria escrita en ${path.relative(root, file)}`);
}
