import { apiError } from './route-utils';
import { MediaBlockedError } from './media';
import { RequestBodyError } from './security';
export function variantApiError(error: unknown) {
  if(error instanceof MediaBlockedError) return Response.json({error:error.message,code:error.code},{status:409});
  if(error instanceof RequestBodyError) return Response.json({error:error.message},{status:error.status});
  return apiError(error);
}
