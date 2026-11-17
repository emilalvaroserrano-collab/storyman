import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildScenePlan } from './scene-plan';
import type { ResearchSource } from './types';

export const STORAGE_ROOT = path.resolve(/* turbopackIgnore: true */ process.env.STORAGE_DIR || 'data/artifacts');
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SAFE_COMPONENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/;
export class MediaBlockedError extends Error {
  constructor(public code: 'BLOCKED_AUTH' | 'NEEDS_REVIEW' | 'NEEDS_RESEARCH' | 'BLOCKED_RIGHTS' | 'CANVA_CAPABILITY_MISSING' | 'FAILED', message: string) { super(message); this.name = 'MediaBlockedError'; }
}
export interface MediaMetadata { duration: number; size: number; streams: { codec_type: string; codec_name?: string; width?: number; height?: number; r_frame_rate?: string; duration?: string }[] }
export interface NarrationRecord { narrationId: string; filename: string; path: string; url: string; duration: number; sha256: string; original: boolean; createdAt: string; scriptSha256?: string; providerFingerprint?: string; requestFingerprint?: string; voice?: string; }
export interface WordTiming { word: string; start: number; end: number; confidence: number; }
export interface AlignmentResult { words: WordTiming[]; transcript: string; confidence: number; scriptMatch?: number; duration: number; url: string; }
export interface MediaCandidate { id: string; source: string; title: string; license: string; allowedPlatforms: string[]; uri: string; }
export interface MediaProvider { search(query: string, mediaType: 'image' | 'video', aspect: '9:16', license: string): Promise<MediaCandidate[]>; preview(asset: MediaCandidate): Promise<string>; select(asset: MediaCandidate): Promise<MediaCandidate>; getUsageRights(asset: MediaCandidate): Promise<{ license: string; allowedPlatforms: string[] }>; acquire(asset: MediaCandidate): Promise<string>; logProvenance(jobId: string, asset: MediaCandidate): Promise<void>; }
export class CanvaMediaProvider implements MediaProvider {
  async search(): Promise<MediaCandidate[]> { throw new MediaBlockedError('CANVA_CAPABILITY_MISSING', 'Canva stock-library search and standalone stock-file acquisition are not enabled. Connect a permitted design/export workflow or supply licensed media. Original graphic rendering is available.'); }
  async preview(asset: MediaCandidate) { return asset.uri; }
  async select(asset: MediaCandidate) { return asset; }
  async getUsageRights(asset: MediaCandidate) { return { license: asset.license, allowedPlatforms: asset.allowedPlatforms }; }
  async acquire(): Promise<string> { throw new MediaBlockedError('CANVA_CAPABILITY_MISSING', 'Canva stock acquisition requires a verified permitted export and applicable content license.'); }
  async logProvenance(jobId: string, asset: MediaCandidate) { await writeArtifact(jobId, 'canva_asset.json', JSON.stringify(asset, null, 2)); }
}
export function artifactPath(id: string, filename: string): string {
  if (!SAFE_COMPONENT.test(id) || !SAFE_COMPONENT.test(filename) || id === '.' || id === '..' || filename === '.' || filename === '..') throw new Error('Invalid artifact path');
  return path.join(/* turbopackIgnore: true */ STORAGE_ROOT, id, filename);
}
export function artifactUrl(id: string, filename: string) { artifactPath(id, filename); return `/api/artifacts/${encodeURIComponent(id)}/${encodeURIComponent(filename)}`; }
export async function writeArtifact(id: string, filename: string, content: string | Uint8Array): Promise<string> {
  const dest = artifactPath(id, filename); await fs.mkdir(path.dirname(dest), { recursive: true });
  const temporary = `${dest}.${randomUUID()}.tmp`; await fs.writeFile(temporary, content, { mode: 0o600 }); await fs.rename(temporary, dest); return artifactUrl(id, filename);
}
export async function runCommand(binary: string, args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '', stderr = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => { if (stdout.length < 8_000_000) stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4000); });
    child.on('error', error => { clearTimeout(timer); reject(new Error(`Required command ${path.basename(binary)} is unavailable: ${error.message}`)); });
    child.on('close', code => { clearTimeout(timer); if (code === 0) resolve(stdout); else reject(new Error(timedOut ? `${path.basename(binary)} timed out` : `${path.basename(binary)} failed (${code}): ${stderr.replace(/https?:\/\/[^\s]+/g, '[remote URL]')}`)); });
  });
}
export async function probeMedia(filename: string): Promise<MediaMetadata> {
  const raw = await runCommand(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filename]);
  const data = JSON.parse(raw); const duration = Number(data.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 7200) throw new Error('Media must have a valid duration between 0 and 7200 seconds.');
  return { duration, size: Number(data.format?.size || 0), streams: data.streams || [] };
}
function detectAudio(bytes: Uint8Array): 'wav' | 'mp3' | null {
  const start = Buffer.from(bytes.slice(0, 12));
  if (start.toString('ascii', 0, 4) === 'RIFF' && start.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (start.toString('ascii', 0, 3) === 'ID3' || (start[0] === 0xff && (start[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
}
export async function saveNarration(file: File): Promise<NarrationRecord> {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error('Upload a WAV or MP3 file up to 100 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer()); const ext = detectAudio(bytes);
  if (!ext) throw new Error('File contents must be WAV or MP3 audio.');
  const accepted = ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave', 'audio/mpeg', 'audio/mp3', 'application/octet-stream', ''];
  if (!accepted.includes(file.type)) throw new Error('Unsupported narration MIME type.');
  const narrationId = randomUUID(); const filename = `original.${ext}`;
  const filenamePath = artifactPath(narrationId, filename); await writeArtifact(narrationId, filename, bytes);
  try {
    const metadata = await probeMedia(filenamePath);
    if (!metadata.streams.some(stream => stream.codec_type === 'audio') || metadata.streams.some(stream => stream.codec_type === 'video')) throw new Error('Narration must contain audio only.');
    const record: NarrationRecord = { narrationId, filename: file.name.slice(0, 200), path: filenamePath, url: artifactUrl(narrationId, filename), duration: metadata.duration, sha256: createHash('sha256').update(bytes).digest('hex'), original: true, createdAt: new Date().toISOString() };
    await fs.chmod(filenamePath, 0o400); await writeArtifact(narrationId, 'narration.json', JSON.stringify(record, null, 2)); return record;
  } catch (error) { await fs.rm(path.dirname(filenamePath), { recursive: true, force: true }); throw error; }
}
export async function getNarration(id: string): Promise<NarrationRecord> {
  const record = JSON.parse(await fs.readFile(artifactPath(id, 'narration.json'), 'utf8')) as NarrationRecord;
  const actual = createHash('sha256').update(await fs.readFile(record.path)).digest('hex');
  if (record.sha256 !== actual) throw new Error('Narration integrity check failed. The original audio must remain unchanged.');
  return record;
}
export function splitForSpeech(script: string, maxLength = 1800): string[] {
  const sentences = script.replace(/\r/g, '').split(/(?<=[.!?])\s+|\n{2,}/).filter(Boolean); const chunks: string[] = []; let current = '';
  for (const sentence of sentences) {
    if (sentence.length > maxLength) { if (current) { chunks.push(current); current = ''; } const words = sentence.split(/\s+/); for (const word of words) { if ((current + ' ' + word).length > maxLength) { chunks.push(current); current = word; } else current += (current ? ' ' : '') + word; } }
    else if ((current + ' ' + sentence).length > maxLength) { if (current) chunks.push(current); current = sentence; }
    else current += (current ? ' ' : '') + sentence;
  }
  if (current) chunks.push(current); return chunks;
}
export interface NarrationFingerprint { scriptSha256: string; providerFingerprint: string; requestFingerprint: string; effectiveVoice: string; chunkSize: number; }
export type TtsProviderKind = 'gemini' | 'openai-compatible' | 'zonos';
export interface ResolvedTtsConfig { kind: TtsProviderKind; baseUrl: string; model: string; voice: string; apiKey: string; style?: string; }
export const GEMINI_TTS_DEFAULT_MODEL = 'gemini-3.8-flash-tts';
export const GEMINI_TTS_DEFAULT_VOICE = 'Riko';
export const GEMINI_TTS_DEFAULT_STYLE = 'Rich, velvety, unhurried audiobook narration';
export const GEMINI_TTS_DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const NATURAL_VOICES = ['Natural storyteller', 'natural'];
function ttsUsesGemini(env: Record<string,string|undefined>) {
  const explicit = (env.TTS_PROVIDER || '').trim().toLowerCase();
  if (['gemini', 'google', 'google-gemini'].includes(explicit)) return true;
  return explicit === 'gemini' || explicit === 'google' || explicit === 'google-gemini';
}
export function resolveTtsConfig(voice?: string, env: Record<string,string|undefined> = process.env): ResolvedTtsConfig | null {
  const selected = voice && !NATURAL_VOICES.includes(voice) ? voice : undefined;
  if (ttsUsesGemini(env)) return {
    kind: 'gemini', baseUrl: (env.GEMINI_TTS_BASE_URL || GEMINI_TTS_DEFAULT_BASE_URL).replace(/\/$/, ''),
    model: env.GEMINI_TTS_MODEL?.trim() || GEMINI_TTS_DEFAULT_MODEL, voice: selected || env.GEMINI_TTS_VOICE?.trim() || GEMINI_TTS_DEFAULT_VOICE,
    apiKey: env.GEMINI_API_KEY?.trim() || '', style: env.GEMINI_TTS_STYLE?.trim() || GEMINI_TTS_DEFAULT_STYLE,
  };
  if (!env.TTS_BASE_URL || !env.TTS_MODEL) return null;
  return { kind: env.TTS_PROVIDER?.toLowerCase()==='zonos'?'zonos':'openai-compatible', baseUrl: env.TTS_BASE_URL.replace(/\/$/, ''), model: env.TTS_MODEL, voice: selected || env.TTS_VOICE || 'alloy', apiKey: env.TTS_API_KEY || '' };
}
export function narrationFingerprint(script: string, voice?: string, env: Record<string,string|undefined> = process.env): NarrationFingerprint {
  const configured=Number(env.TTS_CHUNK_CHARS);
  const chunkSize=Number.isFinite(configured)&&configured>0 ? Math.floor(Math.max(200,Math.min(1800,configured))) : 1800;
  const gemini=ttsUsesGemini(env);
  const selected=voice && !NATURAL_VOICES.includes(voice) ? voice : undefined;
  const effectiveVoice=gemini ? selected || env.GEMINI_TTS_VOICE || GEMINI_TTS_DEFAULT_VOICE : selected || env.TTS_VOICE || 'alloy';
  const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
  const scriptSha256=hash(script);
  const normalization='ffmpeg-loudnorm-I-16-TP-1.5-LRA11-48k-mono-v1';
  const providerFingerprint=gemini
    ? hash(JSON.stringify({provider:'gemini-interactions',base:(env.GEMINI_TTS_BASE_URL||GEMINI_TTS_DEFAULT_BASE_URL).replace(/\/$/,''),model:env.GEMINI_TTS_MODEL||GEMINI_TTS_DEFAULT_MODEL,voice:effectiveVoice,style:env.GEMINI_TTS_STYLE||GEMINI_TTS_DEFAULT_STYLE,chunkSize,credentialScope:hash(env.GEMINI_API_KEY||''),normalization}))
    : hash(JSON.stringify({base:env.TTS_BASE_URL?.replace(/\/$/,''),model:env.TTS_MODEL,voice:effectiveVoice,language:env.TTS_LANGUAGE||'',chunkSize,credentialScope:hash(env.TTS_API_KEY||''),normalization}));
  return {scriptSha256,providerFingerprint,requestFingerprint:hash(JSON.stringify({scriptSha256,providerFingerprint})),effectiveVoice,chunkSize};
}
export function buildGeminiTtsRequest(script: string, config: { model: string; voice: string; style?: string }) {
  return {
    model: config.model,
    input: [{ type: 'user_input', content: [{ type: 'text', text: script, annotations: config.style ? [{ type: 'speech_metadata', style: config.style }] : [] }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: config.voice }] },
  };
}
function base64AudioBytes(value: string): Uint8Array {
  const cleaned = value.trim().startsWith('data:') && value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  const bytes = Buffer.from(cleaned, 'base64');
  if (!bytes.length) throw new Error('Gemini TTS returned an empty audio block.');
  return new Uint8Array(bytes);
}
function sampleRateFromMime(mime: string | undefined) {
  const rate = Number((mime || '').match(/rate=(\d+)/i)?.[1]);
  return Number.isFinite(rate) && rate >= 8000 && rate <= 48000 ? rate : 24000;
}
export function pcm16ToWav(pcm: Uint8Array, sampleRate = 24000, channels = 1) {
  const header = Buffer.alloc(44); const data = Buffer.from(pcm);
  const byteRate = sampleRate * channels * 2;
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(byteRate, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return new Uint8Array(Buffer.concat([header, data]));
}
export function extractGeminiTtsAudio(payload: unknown): { bytes: Uint8Array; mimeType?: string } {
  const data = payload as { steps?: { type?: string; content?: { type?: string; data?: string; mime_type?: string; mimeType?: string }[] }[]; output_audio?: { data?: string }; outputAudio?: { data?: string }; candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string }; inline_data?: { data?: string; mime_type?: string } }[] } }[] };
  const blocks = (data.steps || []).filter(step => step?.type === 'model_output').flatMap(step => step.content || []).filter(block => block?.type === 'audio' && typeof block.data === 'string');
  const chosen = blocks[blocks.length - 1];
  if (chosen?.data) {
    const mimeType = chosen.mime_type || chosen.mimeType;
    const raw = base64AudioBytes(chosen.data);
    const bytes = !detectAudio(raw) && /l16|pcm/i.test(mimeType || '') ? pcm16ToWav(raw, sampleRateFromMime(mimeType)) : raw;
    return { bytes, mimeType };
  }
  const direct = data.output_audio?.data || data.outputAudio?.data;
  if (direct) return { bytes: base64AudioBytes(direct), mimeType: 'audio/wav' };
  for (const candidate of data.candidates || []) for (const part of candidate.content?.parts || []) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      const mimeType = 'mimeType' in inline ? inline.mimeType : 'mime_type' in inline ? inline.mime_type : undefined;
      const raw = base64AudioBytes(inline.data);
      return { bytes: /l16|pcm/i.test(mimeType || '') && !detectAudio(raw) ? pcm16ToWav(raw, sampleRateFromMime(mimeType)) : raw, mimeType };
    }
  }
  throw new Error('Gemini TTS response did not contain an audio block.');
}
function ttsErrorMessage(provider: string, status: number, body: string) {
  const detail = body.replace(/https?:\/\/[^\s"']+/g, '[remote URL]').replace(/\s+/g, ' ').trim().slice(0, 320);
  return new MediaBlockedError('BLOCKED_AUTH', `${provider} returned HTTP ${status}. Verify the configured model, voice, API key and quota.${detail ? ` Provider detail: ${detail}` : ''}`);
}
export function canReuseNarration(record: NarrationRecord, fingerprint: NarrationFingerprint): boolean {
  return !record.original && record.scriptSha256===fingerprint.scriptSha256 && record.providerFingerprint===fingerprint.providerFingerprint && record.requestFingerprint===fingerprint.requestFingerprint;
}
async function readNarrationVersion(jobId:string,filename:string):Promise<NarrationRecord|null> {
  let record:NarrationRecord;
  try {record=JSON.parse(await fs.readFile(artifactPath(jobId,filename),'utf8')) as NarrationRecord;}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  const actual=createHash('sha256').update(await fs.readFile(record.path)).digest('hex');
  if(actual!==record.sha256)throw new MediaBlockedError('NEEDS_REVIEW','A stored narration version failed its integrity check. Preserve and inspect the audio before regenerating.');
  return record;
}
export async function synthesizeNarration(jobId: string, script: string, voice?: string): Promise<NarrationRecord> {
  if (!script.trim()) throw new Error('A spoken script is required for narration.');
  const config=resolveTtsConfig(voice);
  const fingerprint=narrationFingerprint(script,voice);
  const previous=await readNarrationVersion(jobId,'narration.json');
  if(previous?.original)throw new MediaBlockedError('NEEDS_REVIEW','Uploaded narration is immutable. A synthesis request cannot replace an uploaded audio master.');
  if(previous && canReuseNarration(previous,fingerprint))return previous;
  if(!config) throw new MediaBlockedError('BLOCKED_AUTH', 'Configure local ZONOS3-Mini using TTS_PROVIDER=zonos, TTS_BASE_URL and TTS_MODEL, or upload your own WAV/MP3 narration.');
  if(config.kind==='gemini' && !config.apiKey) throw new MediaBlockedError('BLOCKED_AUTH', 'Gemini TTS is selected but GEMINI_API_KEY is empty. Add the server-side key or upload your own WAV/MP3 narration.');
  const versionName=`narration-${fingerprint.requestFingerprint}`;
  const existing=await readNarrationVersion(jobId,`${versionName}.json`);
  if(existing && canReuseNarration(existing,fingerprint)) {if(previous && previous.path!==existing.path)await writeArtifact(jobId,`narration-history-${randomUUID()}.json`,JSON.stringify(previous,null,2));await writeArtifact(jobId,'narration.json',JSON.stringify(existing,null,2));return existing;}
  const runId=randomUUID();
  const chunks=splitForSpeech(script,fingerprint.chunkSize);const paths:string[]=[];
  for (let index = 0; index < chunks.length; index++) {
    let bytes: Uint8Array;
    if(config.kind==='gemini') {
      const response=await fetch(`${config.baseUrl}/interactions`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':config.apiKey},body:JSON.stringify(buildGeminiTtsRequest(chunks[index],{model:config.model,voice:config.voice,style:config.style})),signal:AbortSignal.timeout(180_000)});
      if(!response.ok)throw ttsErrorMessage('Gemini TTS',response.status,await response.text().catch(()=>''));
      bytes=extractGeminiTtsAudio(await response.json()).bytes;
    } else {
      const response=await fetch(`${config.baseUrl}/audio/speech`,{method:'POST',headers:{'Content-Type':'application/json',...(config.apiKey?{Authorization:`Bearer ${config.apiKey}`}:{})},body:JSON.stringify({model:config.model,input:chunks[index],voice:config.voice,response_format:'wav',...(process.env.TTS_LANGUAGE?{language:process.env.TTS_LANGUAGE}:{})}),signal:AbortSignal.timeout(120_000)});
      if(!response.ok)throw ttsErrorMessage('TTS provider',response.status,await response.text().catch(()=>''));
      bytes=new Uint8Array(await response.arrayBuffer());
    }
    if(bytes.length > 100*1024*1024 || !detectAudio(bytes))throw new Error('TTS response was not valid WAV/MP3 audio.');
    const extension=detectAudio(bytes)==='mp3'?'mp3':'wav';
    const filename=`tts-${fingerprint.requestFingerprint.slice(0,16)}-${runId}-${index}.${extension}`;await writeArtifact(jobId,filename,bytes);paths.push(artifactPath(jobId,filename));
  }
  const concatName=`tts-concat-${fingerprint.requestFingerprint.slice(0,16)}-${runId}.txt`;
  const listPath=artifactPath(jobId,concatName);await writeArtifact(jobId,concatName,paths.map(item=>`file '${item.replace(/'/g,"'\\''")}'`).join('\n'));
  const outputFilename=`narration-${fingerprint.requestFingerprint.slice(0,24)}-${runId}.wav`,outputPath=artifactPath(jobId,outputFilename);
  await runCommand(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath], 600_000);
  const metadata=await probeMedia(outputPath);const bytes=await fs.readFile(outputPath);
  const record:NarrationRecord={narrationId:jobId,filename:outputFilename,path:outputPath,url:artifactUrl(jobId,outputFilename),duration:metadata.duration,sha256:createHash('sha256').update(bytes).digest('hex'),original:false,createdAt:new Date().toISOString(),scriptSha256:fingerprint.scriptSha256,providerFingerprint:fingerprint.providerFingerprint,requestFingerprint:fingerprint.requestFingerprint,voice:fingerprint.effectiveVoice};
  // Old completed audio keeps its existing unique path. Preserve legacy metadata too.
  if(previous)await writeArtifact(jobId,`narration-history-${randomUUID()}.json`,JSON.stringify(previous,null,2));
  await fs.chmod(outputPath,0o400);await writeArtifact(jobId,`${versionName}.json`,JSON.stringify(record,null,2));await writeArtifact(jobId,'narration.json',JSON.stringify(record,null,2));return record;
}
function normalizeText(input: string): string[] { return input.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean); }
export function validateAlignment(words: WordTiming[], duration: number, script?: string): { confidence: number; scriptMatch?: number } {
  if (!Array.isArray(words) || words.length === 0 || words.length > 30_000) throw new MediaBlockedError('NEEDS_REVIEW', 'Alignment produced no valid word timestamps.');
  let last = -1; let total = 0;
  for (const word of words) {
    if (typeof word.word !== 'string' || !word.word.trim() || !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < 0 || word.end <= word.start || word.start < last - 0.1 || word.end > duration + 0.25 || !Number.isFinite(word.confidence) || word.confidence < 0 || word.confidence > 1) throw new MediaBlockedError('NEEDS_REVIEW', 'Alignment contains invalid, unordered or out-of-range word timings. Correct the alignment before rendering.');
    last = word.end; total += word.confidence;
  }
  const confidence = total / words.length;
  if (confidence < 0.6) throw new MediaBlockedError('NEEDS_REVIEW', 'Average word confidence is below 60%. Review the narration and alignment.');
  let scriptMatch: number | undefined;
  if (script) {
    const expected = normalizeText(script), actual = normalizeText(words.map(word => word.word).join(' '));
    const frequencies = new Map<string, number>(); for (const word of actual) frequencies.set(word, (frequencies.get(word) || 0) + 1);
    let matches = 0; for (const word of expected) if ((frequencies.get(word) || 0) > 0) { matches++; frequencies.set(word, frequencies.get(word)! - 1); }
    scriptMatch = matches / Math.max(expected.length, actual.length, 1);
    if (scriptMatch < 0.75) throw new MediaBlockedError('NEEDS_REVIEW', 'Transcript differs materially from the script (less than 75% word agreement). Review actual speech; timestamps were not fabricated.');
    // Aggregate agreement alone can hide a missing first or last sentence.
    const edgeCount=Math.min(8,expected.length), window=Math.min(actual.length,edgeCount+4);
    const edgeAgreement=(reference:string[],observed:string[])=>{const available=new Map<string,number>();for(const token of observed)available.set(token,(available.get(token)||0)+1);let matched=0;for(const token of reference)if((available.get(token)||0)>0){matched++;available.set(token,available.get(token)!-1);}return matched/Math.max(1,reference.length);};
    if(edgeAgreement(expected.slice(0,edgeCount),actual.slice(0,window))<.5 || edgeAgreement(expected.slice(-edgeCount),actual.slice(-window))<.5) throw new MediaBlockedError('NEEDS_REVIEW','The first or last spoken sentence does not match the narration script. Inspect the complete audio; no sentence was silently trimmed.');
  }
  return { confidence, scriptMatch };
}
export async function alignNarration(jobId: string, narration: NarrationRecord, script?: string): Promise<AlignmentResult> {
  const outputPath = artifactPath(jobId, 'alignment_raw.json'); await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const scriptPath = artifactPath(jobId, 'spoken_script.txt'); if (script) await writeArtifact(jobId, 'spoken_script.txt', script);
  let argv: string[];
  try { argv = process.env.ALIGNMENT_COMMAND_JSON ? JSON.parse(process.env.ALIGNMENT_COMMAND_JSON) : []; } catch { throw new MediaBlockedError('BLOCKED_AUTH', 'ALIGNMENT_COMMAND_JSON must be a JSON array of a binary and arguments, without shell syntax.'); }
  if (!Array.isArray(argv) || !argv.length || !argv.every(value => typeof value === 'string')) throw new MediaBlockedError('BLOCKED_AUTH', 'Configure ALIGNMENT_COMMAND_JSON with a real word alignment command. Example: ["python3","scripts/align.py","--audio","{audio}","--output","{output}"]. Install the separately listed alignment requirements first.');
  argv = argv.map(value => value.replaceAll('{audio}', narration.path).replaceAll('{output}', outputPath).replaceAll('{script}', scriptPath));
  await runCommand(argv[0], argv.slice(1), 30 * 60_000);
  const raw = JSON.parse(await fs.readFile(outputPath, 'utf8')); const words = raw.words as WordTiming[]; const quality = validateAlignment(words, narration.duration, script);
  const result: AlignmentResult = { words, transcript: words.map(word => word.word).join(' '), ...quality, duration: narration.duration, url: artifactUrl(jobId, 'words.json') };
  await writeArtifact(jobId, 'words.json', JSON.stringify(result, null, 2)); await writeArtifact(jobId, 'transcript.json', JSON.stringify({ text: result.transcript, words, confidence: result.confidence }, null, 2));
  await writeCaptionArtifacts(jobId, words); return result;
}
export interface CaptionCue { start: number; end: number; text: string; }
export function captionCues(words: WordTiming[]): CaptionCue[] {
  const cues: CaptionCue[] = []; let group: WordTiming[] = [];
  for (const word of words) {
    if (group.length && (group.length >= 7 || (group.map(item => item.word).join(' ') + ' ' + word.word).length > 58 || word.start - group[group.length - 1].end > 0.8)) { cues.push({ start: group[0].start, end: group[group.length - 1].end, text: group.map(item => item.word).join(' ') }); group = []; }
    group.push(word);
  }
  if (group.length) cues.push({ start: group[0].start, end: group[group.length - 1].end, text: group.map(item => item.word).join(' ') }); return cues;
}
function stamp(seconds: number, separator = ',') { const ms = Math.round(seconds * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`; }
function assStamp(seconds: number) { return stamp(seconds, '.').replace(/^0/, '').slice(0, -1); }
export async function writeCaptionArtifacts(jobId: string, words: WordTiming[]) {
  const cues = captionCues(words);
  await writeArtifact(jobId, 'captions.srt', cues.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`).join('\n'));
  await writeArtifact(jobId, 'captions.vtt', 'WEBVTT\n\n' + cues.map(cue => `${stamp(cue.start, '.')} --> ${stamp(cue.end, '.')}\n${cue.text}\n`).join('\n'));
  const header = '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,56,&H00FFFFFF,&H0000FFFF,&H001A1916,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,100,100,330,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  await writeArtifact(jobId, 'captions.ass', header + cues.map(cue => `Dialogue: 0,${assStamp(cue.start)},${assStamp(cue.end)},Default,,0,0,0,,${cue.text.replace(/[{}]/g, '')}`).join('\n'));
}
export interface RenderVideoInput { narration: NarrationRecord; alignment: AlignmentResult; title: string; genre?: string; sources?: ResearchSource[]; }
export async function renderVideo(jobId: string, input: RenderVideoInput): Promise<{ url: string; path: string; metadata: MediaMetadata }> {
  validateAlignment(input.alignment.words, input.narration.duration);
  const originalHash = createHash('sha256').update(await fs.readFile(input.narration.path)).digest('hex');
  if (originalHash !== input.narration.sha256) throw new Error('Original narration integrity check failed.');
  const plan = buildScenePlan({ words: input.alignment.words, duration: input.narration.duration, title: input.title, genre: input.genre, sources: input.sources, motionFps: Number(process.env.RENDER_MOTION_FPS) || undefined });
  const manifest = { ...plan, title: input.title, narration: { id: input.narration.narrationId, sha256: originalHash, immutable: true }, source: 'Original procedural artwork and text-only citation cards; no stock footage, article screenshots, archival image or likeness reproduced', music: null, sfx: null };
  await writeArtifact(jobId, 'scene_manifest.json', JSON.stringify(manifest, null, 2));
  await writeArtifact(jobId, 'asset_ledger.csv', 'asset_id,source,owner,license,allowed_platforms,uri,restrictions\noriginal-graphics,Storyman generated procedural artwork,project owner,original artwork,YouTube;Facebook;TikTok,scene_manifest.json,no archival authenticity claimed\ncitation-cards,Storyman typographic source cards,project owner,original artwork,YouTube;Facebook;TikTok,scene_manifest.json,text-only attribution; no third-party imagery reproduced\n');
  await runCommand(process.env.PYTHON_PATH || 'python3', [path.resolve('scripts/render-frames.py'), '--manifest', artifactPath(jobId, 'scene_manifest.json'), '--output', path.dirname(artifactPath(jobId, 'frames.txt'))], 30 * 60_000);
  const outputPath = artifactPath(jobId, 'master_long_9x16.mp4');
  await runCommand(process.env.FFMPEG_PATH || 'ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', artifactPath(jobId, 'frames.txt'), '-i', input.narration.path, '-map', '0:v:0', '-map', '1:a:0', '-vf', 'fps=30,scale=in_range=full:out_range=tv,format=yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', String(input.narration.duration), '-movflags', '+faststart', outputPath], 30 * 60_000);
  const metadata = await probeMedia(outputPath); const video = metadata.streams.find(stream => stream.codec_type === 'video'); const audio = metadata.streams.find(stream => stream.codec_type === 'audio');
  const drift = Math.abs(Number(video?.duration || metadata.duration) - Number(audio?.duration || metadata.duration));
  if (video?.width !== 1080 || video?.height !== 1920 || video?.codec_name !== 'h264' || audio?.codec_name !== 'aac' || video?.r_frame_rate !== '30/1' || drift > 0.25 || Math.abs(metadata.duration - input.narration.duration) > 0.25) throw new MediaBlockedError('NEEDS_REVIEW', 'Rendered media failed dimensions, codec, frame rate or audio/video duration QA.');
  if (createHash('sha256').update(await fs.readFile(input.narration.path)).digest('hex') !== originalHash) throw new Error('Narration was modified during rendering.');
  await writeArtifact(jobId, 'media_qa.json', JSON.stringify({ metadata, driftSeconds: drift, originalAudioPreserved: true, template: plan.renderer, scenes: plan.scenes.length, motionFps: plan.format.motionFps, burnedInCaptions: false, captionArtifacts: ['captions.srt', 'captions.vtt', 'captions.ass'], citationCards: plan.scenes.filter(scene => scene.source).length, ctaCard: plan.scenes.some(scene => scene.cta), limitations: ['Original procedural artwork and text-only citation cards; no stock footage, article screenshots or likenesses', 'No subtitles are burned in; caption artifacts are provided separately', 'Human visual, listening and editorial review still required', 'No platform adaptations or publication were performed'] }, null, 2));
  return { url: artifactUrl(jobId, 'master_long_9x16.mp4'), path: outputPath, metadata };
}
