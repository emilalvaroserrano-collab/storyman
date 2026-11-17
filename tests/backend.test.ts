import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const directory=mkdtempSync(join(tmpdir(),'storyman-backend-'));
process.env.STORYMAN_DATA_DIR=directory;
process.env.STORAGE_DIR=join(directory,'artifacts');
delete process.env.DATABASE_URL;
let service: typeof import('../lib/story-service');
let scheduler: typeof import('../lib/scheduler');
let db: typeof import('../lib/db');
before(async()=>{service=await import('../lib/story-service');scheduler=await import('../lib/scheduler');db=await import('../lib/db');});
const input={prompt:'Tell the true story of a documented business founder.',genre:'Business Empire',language:'Filipino / Taglish',duration:300,voice:'Natural storyteller',platforms:['youtube'] as const,idempotencyKey:'test-request-one'};
after(()=>{rmSync(directory,{recursive:true,force:true});});

test('initial schedule has three independent Manila slots and publishing disabled',async()=>{
 const schedule=await service.getSchedule();assert.equal(schedule.timezone,'Asia/Manila');assert.deepEqual(schedule.slots.map(s=>s.time),['09:00','14:00','19:00']);assert.equal(schedule.generationMode,'GENERATE_ONLY');assert.equal((await service.getSettings()).autoPublish,false);
});
test('manual request is persisted idempotently without changing schedule',async()=>{
 const before=await service.getSchedule();const a=await service.createJob({...input,platforms:[...input.platforms]});const b=await service.createJob({...input,platforms:[...input.platforms]});assert.equal(a.created,true);assert.equal(b.created,false);assert.equal(a.job.id,b.job.id);assert.equal((await service.getJob(a.job.id))?.prompt,input.prompt);assert.deepEqual(await service.getSchedule(),before);assert.equal(a.job.trigger,'manual');assert.equal((await service.listJobs()).length,1);
});
test('schedule validation rejects duplicate slot times, invalid timezone, and missing slots',()=>{
 const base=structuredClone(service.defaultSchedule);assert.throws(()=>service.scheduleSchema.parse({...base,timezone:'Manila-ish'}));base.slots[1].time=base.slots[0].time;assert.throws(()=>service.scheduleSchema.parse(base));assert.throws(()=>service.scheduleSchema.parse({...service.defaultSchedule,slots:[]}));
});
test('three next executions respect Manila timezone and ignore manual work',()=>{
 const next=scheduler.upcomingExecutions({...service.defaultSchedule,enabled:true},new Date('2026-11-16T23:30:00Z'));assert.deepEqual(next.map(n=>n.at),['2026-11-17T01:00:00.000Z','2026-11-17T06:00:00.000Z','2026-11-17T11:00:00.000Z']);assert.equal(next.length,3);
});
test('missed runs skip by default, bounded catch-up-one selects latest slot',()=>{
 const base={...service.defaultSchedule,enabled:true};const now=new Date('2026-11-17T11:30:00Z');const previous=new Date('2026-11-17T00:00:00Z');assert.equal(scheduler.dueOccurrences(base,now,previous).length,0);const one=scheduler.dueOccurrences({...base,missedRunPolicy:'catch_up_one'},now,previous);assert.equal(one.length,1);assert.equal(one[0].slot.id,'evening');const all=scheduler.dueOccurrences({...base,missedRunPolicy:'catch_up_all'},now,previous);assert.deepEqual(all.map(o=>o.slot.id),['afternoon','evening']);
});
test('repeated scheduler ticks create one occurrence; manual request consumes no slot',async()=>{
 await service.saveSchedule({...service.defaultSchedule,enabled:true});const at=new Date('2026-11-17T01:00:10Z');await scheduler.runSchedulerTick(at);await scheduler.runSchedulerTick(at);const jobs=await service.listJobs();assert.equal(jobs.filter(j=>j.trigger==='scheduled').length,1);assert.equal(jobs.filter(j=>j.trigger==='manual').length,1);const row=await db.query('SELECT COUNT(*) AS count FROM schedule_occurrences');assert.equal(Number(row.rows[0].count),1);
});
test('scheduled daily cap does not prevent an independent manual job',async()=>{
 await service.saveSettings({...service.defaultSettings,dailyCap:1});await scheduler.runSchedulerTick(new Date('2026-11-17T06:00:10Z'));const result=await service.createJob({...input,platforms:[...input.platforms],idempotencyKey:'independent-manual-2'});assert.equal(result.created,true);assert.equal((await service.listJobs()).filter(j=>j.trigger==='scheduled').length,1);
});
test('lease prevents second worker from claiming same job and honors pause/cancel',async()=>{
 const claimed=await service.claimNextJob();assert.ok(claimed);const again=await service.claimNextJob();assert.equal(again,null);await service.controlJob(claimed.id,'cancel');await service.releaseJob(claimed.id);assert.equal((await service.getJob(claimed.id))?.status,'CANCELLED');const next=await service.claimNextJob();assert.ok(next);assert.notEqual(next.id,claimed.id);await service.releaseJob(next.id);const paused=await service.controlJob(next.id,'pause');assert.equal(paused.status,'PAUSED');const resumed=await service.controlJob(next.id,'resume');assert.equal(resumed.status,'QUEUED');
});
test('DST fall-back produces one idempotency key for repeated local time',()=>{
 const schedule={...service.defaultSchedule,enabled:true,timezone:'America/New_York',missedRunPolicy:'catch_up_all' as const,slots:service.defaultSchedule.slots.map((s,i)=>({...s,time:i===0?'01:30':s.time}))};const due=scheduler.dueOccurrences(schedule,new Date('2026-11-01T06:40:00Z'),new Date('2026-11-01T05:00:00Z'));assert.equal(due.length,1);assert.equal(due[0].key,'daily:2026-11-01:morning');
});
test('all three daily occurrences generate distinct jobs with deterministic keys',async()=>{
 await service.saveSettings(service.defaultSettings);
 for(const at of ['2026-11-19T01:00:10Z','2026-11-19T06:00:10Z','2026-11-19T11:00:10Z'])await scheduler.runSchedulerTick(new Date(at));
 const jobs=(await service.listJobs()).filter(j=>j.idempotencyKey.startsWith('daily:2026-11-19:'));
 assert.equal(jobs.length,3);assert.equal(new Set(jobs.map(j=>j.id)).size,3);assert.deepEqual(jobs.map(j=>j.idempotencyKey).sort(),['daily:2026-11-19:afternoon','daily:2026-11-19:evening','daily:2026-11-19:morning']);
});

