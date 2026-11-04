"""Receptor local temporal: guarda en assets/portales/ las imágenes que envía dev/capturar-portales.js.
Uso: python herramientas/recibir-portales.py   (puerto 7150, solo 127.0.0.1)"""
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

DEST = Path(__file__).resolve().parent.parent / 'assets' / 'portales'
DEST.mkdir(exist_ok=True)


class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'PUT, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_PUT(self):
        nombre = self.path.lstrip('/')
        if not re.fullmatch(r'[A-Z]\d\d-[A-Z]\d\d\.webp', nombre):
            self.send_response(400); self._cors(); self.end_headers(); return
        (DEST / nombre).write_bytes(self.rfile.read(int(self.headers.get('Content-Length', 0))))
        self.send_response(204); self._cors(); self.end_headers()

    def log_message(self, *a): pass


HTTPServer(('127.0.0.1', 7150), H).serve_forever()
