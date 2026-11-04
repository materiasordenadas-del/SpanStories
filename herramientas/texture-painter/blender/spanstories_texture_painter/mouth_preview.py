"""Temporary jaw pose for painting; never edits mesh data, drivers or keyframes."""
from contextlib import contextmanager
from functools import wraps
import math
import re

import bpy
from bpy.app.handlers import persistent

_session = None
_paused = 0
_saving = None
_NAMES = ('jawopen', 'mouthopen')


def _canonical(name):
    return re.sub(r'[^a-z0-9]', '', name.casefold())


def _binding(ob):
    keys = ob.data.shape_keys if ob and ob.type == 'MESH' else None
    if not keys:
        return None
    for name in _NAMES:
        key = next((k for k in keys.key_blocks if _canonical(k.name) == name), None)
        if key is None:
            continue
        path = key.path_from_id('value')
        driver = next((d for d in keys.animation_data.drivers if d.data_path == path), None) if keys.animation_data else None
        if driver is None:
            return key, None, float(key.value), min(1.0, float(key.slider_max))
        # Use the rig's existing scalar control. Never mute/rewrite a driver,
        # move a bone, guess control objects by prefix or add a new shape key.
        for variable in driver.driver.variables:
            if variable.type != 'SINGLE_PROP':
                continue
            for target in variable.targets:
                match = re.fullmatch(r'\["([^"\\]+)"\]', target.data_path)
                if not target.id or not match:
                    continue
                prop = match.group(1)
                if _canonical(prop).removeprefix('v') != name:
                    continue
                value = target.id.get(prop)
                if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                    return target.id, prop, float(value), 1.0
    return None


def _set(owner, prop, value):
    if prop is None:
        owner.value = value
        owner.id_data.update_tag()
    else:
        owner[prop] = value
        owner.update_tag()
    if bpy.context.view_layer:
        bpy.context.view_layer.update()


def restore():
    global _session
    session, _session = _session, None
    if session:
        try:
            _set(session['owner'], session['prop'], session['previous'])
        except (ReferenceError, RuntimeError):
            pass  # The file/object may have been removed while leaving the editor.


def begin(ob):
    global _session
    if _paused or (ob and ob.get('sstp_mouth_original', False)):
        return False
    if _session and _session['object'] == ob:
        return True
    restore()
    binding = _binding(ob)
    if not binding:
        return False
    owner, prop, previous, opened = binding
    _set(owner, prop, max(previous, opened))
    _session = {'object': ob, 'owner': owner, 'prop': prop, 'previous': previous}
    return True


def sync(ob=None, enabled=False):
    if enabled and ob and not ob.get('sstp_mouth_original', False):
        return begin(ob)
    restore()
    return False


def set_original(ob, original=True):
    """Choose the original pose or the temporary painting pose per character."""
    if not ob:
        return False
    if not original and not _binding(ob):
        return False
    ob['sstp_mouth_original'] = bool(original)
    return sync(ob, True)


def status(ob=None):
    return bool(_session and (ob is None or _session['object'] == ob))


@contextmanager
def suspended():
    global _paused
    ob = _session['object'] if _session else None
    restore()
    _paused += 1
    try:
        yield
    finally:
        _paused -= 1
        if ob and not _paused:
            try:
                begin(ob)
            except ReferenceError:
                pass


def without_preview(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        with suspended():
            return fn(*args, **kwargs)
    return wrapped


@persistent
def before_save(*_):
    global _saving
    if _saving is None:
        _saving = suspended()
        _saving.__enter__()


@persistent
def after_save(*_):
    global _saving
    context, _saving = _saving, None
    if context is not None:
        context.__exit__(None, None, None)


@persistent
def before_load(*_):
    global _paused, _saving
    restore()
    _saving = None
    _paused = 0


def register():
    for name, fn in [('save_pre', before_save), ('save_post', after_save),
                     ('save_post_fail', after_save), ('load_pre', before_load)]:
        handlers = getattr(bpy.app.handlers, name, None)
        if handlers is not None and fn not in handlers:
            handlers.append(fn)


def unregister():
    after_save()
    restore()
    for name, fn in [('save_pre', before_save), ('save_post', after_save),
                     ('save_post_fail', after_save), ('load_pre', before_load)]:
        handlers = getattr(bpy.app.handlers, name, None)
        if handlers is not None and fn in handlers:
            handlers.remove(fn)
