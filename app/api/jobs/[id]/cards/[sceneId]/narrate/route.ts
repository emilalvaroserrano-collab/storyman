import { requireOwner } from '@/lib/security';
import { apiError } from '@/lib/route-utils';
import { narrateStoryCard } from '@/lib/story-cards';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string;sceneId:string}>}){
  const denied=await requireOwner(request);if(denied)return denied;
  try{const {id,sceneId}=await context.params;return Response.json({card:await narrateStoryCard(id,sceneId)});}catch(error){return apiError(error);}
}
