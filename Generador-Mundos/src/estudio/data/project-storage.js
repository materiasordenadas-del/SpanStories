// Base separada del Atlas clásico. Conserva el autosalvado anterior en la misma transacción.
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('atlas-estudio',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function saveProjectLocal(text){
  const d=await db();
  try{await new Promise((resolve,reject)=>{const tx=d.transaction('projects','readwrite'),s=tx.objectStore('projects'),r=s.get('current');r.onsuccess=()=>{if(r.result)s.put(r.result,'previous');s.put(text,'current');};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error??Error('Guardado cancelado'));tx.onerror=()=>reject(tx.error);});}finally{d.close();}
}
export async function loadProjectLocal(){
  const d=await db();
  try{return await new Promise((resolve,reject)=>{const s=d.transaction('projects').objectStore('projects'),a=s.get('current'),b=s.get('previous');b.onsuccess=()=>resolve({current:a.result??null,previous:b.result??null});a.onerror=()=>reject(a.error);b.onerror=()=>reject(b.error);});}finally{d.close();}
}
