import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import { artifactPath, buildGeminiTtsRequest, captionCues, extractGeminiTtsAudio, pcm16ToWav, resolveTtsConfig, splitForSpeech, validateAlignment, MediaBlockedError, narrationFingerprint, canReuseNarration, synthesizeNarration, writeArtifact, type NarrationRecord } from '../lib/media';

test('artifact resolution rejects traversal and absolute filenames', () => {
  for (const value of ['../secret', '..', '/tmp/file', 'foo/bar', 'foo\\bar', '%2e%2e']) assert.throws(() => artifactPath('valid-id', value));
  assert.throws(() => artifactPath('../unsafe', 'audio.wav'));
  assert.ok(artifactPath('safe-id', 'narration.wav').endsWith('/safe-id/narration.wav'));
});
test('speech chunks preserve all spoken words without truncation', () => {
  const script = 'Isang tunay na kuwento ito. '.repeat(200).trim();
  const chunks = splitForSpeech(script, 150);
  assert.ok(chunks.length > 10);
  assert.ok(chunks.every(chunk => chunk.length <= 150));
  assert.equal(chunks.join(' ').split(/\s+/).join(' '), script.split(/\s+/).join(' '));
});
test('alignment gates reject missing, low-confidence, mismatched or invalid timestamps', () => {
  assert.throws(() => validateAlignment([], 3), MediaBlockedError);
  assert.throws(() => validateAlignment([{ word: 'hello', start: 2, end: 1, confidence: .99 }], 3), MediaBlockedError);
  assert.throws(() => validateAlignment([{ word: 'hello', start: 0, end: 5, confidence: .99 }], 3), MediaBlockedError);
  assert.throws(() => validateAlignment([{ word: 'hello', start: 0, end: 1, confidence: .4 }], 3), MediaBlockedError);
  assert.throws(() => validateAlignment([{ word: 'hello', start: 0, end: 1, confidence: .99 }], 3, 'A completely different source script.'), MediaBlockedError);
  const result = validateAlignment([{ word: 'Tunay', start: .1, end: .6, confidence: .9 }, { word: 'ito.', start: .65, end: 1, confidence: .95 }], 1.1, 'Tunay ito.');
  assert.equal(result.scriptMatch, 1);
  assert.ok(result.confidence > .9);
});
test('caption grouping uses actual timestamp boundaries and splits long pauses', () => {
  const cues = captionCues([{ word: 'Tunay', start: .5, end: 1, confidence: .9 }, { word: 'ito.', start: 1.1, end: 1.5, confidence: .9 }, { word: 'Susunod.', start: 3, end: 3.5, confidence: .9 }]);
  assert.deepEqual(cues, [{ start: .5, end: 1.5, text: 'Tunay ito.' }, { start: 3, end: 3.5, text: 'Susunod.' }]);
});


test('strong aggregate alignment cannot hide a missing first or last sentence',()=>{
 const body=Array.from({length:90},(_,i)=>`body${i}`);
 const script=['startone','starttwo','startthree','startfour','startfive','startsix','startseven','starteight',...body,'endone','endtwo','endthree','endfour','endfive','endsix','endseven','endeight'].join(' ');
 const words=body.map((word,index)=>({word,start:index*.3,end:index*.3+.2,confidence:.99}));
 assert.throws(()=>validateAlignment(words,30,script),/first or last spoken sentence/);
});


test('generated narration cache is scoped to exact script, effective voice and provider configuration',()=>{
 const env={TTS_BASE_URL:'https://provider.example/v1',TTS_MODEL:'voice-model',TTS_VOICE:'actual-voice',TTS_LANGUAGE:'tl',TTS_CHUNK_CHARS:'600',TTS_API_KEY:'unit-test-only-credential'};
 const fingerprint=narrationFingerprint('Original spoken script.','natural',env);
 const record:NarrationRecord={narrationId:'unit',filename:'unit.wav',path:'/unit.wav',url:'/unit.wav',duration:1,sha256:'unit',original:false,createdAt:new Date().toISOString(),scriptSha256:fingerprint.scriptSha256,providerFingerprint:fingerprint.providerFingerprint,requestFingerprint:fingerprint.requestFingerprint};
 assert.equal(canReuseNarration(record,narrationFingerprint('Original spoken script.','natural',env)),true);
 assert.equal(canReuseNarration(record,narrationFingerprint('Edited spoken script.','natural',env)),false);
 assert.equal(canReuseNarration(record,narrationFingerprint('Original spoken script.','different-voice',env)),false);
 for(const changed of [{TTS_MODEL:'new-model'},{TTS_BASE_URL:'https://new-provider.example/v1'},{TTS_LANGUAGE:'en'},{TTS_CHUNK_CHARS:'400'},{TTS_API_KEY:'different-unit-test-credential'}])assert.equal(canReuseNarration(record,narrationFingerprint('Original spoken script.','natural',{...env,...changed})),false);
 assert.equal(canReuseNarration({...record,scriptSha256:undefined},fingerprint),false);
 assert.equal(canReuseNarration({...record,original:true},fingerprint),false);
});

