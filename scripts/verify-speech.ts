/** Real local Zonos speech + real STT timestamps. Technical sample, not a researched story. */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { alignNarration, artifactPath, artifactUrl, probeMedia, renderVideo, writeArtifact, type NarrationRecord } from '../lib/media';
async function main() {
 const id='zonos-smoke';
 const request=JSON.parse(await fs.readFile(artifactPath(id,'request.json'),'utf8')) as {input:string;voice:string;language:string};
 const path=artifactPath(id,'narration.wav');const bytes=await fs.readFile(path);const metadata=await probeMedia(path);
 const narration:NarrationRecord={narrationId:id,filename:'narration.wav',path,url:artifactUrl(id,'narration.wav'),duration:metadata.duration,sha256:createHash('sha256').update(bytes).digest('hex'),original:true,createdAt:new Date().toISOString()};
 const alignment=await alignNarration(id,narration,request.input);
 const result=await renderVideo(id,{narration,alignment,title:'Local narration verification'});
 const evidence={kind:'Actual local speech technical sample; not a five-minute story',service:'Local Zonos3',voice:request.voice,language:request.language,metadata:result.metadata,alignment:{words:alignment.words.length,confidence:alignment.confidence,scriptMatch:alignment.scriptMatch},limitations:['No Tagalog-labeled default speaker installed; default AmericanMale voice used with tl text normalization','Human pronunciation, fluency and full listening review remain pending','No sourced historical story or publication acceptance is claimed'],path:result.path};
 await writeArtifact(id,'speech_verification.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
