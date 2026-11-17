import { ZodError } from 'zod';
import { RequestBodyError } from './security';
export function apiError(error: unknown) {
  if(error instanceof RequestBodyError)return Response.json({error:error.message},{status:error.status});
  if(error instanceof SyntaxError) return Response.json({error:'Request body must contain valid JSON.'},{status:400});
  if(error instanceof ZodError) return Response.json({error:error.issues.map(i=>i.message).join(' ')},{status:400});
  const message=error instanceof Error ? error.message : 'Unexpected server error.';
  if(/not found/i.test(message))return Response.json({error:message},{status:404});
  if(/only|cannot|valid|unsafe|private|localhost|blocked|unsupported|limit|approval requires|claim URL|independent readable/i.test(message))return Response.json({error:message},{status:400});
  console.error(JSON.stringify({event:'api_error',message:'Request failed. Check server configuration.'}));
  return Response.json({error:'The request could not be completed. Check the server configuration and retry.'},{status:500});
}