test('stale legacy narration cannot bypass provider configuration after a script edit',async()=>{
 const id='unit-stale-cache-'+randomUUID();
 // Explicit technical unit bytes; never a real narration or production fixture.
 const bytes=Buffer.from('technical unit cache fixture');
 const filename=artifactPath(id,'old-generated.wav');
 const saved={base:process.env.TTS_BASE_URL,model:process.env.TTS_MODEL};
 try{
  await writeArtifact(id,'old-generated.wav',bytes);
  const record:NarrationRecord={narrationId:id,filename:'old-generated.wav',path:filename,url:'/unit-fixture',duration:1,sha256:createHash('sha256').update(bytes).digest('hex'),original:false,createdAt:new Date().toISOString()};
  await writeArtifact(id,'narration.json',JSON.stringify(record));
  delete process.env.TTS_BASE_URL;delete process.env.TTS_MODEL;
  await assert.rejects(()=>synthesizeNarration(id,'An edited script must receive new narration.'),(error:unknown)=>error instanceof MediaBlockedError && error.code==='BLOCKED_AUTH');
  assert.deepEqual(await fs.readFile(filename),bytes);
  assert.deepEqual(JSON.parse(await fs.readFile(artifactPath(id,'narration.json'),'utf8')),record);
 }finally{
  if(saved.base===undefined)delete process.env.TTS_BASE_URL;else process.env.TTS_BASE_URL=saved.base;
  if(saved.model===undefined)delete process.env.TTS_MODEL;else process.env.TTS_MODEL=saved.model;
  await fs.rm(path.dirname(filename),{recursive:true,force:true});
 }
});

