import { requireOwner } from '@/lib/security';
import { discoverZenFreeModels } from '@/lib/model-catalog';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  const denied=await requireOwner(request);if(denied)return denied;
  try{
    const models=await discoverZenFreeModels({fresh:true});
    const configured=process.env.OPENCODE_MODEL||'';
    return Response.json({provider:'OpenCode Zen CLI',models,selectedModel:models.includes(configured)?configured:null,available:true,quota:'unknown until generation',httpApi:'not verified'});
  }catch(error){return Response.json({provider:'OpenCode Zen CLI',models:[],selectedModel:null,available:false,blocker:error instanceof Error?error.message:'Model discovery failed.'},{status:503});}
}
