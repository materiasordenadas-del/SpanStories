bl_info = {
    'name':'SpanStories Texture Painter',
    'author':'SpanStories',
    'version':(0,2,4),
    'blender':(4,3,0),
    'location':'Vista 3D > barra lateral > SpanStories',
    'description':'Referencia, islas UV limpias y pintura por capas; PNG/GLB para Three.js',
    'category':'Paint',
}

from . import core


def register():
    from . import piel_ui, ui
    ui.register()
    piel_ui.register()


def unregister():
    from . import bridge, piel_ui, ui
    bridge.stop()
    piel_ui.unregister()
    ui.unregister()
