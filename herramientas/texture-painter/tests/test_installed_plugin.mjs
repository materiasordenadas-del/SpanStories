import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const installed=process.argv[2];if(!installed)throw Error('Installed plugin path required');
const expected=JSON.parse(await fs.readFile(path.join(installed,'plugin.json'),'utf8')).version;
const child=spawn(process.execPath,[path.join(installed,'server','index.mjs')],{stdio:['pipe','pipe','pipe'],windowsHide:true});
const requests=[{id:1,method:'initialize',params:{protocolVersion:'2024-11-05'}},{id:2,method:'tools/list'},{id:3,method:'tools/call',params:{name:'painter_help',arguments:{}}},{id:4,method:'tools/call',params:{name:'start_painting',arguments:{object_name:process.argv[3]||'Lamine'}}}];
let buffer='',responses=[];
const done=new Promise((resolve,reject)=>{
 child.on('error',reject);child.stderr.on('data',d=>process.stderr.write(d));
 child.stdout.on('data',data=>{buffer+=data;let end;while((end=buffer.indexOf('\n'))>=0){responses.push(JSON.parse(buffer.slice(0,end)));buffer=buffer.slice(end+1);if(responses.length===requests.length)resolve();}});
});
const timeout=setTimeout(()=>{child.kill();throw Error('Installed MCP timeout');},30000);
for(const r of requests)child.stdin.write(JSON.stringify({jsonrpc:'2.0',...r})+'\n');
await done;clearTimeout(timeout);child.stdin.end();
const get=id=>responses.find(r=>r.id===id)?.result;
if(get(1)?.serverInfo?.version!==expected)throw Error('Installed server version mismatch');
if(get(2)?.tools?.length!==4)throw Error('Simple tool contract changed');
const help=JSON.parse(get(3).content[0].text);
if(help.version!==expected||!help.self_improvement?.required)throw Error('Installed agent policy missing');
const live=get(4);let context=null,editGuard=false;
if(live.isError){editGuard=live.content[0].text.includes('Sal del modo de edición');if(!editGuard)throw Error(JSON.stringify(live));}
else {context=JSON.parse(live.content[0].text);if(context.addon_version!==expected||!context.self_improvement?.required)throw Error('Active Blender add-on version/policy mismatch');}
const result={passed:true,server_version:get(1).serverInfo.version,tools:4,mandatory_policy:true,live_bridge_connected:true,user_edit_mode_guard:editGuard,addon_version:context?.addon_version||null};
await fs.writeFile(path.join(root,'evidence',`installed-plugin-${expected}.json`),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
