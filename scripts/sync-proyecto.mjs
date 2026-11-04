import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const branch='feat/visor-mundo-20261021';
function git(args,{allowFailure=false}={}){
  const result=spawnSync('git',['-C',root,...args],{encoding:'utf8',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0&&!allowFailure)throw Error((result.stderr||result.stdout).trim());
  return result;
}
try{
  if(git(['branch','--show-current']).stdout.trim()!==branch)throw Error('Abre la rama '+branch+' antes de sincronizar.');
  if(git(['status','--porcelain','--untracked-files=no']).stdout.trim())throw Error('Hay cambios locales pendientes. Se conservan: guárdalos en un commit antes de sincronizar.');
  const head=git(['rev-parse','HEAD']).stdout.trim();
  if(process.argv.includes('--check')){console.log('Carpeta: '+root+'\nRama: '+branch+'\nCommit local: '+head+'\nArchivos versionados sin cambios.');process.exit(0);}
  git(['fetch','origin',branch]);
  const remote=git(['rev-parse','FETCH_HEAD']).stdout.trim();
  if(git(['merge-base','--is-ancestor',head,remote],{allowFailure:true}).status!==0)throw Error('Hay commits locales y remotos distintos. Se necesita integración; no se ha sobrescrito ningún archivo.');
  const additions=git(['diff','--name-only','--diff-filter=A','-z',head,remote]).stdout.split('\0').filter(Boolean);
  const collision=additions.find(p=>existsSync(path.join(root,p)));
  if(collision)throw Error('El cambio remoto coincide con un archivo local no versionado: '+collision+'. Se conserva y se detiene la actualización.');
  git(['merge','--ff-only','FETCH_HEAD']);
  console.log('Sincronizado: '+remote+'\nSe conservaron los archivos locales no versionados y los excluidos.');
}catch(error){console.error(error.message);process.exitCode=1;}
