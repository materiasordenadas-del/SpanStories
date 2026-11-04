"""Blender --background --factory-startup --python <este archivo>."""
import bpy
import hashlib
import importlib
import json
import numpy as np
from pathlib import Path
import runpy

fixture = runpy.run_path(str(Path(__file__).with_name('test_anclas_labios_blender.py')))
G = importlib.import_module('rlb_facs_test.grosor_labios')


def firmas(cara):
    out = {}
    for k in cara.data.shape_keys.key_blocks:
        co = np.empty(len(k.data) * 3, dtype=np.float32)
        k.data.foreach_get('co', co)
        out[k.name] = hashlib.sha256(co.tobytes()).hexdigest()
    return out


informes = []
for n in ('Labios_pequenos', 'Labios_grandes', 'Labios_fuera_del_origen'):
    cara = bpy.data.objects[n]
    # La fixture de anclas usa pesos solapados a propósito. Para grosor, asignar
    # pertenencia anatómica exclusiva como la requerida por el rig real.
    basis = np.array([v.co[:] for v in cara.data.shape_keys.key_blocks[0].data])
    mitad = len(basis) // 2
    for grupo in cara.vertex_groups:
        if grupo.name.startswith('DEF-labio_'):
            grupo.remove(list(range(len(basis))))
            ids = list(range(mitad)) if 'sup' in grupo.name else list(range(mitad, len(basis)))
            grupo.add(ids, 1., 'REPLACE')
    previas = firmas(cara)
    valores = {k.name: k.value for k in cara.data.shape_keys.key_blocks}
    drivers = len(cara.data.shape_keys.animation_data.drivers)
    activo = bpy.context.active_object
    seleccion = list(bpy.context.selected_objects)
    assert set(G.crear(cara)) == set(G.NOMBRES.values())
    assert bpy.context.active_object == activo and list(bpy.context.selected_objects) == seleccion
    assert len(cara.data.shape_keys.animation_data.drivers) == drivers
    assert all(firmas(cara)[k] == v for k, v in previas.items())
    assert all(cara.data.shape_keys.key_blocks[k].value == v for k, v in valores.items())
    P, deltas = G.calcular(cara)
    assert not np.any((np.linalg.norm(deltas['sup'], axis=1) > 0)
                      & (np.linalg.norm(deltas['inf'], axis=1) > 0)), 'Cruce entre labios'
    for lab, key in G.NOMBRES.items():
        k = cara.data.shape_keys.key_blocks[key]
        assert k.value == 0. and k.slider_min == -1. and k.slider_max == 1.
        assert np.max(np.abs(deltas[lab][:, 0])) == 0., 'Cambio de ancho'
        assert np.max(deltas[lab][:, 1]) == 0. and np.min(deltas[lab][:, 1]) < 0.
        assert np.min(deltas[lab][:, 2]) < 0. < np.max(deltas[lab][:, 2]), 'Solo desplaza el labio'
        # En ambos extremos el sentido de los triángulos de la superficie se conserva.
        cara.data.calc_loop_triangles()
        ts = np.asarray([t.vertices[:] for t in cara.data.loop_triangles])
        base = np.cross(P[ts[:, 1]] - P[ts[:, 0]], P[ts[:, 2]] - P[ts[:, 0]])
        for v in (-1., 1.):
            Q = P + v * deltas[lab]
            normal = np.cross(Q[ts[:, 1]] - Q[ts[:, 0]], Q[ts[:, 2]] - Q[ts[:, 0]])
            assert np.all(np.sum(base * normal, axis=1) > 0), 'Se invierte una cara'
    antes = firmas(cara)
    assert G.crear(cara) == [] and firmas(cara) == antes
    # La versión inicial del control no movía suficiente superficie.
    # Migrar únicamente sus dos keys y conservar el mínimo elegido por el usuario.
    for key in G.NOMBRES.values():
        k = cara.data.shape_keys.key_blocks[key]
        k.data.foreach_set('co', P.ravel())
        k.value = -1.
    cara['rlb_grosor_version'] = 1
    assert set(G.crear(cara)) == set(G.NOMBRES.values())
    assert cara['rlb_grosor_version'] == G.VERSION
    assert firmas(cara) == antes
    assert all(cara.data.shape_keys.key_blocks[k].value == -1. for k in G.NOMBRES.values())
    assert all(firmas(cara)[k] == v for k, v in previas.items())
    informes.append({'personaje': n, 'keys_previas_conservadas': True,
                     'drivers_conservados': True, 'labios_independientes': True,
                     'triangulos_validos_en_ambos_extremos': True, 'idempotente': True})

print('RLB_GROSOR_OK ' + json.dumps(informes))
