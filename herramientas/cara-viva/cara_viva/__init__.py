"""Cara Viva: rig facial estándar, expresiones portables y habla en español."""
bl_info = {
    "name": "Cara Viva",
    "author": "SpanStories",
    "version": (0, 2, 0),
    "blender": (4, 2, 0),
    "location": "Vista 3D > Barra lateral > Cara Viva",
    "description": "Rig facial estándar, expresiones portables entre personajes y habla en español",
    "category": "Rigging",
}

import os

import bpy
from bpy.props import (BoolProperty, CollectionProperty, EnumProperty, FloatProperty,
                       IntProperty, PointerProperty, StringProperty)
from bpy.types import Operator, Panel, PropertyGroup

import json

from . import analizar, animar, construir, hoja, hornear
from .nucleo import biblioteca, estandar, fonemas_es, habla, tiempos, vida

_BIB = {"datos": None}


def bib():
    if _BIB["datos"] is None:
        _BIB["datos"] = animar.cargar_biblioteca()
    return _BIB["datos"]


def refrescar_biblioteca():
    _BIB["datos"] = None
    return bib()


# --------------------------------------------------------------- propiedades

def _items_expresiones(_self, _ctx):
    nombres = sorted(bib()["expresiones"].keys(), key=lambda s: (s != "Neutral", s))
    return [(n, n, "") for n in nombres] or [("Neutral", "Neutral", "")]


def _items_canales(_self, _ctx):
    return [(n, n, "") for n in sorted(bib()["canales"].keys())]


def _items_puntos(_self, _ctx):
    return [(nombre, nombre, "") for nombre in estandar.nombres_puntos()]


def _es_malla(_self, obj):
    return obj.type == "MESH"


def _es_rig(_self, obj):
    return obj.type == "ARMATURE"


def _actualizar_mezcla(_self, ctx):
    a = ctx.scene.caraviva
    if a.rig is None or a.bloquear:
        return
    pesos = {c.name: c.valor for c in a.canales if abs(c.valor) > 1e-6}
    animar.aplicar_mezcla(a.rig, bib(), pesos)


def _con_props(cls, **props):
    """Blender lee las propiedades de ``__annotations__``; así no se mezclan con las anotaciones de tipo."""
    cls.__annotations__ = dict(props)
    return cls


class CVCanal(PropertyGroup):
    pass


_con_props(CVCanal, valor=FloatProperty(name="", min=-1.0, max=1.4, default=0.0, update=_actualizar_mezcla))


class CVAjustes(PropertyGroup):
    pass


