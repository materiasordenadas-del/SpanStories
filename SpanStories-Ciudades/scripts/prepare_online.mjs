import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..');
const zone=path.join(root,'Mundo/Paises/Espana/Ciudades/Barcelona/Zonas/PasseigGracia');
const manifestPath=path.join(zone,'zona.json');
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
const report={method:'gzip lossless; browser decompression; content SHA256 cache keys',sectors:[],sourceBytes:0,transferBytes:0};
for(const sector of manifest.sectors){
  const file=path.join(zone,sector.url),source=fs.readFileSync(file);
  const hash=crypto.createHash('sha256').update(source).digest('hex');
  const packed=file+'.gz';let compressed;
  if(fs.existsSync(packed)&&fs.statSync(packed).mtimeMs>=fs.statSync(file).mtimeMs)compressed=fs.readFileSync(packed);
  else {compressed=zlib.gzipSync(source,{level:9});fs.writeFileSync(packed,compressed);}
  assert.ok(zlib.gunzipSync(compressed).equals(source),'Online compression changed GLB '+sector.id);
  sector.gzipUrl=sector.url+'.gz?v='+hash.slice(0,16);
  sector.sha256=hash;sector.transferBytes=compressed.length;
  report.sourceBytes+=source.length;report.transferBytes+=compressed.length;
  report.sectors.push({id:sector.id,bytes:source.length,transferBytes:compressed.length,sha256:hash,losslessVerified:true});
  console.log('ONLINE_SECTOR',JSON.stringify(report.sectors.at(-1)));
}
manifest.online={encoding:'gzip',fallback:'original GLB',totalTransferBytes:report.transferBytes};
fs.writeFileSync(manifestPath,JSON.stringify(manifest));
fs.writeFileSync(path.join(root,'reports/barcelona-online.json'),JSON.stringify(report,null,2));
const charactersPath=path.join(root,'Mundo/Personajes/personajes.json');
const characters=JSON.parse(fs.readFileSync(charactersPath,'utf8'));
for(const character of characters.characters){
  if(/^https?:/.test(character.url))continue;
  const file=path.resolve(path.dirname(charactersPath),character.url),source=fs.readFileSync(file),hash=crypto.createHash('sha256').update(source).digest('hex');
  const compressed=zlib.gzipSync(source,{level:9});assert.ok(zlib.gunzipSync(compressed).equals(source));fs.writeFileSync(file+'.gz',compressed);
  character.gzipUrl=character.url+'.gz?v='+hash.slice(0,16);character.sha256=hash;character.transferBytes=compressed.length;
  console.log('ONLINE_CHARACTER',JSON.stringify({id:character.id,sourceBytes:source.length,transferBytes:compressed.length}));
}
fs.writeFileSync(charactersPath,JSON.stringify(characters));
console.log('ONLINE_TOTAL',JSON.stringify({sourceBytes:report.sourceBytes,transferBytes:report.transferBytes}));
