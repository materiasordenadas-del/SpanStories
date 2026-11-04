"""Regresión aislada en Blender --background --factory-startup; nunca carga personajes."""
import bpy
import hashlib
import importlib
import json
import numpy as np
from pathlib import Path
import runpy
import tempfile

fixture = runpy.run_path(str(Path(__file__).with_name('test_anclas_labios_blender.py')))
AJ = fixture['AJ']
ML = importlib.import_module('rlb_facs_test.mascaras_labios')


def firmas(cara):
    out = {}
    for k in cara.data.shape_keys.key_blocks:
        co = np.empty(len(k.data) * 3, dtype=np.float32); k.data.foreach_get('co', co)
        out[k.name] = hashlib.sha256(co.tobytes()).hexdigest()
    return out


resultados = []
for nombre in ('Labios_pequenos', 'Labios_grandes', 'Labios_fuera_del_origen'):
    cara = bpy.data.objects[nombre]
    kb = cara.data.shape_keys.key_blocks
    P = np.array([v.co for v in kb[0].data])
    hw = (P[:, 0].max() - P[:, 0].min()) / 2
    cx = (P[:, 0].max() + P[:, 0].min()) / 2
    # Máscara deliberadamente incorrecta: una columna X cruza ambos labios y sus alrededores.
    amplitud = np.exp(-((P[:, 0] - cx - hw * 0.5) / (hw * 0.4)) ** 2) * hw * 0.2
    for p in ('labio_sup_5', 'labio_inf_5'):
        for d, eje in (('arriba', (0, 0, 1)), ('adelante', (0, -1, 0)), ('derecha', (1, 0, 0))):
            AJ.poner_key(cara, AJ.nombre(p, d), amplitud[:, None] * np.array(eje), 0.17, (-1., 1.))
    # Una forma ajena sirve de centinela de las otras secciones.
    AJ.poner_key(cara, 'eyeBlink_L', np.ones_like(P) * hw * 0.001, 0.31)
    antes = firmas(cara)
    valores = {k.name: k.value for k in kb}
    preview = ML.actualizar(cara, aplicar=False)
    assert antes == firmas(cara), 'El ensayo modificó la geometría'
    assert any(q['fuga_fuera_antes'] > hw * 0.01 for q in preview['por_key'])
    with tempfile.TemporaryDirectory(prefix='rlb_localidad_prueba_') as carpeta:
        ruta = Path(carpeta) / 'respaldo_solo_aj_labio.npz'
        ML.respaldar(cara, ruta)
        cambio = ML.actualizar(cara, aplicar=True)
        despues = firmas(cara)
        assert despues['eyeBlink_L'] == antes['eyeBlink_L']
        assert despues['Basis'] == antes['Basis']
        assert all(q['fuga_fuera_despues'] == 0 for q in cambio['por_key'])
        assert all(q['fuga_otro_labio_despues'] == 0 for q in cambio['por_key'])
        assert all(abs(q['amplitud_ancla_antes'] - q['amplitud_ancla_despues']) < hw * 1e-6
                   for q in cambio['por_key'])
        segunda = ML.actualizar(cara, aplicar=True)
        assert segunda['keys'] == 0
        assert despues == firmas(cara), 'Se acumularon recortes al aplicar por segunda vez'
        assert valores == {k.name: k.value for k in kb}
        ML.restaurar(cara)
        assert antes == firmas(cara), 'El respaldo no restauró las coordenadas exactas'
        assert valores == {k.name: k.value for k in kb}
    resultados.append({'fixture': nombre, 'keys_corregidas': cambio['keys'], 'fuga_otro_labio': 0,
                       'fuga_fuera_banda': 0, 'amplitud_ancla_conservada': True,
                       'idempotente_bit_a_bit': True, 'restauracion_exacta': True,
                       'facs_ajeno_conservado': True, 'valores_conservados': True})
print('RLB_LOCALIDAD_OK ' + json.dumps(resultados))
