import { createAuthorization, isProvider } from '@/lib/oauth';
import { errorResponse, requireOwner } from '@/lib/security';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {const denied=await requireOwner(request);if(denied)return denied;const {id}=await params;if(!isProvider(id))return errorResponse('UNKNOWN_PROVIDER','This connection is not supported.',404);try{return Response.json({url:await createAuthorization(id,request.url)});}catch(e){return errorResponse('BLOCKED_AUTH',e instanceof Error?e.message:'Configure the provider application.',409);}}
