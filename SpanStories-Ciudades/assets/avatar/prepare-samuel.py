"""Create a web derivative of the existing Samuel rig; never write the source.

Geometry, names, skins, pivots, morph targets and animation channels are copied.
Only redundant animation clips, PBR-only maps and texture resolution change.
"""
import copy
import hashlib
import io
import json
from pathlib import Path
import struct
from PIL import Image

SOURCE = Path(r"D:\Español\imagen para animación\Animación 3D\personajes\samuel\Samuel_con_rostro_manos.glb")
DESTINATION = Path(__file__).parent / "Samuel.glb"
KEEP_CLIPS = {"Walking", "restpose", "Samuel_Juan_Facial_Eyebrows", "Samuel_Juan_Facial_Eyes", "Samuel_Juan_Facial_Mouth"}
MAX_TEXTURE_SIZE = 2048


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


source_hash = digest(SOURCE)
raw = SOURCE.read_bytes()
magic, version, total = struct.unpack_from("<III", raw)
assert magic == 0x46546C67 and version == 2 and total == len(raw)
json_size, json_type = struct.unpack_from("<II", raw, 12)
assert json_type == 0x4E4F534A
original = json.loads(raw[20:20 + json_size])
binary_size, binary_type = struct.unpack_from("<II", raw, 20 + json_size)
assert binary_type == 0x004E4942
binary = raw[28 + json_size:28 + json_size + binary_size]
data = copy.deepcopy(original)
data["animations"] = [a for a in data.get("animations", []) if a.get("name") in KEEP_CLIPS]
assert any(a.get("name") == "Walking" for a in data["animations"])

# The shared city shader is matte toon. PBR-only maps would consume VRAM
# without affecting the intended result; keep albedo, normal and alpha.
for material in data.get("materials", []):
    pbr = material.setdefault("pbrMetallicRoughness", {})
    pbr.pop("metallicRoughnessTexture", None)
    pbr["metallicFactor"] = 0
    pbr["roughnessFactor"] = 1
    if "extensions" in material:
        material["extensions"].pop("KHR_materials_specular", None)
        if not material["extensions"]:
            material.pop("extensions")
for key in ("extensionsUsed", "extensionsRequired"):
    if key in data:
        data[key] = [e for e in data[key] if e != "KHR_materials_specular"]
        if not data[key]:
            data.pop(key)


