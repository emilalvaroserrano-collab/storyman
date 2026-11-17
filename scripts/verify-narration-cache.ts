/** Actual configured local TTS cache regression verification; no story job is inserted. */
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { synthesizeNarration, writeArtifact } from '../lib/media';
async function main(){
 const id=`narration-cache-proof-${randomUUID()}`;
 const first=await synthesizeNarration(id,'Sa maliit na simula, may bagong pagkakataon.','natural');
 const reused=await synthesizeNarration(id,'Sa maliit na simula, may bagong pagkakataon.','natural');
 if(first.path!==reused.path || first.requestFingerprint!==reused.requestFingerprint)throw new Error('An exact request was not reused.');
 const edited=await synthesizeNarration(id,'Sa bawat bagong araw, maaari nating baguhin ang ating kuwento.','natural');
 if(edited.path===first.path || edited.requestFingerprint===first.requestFingerprint)throw new Error('An edited script reused stale narration.');
 const restored=await synthesizeNarration(id,'Sa maliit na simula, may bagong pagkakataon.','natural');
 const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
 const firstPreserved=hash(await fs.readFile(first.path))===first.sha256;
 const editedPreserved=hash(await fs.readFile(edited.path))===edited.sha256;
 if(!firstPreserved||!editedPreserved||restored.path!==first.path)throw new Error('Generated audio versions were not preserved/reusable.');
 const evidence={technicalVerification:true,id,exactRequestReused:true,changedScriptGeneratedDistinctAudio:true,firstAudioPreserved:firstPreserved,editedAudioPreserved:editedPreserved,earlierVersionReusable:true,first:{path:first.path,duration:first.duration,scriptSha256:first.scriptSha256},edited:{path:edited.path,duration:edited.duration,scriptSha256:edited.scriptSha256}};
 await writeArtifact(id,'cache_verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
