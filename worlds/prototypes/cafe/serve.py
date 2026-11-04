"""Servidor local de la Cafetería SpanStories (Café Cordillera): sirve esta carpeta en /Cafeteria/.

Uso: python serve.py [--host 127.0.0.1] [--port 7600]
Envía no-cache: basta con recargar el navegador tras editar.
"""
import argparse
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import unquote, urlsplit

BASE = Path(__file__).resolve().parent
PREFIX = '/Cafeteria'


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = unquote(urlsplit(path).path)
        if path == PREFIX or path.startswith(PREFIX + '/'):
            candidate = (BASE / path[len(PREFIX):].lstrip('/')).resolve()
            if candidate == BASE or BASE in candidate.parents:
                return str(candidate)
        return str(BASE / '__not_available__')

    def do_GET(self):
        if urlsplit(self.path).path in ('/', ''):
            self.send_response(302); self.send_header('Location', PREFIX + '/'); self.end_headers(); return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', 7600)))
    args = parser.parse_args()
    print(f'Café Cordillera: http://{args.host}:{args.port}{PREFIX}/', flush=True)
    ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
