// Yield between preparation steps so navigation/rendering can keep running.
// A step (for example one geometry upload) is indivisible; budget is cooperative.
export const CITY_WORK_BUDGET_MS=4;
export const CITY_PARSER_BUDGET_MS=2;
export const CITY_PARSER_MAX_JOBS=8;
const frameTasks=[];let frameScheduled=false;
function nextPreparationFrame(){
  requestAnimationFrame(()=>{
    const run=()=>{try{frameTasks.shift()();}finally{if(frameTasks.length)nextPreparationFrame();else frameScheduled=false;}};
    // The animation callback and pending input take precedence over preparation.
    if(globalThis.scheduler?.postTask)globalThis.scheduler.postTask(run,{priority:'background'});else setTimeout(run,0);
  });
}
export function scheduleCityTask(callback){
  if(typeof window!=='undefined'&&typeof requestAnimationFrame==='function'&&!globalThis.document?.hidden){
    frameTasks.push(callback);if(!frameScheduled){frameScheduled=true;nextPreparationFrame();}return;
  }
  if(typeof window!=='undefined'&&globalThis.scheduler?.postTask){globalThis.scheduler.postTask(callback,{priority:'user-visible'});return;}
  if(typeof window!=='undefined'&&typeof MessageChannel!=='undefined'){
    const channel=new MessageChannel();channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();callback();};channel.port2.postMessage(null);return;
  }
  setTimeout(callback,0);
}
export const nextCityTask = () => new Promise(scheduleCityTask);
export function finishSteps(steps) {
  let result; do { result = steps.next(); } while (!result.done); return result.value;
}
export async function budgetSteps(steps, { budgetMs = CITY_WORK_BUDGET_MS, signal } = {}) {
  let started = performance.now();
  try {
    while (true) {
      signal?.throwIfAborted();
      const result = steps.next();
      if (result.done) return result.value;
      if (performance.now() - started >= budgetMs) { await nextCityTask(); started = performance.now(); }
    }
  } catch (error) { steps.return?.(); throw error; }
}

// Bound both CPU time and the number of promise continuations released together.
// All concurrent glTF loads in one client share this queue.
export function createCityTaskQueue({budgetMs=CITY_PARSER_BUDGET_MS,maxJobs=CITY_PARSER_MAX_JOBS,schedule=scheduleCityTask}={}){
  const jobs=[];let scheduled=false;
  function drain(){
    const started=performance.now();let count=0;
    while(jobs.length&&count<maxJobs&&(count===0||performance.now()-started<budgetMs)){
      const job=jobs.shift();try{job.resolve(job.task());}catch(error){job.reject(error);}count++;
    }
    if(jobs.length)schedule(drain);else scheduled=false;
  }
  return task=>new Promise((resolve,reject)=>{jobs.push({task,resolve,reject});if(!scheduled){scheduled=true;schedule(drain);}});
}
