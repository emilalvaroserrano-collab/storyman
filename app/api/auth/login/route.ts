import { checkRateLimit, errorResponse, isLocalRequest, isSameOrigin, passwordMatches, readJsonBody, RequestBodyError, sessionCookie } from '@/lib/security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return errorResponse('CSRF_REJECTED', 'Use this workspace to sign in.', 403);
  if (!checkRateLimit('owner-login', 5, 60_000)) return errorResponse('RATE_LIMITED', 'Too many sign-in attempts. Wait one minute.', 429);
  if (!process.env.OWNER_PASSWORD) return isLocalRequest(request) ? Response.json({ authenticated: true, mode: 'local', role: 'owner' }) : errorResponse('AUTH_CONFIGURATION_REQUIRED', 'Configure owner authentication for remote access.', 401);
  let body:unknown; try { body = await readJsonBody(request); } catch(e) { return errorResponse('INVALID_INPUT', e instanceof RequestBodyError ? e.message : 'A password is required.', e instanceof RequestBodyError ? e.status : 400); }
  if (!body || typeof body !== 'object' || !('password' in body) || typeof body.password !== 'string' || !passwordMatches(body.password)) return errorResponse('INVALID_CREDENTIALS', 'The workspace password is incorrect.', 401);
  try { return Response.json({ authenticated: true, mode: 'password', role: 'owner' }, { headers: { 'Set-Cookie': sessionCookie(request) } }); }
  catch { return errorResponse('AUTH_CONFIGURATION_REQUIRED', 'Configure SESSION_SECRET with at least 32 random characters.', 503); }
}
