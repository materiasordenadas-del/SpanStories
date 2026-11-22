import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { MeshoptEncoder } from './vendor/meshopt_encoder.js';
import { MeshoptDecoder } from '../vendor/meshopt_decoder.module.js';

const project = process.env.SPANSTORIES_EXPORT_PROJECT || path.resolve(import.meta.dirname, '..');
const zone = path.join(project, 'Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia');
const componentBytes = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const components = {SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16};

export function readGlb(file) {
  const data = fs.readFileSync(file);
  assert.equal(data.readUInt32LE(0), 0x46546c67);
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const jsonSize = data.readUInt32LE(12);
  assert.equal(data.readUInt32LE(16), 0x4e4f534a);
  const document = JSON.parse(data.subarray(20, 20 + jsonSize).toString('utf8'));
  const offset = 20 + jsonSize;
  assert.equal(data.readUInt32LE(offset + 4), 0x004e4942);
  return {document, binary:data.subarray(offset + 8, offset + 8 + data.readUInt32LE(offset))};
}

export function writeGlb(file, document, binary) {
  const js = Buffer.from(JSON.stringify(document));
  const jsonPadding = Buffer.alloc((4 - js.length % 4) % 4, 32);
  const binaryPadding = Buffer.alloc((4 - binary.length % 4) % 4);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + js.length + jsonPadding.length + binary.length + binaryPadding.length, 8);
  header.writeUInt32LE(js.length + jsonPadding.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(binary.length + binaryPadding.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(file, Buffer.concat([header, js, jsonPadding, binHeader, binary, binaryPadding]));
}

async function compress(input, output) {
  const begin = performance.now();
  const {document, binary} = readGlb(input);
  const chunks = [];
  let byteOffset = 0, fallbackOffset = 0, verifiedViews = 0;
  const accessorByView = new Map();
  for (const accessor of document.accessors) accessorByView.set(accessor.bufferView, accessor);
  function append(data) {
    const offset = byteOffset;
    const padding = Buffer.alloc((4 - data.length % 4) % 4);
    chunks.push(data, padding); byteOffset += data.length + padding.length;
    return offset;
  }
  for (let index = 0; index < document.bufferViews.length; index++) {
    const view = document.bufferViews[index];
    const source = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    const accessor = accessorByView.get(index);
    const stride = accessor && (view.byteStride || componentBytes[accessor.componentType] * components[accessor.type]);
    const isIndex = view.target === 34963;
    if (accessor && ((isIndex && (stride === 2 || stride === 4)) || (!isIndex && stride % 4 === 0 && stride <= 256))) {
      // INDICES preserves exact index order, including triangle winding/order.
      const mode = isIndex ? 'INDICES' : 'ATTRIBUTES';
      const encoded = Buffer.from(MeshoptEncoder.encodeGltfBuffer(source, accessor.count, stride, mode, 0));
      const decoded = new Uint8Array(source.length);
      MeshoptDecoder.decodeGltfBuffer(decoded, accessor.count, stride, encoded, mode, 'NONE');
      assert.ok(source.equals(Buffer.from(decoded)), `Lossless verification failed for view ${index}`);
      verifiedViews++;
      const offset = append(encoded);
      view.buffer = 1;
      view.byteOffset = fallbackOffset;
      fallbackOffset += view.byteLength + ((4 - view.byteLength % 4) % 4);
      view.extensions = {...view.extensions, EXT_meshopt_compression:{buffer:0, byteOffset:offset, byteLength:encoded.length, byteStride:stride, count:accessor.count, mode, filter:'NONE'}};
    } else {
      view.buffer = 0;
      view.byteOffset = append(source);
    }
  }
  document.extensionsUsed = [...new Set([...(document.extensionsUsed || []), 'EXT_meshopt_compression'])];
  document.extensionsRequired = [...new Set([...(document.extensionsRequired || []), 'EXT_meshopt_compression'])];
  document.buffers = [{byteLength:byteOffset}, {byteLength:fallbackOffset, extensions:{EXT_meshopt_compression:{fallback:true}}}];
  document.asset.extras.ssCompression = 'Meshopt v0 lossless ATTRIBUTES/INDICES; decoder byte verification';
  writeGlb(output, document, Buffer.concat(chunks));
  return {inputBytes:fs.statSync(input).size, compressedBytes:fs.statSync(output).size, verifiedViews, uncompressedGeometryBytes:fallbackOffset, durationSeconds:(performance.now() - begin) / 1000};
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const manifest = JSON.parse(fs.readFileSync(path.join(zone, 'zona.raw.json'), 'utf8'));
  const report = [];
  for (const sector of manifest.sectors) {
    const result = {id:sector.id, ...await compress(path.join(zone, 'assets', sector.id + '.dedup.glb'), path.join(zone, 'assets', sector.id + '.glb'))};
    sector.bytes = result.compressedBytes;
    sector.geometryBytesEstimated = result.uncompressedGeometryBytes;
    report.push(result);
    console.log('CITY_COMPRESSED', JSON.stringify(result));
  }
  const offlineReport = JSON.parse(fs.readFileSync(path.join(project, 'reports', 'export-optimization.json'), 'utf8'));
  for (const sector of manifest.sectors) {
    const stats = offlineReport.sectors.find(item => item.id === sector.id);
    sector.optimization = {verticesBefore:stats.verticesBefore, verticesAfter:stats.verticesAfter, triangles:stats.trianglesPreserved, outlineFormat:stats.outlineFormat, exactWeldVerified:stats.exactWeldVerified};
  }
  manifest.optimization = {geometryLossless:true, method:'exact vertex weld + content deduplication + Meshopt v0 lossless; added outline vectors signed-byte normalized', outlineComponentErrorBound:1/254, extensionsRequired:['EXT_meshopt_compression'], totalBytes:manifest.sectors.reduce((sum, sector) => sum + sector.bytes, 0)};
  fs.writeFileSync(path.join(zone, 'zona.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(project, 'reports', 'export-compression.json'), JSON.stringify({sectors:report,totalCompressedBytes:manifest.optimization.totalBytes,baselineBytes:manifest.baseline.bytes,geometryAndIdentityPreserved:true}, null, 2));
}
