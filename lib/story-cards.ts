import { createHash, randomUUID } from 'node:crypto';
import { query, rowLockClause, withTransaction } from './db';
import { synthesizeNarration, alignNarration } from './media';
import type { Job } from './types';

export type CardState = 'pending' | 'generating' | 'ready' | 'needs_review' | 'failed';
export interface StoryCard {
  scene_id:string; job_id:string; ordinal:number; revision:number; sentence_1:string; sentence_2:string; narration_text:string;
  voice_id:string; tts_status:CardState; tts_audio_path:string|null; tts_duration_ms:number|null;
  sfx_prompt:string; sfx_path:string|null; sfx_status:CardState; sfx_gain_db:number;
  canva_search_terms:string[]; canva_asset_id:string|null; canva_asset_type:'image'|'video'|null; visual_path:string|null; visual_status:CardState;
  subtitle_words:{word:string;start_ms:number;end_ms:number;confidence:number}[];
  render_path:string|null; duration_ms:number|null; scene_status:CardState; error_message:string|null; source_references:string[];
  created_at:string; updated_at:string;
}

const terminal=/[.!?][\s"'”’)]*$/u;
const prefixAbbreviation=/\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs)\.["'”’)]*$/iu;
const contextualAbbreviation=/\b(?:Sr|Jr|etc|No|Inc|Ltd|Co|e\.g|i\.e)\.["'”’)]*$/iu;
export function splitStorySentences(script:string):string[] {
  const input=script.replace(/\r\n?/g,'\n').trim();
  if(!input)throw new Error('Enter a complete narration script before creating cards.');
  const raw=[...new Intl.Segmenter('en',{granularity:'sentence'}).segment(input)].map(x=>x.segment.trim()).filter(Boolean);
  const sentences:string[]=[];let pending='';
  for(let index=0;index<raw.length;index++){
    const part=raw[index];pending=pending?`${pending} ${part}`:part;
    const next=raw[index+1];
    if(next && (prefixAbbreviation.test(pending) || (contextualAbbreviation.test(pending)&&/^[\p{Ll}\p{N}]/u.test(next)) || (/^[a-z]/u.test(next) && /[.!?]["'”’)]$/u.test(pending))))continue;
    if(!terminal.test(pending))throw new Error(`Sentence ${sentences.length+1} needs terminal punctuation (. ! or ?).`);
    sentences.push(pending);pending='';
  }
  if(pending)throw new Error('The final sentence is incomplete.');
  return sentences;
}
export function splitStoryCards(script:string):[string,string][] {
  const sentences=splitStorySentences(script);
  if(sentences.length%2)throw new Error(`The script has ${sentences.length} sentences. Each card needs exactly two; edit or regenerate the unmatched sentence.`);
  if(sentences.length>240)throw new Error('A story supports at most 120 two-sentence cards.');
  const result:[string,string][]=[];for(let index=0;index<sentences.length;index+=2)result.push([sentences[index],sentences[index+1]]);
  return result;
}
const hash=(value:string)=>createHash('sha256').update(value.replace(/\s+/g,' ').trim()).digest('hex');
async function rows(jobId:string):Promise<StoryCard[]> {
  const result=await query('SELECT data FROM story_cards WHERE job_id = ? ORDER BY ordinal',[jobId]);
  return result.rows.map(row=>JSON.parse(String(row.data)) as StoryCard);
}
export async function listStoryCards(jobId:string):Promise<{job:Job;cards:StoryCard[];stale:boolean}> {
  const result=await query('SELECT data FROM story_jobs WHERE id = ?',[jobId]);
  if(!result.rows[0])throw new Error('Job not found.');
  const job=JSON.parse(String(result.rows[0].data)) as Job;
  const cards=await rows(jobId);
  return {job,cards,stale:cards.length>0 && hash(cards.map(c=>c.narration_text).join(' '))!==hash((job.script||'').replace(/\s+/g,' ').trim())};
}
function ensureEditable(job:Job,leaseUntil:unknown){
  if(['PUBLISHING','PUBLISHED','CANCELLED'].includes(job.status))throw new Error('Cannot edit a published or cancelled story.');
  if(leaseUntil && String(leaseUntil)>new Date().toISOString())throw new Error('The worker holds an active lease. Pause the job and wait for its stage to finish.');
}
export async function rebuildStoryCards(jobId:string):Promise<StoryCard[]> {
  return withTransaction(async execute=>{
    const found=await execute('SELECT data,lease_until FROM story_jobs WHERE id = ?'+rowLockClause(),[jobId]);
    if(!found.rows[0])throw new Error('Job not found.');
    const job=JSON.parse(String(found.rows[0].data)) as Job;ensureEditable(job,found.rows[0].lease_until);
    if(!job.script)throw new Error('This story has no saved full script yet. Review or generate a script first.');
    const pairs=splitStoryCards(job.script);const previous=await execute('SELECT data FROM story_cards WHERE job_id = ? ORDER BY ordinal',[jobId]);
    const old=previous.rows.map(row=>JSON.parse(String(row.data)) as StoryCard);
    const byText=new Map<string,StoryCard[]>();for(const card of old)byText.set(card.narration_text,[...(byText.get(card.narration_text)||[]),card]);const now=new Date().toISOString();
    const cards=pairs.map(([sentence_1,sentence_2],index)=>{
      const narration_text=`${sentence_1} ${sentence_2}`;const prior=byText.get(narration_text)?.shift();
      return prior?{...prior,ordinal:index+1,updated_at:now}: {
        scene_id:randomUUID(),job_id:jobId,ordinal:index+1,revision:1,sentence_1,sentence_2,narration_text,
        voice_id:job.voice,tts_status:'pending',tts_audio_path:null,tts_duration_ms:null,
        sfx_prompt:'',sfx_path:null,sfx_status:'pending',sfx_gain_db:-12,
        canva_search_terms:[],canva_asset_id:null,canva_asset_type:null,visual_path:null,visual_status:'pending',
        subtitle_words:[],render_path:null,duration_ms:null,scene_status:'pending',error_message:null,source_references:[],
        created_at:now,updated_at:now,
      } as StoryCard;
    });
    // The complete replacement happens only after sentence validation succeeds.
    const retained=new Set(cards.map(card=>card.scene_id));
    for(const card of old)if(!retained.has(card.scene_id))await execute('INSERT INTO story_card_revisions (scene_id,revision,archived_at,data) VALUES (?,?,?,?) ON CONFLICT (scene_id,revision) DO NOTHING',[card.scene_id,card.revision,now,JSON.stringify(card)]);
    await execute('DELETE FROM story_cards WHERE job_id = ?',[jobId]);
    for(const card of cards)await execute('INSERT INTO story_cards (scene_id,job_id,ordinal,revision,data) VALUES (?,?,?,?,?)',[card.scene_id,jobId,card.ordinal,card.revision,JSON.stringify(card)]);
    return cards;
  });
}
export async function editStoryCard(jobId:string,sceneId:string,input:{narration_text?:string;sfx_prompt?:string;sfx_gain_db?:number;canva_search_terms?:string[];voice_id?:string;revision:number}):Promise<StoryCard>{
  return withTransaction(async execute=>{
    const found=await execute('SELECT data,lease_until FROM story_jobs WHERE id = ?'+rowLockClause(),[jobId]);
    if(!found.rows[0])throw new Error('Job not found.');
    const job=JSON.parse(String(found.rows[0].data)) as Job;ensureEditable(job,found.rows[0].lease_until);
    const all=(await execute('SELECT data FROM story_cards WHERE job_id = ? ORDER BY ordinal',[jobId])).rows.map(row=>JSON.parse(String(row.data)) as StoryCard);
    if(hash(all.map(c=>c.narration_text).join(' '))!==hash((job.script||'').replace(/\s+/g,' ').trim()))throw new Error('Cards are stale after a full-script edit. Rebuild cards before editing a scene.');
    const index=all.findIndex(card=>card.scene_id===sceneId);if(index<0)throw new Error('Scene not found.');
    const current=all[index];if(current.revision!==input.revision)throw new Error('Scene revision changed. Reload before saving.');
    const text=input.narration_text?.trim()??current.narration_text;
    const pairs=splitStoryCards(text);if(pairs.length!==1)throw new Error('One card must contain exactly two complete sentences.');
    const [sentence_1,sentence_2]=pairs[0];const narration_text=`${sentence_1} ${sentence_2}`;
    const speechChanged=narration_text!==current.narration_text||input.voice_id!==undefined&&input.voice_id!==current.voice_id;
    const card:StoryCard={...current,...(input.sfx_prompt!==undefined?{sfx_prompt:input.sfx_prompt}:{}),...(input.sfx_gain_db!==undefined?{sfx_gain_db:input.sfx_gain_db}:{}),...(input.canva_search_terms!==undefined?{canva_search_terms:input.canva_search_terms}:{}),...(input.voice_id!==undefined?{voice_id:input.voice_id}:{}),sentence_1,sentence_2,narration_text,revision:current.revision+1,updated_at:new Date().toISOString()};
    if(speechChanged){card.tts_status='pending';card.tts_audio_path=null;card.tts_duration_ms=null;card.subtitle_words=[];card.render_path=null;card.duration_ms=null;card.scene_status='pending';card.error_message=null;}
    await execute('INSERT INTO story_card_revisions (scene_id,revision,archived_at,data) VALUES (?,?,?,?) ON CONFLICT (scene_id,revision) DO NOTHING',[sceneId,current.revision,new Date().toISOString(),JSON.stringify(current)]);
    await execute('UPDATE story_cards SET revision = ?, data = ? WHERE scene_id = ?',[card.revision,JSON.stringify(card),sceneId]);
    if(narration_text!==current.narration_text){
      all[index]=card;const script=all.map(c=>c.narration_text).join(' ');const artifacts={...job.artifacts};for(const key of ['script','claims','draft','narration','words','transcript','captions','video','manifest','ledger','qa'])delete artifacts[key];
      const at=new Date().toISOString();const updated:Job={...job,script,scriptDraft:script,editorialApproved:false,status:'NEEDS_REVIEW',blocker:'Scene narration changed. Review sources and approve the revised full script before rendering.',artifacts,updatedAt:at,events:[...job.events,{at,stage:'NEEDS_REVIEW',message:`Scene ${card.ordinal} changed; narration and alignment for this scene were invalidated.`}].slice(-250)};
      await execute('UPDATE story_jobs SET status = ?, updated_at = ?, data = ? WHERE id = ?',[updated.status,at,JSON.stringify(updated),jobId]);
    }
    return card;
  });
}
export async function narrateStoryCard(jobId:string,sceneId:string):Promise<StoryCard>{
  const initial=await withTransaction(async execute=>{
    const found=await execute('SELECT data,lease_until FROM story_jobs WHERE id = ?'+rowLockClause(),[jobId]);if(!found.rows[0])throw new Error('Job not found.');
    const job=JSON.parse(String(found.rows[0].data)) as Job;ensureEditable(job,found.rows[0].lease_until);
    const row=await execute('SELECT data FROM story_cards WHERE scene_id = ? AND job_id = ?'+rowLockClause(),[sceneId,jobId]);if(!row.rows[0])throw new Error('Scene not found.');
    const card=JSON.parse(String(row.rows[0].data)) as StoryCard;
    const all=(await execute('SELECT data FROM story_cards WHERE job_id = ? ORDER BY ordinal',[jobId])).rows.map(item=>JSON.parse(String(item.data)) as StoryCard);
    if(hash(all.map(item=>item.narration_text).join(' '))!==hash((job.script||'').replace(/\s+/g,' ').trim()))throw new Error('Cards are stale after a full-script edit. Rebuild them before generating narration.');
    if(card.tts_status==='generating'&&Date.now()-Date.parse(card.updated_at)<10*60_000)throw new Error('Scene narration is already generating. Retry after the in-flight request finishes.');
    const changed={...card,tts_status:'generating' as CardState,error_message:null,updated_at:new Date().toISOString()};await execute('UPDATE story_cards SET data = ? WHERE scene_id = ?',[JSON.stringify(changed),sceneId]);return changed;
  });
  try{
    const audio=await synthesizeNarration(sceneId,initial.narration_text,initial.voice_id);
    let words:StoryCard['subtitle_words']=[];let alignmentError:string|null=null;
    try{const alignment=await alignNarration(sceneId,audio,initial.narration_text);words=alignment.words.map(word=>({word:word.word,start_ms:Math.round(word.start*1000),end_ms:Math.round(word.end*1000),confidence:word.confidence}));}
    catch(error){alignmentError=error instanceof Error?error.message:'Alignment unavailable.';}
    return withTransaction(async execute=>{
      const row=await execute('SELECT data FROM story_cards WHERE scene_id = ?'+rowLockClause(),[sceneId]);const current=JSON.parse(String(row.rows[0].data)) as StoryCard;
      if(current.revision!==initial.revision||current.narration_text!==initial.narration_text)throw new Error('Scene changed during synthesis. Generated audio was preserved but not attached.');
      const updated:StoryCard={...current,tts_status:'ready',tts_audio_path:audio.url,tts_duration_ms:Math.round(audio.duration*1000),subtitle_words:words,duration_ms:Math.round(audio.duration*1000),scene_status:alignmentError?'needs_review':'ready',error_message:alignmentError,updated_at:new Date().toISOString()};
      await execute('UPDATE story_cards SET data = ? WHERE scene_id = ?',[JSON.stringify(updated),sceneId]);return updated;
    });
  }catch(error){
    await withTransaction(async execute=>{const row=await execute('SELECT data FROM story_cards WHERE scene_id = ?'+rowLockClause(),[sceneId]);if(!row.rows[0])return;const card=JSON.parse(String(row.rows[0].data)) as StoryCard;if(card.revision!==initial.revision)return;const failed={...card,tts_status:'failed',scene_status:'failed',error_message:error instanceof Error?error.message:'Narration failed.',updated_at:new Date().toISOString()};await execute('UPDATE story_cards SET data = ? WHERE scene_id = ?',[JSON.stringify(failed),sceneId]);});throw error;
  }
}
