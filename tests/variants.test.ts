import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory=mkdtempSync(join(tmpdir(),'storyman-variants-'));
process.env.STORYMAN_DATA_DIR=directory;
delete process.env.DATABASE_URL; delete process.env.AI_MODEL; delete process.env.AI_BASE_URL; delete process.env.AI_API_KEY;
let variants:typeof import('../lib/variants');
let service:typeof import('../lib/story-service');
let sourceId:string;
before(async()=>{variants=await import('../lib/variants');service=await import('../lib/story-service');const source=await service.createJob({prompt:'Technical unit fixture for independently adapted narratives.',genre:'Business Empire',language:'Filipino / Taglish',duration:300,voice:'natural',platforms:['youtube','facebook','tiktok'],idempotencyKey:'variant-test-parent'});sourceId=source.job.id;await service.updateJob(sourceId,{status:'NEEDS_REVIEW',script:'Unit fixture master narration that must remain unchanged.',sources:[{title:'Unit evidence one',url:'https://example.com/one',excerpt:'Test evidence only, never used for actual generation.',accessedAt:new Date().toISOString()},{title:'Unit evidence two',url:'https://example.org/two',excerpt:'Independent test evidence only.',accessedAt:new Date().toISOString()}]});});
after(()=>rmSync(directory,{recursive:true,force:true}));

test('profiles leave room below actual destination duration limits',()=>{
 assert.equal(variants.platformProfiles.youtube.durationLimit,180);
 assert.equal(variants.platformProfiles.facebook.durationLimit,60);
 assert.equal(variants.platformProfiles.tiktok.durationLimit,60);
 for(const profile of Object.values(variants.platformProfiles))assert.ok(profile.targetDuration<profile.durationLimit);
});
test('variant requests persist honest provider blocker and have distinct output lineage',async()=>{
 const before=await service.getJob(sourceId);const result=await variants.createVariantRequest({jobId:sourceId,platform:'youtube'});
 assert.equal(result.created,true);assert.equal(result.variant.status,'BLOCKED_AUTH');assert.equal(result.variant.adaptedNarrative,false);assert.equal(result.variant.qaPassed,false);assert.equal(result.variant.sourceJobId,sourceId);assert.notEqual(result.variant.jobId,sourceId);assert.equal(result.variant.jobId,result.variant.id);assert.deepEqual((await service.getJob(sourceId))?.script,before?.script);assert.equal(result.variant.artifacts.video,undefined);
});
test('accidental duplicate request reuses variant and different platforms get separate records',async()=>{
 const a=await variants.createVariantRequest({jobId:sourceId,platform:'youtube'});const b=await variants.createVariantRequest({jobId:sourceId,platform:'facebook'});assert.equal(a.created,false);assert.equal(b.created,true);assert.notEqual(a.variant.id,b.variant.id);assert.equal((await variants.listVariants(sourceId)).length,2);
});
test('client approval cannot promote an unrendered variant or substitute client files',async()=>{
 const {variant}=await variants.createVariantRequest({jobId:sourceId,platform:'youtube'});
 await assert.rejects(()=>variants.approveVariant(variant.id,{platform:'youtube',editorialApproved:true,rightsApproved:true,confirmed:true}),/completed independent adaptation/);
 await assert.rejects(()=>variants.approveVariant(variant.id,{platform:'youtube',editorialApproved:true,rightsApproved:true,confirmed:false}));
 assert.equal((await variants.getVariant(variant.id))?.editorialApproved,false);
});
test('adapted scripts require source references, reasonable word length and no unresolved uncertainty',()=>{
 const good={title:'Complete adapted story',script:'Ito ang isang buong salaysay na may malinaw na aral. '.repeat(11),claims:[{text:'Technical unit claim',sourceUrls:['https://example.com/one']}],uncertainties:[]};
 assert.equal(variants.validateAdaptationScript(good,['https://example.com/one'],'facebook').title,good.title);
 assert.throws(()=>variants.validateAdaptationScript({...good,claims:[{text:'Unsupported',sourceUrls:['https://unprovided.example/fact']}]},['https://example.com/one'],'facebook'),/source references/);
 assert.throws(()=>variants.validateAdaptationScript({...good,uncertainties:['Source conflict']},['https://example.com/one'],'facebook'),/factual uncertainty/);
 assert.throws(()=>variants.validateAdaptationScript({...good,script:'Too short to form a complete standalone story.'},['https://example.com/one'],'facebook'));
});
test('insufficient source evidence is retained as needs-research rather than a video',async()=>{
 const source=await service.createJob({prompt:'Technical empty-source fixture for variant research gates.',genre:'Custom',language:'Filipino / Taglish',duration:300,voice:'natural',platforms:['tiktok'],idempotencyKey:'variant-empty-parent'});const {variant}=await variants.createVariantRequest({jobId:source.job.id,platform:'tiktok'});assert.equal(variant.status,'NEEDS_RESEARCH');assert.equal(variant.duration,0);assert.equal(variant.sha256,'');
});
test('shared queue lease cap permits only one concurrent main or variant worker',async()=>{
 const {variant}=await variants.createVariantRequest({jobId:sourceId,platform:'facebook'});await variants.retryVariant(variant.id,'facebook');
 const claimed=await variants.claimNextVariant();assert.ok(claimed?.leaseToken);assert.equal(await variants.claimNextVariant(),null);assert.equal(await service.claimNextJob(),null);assert.equal(await variants.heartbeatVariant(claimed.id,'incorrect-token'),false);assert.equal(await variants.heartbeatVariant(claimed.id,claimed.leaseToken),true);
 await variants.processVariant(claimed);assert.equal((await variants.getVariant(claimed.id))?.status,'BLOCKED_AUTH');
});
