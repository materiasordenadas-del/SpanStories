"""Maintenance contract exposed to agents by the running Blender add-on."""
VERSION = '0.2.4'
SELF_IMPROVEMENT = {
    'required': True,
    'rule': 'Cada error técnico resuelto debe convertirse en una corrección reutilizable del complemento y del add-on cuando corresponda; reparar solo un personaje no cierra el error.',
    'completion': ['reproducir y localizar la causa', 'corregir el componente responsable',
                   'añadir y ejecutar una prueba de regresión', 'actualizar habilidades y aprendizajes verificados',
                   'versionar y sincronizar fuente, paquetes e instalación autorizada',
                   'informar qué se instaló, ejecutó y verificó, y cualquier pendiente'],
    'reference': 'AUTO_MEJORA.md',
}
