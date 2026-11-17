import { PublishingBlockedError, queryTikTokCreatorInfo } from '@/lib/publishers';
import { errorResponse, requireOwner } from '@/lib/security';
export const runtime='nodejs';
export async function GET(request:Request){const denied=await requireOwner(request);if(denied)return denied;try{return Response.json({creator:await queryTikTokCreatorInfo(),privacySelection:null,consentRequired:true,directPostVerified:false});}catch(e){return errorResponse(e instanceof PublishingBlockedError?e.code:'BLOCKED_AUTH',e instanceof Error&&e.message.startsWith('BLOCKED_AUTH')?e.message:e instanceof PublishingBlockedError?e.message:'Connect TikTok with the video.publish scope to load current creator information.',409);}}
