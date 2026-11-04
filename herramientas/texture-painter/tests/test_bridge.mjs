import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const proc=spawn(process.execPath,[path.join(root,'codex-plugin/spanstories-texture-painter/server/index.mjs')],{stdio:['pipe','pipe','pipe'],windowsHide:true});
let buf='',responses=[];
proc.stdout.on('data',data=>{buf+=data.toString();let i;while((i=buf.indexOf('\n'))!==-1){responses.push(JSON.parse(buf.slice(0,i)));buf=buf.slice(i+1);}});
proc.stderr.on('data',d=>process.stderr.write(d));
const requests=[
 {id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1'}}},
 {id:2,method:'tools/list'},
 {id:3,method:'tools/call',params:{name:'painter_help',arguments:{}}},
 {id:4,method:'tools/call',params:{name:'start_painting',arguments:{object_name:'Lamine'}}}
];
for(const r of requests)proc.stdin.write(JSON.stringify({jsonrpc:'2.0',...r})+'\n');
const timeout=setTimeout(()=>{proc.kill();throw Error('MCP timeout');},25000);
await new Promise((resolve,reject)=>{
 const interval=setInterval(()=>{if(responses.length===requests.length){clearInterval(interval);resolve();}},100);
 proc.on('error',reject);
});
clearTimeout(timeout);proc.stdin.end();
if(responses.some(r=>r.error||r.result?.isError))throw Error(JSON.stringify(responses));
const listed=responses.find(r=>r.id===2).result.tools.map(t=>t.name);
if(JSON.stringify(listed)!==JSON.stringify(['painter_help','start_painting','paint_named_region','export_painting']))throw Error('Expected four simple tools');
const summary={passed:true,tools:listed,context:JSON.parse(responses.find(r=>r.id===4).result.content[0].text),help:JSON.parse(responses.find(r=>r.id===3).result.content[0].text)};
await fs.writeFile(path.join(root,'evidence/mcp-agent-test.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({passed:true,tools:listed.length,character:summary.context.object,regions:summary.context.regions}));
