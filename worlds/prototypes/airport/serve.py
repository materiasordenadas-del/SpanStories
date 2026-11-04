"""Local-only server for Aeropuerto v2: serves this project folder.

Usage: python serve.py [--host 127.0.0.1] [--port 8766]
The app is always served at /Aeropuerto/ whatever this folder is called
(Aeropuerto_v2, ...), so URLs and posiciones.json paths stay stable.
"""
import argparse
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit

BASE = Path(__file__).resolve().parent
PREFIX = '/Aeropuerto'  # public URL prefix, independent of the folder name


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = unquote(urlsplit(path).path)
        if path == PREFIX or path.startswith(PREFIX + '/'):
            candidate = (BASE / path[len(PREFIX):].lstrip('/')).resolve()
            if candidate == BASE or BASE in candidate.parents:
                return str(candidate)
        return str(BASE / '__not_available__')

    def do_PUT(self):
        path = urlsplit(self.path).path
        if path == '/Aeropuerto/posiciones.json':
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            try:
                import json; json.loads(body)
            except ValueError:
                self.send_error(400); return
            (BASE / 'posiciones.json').write_bytes(body)
            self.send_response(204); self.end_headers()
            return
        # Dev-only: allow overwriting existing web source files (never serve.py
        # or new files), so the in-page phase popup can revert a denied phase.
        if path.startswith('/Aeropuerto/') and path.endswith(('.js', '.css', '.html')):
            target = Path(self.translate_path(path))
            if not str(target).startswith(str(BASE)) or not target.is_file():
                self.send_error(404); return
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            target.write_bytes(body)
            self.send_response(204); self.end_headers()
            return
        self.send_error(403)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', 8766)))
    args = parser.parse_args()
    print(f'Aeropuerto v2:http://{args.host}:{args.port}/Aeropuerto/', flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
