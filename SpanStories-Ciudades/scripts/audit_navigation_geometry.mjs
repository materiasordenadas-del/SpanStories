// Read-only audit of the actual viewer GLBs. Never opens Blender or writes assets.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readGlb } from './export_compress.mjs';

const project = path.resolve(import.meta.dirname, '..');
const zone = path.join(project, 'Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia');
const manifestPath = path.join(zone, 'zona.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestHash = hash(manifestPath);
const pilotPrefix = 'BCNgen_L-MB1-001_';
const pilot = [], sectors = [], ids = new Set(), duplicates = [], materialNames = new Set();
const exteriorCategories = new Set(['fachada_independiente', 'envolvente_exterior', 'cubierta_simple']);

for (const sector of manifest.sectors) {
  const file = path.resolve(zone, sector.url);
  if (!file.startsWith(zone + path.sep)) throw new Error('Asset outside the selected zone');
  const sha256 = hash(file);
  if (sector.sha256 && sector.sha256 !== sha256) throw new Error('Viewer asset changed: ' + sector.id);
  const { document: doc } = readGlb(file);
  const categories = {}, references = new Set(), meshes = new Set(), materials = new Set();
  let triangles = 0, primitives = 0;
  for (const node of doc.nodes || []) {
    const id = node.extras?.ssId;
    if (id) { if (ids.has(id)) duplicates.push(id); ids.add(id); }
    if (node.mesh === undefined) continue;
    const mesh = doc.meshes[node.mesh], category = node.extras?.ss_categoria || 'UNKNOWN';
    categories[category] = (categories[category] || 0) + 1;
    meshes.add(node.mesh);
    let nodeTriangles = 0;
    for (const primitive of mesh.primitives) {
      const count = doc.accessors[primitive.indices ?? primitive.attributes.POSITION].count;
      if ((primitive.mode ?? 4) !== 4) throw new Error('Non-triangle primitive requires explicit audit');
      nodeTriangles += count / 3;
      if (primitive.material !== undefined) materials.add(primitive.material);
      for (const index of [...Object.values(primitive.attributes), primitive.indices].filter(x => x !== undefined))
        references.add(doc.accessors[index].bufferView);
    }
    triangles += nodeTriangles; primitives += mesh.primitives.length;
    if (node.name?.startsWith(pilotPrefix)) {
      const names = [...new Set(mesh.primitives.filter(p => p.material !== undefined)
        .map(p => doc.materials[p.material].name))];
      names.forEach(name => materialNames.add(name));
      pilot.push({ id, name: node.name, sector: sector.id, category,
        classification: exteriorCategories.has(category) ? 'EXTERIOR' : 'UNKNOWN',
        interiorFaceClassification: 'UNKNOWN', exclude: false,
        reason: 'No independent interior has been certified; preserve all faces, including window reveals and component backs.',
        mesh: node.mesh, triangles: nodeTriangles, primitives: mesh.primitives.length,
        materials: names, parentId: node.extras?.ssParentId || null,
        transform: Object.fromEntries(['matrix', 'translation', 'rotation', 'scale']
          .filter(k => node[k] !== undefined).map(k => [k, node[k]])),
        previousBackRemovalFlag: Boolean(node.extras?.ss_respaldo_oculto_eliminado) });
    }
  }
  const external = [...(doc.buffers || []), ...(doc.images || [])]
    .filter(x => x.uri && !x.uri.startsWith('data:')).map(x => x.uri);
  sectors.push({ id: sector.id, url: sector.url, sha256, bytes: fs.statSync(file).size,
    nodes: doc.nodes.length, uniqueMeshes: meshes.size, materials: materials.size,
    nodeTriangles: triangles, nodePrimitives: primitives, categories,
    referencedGeometryViewBytes: [...references].reduce((sum, i) => sum + (doc.bufferViews[i]?.byteLength || 0), 0),
    externalDependencies: external, interiorObjectsCertified: 0 });
}
if (duplicates.length) throw new Error('Duplicate stable IDs: ' + duplicates.join(','));
if (pilot.length !== 5) throw new Error('Pilot changed; review it before reusing this report');
if (hash(manifestPath) !== manifestHash) throw new Error('Manifest changed during inspection');
for (const sector of sectors)
  if (hash(path.resolve(zone, sector.url)) !== sector.sha256) throw new Error('Asset changed during inspection');

const runtimePath = path.join(project, 'reports/barcelona-interior-audit-runtime.json');
const runtime = fs.existsSync(runtimePath) ? JSON.parse(fs.readFileSync(runtimePath, 'utf8')) : null;
const report = {
  status: 'NO_SAFE_INTERIOR_EXCLUSION_IDENTIFIED', scope: 'Existing viewer GLBs only',
  manifestPath, manifestSha256: manifestHash, originalAssetsUnchangedDuringAudit: true,
  stableIds: ids.size, duplicateIds: duplicates, sectors,
  pilot: { lot: 'L-MB1-001', objects: pilot.length,
    meshes: new Set(pilot.map(p => p.sector + ':' + p.mesh)).size,
    triangles: pilot.reduce((sum, p) => sum + p.triangles, 0), materials: [...materialNames], nodes: pilot,
    interiorObjectsCertified: 0, excludedTriangles: 0 },
  runtime,
  implementedOptimization: false, generatedExteriorAsset: false,
  limitations: [
    'Metadata inventory is not proof that every unknown mesh is free of interior faces.',
    'EXTERIOR describes the object role, not proof that every face is exterior.',
    'UNKNOWN faces are retained; no normal-only or single-camera exclusion.',
    'Runtime FPS is the existing median-based metric, not average or minimum FPS.',
    'Runtime loadMs combines transfer, decoding, adaptation and batching.',
    'No A/B visual, editor or optimized-network verification exists because no candidate was generated.'
  ]
};
fs.writeFileSync(path.join(project, 'reports/barcelona-interior-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({status:report.status,pilotTriangles:report.pilot.triangles,
  pilotMaterials:report.pilot.materials.length,stableIds:ids.size,originalAssetsUnchanged:true}));
