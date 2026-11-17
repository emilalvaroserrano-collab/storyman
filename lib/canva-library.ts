import { randomUUID } from 'node:crypto';
import { getAccessToken } from './oauth';
import { assertSafeSourceUrl } from './security';
import { probeMedia, writeArtifact } from './media';
import { rowLockClause, withTransaction } from './db';
import type { Job } from './types';
import type { StoryCard } from './story-cards';

const base='https://api.canva.com/rest/v1';
async function canvaJson(path:string,init:RequestInit={}):Promise<Record<string,unknown>> {
  const token=await getAccessToken('canva');
  const response=await fetch(`${base}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,...(init.body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(20_000)});
  if(!response.ok)throw new Error(`Canva API returned HTTP ${response.status}. Check account authorization, requested scopes and design access.`);
  return await response.json() as Record<string,unknown>;
}
export async function listCanvaDesigns(search:string,ownership:'any'|'owned'|'shared'='any',continuation?:string){
  const params=new URLSearchParams({limit:'50',ownership,sort_by:search?'relevance':'modified_descending'});
  if(search)params.set('query',search.slice(0,255));if(continuation)params.set('continuation',continuation);
  const payload=await canvaJson(`/designs?${params}`);
  return {items:Array.isArray(payload.items)?payload.items:[],continuation:typeof payload.continuation==='string'?payload.continuation:null,coverage:'owned_or_shared_designs_only'};
}
async function downloadExport(url:string):Promise<Uint8Array>{
  let target=new URL(url);
  if(target.hostname!=='export-download.canva.com')throw new Error('Canva export returned an unexpected download host.');
  for(let redirect=0;redirect<4;redirect++){
    await assertSafeSourceUrl(target.href);
    const response=await fetch(target,{redirect:'manual',signal:AbortSignal.timeout(60_000)});
    if(response.status>=300&&response.status<400){const location=response.headers.get('location');if(!location)throw new Error('Canva export redirect had no destination.');target=new URL(location,target);continue;}
    if(!response.ok)throw new Error(`Canva export download returned HTTP ${response.status}.`);
    const reader=response.body?.getReader();if(!reader)throw new Error('Canva export was empty.');
    const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>100*1024*1024){await reader.cancel();throw new Error('Canva export exceeds the 100 MB scene limit.');}chunks.push(part.value);}}
    finally{reader.releaseLock();}
    return new Uint8Array(Buffer.concat(chunks,size));
  }
  throw new Error('Canva export redirected too many times.');
}
async function exportedBytes(designId:string,format:'png'|'mp4'):Promise<Uint8Array>{
  const started=await canvaJson('/exports',{method:'POST',body:JSON.stringify({design_id:designId,format:{type:format}})});
  let job=started.job as {id?:string;status?:string;urls?:string[];error?:{message?:string}}|undefined;
  if(!job?.id)throw new Error('Canva did not return an export job ID.');
  const exportId=job.id;
  for(let attempt=0;attempt<20&&job.status==='in_progress';attempt++){
    await new Promise(resolve=>setTimeout(resolve,1500));
    const result=await canvaJson(`/exports/${encodeURIComponent(exportId)}`);job=result.job as typeof job;
  }
  if(job?.status==='failed')throw new Error(`Canva export failed: ${job.error?.message||'inspect design rights and plan access'}.`);
  if(job?.status!=='success'||!job.urls?.[0])throw new Error('Canva export is still processing. Retry after the export job finishes.');
  return downloadExport(job.urls[0]);
}
export async function attachCanvaDesign(jobId:string,sceneId:string,designId:string,format:'png'|'mp4'):Promise<StoryCard>{
  const initial=await withTransaction(async execute=>{
    const result=await execute('SELECT data,lease_until FROM story_jobs WHERE id = ?'+rowLockClause(),[jobId]);if(!result.rows[0])throw new Error('Job not found.');
    const job=JSON.parse(String(result.rows[0].data)) as Job;
    if(['CANCELLED','PUBLISHING','PUBLISHED'].includes(job.status)||result.rows[0].lease_until&&String(result.rows[0].lease_until)>new Date().toISOString())throw new Error('Cannot edit Canva visuals during an active or published job.');
    const cardRow=await execute('SELECT data FROM story_cards WHERE scene_id = ? AND job_id = ?'+rowLockClause(),[sceneId,jobId]);if(!cardRow.rows[0])throw new Error('Scene not found.');
    const card=JSON.parse(String(cardRow.rows[0].data)) as StoryCard;if(card.visual_status==='generating'&&Date.now()-Date.parse(card.updated_at)<10*60_000)throw new Error('A Canva export is already running for this scene.');
    const next={...card,visual_status:'generating',updated_at:new Date().toISOString()};await execute('UPDATE story_cards SET data = ? WHERE scene_id = ?',[JSON.stringify(next),sceneId]);return next;
  });
  try{
    const bytes=await exportedBytes(designId,format);
    if(format==='png'){
      const header=Buffer.from(bytes.slice(0,24));
      if(header.length<24||!header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||header.readUInt32BE(16)<40||header.readUInt32BE(20)<40)throw new Error('Canva export is not a renderable PNG image.');
    }
    const filename=`canva-${sceneId}-${randomUUID()}.${format}`;
    const url=await writeArtifact(jobId,filename,bytes);
    if(format==='mp4'){
      const {artifactPath}=await import('./media');const metadata=await probeMedia(artifactPath(jobId,filename));
      if(!metadata.streams.some(item=>item.codec_type==='video'&&item.width&&item.height))throw new Error('Canva export is not a renderable MP4 video.');
    }
    return withTransaction(async execute=>{
      const row=await execute('SELECT data FROM story_cards WHERE scene_id = ?'+rowLockClause(),[sceneId]);const current=JSON.parse(String(row.rows[0].data)) as StoryCard;
      if(current.revision!==initial.revision||current.visual_status!=='generating')throw new Error('Scene changed during Canva export. The downloaded file was preserved but not attached.');
      const updated:StoryCard={...current,canva_asset_id:designId,canva_asset_type:format==='png'?'image':'video',visual_path:url,visual_status:'needs_review',scene_status:'needs_review',error_message:'Review design content and external publishing rights before rendering.',render_path:null,revision:current.revision+1,updated_at:new Date().toISOString()};
      await execute('UPDATE story_cards SET revision = ?, data = ? WHERE scene_id = ?',[updated.revision,JSON.stringify(updated),sceneId]);return updated;
    });
  }catch(error){
    await withTransaction(async execute=>{const row=await execute('SELECT data FROM story_cards WHERE scene_id = ?'+rowLockClause(),[sceneId]);if(!row.rows[0])return;const current=JSON.parse(String(row.rows[0].data)) as StoryCard;if(current.revision!==initial.revision)return;const updated={...current,visual_status:'failed',error_message:error instanceof Error?error.message:'Canva export failed.',updated_at:new Date().toISOString()};await execute('UPDATE story_cards SET data = ? WHERE scene_id = ?',[JSON.stringify(updated),sceneId]);});throw error;
  }
}
