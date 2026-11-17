import { readJsonBody, requireOwner } from '@/lib/security';
import { variantApiError } from '@/lib/variant-api';
import { retryVariant } from '@/lib/variants';
import { z } from 'zod';
export const runtime = 'nodejs';
export async function POST(request: Request, context: {params:Promise<{id:string}>}) {const denied=await requireOwner(request);if(denied)return denied;try{const body=z.object({platform:z.enum(['youtube','facebook','tiktok'])}).parse(await readJsonBody(request));return Response.json({variant:await retryVariant((await context.params).id,body.platform)});}catch(error){return variantApiError(error);}}