_con_props(
    CVAjustes,
    rig=PointerProperty(name="Rig", type=bpy.types.Object, poll=_es_rig),
    malla=PointerProperty(name="Cabeza", type=bpy.types.Object, poll=_es_malla),
    ojo_l=PointerProperty(name="Ojo L", type=bpy.types.Object, poll=_es_malla),
    ojo_r=PointerProperty(name="Ojo R", type=bpy.types.Object, poll=_es_malla),
    dientes_sup=PointerProperty(name="Dientes sup.", type=bpy.types.Object, poll=_es_malla),
    dientes_inf=PointerProperty(name="Dientes inf.", type=bpy.types.Object, poll=_es_malla),
    lengua=PointerProperty(name="Lengua", type=bpy.types.Object, poll=_es_malla),
    punto=EnumProperty(name="Punto", items=_items_puntos),
    radio=FloatProperty(name="Radio de pesos", min=0.5, max=2.0, default=1.0),
    suavizado=IntProperty(name="Suavizado de pesos", min=0, max=6, default=2),
    pivote_parpado=FloatProperty(name="Pivote de párpados (IOD)", min=-0.3, max=0.3, default=0.0),
    cuello=BoolProperty(name="Recortar en el cuello (malla de cuerpo)", default=True),
    canales=CollectionProperty(type=CVCanal),
    bloquear=BoolProperty(default=False),
    filtro=StringProperty(name="Filtro", default=""),
    expresion=EnumProperty(name="Expresión", items=_items_expresiones),
    nombre_expresion=StringProperty(name="Nombre", default="MiExpresion"),
    fuerza_expresion=FloatProperty(name="Fuerza", min=0.0, max=1.5, default=1.0),
    canal_editar=EnumProperty(name="Canal", items=_items_canales),
    ganancia=FloatProperty(name="Ganancia", min=0.0, max=3.0, default=1.0),
    texto=PointerProperty(name="Texto", type=bpy.types.Text),
    frase=StringProperty(name="Frase", default="Hola, me llamo Lía. ¿Cómo estás?"),
    audio=StringProperty(name="Audio (WAV)", subtype="FILE_PATH", default=""),
    rhubarb=StringProperty(name="Rhubarb JSON", subtype="FILE_PATH", default=""),
    inicio=IntProperty(name="Fotograma inicial", default=1, min=0),
    intens_habla=FloatProperty(name="Intensidad", min=0.2, max=1.6, default=1.0),
    coart=FloatProperty(name="Coarticulación", min=0.0, max=1.0, default=0.6),
    salida=EnumProperty(name="Escribir en", default="HUESOS", items=[
        ("HUESOS", "Huesos", "Claves en los huesos del rig"),
        ("SHAPEKEYS", "Shape keys", "Claves en las shape keys horneadas"),
        ("AMBOS", "Ambos", "Huesos y shape keys")]),
    usar_expresion_base=BoolProperty(name="Expresión de base", default=False),
    asimetria=FloatProperty(name="Asimetría", min=0.0, max=0.3, default=0.06),
    vida_activa=BoolProperty(name="Vida (parpadeo, mirada, cabeza)", default=True),
    semilla=IntProperty(name="Semilla", default=1),
    parpadeo=FloatProperty(name="Parpadeo", min=0.0, max=2.5, default=1.0),
    mirada=FloatProperty(name="Mirada", min=0.0, max=1.5, default=1.0),
    mirar_camara=FloatProperty(name="A cámara", min=0.0, max=1.0, default=0.6),
    cabeza_grados=FloatProperty(name="Cabeza (°)", min=0.0, max=4.0, default=0.7),
    duracion=FloatProperty(name="Duración (s)", min=1.0, max=600.0, default=10.0),
    ruta_hoja=StringProperty(name="Hoja", subtype="FILE_PATH", default="//cv_hoja.png"),
    informe=StringProperty(default=""),
)


# ---------------------------------------------------------------- utilidades

def _rig_o_error(op, ctx):
    a = ctx.scene.caraviva
    rig = a.rig or (ctx.active_object if ctx.active_object and ctx.active_object.type == "ARMATURE"
                    and "cv_iod" in ctx.active_object else None)
    if rig is None or "cv_iod" not in rig:
        op.report({"ERROR"}, "Elige un rig de Cara Viva (o constrúyelo primero)")
        return None
    a.rig = rig
    return rig


def _malla_de(rig, a):
    if a.malla:
        return a.malla
    return bpy.data.objects.get(rig.get("cv_malla", ""))


def _sincronizar_canales(a):
    a.bloquear = True
    nombres = sorted(bib()["canales"].keys())
    previos = {c.name: c.valor for c in a.canales}
    a.canales.clear()
    for n in nombres:
        c = a.canales.add()
        c.name = n
        c.valor = previos.get(n, 0.0)
    a.bloquear = False


# ------------------------------------------------------------------ análisis

class CV_OT_analizar(Operator):
    bl_idname = "caraviva.analizar"
    bl_label = "Analizar malla"
    bl_description = ("Mide la malla de la cara (boca, ojos, frente, mejillas, nariz, mentón) y dice "
                      "qué zonas conviene retopologizar. No modifica nada; marca el grupo cv_revisar")

    def execute(self, ctx):
        a = ctx.scene.caraviva
        if a.malla is None:
            self.report({"ERROR"}, "Elige la malla de la cabeza")
            return {"CANCELLED"}
        try:
            lm = estandar.completar({k: tuple(v) for k, v in construir.leer_puntos().items()})
            res = analizar.analizar(a.malla, lm)
        except ValueError as e:
            self.report({"ERROR"}, "Antes de analizar marca los puntos: %s" % e)
            return {"CANCELLED"}
        rojo, amar = analizar.marcar(a.malla, res)
        res.pop("marcas")
        a.informe = json.dumps(res, ensure_ascii=False)
        self.report({"INFO"}, "Análisis: %s (%d vértices en rojo, %d en amarillo)" % (
            analizar.NIVELES[res["peor"]], rojo, amar))
        return {"FINISHED"}


