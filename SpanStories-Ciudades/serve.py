"""HTTP distribution and two-player relay with aggregate network simulation.

Browser protocol is identical with/without simulation. This server binds only
to loopback; public deployment requires HTTPS and application authentication.
"""
import argparse
import json
import math
import random
import re
import secrets
import threading
import time
import subprocess
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

GENERATOR = next((p / 'Generador-Mundos' for p in Path(__file__).resolve().parents if (p / 'Generador-Mundos/server/style-pool.js').is_file()), None)
SHARED_FILES = {'pipeline.js', 'ghibli.js', 'dispatch.js', 'commerce-blender-pass.js', 'style-pool.js',
                'ghibli-assets/nube-ghibli-alta.png', 'ghibli-assets/nube-ghibli-compacta.png', 'ghibli-assets/nube-ghibli-alargada.png'}

PROFILES = {
    'online': {'rttMs': 80, 'jitterMs': 20, 'downloadMbps': 10, 'uploadMbps': 2},
    'slow': {'rttMs': 160, 'jitterMs': 40, 'downloadMbps': 3, 'uploadMbps': 1},
    'none': {'rttMs': 0, 'jitterMs': 0, 'downloadMbps': 0, 'uploadMbps': 0},
}
ROOM_TTL = 20
MAX_BODY = 4096


class Link:
    """Concurrent clients, files and workers share the same bandwidth budget."""
    def __init__(self, profile, clock=time.monotonic, sleep=time.sleep):
        self.profile, self.clock, self.sleep = profile, clock, sleep
        self.lock = threading.Lock()
        self.next = {'download': 0, 'upload': 0}

    def latency(self, legs=1):
        p = self.profile
        delay = max(0, p['rttMs'] + random.uniform(-p['jitterMs'], p['jitterMs'])) / 2000
        if delay:
            self.sleep(delay * legs)

    def transfer(self, size, direction='download'):
        rate = self.profile[direction + 'Mbps'] * 1_000_000 / 8
        if not rate or not size:
            return
        with self.lock:
            now = self.clock()
            self.next[direction] = max(now, self.next[direction]) + size / rate
            delay = self.next[direction] - now
        self.sleep(delay)


