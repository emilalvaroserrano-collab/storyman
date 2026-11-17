import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseOpenCodeEvents, writeStructured, writingConfigured, writingRequest } from '../lib/writing';
const messages=[{role:'user' as const,content:'Return a source-mapped narrative JSON document.'}];
test('native local Ollama requests disable thinking and preserve structured-output budget',()=>{
 const request=writingRequest(messages,{maxTokens:5400,schema:{type:'object'}},{AI_BASE_URL:'http://127.0.0.1:11434/v1',AI_MODEL:'owner-model'});
 assert.equal(request.url,'http://127.0.0.1:11434/api/chat');assert.equal(request.native,true);assert.equal(request.body.think,false);assert.equal(request.body.stream,false);assert.deepEqual(request.body.format,{type:'object'});assert.equal(request.body.options?.num_predict,5400);assert.equal(request.timeoutMs,300000);
});
test('OpenAI-compatible provider stays on its authorized base and uses server-only authorization',()=>{
 const request=writingRequest(messages,{maxTokens:4000},{AI_BASE_URL:'https://authorized.example/v1',AI_MODEL:'owner-model',AI_API_KEY:'test-fixture-private-key',AI_TIMEOUT_MS:'240000'});
 assert.equal(request.native,false);assert.equal(request.url,'https://authorized.example/v1/chat/completions');assert.equal(request.body.max_tokens,4000);assert.equal(request.headers.Authorization,'Bearer test-fixture-private-key');assert.equal(request.timeoutMs,240000);assert.equal(JSON.stringify(request.body).includes('test-fixture-private-key'),false);
});
test('provider timeouts are bounded and missing model configuration fails before a request',()=>{
 const request=writingRequest(messages,{}, {AI_BASE_URL:'http://localhost:11434',AI_MODEL:'owner-model',AI_TIMEOUT_MS:'999999999'});assert.equal(request.timeoutMs,600000);assert.throws(()=>writingRequest(messages,{},{}),/Configure/);
});
test('OpenCode free model is recognized without an API key and errors are not accepted as content',()=>{
 assert.equal(writingConfigured({WRITING_PROVIDER:'opencode-cli',OPENCODE_MODEL:'opencode/glm-5.3-flash-free'}),true);
 assert.equal(writingConfigured({WRITING_PROVIDER:'opencode-cli'}),false);
 const text=JSON.stringify({type:'text',part:{type:'text',text:'{"ok":true}'}});
 assert.equal(parseOpenCodeEvents(`${JSON.stringify({type:'step_start'})}\n${text}`),'{"ok":true}');
 assert.throws(()=>parseOpenCodeEvents(JSON.stringify({type:'error',error:{type:'provider.free-limit',status:429}})),/free usage limit/);
 assert.throws(()=>parseOpenCodeEvents(JSON.stringify({type:'tool',part:{type:'tool'}})),/tool call/);
});
test('OpenCode quota failure falls back to the configured local writer and reports provenance',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'storyman-writing-test-'));
 const cli=join(directory,'fake-opencode');
 await writeFile(cli,'#!/usr/bin/env node\nconsole.log(JSON.stringify({type:"error",error:{type:"provider.free-limit",status:429}}));process.exit(1);\n');await chmod(cli,0o700);
 const server=createServer((_request,response)=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify({message:{content:'{"title":"Verified fallback"}'},done_reason:'stop'}));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();if(!address || typeof address==='string')throw new Error('Test HTTP server did not bind.');
 const names=['WRITING_PROVIDER','OPENCODE_MODEL','OPENCODE_PATH','AI_MODEL','AI_BASE_URL','AI_PROVIDER'] as const;
 const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 Object.assign(process.env,{WRITING_PROVIDER:'opencode-cli',OPENCODE_MODEL:'opencode/glm-5.3-flash-free',OPENCODE_PATH:cli,AI_MODEL:'fallback-test',AI_BASE_URL:`http://127.0.0.1:${address.port}/v1`,AI_PROVIDER:'ollama'});
 const warning=console.warn;console.warn=()=>{};
 try{const result=await writeStructured(messages);assert.equal(result.text,'{"title":"Verified fallback"}');assert.equal(result.provider,'ollama');assert.equal(result.model,'fallback-test');assert.equal(result.fallback,true);}
 finally{console.warn=warning;for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}server.close();await rm(directory,{recursive:true,force:true});}
});