class CV_OT_corregir_seguras(Operator):
    bl_idname = "caraviva.corregir_seguras"
    bl_label = "Corregir lo seguro"
    bl_description = "Disuelve caras de área cero y borra vértices sueltos de la malla de la cabeza"

    def invoke(self, ctx, _ev):
        return ctx.window_manager.invoke_confirm(self, _ev)

    def execute(self, ctx):
        a = ctx.scene.caraviva
        if a.malla is None:
            return {"CANCELLED"}
        caras, sueltos = analizar.corregir_seguras(a.malla)
        self.report({"INFO"}, "Quitadas %d caras degeneradas y %d vértices sueltos" % (caras, sueltos))
        return {"FINISHED"}


# ------------------------------------------------------------------ puntos/rig

class CV_OT_marcar(Operator):
    bl_idname = "caraviva.marcar"
    bl_label = "Marcar punto en el cursor 3D"
    bl_description = "Coloca el punto elegido donde está el cursor 3D (usa Ajuste/Snap a cara)"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        construir.poner_punto(ctx.scene, a.punto, ctx.scene.cursor.location.copy())
        nombres = estandar.nombres_puntos()
        i = nombres.index(a.punto)
        a.punto = nombres[(i + 1) % len(nombres)]
        return {"FINISHED"}


class CV_OT_puntos_ojos(Operator):
    bl_idname = "caraviva.puntos_ojos"
    bl_label = "Ojos desde los globos oculares"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        if not (a.ojo_l and a.ojo_r):
            self.report({"ERROR"}, "Elige los dos globos oculares")
            return {"CANCELLED"}
        construir.puntos_desde_ojos(ctx.scene, a.ojo_l, a.ojo_r)
        return {"FINISHED"}


class CV_OT_construir(Operator):
    bl_idname = "caraviva.construir"
    bl_label = "Construir rig facial"
    bl_description = "Crea los huesos del estándar con los puntos marcados y calcula los pesos"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        if a.malla is None:
            self.report({"ERROR"}, "Elige la malla de la cabeza")
            return {"CANCELLED"}
        pts = construir.leer_puntos()
        try:
            rig, info = construir.construir(
                ctx, a.malla, pts, ojos=(a.ojo_l, a.ojo_r), dientes_sup=a.dientes_sup,
                dientes_inf=a.dientes_inf, lengua=a.lengua,
                ajustes={"radio": a.radio, "suavizado": a.suavizado, "pivote_parpado": a.pivote_parpado,
                         "cuello": a.cuello})
        except ValueError as e:
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        a.rig = rig
        _sincronizar_canales(a)
        self.report({"INFO"}, "Rig creado: %d huesos, %d vértices" % (info["huesos"], info["vertices"]))
        return {"FINISHED"}


class CV_OT_reponderar(Operator):
    bl_idname = "caraviva.reponderar"
    bl_label = "Recalcular pesos"
    bl_description = "Vuelve a calcular los pesos con los ajustes y puntos actuales (conserva el rig)"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        malla = _malla_de(rig, a)
        if malla is None:
            self.report({"ERROR"}, "No encuentro la malla de la cabeza")
            return {"CANCELLED"}
        lm = estandar.completar({k: tuple(v) for k, v in construir.leer_puntos().items()})
        animar.reiniciar_pose(rig)
        info = construir.reponderar(malla, rig, lm, ajustes={
            "radio": a.radio, "suavizado": a.suavizado, "pivote_parpado": a.pivote_parpado,
            "cuello": a.cuello})
        self.report({"INFO"}, "Pesos recalculados (%d vértices sin peso propio)" % info["sin_peso_propio"])
        return {"FINISHED"}


