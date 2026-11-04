"""App local sin dependencias Python externas. Solo escucha en 127.0.0.1."""
import argparse, json, os, shutil, struct, subprocess, threading, uuid, re, traceback, sys, tempfile
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

BASE = Path(__file__).resolve().parent
DATA = BASE / 'resultados'
JOBS = {}
LOCK = threading.Lock()
BUSY = threading.Lock()
MAX_BYTES = 200 * 1024 * 1024
PREFERENCES = BASE / 'preferences.json'
SAVE_LOCK = threading.Lock()


def preferences():
    if not PREFERENCES.exists():
        return {'save_folder': ''}
    return json.loads(PREFERENCES.read_text(encoding='utf-8'))


def set_save_folder(value):
    if not isinstance(value, str):
        raise ValueError('La carpeta debe ser una ruta de texto.')
    value = value.strip()
    if value:
        folder = Path(value)
        if not folder.is_absolute() or not folder.is_dir():
            raise ValueError('Selecciona una carpeta existente con su ruta completa.')
        value = str(folder.resolve())
    result = {'save_folder': value}
    with SAVE_LOCK:
        temporary = PREFERENCES.with_suffix('.tmp')
        temporary.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
        temporary.replace(PREFERENCES)
    return result


def save_result(job_id, filename, folder_value=None):
    job = get_job(job_id)
    if not job or job['state'] != 'done':
        raise ValueError('El resultado todavía no está disponible.')
    if folder_value is None:
        folder_value = preferences().get('save_folder', '')
    if not folder_value or not Path(folder_value).is_dir():
        raise ValueError('Elige una carpeta de guardado existente.')
    if not isinstance(filename, str):
        raise ValueError('Nombre de archivo no válido.')
    filename = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', filename).strip(' .')
    stem = Path(filename).stem[:120] or 'spanstories'
    # Crear exclusivamente: nunca reemplazar otro resultado o el original.
    with SAVE_LOCK:
        descriptor, temporary_name = tempfile.mkstemp(prefix='.spanstories-', suffix='.tmp', dir=folder_value)
        temporary = Path(temporary_name)
        try:
            with os.fdopen(descriptor, 'wb') as destination:
                with (DATA / job_id / 'spanstories.glb').open('rb') as source:
                    shutil.copyfileobj(source, destination)
                destination.flush()
                os.fsync(destination.fileno())
            validate_glb(temporary.read_bytes())
            for index in range(10000):
                target = Path(folder_value) / (stem + (f' ({index})' if index else '') + '.glb')
                try:
                    if os.name == 'nt':
                        os.rename(temporary, target)  # Windows rechaza destinos existentes.
                    else:
                        os.link(temporary, target)
                except FileExistsError:
                    continue
                return {'path': str(target), 'bytes': target.stat().st_size}
        finally:
            temporary.unlink(missing_ok=True)
    raise ValueError('Hay demasiados archivos con ese nombre. Elige otro nombre.')


def blender_path():
    candidates = [os.environ.get('SPANSTORIES_BLENDER'), shutil.which('blender'),
                  r'D:\Blender 5.2\blender.exe']
    foundation = Path(r'C:\Program Files\Blender Foundation')
    if foundation.exists():
        candidates += [str(p) for p in sorted(foundation.glob('Blender*/blender.exe'), reverse=True)]
    return next((p for p in candidates if p and Path(p).is_file()), None)


def validate_glb(data):
    if len(data) < 20:
        raise ValueError('El archivo GLB está incompleto.')
    magic, version, size = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or size != len(data):
        raise ValueError('Selecciona un GLB válido de versión 2.')
    length, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4E4F534A or length + 20 > len(data):
        raise ValueError('La estructura del GLB no es válida.')
    doc = json.loads(data[20:20 + length])
    if not isinstance(doc, dict):
        raise ValueError('El contenido JSON del GLB no es válido.')
    if any(v.get('uri') and not v['uri'].startswith('data:') for k in ('buffers', 'images') for v in doc.get(k, [])):
        raise ValueError('El GLB referencia archivos externos. Exporta un GLB con todos los recursos incrustados.')
    if doc.get('skins') or doc.get('animations'):
        raise ValueError('La app admite objetos estáticos. No procesa rigs o animaciones para no dañarlos.')
    if any(p.get('targets') for m in doc.get('meshes', []) for p in m.get('primitives', [])):
        raise ValueError('Este GLB tiene morph targets y requiere una optimización específica.')
    return doc


def get_job(job_id):
    if not re.fullmatch(r'[0-9a-f]{32}', job_id):
        return None
    with LOCK:
        if job_id in JOBS:
            return dict(JOBS[job_id])
    folder = DATA / job_id
    if not (folder / 'original.glb').is_file():
        return None
    if (folder / 'spanstories.json').is_file() and (folder / 'spanstories.glb').is_file():
        return {'id': job_id, 'state': 'done', 'report': json.loads((folder / 'spanstories.json').read_text(encoding='utf-8'))}
    error_file = folder / 'spanstories.error.json'
    error = json.loads(error_file.read_text(encoding='utf-8'))['error'] if error_file.is_file() else 'La conversión fue interrumpida al cerrar el servidor. Puedes volver a convertir el archivo.'
    return {'id': job_id, 'state': 'error', 'error': error}


