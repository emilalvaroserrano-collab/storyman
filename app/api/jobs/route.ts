import { requireOwner } from '@/lib/security';
import { listJobs } from '@/lib/story-service';
export async function GET(request:Request){const denied=await requireOwner(request);if(denied)return denied;return Response.json({jobs:await listJobs()});}
