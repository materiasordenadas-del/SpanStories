# Atlas · Estudio de lugares

`npm run dev` → http://127.0.0.1:5179/ · Fuente única: esta carpeta.

- Relevo Codex ↔ Claude Code: continuar siempre la última versión de Estudio, conservando las mejoras del agente anterior. Leer primero [docs/ESTADO.md](docs/ESTADO.md); nunca reiniciar desde la base ni desarrollar dentro de un respaldo.
- Prohibido dejar versiones antiguas, pruebas o archivos sustituidos sueltos junto al programa vigente.
- Antes de modificar: `npm run respaldo -- <version-actual>`. Al entregar, actualizar versión, cambios, pruebas y limitaciones en `docs/ESTADO.md` y respaldar la versión entregada, sin sobrescribir respaldos.
- Documentación vigente: `docs/`; evidencias actuales: `reports/estudio/`; exportaciones: `exportaciones/`. Históricos: `respaldo/`; los fixtures activos de `reports/` se conservan.
- Ciudades modulares: separar datos, terreno, calles, edificios, fachadas y recursos; IDs estables y piezas reemplazables sin alterar lo demás.
- Entrega: [informe para continuar](docs/INFORME_CONTINUACION.md), [informe de la última sesión (0.16.1)](docs/INFORME_SESION_0.16.1.md) y [limitaciones actuales](docs/LIMITACIONES.md). Verificar cada cambio y pedir aprobación antes de decisiones visuales importantes.
