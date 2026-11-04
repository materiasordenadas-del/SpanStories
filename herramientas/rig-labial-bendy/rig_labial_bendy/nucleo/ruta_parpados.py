"""Helpers puros para conservar geometría con máscaras UV aprobadas."""


def parametros_seguros(parametros, mascara_uv_aprobada):
    """Desactiva el recorte ocular legado si las pestañas vienen de UV aprobadas."""
    result = dict(parametros or {})
    if mascara_uv_aprobada:
        result['recortar_globo'] = False
    return result
