"""Servidor local del Hostal SpanStories: sirve esta carpeta en la raíz.

Uso: python serve.py [--host 127.0.0.1] [--port 7900]
Envía no-cache: basta con recargar el navegador tras editar (los módulos no se quedan viejos).
"""
import argparse
import os
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

BASE = Path(__file__).resolve().parent


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PORT', 7900)))
    args = parser.parse_args()
    print(f'Hostal: http://{args.host}:{args.port}/', flush=True)
    ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(BASE))).serve_forever()