def process_job(job_id, folder, settings):
    try:
        command = [blender_path(), '--factory-startup', '-b', '-t', '4', '--python',
                   str(BASE / 'processor.py'), '--', str(folder / 'original.glb'),
                   str(folder / 'spanstories.glb'), str(folder / 'settings.json')]
        flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        with (folder / 'proceso.log').open('w', encoding='utf-8') as log:
            result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=600, creationflags=flags)
        error_file = folder / 'spanstories.error.json'
        if error_file.exists():
            raise ValueError(json.loads(error_file.read_text(encoding='utf-8'))['error'])
        if result.returncode or not (folder / 'spanstories.json').exists():
            raise ValueError('Blender no pudo convertir el recurso. Consulta proceso.log en la carpeta del resultado.')
        validate_glb((folder / 'spanstories.glb').read_bytes())
        report = json.loads((folder / 'spanstories.json').read_text(encoding='utf-8'))
        with LOCK:
            JOBS[job_id].update(state='done', report=report)
    except subprocess.TimeoutExpired:
        with LOCK:
            JOBS[job_id].update(state='error', error='Se agotó el tiempo de conversión (10 minutos). Prueba un recurso más pequeño.')
    except Exception as exc:
        with LOCK:
            JOBS[job_id].update(state='error', error=str(exc))
    finally:
        BUSY.release()