class CV_OT_borrar_rig(Operator):
    bl_idname = "caraviva.borrar_rig"
    bl_label = "Quitar rig"
    bl_description = "Borra el armature y los grupos cv_ de las mallas (no toca la geometría)"

    def execute(self, ctx):
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        construir.borrar_rig(rig)
        ctx.scene.caraviva.rig = None
        return {"FINISHED"}


# ------------------------------------------------------------- expresiones

class CV_OT_reiniciar(Operator):
    bl_idname = "caraviva.reiniciar"
    bl_label = "Reiniciar pose"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        a.bloquear = True
        for c in a.canales:
            c.valor = 0.0
        a.bloquear = False
        animar.reiniciar_pose(rig)
        return {"FINISHED"}


class CV_OT_aplicar_expresion(Operator):
    bl_idname = "caraviva.aplicar_expresion"
    bl_label = "Aplicar expresión"
    bl_description = "Pone la expresión elegida en el mezclador y en la pose"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        pesos, crudos = biblioteca.resolver_expresion(bib(), a.expresion)
        pesos = {k: v * a.fuerza_expresion for k, v in pesos.items()}
        a.bloquear = True
        for c in a.canales:
            c.valor = pesos.get(c.name, 0.0)
        a.bloquear = False
        desc = animar.aplicar_mezcla(rig, bib(), pesos, crudos)
        if desc:
            self.report({"WARNING"}, "Canales que este rig no tiene: " + ", ".join(desc[:4]))
        return {"FINISHED"}


class CV_OT_guardar_expresion(Operator):
    bl_idname = "caraviva.guardar_expresion"
    bl_label = "Guardar en la biblioteca"
    bl_description = ("Guarda la expresión en tu biblioteca. Mezclador = canales con valor; "
                      "Pose = lo que has movido a mano en los huesos")

    def execute(self, ctx):
        a = ctx.scene.caraviva
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        nombre = a.nombre_expresion.strip()
        if not nombre:
            self.report({"ERROR"}, "Escribe un nombre")
            return {"CANCELLED"}
        b = bib()
        if self.origen == "MEZCLADOR":
            pesos = {c.name: round(c.valor, 4) for c in a.canales if abs(c.valor) > 1e-4}
            if not pesos:
                self.report({"ERROR"}, "El mezclador está a cero")
                return {"CANCELLED"}
            b["expresiones"][nombre] = {"canales": pesos, "descripcion": "usuario"}
        else:
            crudos = biblioteca.pose_a_crudos(animar.leer_pose(rig), float(rig["cv_iod"]))
            if not crudos:
                self.report({"ERROR"}, "La pose está en reposo")
                return {"CANCELLED"}
            b["expresiones"][nombre] = {"canales": {}, "huesos": crudos, "descripcion": "pose capturada"}
        animar.guardar_biblioteca(b)
        a.expresion = nombre
        self.report({"INFO"}, "Guardada «%s» en %s" % (nombre, animar.ruta_usuario()))
        return {"FINISHED"}


_con_props(CV_OT_guardar_expresion, origen=EnumProperty(name="Origen", default="MEZCLADOR", items=[
    ("MEZCLADOR", "Mezclador", "Usa los deslizadores de canal"),
    ("POSE", "Pose actual", "Guarda los huesos tal como están, normalizados por IOD")]))


class CV_OT_borrar_expresion(Operator):
    bl_idname = "caraviva.borrar_expresion"
    bl_label = "Borrar expresión"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        b = bib()
        if a.expresion in estandar.expresiones_por_defecto():
            self.report({"ERROR"}, "Las expresiones del estándar no se borran (crea otra con el mismo nombre para sustituirla)")
            return {"CANCELLED"}
        b["expresiones"].pop(a.expresion, None)
        animar.guardar_biblioteca(b)
        return {"FINISHED"}