async function clearQueueForLeaseTests() {
 const jobs=await service.listJobs();
 for(const job of jobs)if(['QUEUED','RETRYING','RESEARCHING','SCRIPTED','NARRATING','SELECTING_ASSETS','EDITING','QA','PAUSED'].includes(job.status)){await service.controlJob(job.id,'cancel');await service.releaseJob(job.id);}
}
test('concurrent claims enforce a single active generation slot',async()=>{
 await clearQueueForLeaseTests();await service.saveSettings({...service.defaultSettings,concurrentJobs:1});
 for(let i=0;i<3;i++)await service.createJob({...input,platforms:[...input.platforms],idempotencyKey:`concurrent-request-${i}`});
 const claims=await Promise.all(Array.from({length:8},()=>service.claimNextJob()));
 assert.equal(claims.filter(Boolean).length,1);
 const claim=claims.find(Boolean)!;await service.controlJob(claim.id,'cancel');await service.releaseJob(claim.id,claim.leaseToken);
});
test('pause/resume retains in-flight lease and stage writes cannot overwrite cancellation',async()=>{
 await clearQueueForLeaseTests();const {job}=await service.createJob({...input,platforms:[...input.platforms],idempotencyKey:'cancel-guard-request'});const claim=await service.claimNextJob();assert.equal(claim?.id,job.id);
 await service.controlJob(job.id,'pause');await service.controlJob(job.id,'resume');assert.equal(await service.claimNextJob(),null);
 await service.controlJob(job.id,'cancel');const stale=await service.updateJob(job.id,{status:'EDITING',progress:70},'stale worker stage',{leaseToken:claim!.leaseToken});assert.equal(stale.status,'CANCELLED');
 await assert.rejects(()=>service.controlJob(job.id,'retry'),/still finishing/);
 await service.releaseJob(job.id,claim!.leaseToken);assert.equal((await service.controlJob(job.id,'retry')).status,'QUEUED');
});
test('stale execution token cannot write, renew or release a replacement lease',async()=>{
 await clearQueueForLeaseTests();const {job}=await service.createJob({...input,platforms:[...input.platforms],idempotencyKey:'stale-token-request'});const old=await service.claimNextJob();assert.equal(old?.id,job.id);
 await db.query('UPDATE story_jobs SET lease_until = ? WHERE id = ?',['2000-01-01T00:00:00.000Z',job.id]);const fresh=await service.claimNextJob();assert.equal(fresh?.id,job.id);assert.notEqual(fresh?.leaseToken,old?.leaseToken);
 assert.equal(await service.renewLease(job.id,old!.leaseToken),false);await service.releaseJob(job.id,old!.leaseToken);assert.equal(await service.claimNextJob(),null);
 await service.updateJob(job.id,{status:'EDITING'},'old stage',{leaseToken:old!.leaseToken});assert.equal((await service.getJob(job.id))?.status,'QUEUED');
 await service.controlJob(job.id,'cancel');await service.releaseJob(job.id,fresh!.leaseToken);
});
test('exhausted interrupted leases become visible failures',async()=>{
 await clearQueueForLeaseTests();const {job}=await service.createJob({...input,platforms:[...input.platforms],idempotencyKey:'exhausted-request'});await db.query('UPDATE story_jobs SET attempts = 4 WHERE id = ?',[job.id]);await service.claimNextJob();const failed=await service.getJob(job.id);assert.equal(failed?.status,'FAILED');assert.match(failed?.blocker||'',/four worker leases/);
});
test('database jobs and schedule survive a fresh Node process',async()=>{
 const result=spawnSync(process.execPath,['--import','tsx','-e',"const s=require('./lib/story-service.ts'); Promise.all([s.listJobs(),s.getSchedule()]).then(([jobs,schedule])=>console.log(JSON.stringify({ids:jobs.map(j=>j.id),slots:schedule.slots.map(s=>s.time)})))"],{cwd:process.cwd(),env:{...process.env,STORYMAN_DATA_DIR:directory},encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);const data=JSON.parse(result.stdout.trim());assert.ok(data.ids.length>=3);assert.deepEqual(data.slots,['09:00','14:00','19:00']);
});
test('separate worker processes cannot exceed the single active slot',async()=>{
 await clearQueueForLeaseTests();for(let i=0;i<3;i++)await service.createJob({...input,platforms:[...input.platforms],idempotencyKey:`cross-process-${i}`});
 const run=()=>new Promise<string>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','-e',"const s=require('./lib/story-service.ts');s.claimNextJob().then(j=>console.log(JSON.stringify({id:j?.id||null})))"],{cwd:process.cwd(),env:{...process.env,STORYMAN_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>error+=c);child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(new Error(error)));});
 const results=await Promise.all([run(),run(),run(),run()]);assert.equal(results.map(s=>JSON.parse(s.trim()).id).filter(Boolean).length,1);
});
test('entity topic reservations reject a second job and permit retries of the owner job',async()=>{
 const research=await import('../lib/research');assert.equal(await research.reserveResearchTopic('Tony Tan Caktiong','job-topic-one'),true);assert.equal(await research.reserveResearchTopic('Tony Tan Caktiong','job-topic-two'),false);assert.equal(await research.reserveResearchTopic('Tony Tan Caktiong','job-topic-one'),true);assert.equal(await research.reserveResearchTopic('Henry Sy','job-topic-two'),true);
});

const reviewSources=[{title:'Primary source test fixture',url:'https://primary.example/profile',excerpt:'Authorized test fixture, not a fetched source.',accessedAt:'2026-11-17T00:00:00Z'},{title:'Corroborating test fixture',url:'https://news.example/article',excerpt:'Authorized test fixture, not a fetched source.',accessedAt:'2026-11-17T00:00:00Z'}];
const reviewDraft={title:'Owner review test fixture',script:Array.from({length:600},(_,i)=>i%12===0?'Documented.':'evidence').join(' '),claims:[{text:'A source-mapped fixture claim.',sourceUrls:[reviewSources[0].url]}],editorialApproved:false};
test('saving a script draft never assumes approval; explicit owner approval queues narration',async()=>{
 await clearQueueForLeaseTests();const {job}=await service.createJob({...input,platforms:[...input.platforms],idempotencyKey:'script-review-request'});await service.updateJob(job.id,{status:'NEEDS_REVIEW',sources:reviewSources,artifacts:{narration:'/old-narration.wav',video:'/old-video.mp4'}});
 const draft=await service.saveScriptReview(job.id,reviewDraft);assert.equal(draft.status,'NEEDS_REVIEW');assert.equal(draft.editorialApproved,false);assert.equal(draft.scriptVersion,1);assert.equal(draft.artifacts.narration,undefined);assert.equal(draft.artifacts.video,undefined);assert.ok(draft.artifacts.script);
 const approved=await service.saveScriptReview(job.id,{...reviewDraft,editorialApproved:true});assert.equal(approved.status,'QUEUED');assert.equal(approved.editorialApproved,true);assert.equal(approved.scriptVersion,2);assert.equal(approved.scriptRevisions?.length,2);assert.match(approved.events.at(-1)?.message||'',/Publishing consent is separate/);
});
test('script approval rejects unknown claim URLs, unsupported length, active workers and cancellation',async()=>{
 await clearQueueForLeaseTests();const {job}=await service.createJob({...input,platforms:[...input.platforms],idempotencyKey:'script-review-validation'});await service.updateJob(job.id,{status:'NEEDS_REVIEW',sources:reviewSources});
 await assert.rejects(()=>service.saveScriptReview(job.id,{...reviewDraft,claims:[{text:'Unsupported fixture claim',sourceUrls:['https://unrelated.example/claim']}]}),/existing research source/);
 await assert.rejects(()=>service.saveScriptReview(job.id,{...reviewDraft,script:'This deliberately short fixture cannot be approved for a five minute target.',editorialApproved:true}),/600–750/);
 await service.updateJob(job.id,{status:'QUEUED'});const claimed=await service.claimNextJob();assert.equal(claimed?.id,job.id);await assert.rejects(()=>service.saveScriptReview(job.id,reviewDraft),/active lease/);
 await service.controlJob(job.id,'cancel');await service.releaseJob(job.id,claimed!.leaseToken);await assert.rejects(()=>service.saveScriptReview(job.id,reviewDraft),/cancelled/);
});
test('script revision index retains the latest ten review receipts',async()=>{
 const {job}=await service.createJob({...input,platforms:[...input.platforms],idempotencyKey:'script-review-history'});await service.updateJob(job.id,{status:'NEEDS_REVIEW',sources:reviewSources});
 for(let i=0;i<12;i++)await service.saveScriptReview(job.id,{...reviewDraft,title:`Owner review fixture ${i}`});
 const saved=await service.getJob(job.id);assert.equal(saved?.scriptVersion,12);assert.equal(saved?.scriptRevisions?.length,10);assert.equal(saved?.scriptRevisions?.[0].version,3);assert.equal(saved?.status,'NEEDS_REVIEW');
});
