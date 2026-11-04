"""Visor local de prototipos; no expone el repositorio completo ni modifica los escenarios."""
import argparse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import importlib.util
from pathlib import Path
from urllib.parse import unquote, urlsplit

REPO = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('worlds_import', Path(__file__).with_name('import.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def handler_for(source=None):
    routes = {f'/{prefix}/': (source / folder if source else REPO / 'worlds/prototypes' / ident)
              for ident, (folder, prefix, _) in module.PLACES.items()}
    if not source:
        routes['/characters/'] = REPO / 'worlds/characters'
        routes['/Hotel/'] = REPO / 'worlds/prototypes/hotel'

    class Handler(SimpleHTTPRequestHandler):
        extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.glb': 'model/gltf-binary'}

        def translate_path(self, raw):
            path = unquote(urlsplit(raw).path)
            for prefix, root in routes.items():
                if path.startswith(prefix):
                    target = (root / path[len(prefix):]).resolve()
                    resolved_root = root.resolve()
                    if target == resolved_root or resolved_root in target.parents:
                        return str(target)
            return str(REPO / 'worlds/__not_available__')

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == '/':
                links = ''.join(f'<li><a href="/{prefix}/?dev">{label}</a></li>' for _, prefix, label in module.PLACES.values())
                if not source:
                    links += '<li><a href="/Hotel/?dev">Hotel Palma Real · Colombia</a></li>'
                body = ('<!doctype html><meta charset="utf-8"><title>SpanStories · Prototipos</title>'
                        '<h1>SpanStories · Prototipos</h1><p>Escenarios originales; adaptación por país pendiente.</p>'
                        f'<ul>{links}</ul>').encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            for prefix in routes:
                if path == prefix.rstrip('/'):
                    self.send_response(302)
                    self.send_header('Location', prefix)
                    self.end_headers()
                    return
            super().do_GET()

        def list_directory(self, path):
            self.send_error(403, 'Directory listing disabled')
            return None

        def end_headers(self):
            self.send_header('Cache-Control', 'no-cache')
            super().end_headers()

        def log_message(self, fmt, *args):
            if args and str(args[1]) not in ['200', '304']:
                super().log_message(fmt, *args)

    return Handler


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=7810)
    parser.add_argument('--source', type=Path, help='Comparación antes del traslado; solo lectura.')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler_for(args.source.resolve() if args.source else None))
    print(f'Prototipos: http://127.0.0.1:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
