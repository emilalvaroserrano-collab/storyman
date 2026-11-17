import { readJsonBody, requireOwner } from '@/lib/security';
import { variantApiError } from '@/lib/variant-api';
import { approveVariant } from '@/lib/variants';
export const runtime = 'nodejs';
export async function POST(request: Request, context: {params:Promise<{id:string}>}) {const denied=await requireOwner(request);if(denied)return denied;try{return Response.json({variant:await approveVariant((await context.params).id,await readJsonBody(request))});}catch(error){return variantApiError(error);}}