class RoomError(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


class Rooms:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.condition = threading.Condition()
        self.clients = {}
        self.revision = 0

    def expire(self):
        old = [token for token, c in self.clients.items() if self.clock() - c['seen'] > ROOM_TTL]
        for token in old:
            del self.clients[token]
        if old:
            self.changed()

    def changed(self):
        self.revision += 1
        self.condition.notify_all()

    def get(self, token):
        self.expire()
        if token not in self.clients:
            raise RoomError(401, 'Sesión caducada')
        return self.clients[token]

    def join(self, data):
        room, zone = data.get('room'), data.get('zone')
        if not isinstance(room, str) or not re.fullmatch(r'[\w-]{1,48}', room) or not isinstance(zone, str) or not re.fullmatch(r'[\w-]{1,96}', zone):
            raise RoomError(400, 'Sala o zona inválida')
        with self.condition:
            self.expire()
            if sum(c['room'] == room and c['zone'] == zone for c in self.clients.values()) >= 2:
                raise RoomError(409, 'Sala completa: máximo dos jugadores')
            token, player = secrets.token_urlsafe(24), secrets.token_hex(8)
            self.clients[token] = {'id': player, 'room': room, 'zone': zone, 'seen': self.clock(), 'seq': -1, 'state': None}
            self.changed()
            return {'v': 1, 'token': token, 'playerId': player, 'room': room, 'zone': zone, 'maxPlayers': 2}

    def state(self, token, data):
        seq, p, yaw = data.get('seq'), data.get('p'), data.get('yaw')
        number = lambda n: type(n) in (int, float) and math.isfinite(n) and abs(n) <= 100_000
        if type(seq) is not int or not 0 <= seq <= 2**53 - 1 or not isinstance(p, list) or len(p) != 3 or not all(number(n) for n in p) or not number(yaw) or type(data.get('active')) is not bool or type(data.get('moving')) is not bool:
            raise RoomError(400, 'Estado inválido')
        with self.condition:
            client = self.get(token)
            client['seen'] = self.clock()
            if seq <= client['seq']:
                return {'accepted': False}
            client['seq'] = seq
            client['state'] = {'id': client['id'], 'seq': seq, 'p': p, 'yaw': yaw, 'active': data['active'], 'moving': data['moving'], 't': time.time() * 1000}
            self.changed()
            return {'accepted': True}

    def leave(self, token):
        with self.condition:
            if self.clients.pop(token, None):
                self.changed()
        return {'left': True}

    def snapshot(self, token):
        client = self.get(token)
        return {'v': 1, 'serverTime': time.time() * 1000, 'players': [c['state'] for c in self.clients.values() if c['room'] == client['room'] and c['zone'] == client['zone'] and c['state'] is not None]}


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.gz': 'application/gzip'}

    def translate_path(self, path):
        route = urlsplit(path).path
        if GENERATOR and route.startswith('/shared-styles/'):
            relative = route.removeprefix('/shared-styles/')
            if relative in SHARED_FILES:
                return str(GENERATOR / 'src/estudio/render' / relative)
            return str(Path(self.directory) / '__shared_style_not_found__')
        return super().translate_path(path)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/style-pool' and GENERATOR:
            file = GENERATOR / '.style-pool/settings.json'
            return self.json_response(200, json.loads(file.read_text('utf-8')) if file.exists() else {'revision': -1})
        if getattr(self.server, 'embedded_only', False) and path in ('/', '/index.html') and self.headers.get('Sec-Fetch-Dest') == 'document':
            return self.send_error(403, 'Motor interno: abrir el visor desde localhost:3000/mundo/piloto-lexico')
        if path == '/api/health':
            self.server.link.latency(2)
            return self.json_response(200, {'ok': True, 'protocol': 1, 'simulation': self.server.link.profile, 'bandwidthScope': 'all clients and workers combined', 'maxPlayers': 2})
        if path == '/api/room/events':
            return self.events(parse_qs(urlsplit(self.path).query).get('token', [''])[0])
        if path.startswith('/api/'):
            return self.json_response(404, {'error': 'API desconocida'})
        self.server.link.latency(2)
        super().do_GET()

    def do_POST(self):
        try:
            origin = self.headers.get('Origin')
            if origin and urlsplit(origin).netloc != self.headers.get('Host'):
                raise RoomError(403, 'Origen no permitido')
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                raise RoomError(413, 'Solicitud demasiado grande o vacía')
            self.server.link.latency()
            self.server.link.transfer(length, 'upload')
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError()
            path = urlsplit(self.path).path
            if path == '/api/style-pool' and GENERATOR:
                result = subprocess.run(['node', str(GENERATOR / 'server/style-pool.js')], input=json.dumps(data), text=True, encoding='utf-8', capture_output=True, timeout=10, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                if result.returncode:
                    return self.json_response(400, {'error': result.stderr})
                return self.json_response(200, json.loads(result.stdout))
            rooms = self.server.rooms
            if path == '/api/room/join':
                result = rooms.join(data)
            elif path == '/api/room/state':
                result = rooms.state(data.get('token'), data)
            elif path == '/api/room/leave':
                result = rooms.leave(data.get('token'))
            else:
                raise RoomError(404, 'API desconocida')
            self.server.link.latency()
            self.json_response(200, result)
        except RoomError as error:
            self.json_response(error.code, {'error': error.message})
        except (ValueError, TypeError):
            self.json_response(400, {'error': 'JSON inválido'})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def events(self, token):
        rooms, started = self.server.rooms, False
        try:
            with rooms.condition:
                rooms.get(token)
            self.server.link.latency(2)
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('X-Accel-Buffering', 'no')
            self.end_headers()
            started, revision = True, -1
            while True:
                with rooms.condition:
                    if revision == rooms.revision:
                        rooms.condition.wait(timeout=5)
                    payload = rooms.snapshot(token)
                    revision = rooms.revision
                # Latest state only, without unbounded per-client queues.
                self.server.link.latency()
                self.write_limited(('data:' + json.dumps(payload, separators=(',', ':')) + '\n\n').encode())
                self.wfile.flush()
        except RoomError as error:
            if not started:
                self.json_response(error.code, {'error': error.message})
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def json_response(self, code, data):
        body = json.dumps(data, separators=(',', ':')).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.write_limited(body)

    def write_limited(self, data):
        self.server.link.transfer(len(data))
        self.wfile.write(data)

    def copyfile(self, source, outputfile):
        while chunk := source.read(16_384):
            self.server.link.transfer(len(chunk))
            outputfile.write(chunk)

    def send_head(self):
        source = Path(self.translate_path(self.path))
        packed = Path(str(source) + '.gz')
        if 'gzip' in self.headers.get('Accept-Encoding', '') and not source.name.endswith('.gz') and source.is_file() and packed.is_file() and packed.stat().st_mtime >= source.stat().st_mtime:
            stat = packed.stat()
            etag = f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"'
            if self.headers.get('If-None-Match') == etag:
                self.send_response(304)
                self.send_header('ETag', etag)
                self.send_header('Vary', 'Accept-Encoding')
                self.end_headers()
                return None
            stream = packed.open('rb')
            self.send_response(200)
            self.send_header('Content-Type', self.guess_type(str(source)))
            self.send_header('Content-Encoding', 'gzip')
            self.send_header('Vary', 'Accept-Encoding')
            self.send_header('Content-Length', str(stat.st_size))
            self.send_header('Last-Modified', self.date_time_string(stat.st_mtime))
            self.send_header('ETag', etag)
            self.end_headers()
            return stream
        return super().send_head()

    def end_headers(self):
        version = parse_qs(urlsplit(self.path).query).get('v')
        api = urlsplit(self.path).path.startswith('/api/')
        self.send_header('Cache-Control', 'no-store' if api else 'public, max-age=31536000, immutable' if version else 'no-cache')
        super().end_headers()

    def log_message(self, format, *args):
        if len(args) > 1 and str(args[1]) != '200':
            super().log_message(format, *args)


def create_server(root, port=8767, profile='online', embedded_only=False):
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(root)))
    server.embedded_only = embedded_only
    server.link = Link(dict(PROFILES[profile]))
    server.rooms = Rooms()
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8767)
    parser.add_argument('--root', type=Path)
    parser.add_argument('--profile', choices=PROFILES, default='online')
    parser.add_argument('--embedded-only', action='store_true', help='Motor interno: impedir abrir otra interfaz fuera del iframe')
    args = parser.parse_args()
    base = Path(__file__).resolve().parent
    root = (args.root or (base / 'dist-online' if (base / 'dist-online/package-info.json').is_file() else base)).resolve()
    if not (root / 'index.html').is_file():
        parser.error('La raíz no contiene el visor. Ejecuta npm run build:online.')
    server = create_server(root, args.port, args.profile, args.embedded_only)
    entry = 'http://localhost:3000/mundo/piloto-lexico' if args.embedded_only else f'http://127.0.0.1:{args.port}/?dev'
    print(f'SpanStories: {entry} | raíz={root} | red={args.profile} {server.link.profile}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
