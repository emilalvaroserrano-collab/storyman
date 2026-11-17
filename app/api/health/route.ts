import { initializeDatabase, databaseKind } from '@/lib/db';
import { getWorkerHealth } from '@/lib/story-service';
export const dynamic='force-dynamic';
export async function GET(){try{await initializeDatabase();const worker=await getWorkerHealth();return Response.json({status:'ok',database:databaseKind,...worker,version:'0.1.0'});}catch{return Response.json({status:'unhealthy',error:'Database unavailable.'},{status:503});}}
