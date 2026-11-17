import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile);
const freeModel=/^opencode\/[a-z0-9][a-z0-9.-]*-free$/;
let cached:{at:number;models:string[]}|undefined;

export function parseZenFreeModels(output:string):string[]{
  return [...new Set(output.split(/\r?\n/).map(line=>line.trim()).filter(model=>freeModel.test(model)))].sort();
}
export function isZenFreeModel(model:string){return freeModel.test(model);}
export async function discoverZenFreeModels(options:{fresh?:boolean;command?:string}={}):Promise<string[]>{
  if(!options.fresh && !options.command && cached && Date.now()-cached.at<30_000)return cached.models;
  const command=options.command||process.env.OPENCODE_PATH||'opencode';
  let stdout:string;
  const childEnv:NodeJS.ProcessEnv={NODE_ENV:process.env.NODE_ENV||'production'};for(const key of ['PATH','HOME','OPENCODE_HOME','OPENCODE_API_KEY','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','LANG','LC_ALL','TMPDIR','NODE_EXTRA_CA_CERTS'])if(process.env[key])childEnv[key]=process.env[key];
  try{({stdout}=await execFileAsync(command,['models'],{timeout:15_000,maxBuffer:512_000,env:childEnv}));}
  catch{throw new Error('OpenCode CLI model discovery failed. Check the installed CLI and its account connection.');}
  const models=parseZenFreeModels(stdout);
  if(!models.length)throw new Error('OpenCode lists no enabled Zen free models for this account. Select a free model after it becomes available.');
  if(!options.command)cached={at:Date.now(),models};
  return models;
}
export async function requireZenFreeModel(model:string):Promise<void>{
  if(!isZenFreeModel(model))throw new Error('Select an OpenCode Zen free model from the current catalog.');
  const models=await discoverZenFreeModels();
  if(!models.includes(model))throw new Error(`The selected OpenCode Zen free model is no longer available. Choose another model from the current catalog.`);
}
