"""Registro persistente del plugin. Solo biblioteca estándar; no ejecuta registros."""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
import tomllib

PLUGIN_ROOT = Path(__file__).resolve().parents[3]


def versiones():
    addon = tomllib.loads((PLUGIN_ROOT / 'assets/rig_labial_bendy/blender_manifest.toml').read_text(encoding='utf-8'))['version']
    plugin = json.loads((PLUGIN_ROOT / 'plugin.json').read_text(encoding='utf-8'))['version']
    return addon, plugin

DEFAULT_STORE = Path(r'D:\Español\imagen para animación\Animación 3D\rig_labial_bendy\codex\aprendizaje')


def read_records(store):
    return [json.loads(p.read_text(encoding='utf-8')) for p in sorted(store.glob('*.json'))]


def add_record(store, *, status, character, topic, problem, action, result, evidence=(), supersedes=None):
    if status not in ('propuesta', 'fallo', 'verificado'):
        raise ValueError('Estado inválido')
    if not all(isinstance(v, str) and v.strip() for v in (character, topic, problem, action, result)):
        raise ValueError('Los campos no pueden estar vacíos')
    if status == 'verificado' and not evidence:
        raise ValueError('Un aprendizaje verificado requiere evidencia')
    proof = []
    for name in evidence:
        path = Path(name).resolve(strict=True)
        if not path.is_file():
            raise ValueError('La evidencia debe ser un archivo')
        proof.append({'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    if supersedes and supersedes not in {r['id'] for r in read_records(store)}:
        raise ValueError('El aprendizaje sustituido no existe')
    addon_version, plugin_version = versiones()
    record = dict(id=str(uuid4()), timestamp=datetime.now(timezone.utc).isoformat(),
                  status=status, character=character, topic=topic, problem=problem,
                  action=action, result=result, evidence=proof, supersedes=supersedes,
                  addon_version=addon_version, plugin_version=plugin_version)
    store.mkdir(parents=True, exist_ok=True)
    with (store / (record['id'] + '.json')).open('x', encoding='utf-8') as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
    return record


def list_records(store, query='', history=False):
    records = read_records(store)
    replaced = {r['supersedes'] for r in records if r.get('supersedes')}
    return [r for r in sorted(records, key=lambda r: r['timestamp'])
            if (history or r['id'] not in replaced)
            and query.casefold() in json.dumps(r, ensure_ascii=False).casefold()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--store', type=Path, default=Path(os.environ.get('RLB_CODEX_LEARNING_DIR', str(DEFAULT_STORE))))
    sub = parser.add_subparsers(dest='command', required=True)
    view = sub.add_parser('list')
    view.add_argument('--query', default='')
    view.add_argument('--history', action='store_true')
    add = sub.add_parser('add')
    add.add_argument('--status', required=True, choices=('propuesta', 'fallo', 'verificado'))
    for field in ('character', 'topic', 'problem', 'action', 'result'):
        add.add_argument('--' + field, required=True)
    add.add_argument('--evidence', action='append', default=[])
    add.add_argument('--supersedes')
    args = vars(parser.parse_args())
    store, command = args.pop('store'), args.pop('command')
    try:
        data = list_records(store, **args) if command == 'list' else add_record(store, **args)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.exit(2, str(error) + '\n')
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
