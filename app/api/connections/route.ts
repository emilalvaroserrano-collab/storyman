import { getConnections } from '@/lib/connections';
import { requireOwner } from '@/lib/security';
export const runtime='nodejs';
export async function GET(request:Request){const denied=await requireOwner(request);if(denied)return denied;return Response.json({connections:await getConnections()});}
