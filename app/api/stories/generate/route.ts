import { readJsonBody, requireOwner, assertSafeSourceUrl } from '@/lib/security';
import { createJob, generateSchema } from '@/lib/story-service';
import { apiError } from '@/lib/route-utils';
import { requireZenFreeModel } from '@/lib/model-catalog';
export const runtime='nodejs';
export async function POST(request:Request) {
  const denied=await requireOwner(request); if(denied)return denied;
  try {const input=generateSchema.parse(await readJsonBody(request)); if(input.model)await requireZenFreeModel(input.model); if(input.sourceUrl)await assertSafeSourceUrl(input.sourceUrl); const result=await createJob(input); return Response.json(result,{status:result.created?201:200});} catch(error){return apiError(error);}
}
