import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, writeFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { build } from './build.mjs';
import { workerSettings } from './settings.mjs';
const env = {API_URL:'https://my-worker.workers.dev', SITE_URL:'https://user.github.io/subdir/',GITHUB_REPOSITORY:'user/repo',WORKER_NAME:'my-worker',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),KV_NAMESPACE_ID:'b'.repeat(32),TURNSTILE_SITE_KEY:'0x4-public-site-key',VERTEX_API_KEY:'PRIVATE_VERTEX_SENTINEL',TURNSTILE_SECRET:'PRIVATE_TURNSTILE_SENTINEL',ADMIN_TOKEN:'PRIVATE_ADMIN_SENTINEL'};
test('build sets subpath SEO, public config and ships no private files or author services',()=>{
 const dir=mkdtempSync(join(tmpdir(),'line-build-'));
 try {
  build(env,dir);
  const context={window:{},document:{querySelectorAll:()=>[]}};
  vm.runInNewContext(readFileSync(join(dir,'config.js'),'utf8'),context);
  assert.equal(context.window.APP_CONFIG.apiUrl,env.API_URL);
  for(const name of ['index.html','privacy.html','config.js','robots.txt','sitemap.xml']) {
   const text=readFileSync(join(dir,name),'utf8');
   for(const secret of [env.VERTEX_API_KEY,env.TURNSTILE_SECRET,env.ADMIN_TOKEN]) assert.ok(!text.includes(secret));
   assert.doesNotMatch(text,/yazelinj303|ching-tech|sendBeacon/);
  }
  assert.match(readFileSync(join(dir,'index.html'),'utf8'),/https:\/\/user.github.io\/subdir\/og.png/);
  assert.match(readFileSync(join(dir,'privacy.html'),'utf8'),/https:\/\/github.com\/user\/repo\/issues/);
  assert.ok(!readdirSync(dir).some(n=>['.env','worker','scripts','.git','.github'].includes(n)));
  assert.ok(readFileSync(join(dir,'sw.js'),'utf8').includes('"./config.js"'));
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('worker config preserves QUOTA binding and excludes secrets / old service',()=>{
 const config=workerSettings(env);
 assert.equal(config.kv_namespaces[0].binding,'QUOTA');
 assert.equal(config.vars.TURNSTILE_SITE_KEY,env.TURNSTILE_SITE_KEY);
 assert.ok(!config.vars.GEMINI_WEB_BASE_URL);
 assert.doesNotMatch(JSON.stringify(config),/PRIVATE_/);
 assert.throws(()=>workerSettings({...env,KV_NAMESPACE_ID:'YOUR_KV_ID'}));
 assert.throws(()=>workerSettings({...env,TURNSTILE_SITE_KEY:'1x00000000000000000000AA'}));
});
test('Worker /config returns environment site key, never the original key',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'line-worker-'));
 cpSync('worker/src',dir,{recursive:true});
 writeFileSync(join(dir,'index.js'),readFileSync('worker/src/index.js','utf8').replace('from "./campaigns.json";', 'from "./campaigns.json" with { type: "json" };'));
 let worker;
 try { worker=(await import('file://'+join(dir,'index.js'))).default; }
 finally { rmSync(dir,{recursive:true,force:true}); }
 const response=await worker.fetch(new Request('https://test.example/config'),{TURNSTILE_SITE_KEY:'my-public-key'});
 assert.equal(response.status,200);
 assert.equal((await response.json()).turnstileSiteKey,'my-public-key');
});
