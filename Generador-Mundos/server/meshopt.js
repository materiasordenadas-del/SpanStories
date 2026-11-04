import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
// Sin cuantización, filtros con pérdida ni reordenación: posiciones, colores e IDs se conservan.
export async function compressGlb(input){
  await Promise.all([MeshoptEncoder.ready,MeshoptDecoder.ready]);
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
  const doc=await io.readBinary(new Uint8Array(input));doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  const compressed=await io.writeBinary(doc);return compressed.byteLength<input.byteLength?{bytes:compressed,compression:'meshopt-lossless'}:{bytes:input,compression:'none'};
}
