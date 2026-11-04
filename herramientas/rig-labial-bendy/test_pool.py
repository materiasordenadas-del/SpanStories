"""Pruebas del instalador sin tocar las instalaciones reales."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import pool

class PoolTests(unittest.TestCase):
    def test_invalid_version_does_not_read_or_write(self):
        with patch.object(pool.Path, 'read_text') as read:
            with self.assertRaises(ValueError):
                pool.poner_version('../otra')
            read.assert_not_called()

    def test_missing_manifest_preserves_others(self):
        with tempfile.TemporaryDirectory() as temp:
            first = Path(temp) / 'plugin.json'
            first.write_text('{"version":"0.8.41"}')
            with patch.object(pool, 'MANIFIESTOS', [first, Path(temp) / 'missing.json']):
                with self.assertRaises(FileNotFoundError):
                    pool.poner_version('0.8.42')
            self.assertEqual(json.loads(first.read_text())['version'], '0.8.41')

    def test_all_version_formats(self):
        with tempfile.TemporaryDirectory() as temp:
            paths = [Path(temp) / name for name in ['plugin.json', 'blender_manifest.toml', 'SKILL.md']]
            for p, text in zip(paths, ['{"version":"0.8.41","name":"conservar"}', 'version = "0.8.41"\nid = "conservar"', 'Versión del skill: **0.8.41**\nconservar']):
                p.write_text(text, encoding='utf-8')
            with patch.object(pool, 'MANIFIESTOS', paths):
                pool.poner_version('0.8.42')
            self.assertEqual([pool.leer_version(p) for p in paths], ['0.8.42'] * 3)
            self.assertTrue(all('conservar' in p.read_text(encoding='utf-8') for p in paths))

    def test_refuse_move_outside_cache(self):
        with self.assertRaises(ValueError):
            pool.apartar(pool.POOL, pool.POOL)

    def test_divergent_copy_is_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            cache = Path(temp) / 'cache'; cache.mkdir()
            copy = cache / 'old'; copy.mkdir(); (copy / 'user.txt').write_text('trabajo nuevo')
            target = Path(temp) / 'pool'; target.mkdir()
            with patch.object(pool, 'CODEX_CACHE', cache):
                with self.assertRaises(ValueError):
                    pool.apartar(copy, target)
            self.assertEqual((copy / 'user.txt').read_text(), 'trabajo nuevo')

    def test_concurrent_install_fails_without_removing_lock(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(pool, 'BASE', Path(temp)):
            with pool.bloqueo():
                with self.assertRaises(RuntimeError):
                    with pool.bloqueo():
                        pass
                self.assertTrue((Path(temp) / '.pool-instalacion.lock').exists())
            self.assertFalse((Path(temp) / '.pool-instalacion.lock').exists())

if __name__ == '__main__':
    unittest.main()
