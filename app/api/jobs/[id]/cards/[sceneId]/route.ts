import { z } from 'zod';
import { requireOwner, readJsonBody } from '@/lib/security';
import { apiError } from '@/lib/route-utils';
import { editStoryCard } from '@/lib/story-cards';
export const runtime='nodejs';
const schema=z.object({revision:z.number().int().positive(),narration_text:z.string().trim().min(4).max(4000).optional(),voice_id:z.string().trim().min(1).max(80).optional(),sfx_prompt:z.string().max(1000).optional(),sfx_gain_db:z.number().min(-60).max(6).optional(),canva_search_terms:z.array(z.string().trim().min(1).max(100)).max(20).optional()}).strict();
export async function PATCH(request:Request,context:{params:Promise<{id:string;sceneId:string}>}){
  const denied=await requireOwner(request);if(denied)return denied;
  try{const {id,sceneId}=await context.params;const input=schema.parse(await readJsonBody(request));return Response.json({card:await editStoryCard(id,sceneId,input)});}catch(error){return apiError(error);}
}