class CV_OT_redefinir_canal(Operator):
    bl_idname = "caraviva.redefinir_canal"
    bl_label = "Redefinir canal desde la pose"
    bl_description = ("Sustituye el canal elegido por la pose actual de los huesos (a 100 %). "
                      "Afecta a TODOS los personajes: úsalo para mejorar el estándar")

    def execute(self, ctx):
        a = ctx.scene.caraviva
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        crudos = biblioteca.pose_a_crudos(animar.leer_pose(rig), float(rig["cv_iod"]))
        if not crudos:
            self.report({"ERROR"}, "La pose está en reposo")
            return {"CANCELLED"}
        b = bib()
        b["canales"][a.canal_editar] = crudos
        animar.guardar_biblioteca(b)
        return {"FINISHED"}


class CV_OT_ganancia(Operator):
    bl_idname = "caraviva.ganancia"
    bl_label = "Ajustar este personaje"
    bl_description = "Multiplica un canal solo para este personaje (su cara es más rígida o más blanda)"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        g = animar.leer_ganancias(rig)
        if abs(a.ganancia - 1.0) < 1e-4:
            g.pop(a.canal_editar, None)
        else:
            g[a.canal_editar] = round(a.ganancia, 3)
        animar.guardar_ganancias(rig, g)
        return {"FINISHED"}


class CV_OT_exportar(Operator):
    bl_idname = "caraviva.exportar"
    bl_label = "Exportar biblioteca"
    filename_ext = ".json"

    def invoke(self, ctx, _ev):
        self.filepath = "caraviva_biblioteca.json"
        ctx.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, _ctx):
        biblioteca.guardar(self.filepath, biblioteca.solo_cambios(bib()))
        return {"FINISHED"}


_con_props(CV_OT_exportar, filepath=StringProperty(subtype="FILE_PATH"),
           filter_glob=StringProperty(default="*.json", options={"HIDDEN"}))


class CV_OT_importar(Operator):
    bl_idname = "caraviva.importar"
    bl_label = "Importar biblioteca"

    def invoke(self, ctx, _ev):
        ctx.window_manager.fileselect_add(self)
        return {"RUNNING_MODAL"}

    def execute(self, ctx):
        try:
            otra = biblioteca.cargar(self.filepath)
        except (OSError, ValueError) as e:
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        b = biblioteca.fusionar(bib(), otra, self.sobrescribir)
        animar.guardar_biblioteca(b)
        refrescar_biblioteca()
        _sincronizar_canales(ctx.scene.caraviva)
        return {"FINISHED"}


_con_props(CV_OT_importar, filepath=StringProperty(subtype="FILE_PATH"),
           filter_glob=StringProperty(default="*.json", options={"HIDDEN"}),
           sobrescribir=BoolProperty(name="Sobrescribir las que ya existen", default=True))


# -------------------------------------------------------------------- habla

def _añadir_audio(escena, ruta, frame0):
    ruta = bpy.path.abspath(ruta)
    if not os.path.exists(ruta):
        return "no existe"
    se = escena.sequence_editor or escena.sequence_editor_create()
    cont = getattr(se, "strips", None)
    if cont is None:
        cont = se.sequences
    try:
        cont.new_sound(name="dialogo", filepath=ruta, channel=1, frame_start=frame0)
        return "añadido"
    except Exception as e:
        return "falló: %s" % e


def _curva_base(a, duracion):
    if not a.usar_expresion_base:
        return {}
    pesos, _ = biblioteca.resolver_expresion(bib(), a.expresion)
    pesos = biblioteca.asimetria({k: v * a.fuerza_expresion for k, v in pesos.items()},
                                 a.asimetria, a.semilla)
    return {c: [(0.0, w), (duracion, w)] for c, w in pesos.items()}


