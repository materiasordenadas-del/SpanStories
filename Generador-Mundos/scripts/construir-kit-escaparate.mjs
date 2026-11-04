// Reconstruye el kit modular de escaparates: Blender (sin interfaz, sin complementos) → GLB y kit.json → posproceso.
// Uso: npm run kit:escaparate [-- --sin-render]. Blender: variable BLENDER o D:\Blender 5.2\blender.exe.
import {spawnSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),blender=process.env.BLENDER??'D:\\Blender 5.2\\blender.exe';
if(!existsSync(blender))throw Error('No se encuentra Blender: define la variable BLENDER. Ruta probada: '+blender);
const extra=process.argv.slice(2).filter(a=>a==='--sin-render');
const run=spawnSync(blender,['-b','--factory-startup','--python',join(root,'scripts','blender','construir_kit_escaparate.py'),'--',root,...extra],{encoding:'utf8',maxBuffer:1<<26});
const resumen=(run.stdout??'').split('\n').find(l=>l.startsWith('KIT '));
if(run.status!==0||!resumen){process.stderr.write((run.stdout??'').slice(-3000)+(run.stderr??''));throw Error('Blender no terminó el kit');}
console.log(resumen);
await import('./kit-escaparate-postproceso.mjs');
