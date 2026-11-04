import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(root,'.next-studio-check');
if(!output.startsWith(root+path.sep)||path.dirname(output)!==root||path.basename(output)!=='.next-studio-check')throw new Error('La salida debe quedar dentro del proyecto vigente.');
const require=createRequire(import.meta.url);
console.log('Verificación de producción; salida generada: '+output);
const child=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'build'],{cwd:root,env:{...process.env,SPANSTORIES_STUDIO_BUILD_CHECK:'1'},stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
