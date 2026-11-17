import { readJsonBody, requireOwner } from '@/lib/security';
import { getSchedule, saveSchedule } from '@/lib/story-service';
import { upcomingExecutions } from '@/lib/scheduler';
import { apiError } from '@/lib/route-utils';
export async function GET(request:Request){const denied=await requireOwner(request);if(denied)return denied;const schedule=await getSchedule();return Response.json({schedule,nextExecutions:upcomingExecutions(schedule)});}
export async function PUT(request:Request){const denied=await requireOwner(request);if(denied)return denied;try{const schedule=await saveSchedule(await readJsonBody(request));return Response.json({schedule,nextExecutions:upcomingExecutions(schedule)});}catch(error){return apiError(error);}}
