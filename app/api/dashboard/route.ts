import { requireOwner } from '@/lib/security';
import { getSchedule, getSettings, getWorkerHealth, listJobs } from '@/lib/story-service';
import { getConnections } from '@/lib/connections';
import { databaseKind } from '@/lib/db';
import { resolveTtsConfig } from '@/lib/media';
import { writingConfigured } from '@/lib/writing';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const denied=await requireOwner(request); if(denied)return denied;
  if (process.env.VERCEL && !process.env.DATABASE_URL) return Response.json({
    code:'DATABASE_URL_REQUIRED',
    error:'Storyman needs hosted PostgreSQL on Vercel. Set DATABASE_URL in the project environment and redeploy.'
  },{status:503});
  try {
    const [jobs,schedule,settings,connections,worker]=await Promise.all([listJobs(),getSchedule(),getSettings(),getConnections(),getWorkerHealth()]);
    const tts=resolveTtsConfig();
    return Response.json({jobs,schedule,settings,connections,health:{database:databaseKind,...worker,research:true,llm:writingConfigured(),writingProvider:process.env.WRITING_PROVIDER==='opencode-cli'?'OpenCode Zen CLI':'Compatible API',writingModel:process.env.WRITING_PROVIDER==='opencode-cli'?process.env.OPENCODE_MODEL||null:process.env.AI_MODEL||null,writingFallbackConfigured:Boolean(process.env.ALLOW_WRITING_FALLBACK==='true'&&process.env.WRITING_PROVIDER==='opencode-cli'&&process.env.AI_MODEL&&(process.env.AI_API_KEY||process.env.AI_BASE_URL)),tts:Boolean(tts&&(tts.kind!=='gemini'||tts.apiKey)),storage:databaseKind==='PostgreSQL'?'Hosted PostgreSQL':'Local · persistent'}});
  } catch(error) {
    console.error('Storyman dashboard initialization failed:',error instanceof Error?error.name:'UnknownError');
    return Response.json({code:'DASHBOARD_UNAVAILABLE',error:'The Storyman backend could not load the dashboard. Check the database connection and server logs.'},{status:503});
  }
}
