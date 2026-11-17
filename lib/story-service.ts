import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getKV, query, rowLockClause, setKV, withTransaction, type SqlExecutor } from './db';
import type { GenerateInput, Job, JobStatus, Schedule, Settings } from './types';
import { writeArtifact } from './media';

const platforms = z.array(z.enum(['youtube', 'facebook', 'tiktok'])).max(3).transform(a => [...new Set(a)]);
export const generateSchema = z.object({ prompt: z.string().trim().min(12, 'Describe your story in at least 12 characters.').max(4000), genre: z.string().max(80).default('Inspirational Real Story'), language: z.string().max(40).default('Taglish'), duration: z.number().min(30).max(600).default(300), voice: z.string().max(80).default('natural'), platforms: platforms.default(['youtube', 'facebook', 'tiktok']), model:z.string().max(120).optional(), storyFormat:z.string().max(80).optional(),tone:z.string().max(80).optional(),audience:z.string().max(160).optional(), sourceUrl: z.string().url().max(2048).optional().or(z.literal('').transform(() => undefined)), narrationId: z.string().uuid().optional(), idempotencyKey: z.string().min(8).max(160) });
export const scheduleSchema = z.object({ enabled: z.boolean(), timezone: z.string().refine(tz => {try {new Intl.DateTimeFormat('en', { timeZone: tz }); return true;} catch {return false;}}, 'Enter a valid IANA timezone.'), slots: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), enabled: z.boolean(), genre: z.string().min(1).max(80), platforms })).length(3).refine(s => new Set(s.map(x => x.id)).size === 3 && new Set(s.map(x => x.time)).size === 3, 'Slots need unique IDs and times.'), missedRunPolicy: z.enum(['skip_missed', 'catch_up_one', 'catch_up_all']), generationMode: z.enum(['GENERATE_ONLY', 'APPROVAL_REQUIRED', 'AUTO_PUBLISH_WHEN_ELIGIBLE']) });
export const settingsSchema = z.object({ language: z.string().min(1).max(40), voice: z.string().min(1).max(80), duration: z.number().min(30).max(600), dailyCap: z.number().int().min(1).max(30), concurrentJobs: z.number().int().min(1).max(4), budgetLimit: z.number().min(0).max(1000), approvalMode: z.enum(['all', 'review_high_risk', 'off']), autoPublish: z.boolean() });
export const defaultSchedule: Schedule = { enabled: false, timezone: 'Asia/Manila', slots: [{ id: 'morning', time: '09:00', enabled: true, genre: 'Rags to Riches', platforms: ['youtube','facebook','tiktok'] }, { id: 'afternoon', time: '14:00', enabled: true, genre: 'Business Empire', platforms: ['youtube','facebook','tiktok'] }, { id: 'evening', time: '19:00', enabled: true, genre: 'Celebrity Comeback', platforms: ['youtube','facebook','tiktok'] }], missedRunPolicy: 'skip_missed', generationMode: 'GENERATE_ONLY' };
export const defaultSettings: Settings = { language: 'Taglish', voice: 'natural', duration: 300, dailyCap: 3, concurrentJobs: 1, budgetLimit: 5, approvalMode: 'all', autoPublish: false };
export const getSchedule = () => getKV<Schedule>('schedule', defaultSchedule);
export const saveSchedule = async (input: unknown) => { const schedule = scheduleSchema.parse(input); await setKV('schedule', schedule); return schedule; };
export const getSettings = () => getKV<Settings>('settings', defaultSettings);
export const saveSettings = async (input: unknown) => { const settings = settingsSchema.parse(input); await setKV('settings', settings); return settings; };
export async function listJobs(limit = 100): Promise<Job[]> { const { rows } = await query('SELECT data FROM story_jobs ORDER BY created_at DESC LIMIT ?', [limit]); return rows.map(row => JSON.parse(String(row.data)) as Job); }
export async function getJob(id: string): Promise<Job | null> { const { rows } = await query('SELECT data FROM story_jobs WHERE id = ?', [id]); return rows[0] ? JSON.parse(String(rows[0].data)) as Job : null; }
export async function createJob(input: GenerateInput, trigger: 'manual' | 'scheduled' = 'manual'): Promise<{ job: Job; created: boolean }> {
  const parsed = generateSchema.parse(input);
  const existing = await query('SELECT data FROM story_jobs WHERE idempotency_key = ?', [parsed.idempotencyKey]);
  if (existing.rows[0]) return { job: JSON.parse(String(existing.rows[0].data)), created: false };
  const now = new Date().toISOString();
  const job: Job = { ...parsed, id: randomUUID(), title: parsed.prompt.slice(0,100), status: 'QUEUED', progress: 0, trigger, createdAt: now, updatedAt: now, events: [{ at: now, stage: 'QUEUED', message: trigger === 'manual' ? 'Manual request saved. Scheduled story slots are unchanged.' : 'Scheduled occurrence saved with a unique generation key.' }], sources: [], artifacts: {} };
  const result = await query('INSERT INTO story_jobs (id,idempotency_key,status,trigger_type,created_at,updated_at,data) VALUES (?,?,?,?,?,?,?) ON CONFLICT (idempotency_key) DO NOTHING', [job.id, job.idempotencyKey, job.status, trigger, now, now, JSON.stringify(job)]);
  if (!result.changes) { const other = await query('SELECT data FROM story_jobs WHERE idempotency_key = ?', [parsed.idempotencyKey]); return { job: JSON.parse(String(other.rows[0].data)), created: false }; }
  return { job, created: true };
}
export interface UpdateOptions { force?: boolean; leaseToken?: string; }
async function persistPatch(execute: SqlExecutor,current: Job,patch: Partial<Job>,message?:string) {
  const now=new Date().toISOString();
  const job:Job={...current,...patch,id:current.id,idempotencyKey:current.idempotencyKey,updatedAt:now,events:message?[...current.events,{at:now,stage:patch.status||current.status,message}].slice(-250):current.events};
  await execute('UPDATE story_jobs SET status = ?, updated_at = ?, data = ? WHERE id = ?',[job.status,now,JSON.stringify(job),job.id]);
  return job;
}
export async function updateJob(id: string,patch:Partial<Job>,message?:string,options:UpdateOptions={}):Promise<Job> {
  return withTransaction(async execute=>{
    const {rows}=await execute('SELECT data,lease_token FROM story_jobs WHERE id = ?'+rowLockClause(),[id]);
    if(!rows[0])throw new Error('Job not found.');
    const current=JSON.parse(String(rows[0].data)) as Job;
    if(options.leaseToken && rows[0].lease_token!==options.leaseToken)return current;
    if(!options.force && ['PAUSED','CANCELLED'].includes(current.status))return current;
    return persistPatch(execute,current,patch,message);
  });
}
const stoppable: JobStatus[]=['QUEUED','RETRYING','RESEARCHING','SCRIPTED','NARRATING','SELECTING_ASSETS','EDITING','QA'];
export async function controlJob(id:string,action:'retry'|'cancel'|'pause'|'resume') {
  return withTransaction(async execute=>{
    const {rows}=await execute('SELECT data,lease_until FROM story_jobs WHERE id = ?'+rowLockClause(),[id]);
    if(!rows[0])throw new Error('Job not found.');
    const current=JSON.parse(String(rows[0].data)) as Job;
    if(action==='cancel') {if(['PUBLISHED','PUBLISHING'].includes(current.status))throw new Error('A publication cannot be cancelled through the generation queue.');return persistPatch(execute,current,{status:'CANCELLED'},'Generation cancelled. Existing files and uploaded narration are preserved.');}
    if(action==='pause') {if(!stoppable.includes(current.status))throw new Error('This job is not running.');return persistPatch(execute,current,{status:'PAUSED'},'Paused. The worker will stop at the next stage boundary.');}
    if(action==='resume' && current.status!=='PAUSED')throw new Error('Only a paused job can be resumed.');
    if(action==='retry' && ['PUBLISHED','PUBLISHING',...stoppable].includes(current.status))throw new Error('Only blocked, failed, reviewed or cancelled jobs can be retried.');
    const leased=rows[0].lease_until && String(rows[0].lease_until)>new Date().toISOString();
    if(action==='retry' && leased)throw new Error('The worker is still finishing this stage. Retry after it releases the active lease.');
    // Resuming an in-flight paused stage keeps its lease, preventing a second worker.
    if(!leased)await execute('UPDATE story_jobs SET lease_until = NULL, lease_token = NULL, attempts = 0 WHERE id = ?',[id]);
    return persistPatch(execute,current,{status:'QUEUED',blocker:undefined},`${action==='resume'?'Resumed':'Retry requested'}. Completed artifacts will be reused.`);
  });
}
export interface ClaimedJob extends Job { leaseToken:string; }
export async function claimNextJob():Promise<ClaimedJob|null> {
  const settings=await getSettings();
  return withTransaction(async execute=>{
    // PostgreSQL locks this row across processes; SQLite holds BEGIN IMMEDIATE.
    await execute("SELECT value FROM app_records WHERE key = 'queue_claim_lock'"+rowLockClause());
    const now=new Date().toISOString();
    const exhausted=await execute("SELECT data FROM story_jobs WHERE status IN ('QUEUED','RETRYING','RESEARCHING','SCRIPTED','NARRATING','SELECTING_ASSETS','EDITING','QA') AND (lease_until IS NULL OR lease_until < ?) AND attempts >= 4",[now]);
    for(const row of exhausted.rows) {const current=JSON.parse(String(row.data)) as Job;await persistPatch(execute,current,{status:'FAILED',blocker:'This job exhausted four worker leases after interruption. Inspect the activity and retry manually.'},'Worker recovery limit reached. Manual inspection is required.');}
    const active=await execute('SELECT COUNT(*) AS count FROM story_jobs WHERE lease_until > ?',[now]);
    const variants=await execute('SELECT COUNT(*) AS count FROM variant_requests WHERE lease_until > ?',[now]);
    if(Number(active.rows[0].count)+Number(variants.rows[0].count)>=settings.concurrentJobs)return null;
    const {rows}=await execute("SELECT data FROM story_jobs WHERE status IN ('QUEUED','RETRYING','RESEARCHING','SCRIPTED','NARRATING','SELECTING_ASSETS','EDITING','QA') AND (lease_until IS NULL OR lease_until < ?) AND attempts < 4 ORDER BY created_at LIMIT 1",[now]);
    if(!rows[0])return null;
    const job=JSON.parse(String(rows[0].data)) as Job;const leaseToken=randomUUID();
    await execute('UPDATE story_jobs SET lease_until = ?, lease_token = ?, attempts = attempts + 1 WHERE id = ?',[new Date(Date.now()+180_000).toISOString(),leaseToken,job.id]);
    return {...job,leaseToken};
  });
}
export async function isLeaseCurrent(id:string,leaseToken?:string) {
  const {rows}=await query('SELECT status,lease_token FROM story_jobs WHERE id = ?',[id]);
  return Boolean(rows[0] && !['PAUSED','CANCELLED'].includes(String(rows[0].status)) && (!leaseToken || rows[0].lease_token===leaseToken));
}
export async function renewLease(id:string,leaseToken:string) {const result=await query('UPDATE story_jobs SET lease_until = ? WHERE id = ? AND lease_token = ?',[new Date(Date.now()+180_000).toISOString(),id,leaseToken]);return result.changes>0;}
export async function releaseJob(id:string,leaseToken?:string) {await query('UPDATE story_jobs SET lease_until = NULL, lease_token = NULL WHERE id = ?'+(leaseToken?' AND lease_token = ?':''),leaseToken?[id,leaseToken]:[id]);}
export async function heartbeat() { await setKV('workerHeartbeat', new Date().toISOString()); }
export async function getWorkerHealth() { const at = await getKV<string | undefined>('workerHeartbeat', undefined); return { worker: at && Date.now() - Date.parse(at) < 30_000 ? 'online' : 'offline', lastHeartbeat: at }; }

