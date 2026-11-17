import { NextRequest } from 'next/server';
import { readJsonBody, requireOwner } from '@/lib/security';
import { variantApiError } from '@/lib/variant-api';
import { createVariantRequest, listVariants } from '@/lib/variants';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) { const denied=await requireOwner(request);if(denied)return denied;try{return Response.json({variants:await listVariants(request.nextUrl.searchParams.get('jobId')||undefined)});}catch(error){return variantApiError(error);} }
export async function POST(request: NextRequest) { const denied=await requireOwner(request);if(denied)return denied;try{const result=await createVariantRequest(await readJsonBody(request));return Response.json(result,{status:result.created?201:200});}catch(error){return variantApiError(error);} }
