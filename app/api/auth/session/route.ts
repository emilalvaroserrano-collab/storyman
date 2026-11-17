import { requireOwner } from '@/lib/security';
export async function GET(request: Request) { const denied = await requireOwner(request); if (denied) return denied; return Response.json({ authenticated: true, mode: process.env.OWNER_PASSWORD ? 'password' : 'local', role: 'owner' }); }