test('gemini tts request carries model, style annotation, audio format and voice',()=>{
 const request=buildGeminiTtsRequest('Isang tunay na kuwento.',{model:'gemini-3.8-flash-tts',voice:'Riko',style:'Rich, velvety, unhurried audiobook narration'});
 assert.deepEqual(request,{model:'gemini-3.8-flash-tts',input:[{type:'user_input',content:[{type:'text',text:'Isang tunay na kuwento.',annotations:[{type:'speech_metadata',style:'Rich, velvety, unhurried audiobook narration'}]}]}],response_format:{type:'audio'},generation_config:{speech_config:[{voice:'Riko'}]}});
 const plain=buildGeminiTtsRequest('Walang estilo.',{model:'gemini-3.8-flash-tts',voice:'Riko'});
 assert.deepEqual(plain.input[0].content[0].annotations,[]);
});
test('tts provider resolution requires explicit Gemini selection and supports local ZONOS3',()=>{
 assert.equal(resolveTtsConfig(undefined,{GEMINI_API_KEY:'unit-test-gemini-credential'}),null);
 const gemini=resolveTtsConfig(undefined,{TTS_PROVIDER:'gemini',GEMINI_API_KEY:'unit-test-gemini-credential'});
 assert.equal(gemini?.kind,'gemini');
 assert.equal(gemini?.model,'gemini-3.8-flash-tts');
 assert.equal(gemini?.voice,'Riko');
 assert.equal(gemini?.style,'Rich, velvety, unhurried audiobook narration');
 assert.equal(gemini?.baseUrl,'https://generativelanguage.googleapis.com/v1beta');
 assert.equal(resolveTtsConfig(undefined,{TTS_BASE_URL:'https://tts.example/v1',TTS_MODEL:'voice-model'})?.kind,'openai-compatible');
 assert.equal(resolveTtsConfig(undefined,{TTS_PROVIDER:'zonos',TTS_BASE_URL:'http://127.0.0.1:1919/v1',TTS_MODEL:'zonos3'})?.kind,'zonos');
 assert.equal(resolveTtsConfig(undefined,{GEMINI_API_KEY:'k',TTS_PROVIDER:'openai-compatible',TTS_BASE_URL:'https://tts.example/v1',TTS_MODEL:'voice-model'})?.kind,'openai-compatible');
 assert.equal(resolveTtsConfig(undefined,{TTS_PROVIDER:'gemini'})?.kind,'gemini');
 assert.equal(resolveTtsConfig(undefined,{TTS_PROVIDER:'gemini',GEMINI_TTS_VOICE:'Puck'})?.voice,'Puck');
 assert.equal(resolveTtsConfig('A distinct narrator',{TTS_PROVIDER:'gemini',GEMINI_API_KEY:'k'})?.voice,'A distinct narrator');
 assert.equal(resolveTtsConfig('natural',{TTS_PROVIDER:'gemini',GEMINI_API_KEY:'k'})?.voice,'Riko');
 assert.equal(resolveTtsConfig(undefined,{}),null);
});
test('gemini audio extraction wraps headerless pcm and preserves wav bytes',()=>{
 const pcm=Buffer.alloc(480);for(let i=0;i<480;i+=2)pcm.writeInt16LE((i%200)-100,i);
 const wrapped=extractGeminiTtsAudio({steps:[{type:'model_output',content:[{type:'audio',data:pcm.toString('base64'),mime_type:'audio/l16;rate=24000'}]}]});
 assert.equal(Buffer.from(wrapped.bytes.subarray(0,4)).toString(),'RIFF');
 assert.equal(Buffer.from(wrapped.bytes.subarray(8,12)).toString(),'WAVE');
 assert.equal(wrapped.bytes.length,44+pcm.length);
 const wav=pcm16ToWav(new Uint8Array(pcm),24000,1);
 const view=Buffer.from(wav);
 assert.equal(view.readUInt32LE(24),24000);
 assert.equal(view.readUInt16LE(22),1);
 assert.equal(view.readUInt16LE(34),16);
 assert.equal(view.readUInt32LE(40),pcm.length);
 assert.deepEqual(extractGeminiTtsAudio({steps:[{type:'model_output',content:[{type:'audio',data:Buffer.from(wav).toString('base64'),mime_type:'audio/wav'}]}]}).bytes,new Uint8Array(wav));
 assert.throws(()=>extractGeminiTtsAudio({steps:[{type:'model_output',content:[{type:'text',text:'no audio'}]}]}),/did not contain an audio block/);
});
test('gemini narration fingerprints track voice, style, model and credential changes',()=>{
 const env={TTS_PROVIDER:'gemini',GEMINI_API_KEY:'unit-test-gemini-credential',GEMINI_TTS_MODEL:'gemini-3.8-flash-tts',GEMINI_TTS_VOICE:'Riko',GEMINI_TTS_STYLE:'Rich, velvety, unhurried audiobook narration'};
 const base=narrationFingerprint('Original spoken script.','natural',env);
 assert.deepEqual(narrationFingerprint('Original spoken script.','natural',{...env}),base);
 for(const changed of [{GEMINI_TTS_VOICE:'Puck'},{GEMINI_TTS_STYLE:'Brisk newsreader'},{GEMINI_TTS_MODEL:'gemini-other-tts'},{GEMINI_API_KEY:'different-unit-test-credential'}])assert.notEqual(narrationFingerprint('Original spoken script.','natural',{...env,...changed}).providerFingerprint,base.providerFingerprint);
 assert.equal(base.effectiveVoice,'Riko');
 const record:NarrationRecord={narrationId:'unit',filename:'unit.wav',path:'/unit.wav',url:'/unit.wav',duration:1,sha256:'unit',original:false,createdAt:new Date().toISOString(),scriptSha256:base.scriptSha256,providerFingerprint:base.providerFingerprint,requestFingerprint:base.requestFingerprint};
 assert.equal(canReuseNarration(record,narrationFingerprint('Original spoken script.','natural',{...env})),true);
 assert.equal(canReuseNarration(record,narrationFingerprint('Original spoken script.','natural',{...env,GEMINI_TTS_STYLE:'Brisk newsreader'})),false);
});
