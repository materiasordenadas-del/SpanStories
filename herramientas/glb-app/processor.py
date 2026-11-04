"""Conversión de objetos estáticos; ejecutar con Blender --background --python."""
import json, math, os, sys, struct
from pathlib import Path
import bpy
from mathutils import Vector


def bounds(objects):
    points = [o.matrix_world @ Vector(v) for o in objects for v in o.bound_box]
    return (Vector([min(p[i] for p in points) for i in range(3)]),
            Vector([max(p[i] for p in points) for i in range(3)]))


def triangles(objects):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objects)


def flat_components(mesh):
    """Proteger superficies abiertas y planos que dependen del recorte alpha."""
    positions = [tuple(round(v, 6) for v in vertex.co) for vertex in mesh.vertices]
    edges = {}
    for face in mesh.polygons:
        vertices = list(face.vertices)
        for a,b in zip(vertices, vertices[1:]+vertices[:1]):
            edge = tuple(sorted((positions[a], positions[b])))
            edges[edge] = edges.get(edge, 0)+1
    # Una pieza tubular puede tener extremos abiertos y seguir siendo un volumen.
    # Proteger láminas con muchos bordes libres, además de componentes planos.
    if edges and sum(count == 1 for count in edges.values()) / len(edges) >= .2:
        return True
    parents = list(range(len(mesh.polygons)))
    def find(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index
    owners = {}
    for face in mesh.polygons:
        for index in face.vertices:
            key = tuple(round(v, 6) for v in mesh.vertices[index].co)
            if key in owners:
                parents[find(face.index)] = find(owners[key])
            else:
                owners[key] = face.index
    normals = {}
    for face in mesh.polygons:
        if face.area <= 0:
            continue
        component = find(face.index)
        if component in normals and abs(face.normal.dot(normals[component])) < .99999:
            return False
        normals[component] = face.normal.copy()
    return bool(normals)


def texture_color(image, obj, slot):
    """Albedo medio por superficie, sin redondearlo hacia tonos oscuros."""
    copy = image.copy()
    try:
        resolution = 128
        copy.scale(resolution, resolution)
        values = list(copy.pixels)
        uv = obj.data.uv_layers.active
        samples = []
        if uv:
            faces = [p for p in obj.data.polygons if p.material_index == slot]
            for p in faces[::max(1, len(faces) // 1200)]:
                coords = [uv.data[i].uv for i in p.loop_indices]
                u = sum(v.x for v in coords) / len(coords)
                v = sum(v.y for v in coords) / len(coords)
                x = min(resolution-1, int((u % 1) * resolution))
                y = min(resolution-1, int((v % 1) * resolution))
                i = (y * resolution + x) * 4
                if values[i + 3] > .5 and p.area > 0:
                    samples.append((values[i:i+3], p.area))
        if not samples:
            samples = [(values[i:i+3], 1.) for i in range(0, len(values), 4) if values[i+3] > .5]
        if not samples:
            return None
        # Cada superficie pesa por su área, no por el número de polígonos.
        total = sum(weight for _, weight in samples)
        # Blender proporciona los píxeles en espacio lineal; no aplicar gamma dos veces.
        return [sum(color[k] * weight for color, weight in samples) / total for k in range(3)]
    finally:
        bpy.data.images.remove(copy)


def color_of(material, obj, slot, texture_factor=None):
    fallback = list(material.diffuse_color[:3]) if material else [.45, .25, .12]
    if not material or not material.use_nodes:
        return fallback, 1.0
    bsdf = next((n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf:
        return fallback, 1.0
    base = bsdf.inputs['Base Color']
    color = list(base.default_value[:3])
    upstream = [link.from_node for link in base.links]
    visited = set()
    while upstream:
        node = upstream.pop()
        if node in visited:
            continue
        visited.add(node)
        if node.type == 'TEX_IMAGE' and node.image:
            sampled = texture_color(node.image, obj, slot)
            if sampled is not None:
                # El valor por defecto de un socket conectado no multiplica su textura.
                # Usar exclusivamente el factor explícito del material glTF.
                factor = texture_factor if texture_factor is not None else (1., 1., 1.)
                color = [sampled[k] * factor[k] for k in range(3)]
            break
        upstream.extend(link.from_node for socket in node.inputs for link in socket.links)
    return color, float(bsdf.inputs['Alpha'].default_value)


def convert(source, output, settings):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    scene = bpy.context.scene
    objects = [o for o in scene.objects if o.type == 'MESH']
    if not objects:
        raise ValueError('El GLB no contiene mallas de un objeto 3D.')
    if any(o.type == 'ARMATURE' or o.animation_data for o in scene.objects):
        raise ValueError('Este archivo contiene un rig o animaciones. La app procesa objetos estáticos para no dañar su movimiento.')
    if any(o.data.shape_keys for o in objects):
        raise ValueError('El archivo contiene morph targets. No se simplifica automáticamente para conservarlos.')
    payload = source.read_bytes()
    document = json.loads(payload[20:20 + struct.unpack_from('<I', payload, 12)[0]])
    texture_factors = {m.get('name', f'Material_{i}'): m.get('pbrMetallicRoughness', {}).get('baseColorFactor', [1.,1.,1.,1.])[:3]
                       for i,m in enumerate(document.get('materials', []))}
    original_triangles = triangles(objects)
    # Conservar transformaciones mundiales ANTES de quitar nodos padres importados.
    for o in objects:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
    removed = []
    if settings.get('remove_floor', True):
        whole_lo, whole_hi = bounds(objects)
        for o in objects[:]:
            lo, hi = bounds([o])
            size = hi - lo
            name = o.name.lower().split('.')[0]
            named_floor = name in ('floor', 'ground', 'suelo', 'piso', 'plane001')
            horizontal = size.z <= max(size.x, size.y) * .005
            at_base = lo.z <= whole_lo.z + (whole_hi.z - whole_lo.z) * .03
            if named_floor and horizontal and at_base and len(objects) > 1:
                removed.append(o.name)
                objects.remove(o)
                bpy.data.objects.remove(o, do_unlink=True)
    used_materials = {m.name for o in objects for m in o.data.materials if m}
    transparent_materials = {m.get('name'): m for m in document.get('materials', [])
                             if m.get('name') in used_materials and m.get('alphaMode', 'OPAQUE') != 'OPAQUE'
                             and 'baseColorTexture' in m.get('pbrMetallicRoughness', {})}
    warnings = []
    preserve_source = settings.get('palette', 'source') == 'source'
    preserve_textures = preserve_source or bool(transparent_materials)
    if preserve_source:
        warnings.append('Se conserva el albedo original y sus UV; las texturas se optimizan hasta 512 px sin mezclar los colores de distintas zonas.')
    if transparent_materials:
        warnings.append('Se conservan colores y transparencia con texturas de hasta 512 px. Las láminas recortadas conservan su geometría; las piezas con volumen sí se simplifican.')
    if settings.get('axis', 'auto') != 'auto':
        from mathutils import Matrix
        angle = math.pi / 2 if settings['axis'] == 'plus90' else -math.pi / 2
        rotation = Matrix.Rotation(angle, 4, 'X')
        for o in objects:
            o.matrix_world = rotation @ o.matrix_world
    bpy.context.view_layer.update()
    lo, hi = bounds(objects)
    longest = max(hi - lo)
    if longest <= 0:
        raise ValueError('El modelo no tiene un volumen válido.')
    units = settings.get('units', 'auto')
    factor = {'m': 1., 'cm': .01, 'mm': .001}.get(units, 1.)
    if units == 'auto' and longest > 20:
        factor = .01
        warnings.append('Escala inferida en centímetros por el tamaño. Comprueba las medidas; puedes elegir otra unidad.')
    if units == 'auto' and longest < .02:
        warnings.append('Objeto muy pequeño: se conservaron sus unidades. Comprueba la escala.')
    for o in objects:
        o.matrix_world.translation *= factor
        o.scale *= factor
    bpy.context.view_layer.update()
    lo, hi = bounds(objects)
    offset = Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
    root = bpy.data.objects.new('articulo-001', None)
    scene.collection.objects.link(root)
    root['id'] = 'articulo-001'
    root['tipo'] = 'mobiliario'
    root['etiqueta'] = source.stem
    sofa_triangles_before = triangles(objects)
    material_cache = {}
    colors = []
    texture_cache = {}
    texture_changes = []
    protected_parts = []
    ratio = float(settings.get('ratio', .28))
    for o in objects:
        o.location += offset
        world = o.matrix_world.copy()
        o.parent = root
        o.matrix_world = world
        # Aplicar escala/rotación para que el GLB tenga cotas en metros y pivot base.
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        has_mask = any(m and m.name in transparent_materials for m in o.data.materials)
        protect_planes = has_mask and flat_components(o.data)
        if protect_planes:
            protected_parts.append(o.name)
        if len(o.data.polygons) >= 100 and ratio < 1 and not protect_planes:
            modifier = o.modifiers.new('Optimizar geometría', 'DECIMATE')
            modifier.ratio = ratio
            modifier.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        original_slots = list(o.data.materials) or [None]
        if not o.data.materials:
            o.data.materials.append(None)
        for index, old in enumerate(original_slots):
            key = old.name if old else '__default'
            if key not in material_cache:
                color, alpha = color_of(old, o, index, texture_factors.get(key))
                if settings.get('palette') == 'warm':
                    luminance = sum(color[i] * [.2126, .7152, .0722][i] for i in range(3))
                    name = (key + ' ' + o.name).lower()
                    if any(word in name for word in ('brass', 'metal', 'laton', 'latón')):
                        color = [.65, .43, .17]
                    elif any(word in name for word in ('wood', 'madera')):
                        color = [.18, .095, .055]
                    else:
                        color = [.49, .235, .105] if luminance > .06 else [.12, .065, .035]
                # En los recortes conservar albedo y alpha: hojas y tronco pueden
                # compartir un material cuya textura define sus distintos colores.
                keep_albedo = bool(old and (preserve_source or key in transparent_materials))
                mat = old.copy() if keep_albedo else bpy.data.materials.new('SpanStories_' + key)
                mat.name = 'SpanStories_' + key
                mat.diffuse_color = (*color, alpha)
                mat.use_nodes = True
                shader = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if shader is None:
                    shader = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
                    output_node = next((n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'), None)
                    if output_node is None:
                        output_node = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
                    mat.node_tree.links.new(shader.outputs['BSDF'], output_node.inputs['Surface'])
                for socket in shader.inputs:
                    if not (keep_albedo and socket.name in ('Base Color', 'Alpha')):
                        for link in list(socket.links):
                            mat.node_tree.links.remove(link)
                if not keep_albedo:
                    shader.inputs['Base Color'].default_value = (*color, 1)
                shader.inputs['Alpha'].default_value = alpha
                shader.inputs['Metallic'].default_value = 0
                shader.inputs['Roughness'].default_value = 1
                shader.inputs['Specular IOR Level'].default_value = 0
                if keep_albedo:
                    for name in ('Emission Strength', 'Transmission Weight', 'Coat Weight', 'Sheen Weight'):
                        if name in shader.inputs:
                            shader.inputs[name].default_value = 0
                    # Sólo redimensionar imágenes que alimentan albedo o alpha.
                    reachable = set()
                    upstream = [link.from_node for name in ('Base Color', 'Alpha') for link in shader.inputs[name].links]
                    while upstream:
                        node = upstream.pop()
                        if node in reachable:
                            continue
                        reachable.add(node)
                        upstream.extend(link.from_node for socket in node.inputs for link in socket.links)
                    for node in reachable:
                        if node.type == 'TEX_IMAGE' and node.image:
                            image = node.image
                            if image.name not in texture_cache:
                                width, height = image.size
                                if max(width, height) > 512:
                                    optimized = image.copy()
                                    scale = 512 / max(width, height)
                                    optimized.scale(max(1, round(width*scale)), max(1, round(height*scale)))
                                    optimized.pack()
                                    texture_cache[image.name] = optimized
                                    texture_changes.append({'image': image.name, 'before': [width,height], 'after': list(optimized.size)})
                                else:
                                    texture_cache[image.name] = image
                            node.image = texture_cache[image.name]
                    # El exportador también lee el grupo glTF de oclusión aunque
                    # esté desconectado: quitar mapas ajenos al albedo/alpha.
                    for node in list(mat.node_tree.nodes):
                        if node not in reachable and node != shader and node.type != 'OUTPUT_MATERIAL':
                            mat.node_tree.nodes.remove(node)
                if alpha < 1 or key in transparent_materials:
                    mat.surface_render_method = 'DITHERED'
                mat.use_backface_culling = bool(old and old.use_backface_culling)
                material_cache[key] = mat
                colors.append({'material': key, 'linear_rgb': color, 'alpha': alpha})
            o.data.materials[index] = material_cache[key]
        # Mantener las asignaciones de cada cara y el sombreado del original.
        if not preserve_textures:
            for layer in list(o.data.uv_layers):
                o.data.uv_layers.remove(layer)
    bpy.context.view_layer.update()
    final_lo, final_hi = bounds(objects)
    # La reducción puede cambiar los bordes: volver a apoyar la malla final.
    correction = Vector((-(final_lo.x + final_hi.x) / 2, -(final_lo.y + final_hi.y) / 2, -final_lo.z))
    for o in objects:
        o.location += correction
    bpy.context.view_layer.update()
    final_lo, final_hi = bounds(objects)
    final_triangles = triangles(objects)
    if abs(final_lo.z) > 1e-5:
        raise ValueError('No se pudo situar el origen en la base del objeto.')
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for o in objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
                              export_extras=True, export_texcoords=preserve_textures, export_animations=False,
                              export_cameras=False, export_lights=False)
    if transparent_materials:
        # Blender 5.2 exporta alpha como BLEND; restaurar MASK y su umbral original.
        glb = output.read_bytes()
        json_length = struct.unpack_from('<I', glb, 12)[0]
        exported = json.loads(glb[20:20+json_length])
        for material in exported.get('materials', []):
            original = transparent_materials.get(material.get('name', '').removeprefix('SpanStories_'))
            if original:
                material['alphaMode'] = original.get('alphaMode', 'MASK')
                if material['alphaMode'] == 'MASK':
                    material['alphaCutoff'] = original.get('alphaCutoff', .5)
        encoded = json.dumps(exported, separators=(',', ':')).encode('utf-8')
        encoded += b' ' * (-len(encoded) % 4)
        tail = glb[20+json_length:]
        output.write_bytes(struct.pack('<4sIIII', b'glTF', 2, 20+len(encoded)+len(tail), len(encoded), 0x4E4F534A)+encoded+tail)
    report = {
        'original_bytes': source.stat().st_size, 'output_bytes': output.stat().st_size,
        'original_triangles': original_triangles, 'object_triangles_before': sofa_triangles_before,
        'output_triangles': final_triangles, 'dimensions': [round(v, 4) for v in final_hi - final_lo],
        'removed': removed, 'materials': len(material_cache), 'parts': [o.name for o in objects],
        'warnings': warnings, 'scale_factor': factor, 'colors': colors,
        'alpha_materials': list(transparent_materials),
        'texture_changes': texture_changes, 'protected_planes': protected_parts,
        'base_z': round(final_lo.z, 6), 'no_baked_lighting': True,
    }
    output.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('SPANSTORIES_OK', json.dumps(report), flush=True)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    source, output, config = map(Path, args)
    try:
        convert(source, output, json.loads(config.read_text(encoding='utf-8')))
    except Exception as exc:
        output.with_suffix('.error.json').write_text(json.dumps({'error': str(exc)}, ensure_ascii=False), encoding='utf-8')
        print('SPANSTORIES_ERROR', str(exc), flush=True)
        sys.exit(1)
