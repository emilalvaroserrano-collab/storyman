import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { getKV, query, setKV } from './db';
export type ProviderId = 'canva' | 'youtube' | 'facebook' | 'tiktok';
export interface OAuthToken { accessToken: string; refreshToken?: string; expiresAt: number; scopes: string[]; accountName?: string; accountId?: string; pageId?: string; }
interface OAuthState { provider: ProviderId; verifier: string; redirectUri: string; expiresAt: number; }
export const providers: Record<ProviderId, { name: string; env: string; authorize: string; token: string; scopes: string[] }> = {
 canva: { name: 'Canva', env: 'CANVA', authorize: 'https://www.canva.com/api/oauth/authorize', token: 'https://api.canva.com/rest/v1/oauth/token', scopes: ['asset:read','asset:write','design:content:read','design:content:write','design:meta:read'] },
 youtube: { name: 'YouTube', env: 'GOOGLE', authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', scopes: ['https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'] },
 facebook: { name: 'Facebook', env: 'META', authorize: `https://www.facebook.com/${process.env.META_GRAPH_VERSION || 'v27.0'}/dialog/oauth`, token: `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v27.0'}/oauth/access_token`, scopes: ['pages_show_list','pages_read_engagement','pages_manage_posts'] },
 tiktok: { name: 'TikTok', env: 'TIKTOK', authorize: 'https://www.tiktok.com/v2/auth/authorize/', token: 'https://open.tiktokapis.com/v2/oauth/token/', scopes: ['video.publish'] },
};
export function isProvider(id: string): id is ProviderId { return Object.hasOwn(providers, id); }
export function encryptionConfigured() { return Boolean(process.env.TOKEN_ENCRYPTION_KEY && process.env.TOKEN_ENCRYPTION_KEY.length >= 32); }
function encryptionKey() { if (!encryptionConfigured()) throw new Error('Set TOKEN_ENCRYPTION_KEY to at least 32 random characters on the server to store account tokens securely.'); return createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY!).digest(); }
export function encryptSecret(value: unknown): string { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv); const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.'); }
export function decryptSecret<T>(value: string): T { const [iv,tag,data] = value.split('.'); const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv,'base64url')); decipher.setAuthTag(Buffer.from(tag,'base64url')); return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8')); }
function tokenKey(provider: ProviderId) { return `oauth:token:${provider}`; }
export async function peekToken(provider: ProviderId): Promise<OAuthToken | null> {
 if (!encryptionConfigured()) return null;
 const encrypted = await getKV<string | null>(tokenKey(provider), null);
 return encrypted ? decryptSecret<OAuthToken>(encrypted) : null;
}
export async function storeToken(provider: ProviderId, token: OAuthToken) { await setKV(tokenKey(provider), encryptSecret(token)); }
export async function removeToken(provider: ProviderId) { await query('DELETE FROM app_records WHERE key = ?', [tokenKey(provider)]); }
async function ensureOAuthTables() {
 await query('CREATE TABLE IF NOT EXISTS oauth_states (state_hash TEXT PRIMARY KEY, ciphertext TEXT NOT NULL, expires_at BIGINT NOT NULL)');
 await query('CREATE TABLE IF NOT EXISTS oauth_refresh_locks (provider TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at BIGINT NOT NULL)');
}
export function configuredProvider(provider: ProviderId) { const p=providers[provider]; return Boolean(process.env[`${p.env}_CLIENT_ID`] && process.env[`${p.env}_CLIENT_SECRET`] && encryptionConfigured()); }
function callbackUri(provider: ProviderId, requestUrl: string) {
 const base = new URL(process.env.APP_URL || requestUrl);
 if (base.protocol !== 'https:' && !['localhost','127.0.0.1','[::1]'].includes(base.hostname)) throw new Error('APP_URL must use HTTPS for OAuth outside localhost.');
 return `${base.origin}/api/connections/${provider}/callback`;
}
export async function createAuthorization(provider: ProviderId, requestUrl: string) {
 const p=providers[provider]; if (!configuredProvider(provider)) throw new Error(`Set ${p.env}_CLIENT_ID, ${p.env}_CLIENT_SECRET and TOKEN_ENCRYPTION_KEY on the server, then register the callback URL.`);
 const state=randomBytes(32).toString('base64url'); const verifier=randomBytes(48).toString('base64url'); const redirectUri=callbackUri(provider,requestUrl);
 await ensureOAuthTables(); const expiresAt=Date.now()+10*60_000; await query('DELETE FROM oauth_states WHERE expires_at < ?',[Date.now()]); await query('INSERT INTO oauth_states (state_hash,ciphertext,expires_at) VALUES (?,?,?)',[createHash('sha256').update(state).digest('hex'),encryptSecret({provider,verifier,redirectUri,expiresAt}),expiresAt]);
 const url=new URL(p.authorize); url.searchParams.set(provider==='tiktok'?'client_key':'client_id',process.env[`${p.env}_CLIENT_ID`]!); url.searchParams.set('redirect_uri',redirectUri); url.searchParams.set('response_type','code'); url.searchParams.set('state',state); url.searchParams.set('scope',p.scopes.join(provider==='facebook'||provider==='tiktok'?',':' '));
 if (provider!=='facebook') { url.searchParams.set('code_challenge',createHash('sha256').update(verifier).digest('base64url')); url.searchParams.set('code_challenge_method','S256'); }
 if(provider==='youtube') {url.searchParams.set('access_type','offline');url.searchParams.set('prompt','consent');url.searchParams.set('include_granted_scopes','true');}
 return url.toString();
}
async function tokenRequest(provider:ProviderId, values:Record<string,string>):Promise<Record<string,unknown>> {
 const p=providers[provider]; const params=new URLSearchParams(values); const clientId=process.env[`${p.env}_CLIENT_ID`]!; const clientSecret=process.env[`${p.env}_CLIENT_SECRET`]!;
 const headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded'};
 if(provider==='canva') headers.Authorization=`Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
 else {params.set(provider==='tiktok'?'client_key':'client_id',clientId);params.set('client_secret',clientSecret);}
 const response=await fetch(p.token,{method:'POST',headers,body:params,signal:AbortSignal.timeout(20000)});
 const body=await response.json() as Record<string,unknown>;
 if (!response.ok || typeof body.access_token!=='string') throw new Error(`${p.name} did not grant an access token. Check the app configuration, authorization code, scopes and callback URL.`);
 return body;
}
function mapToken(provider:ProviderId, body:Record<string,unknown>, prior?:OAuthToken):OAuthToken {
 return {accessToken:String(body.access_token),refreshToken:typeof body.refresh_token==='string'?body.refresh_token:prior?.refreshToken,expiresAt:Date.now()+Number(body.expires_in||3600)*1000,scopes:typeof body.scope==='string'?body.scope.split(/[ ,]+/):prior?.scopes||providers[provider].scopes,accountName:prior?.accountName,accountId:typeof body.open_id==='string'?body.open_id:prior?.accountId,pageId:prior?.pageId};
}
export async function completeAuthorization(provider:ProviderId, code:string, state:string) {
 await ensureOAuthTables(); const result=await query('DELETE FROM oauth_states WHERE state_hash = ? RETURNING ciphertext',[createHash('sha256').update(state).digest('hex')]); const saved=result.rows[0]?decryptSecret<OAuthState>(String(result.rows[0].ciphertext)):null;
 if(!saved||saved.provider!==provider||saved.expiresAt<Date.now()) throw new Error('This authorization request expired or was already used. Connect the account again.');
 const body=await tokenRequest(provider,{grant_type:'authorization_code',code,redirect_uri:saved.redirectUri,...(provider!=='facebook'?{code_verifier:saved.verifier}:{})});
 let token=mapToken(provider,body);
 if(provider==='youtube') {
  const response=await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',{headers:{Authorization:`Bearer ${token.accessToken}`},signal:AbortSignal.timeout(15000)});
  if(response.ok){const result=await response.json(); const channel=result.items?.[0]; if(channel){token.accountName=channel.snippet?.title;token.accountId=channel.id;}}
 }
 if(provider==='facebook') {
  const response=await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v27.0'}/me/accounts?fields=id,name,access_token`,{headers:{Authorization:`Bearer ${token.accessToken}`},signal:AbortSignal.timeout(15000)});
  if(response.ok){const result=await response.json(); const page=result.data?.find((p:{id:string})=>p.id===process.env.META_PAGE_ID); if(page){token={...token,accessToken:page.access_token,pageId:page.id,accountId:page.id,accountName:page.name};}}
 }
 await storeToken(provider,token); return {provider,accountName:token.accountName};
}
export async function getAccessToken(provider:ProviderId):Promise<string> {
 const token=await peekToken(provider); if(!token) throw new Error(`BLOCKED_AUTH: Connect ${providers[provider].name} in Connections.`);
 if(token.expiresAt>Date.now()+60_000) return token.accessToken;
 if(!token.refreshToken || provider==='facebook') throw new Error(`BLOCKED_AUTH: ${providers[provider].name} authorization expired. Reconnect the account.`);
 await ensureOAuthTables(); const owner=randomBytes(24).toString('hex'); const now=Date.now();
 const lock=await query('INSERT INTO oauth_refresh_locks (provider,owner,expires_at) VALUES (?,?,?) ON CONFLICT (provider) DO UPDATE SET owner = excluded.owner, expires_at = excluded.expires_at WHERE oauth_refresh_locks.expires_at < ? RETURNING owner',[provider,owner,now+30_000,now]);
 if(!lock.rows.length) throw new Error('AUTH_REFRESH_IN_PROGRESS: Another request is refreshing this account. Retry shortly.');
 try {
  const priorCipher=await getKV<string|null>(tokenKey(provider),null);
  if(!priorCipher)throw new Error(`BLOCKED_AUTH: Connect ${providers[provider].name} in Connections.`);
  const current=decryptSecret<OAuthToken>(priorCipher);
  if(current.expiresAt>Date.now()+60_000)return current.accessToken;
  if(!current.refreshToken)throw new Error(`BLOCKED_AUTH: Reconnect ${providers[provider].name}.`);
  const body=await tokenRequest(provider,{grant_type:'refresh_token',refresh_token:current.refreshToken});const refreshed=mapToken(provider,body,current);
  // A concurrent disconnect or fresh authorization must win over this refresh.
  const saved=await query('UPDATE app_records SET value = ? WHERE key = ? AND value = ?',[JSON.stringify(encryptSecret(refreshed)),tokenKey(provider),JSON.stringify(priorCipher)]);
  if(!saved.changes)throw new Error('BLOCKED_AUTH: Account authorization changed during refresh. Try the connection again.');
  return refreshed.accessToken;
 } finally { await query('DELETE FROM oauth_refresh_locks WHERE provider = ? AND owner = ?',[provider,owner]); }
}
export async function revokeConnection(provider:ProviderId) {
 const token=await peekToken(provider); if(!token)return {revoked:true};
 let revoked=false;
 try {
  let response:Response|undefined;
  if(provider==='youtube')response=await fetch('https://oauth2.googleapis.com/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token:token.refreshToken||token.accessToken}),signal:AbortSignal.timeout(15000)});
  if(provider==='tiktok')response=await fetch('https://open.tiktokapis.com/v2/oauth/revoke/',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_key:process.env.TIKTOK_CLIENT_ID||'',client_secret:process.env.TIKTOK_CLIENT_SECRET||'',token:token.accessToken}),signal:AbortSignal.timeout(15000)});
  if(provider==='canva')response=await fetch('https://api.canva.com/rest/v1/oauth/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:`Basic ${Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString('base64')}`},body:new URLSearchParams({token:token.refreshToken||token.accessToken}),signal:AbortSignal.timeout(15000)});
  if(provider==='facebook')response=await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION||'v27.0'}/me/permissions`,{method:'DELETE',headers:{Authorization:`Bearer ${token.accessToken}`},signal:AbortSignal.timeout(15000)});
  revoked=Boolean(response?.ok);
 } catch {} finally {await removeToken(provider);}
 return {revoked};
}
