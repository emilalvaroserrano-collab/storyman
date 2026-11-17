import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { artifactPath } from '@/lib/media';
import { requireOwner } from '@/lib/security';
export const runtime = 'nodejs';
const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.srt': 'application/x-subrip', '.vtt': 'text/vtt; charset=utf-8', '.ass': 'text/plain; charset=utf-8' };
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; path: string[] }> }) {
  const denied = await requireOwner(request); if (denied) return denied;
  try {
    const params = await context.params; if (params.path.length !== 1 || params.path[0] === 'narration.json' || params.path[0].endsWith('.tmp')) return NextResponse.json({ error: 'Artifact not found.' }, { status: 404 });
    const filename = artifactPath(params.id, params.path[0]); const stat = await fs.stat(filename); if (!stat.isFile()) throw new Error('Not a file');
    const contentType = MIME[path.extname(filename)] || 'application/octet-stream'; const headers: Record<string, string> = { 'Content-Type': contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
    if (request.nextUrl.searchParams.get('download') === '1') headers['Content-Disposition'] = `attachment; filename="${params.path[0]}"`;
    const range = request.headers.get('range');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range); if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
      let start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2])); const end = match[1] ? (match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1) : stat.size - 1;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= stat.size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`; headers['Content-Length'] = String(end - start + 1);
      return new Response(Readable.toWeb(createReadStream(filename, { start, end })) as ReadableStream, { status: 206, headers });
    }
    headers['Content-Length'] = String(stat.size); return new Response(Readable.toWeb(createReadStream(filename)) as ReadableStream, { headers });
  } catch { return NextResponse.json({ error: 'Artifact not found.' }, { status: 404 }); }
}
