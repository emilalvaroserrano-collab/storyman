import { requireOwner, readJsonBody } from '@/lib/security';
import { saveScriptReview } from '@/lib/story-service';
import { apiError } from '@/lib/route-utils';
export const runtime='nodejs';
export async function PUT(request:Request,context:{params:Promise<{id:string}>}) {
 const denied=await requireOwner(request);if(denied)return denied;
 try {const {id}=await context.params;return Response.json({job:await saveScriptReview(id,await readJsonBody(request))});}catch(error){return apiError(error);}
}
