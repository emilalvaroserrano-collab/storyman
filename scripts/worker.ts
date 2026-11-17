import { claimNextJob, getWorkerHealth, heartbeat, renewLease } from '../lib/story-service';
import { processJob } from '../lib/pipeline';
import { runSchedulerTick } from '../lib/scheduler';
import { claimNextVariant, heartbeatVariant, processVariant } from '../lib/variants';
let stopping=false;
const active=new Map<string,string>();
const variants=new Map<string,string>();
process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
const log=(event:string,details:Record<string,unknown>={})=>console.log(JSON.stringify({at:new Date().toISOString(),event,...details}));
async function renewActive(){await heartbeat();for(const [id,token] of active)await renewLease(id,token);for(const [id,token] of variants)await heartbeatVariant(id,token);}
async function tick(){
 await renewActive();await runSchedulerTick();
 const job=await claimNextJob();
 if(job){active.set(job.id,job.leaseToken);log('job_started',{id:job.id,trigger:job.trigger});void processJob(job).catch(()=>log('job_execution_failed',{id:job.id})).finally(()=>{active.delete(job.id);log('job_finished',{id:job.id});});return;}
 const variant=await claimNextVariant();
 if(variant){variants.set(variant.id,variant.leaseToken);log('variant_started',{id:variant.id,platform:variant.platform});void processVariant(variant).catch(()=>log('variant_execution_failed',{id:variant.id})).finally(()=>{variants.delete(variant.id);log('variant_finished',{id:variant.id});});}
}
async function main(){
 log('worker_starting');await heartbeat();const health=await getWorkerHealth();log('worker_ready',{status:health.worker});
 while(!stopping){try{await tick();}catch{log('worker_tick_failed',{message:'Check database and provider configuration.'});}await new Promise(resolve=>setTimeout(resolve,2000));}
 log('worker_stopping',{active:active.size,variants:variants.size});
 while(active.size||variants.size){try{await renewActive();}catch{log('worker_shutdown_renewal_failed');}await new Promise(resolve=>setTimeout(resolve,2000));}
 process.exit(0);
}
main().catch(()=>{log('worker_failed',{message:'Worker initialization failed.'});process.exit(1);});
