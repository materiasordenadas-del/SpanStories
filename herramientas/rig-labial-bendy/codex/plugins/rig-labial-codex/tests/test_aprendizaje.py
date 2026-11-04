import importlib.util
import tempfile
import unittest
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location('learning', Path(__file__).resolve().parents[1] / 'skills/rig-labial-bendy/scripts/aprendizaje.py')
learning = importlib.util.module_from_spec(spec)
spec.loader.exec_module(learning)


class LearningTests(unittest.TestCase):
    def test_persistence_evidence_and_supersession(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            values = dict(character='Gómez', topic='párpados', problem='Separación', action='Ajustar', result='Pendiente')
            first = learning.add_record(root, status='propuesta', **values)
            self.assertEqual(learning.list_records(root, 'GÓMEZ')[0]['id'], first['id'])
            with self.assertRaises(ValueError):
                learning.add_record(root, status='verificado', **values)
            with self.assertRaises(FileNotFoundError):
                learning.add_record(root, status='verificado', evidence=[root / 'missing'], **values)
            proof = root / 'medicion.txt'
            proof.write_text('prueba de persistencia; no es evidencia Blender', encoding='utf-8')
            second = learning.add_record(root, status='verificado', evidence=[proof], supersedes=first['id'], **values)
            self.assertEqual([r['id'] for r in learning.list_records(root)], [second['id']])
            self.assertEqual(len(learning.list_records(root, history=True)), 2)
            self.assertEqual(len(second['evidence'][0]['sha256']), 64)
            with self.assertRaises(ValueError):
                learning.add_record(root, status='fallo', supersedes='../invalid', **values)

    def test_record_uses_manifest_versions(self):
        self.assertEqual(learning.versiones(), ('0.5.2', '0.5.2'))


spec_guard = importlib.util.spec_from_file_location('contract', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/contrato_semiauto.py')
contract = importlib.util.module_from_spec(spec_guard)
spec_guard.loader.exec_module(contract)

spec_route = importlib.util.spec_from_file_location('eyelid_route', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/ruta_parpados.py')
eyelid_route = importlib.util.module_from_spec(spec_route)
spec_route.loader.exec_module(eyelid_route)


class EyelidRoutingTests(unittest.TestCase):
    def test_approved_uv_masks_disable_legacy_globe_cut_without_mutating_input(self):
        original = {'pasos': 5}
        routed = eyelid_route.parametros_seguros(original, True)
        self.assertFalse(routed['recortar_globo'])
        self.assertEqual(original, {'pasos': 5})

    def test_without_uv_approval_preserves_explicit_legacy_choice(self):
        self.assertEqual(eyelid_route.parametros_seguros({'recortar_globo': True}, False),
                         {'recortar_globo': True})
        self.assertEqual(eyelid_route.parametros_seguros(None, False), {})


class ApprovalTests(unittest.TestCase):
    def test_rig_rejects_pending_or_stale_approval_and_allows_legacy(self):
        points = {'p': [1.0, 2.0, 3.0]}
        with self.assertRaisesRegex(RuntimeError, 'aprueba'):
            contract.validar_antes_de_rig({'semiauto_boca_pendiente': True}, points)
        with self.assertRaisesRegex(RuntimeError, 'cambiaron'):
            contract.validar_antes_de_rig({'semiauto_boca_aprobada': {'p': [0.0, 0.0, 0.0]}}, points)
        contract.validar_antes_de_rig({}, points)
        contract.validar_antes_de_rig({'semiauto_boca_aprobada': points}, points)


spec_inventory = importlib.util.spec_from_file_location('inventory', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/inventario.py')
inventory = importlib.util.module_from_spec(spec_inventory)
spec_inventory.loader.exec_module(inventory)


class InventoryTests(unittest.TestCase):
    def test_inventory_reports_islands_and_material_indices_without_mutation(self):
        from types import SimpleNamespace
        vertices = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (5, 0, 0)]
        original = list(vertices)
        edges = [(0, 1), (1, 2)]
        polygons = [SimpleNamespace(vertices=(0, 1, 2), material_index=3)]
        result = inventory.inventariar(vertices, edges, polygons)
        self.assertEqual(result['n_islas'], 2)
        self.assertEqual(result['islas'][0]['n_vertices'], 3)
        self.assertEqual(result['islas'][0]['material_indices'], [3])
        self.assertEqual(result['islas'][1]['material_indices'], [])
        self.assertEqual(vertices, original)
        self.assertEqual(edges, [(0, 1), (1, 2)])

    def test_surfaces_split_faces_touching_only_at_one_vertex(self):
        from types import SimpleNamespace
        vertices = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (-1, 0, 0), (0, -1, 0)]
        edges = [(0, 1), (1, 2), (2, 0), (0, 3), (3, 4), (4, 0)]
        polygons = [SimpleNamespace(vertices=(0, 1, 2), material_index=0),
                    SimpleNamespace(vertices=(0, 3, 4), material_index=0)]
        result = inventory.inventariar(vertices, edges, polygons)
        self.assertEqual(result['n_islas'], 1)
        self.assertEqual(result['n_superficies'], 2)
        self.assertEqual([s['shared_vertices'] for s in result['superficies']], [[0], [0]])


spec_axis = importlib.util.spec_from_file_location('mouth_axis', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/eje_boca.py')
mouth_axis = importlib.util.module_from_spec(spec_axis)
spec_axis.loader.exec_module(mouth_axis)


class MouthAxisTests(unittest.TestCase):
    def test_translation_preserves_center_width_radial_and_reflection(self):
        left, right, sample, shift = 0.01863, -0.00789, 0.0122, 0.00537
        cx, hw = mouth_axis.centro_y_semiancho(left, right)
        cx2, hw2 = mouth_axis.centro_y_semiancho(left + shift, right + shift)
        self.assertAlmostEqual(cx2, cx + shift)
        self.assertAlmostEqual(hw2, hw)
        self.assertAlmostEqual(mouth_axis.radial(sample + shift, cx2), mouth_axis.radial(sample, cx))
        self.assertAlmostEqual(mouth_axis.reflejar(sample + shift, cx2), mouth_axis.reflejar(sample, cx) + shift)


spec_pieces = importlib.util.spec_from_file_location('piece_assignment', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/asignacion_piezas.py')
piece_assignment = importlib.util.module_from_spec(spec_pieces)
spec_pieces.loader.exec_module(piece_assignment)


class PieceAssignmentTests(unittest.TestCase):
    def test_each_selected_island_gets_one_rigid_weight_from_centroid(self):
        z = [0.79, 0.84, 0.85, 0.90, 0.92, 0.82]
        islands = [10, 10, 10, 20, 20, 30]
        mask, jaw = piece_assignment.por_isla(z, islands, [0, 3], 0.83)
        self.assertEqual(mask, [True, True, True, True, True, False])
        self.assertEqual(jaw, [1.0, 1.0, 1.0, 0.0, 0.0, 0.0])


spec_uv_inventory = importlib.util.spec_from_file_location('uv_inventory', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/inventario_uv.py')
uv_inventory = importlib.util.module_from_spec(spec_uv_inventory)
spec_uv_inventory.loader.exec_module(uv_inventory)


class UVInventoryTests(unittest.TestCase):
    def setUp(self):
        self.vertices = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0)]

    def test_shared_edge_with_continuous_uv_joins_even_when_face_winding_flips(self):
        result = uv_inventory.inventariar(
            self.vertices, [(0, 1), (1, 2), (2, 0), (2, 1), (1, 3), (3, 2)],
            [(0, 1, 2), (2, 1, 3)],
            [[(0, 0), (1, 0), (1, 1)], [(1, 1), (1, 0), (0, 1)]], 1e-6)
        self.assertEqual(result['n_uv_islas'], 1)
        self.assertEqual(result['islas_uv'][0]['face_indices'], [0, 1])

    def test_uv_seam_on_shared_geometry_edge_keeps_faces_separate(self):
        result = uv_inventory.inventariar(
            self.vertices, [(0, 1), (1, 2), (2, 0), (1, 3), (3, 2)],
            [(0, 1, 2), (2, 1, 3)],
            [[(0, 0), (1, 0), (1, 1)], [(1.1, 1), (1.1, 0), (0, 1)]])
        self.assertEqual(result['n_uv_islas'], 2)

    def test_vertex_only_touch_does_not_join_islands(self):
        vertices = self.vertices + [(-1, 0, 0)]
        result = uv_inventory.inventariar(
            vertices, [(0, 1), (1, 2), (2, 0), (0, 3), (3, 4), (4, 0)],
            [(0, 1, 2), (0, 3, 4)],
            [[(0, 0), (1, 0), (1, 1)], [(0, 0), (1, 0), (1, 1)]])
        self.assertEqual(result['n_uv_islas'], 2)

    def test_coincident_uvs_on_unrelated_mesh_edges_do_not_join(self):
        vertices = [(0, 0, 0), (1, 0, 0), (0, 1, 0),
                    (3, 0, 0), (4, 0, 0), (3, 1, 0)]
        result = uv_inventory.inventariar(
            vertices, [(0, 1), (1, 2), (2, 0), (3, 4), (4, 5), (5, 3)],
            [(0, 1, 2), (3, 4, 5)],
            [[(0, 0), (1, 0), (0, 1)], [(0, 0), (1, 0), (0, 1)]])
        self.assertEqual(result['n_uv_islas'], 2)


spec_uv_regions = importlib.util.spec_from_file_location('uv_regions', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/regiones_uv.py')
uv_regions = importlib.util.module_from_spec(spec_uv_regions)
spec_uv_regions.loader.exec_module(uv_regions)


class UVRegionTests(unittest.TestCase):
    def test_absent_seed_fails_before_coloring_callback_or_object_write(self):
        class Face(dict):
            pass
        face = Face()
        called = []
        inventory = {'has_uv': True, 'islas_uv': [{'seed_face': 3, 'face_indices': [3, 4]}]}
        with self.assertRaisesRegex(ValueError, 'inexistente'):
            uv_regions.marcar_por_seed(face, inventory, {'cejas': [99]}, [3],
                                       lambda *args: called.append(args), 'UVMap')
        self.assertEqual(called, [])
        self.assertEqual(dict(face), {})


spec_region_masks = importlib.util.spec_from_file_location('region_masks', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/mascaras_regiones.py')
region_masks = importlib.util.module_from_spec(spec_region_masks)
spec_region_masks.loader.exec_module(region_masks)


class RegionMaskTests(unittest.TestCase):
    def test_face_ids_produce_uv_masks_and_side_uses_shifted_center(self):
        faces = [(0, 1, 2), (2, 3, 4), (5, 6, 7)]
        ids = [2, 1, 2]
        lashes = region_masks.vertices_por_region(faces, ids, 8, 2)
        brows = region_masks.vertices_por_region(faces, ids, 8, 1)
        self.assertEqual(list(lashes.nonzero()[0]), [0, 1, 2, 5, 6, 7])
        self.assertEqual(list(brows.nonzero()[0]), [2, 3, 4])
        x = [-0.02, 0.01, 0.03, 0.04, -0.01, 0.006, 0.005, 0.002]
        left = region_masks.por_lado(lashes, x, 0.005, 1)
        right = region_masks.por_lado(lashes, x, 0.005, -1)
        self.assertEqual(list(left.nonzero()[0]), [1, 2, 5])
        self.assertEqual(list(right.nonzero()[0]), [0, 7])


spec_contact_remap = importlib.util.spec_from_file_location('contact_remap', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/contacto_remap.py')
contact_remap = importlib.util.module_from_spec(spec_contact_remap)
spec_contact_remap.loader.exec_module(contact_remap)


class ContactRemapTests(unittest.TestCase):
    def test_evaluated_subset_maps_to_original_and_hidden_vertices_keep_basis(self):
        base = [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]]
        evaluated = [[10, 1, 0], [12, 1, 0]]
        result = contact_remap.reconstruir_indices(base, evaluated, [0, 2])
        self.assertEqual(result.tolist(), [[10, 1, 0], [1, 0, 0], [12, 1, 0], [3, 0, 0]])
        visible = contact_remap.vertices_visibles([(0, 1, 2), (2, 3)], [False, True], 4)
        self.assertEqual(visible.tolist(), [True, True, True, False])

    def test_invalid_or_missing_index_map_fails_closed(self):
        base = np.zeros((3, 3))
        ev = np.zeros((2, 3))
        with self.assertRaisesRegex(RuntimeError, 'falta RLB_indice_base'):
            contact_remap.reconstruir_indices(base, ev)
        with self.assertRaisesRegex(RuntimeError, 'fuera de rango'):
            contact_remap.reconstruir_indices(base, ev, [0, 3])
        with self.assertRaisesRegex(RuntimeError, 'duplicados'):
            contact_remap.reconstruir_indices(base, ev, [0, 0])

    def test_damped_newton_step_is_capped_and_singular_jacobian_is_safe(self):
        J = np.repeat(np.eye(3)[None, :, :], 2, axis=0)
        residual = np.array([[0.003, 0, 0], [0, 0.001, 0]])
        step = contact_remap.resolver_incrementos(J, residual, max_step=0.002)
        self.assertAlmostEqual(float(np.linalg.norm(step[0])), 0.002, places=7)
        self.assertTrue(np.allclose(step[1], residual[1], atol=1e-8))
        zero = contact_remap.resolver_incrementos(np.zeros((1, 3, 3)), np.ones((1, 3)))
        self.assertTrue(np.isfinite(zero).all())
        self.assertTrue(np.allclose(zero, 0))


spec_lash_uv = importlib.util.spec_from_file_location('lashes_uv', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/pestanas_uv.py')
lashes_uv = importlib.util.module_from_spec(spec_lash_uv)
spec_lash_uv.loader.exec_module(lashes_uv)


class LashUVTests(unittest.TestCase):
    def test_smooth_root_targets_keep_basis_and_finite_row_thickness(self):
        x = np.arange(6, dtype=float)
        basis = np.c_[x, np.full(6, -1.0), 2 * x + np.array([-.001, .001, -.001, .001, -.001, .001])]
        original = basis.copy()
        dy = lashes_uv.objetivos_raices_suaves(basis, basis.copy(), range(6),
                                                np.array([0., 0., 0., -1.]),
                                                np.array([0., 0., 2., 0.]), grosor=.002)
        goal = basis.copy()
        for i, delta in dy.items(): goal[i] += delta
        self.assertTrue(np.array_equal(basis, original))
        row_depth = goal[:, 1]
        self.assertGreater(float(np.ptp(row_depth)), 1e-5)
        self.assertLessEqual(float(np.ptp(row_depth)), .004 + 1e-9)
        self.assertTrue(np.allclose(goal[:, 2], 2 * x, atol=1e-10))

    def test_evaluated_lash_transport_rotates_radially_and_preserves_offset_length(self):
        angle = .6
        basis = np.array([[0., -1., 0.], [1., -1., 0.], [.52, -1.03, .04]])
        original = basis.copy()
        c, s = np.cos(angle), np.sin(angle)
        targets = basis.copy()
        for i in (0, 1):
            y, z = basis[i, 1], basis[i, 2]
            targets[i, 1:] = [c * y - s * z, s * y + c * z]
        moved = lashes_uv.objetivos_pestanas_evaluadas(
            basis, targets, [(2, 0, 1, .5)], [0., 0., 0.])[2]
        root0 = (basis[0] + basis[1]) * .5
        root1 = (targets[0] + targets[1]) * .5
        offset = basis[2] - root0
        expected_offset = np.array([offset[0], c * offset[1] - s * offset[2],
                                    s * offset[1] + c * offset[2]])
        self.assertTrue(np.allclose(moved, root1 + expected_offset, atol=1e-12))
        self.assertAlmostEqual(float(np.linalg.norm(moved - root1)),
                               float(np.linalg.norm(offset)), places=12)
        self.assertTrue(np.array_equal(basis, original))

    def test_weight_and_contact_delta_interpolate_roots_preserving_lash_offset(self):
        self.assertAlmostEqual(lashes_uv.interpolar_pesos(0.2, 0.8, 0.25), 0.35)
        basis = np.array([[0., 0., 0.], [2., 0., 0.], [1., 0.5, 0.]])
        key = basis.copy()
        key[0] += [0., 1., 0.]
        key[1] += [0., 3., 0.]
        out = lashes_uv.aplicar_delta_lash(basis, key, [[2, 0, 1, 0.5]])
        self.assertTrue(np.allclose(out[2], [1., 2.5, 0.]))
        self.assertTrue(np.allclose(out[2] - basis[2], [0., 2., 0.]))

    def test_root_edges_are_selected_on_each_side_and_nonroot_lashes_map_to_them(self):
        vertices = [(0.02, 0, 0), (0.04, 0, 0), (0.03, 0.01, 0), (0.03, -0.01, 0),
                    (-0.02, 0, 0), (-0.04, 0, 0), (-0.03, 0.01, 0), (-0.03, -0.01, 0)]
        faces = [(0, 1, 2), (1, 0, 3), (4, 5, 6), (5, 4, 7)]
        edges = sorted({tuple(sorted((f[i], f[(i + 1) % len(f)]))) for f in faces for i in range(len(f))})
        uv_inventory_fixture = {'islas_uv': [
            {'seed_face': 0, 'face_indices': [0], 'n_faces': 1},
            {'seed_face': 1, 'face_indices': [1, 3], 'n_faces': 2},
            {'seed_face': 2, 'face_indices': [2], 'n_faces': 1}]}
        roots = lashes_uv.derivar_raices(vertices, edges, faces, [2, 0, 2, 0], uv_inventory_fixture, 0.0)
        self.assertEqual(roots['skin_seed_face'], 1)
        self.assertEqual(roots['shared_root_edges'], {'L': 1, 'R': 1})
        self.assertEqual([m[0] for m in roots['mapping']['L']], [2])
        self.assertEqual([m[0] for m in roots['mapping']['R']], [6])

    def test_lash_rim_target_projects_to_roots_and_roundtrips_through_interpolation(self):
        mapping = [[9, 2, 4, 0.25]]
        target = np.array([0., 0.002, -0.001])
        projected = lashes_uv.proyectar_objetivos_root(mapping, [9], {9: target},
                                                       {2: np.zeros(3), 4: np.zeros(3)})
        lash_delta = lashes_uv.interpolar_deltas_root(mapping, projected)[9]
        self.assertTrue(np.allclose(lash_delta, target, atol=1e-7))


spec_regions = importlib.util.spec_from_file_location('face_regions', Path(__file__).resolve().parents[1] / 'assets/rig_labial_bendy/nucleo/regiones.py')
face_regions = importlib.util.module_from_spec(spec_regions)
spec_regions.loader.exec_module(face_regions)


class RegionTests(unittest.TestCase):
    def _fake_face(self):
        from types import SimpleNamespace

        class AttrData(list):
            def foreach_set(self, key, values):
                if key == 'value': self[:] = list(values)
                else:
                    self[:] = [tuple(values[i:i + 4]) for i in range(0, len(values), 4)]

        class Attrs(dict):
            def new(self, name, typ, domain):
                attr = SimpleNamespace(data_type=typ, domain=domain, data=AttrData())
                self[name] = attr
                return attr

        mesh = SimpleNamespace(polygons=[SimpleNamespace(loop_indices=(0, 1, 2)),
                                         SimpleNamespace(loop_indices=(3, 4, 5)),
                                         SimpleNamespace(loop_indices=(6, 7, 8))],
                             loops=[None] * 9, attributes=Attrs(), uv_layers=['uv-preserved'], materials=['mat-preserved'])
        class Face(dict):
            data = mesh
        return Face()

    def test_coloring_persists_face_and_corner_maps_and_keeps_eyes_gray(self):
        face = self._fake_face()
        uv, mats, polys = list(face.data.uv_layers), list(face.data.materials), list(face.data.polygons)
        out = face_regions.colorear(face, {'cejas': [0], 'labio_sup': [1]}, ojos=[2])
        self.assertEqual(face.data.attributes[face_regions.FACE_ATTR].data, [1, 3, 0])
        colors = face.data.attributes[face_regions.CORNER_ATTR].data
        self.assertEqual(colors[0], face_regions.REGIONES['cejas'][1])
        self.assertEqual(colors[3], face_regions.REGIONES['labio_sup'][1])
        self.assertEqual(colors[6], face_regions.GRIS)
        self.assertEqual(face.data.uv_layers, uv)
        self.assertEqual(face.data.materials, mats)
        self.assertEqual(face.data.polygons, polys)
        self.assertEqual(out['counts']['gris'], 1)

    def test_overlap_is_rejected_before_any_attribute_or_object_change(self):
        face = self._fake_face()
        with self.assertRaisesRegex(ValueError, 'solapa'):
            face_regions.colorear(face, {'cejas': [0], 'nariz': [0]}, ojos=[2])
        self.assertEqual(face.data.attributes, {})
        self.assertEqual(dict(face), {})


if __name__ == '__main__':
    unittest.main()