class CV_OT_hablar(Operator):
    bl_idname = "caraviva.hablar"
    bl_label = "Animar habla"
    bl_description = "Texto en español (+ audio WAV opcional) -> animación de boca, con vida de fondo"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        texto = a.texto.as_string() if a.texto else a.frase
        fps = ctx.scene.render.fps / ctx.scene.render.fps_base
        env_norm = None
        try:
            if a.rhubarb:
                ev = tiempos.leer_rhubarb(bpy.path.abspath(a.rhubarb))
            else:
                ev = fonemas_es.texto_a_eventos(texto)
                if not [e for e in ev if e["v"] != "_"]:
                    raise ValueError("el texto no tiene sonidos")
                if a.audio:
                    muestras, tasa = tiempos.leer_wav(bpy.path.abspath(a.audio))
                    env = tiempos.envolvente(muestras, tasa)
                    env_norm = tiempos.normalizar(env)
                    ev = tiempos.con_segmentos(ev, tiempos.segmentos_voz(env))
                else:
                    ev = tiempos.sin_audio(ev)
        except (OSError, ValueError, KeyError, EOFError) as e:
            self.report({"ERROR"}, "No se pudo preparar el habla: %s" % e)
            return {"CANCELLED"}

        res = habla.construir(ev, bib(), env_norm, 0.01, fps, a.intens_habla, a.coart)
        if not res["tiempos"]:
            self.report({"ERROR"}, "Sin sonidos que animar")
            return {"CANCELLED"}
        capa_habla = {c: list(zip(res["tiempos"], v)) for c, v in res["canales"].items()}
        duracion = max(e["t1"] for e in ev) + 0.6
        capas = [capa_habla, _curva_base(a, duracion)]
        cabeza = None
        if a.vida_activa:
            v = vida.generar(duracion, a.semilla, [e["t0"] for e in ev if e["v"] == "_" and e["fuerte"]],
                             res["enfasis"], a.parpadeo, a.mirada, a.mirar_camara, a.cabeza_grados)
            capas.append(v["curvas"])
            cabeza = v["cabeza"]
        info = animar.escribir(rig, _malla_de(rig, a), bib(), animar.sumar_curvas(*capas), cabeza,
                               fps, a.inicio, a.salida, "CV_Habla")
        if a.audio:
            info["audio"] = _añadir_audio(ctx.scene, a.audio, a.inicio)
        self.report({"INFO"}, "Habla: %d claves en %s" % (info["llaves"], info["accion"]))
        return {"FINISHED"}


class CV_OT_vida(Operator):
    bl_idname = "caraviva.vida"
    bl_label = "Solo vida (sin habla)"
    bl_description = "Parpadeo, mirada y cabeza durante la duración indicada (personaje escuchando)"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        fps = ctx.scene.render.fps / ctx.scene.render.fps_base
        v = vida.generar(a.duracion, a.semilla, [], [], a.parpadeo, a.mirada, a.mirar_camara, a.cabeza_grados)
        capas = [v["curvas"], _curva_base(a, a.duracion)]
        info = animar.escribir(rig, _malla_de(rig, a), bib(), animar.sumar_curvas(*capas), v["cabeza"],
                               fps, a.inicio, a.salida, "CV_Vida")
        self.report({"INFO"}, "Vida: %d claves" % info["llaves"])
        return {"FINISHED"}


# ------------------------------------------------------------------ exportar

class CV_OT_hornear(Operator):
    bl_idname = "caraviva.hornear"
    bl_label = "Hornear shape keys"
    bl_description = "Un shape key por canal (nombres ARKit) para llevar el rostro a three.js/GLB"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        malla = _malla_de(rig, a)
        if malla is None:
            self.report({"ERROR"}, "No encuentro la malla de la cabeza")
            return {"CANCELLED"}
        try:
            info = hornear.hornear(ctx, rig, malla, bib())
        except ValueError as e:
            self.report({"ERROR"}, str(e))
            return {"CANCELLED"}
        self.report({"INFO"}, "%d shape keys creados (%d canales sin efecto)" % (
            info["creados"], len(info["sin_efecto"])))
        return {"FINISHED"}


class CV_OT_hoja(Operator):
    bl_idname = "caraviva.hoja"
    bl_label = "Hoja de contacto"
    bl_description = "Renderiza todas las expresiones de la biblioteca en una sola imagen"

    def execute(self, ctx):
        a = ctx.scene.caraviva
        rig = _rig_o_error(self, ctx)
        if rig is None:
            return {"CANCELLED"}
        nombres = sorted(bib()["expresiones"].keys(), key=lambda s: (s != "Neutral", s))
        info = hoja.hoja_contacto(ctx, rig, bib(), nombres, bpy.path.abspath(a.ruta_hoja))
        self.report({"INFO"}, "Hoja con %d expresiones: %s" % (info["celdas"], info["ruta"]))
        return {"FINISHED"}


