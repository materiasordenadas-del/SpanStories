"""Authenticated loopback bridge; dispatch only, never eval/exec or arbitrary Python."""
import json
import os
import queue
import secrets
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import bpy
from . import core

_server=None
_requests=queue.Queue()
_token=None
_discovery=Path(os.environ.get('LOCALAPPDATA',str(Path.home()))) / 'SpanStoriesTexturePainter' / 'bridge.json'


class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass

    def do_POST(self):
        if self.path!='/api' or self.headers.get('Authorization')!='Bearer '+_token:
            self.send_error(403); return
        length=int(self.headers.get('Content-Length','0'))
        if length<=0 or length>1024*1024:
            self.send_error(413); return
        try:
            payload=json.loads(self.rfile.read(length))
            reply=queue.Queue(maxsize=1); _requests.put((payload,reply))
            result=reply.get(timeout=180)
            data=json.dumps(result,ensure_ascii=False).encode()
            self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
        except Exception as e:
            self.send_error(400,str(e))


def tick():
    if _server is None: return None
    for _ in range(4):
        try: payload,reply=_requests.get_nowait()
        except queue.Empty: break
        try: reply.put({'ok':True,'result':core.dispatch(payload['action'],**payload.get('arguments',{}))})
        except Exception as e: reply.put({'ok':False,'error':str(e)})
    return .08


def start():
    global _server,_token
    if _server: return {'running':True,'port':_server.server_port}
    _token=secrets.token_urlsafe(40)
    _server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
    _server.daemon_threads=True
    _discovery.parent.mkdir(parents=True,exist_ok=True)
    _discovery.write_text(json.dumps({'port':_server.server_port,'token':_token,'pid':os.getpid(),'version':'0.1.3'}),encoding='utf-8')
    threading.Thread(target=_server.serve_forever,daemon=True,name='SSTP-loopback').start()
    bpy.app.timers.register(tick,first_interval=.08,persistent=True)
    return {'running':True,'port':_server.server_port,'discovery':str(_discovery)}


def stop():
    global _server,_token
    if _server:
        _server.shutdown(); _server.server_close(); _server=None
    if bpy.app.timers.is_registered(tick): bpy.app.timers.unregister(tick)
    if _discovery.exists():
        try:
            if json.loads(_discovery.read_text(encoding='utf-8')).get('pid')==os.getpid(): _discovery.unlink()
        except (OSError,ValueError): pass
    _token=None
    return {'running':False}


def running(): return _server is not None
