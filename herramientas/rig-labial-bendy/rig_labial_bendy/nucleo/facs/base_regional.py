"""Restauración local a Basis por expresión; conserva las keys anteriores."""
import re
import numpy as np
from . import ajustes as AJ, ajustes_ojos as AO, retoque_parpados as RP
from .construir import poner_key


def es_base(nombre):
    return nombre.startswith('br_')


def pertenece(nombre, expr):
    return es_base(nombre) and nombre.split('_', 4)[-1] == re.sub(r'[^0-9A-Za-z]+', '_', expr).strip('_')


def puntos(cara, region, lado=''):
    prefijos = {'nariz': ('nariz_',), 'boca': ('labio_', 'comisura_'),
                'cejas': ('ceja_',), 'mejillas': ('mejilla_',),
                'mandibula': ('menton',), 'ojos': ('parpado_',)}[region]
    return [p for p in AJ.zonas(cara) if p.startswith(prefijos) and (not lado or p.endswith('_'+lado))]


def _mascara_nariz(cara):
    """Nariz completa entre labios y lagrimales, no la influencia de tres puntos.

    Los límites se miden en Basis con las anclas existentes. La transición queda
    alrededor de la nariz; el puente, punta y aletas tienen restitución completa.
    """
    base = AO._co(cara.data.shape_keys.reference_key)
    anclas = cara.get('aj_anclas', {})
    requeridas = ('nariz_L', 'nariz_R', 'nariz_punta')
    if any(p not in anclas for p in requeridas):
        raise RuntimeError('Faltan las anclas de la nariz para delimitar su malla base')
    nariz = np.array([base[int(anclas[p])] for p in requeridas])
    punta = nariz[2]
    ojos = []
    for lado in ('L', 'R'):
        ps = [base[int(i)] for p, i in anclas.items()
              if p.startswith('parpado_') and p.endswith('_'+lado)]
        if not ps:
            raise RuntimeError('Faltan los párpados para protegerlos al restaurar la nariz')
        ojos.append(min(ps, key=lambda p: abs(p[0]-punta[0])))
    labios = [base[int(i)] for p, i in anclas.items() if p.startswith('labio_sup_')]
    if not labios:
        raise RuntimeError('Falta el labio superior para protegerlo al restaurar la nariz')
    ojos = np.array(ojos)
    z_ojo = ojos[:, 2].mean()
    z_labio = max(p[2] for p in labios)
    altura = z_ojo-z_labio
    semiancho = abs(ojos[0, 0]-ojos[1, 0])/2
    if altura <= 1e-10 or semiancho <= 1e-10 or z_ojo <= nariz[:2, 2].mean():
        raise RuntimeError('Anclas nasales incompatibles con la orientación del rig')

    def suave(t):
        t = np.clip(t, 0., 1.)
        return t*t*(3.-2.*t)

    # Estrechar el puente entre los ojos; cubrir las aletas por debajo.
    u = np.clip((base[:, 2]-nariz[:2, 2].mean())/(z_ojo-nariz[:2, 2].mean()), 0., 1.)
    ancho = semiancho*(.8-.45*u)
    w = suave((base[:, 2]-(z_labio+.10*altura))/(.10*altura))
    w *= suave((z_ojo+.14*altura-base[:, 2])/(.14*altura))
    w *= suave((ancho+.18*semiancho-abs(base[:, 0]-punta[0]))/(.18*semiancho))
    # Excluir interior de la cabeza y otras superficies detrás de la nariz.
    w *= suave((ojos[:, 1].mean()+.15*altura-base[:, 1])/(.20*altura))
    return w


def mascara(cara, region, lado=''):
    if region == 'nariz':
        return _mascara_nariz(cara)
    if region == 'ojos':
        m = AO._mascaras_basales(cara)
        return np.clip(sum(m[parte, s] for parte in ('sup', 'inf')
                           for s in ((lado,) if lado else ('L', 'R'))), 0., 1.)
    sk = cara.data.shape_keys
    base = AO._co(sk.reference_key)
    w = np.zeros(len(base))
    for p in puntos(cara, region, lado):
        for d in AJ.zonas(cara)[p][2]:
            key = sk.key_blocks.get(AJ.nombre(p, d))
            if key is None:
                continue
            a = np.linalg.norm(AO._co(key)-base, axis=1)
            if a.max() > 1e-12:
                w = np.maximum(w, a/a.max())
    if not w.any():
        raise RuntimeError('No hay influencias de esta región para delimitar la restauración')
    # Centro a Basis y transición cúbica local, sin cortes binarios en la piel.
    t = np.clip((w-.02)/.48, 0., 1.)
    return t*t*(3.-2.*t)


def plan(cara, region, lado, intensidad):
    if intensidad <= 1e-8:
        raise RuntimeError('Sube la intensidad de la expresión antes de restaurar una región')
    peso = mascara(cara, region, lado)
    if not peso.any():
        raise RuntimeError('La región seleccionada no tiene una máscara válida')
    base = AO._co(cara.data.shape_keys.reference_key)
    mezcla = RP._mezcla(cara, '')
    return (base-mezcla)*peso[:, None]/intensidad


def aplicar(cara, expr, region, lado, delta):
    from . import biblioteca as BI
    serial = len(cara.data.shape_keys.key_blocks)
    nombre = f'br_{region}_{lado or "ambos"}_{serial}_'+re.sub(r'[^0-9A-Za-z]+', '_', expr).strip('_')
    poner_key(cara, nombre, delta)
    RP._conectar(cara, BI.control(cara), nombre)
    return nombre
