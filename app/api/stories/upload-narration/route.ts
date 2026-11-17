import { NextRequest, NextResponse } from 'next/server';
import { requireOwner } from '@/lib/security';
import { saveNarration } from '@/lib/media';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const denied = await requireOwner(request); if (denied) return denied;
  if (Number(request.headers.get('content-length')) > 101 * 1024 * 1024) return NextResponse.json({ error: 'Maximum upload is 100 MB.' }, { status: 413 });
  try {
    if (!request.body) return NextResponse.json({ error: 'Upload body is required.' }, { status: 400 });
    // Bound streamed uploads too; Content-Length alone is not trustworthy.
    const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 101 * 1024 * 1024) { await reader.cancel(); return NextResponse.json({ error: 'Maximum upload is 100 MB.' }, { status: 413 }); }
      chunks.push(part.value);
    }
    const bytes = Buffer.concat(chunks);
    const form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') || '' } }).formData(); const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a WAV or MP3 narration file.' }, { status: 400 });
    const { narrationId, filename, duration, url, sha256 } = await saveNarration(file);
    return NextResponse.json({ narrationId, filename, duration, url, sha256 }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Narration upload failed.' }, { status: 400 }); }
}
