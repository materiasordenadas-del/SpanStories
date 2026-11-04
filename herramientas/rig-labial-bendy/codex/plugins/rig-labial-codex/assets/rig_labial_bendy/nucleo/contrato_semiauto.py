"""Guardas puras del flujo de aprobación, separadas para poder probarlas sin Blender."""


def validar_antes_de_rig(cfg, actuales):
    if cfg.get('semiauto_boca_pendiente'):
        raise RuntimeError('Revisa y aprueba los cuatro marcadores semiautomáticos antes de crear huesos')
    aprobados = cfg.get('semiauto_boca_aprobada')
    if aprobados is not None and actuales != aprobados:
        raise RuntimeError('Los marcadores cambiaron desde su aprobación; apruébalos de nuevo')


def validar_reaprobacion(cfg, actuales):
    if not cfg.get('semiauto_boca_pendiente') and cfg.get('semiauto_boca_aprobada') == actuales:
        raise RuntimeError('No hay una detección semiautomática pendiente')
