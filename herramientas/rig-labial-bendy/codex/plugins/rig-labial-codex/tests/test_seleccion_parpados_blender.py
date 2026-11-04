"""Selección conjunta aislada, sin abrir ni guardar escenas del usuario."""
import ast
import importlib
import sys
from pathlib import Path
import bpy
import numpy as np

raiz = Path(__file__).parents[1]
sys.path.insert(0, str(raiz / 'assets'))
import rig_labial_bendy as addon
from rig_labial_bendy.nucleo.facs import editor as E, pesos_parpados as PP
addon.register()
fixture = raiz / 'tests/test_regenerar_parpados_blender.py'
arbol = ast.parse(fixture.read_text(encoding='utf-8'))
seleccion = [n for n in arbol.body if isinstance(n, (ast.Import, ast.ImportFrom, ast.Assign)) or
             isinstance(n, ast.FunctionDef) and n.name == 'crear']
ns = {'__file__': str(fixture)}
exec(compile(ast.Module(body=seleccion, type_ignores=[]), str(fixture), 'exec'), ns)
cara, ctrl = ns['crear'](1., 1., 1., 'grupo')
AO = importlib.import_module('rig_labial_bendy.nucleo.facs.ajustes_ojos')
AO.asegurar(cara)
ed = bpy.context.scene.rlb_editor
ed.zona = 'ojos'; ed.punto = 'parpado_sup_2_L'; ed.enlazar = False
for lado in ('L', 'R'):
    for lab in ('sup', 'inf'):
        for i in (1, 2, 3):
            for d in AO.DIRECCIONES:
                c = ed.canales.add(); c.name = f'aj_parpado_{lab}_{i}_{lado}_{d}'
                c.ajuste = True; c.fino = 10 * i if lado == 'L' else -5 * i
ed.seleccion_parpado = 'sup'
assert E.puntos_parpado_seleccion(ed) == [f'parpado_sup_{i}_L' for i in (1, 2, 3)]
bases = E._grupo_bases(ed, ed.punto, 'arriba')
E._bloqueo[0] = True
try: assert E._grupo_mover(ed, bases, 70) == 70
finally: E._bloqueo[0] = False
assert [ed.canales[f'aj_parpado_sup_{i}_L_arriba'].fino for i in (1, 2, 3)] == [80, 90, 100]
assert [ed.canales[f'aj_parpado_sup_{i}_R_arriba'].fino for i in (1, 2, 3)] == [-5, -10, -15]
E._bloqueo[0] = True
try:
    for i, v in enumerate((10, 100, -100), 1): ed.canales[f'aj_parpado_sup_{i}_L_arriba'].fino = v
finally: E._bloqueo[0] = False
refrescar, nota = E._refrescar, E._nota_cambio
E._refrescar = lambda *a, **k: None
E._nota_cambio = lambda *a, **k: None
ed.activo = True
ed.grupo_arriba = ed.grupo_arriba + 10
assert np.allclose([ed.canales[f'aj_parpado_sup_{i}_L_arriba'].fino for i in (1, 2, 3)], [20, 100, -90])
arrastre = E.iniciar_arrastre(ed, cara, ed.punto)
assert '_grupo' in arrastre
E.mover_arrastre(ed, ed.punto, arrastre, 0, -10, ganancias={'arriba': 1.})
assert np.allclose([ed.canales[f'aj_parpado_sup_{i}_L_arriba'].fino for i in (1, 2, 3)], [10, 90, -100])
ed.activo = False
E._refrescar, E._nota_cambio = refrescar, nota
ed.enlazar = True
assert len(E.puntos_parpado_seleccion(ed)) == 6
bases = E._grupo_bases(ed, ed.punto, 'derecha')
E._bloqueo[0] = True
try: E._grupo_mover(ed, bases, 10)
finally: E._bloqueo[0] = False
assert [ed.canales[f'aj_parpado_sup_{i}_L_derecha'].fino for i in (1, 2, 3)] == [20, 30, 40]
assert [ed.canales[f'aj_parpado_sup_{i}_R_derecha'].fino for i in (1, 2, 3)] == [-15, -20, -25]
ed.seleccion_parpado = 'inf'
assert ed.punto == 'parpado_inf_2_L' and ed.parte_ojos == 'inf'
ed.enlazar = False
seleccion = E.puntos_parpado_seleccion(ed)
base = AO._co(cara.data.shape_keys.reference_key)
antes = {p: AO._co(cara.data.shape_keys.key_blocks[f'aj_{p}_arriba']).copy() for p in seleccion}
ajeno = AO._co(cara.data.shape_keys.key_blocks['aj_parpado_sup_2_R_arriba']).copy()
PP.aplicar_varios(cara, seleccion, 2., 1., 1.)
for p in seleccion:
    assert np.allclose(AO._co(cara.data.shape_keys.key_blocks[f'aj_{p}_arriba']) - base, 2 * (antes[p] - base), atol=1e-8)
assert np.array_equal(AO._co(cara.data.shape_keys.key_blocks['aj_parpado_sup_2_R_arriba']), ajeno)
assert all(PP.opciones_punto(cara, p)['intensidad'] == 2. for p in seleccion)
addon.unregister()
print('OK seleccion 3, lado, simetria, limites, offsets y pesos independientes')
