import os from 'node:os';
import { resolveTtsConfig, runCommand } from '../lib/media';
import { discoverZenFreeModels } from '../lib/model-catalog';
import { configuredProvider, peekToken } from '../lib/oauth';
import { writingConfigured } from '../lib/writing';

const commands:[string,string[]][]=[['git',['--version']],['node',['--version']],['npm',['--version']],['python3',['--version']],['uv',['--version']],['ffmpeg',['-version']],['ffprobe',['-version']],['docker',['--version']],['opencode',['--version']]];
async function jsonProbe(url:string){
  try{const response=await fetch(url,{signal:AbortSignal.timeout(4000)});const contentType=response.headers.get('content-type')||'';if(!response.ok||!contentType.includes('application/json'))return {healthy:false,status:response.status,contentType};const body=await response.json() as Record<string,unknown>;return {healthy:true,status:response.status,contentType,body};}
  catch{return {healthy:false,status:null,contentType:null,body:null};}
}
async function main(){
  const [checks,models,openCodeHealth,openCodeDoc,zonosModels,canvaToken]=await Promise.all([
    Promise.all(commands.map(async([name,args])=>{try{return{name,available:true,version:(await runCommand(name,args,10000)).split('\n')[0]};}catch{return{name,available:false};}})),
    discoverZenFreeModels({fresh:true}).then(value=>({available:true,count:value.length})).catch(()=>({available:false,count:0})),
    jsonProbe(`${(process.env.OPENCODE_BASE_URL||'http://127.0.0.1:4096').replace(/\/$/,'')}/global/health`),
    jsonProbe(`${(process.env.OPENCODE_BASE_URL||'http://127.0.0.1:4096').replace(/\/$/,'')}/doc`),
    jsonProbe(`${(process.env.TTS_BASE_URL||'http://127.0.0.1:1919/v1').replace(/\/$/,'')}/models`),
    peekToken('canva').then(value=>Boolean(value)).catch(()=>false),
  ]);
  const tts=resolveTtsConfig();
  const zonosData=zonosModels.body?.data;
  console.log(JSON.stringify({os:os.platform(),architecture:os.arch(),cpus:os.cpus().length,memoryGiB:Math.round(os.totalmem()/2**30),node:process.version,checks,services:{openCode:{cliModels:models,httpHealth:openCodeHealth.healthy,httpHealthStatus:openCodeHealth.status,httpHealthContentType:openCodeHealth.contentType,httpSchema:openCodeDoc.healthy},zonos:{modelsEndpoint:zonosModels.healthy,modelIds:zonosModels.healthy&&Array.isArray(zonosData)?zonosData.map((item:{id?:string})=>item.id):[]},canva:{configured:configuredProvider('canva'),connected:canvaToken}},configuration:{database:process.env.DATABASE_URL?'postgresql':'local-sqlite',llm:writingConfigured(),writingProvider:process.env.WRITING_PROVIDER||'compatible',writingModel:process.env.WRITING_PROVIDER==='opencode-cli'?process.env.OPENCODE_MODEL||null:process.env.AI_MODEL||null,writingFallbackEnabled:process.env.ALLOW_WRITING_FALLBACK==='true',tts:Boolean(tts&&(tts.kind!=='gemini'||tts.apiKey)),ttsProvider:tts?.kind||'none',ttsModel:tts?.model||null,ttsVoice:tts?.voice||null,alignment:Boolean(process.env.ALIGNMENT_COMMAND_JSON),accessMode:'passwordless',livePublishing:process.env.ENABLE_LIVE_PUBLISHING==='true'}},null,2));
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Doctor failed.');process.exitCode=1;});
