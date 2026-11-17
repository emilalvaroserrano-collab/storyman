import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
process.env.STORYMAN_DATA_DIR=mkdtempSync(join(tmpdir(),'storyman-cards-test-'));
const cardsModule=import('../lib/story-cards');

test('sentence boundaries preserve abbreviations, decimals, dialogue and Taglish',async()=>{
  const {splitStorySentences,splitStoryCards}=await cardsModule;
  assert.deepEqual(splitStorySentences('Dr. Reyes paid ₱1.25. Bumalik siya kinabukasan!'),['Dr. Reyes paid ₱1.25.','Bumalik siya kinabukasan!']);
  assert.deepEqual(splitStorySentences('She founded Acme Inc. Then the team grew.'),['She founded Acme Inc.','Then the team grew.']);
  assert.deepEqual(splitStorySentences('He paused... Then he returned.'),['He paused...','Then he returned.']);
  assert.deepEqual(splitStoryCards('She compared A vs. B. Then she chose. "We did it!" she said. The team cheered.'),[
    ['She compared A vs. B.','Then she chose.'],['"We did it!" she said.','The team cheered.'],
  ]);
  assert.throws(()=>splitStoryCards('One. Two. Three.'),/exactly two/);
  assert.throws(()=>splitStoryCards('One. The last thought'),/terminal punctuation/);
  assert.throws(()=>splitStoryCards(''),/complete narration/);
});

test('scene rebuild is atomic, preserves unchanged scene IDs and invalidates only edited speech',async()=>{
  const {createJob,updateJob,getJob}=await import('../lib/story-service');
  const {rebuildStoryCards,editStoryCard,listStoryCards}=await cardsModule;
  const script='One begins. Two follows. Three arrives. Four leaves.';
  const {job}=await createJob({prompt:'A documented story for scene testing',genre:'Test',language:'English',duration:60,voice:'natural',platforms:['youtube'],idempotencyKey:randomUUID()});
  await updateJob(job.id,{script,status:'NEEDS_REVIEW'});
  const first=await rebuildStoryCards(job.id);assert.equal(first.length,2);assert.notEqual(first[0].scene_id,first[1].scene_id);
  const edited=await editStoryCard(job.id,first[0].scene_id,{revision:first[0].revision,narration_text:'One begins again. Two follows.',sfx_prompt:'Soft room tone.'});
  assert.equal(edited.tts_status,'pending');assert.equal(edited.narration_text,'One begins again. Two follows.');
  assert.equal((await getJob(job.id))?.editorialApproved,false);
  const second=await listStoryCards(job.id);assert.equal(second.stale,false);assert.equal(second.cards[1].scene_id,first[1].scene_id);
  const {query}=await import('../lib/db');const history=await query('SELECT data FROM story_card_revisions WHERE scene_id = ?',[first[0].scene_id]);assert.equal(history.rows.length,1);
  await assert.rejects(()=>editStoryCard(job.id,first[0].scene_id,{revision:first[0].revision,sfx_prompt:'Changed'}),/revision changed/);
  await updateJob(job.id,{script:'One. Two. Three.'});
  await assert.rejects(()=>rebuildStoryCards(job.id),/exactly two/);
  const after=await listStoryCards(job.id);assert.equal(after.cards.length,2);assert.equal(after.cards[0].scene_id,first[0].scene_id);
});