class Handler(BaseHTTPRequestHandler):
    def handle_one_request(self):
        try:
            self.connection.settimeout(120)
            super().handle_one_request()
        except (ConnectionError, TimeoutError):
            # Una pestaña cerrada o una descarga cancelada no es un fallo del servidor.
            pass
        except Exception:
            traceback.print_exc()
            try:
                self.json_response(500, {'error': 'No se pudo atender la solicitud. Revisa servidor-error.log.'})
            except (ConnectionError, TimeoutError):
                pass

    def log_message(self, *_):
        pass

    def json_response(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def file_response(self, path, download=None):
        if not path.is_file():
            return self.json_response(404, {'error': 'Archivo no encontrado.'})
        types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                 '.css': 'text/css; charset=utf-8', '.glb': 'model/gltf-binary', '.json': 'application/json'}
        self.send_response(200)
        self.send_header('Content-Type', types.get(path.suffix, 'application/octet-stream'))
        self.send_header('Content-Length', str(path.stat().st_size))
        if download:
            self.send_header('Content-Disposition', 'attachment; filename="' + download + '"')
        self.end_headers()
        with path.open('rb') as stream:
            shutil.copyfileobj(stream, self.wfile)

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == '/api/status':
            return self.json_response(200, {'app': 'spanstories-glb', 'ready': bool(blender_path()), 'blender': blender_path()})
        if path == '/api/preferences':
            return self.json_response(200, preferences())
        if path == '/api/example/info':
            example = BASE / 'web' / 'ejemplo.glb'
            if not example.is_file():
                return self.json_response(404, {'error': 'El ejemplo no está disponible. Selecciona tu GLB.'})
            return self.json_response(200, {'bytes': example.stat().st_size})
        if path == '/api/example/chunk':
            try:
                offset = int(parse_qs(urlparse(self.path).query).get('offset', ['0'])[0])
                example = BASE / 'web' / 'ejemplo.glb'
                if not 0 <= offset < example.stat().st_size:
                    raise ValueError()
            except (ValueError, OSError):
                return self.json_response(400, {'error': 'Segmento no válido.'})
            with example.open('rb') as stream:
                stream.seek(offset)
                content = stream.read(1024 * 1024)
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        if path.startswith('/api/jobs/'):
            pieces = path.strip('/').split('/')
            if len(pieces) not in (3, 4):
                return self.json_response(404, {'error': 'Ruta de conversión no válida.'})
            job_id = pieces[2]
            job = get_job(job_id)
            if not job:
                return self.json_response(404, {'error': 'Conversión no encontrada.'})
            if len(pieces) == 3:
                return self.json_response(200, job)
            resource = pieces[3]
            resources = {'original': 'original.glb', 'model': 'spanstories.glb',
                         'model.glb': 'spanstories.glb', 'report': 'spanstories.json'}
            if resource not in resources or (resource != 'original' and job['state'] != 'done'):
                return self.json_response(404, {'error': 'El resultado todavía no está disponible.'})
            return self.file_response(DATA / job_id / resources[resource],
                                      resources[resource] if resource in ('model', 'model.glb', 'report') else None)
        target = (BASE / 'web' / (path.lstrip('/') or 'index.html')).resolve()
        if not target.is_relative_to((BASE / 'web').resolve()):
            return self.json_response(403, {'error': 'Ruta no permitida.'})
        return self.file_response(target)

    def do_POST(self):
        parsed = urlparse(self.path)
        # Rechazar peticiones de sitios externos hacia la app local.
        origin = self.headers.get('Origin')
        if origin and origin != 'http://' + self.headers.get('Host', ''):
            return self.json_response(403, {'error': 'Origen no permitido.'})
        if parsed.path in ('/api/preferences', '/api/choose-folder') or parsed.path.startswith('/api/save/'):
            try:
                size = int(self.headers.get('Content-Length', 0))
                if not 0 <= size <= 4096:
                    raise ValueError('Solicitud de guardado no válida.')
                body = json.loads(self.rfile.read(size) or b'{}')
                if not isinstance(body, dict):
                    raise ValueError('Solicitud de guardado no válida.')
                if parsed.path == '/api/preferences':
                    result = set_save_folder(body.get('save_folder', ''))
                elif parsed.path == '/api/choose-folder':
                    selected = subprocess.run([sys.executable, str(BASE / 'choose_folder.py'), preferences().get('save_folder', '')],
                                              capture_output=True, timeout=110)
                    if selected.returncode:
                        raise ValueError('No se pudo abrir el selector. Escribe la ruta de la carpeta y pulsa Usar carpeta.')
                    value = json.loads(selected.stdout.decode('utf-8'))
                    result = set_save_folder(value) if value else preferences()
                else:
                    job_id = parsed.path.removeprefix('/api/save/')
                    filename = body.get('filename', 'spanstories.glb')
                    job = get_job(job_id)
                    if not job or job['state'] != 'done':
                        raise ValueError('El resultado todavía no está disponible.')
                    if body.get('dialog'):
                        selected = subprocess.run([sys.executable, str(BASE / 'choose_folder.py'),
                                                   preferences().get('save_folder', ''), '--save', str(filename)],
                                                  capture_output=True, timeout=110)
                        if selected.returncode:
                            raise ValueError('No se pudo abrir Guardar como. Vuelve a intentar.')
                        value = json.loads(selected.stdout.decode('utf-8'))
                        if not value:
                            return self.json_response(200, {'cancelled': True})
                        target = Path(value)
                        if not target.is_absolute() or target.suffix.lower() != '.glb':
                            raise ValueError('Elige un nombre con extensión .glb.')
                        result = save_result(job_id, target.name, str(target.parent))
                    else:
                        result = save_result(job_id, filename)
                return self.json_response(200, result)
            except (ValueError, subprocess.TimeoutExpired) as exc:
                return self.json_response(400, {'error': str(exc) if not isinstance(exc, subprocess.TimeoutExpired) else 'El selector de carpetas agotó su tiempo. Vuelve a abrirlo.'})
            except OSError:
                traceback.print_exc()
                return self.json_response(500, {'error': 'No se pudo guardar. Comprueba permisos, espacio y que la carpeta esté disponible.'})
        if parsed.path != '/api/jobs':
            return self.json_response(404, {'error': 'Ruta no encontrada.'})
        if not blender_path():
            return self.json_response(503, {'error': 'No se encontró Blender. Configura SPANSTORIES_BLENDER con la ruta a blender.exe.'})
        acquired = False
        try:
            size = int(self.headers.get('Content-Length', 0))
            if not 20 <= size <= MAX_BYTES:
                raise ValueError('El GLB debe pesar entre 20 bytes y 200 MB.')
            settings = json.loads(parse_qs(parsed.query).get('settings', ['{}'])[0])
            if not isinstance(settings, dict):
                raise ValueError('Los ajustes de conversión no son válidos.')
            ratio = float(settings.get('ratio', .28))
            if not .1 <= ratio <= 1:
                raise ValueError('La cantidad de geometría debe estar entre 10 % y 100 %.')
            if settings.get('units', 'auto') not in ('auto', 'm', 'cm', 'mm'):
                raise ValueError('Unidad no válida.')
            if settings.get('axis', 'auto') not in ('auto', 'plus90', 'minus90'):
                raise ValueError('Orientación no válida.')
            if settings.get('palette', 'source') not in ('source', 'warm'):
                raise ValueError('Paleta no válida.')
            acquired = BUSY.acquire(blocking=False)
            if not acquired:
                return self.json_response(409, {'error': 'Ya hay una conversión en curso. Espera a que termine.'})
            data = self.rfile.read(size)
            validate_glb(data)
            job_id = uuid.uuid4().hex
            folder = DATA / job_id
            folder.mkdir(parents=True)
            (folder / 'original.glb').write_bytes(data)
            (folder / 'settings.json').write_text(json.dumps(settings), encoding='utf-8')
            with LOCK:
                JOBS[job_id] = {'id': job_id, 'state': 'processing'}
            threading.Thread(target=process_job, args=(job_id, folder, settings), daemon=True).start()
            acquired = False  # el trabajador libera el bloqueo
            return self.json_response(202, {'id': job_id, 'state': 'processing'})
        except (ValueError, TypeError, KeyError) as exc:
            return self.json_response(400, {'error': str(exc)})
        except OSError:
            traceback.print_exc()
            return self.json_response(500, {'error': 'No se pudo guardar el archivo. Revisa el espacio disponible y servidor-error.log.'})
        finally:
            if acquired:
                BUSY.release()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    httpd = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'SpanStories GLB: http://127.0.0.1:{args.port}', flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