# ---------------------------------------------------------------------- UI

class CV_PT_base(Panel):
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Cara Viva"


_ICONO_NIVEL = ("CHECKMARK", "ERROR", "CANCEL")


class CV_PT_analisis(CV_PT_base):
    bl_label = "0 · Analizar malla"
    bl_idname = "CV_PT_analisis"

    def draw(self, ctx):
        a = ctx.scene.caraviva
        lay = self.layout
        lay.prop(a, "malla")
        lay.label(text="Marca antes los 9 puntos (pestaña 1).")
        lay.operator("caraviva.analizar", icon="VIEWZOOM")
        if not a.informe:
            return
        try:
            res = json.loads(a.informe)
        except ValueError:
            return
        lay.label(text="Resultado: %s" % analizar.NIVELES[res["peor"]],
                  icon=_ICONO_NIVEL[res["peor"]])
        for z in res["zonas"]:
            caja = lay.box()
            caja.label(text="%s · %d vért. · arista %.3f IOD" % (z["zona"], z["vertices"], z["arista"]),
                       icon=_ICONO_NIVEL[z["nivel"]])
            if z["nivel"]:
                for m in z["motivos"]:
                    caja.label(text=m)
                caja.label(text="→ " + z["accion"])
        arreglo = False
        for g in res["globales"]:
            lay.label(text=g["texto"], icon=_ICONO_NIVEL[g["nivel"]])
            arreglo = arreglo or g["arreglo"] == "corregir_seguras"
        if arreglo:
            lay.operator("caraviva.corregir_seguras", icon="TOOL_SETTINGS")
        lay.label(text="Rojo/amarillo: grupo de vértices «cv_revisar»")


class CV_PT_rig(CV_PT_base):
    bl_label = "1 · Rig facial"
    bl_idname = "CV_PT_rig"

    def draw(self, ctx):
        a = ctx.scene.caraviva
        col = self.layout.column(align=True)
        col.prop(a, "malla")
        col.prop(a, "ojo_l"); col.prop(a, "ojo_r")
        col.prop(a, "dientes_sup"); col.prop(a, "dientes_inf"); col.prop(a, "lengua")
        col.operator("caraviva.puntos_ojos", icon="HIDE_OFF")
        box = self.layout.box()
        box.label(text="Puntos de referencia")
        pts = construir.leer_puntos()
        falta = [n for n in estandar.nombres_puntos() if n not in pts]
        box.label(text="Colocados: %d/%d" % (len(pts), len(estandar.nombres_puntos())))
        box.prop(a, "punto", text="")
        box.operator("caraviva.marcar", icon="PIVOT_CURSOR")
        if falta:
            box.label(text="Falta: " + ", ".join(falta[:3]) + ("…" if len(falta) > 3 else ""))
        col = self.layout.column(align=True)
        col.prop(a, "radio"); col.prop(a, "suavizado"); col.prop(a, "pivote_parpado")
        col.prop(a, "cuello")
        if a.rig is None:
            col.operator("caraviva.construir", icon="ARMATURE_DATA")
        else:
            col.prop(a, "rig")
            col.operator("caraviva.reponderar", icon="MOD_VERTEX_WEIGHT")
            col.operator("caraviva.borrar_rig", icon="TRASH")


class CV_PT_expr(CV_PT_base):
    bl_label = "2 · Expresiones"
    bl_idname = "CV_PT_expr"

    def draw(self, ctx):
        a = ctx.scene.caraviva
        lay = self.layout
        lay.prop(a, "rig")
        row = lay.row(align=True)
        row.prop(a, "expresion", text="")
        row.operator("caraviva.aplicar_expresion", text="Aplicar")
        lay.prop(a, "fuerza_expresion")
        lay.operator("caraviva.reiniciar", icon="LOOP_BACK")
        box = lay.box()
        box.prop(a, "nombre_expresion")
        row = box.row(align=True)
        op = row.operator("caraviva.guardar_expresion", text="Guardar mezcla")
        op.origen = "MEZCLADOR"
        op = row.operator("caraviva.guardar_expresion", text="Guardar pose")
        op.origen = "POSE"
        box.operator("caraviva.borrar_expresion", icon="X")
        row = lay.row(align=True)
        row.operator("caraviva.exportar", icon="EXPORT")
        row.operator("caraviva.importar", icon="IMPORT")


