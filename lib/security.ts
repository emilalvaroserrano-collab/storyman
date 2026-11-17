import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const SESSION_NAME = 'storyman_owner';
const SESSION_TTL = 60 * 60 * 12;
const attempts = new Map<string, { count: number; reset: number }>();
const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export function errorResponse(code: string, message: string, status = 400) { return Response.json({ error: code, message }, { status }); }
export class RequestBodyError extends Error { constructor(message: string, public status = 400) { super(message); this.name = 'RequestBodyError'; } }
export async function readJsonBody(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestBodyError('JSON request body exceeds the 64 KB limit.', 413);
  if (!request.body) throw new RequestBodyError('A JSON request body is required.');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new RequestBodyError('JSON request body exceeds the 64 KB limit.', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new RequestBodyError('The request body must contain valid JSON.'); }
}
export function getDataDir() { return path.resolve(/* turbopackIgnore: true */ process.env.STORYMAN_DATA_DIR || process.env.DATA_DIR || path.join(process.cwd(), 'data')); }
export function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.OWNER_PASSWORD) throw new Error('Set SESSION_SECRET to at least 32 random characters before enabling password access.');
  const dir = getDataDir(); mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, '.local-session-key');
  if (!existsSync(file)) { try { writeFileSync(file, randomBytes(48).toString('base64url'), { mode: 0o600, flag: 'wx' }); } catch {} }
  return readFileSync(file, 'utf8');
}
function signature(payload: string) { return createHmac('sha256', sessionSecret()).update(payload).digest('base64url'); }
export function signValue(value: unknown) { const payload = Buffer.from(JSON.stringify(value)).toString('base64url'); return `${payload}.${signature(payload)}`; }
export function verifyValue<T>(signed: string | undefined): T | null {
  if (!signed) return null;
  const pieces = signed.split('.'); if (pieces.length !== 2) return null;
  const expected = Buffer.from(signature(pieces[0])); const actual = Buffer.from(pieces[1]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try { return JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8')) as T; } catch { return null; }
}
export function readCookie(request: Request, name: string): string | undefined {
  const part = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(`${name}=`));
  if (!part) return undefined; try { return decodeURIComponent(part.slice(name.length + 1)); } catch { return undefined; }
}
export function isLocalRequest(request: Request) {
  const u = new URL(request.url);
  if (!localHosts.has(u.hostname) || request.headers.has('forwarded')) return false;
  // Next adds its own x-forwarded-for even when the listener is loopback-only.
  // Accept that local hop; a public or unparseable address anywhere in a proxy
  // chain still requires password authentication.
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor && forwardedFor.split(',').some(value => !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(value.trim().toLowerCase()))) return false;
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    try { if (!localHosts.has(new URL(`http://${forwardedHost}`).hostname)) return false; } catch { return false; }
  }
  return true;
}
export function isSameOrigin(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
  const origin = request.headers.get('origin');
  if (!origin) {
    const site = request.headers.get('sec-fetch-site');
    if (site === 'same-origin') return true;
    if (site) return false;
    // Non-browser clients must use a non-simple request type or an explicit
    // custom header. Browser HTML forms cannot supply either without CORS.
    return request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/json' || request.headers.get('x-storyman-request') === '1';
  }
  try {
    const expected = process.env.APP_URL ? new URL(process.env.APP_URL).origin : new URL(request.url).origin;
    return new URL(origin).origin === expected;
  } catch { return false; }
}
export function checkRateLimit(key: string, max = 120, period = 60_000): boolean {
  const now = Date.now(); const bucket = attempts.get(key);
  if (!bucket || bucket.reset < now) { attempts.set(key, { count: 1, reset: now + period }); return true; }
  bucket.count++; if (attempts.size > 10000) for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
  return bucket.count <= max;
}
export async function requireOwner(request: Request): Promise<Response | null> {
  if (!isSameOrigin(request)) return errorResponse('CSRF_REJECTED', 'This action must originate from this Storyman dashboard.', 403);
  if (!checkRateLimit(`owner:${request.headers.get('x-forwarded-for') || 'local'}`)) return errorResponse('RATE_LIMITED', 'Too many requests. Try again in a minute.', 429);
  if (!process.env.OWNER_PASSWORD) return isLocalRequest(request) ? null : errorResponse('OWNER_AUTH_REQUIRED', 'Remote access requires OWNER_PASSWORD and SESSION_SECRET. Local mode is restricted to the loopback interface.', 401);
  try {
    const session = verifyValue<{ role: string; exp: number }>(readCookie(request, SESSION_NAME));
    if (session?.role === 'owner' && session.exp > Date.now()) return null;
  } catch { return errorResponse('AUTH_CONFIGURATION_REQUIRED', 'Set SESSION_SECRET to at least 32 random characters on the server.', 503); }
  return errorResponse('OWNER_AUTH_REQUIRED', 'Sign in to your Storyman workspace.', 401);
}
export function passwordMatches(input: string): boolean {
  const stored = process.env.OWNER_PASSWORD;
  if (!stored || input.length > 4096) return false;
  const a = createHash('sha256').update(input).digest(); const b = createHash('sha256').update(stored).digest();
  return timingSafeEqual(a, b);
}
export function sessionCookie(request: Request, clear = false): string {
  const token = clear ? '' : signValue({ role: 'owner', exp: Date.now() + SESSION_TTL * 1000, nonce: randomBytes(16).toString('hex') });
  const secure = new URL(process.env.APP_URL || request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${clear ? 0 : SESSION_TTL}${secure}`;
}
export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized.includes(':')) {
    if (normalized.startsWith('::ffff:')) return true;
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') || normalized.startsWith('2001:db8:');
  }
  const parts = normalized.split('.').map(Number); if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a,b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 198 && (b === 18 || b === 19));
}
export async function assertSafeSourceUrl(input: string): Promise<URL> {
  let url: URL; try { url = new URL(input); } catch { throw new Error('Source URL is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Sources require a public HTTPS URL without credentials or custom ports.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.test') || host.endsWith('.invalid')) throw new Error('Local/private source URLs are blocked.');
  if (isIP(host)) { if (isPrivateAddress(host)) throw new Error('Private source addresses are blocked.'); }
  else {
    const resolved = await lookup(host, { all: true });
    if (!resolved.length || resolved.some(r => isPrivateAddress(r.address))) throw new Error('Source resolves to a private or reserved address.');
  }
  return url;
}
async function pinnedSourceRequest(url: URL, init: RequestInit): Promise<Response> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(item => isPrivateAddress(item.address))) throw new Error('Source DNS changed to a private or reserved address.');
  const address = addresses[0];
  const method = (init.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method) || init.body) throw new Error('Source retrieval only supports GET and HEAD.');
  const headers = new Headers(init.headers); headers.set('User-Agent', 'Storyman/0.1 (source verification)'); headers.set('Accept-Encoding', 'identity');
  headers.delete('host'); headers.delete('authorization'); headers.delete('cookie'); headers.delete('proxy-authorization');
  return new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(url, { method, headers: Object.fromEntries(headers.entries()), lookup: (_hostname, options, callback) => { const done = callback as unknown as (...args: unknown[]) => void; if (options.all) done(null, [{ address: address.address, family: address.family }]); else done(null, address.address, address.family); } }, response => {
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 5 * 1024 * 1024) { response.destroy(); req.destroy(new Error('Source response exceeds 5 MB.')); } else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(response.headers)) { if (value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : value); }
        const status = response.statusCode || 502;
        try {
          let bytes: Uint8Array = Buffer.concat(chunks); const encoding = responseHeaders.get('content-encoding')?.toLowerCase(); const options = { maxOutputLength: 5 * 1024 * 1024 };
          if (encoding === 'gzip') bytes = gunzipSync(bytes, options);
          else if (encoding === 'br') bytes = brotliDecompressSync(bytes, options);
          else if (encoding === 'deflate') bytes = inflateSync(bytes, options);
          else if (encoding && encoding !== 'identity') throw new Error('Unsupported source content encoding.');
          responseHeaders.delete('content-encoding'); responseHeaders.delete('content-length');
          resolve(new Response(method === 'HEAD' || [204, 205, 304].includes(status) ? null : bytes as BodyInit, { status, headers: responseHeaders }));
        } catch (error) { reject(error); }
      });
    });
    const signal = init.signal || AbortSignal.timeout(20_000);
    const abort = () => req.destroy(new Error('Source request timed out or was cancelled.'));
    if (signal.aborted) { abort(); } else signal.addEventListener('abort', abort, { once: true });
    req.on('close', () => signal.removeEventListener('abort', abort)); req.on('error', reject); req.end();
  });
}
export async function safeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  let url = await assertSafeSourceUrl(String(input));
  for (let redirects = 0; redirects <= 4; redirects++) {
    const response = await pinnedSourceRequest(url, init);
    if (![301,302,303,307,308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location || redirects === 4) throw new Error('Source redirect limit reached.');
    url = await assertSafeSourceUrl(new URL(location, url).toString());
  }
  throw new Error('Source could not be fetched safely.');
}
