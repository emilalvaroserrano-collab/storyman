import { requireOwner } from '@/lib/security';
import { controlJob } from '@/lib/story-service';
import { apiError } from '@/lib/route-utils';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){const denied=await requireOwner(request);if(denied)return denied;try{const {id}=await context.params;return Response.json({job:await controlJob(id,'pause')});}catch(error){return apiError(error);}}