export const scriptReviewSchema=z.object({title:z.string().trim().min(1).max(150),script:z.string().trim().min(50).max(20000),claims:z.array(z.object({text:z.string().trim().min(1).max(2000),sourceUrls:z.array(z.string().url()).min(1).max(10)})).min(1).max(100),editorialApproved:z.boolean()});
export function scriptLengthBounds(duration:number) {return {min:Math.round(duration*120/60),max:Math.round(duration*150/60)};}
export async function saveScriptReview(id:string,input:unknown):Promise<Job> {
 const parsed=scriptReviewSchema.parse(input);
 return withTransaction(async execute=>{
  const {rows}=await execute('SELECT data,lease_until FROM story_jobs WHERE id = ?'+rowLockClause(),[id]);
  if(!rows[0])throw new Error('Job not found.');const current=JSON.parse(String(rows[0].data)) as Job;
  if(['CANCELLED','PUBLISHING','PUBLISHED'].includes(current.status))throw new Error('Cannot edit a cancelled or publishing/published story. Create a new request instead.');
  if(rows[0].lease_until && String(rows[0].lease_until)>new Date().toISOString())throw new Error('Cannot edit while the worker has an active lease. Pause and wait for the current stage to stop.');
  const urls=new Set(current.sources.map(s=>s.url));const domains=new Set(current.sources.map(s=>new URL(s.url).hostname));
  if(domains.size<2)throw new Error('At least two independent readable source domains are required before script review.');
  if(parsed.claims.some(claim=>claim.sourceUrls.some(url=>!urls.has(url))))throw new Error('Every claim URL must match an existing research source for this story.');
  const count=parsed.script.split(/\s+/).length;const bounds=scriptLengthBounds(current.duration);
  if(parsed.editorialApproved && (count<bounds.min || count>bounds.max))throw new Error(`Approval requires ${bounds.min}–${bounds.max} spoken words for the ${current.duration}-second target; this revision has ${count}. Save it as a draft or revise the length.`);
  const version=(current.scriptVersion||0)+1;const at=new Date().toISOString();
  const document={title:parsed.title,script:parsed.script,claims:parsed.claims,uncertainties:parsed.editorialApproved?[]:current.uncertainties||[],version,editorialApproved:parsed.editorialApproved,reviewedAt:at,reviewAuthority:parsed.editorialApproved?'authenticated owner':null,spokenWords:count,targetSeconds:current.duration};
  const revision=await writeArtifact(id,`script_revision_${version}.json`,JSON.stringify(document,null,2));
  const script=await writeArtifact(id,'script.md',parsed.script);const claims=await writeArtifact(id,'script.json',JSON.stringify(document,null,2));
  const revisions=[...(current.scriptRevisions||[]),{version,at,url:revision,approved:parsed.editorialApproved}].slice(-10);
  const artifacts:Record<string,string>={...current.artifacts,script,claims,draft:revision};
  if(parsed.script!==current.script)for(const key of ['narration','words','transcript','captions','video','manifest','ledger','qa'])delete artifacts[key];
  await execute('UPDATE story_jobs SET attempts = 0, lease_token = NULL, lease_until = NULL WHERE id = ?',[id]);
  return persistPatch(execute,current,{title:parsed.title,script:parsed.script,scriptDraft:parsed.script,claims:parsed.claims,uncertainties:document.uncertainties,editorialApproved:parsed.editorialApproved,scriptVersion:version,scriptRevisions:revisions,status:parsed.editorialApproved?'QUEUED':'NEEDS_REVIEW',progress:34,blocker:parsed.editorialApproved?undefined:'Draft saved. Review factual claims and approve this revision before narration.',artifacts},parsed.editorialApproved?`Owner approved script revision ${version} (${count} words) and queued narration. Publishing consent is separate.`:`Script revision ${version} saved without approval. Narration remains paused for review.`);
 });
}
