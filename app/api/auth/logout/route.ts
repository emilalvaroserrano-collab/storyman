import { requireOwner, sessionCookie } from '@/lib/security';
export async function POST(request: Request) { const denied = await requireOwner(request); if (denied) return denied; return Response.json({ authenticated: false }, { headers: { 'Set-Cookie': sessionCookie(request, true) } }); }
