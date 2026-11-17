import { requireOwner } from '@/lib/security';
import { getJob } from '@/lib/story-service';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const denied=await requireOwner(request);if(denied)return denied;const {id}=await context.params;const job=await getJob(id);return job?Response.json({job}):Response.json({error:'Job not found.'},{status:404});}
