import { z } from 'zod';
import { requireOwner, readJsonBody } from '@/lib/security';
import { apiError } from '@/lib/route-utils';
import { attachCanvaDesign } from '@/lib/canva-library';
export const runtime='nodejs';
const schema=z.object({design_id:z.string().min(1).max(100),format:z.enum(['png','mp4'])}).strict();
export async function POST(request:Request,context:{params:Promise<{id:string;sceneId:string}>}){
  const denied=await requireOwner(request);if(denied)return denied;
  try{const {id,sceneId}=await context.params;const body=schema.parse(await readJsonBody(request));return Response.json({card:await attachCanvaDesign(id,sceneId,body.design_id,body.format)});}catch(error){return apiError(error);}
}
