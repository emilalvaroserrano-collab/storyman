import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { readJsonBody, requireOwner } from '@/lib/security';
import { variantApiError } from '@/lib/variant-api';
import { createVariantRequest, getVariant } from '@/lib/variants';
export const runtime = 'nodejs';
export async function POST(request: Request, context: {params:Promise<{id:string}>}) {
 const denied=await requireOwner(request);if(denied)return denied;
 try {
  const body=z.object({platform:z.enum(['youtube','facebook','tiktok'])}).parse(await readJsonBody(request));
  const source=await getVariant((await context.params).id,body.platform);if(!source)throw new Error('Variant not found.');
  const result=await createVariantRequest({jobId:source.sourceJobId,platform:source.platform,idempotencyKey:`regenerate:${source.id}:${randomUUID()}`});
  return Response.json(result,{status:201});
 }catch(error){return variantApiError(error);}
}
