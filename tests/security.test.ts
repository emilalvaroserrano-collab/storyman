import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assertSafeSourceUrl, checkRateLimit, isPrivateAddress, isSameOrigin, readJsonBody, requireOwner } from '../lib/security';
const oauth=import('../lib/oauth');
process.env.STORYMAN_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'storyman-security-'));
process.env.TOKEN_ENCRYPTION_KEY = 'test-encryption-key-at-least-32-random-characters';

test('passwordless workspace accepts local and remote requests without cookies',async()=>{
 delete process.env.OWNER_PASSWORD;
 assert.equal(await requireOwner(new Request('http://localhost:3000/api/jobs')),null);
 assert.equal(await requireOwner(new Request('https://story.example/api/jobs')),null);
 assert.equal(await requireOwner(new Request('https://story.example/api/jobs',{headers:{'x-forwarded-for':'203.0.113.5'}})),null);
 assert.equal(await requireOwner(new Request('https://story.example/api/jobs',{headers:{Cookie:'storyman_owner=invalid'}})),null);
 process.env.OWNER_PASSWORD='obsolete-variable-must-be-ignored';
 assert.equal(await requireOwner(new Request('https://story.example/api/jobs')),null);
 delete process.env.OWNER_PASSWORD;
});
test('mutations reject foreign origins despite passwordless access',async()=>{
 const request=new Request('http://localhost:3000/api/settings',{method:'PUT',headers:{Origin:'https://hostile.example'}});
 assert.equal(isSameOrigin(request),false); assert.equal((await requireOwner(request))?.status,403);
});
test('originless simple forms cannot mutate local state',async()=>{
 for(const contentType of ['text/plain','application/x-www-form-urlencoded','multipart/form-data; boundary=test'])assert.equal((await requireOwner(new Request('http://localhost:3000/api/settings',{method:'POST',headers:{'Content-Type':contentType}})))?.status,403);
 assert.equal(await requireOwner(new Request('http://localhost:3000/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'}})),null);
 assert.equal(await requireOwner(new Request('http://localhost:3000/api/settings',{method:'POST',headers:{'X-Storyman-Request':'1'}})),null);
});
test('rate limits cap repeated API requests',()=>{const key=`security-test-${Date.now()}`;for(let i=0;i<5;i++)assert.equal(checkRateLimit(key,5),true);assert.equal(checkRateLimit(key,5),false);});
test('source validation rejects insecure, credentialed, loopback and metadata addresses',async()=>{
 for(const source of ['http://example.com','https://name:secret@example.com','https://127.0.0.1','https://169.254.169.254/latest/meta-data','https://[::1]/','https://[::ffff:127.0.0.1]/','https://host.local/path','https://example.com:8443'])await assert.rejects(assertSafeSourceUrl(source));
 assert.equal(isPrivateAddress('10.1.2.3'),true);assert.equal(isPrivateAddress('172.31.1.2'),true);assert.equal(isPrivateAddress('192.168.1.1'),true);assert.equal(isPrivateAddress('100.100.100.100'),true);assert.equal(isPrivateAddress('fd00::1'),true);assert.equal(isPrivateAddress('8.8.8.8'),false);
});
test('token ciphertext hides tokens, round trips and rejects modification',async()=>{const {encryptSecret,decryptSecret}=await oauth;
 const secret={accessToken:'private-test-token',refreshToken:'private-refresh-token'};const ciphertext=encryptSecret(secret);
 assert.equal(ciphertext.includes(secret.accessToken),false);assert.deepEqual(decryptSecret(ciphertext),secret);
 const parts=ciphertext.split('.');parts[2]=`${parts[2][0]==='A'?'B':'A'}${parts[2].slice(1)}`;assert.throws(()=>decryptSecret(parts.join('.')));
});
test('OAuth creates unique state and PKCE challenges without exposing the client secret',async()=>{const {createAuthorization}=await oauth;
 process.env.GOOGLE_CLIENT_ID='test-client';process.env.GOOGLE_CLIENT_SECRET='private-client-secret';
 const a=new URL(await createAuthorization('youtube','http://localhost:3000/api/connections/youtube/connect'));const b=new URL(await createAuthorization('youtube','http://localhost:3000/api/connections/youtube/connect'));
 assert.equal(a.hostname,'accounts.google.com');assert.equal(a.searchParams.get('code_challenge_method'),'S256');assert.notEqual(a.searchParams.get('state'),b.searchParams.get('state'));assert.notEqual(a.searchParams.get('code_challenge'),b.searchParams.get('code_challenge'));assert.equal(a.toString().includes('private-client-secret'),false);assert.equal(a.searchParams.get('redirect_uri'),'http://localhost:3000/api/connections/youtube/callback');
 delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_CLIENT_SECRET;
});
test('simulated OAuth callback state is consumed atomically and credentials stay encrypted',async()=>{
 const {createAuthorization,completeAuthorization,peekToken,removeToken}=await oauth;
 const {query}=await import('../lib/db');
 process.env.GOOGLE_CLIENT_ID='test-client';process.env.GOOGLE_CLIENT_SECRET='private-client-secret';
 const authorization=new URL(await createAuthorization('youtube','http://localhost:3000/api/connections/youtube/connect'));const state=authorization.searchParams.get('state')!;
 const original=globalThis.fetch;let exchanges=0;globalThis.fetch=async(input)=>{
  if(String(input).includes('oauth2.googleapis.com/token')){exchanges++;return Response.json({access_token:'simulated-access-secret',refresh_token:'simulated-refresh-secret',expires_in:3600,scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'});}
  return Response.json({items:[{id:'simulated-channel',snippet:{title:'Simulated test account'}}]});
 };
 try{
  const results=await Promise.allSettled([completeAuthorization('youtube','simulated-code',state),completeAuthorization('youtube','simulated-code',state)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(exchanges,1);
  assert.equal((await peekToken('youtube'))?.accountId,'simulated-channel');const stored=await query('SELECT value FROM app_records WHERE key = ?',['oauth:token:youtube']);assert.equal(String(stored.rows[0].value).includes('simulated-access-secret'),false);
 }finally{globalThis.fetch=original;await removeToken('youtube');delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_CLIENT_SECRET;}
});
test('database refresh lock prevents duplicate token rotations across concurrent requests',async()=>{
 const {getAccessToken,peekToken,storeToken,removeToken}=await oauth;
 await storeToken('tiktok',{accessToken:'expired-test-token',refreshToken:'old-refresh-secret',expiresAt:Date.now()-1000,scopes:['video.publish']});
 const original=globalThis.fetch;let rotations=0;globalThis.fetch=async()=>{rotations++;await new Promise(r=>setTimeout(r,20));return Response.json({access_token:'new-access-secret',refresh_token:'rotated-refresh-secret',expires_in:7200,scope:'video.publish'});};
 try{const results=await Promise.allSettled([getAccessToken('tiktok'),getAccessToken('tiktok')]);assert.equal(rotations,1);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await peekToken('tiktok'))?.refreshToken,'rotated-refresh-secret');}
 finally{globalThis.fetch=original;await removeToken('tiktok');}
});
test('an in-flight token refresh cannot resurrect a disconnected account',async()=>{
 const {getAccessToken,peekToken,storeToken,removeToken}=await oauth;
 await storeToken('tiktok',{accessToken:'expired-test-token',refreshToken:'old-refresh-secret',expiresAt:Date.now()-1000,scopes:['video.publish']});
 const original=globalThis.fetch;let release!:(r:Response)=>void;let started!:()=>void;const began=new Promise<void>(r=>{started=r;});
 globalThis.fetch=async()=>{started();return new Promise<Response>(resolve=>{release=resolve;});};
 try{const refreshing=getAccessToken('tiktok');await began;await removeToken('tiktok');release(Response.json({access_token:'new-access-secret',refresh_token:'rotated-refresh-secret',expires_in:7200}));await assert.rejects(refreshing,/authorization changed/);assert.equal(await peekToken('tiktok'),null);}
 finally{globalThis.fetch=original;await removeToken('tiktok');}
});

test('JSON input is stream-bounded and parser errors never reflect secret input',async()=>{
 const request=new Request('http://localhost:3210/api/settings',{method:'PUT',body:'x'.repeat(70*1024),headers:{'Content-Type':'application/json'}});
 await assert.rejects(readJsonBody(request),/64 KB limit/);
 await assert.rejects(readJsonBody(new Request('http://localhost:3210/api/settings',{method:'POST',body:'{"token":"private-input" BAD JSON'})),error=>error instanceof Error && error.message==='The request body must contain valid JSON.');
 assert.deepEqual(await readJsonBody(new Request('http://localhost:3210/api/settings',{method:'PUT',body:'{"duration":300}'})),{duration:300});
});
