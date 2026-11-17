import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { encryptSecret, getAccessToken, peekToken } from './oauth';
import { artifactPath, probeMedia, STORAGE_ROOT } from './media';
import { getKV, query, setKV } from './db';
import type { Platform } from './types';
export class PublishingBlockedError extends Error { constructor(public code:string,message:string){super(message);this.name='PublishingBlockedError';} }
export const publishMetadataSchema=z.object({title:z.string().trim().min(1).max(100),description:z.string().max(5000).default(''),hashtags:z.array(z.string().max(80)).max(30).default([]),approved:z.literal(true),rightsApproved:z.literal(true),consent:z.literal(true),privacy:z.enum(['private','unlisted','public','PUBLIC_TO_EVERYONE','MUTUAL_FOLLOW_FRIENDS','FOLLOWER_OF_CREATOR','SELF_ONLY']),isAiGenerated:z.boolean(),commercialContent:z.boolean().default(false)});
export type PublishMetadata=z.infer<typeof publishMetadataSchema>;
export interface PublishVariant {id:string;jobId:string;platform:Platform;filename:string;duration:number;sha256:string;adaptedNarrative:boolean;qaPassed:boolean;editorialApproved:boolean;rightsApproved:boolean;}
export interface Publication {id:string;variantId:string;platform:Platform;status:'UPLOADING'|'PROCESSING'|'PUBLISHED'|'PRIVATE'|'FAILED'|'REVIEW_REQUIRED'|'READY_FOR_MANUAL_TIKTOK_POST';createdAt:string;updatedAt:string;externalId?:string;url?:string;message?:string;}
export interface Publisher {validate(variant:PublishVariant,metadata:PublishMetadata):Promise<void>;publish(variant:PublishVariant,metadata:PublishMetadata,record:Publication):Promise<Publication>;getStatus(publication:Publication):Promise<Publication>;getPermalink(publication:Publication):string|undefined;retrySafely(publication:Publication):Promise<Publication>;}
async function authorizedToken(platform:Platform):Promise<string>{try{return await getAccessToken(platform);}catch(e){throw new PublishingBlockedError('BLOCKED_AUTH',e instanceof Error?e.message:`Reconnect ${platform} to authorize publication.`);}}
async function decode(response:Response,provider:string):Promise<Record<string,any>> { let body;try{body=await response.json();}catch{throw new PublishingBlockedError('PROVIDER_ERROR',`${provider} returned an invalid response (HTTP ${response.status}).`);}if(!response.ok||body.error&&(typeof body.error==='object'&&body.error.code!=='ok'))throw new PublishingBlockedError(response.status===401?'BLOCKED_AUTH':'PROVIDER_ERROR',`${provider} rejected the request (HTTP ${response.status}). Check account permissions, quota and API approval. No successful publication was recorded.`);return body; }
function mediaPath(variant:PublishVariant){const filename=artifactPath(variant.jobId,variant.filename);if(!filename.startsWith(STORAGE_ROOT+path.sep))throw new PublishingBlockedError('INVALID_VARIANT','Invalid media location.');return filename;}
export async function validateVariant(variant:PublishVariant,metadata:PublishMetadata) {
 publishMetadataSchema.parse(metadata);
 if(!variant.adaptedNarrative)throw new PublishingBlockedError('ADAPTATION_REQUIRED','Create and review a complete platform-specific narrative variant. The five-minute master cannot be posted unchanged.');
 if(!variant.qaPassed||!variant.editorialApproved||!variant.rightsApproved)throw new PublishingBlockedError('REVIEW_REQUIRED','Approve the factual claims, media rights and completed audio/video QA before publishing.');
 const media=await probeMedia(mediaPath(variant));const video=media.streams.find(stream=>stream.codec_type==='video');const audio=media.streams.find(stream=>stream.codec_type==='audio');
 if(!video||!audio||video.codec_name!=='h264'||audio.codec_name!=='aac'||video.width!==1080||video.height!==1920)throw new PublishingBlockedError('INVALID_MEDIA','The variant must be a 1080×1920 H.264/AAC MP4 with audio.');
 if(Math.abs(media.duration-variant.duration)>0.25)throw new PublishingBlockedError('INVALID_MEDIA','Variant duration does not match its reviewed manifest.');
 const bytes=await readFile(mediaPath(variant));if(createHash('sha256').update(bytes).digest('hex')!==variant.sha256)throw new PublishingBlockedError('INVALID_MEDIA','The reviewed variant has changed. Review it again.');
 if(variant.platform==='youtube'&&media.duration>180)throw new PublishingBlockedError('DURATION_LIMIT','YouTube Shorts variants must be 180 seconds or shorter.');
 if(variant.platform==='facebook'&&(media.duration<3||media.duration>60))throw new PublishingBlockedError('DURATION_LIMIT','This Facebook Reels API profile permits 3–60 seconds until longer support is verified for the connected Page.');
}
export async function loadVariant(id:string,platform:Platform):Promise<PublishVariant|null>{
 if(!/^[a-zA-Z0-9-]{1,80}$/.test(id))return null;
 return getKV<PublishVariant|null>(`variant:${platform}:${id}`,null);
}
export async function savePublication(record:Publication){record.updatedAt=new Date().toISOString();await setKV(`publication:${record.id}`,record);return record;}
export async function getPublication(id:string){return getKV<Publication|null>(`publication:${id}`,null);}
export async function reservePublication(variant:PublishVariant):Promise<{record:Publication;reserved:boolean}>{
 await query('CREATE TABLE IF NOT EXISTS publication_locks (publish_key TEXT PRIMARY KEY, created_at TEXT NOT NULL)');
 const id=createHash('sha256').update(`${variant.platform}:${variant.id}`).digest('hex').slice(0,32);const at=new Date().toISOString();const result=await query('INSERT INTO publication_locks (publish_key,created_at) VALUES (?,?) ON CONFLICT (publish_key) DO NOTHING',[id,at]);
 if(!result.changes){const prior=await getPublication(id);if(prior)return {record:prior,reserved:false};throw new PublishingBlockedError('PUBLISH_IN_PROGRESS','An upload reservation already exists. Inspect its status before retrying; a second upload was not started.');}
 const record:Publication={id,variantId:variant.id,platform:variant.platform,status:'UPLOADING',createdAt:at,updatedAt:at};await savePublication(record);return {record,reserved:true};
}
abstract class BasePublisher implements Publisher {
 async validate(variant:PublishVariant,metadata:PublishMetadata){await validateVariant(variant,metadata);if(process.env.ENABLE_LIVE_PUBLISHING!=='true')throw new PublishingBlockedError('PUBLISHING_DISABLED','Live publishing is disabled on the server. Enable it only after owner authorization and staging verification.');await authorizedToken(variant.platform);}
 abstract publish(variant:PublishVariant,metadata:PublishMetadata,record:Publication):Promise<Publication>;
 abstract getStatus(publication:Publication):Promise<Publication>;
 getPermalink(publication:Publication){return publication.url;}
 async retrySafely(publication:Publication){if(publication.externalId)return this.getStatus(publication);throw new PublishingBlockedError('REVIEW_REQUIRED','An interrupted upload has no verified external ID. Inspect the provider account before releasing this publication reservation. Automatic re-upload could create duplicates.');}
}
export class YouTubePublisher extends BasePublisher {
 async publish(variant:PublishVariant,metadata:PublishMetadata,record:Publication){
  await this.validate(variant,metadata);if(!['private','unlisted','public'].includes(metadata.privacy))throw new PublishingBlockedError('PRIVACY_REQUIRED','Select YouTube private, unlisted or public visibility.');
  const access=await authorizedToken('youtube');const filename=mediaPath(variant);const size=(await stat(filename)).size;
  const init=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json','X-Upload-Content-Type':'video/mp4','X-Upload-Content-Length':String(size)},body:JSON.stringify({snippet:{title:metadata.title,description:metadata.description,tags:metadata.hashtags,categoryId:'22'},status:{privacyStatus:metadata.privacy,selfDeclaredMadeForKids:false,containsSyntheticMedia:metadata.isAiGenerated}}),signal:AbortSignal.timeout(30000)});
  if(!init.ok)await decode(init,'YouTube');const upload=init.headers.get('location');if(!upload||new URL(upload).protocol!=='https:'||!new URL(upload).hostname.endsWith('.googleapis.com'))throw new PublishingBlockedError('PROVIDER_ERROR','YouTube did not return a valid resumable upload URL.');
  await setKV(`upload-session:${record.id}`,{provider:'youtube',session:encryptSecret({url:upload}),startedAt:new Date().toISOString()});
  const result=await decode(await fetch(upload,{method:'PUT',headers:{Authorization:`Bearer ${access}`,'Content-Type':'video/mp4','Content-Length':String(size)},body:await readFile(filename),signal:AbortSignal.timeout(600000)}),'YouTube');if(typeof result.id!=='string')throw new PublishingBlockedError('PROVIDER_ERROR','YouTube upload returned no video ID.');
  record.externalId=result.id;record.url=`https://www.youtube.com/watch?v=${result.id}`;record.status='PROCESSING';await savePublication(record);return this.getStatus(record);
 }
 async getStatus(record:Publication){if(!record.externalId)return record;const access=await authorizedToken('youtube');const result=await decode(await fetch(`https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${encodeURIComponent(record.externalId)}`,{headers:{Authorization:`Bearer ${access}`},signal:AbortSignal.timeout(20000)}),'YouTube');const item=result.items?.[0];if(!item)return savePublication({...record,status:'PROCESSING',message:'The upload exists but its processing status is not yet available.'});const processed=item.status?.uploadStatus==='processed'||item.processingDetails?.processingStatus==='succeeded';const rejected=['rejected','failed','deleted'].includes(item.status?.uploadStatus);return savePublication({...record,status:rejected?'FAILED':processed?(item.status?.privacyStatus==='public'?'PUBLISHED':'PRIVATE'):'PROCESSING',message:processed&&item.status?.privacyStatus!=='public'?'Uploaded video is private or unlisted; public publication has not been verified.':undefined});}
}
export class FacebookReelsPublisher extends BasePublisher {
 async publish(variant:PublishVariant,metadata:PublishMetadata,record:Publication){
  await this.validate(variant,metadata);const token=await peekToken('facebook');if(!token?.pageId)throw new PublishingBlockedError('BLOCKED_AUTH','Set META_PAGE_ID and reconnect to select the authorized Facebook Page.');if(metadata.privacy!=='public')throw new PublishingBlockedError('PRIVACY_REQUIRED','Facebook Page Reels are public. Explicitly select public publication.');const access=await authorizedToken('facebook');const version=process.env.META_GRAPH_VERSION||'v27.0';const endpoint=`https://graph.facebook.com/${version}/${token.pageId}/video_reels`;const headers={Authorization:`Bearer ${access}`,'Content-Type':'application/x-www-form-urlencoded'};
  const init=await decode(await fetch(endpoint,{method:'POST',headers,body:new URLSearchParams({upload_phase:'START'}),signal:AbortSignal.timeout(20000)}),'Facebook');if(!init.video_id||!init.upload_url)throw new PublishingBlockedError('PROVIDER_ERROR','Facebook did not return a Reel upload session.');const upload=new URL(init.upload_url);if(upload.protocol!=='https:'||upload.hostname!=='rupload.facebook.com')throw new PublishingBlockedError('PROVIDER_ERROR','Facebook returned an unexpected upload destination.');record.externalId=String(init.video_id);await savePublication(record);
  const filename=mediaPath(variant);const bytes=await readFile(filename);await decode(await fetch(upload,{method:'POST',headers:{Authorization:`OAuth ${access}`,offset:'0',file_size:String(bytes.length),'Content-Type':'application/octet-stream'},body:bytes,signal:AbortSignal.timeout(600000)}),'Facebook');
  await decode(await fetch(endpoint,{method:'POST',headers,body:new URLSearchParams({upload_phase:'FINISH',video_id:String(init.video_id),video_state:'PUBLISHED',title:metadata.title,description:metadata.description,is_ai_generated:String(metadata.isAiGenerated)}),signal:AbortSignal.timeout(30000)}),'Facebook');record.status='PROCESSING';await savePublication(record);return this.getStatus(record);
 }
 async getStatus(record:Publication){if(!record.externalId)return record;const access=await authorizedToken('facebook');const result=await decode(await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v27.0'}/${encodeURIComponent(record.externalId)}?fields=status,permalink_url,published`,{headers:{Authorization:`Bearer ${access}`},signal:AbortSignal.timeout(20000)}),'Facebook');return savePublication({...record,status:result.published===true&&result.permalink_url?'PUBLISHED':'PROCESSING',url:result.permalink_url||record.url});}
}
export interface TikTokCreatorInfo{creator_nickname:string;creator_username?:string;privacy_level_options:string[];max_video_post_duration_sec:number;comment_disabled:boolean;duet_disabled:boolean;stitch_disabled:boolean;}
export async function queryTikTokCreatorInfo():Promise<TikTokCreatorInfo>{const access=await authorizedToken('tiktok');const result=await decode(await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/',{method:'POST',headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json; charset=UTF-8'},signal:AbortSignal.timeout(20000)}),'TikTok');if(!result.data||!Array.isArray(result.data.privacy_level_options))throw new PublishingBlockedError('PROVIDER_ERROR','TikTok creator information is unavailable.');return result.data;}
export class TikTokPublisher extends BasePublisher {
 async validate(variant:PublishVariant,metadata:PublishMetadata){await validateVariant(variant,metadata);const info=await queryTikTokCreatorInfo();if(!metadata.privacy||!info.privacy_level_options.includes(metadata.privacy))throw new PublishingBlockedError('PRIVACY_REQUIRED','Manually select a privacy option from the current TikTok creator information.');if(variant.duration>info.max_video_post_duration_sec)throw new PublishingBlockedError('DURATION_LIMIT','This variant exceeds the current TikTok account duration limit.');}
 async publish(variant:PublishVariant,metadata:PublishMetadata,record:Publication){await this.validate(variant,metadata);return savePublication({...record,status:'READY_FOR_MANUAL_TIKTOK_POST',message:'Direct Post audit and intended-use eligibility are not verified. Download the reviewed MP4 and caption, then post through the official TikTok app.'});}
 async getStatus(record:Publication){return record;}
}
export function getPublisher(platform:Platform):Publisher{return platform==='youtube'?new YouTubePublisher():platform==='facebook'?new FacebookReelsPublisher():new TikTokPublisher();}