class CV_PT_mezclador(CV_PT_base):
    bl_label = "Mezclador de canales"
    bl_idname = "CV_PT_mezclador"
    bl_parent_id = "CV_PT_expr"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, ctx):
        a = ctx.scene.caraviva
        lay = self.layout
        if not a.canales:
            lay.operator("caraviva.reiniciar", text="(carga el rig primero)")
            return
        lay.prop(a, "filtro", icon="VIEWZOOM")
        f = a.filtro.lower()
        col = lay.column(align=True)
        for c in a.canales:
            if f and f not in c.name.lower():
                continue
            col.prop(c, "valor", text=c.name, slider=True)
        box = lay.box()
        box.label(text="Ajustes del canal")
        box.prop(a, "canal_editar", text="")
        row = box.row(align=True)
        row.prop(a, "ganancia")
        row.operator("caraviva.ganancia", text="Solo este personaje")
        box.operator("caraviva.redefinir_canal", icon="FILE_REFRESH")


class CV_PT_habla(CV_PT_base):
    bl_label = "3 · Habla y vida"
    bl_idname = "CV_PT_habla"

    def draw(self, ctx):
        a = ctx.scene.caraviva
        lay = self.layout
        col = lay.column(align=True)
        col.prop(a, "texto")
        if not a.texto:
            col.prop(a, "frase", text="")
        col.prop(a, "audio")
        col.prop(a, "rhubarb")
        col = lay.column(align=True)
        col.prop(a, "inicio"); col.prop(a, "intens_habla"); col.prop(a, "coart")
        col.prop(a, "salida")
        col.prop(a, "usar_expresion_base")
        if a.usar_expresion_base:
            col.prop(a, "expresion", text="")
            col.prop(a, "asimetria")
        col = lay.column(align=True)
        col.prop(a, "vida_activa")
        if a.vida_activa:
            col.prop(a, "semilla"); col.prop(a, "parpadeo"); col.prop(a, "mirada")
            col.prop(a, "mirar_camara"); col.prop(a, "cabeza_grados")
        lay.operator("caraviva.hablar", icon="PLAY")
        row = lay.row(align=True)
        row.prop(a, "duracion", text="")
        row.operator("caraviva.vida", icon="HIDE_OFF")


class CV_PT_web(CV_PT_base):
    bl_label = "4 · Web y revisión"
    bl_idname = "CV_PT_web"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, ctx):
        a = ctx.scene.caraviva
        lay = self.layout
        lay.operator("caraviva.hornear", icon="SHAPEKEY_DATA")
        lay.prop(a, "ruta_hoja")
        lay.operator("caraviva.hoja", icon="IMAGE_DATA")


CLASES = (CVCanal, CVAjustes, CV_OT_analizar, CV_OT_corregir_seguras, CV_PT_analisis, CV_OT_marcar, CV_OT_puntos_ojos, CV_OT_construir, CV_OT_reponderar,
          CV_OT_borrar_rig, CV_OT_reiniciar, CV_OT_aplicar_expresion, CV_OT_guardar_expresion,
          CV_OT_borrar_expresion, CV_OT_redefinir_canal, CV_OT_ganancia, CV_OT_exportar,
          CV_OT_importar, CV_OT_hablar, CV_OT_vida, CV_OT_hornear, CV_OT_hoja,
          CV_PT_rig, CV_PT_expr, CV_PT_mezclador, CV_PT_habla, CV_PT_web)


def register():
    for c in CLASES:
        bpy.utils.register_class(c)
    bpy.types.Scene.caraviva = PointerProperty(type=CVAjustes)


def unregister():
    del bpy.types.Scene.caraviva
    for c in reversed(CLASES):
        bpy.utils.unregister_class(c)

