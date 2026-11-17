import { z } from 'zod';
import { requireOwner } from '@/lib/security';
import { apiError } from '@/lib/route-utils';
import { listCanvaDesigns } from '@/lib/canva-library';
export const runtime='nodejs';
export async function GET(request:Request){
  const denied=await requireOwner(request);if(denied)return denied;
  try{const url=new URL(request.url);const query=z.string().max(255).parse(url.searchParams.get('query')||'');const ownership=z.enum(['any','owned','shared']).parse(url.searchParams.get('ownership')||'any');const continuation=z.string().max(2000).optional().parse(url.searchParams.get('continuation')||undefined);return Response.json(await listCanvaDesigns(query,ownership,continuation));}catch(error){return apiError(error);}
}
