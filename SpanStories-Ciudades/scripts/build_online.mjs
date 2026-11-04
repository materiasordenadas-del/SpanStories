import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const web=process.argv.includes('--web');
const root=path.resolve(import.meta.dirname,'..'),output=path.join(root,web?'dist-web':'dist-online');
const marker=path.join(output,'package-info.json');
if(fs.existsSync(output)&&!fs.existsSync(marker))throw Error('Output folder is not an owned online build');
fs.mkdirSync(output,{recursive:true});
const visited=new Set(),files=[];
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
function copy(file){
  file=path.resolve(file);assert.ok(file.startsWith(root+path.sep),'Dependency outside project');
  if(visited.has(file))return;visited.add(file);
  const relative=path.relative(root,file),destination=path.join(output,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});
  if(path.extname(file)!=='.json'){
    if(web&&relative==='main.js'){
      let source=fs.readFileSync(file,'utf8').replace("new URLSearchParams(location.search).has('aprendizaje')",'true');
      source=source.replace(/const exploracion=.*?;/,'const exploracion=false;');
      source=source.replace("new URLSearchParams(location.search).has('dev')",'false');
      for(const module of ['./engine/CityEditor.js','./engine/CityNavigation.js','./panel/PanelEstilo.js','./engine/NarrativaEditor.js'])source=source.replaceAll(`await import('${module}')`,'{}');
      fs.writeFileSync(destination,source);
    }else if(web&&relative==='index.html'){
      let html=fs.readFileSync(file,'utf8').replace('<body>','<body data-modo="aprendizaje">');
      html=html.replace(/<div class="toolbar"[\s\S]*?<\/div><button id="panel-toggle"[\s\S]*?<\/button>/,'');
      html=html.replace(/<aside id="panel"[\s\S]*?<\/aside>/,'<aside id="panel" hidden><select id="zone" hidden></select><span id="status" role="status"></span></aside>');
      html=html.replace('<link rel="stylesheet" href="panel/panel.css">','<link rel="stylesheet" href="web-base.css">');
      fs.writeFileSync(destination,html);
    }else fs.copyFileSync(file,destination);
    files.push(relative);return;
  }
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
      if(['manifest','lexicon','url','gzipUrl','characters','stories','sharedResources'].includes(key)&&typeof child==='string'&&!/^https?:|^data:/.test(child)){
        const ref=path.resolve(path.dirname(file),child.split('?')[0]);if(fs.existsSync(ref)&&fs.statSync(ref).isFile())copy(ref);
      }else refs(child);
    }}
  };
  refs(data);
}
for(const file of ['index.html','city.css','main.js','routes.js','serve.py','ONLINE.md'])copy(path.join(root,file));
for(const folder of ['engine','panel','vendor','builders','objetos']){
  if(web&&folder==='panel')continue;
  const walk=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name);
    if(web&&['CityEditor.js','CityNavigation.js','NarrativaEditor.js','Objetos.js'].includes(entry.name))continue;
    if(entry.isDirectory())walk(file);
    else if(/\.(js|css|wasm)$/.test(entry.name)||
      (path.relative(root,file).split(path.sep).join('/').startsWith('engine/Estilos/')&&/\.(png|jpe?g|webp)$/.test(entry.name)))copy(file);
  }};walk(path.join(root,folder));
}
copy(path.join(root,'Mundo/mundo.json'));
// Empaquetar la fuente canónica: las distribuciones son artefactos generados,
// nunca otra versión editable de los estilos.
const sharedRoot=path.resolve(root,'../../../Generador-Mundos/src/estudio/render');
for(const name of ['pipeline.js','ghibli.js','dispatch.js','commerce-blender-pass.js','style-pool.js',
  'ghibli-assets/nube-ghibli-alta.png','ghibli-assets/nube-ghibli-compacta.png','ghibli-assets/nube-ghibli-alargada.png']){
  const relative=path.join('shared-styles',name),destination=path.join(output,relative);
  fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(sharedRoot,name),destination);files.push(relative);
}
// The decoration library is independent of sector GLBs; ship only runtime dependencies.
for(const file of ['layout.json','tree-lods.json','anime_nature_tree_01.glb','anime_tree_2.glb','jabami_anime_tree_v1.glb','sakura_tree_01.glb','props.glb'])copy(path.join(root,'assets/barcelona-decor',file));
copy(path.join(root,'vendor/ez-tree/LICENSE'));
if(web){
  fs.writeFileSync(path.join(output,'web-base.css'),'html,body{margin:0;height:100%;background:#0e1b27;color:#eff5f7;font:15px system-ui}header{height:52px;box-sizing:border-box;padding:14px 20px;display:flex;justify-content:space-between}main{height:calc(100dvh - 52px)}#viewport{position:relative;width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}');files.push('web-base.css');
  for(const file of ['engine/CityEditor.js','engine/CityNavigation.js','engine/NarrativaEditor.js','panel/PanelEstilo.js'])assert.ok(!fs.existsSync(path.join(output,file)),`Exclusive development module shipped: ${file}`);
}
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
  mode:web?'web':'development',
  bytes:uniqueFiles.reduce((n,file)=>n+fs.statSync(path.join(output,file)).size,0),
  excludes:['Blender sources','backups','raw/baseline/dedup GLB intermediates','reports','local source paths in manifests'],
  compression:'Versioned gzip URLs decoded in the browser; original GLB fallback',hosting:'HTTP(S) assets plus same-origin /api/room relay; HTTPS for production',
  multiplayer:{protocol:1,maxPlayers:2,relay:'serve.py',localProfile:'online',deployment:'not deployed'}};
fs.writeFileSync(marker,JSON.stringify(info,null,2));
console.log(JSON.stringify({...info,output,packageCommand:'python scripts/package_online.py'}));
