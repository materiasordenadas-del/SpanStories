import json, struct, unittest, tempfile, threading, urllib.request, urllib.error
from pathlib import Path
from unittest.mock import patch
import server
from server import validate_glb


def glb(document):
    chunk = json.dumps(document).encode()
    chunk += b' ' * (-len(chunk) % 4)
    return struct.pack('<4sIIII', b'glTF', 2, 20 + len(chunk), len(chunk), 0x4E4F534A) + chunk


class InputTests(unittest.TestCase):
    def test_json_root_must_be_object(self):
        with self.assertRaises(ValueError):
            validate_glb(glb([]))

    def test_embedded_static_glb(self):
        self.assertEqual(validate_glb(glb({'asset': {'version': '2.0'}}))['asset']['version'], '2.0')

    def test_external_resource_rejected(self):
        with self.assertRaisesRegex(ValueError, 'externos'):
            validate_glb(glb({'buffers': [{'uri': 'https://example.com/data.bin'}]}))

    def test_rigs_animations_morphs_rejected(self):
        for document in ({'skins': [{}]}, {'animations': [{}]}, {'meshes': [{'primitives': [{'targets': [{}]}]}]}):
            with self.subTest(document=document), self.assertRaises(ValueError):
                validate_glb(glb(document))

    def test_truncated_and_fake_glb(self):
        for data in (b'', b'x' * 100, glb({})[:-1]):
            with self.assertRaises(ValueError):
                validate_glb(data)


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='spanstories-http-test-')
        cls.original_data = server.DATA
        cls.original_preferences = server.PREFERENCES
        server.DATA = Path(cls.temp.name)
        server.PREFERENCES = server.DATA/'preferences.json'
        cls.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.address = f'http://127.0.0.1:{cls.http.server_port}'
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        server.DATA = cls.original_data
        server.PREFERENCES = cls.original_preferences
        cls.temp.cleanup()

    def request(self, path, data=None):
        try:
            with urllib.request.urlopen(self.address+path, data=data, timeout=5) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as response:
            return response.code, response.read()

    def test_completed_result_survives_server_restart(self):
        job_id = 'a'*32
        folder = server.DATA/job_id
        folder.mkdir()
        model = glb({'asset': {'version':'2.0'}})
        (folder/'original.glb').write_bytes(model)
        (folder/'spanstories.glb').write_bytes(model)
        (folder/'spanstories.json').write_text('{"output_bytes":123}')
        status, body = self.request('/api/jobs/'+job_id)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['state'], 'done')
        self.assertEqual(self.request('/api/jobs/'+job_id+'/model'), (200, model))
        with urllib.request.urlopen(self.address+'/api/jobs/'+job_id+'/model.glb') as response:
            self.assertEqual(response.headers['Content-Type'], 'model/gltf-binary')
            self.assertEqual(response.headers['Content-Disposition'], 'attachment; filename="spanstories.glb"')
            self.assertEqual(response.read(), model)

    def test_interrupted_result_has_explicit_error(self):
        job_id = 'b'*32
        folder = server.DATA/job_id
        folder.mkdir()
        (folder/'original.glb').write_bytes(glb({}))
        status, body = self.request('/api/jobs/'+job_id)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['state'], 'error')
        self.assertIn('interrumpida', json.loads(body)['error'])

    def test_bad_paths_and_settings_return_json(self):
        for path in ('/api/jobs/', '/api/jobs/invalid', '/api/jobs/a/b/c'):
            status, body = self.request(path)
            self.assertEqual(status, 404)
            self.assertIn('error', json.loads(body))
        status, body = self.request('/api/jobs?settings=%5B%5D', glb({}))
        self.assertEqual(status, 400)
        self.assertIn('error', json.loads(body))

    def test_server_identifies_itself(self):
        status, body = self.request('/api/status')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['app'], 'spanstories-glb')

    def test_save_folder_persists_and_never_overwrites(self):
        folder = server.DATA/'exports'
        folder.mkdir()
        status, body = self.request('/api/preferences', json.dumps({'save_folder': str(folder)}).encode())
        self.assertEqual(status, 200)
        self.assertEqual(server.preferences()['save_folder'], str(folder.resolve()))
        job_id = 'c'*32
        job_folder = server.DATA/job_id
        job_folder.mkdir()
        model = glb({'asset': {'version': '2.0'}})
        for name in ('original.glb', 'spanstories.glb'):
            (job_folder/name).write_bytes(model)
        (job_folder/'spanstories.json').write_text('{}')
        paths = []
        for _ in range(2):
            status, body = self.request('/api/save/'+job_id, b'{"filename":"bateria.glb"}')
            self.assertEqual(status, 200)
            paths.append(Path(json.loads(body)['path']))
        self.assertNotEqual(*paths)
        self.assertTrue(all(p.read_bytes() == model and p.parent == folder for p in paths))
        self.assertEqual(self.request('/api/preferences', b'{"save_folder":"missing-relative"}')[0], 400)
        self.assertEqual(self.request('/api/preferences', b'[]')[0], 400)
        self.assertEqual(self.request('/api/save/invalid', b'{}')[0], 400)
        alternate = server.DATA/'alternate'
        alternate.mkdir()
        selected = alternate/'elegido.glb'
        with patch('server.subprocess.run') as dialog:
            dialog.return_value.returncode = 0
            dialog.return_value.stdout = json.dumps(str(selected)).encode()
            status, body = self.request('/api/save/'+job_id, b'{"dialog":true,"filename":"bateria.glb"}')
            self.assertEqual(status, 200)
            self.assertEqual(selected.read_bytes(), model)
            self.assertEqual(server.preferences()['save_folder'], str(folder.resolve()))
            self.assertEqual(dialog.call_args.args[0][-3:], [str(folder.resolve()), '--save', 'bateria.glb'])
            dialog.return_value.stdout = b'""'
            self.assertTrue(json.loads(self.request('/api/save/'+job_id, b'{"dialog":true}')[1])['cancelled'])
        with patch('server.shutil.copyfileobj', side_effect=OSError('fallo de copia simulado')):
            self.assertEqual(self.request('/api/save/'+job_id, b'{"filename":"fallo.glb"}')[0], 500)
        self.assertFalse((folder/'fallo.glb').exists())
        self.assertFalse(list(folder.glob('.spanstories-*')))
        self.assertTrue(all(p.read_bytes() == model for p in paths))


if __name__ == '__main__':
    unittest.main()