def texture_infos(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith("Texture") and isinstance(item, dict) and "index" in item:
                yield item
            else:
                yield from texture_infos(item)
    elif isinstance(value, list):
        for item in value:
            yield from texture_infos(item)


infos = list(texture_infos(data["materials"]))
used_textures = sorted({info["index"] for info in infos})
texture_map = {old: new for new, old in enumerate(used_textures)}
data["textures"] = [data["textures"][old] for old in used_textures]
for info in infos:
    info["index"] = texture_map[info["index"]]
used_images = sorted({texture["source"] for texture in data["textures"]})
image_map = {old: new for new, old in enumerate(used_images)}
data["images"] = [data["images"][old] for old in used_images]
for texture in data["textures"]:
    texture["source"] = image_map[texture["source"]]

replacements = {}
image_report = []
for image in data["images"]:
    view = data["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    source_pixels = Image.open(io.BytesIO(binary[start:start + view["byteLength"]]))
    before_size = list(source_pixels.size)
    pixels = source_pixels.convert("RGBA")
    pixels.thumbnail((MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE), Image.Resampling.LANCZOS)
    opaque = pixels.getchannel("A").getextrema() == (255, 255)
    normal = "normal" in image.get("name", "").lower()
    output = io.BytesIO()
    if opaque and not normal:
        pixels.convert("RGB").save(output, format="JPEG", quality=95, subsampling=0)
        image["mimeType"] = "image/jpeg"
    else:
        (pixels.convert("RGB") if opaque else pixels).save(output, format="PNG", optimize=True)
        image["mimeType"] = "image/png"
    replacements[image["bufferView"]] = output.getvalue()
    image_report.append({"name": image.get("name"), "sourceSize": before_size,
                         "size": list(pixels.size), "sourceBytes": view["byteLength"],
                         "bytes": len(output.getvalue()), "mimeType": image["mimeType"]})

accessor_refs = []
for mesh in data["meshes"]:
    for primitive in mesh["primitives"]:
        accessor_refs.extend((primitive["attributes"], key) for key in primitive["attributes"])
        if "indices" in primitive:
            accessor_refs.append((primitive, "indices"))
        for target in primitive.get("targets", []):
            accessor_refs.extend((target, key) for key in target)
for skin in data.get("skins", []):
    if "inverseBindMatrices" in skin:
        accessor_refs.append((skin, "inverseBindMatrices"))
for animation in data["animations"]:
    for sampler in animation["samplers"]:
        accessor_refs.extend([(sampler, "input"), (sampler, "output")])
used_accessors = sorted({owner[key] for owner, key in accessor_refs})
accessor_map = {old: new for new, old in enumerate(used_accessors)}
data["accessors"] = [data["accessors"][old] for old in used_accessors]
for owner, key in accessor_refs:
    owner[key] = accessor_map[owner[key]]

view_refs = [(image, "bufferView") for image in data["images"]]
for accessor in data["accessors"]:
    if "bufferView" in accessor:
        view_refs.append((accessor, "bufferView"))
    for sparse in accessor.get("sparse", {}).values():
        if isinstance(sparse, dict) and "bufferView" in sparse:
            view_refs.append((sparse, "bufferView"))
used_views = sorted({owner[key] for owner, key in view_refs})
view_map = {old: new for new, old in enumerate(used_views)}
new_binary, new_views = bytearray(), []
for old in used_views:
    view = copy.deepcopy(data["bufferViews"][old])
    start = view.get("byteOffset", 0)
    payload = replacements.get(old, binary[start:start + view["byteLength"]])
    new_binary.extend(b"\0" * ((-len(new_binary)) % 4))
    view.update(buffer=0, byteOffset=len(new_binary), byteLength=len(payload))
    new_binary.extend(payload)
    new_views.append(view)
data["bufferViews"] = new_views
for owner, key in view_refs:
    owner[key] = view_map[owner[key]]
data["buffers"] = [{"byteLength": len(new_binary)}]
data.setdefault("asset", {}).setdefault("extras", {}).update({"spanstoriesDerivative": True, "sourceSha256": source_hash})
json_payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
json_payload += b" " * ((-len(json_payload)) % 4)
new_binary.extend(b"\0" * ((-len(new_binary)) % 4))
new_total = 12 + 8 + len(json_payload) + 8 + len(new_binary)
DESTINATION.parent.mkdir(parents=True, exist_ok=True)
with DESTINATION.open("wb") as out:
    out.write(struct.pack("<III", 0x46546C67, 2, new_total))
    out.write(struct.pack("<II", len(json_payload), 0x4E4F534A)); out.write(json_payload)
    out.write(struct.pack("<II", len(new_binary), 0x004E4942)); out.write(new_binary)
assert len(data["nodes"]) == len(original["nodes"])
assert len(data["meshes"]) == len(original["meshes"])
assert data["skins"][0]["joints"] == original["skins"][0]["joints"]
assert digest(SOURCE) == source_hash
report = {"source": str(SOURCE), "sourceSha256": source_hash,
          "sourceUnchanged": True, "output": str(DESTINATION),
          "outputSha256": digest(DESTINATION), "sourceBytes": len(raw), "bytes": new_total,
          "nodes": len(data["nodes"]), "meshes": len(data["meshes"]), "skins": len(data["skins"]),
          "animations": [a["name"] for a in data["animations"]], "images": image_report,
          "estimatedTextureRgbaMipBytesBefore": 3 * 4096 * 4096 * 4 * 4 / 3,
          "estimatedTextureRgbaMipBytesAfter": sum(i["size"][0] * i["size"][1] * 4 * 4 / 3 for i in image_report),
          "changes": ["unused animation buffers omitted", "albedo/normal max 2048", "matte materials omit metallic/specular texture", "albedo JPEG quality 95; normal/alpha PNG"],
          "limitations": ["texture estimate excludes geometry/renderer, not a measured GPU allocation", "visual integration must be checked in browser"]}
(DESTINATION.parent / "preparation.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
print(json.dumps(report, indent=2, ensure_ascii=False))
