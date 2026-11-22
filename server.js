// Entrada única para npm, Bun y la vista previa de Google AI Studio.
process.chdir(__dirname);
import('./scripts/ai-studio.mjs').catch(error => {
  console.error('[SpanStories] No se pudo arrancar el Estudio:', error);
  process.exitCode = 1;
});
