import { readJsonBody, requireOwner } from '@/lib/security';
import { getSettings, saveSettings } from '@/lib/story-service';
import { apiError } from '@/lib/route-utils';
export async function GET(request:Request){const denied=await requireOwner(request);if(denied)return denied;return Response.json({settings:await getSettings()});}
export async function PUT(request:Request){const denied=await requireOwner(request);if(denied)return denied;try{return Response.json({settings:await saveSettings(await readJsonBody(request))});}catch(error){return apiError(error);}}
