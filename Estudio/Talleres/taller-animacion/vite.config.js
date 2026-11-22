import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tallerPlugin } from './herramientas/plugin.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tallerPlugin({ root: ROOT })],
  server: { fs: { allow: [ROOT] }, watch: { ignored: ['**/biblioteca/**', '**/exportaciones/**', '**/reports/**', '**/tmp-fbx-*/**', '**/kimodo/**'] } },
  optimizeDeps: { entries: ['**/*.html', '!kimodo/**', '!node_modules/**'] },
  build: { chunkSizeWarningLimit: 2000 },
});
