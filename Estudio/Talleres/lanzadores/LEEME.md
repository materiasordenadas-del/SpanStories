# Abrir el taller y el editor facial sin asistencia

Haz doble clic en el acceso directo del escritorio:

- **Taller de animación** → `http://127.0.0.1:5189/`
- **Editor facial - Rachel** → `http://127.0.0.1:8797/`

El acceso inicia el servidor si hace falta y abre la aplicación en tu navegador predeterminado. Si ya está abierta, reutiliza el mismo servidor. También puedes usar `Abrir-Taller.cmd` o `Abrir-Facial-Rachel.cmd` de esta carpeta. El lanzador anterior `Vale 2\rachel_threejs\Abrir-Rachel.cmd` sigue funcionando con el nuevo supervisor.

## Qué mantiene funcionando

Cada herramienta tiene un supervisor oculto e independiente de Codex y de sus terminales. Si el servidor se cierra, el supervisor lo vuelve a iniciar. Si un servidor iniciado por el supervisor deja de responder durante 90 segundos, lo reinicia. Los intentos fallidos tienen una espera progresiva de hasta 30 segundos.

No se reinicia ni recarga deliberadamente la pestaña. No hay cambios en la malla, animaciones, expresiones o proyectos de Rachel ni en la interfaz del taller.

Si cierras la pestaña o reinicias Windows, vuelve a hacer doble clic en el acceso directo. No se ha configurado un inicio automático con Windows. El supervisor mantiene el servidor; no recupera cambios que no se hayan guardado en un proyecto, ni impide fallos del propio navegador. Los datos guardados solo en el navegador pertenecen al perfil de navegador donde se guardaron.

## Archivos

- Configuración: `herramientas.json` (rutas, ejecutables y puertos).
- Lanzador y supervisor: `Abrir-Herramienta.ps1`.
- Estado actual: `estado\taller.json` y `estado\rachel.json`.
- Registro de arranques y errores: `registros\`.

No requiere instalar software ni cambiar la política de ejecución de PowerShell. Node y Python ya estaban instalados. Los servidores siguen escuchando únicamente en `127.0.0.1`.

## Consultar o detener

Desde PowerShell, en esta carpeta:

```powershell
powershell.exe -NoProfile -File .\Abrir-Herramienta.ps1 -App taller -Accion Estado
powershell.exe -NoProfile -File .\Abrir-Herramienta.ps1 -App rachel -Accion Estado

powershell.exe -NoProfile -File .\Abrir-Herramienta.ps1 -App taller -Accion Detener
powershell.exe -NoProfile -File .\Abrir-Herramienta.ps1 -App rachel -Accion Detener
```

Detener cierra el supervisor y solo un servidor que este haya iniciado. Si encontró un servidor ya abierto por otro proceso, lo deja funcionando. Si el puerto pertenece a otra aplicación, registra el conflicto sin cerrarla.

## Comprobaciones realizadas — 9/11/2026

- Ambos servidores responden con la identidad de su aplicación.
- Los dos supervisores dependen de `WmiPrvSE`, no de los procesos de la conversación.
- Aperturas repetidas conservan un único supervisor y servidor por aplicación.
- Una caída provocada en un servidor temporal de prueba fue recuperada automáticamente con otro PID; las aplicaciones de trabajo no se cerraron para hacer esta prueba.
- El servidor temporal y su supervisor se detuvieron al terminar.
- Se verificaron los destinos de los dos accesos directos y el lanzador anterior de Rachel.

La recuperación se comprobó con el mismo supervisor en un servidor aislado; no se provocó una caída de las sesiones reales ni se reinició Windows.
