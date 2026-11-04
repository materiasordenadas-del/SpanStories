# Rig Labial Bendy Codex 0.5.0

Versión local independiente para Codex basada en el código Blender 0.5.0 y el criterio del plugin Claude 0.4.1. El original no se modifica. El add-on incluido mantiene su licencia MIT declarada en blender_manifest.toml.

Instalación local desde PowerShell:
```powershell
codex plugin marketplace add 'D:\Español\imagen para animación\Animación 3D\rig_labial_bendy\codex'
codex plugin add rig-labial-codex@rig-labial-codex-local
```

Invocación: pide usar Rig Labial Bendy Codex para trabajar sobre una boca, párpados o expresiones. Un chat ya abierto puede necesitar una nueva sesión para descubrir la habilidad. Instalarlo no instala ni cambia el complemento dentro de Blender.

Aprendizaje persistente en `codex\aprendizaje`, fuera de la caché del plugin. El agente consulta y registra resultados durante el uso; solo aplica correcciones verificadas que correspondan al personaje y al alcance. No hay entrenamiento del modelo ni servicio autónomo en segundo plano.

Para futuras versiones edita únicamente la fuente de este plugin, prueba el cambio, incrementa ambos manifiestos y reinstala mediante Codex. Conserva el directorio de aprendizaje. No edites las cachés de Claude/Codex.
