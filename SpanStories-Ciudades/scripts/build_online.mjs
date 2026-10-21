import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,'dist-online');
const marker=path.join(output,'package-info.json');
if(fs.existsSync(output)&&!fs.existsSync(marker))throw Error('Output folder is not an owned online build');
fs.mkdirSync(output,{recursive:true});
const visited=new Set(),files=[];
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function copy(file){
  file=path.resolve(file);assert.ok(file.startsWith(root+path.sep),'Dependency outside project');
  if(visited.has(file))return;visited.add(file);
  const relative=path.relative(root,file),destination=path.join(output,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});
  if(path.extname(file)!=='.json'){fs.copyFileSync(file,destination);files.push(relative);return;}
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  delete data.source;delete data.baseline;
  for(const character of data.characters||[])delete character.source;
  if(data.sectors){
    for(const sector of data.sectors){
      const asset=path.resolve(path.dirname(file),sector.url.split('?')[0]),bytes=fs.readFileSync(asset),hash=sha(bytes);
      copy(asset);
      const destinationAsset=path.join(output,path.relative(root,asset));
      const sourceGzip=asset+'.gz',gzip=fs.existsSync(sourceGzip)?fs.readFileSync(sourceGzip):zlib.gzipSync(bytes,{level:9});
      assert.ok(zlib.gunzipSync(gzip).equals(bytes));fs.writeFileSync(destinationAsset+'.gz',gzip);files.push(path.relative(output,destinationAsset+'.gz'));
      sector.sha256=hash;sector.gzipUrl=sector.url+'.gz?v='+hash.slice(0,16);sector.transferBytes=gzip.length;
    }
    data.online={encoding:'gzip',totalTransferBytes:data.sectors.reduce((n,s)=>n+s.transferBytes,0)};
  }
  fs.writeFileSync(destination,JSON.stringify(data));files.push(relative);
  const refs=value=>{
    if(Array.isArray(value)){for(const child of value)refs(child);return;}
    if(value&&typeof value==='object'){for(const [key,child] of Object.entries(value)){
      if(['manifest','url','gzipUrl','characters','stories','sharedResources'].includes(key)&&typeof child==='string'&&!/^https?:|^data:/.test(child)){
        const ref=path.resolve(path.dirname(file),child.split('?')[0]);if(fs.existsSync(ref)&&fs.statSync(ref).isFile())copy(ref);
      }else refs(child);
    }}
  };
  refs(data);
}
for(const file of ['index.html','city.css','main.js','routes.js','serve.py','ONLINE.md'])copy(path.join(root,file));
for(const folder of ['engine','panel','vendor','builders','objetos']){
  const walk=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);else if(/\.(js|css|wasm)$/.test(entry.name))copy(file);
  }};walk(path.join(root,folder));
}
copy(path.join(root,'Mundo/mundo.json'));
// The decoration library is independent of sector GLBs; ship only runtime dependencies.
for(const file of ['layout.json','tree-lods.json','anime_nature_tree_01.glb','anime_tree_2.glb','jabami_anime_tree_v1.glb','sakura_tree_01.glb','props.glb'])copy(path.join(root,'assets/barcelona-decor',file));
copy(path.join(root,'vendor/ez-tree/LICENSE'));
for(const file of [...new Set(files)])if(/\.(html|css|js|json|wasm)$/.test(file)){
  const data=fs.readFileSync(path.join(output,file)),gzip=zlib.gzipSync(data,{level:9});
  fs.writeFileSync(path.join(output,file+'.gz'),gzip);files.push(file+'.gz');
}
fs.writeFileSync(path.join(output,'.htaccess'),`<IfModule mod_headers.c>
  Header set Cache-Control "no-cache"
  <FilesMatch "\\.glb(\\.gz)?$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/json application/wasm
</IfModule>
AddType application/gzip .gz
AddType model/gltf-binary .glb
AddType application/wasm .wasm
`);
const uniqueFiles=[...new Set(files)];
const info={id:'spanstories-online-build',at:new Date().toISOString(),files:uniqueFiles.length+2,
  bytes:uniqueFiles.reduce((n,file)=>n+fs.statSync(path.join(output,file)).size,0),
  excludes:['Blender sources','backups','raw/baseline/dedup GLB intermediates','reports','local source paths in manifests'],
  compression:'Versioned gzip URLs decoded in the browser; original GLB fallback',hosting:'HTTP(S) assets plus same-origin /api/room relay; HTTPS for production',
  multiplayer:{protocol:1,maxPlayers:2,relay:'serve.py',localProfile:'online',deployment:'not deployed'}};
fs.writeFileSync(marker,JSON.stringify(info,null,2));
console.log(JSON.stringify({...info,output,packageCommand:'python scripts/package_online.py'}));
