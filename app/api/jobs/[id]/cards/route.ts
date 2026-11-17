import { requireOwner } from '@/lib/security';
import { apiError } from '@/lib/route-utils';
import { listStoryCards, rebuildStoryCards } from '@/lib/story-cards';
export const runtime='nodejs';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
  const denied=await requireOwner(request);if(denied)return denied;
  try{return Response.json(await listStoryCards((await context.params).id));}catch(error){return apiError(error);}
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  const denied=await requireOwner(request);if(denied)return denied;
  try{return Response.json({cards:await rebuildStoryCards((await context.params).id)});}catch(error){return apiError(error);}
}
