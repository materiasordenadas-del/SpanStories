"""Describe decoded buffer and texture memory without claiming measured VRAM."""
import json
import os
import struct
from export_optimize import PROJECT, ZONE, read_glb

def main():
    path = os.path.join(ZONE, 'zona.json')
    with open(path, encoding='utf8') as stream:
        manifest = json.load(stream)
    unique_images = {}
    for sector in manifest['sectors']:
        doc, binary = read_glb(os.path.join(ZONE, sector['url']))
        images = []
        for image in doc.get('images', []):
            view = doc['bufferViews'][image['bufferView']]
            data = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
            assert bytes(data[:8]) == b'\x89PNG\r\n\x1a\n', 'Texture dimensions require PNG or explicit decoder'
            width, height = struct.unpack_from('>II', data, 16)
            mip_pixels = 0
            w, h = width, height
            while True:
                mip_pixels += w * h
                if w == 1 and h == 1:
                    break
                w, h = max(1, w // 2), max(1, h // 2)
            item = {'id': image['extras']['ssTexture'], 'name': image.get('name', ''), 'width': width, 'height': height, 'encodedBytes': view['byteLength'], 'rgba8WithMipsBytesEstimated': mip_pixels * 4}
            images.append(item)
            unique_images[item['id']] = item
        sector['textures'] = images
        sector['textureBytesEstimated'] = sum(image['rgba8WithMipsBytesEstimated'] for image in images)
        sector['memoryBytesEstimated'] = sector['geometryBytesEstimated'] + sector['textureBytesEstimated']
    resource_report = {'method': 'Unique decoded GLB bufferViews (including normalized outline stride4 and every UV/color channel) + PNG dimensions RGBA8 full mip chain. Does not include driver overhead, shader programs, shadow/render targets or CPU copies; not measured VRAM.', 'geometryBytesAllSectorsEstimated': sum(sector['geometryBytesEstimated'] for sector in manifest['sectors']), 'textureBytesAllUniqueEstimated': sum(image['rgba8WithMipsBytesEstimated'] for image in unique_images.values()), 'imagesUnique': list(unique_images.values()), 'sectors': [{'id': sector['id'], 'geometryBytesEstimated': sector['geometryBytesEstimated'], 'textureBytesEstimated': sector['textureBytesEstimated'], 'memoryBytesEstimated': sector['memoryBytesEstimated']} for sector in manifest['sectors']]}
    resource_report['memoryBytesAllEstimatedWithTextureCache'] = resource_report['geometryBytesAllSectorsEstimated'] + resource_report['textureBytesAllUniqueEstimated']
    manifest['memoryEstimateMethod'] = resource_report['method']
    with open(path, 'w', encoding='utf8') as stream:
        json.dump(manifest, stream, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(PROJECT, 'reports', 'export-resources.json'), 'w', encoding='utf8') as stream:
        json.dump(resource_report, stream, ensure_ascii=False, indent=2)
    print(json.dumps({key: resource_report[key] for key in ('geometryBytesAllSectorsEstimated', 'textureBytesAllUniqueEstimated', 'memoryBytesAllEstimatedWithTextureCache')}, ensure_ascii=False))

if __name__ == '__main__':
    main()
