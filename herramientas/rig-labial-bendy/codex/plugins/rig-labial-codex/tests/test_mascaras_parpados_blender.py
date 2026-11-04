"""Pruebas numéricas ejecutables con Python o Blender, sin alterar una escena."""
import importlib.util
import json
from pathlib import Path
import unittest
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('mascaras_parpados', ROOT / 'assets/rig_labial_bendy/nucleo/facs/mascaras_parpados.py')
MP = importlib.util.module_from_spec(spec); spec.loader.exec_module(MP)


class Mascaras(unittest.TestCase):
    def setUp(self):
        self.p = np.array([(x, 0., z) for z in (0., 1., 2., 3., 4.) for x in range(7)] + [(3., 0., 2.1)])
        self.edges = np.array([(7*z+x, 7*z+x+1) for z in range(5) for x in range(6)] + [(7*z+x, 7*(z+1)+x) for z in range(4) for x in range(7)])
        self.delta = np.zeros_like(self.p); self.delta[:, 2] = .5
        self.bordes = {'sup': list(range(21, 28)), 'inf': list(range(7, 14))}

    def test_escala_y_aislamiento(self):
        m, a, _ = MP.calcular(self.p, self.edges, self.delta, self.bordes)
        ms, ass, _ = MP.calcular(self.p * 10, self.edges, self.delta * 10, self.bordes)
        self.assertEqual(a, ass)
        for k in m:
            np.testing.assert_allclose(m[k], ms[k], atol=1e-12)
            self.assertEqual(m[k][-1], 0)
            self.assertAlmostEqual(m[k][a[k[0]][k[1]-1]], 1.)
        self.assertFalse(np.allclose(m['sup', 1], m['sup', 3]))

    def test_borde_ambiguo_y_dominio(self):
        bad = dict(self.bordes, sup=[21, 23, 24])
        with self.assertRaises(RuntimeError): MP.calcular(self.p, self.edges, self.delta, bad)
        delta = self.delta.copy(); delta[22] = 0
        m, _, _ = MP.calcular(self.p, self.edges, delta, self.bordes)
        self.assertTrue(all(v[22] == 0 for v in m.values()))

    def test_espejo_y_arco_curvo(self):
        p = self.p.copy(); p[:, 1] = .05 * (p[:, 0] - 3.) ** 2
        a, _, _ = MP.calcular(p, self.edges, self.delta, self.bordes)
        espejo = p.copy(); espejo[:, 0] *= -1
        b, _, _ = MP.calcular(espejo, self.edges, self.delta, self.bordes)
        for lab in ('sup', 'inf'):
            for i in (1, 2, 3):
                np.testing.assert_allclose(a[lab, i], b[lab, 4-i], atol=1e-12)

    def test_esquinas_continuidad_y_bandas(self):
        nx, nz = 31, 21
        p = np.array([(x / 30, 0., z / 50) for z in range(nz) for x in range(nx)])
        edges = np.array([(nx*z+x, nx*z+x+1) for z in range(nz) for x in range(nx-1)] +
                         [(nx*z+x, nx*(z+1)+x) for z in range(nz-1) for x in range(nx)])
        delta = np.zeros_like(p); delta[:, 2] = .1
        bordes = {'sup': list(range(nx*15, nx*16)), 'inf': list(range(nx*5, nx*6))}
        masks, anclas, _ = MP.calcular(p, edges, delta, bordes)
        for lab in ('sup', 'inf'):
            for i in (1, 2, 3):
                for j in (1, 2, 3):
                    self.assertAlmostEqual(masks[lab, i][anclas[lab][j-1]], float(i == j))
            self.assertLessEqual(np.max(sum(masks[lab, i] for i in (1, 2, 3))), 1.000001)
        for (lab, i), w in masks.items():
            self.assertEqual(w[bordes[lab][0]], 0.)
            self.assertEqual(w[bordes[lab][-1]], 0.)
            self.assertAlmostEqual(w[anclas[lab][i-1]], 1.)
            self.assertLessEqual(w.max(), 1.000001)
            self.assertLess(np.max(np.abs(w[edges[:, 0]] - w[edges[:, 1]])), .55)
        self.assertGreater(np.count_nonzero(masks['sup', 2]), np.count_nonzero(masks['inf', 2]))

    def test_borde_interior_y_piel_frontal(self):
        nx, nz = 21, 21
        p = [(x / 20., 0., z / 20.) for z in range(nz) for x in range(nx)]
        edges = [(nx*z+x, nx*z+x+1) for z in range(nz) for x in range(nx-1)]
        edges += [(nx*z+x, nx*(z+1)+x) for z in range(nz-1) for x in range(nx)]
        tris = []
        for z in range(nz-1):
            for x in range(nx-1):
                v = nx*z+x
                tris.extend(((v, v+1, v+nx), (v+1, v+nx+1, v+nx)))
        bordes = {}
        for lab, z in (('sup', 14), ('inf', 6)):
            start = len(p); bordes[lab] = list(range(start, start+nx))
            p.extend((x / 20., .2, z / 20.) for x in range(nx))
            edges.extend((start+x, start+x+1) for x in range(nx-1))
            edges.extend((start+x, z*nx+x) for x in range(nx))
        p = np.asarray(p); edges = np.asarray(edges); delta = np.zeros_like(p); delta[:, 2] = .1
        anterior, _, _ = MP.calcular(p, edges, delta, bordes)
        corregido, anclas, _ = MP.calcular(p, edges, delta, bordes, triangulos=np.asarray(tris))
        for lab, z in (('sup', 14), ('inf', 6)):
            w = corregido[lab, 2]; centro = z*nx+10
            self.assertLess(anterior[lab, 2][centro], .02)
            self.assertGreater(w[centro], .9)
            self.assertAlmostEqual(w[anclas[lab][1]], 1.)
            self.assertEqual(w[z*nx], 0.)
            self.assertEqual(w[10], 0.)

    def test_tom_si_disponible(self):
        entrega = ROOT.parents[1] / 'entregas/pesos_parpados_0825'
        if not (entrega / 'tom_diagnostico.npz').exists(): self.skipTest('Diagnóstico Tom no disponible')
        d = np.load(entrega / 'tom_diagnostico.npz')
        j = json.loads((entrega / 'tom_antes.json').read_text(encoding='utf8'))
        for s in ('L', 'R'):
            prev = {(l, i): j['anchors'][f'parpado_{l}_{i}_{s}'] for l in ('sup', 'inf') for i in (1, 2, 3)}
            tri = entrega / 'tom_triangles.npy'
            m, a, _ = MP.calcular(d['P'], d['edges'], d['blink_'+s], {l: j['borders'][l+'_'+s] for l in ('sup', 'inf')}, prev, np.load(tri) if tri.exists() else None)
            if s == 'L' and tri.exists():
                self.assertGreater(m['inf', 2][19653], .5)
            for (l, i), w in m.items():
                self.assertEqual(a[l][i-1], prev[l, i]); self.assertAlmostEqual(w[prev[l, i]], 1.)
                self.assertTrue(np.isfinite(w).all()); self.assertGreater(np.count_nonzero(w > 1e-6), 20)
                self.assertFalse(np.any(w[np.linalg.norm(d['blink_'+s], axis=1) == 0]))


if __name__ == '__main__': unittest.main()
