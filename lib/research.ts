import { createHash } from 'node:crypto';
import { query } from './db';
import { safeFetch } from './security';
import type { Job, ResearchSource } from './types';

export function discoveryQuery(job: Pick<Job, 'prompt' | 'genre' | 'trigger'>): string {
  if (job.trigger === 'scheduled') return /celebrity/i.test(job.genre) ? '"Filipino actor" comeback' : /invention/i.test(job.genre) ? '"Filipino inventor"' : '"Filipino entrepreneur" -intitle:List';
  const quoted = job.prompt.match(/[“"]([^”"]{4,100})[”"]/);
  if (quoted) return quoted[1];
  const names = job.prompt.match(/\b[A-Z][a-z]+(?:[ -]+(?:[A-Z][a-z]+|[A-Z]\.)){1,4}\b/g);
  if (names?.length) return names.sort((a,b)=>b.length-a.length)[0];
  return job.prompt.replace(/\b(create|tell|write|make|true|inspiring|inspirational|story|about|please|minute|minutes|video|Taglish|Filipino)\b/gi,' ').replace(/\s+/g,' ').trim().slice(0,160);
}
const clean = (html: string) => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|quot|lt|gt);/g,' ').replace(/\s+/g,' ').trim();
export function entityFingerprint(title:string) { return 'entity:'+createHash('sha256').update(title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')).digest('hex'); }
export async function reserveResearchTopic(title:string,jobId:string):Promise<boolean> {
  const fingerprint=entityFingerprint(title);
  await query('INSERT INTO topic_history (fingerprint,job_id,created_at) VALUES (?,?,?) ON CONFLICT (fingerprint) DO NOTHING',[fingerprint,jobId,new Date().toISOString()]);
  const result=await query('SELECT job_id FROM topic_history WHERE fingerprint = ?',[fingerprint]);
  return result.rows[0]?.job_id===jobId;
}
export async function researchStory(job: Job): Promise<{sources: ResearchSource[];diagnostic?:string;subject?:string}> {
  const sources: ResearchSource[] = [];
  const errors: string[] = [];
  let subject:string|undefined;
  async function acquire(url: string, title?: string) {
    try {
      const response = await safeFetch(url, { headers: { 'User-Agent': 'Storyman/0.1 (owner-operated documentary research)' }, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const mime = response.headers.get('content-type') || '';
      if (!/text\/html|text\/plain|application\/json/.test(mime)) throw new Error('Unsupported research content type');
      const length = Number(response.headers.get('content-length') || 0);
      if (length > 2_000_000) throw new Error('Source exceeds research download limit');
      const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
      if (reader) for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.length; if(bytes > 2_000_000) {await reader.cancel(); throw new Error('Source exceeds research download limit');} chunks.push(chunk.value); }
      const html = Buffer.concat(chunks).toString('utf8');
      const article = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || html;
      const text = clean(article);
      if (text.length < 600 || (text.length < 2500 && /access denied|just a moment|checking your browser|enable javascript|verify you are human|captcha/i.test(text))) throw new Error('Source provides too little readable evidence or an access challenge');
      sources.push({ title: title || clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || new URL(url).hostname), url, excerpt: text.slice(0,14_000), accessedAt: new Date().toISOString() });
      return html;
    } catch (error) { errors.push(`${new URL(url).hostname}: ${error instanceof Error ? error.message : 'research fetch failed'}`); return ''; }
  }
  if (job.sourceUrl) await acquire(job.sourceUrl);
  try {
    const query = discoveryQuery(job);
    const search = new URL('https://en.wikipedia.org/w/api.php');
    search.search = new URLSearchParams({ action:'query', list:'search', srsearch:query, srlimit:job.trigger==='scheduled'?'20':'3', format:'json', origin:'*' }).toString();
    const response = await safeFetch(search, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Storyman/0.1 documentary research' } });
    if (!response.ok) throw new Error(`Wikipedia search returned HTTP ${response.status}`);
    const result = await response.json() as { query?: { search?: { title:string;snippet:string }[] } };
    let matches = (result.query?.search || []).filter(m=>!/^List of|^Category:/i.test(m.title));
    if(job.trigger==='manual')matches=matches.slice(0,1);
    if(job.trigger==='scheduled' && matches.length) { const offset=parseInt(createHash('sha256').update(job.idempotencyKey).digest('hex').slice(0,8),16)%matches.length; matches=[...matches.slice(offset),...matches.slice(0,offset)]; }
    for (const match of matches) {
      if(!await reserveResearchTopic(match.title,job.id)) {errors.push(`Topic already used: ${match.title}`);continue;}
      subject=match.title;
      const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(match.title.replace(/ /g,'_'))}`;
      const html = await acquire(pageUrl,match.title);
      const citations = [...html.matchAll(/<cite\b[^>]*>([\s\S]*?)<\/cite>/gi)].map(m=>m[1]).join(' ');
      const refs = [...citations.matchAll(/href="(https?:\/\/[^"<>]+)"/g)].map(m=>m[1].replace(/&amp;/g,'&')).filter(u=> !/wikipedia|wikimedia|wikidata|mediawiki|creativecommons|archive\.org|google\.com|youtube\.com|facebook\.com|twitter\.com|x\.com/.test(new URL(u).hostname));
      for (const url of [...new Set(refs)].slice(0,6)) { if (sources.some(s=> new URL(s.url).hostname===new URL(url).hostname)) continue; await acquire(url); if(sources.length>=3) break; }
      // All corroboration belongs to the chosen entity; do not merge unrelated biographies.
      if(html) break;
    }
  } catch (error) { errors.push(error instanceof Error ? error.message : 'Research search unavailable'); }
  return { subject,sources: sources.slice(0,5), diagnostic: errors.length ? errors.join('; ').slice(0,700) : undefined };
}
