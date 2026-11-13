import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from './build.mjs';
import { settings, required, workerSettings } from './settings.mjs';
const env = settings();
env.WRANGLER_LOG_PATH ||= 'worker/.wrangler/logs';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', env, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} 執行失敗（${result.status}）`);
}
const wrangler = (args, options) => run(process.execPath, ['worker/node_modules/wrangler/bin/wrangler.js', ...args, '--config', 'worker/wrangler.generated.json'], options);
try {
  const dry = process.argv.includes('--dry-run');
  const config = workerSettings(env);
  const secrets = {};
  for (const key of [env.GEMINI_WEB_BASE_URL ? 'GEMINI_API_KEY' : 'VERTEX_API_KEY', 'TURNSTILE_SECRET', 'ADMIN_TOKEN']) secrets[key] = required(env,key);
  if (/^[123]x000/.test(secrets.TURNSTILE_SECRET)) throw new Error('正式部署不可使用 Turnstile 測試 secret');
  if (secrets.ADMIN_TOKEN.length < 32) throw new Error('ADMIN_TOKEN 請使用至少 32 字元的隨機值');
  // Validate everything before creating files or making remote changes.
  const frontend = build(env);
  writeFileSync('worker/wrangler.generated.json', JSON.stringify(config,null,2)+'\n', {mode:0o600});
  if (dry) {
    wrangler(['deploy','--dry-run','--outdir',resolve('worker/.worker-bundle')]);
    console.log('檢查通過：未發布、未上傳 secrets、未觸發 Pages。');
  } else {
    // Preflight GitHub authentication before changing Cloudflare state.
    run('gh',['auth','status']);
    run('gh',['workflow','view','pages.yml','--repo',env.GITHUB_REPOSITORY,'--ref',env.PAGES_REF || 'main']);
    wrangler(['whoami']);
    wrangler(['deploy']);
    // Pass secrets over stdin, never via argv or a file, and suppress CLI echoes.
    const result = spawnSync(process.execPath, ['worker/node_modules/wrangler/bin/wrangler.js','secret','bulk','--config','worker/wrangler.generated.json'], {env, input:JSON.stringify(secrets), encoding:'utf8', stdio:['pipe','pipe','pipe']});
    if (result.error || result.status !== 0) throw new Error('Worker 已部署，但 secrets 上傳失敗。請檢查 Cloudflare 權限後重跑；未觸發 Pages。');
    const origin = frontend.apiUrl;
    let ready = false;
    for (let attempt=0; attempt<6; attempt++) {
      try {
        const health = await fetch(origin+'/', {signal:AbortSignal.timeout(15000)});
        const quota = await fetch(origin+'/quota',{signal:AbortSignal.timeout(15000)});
        const response = await fetch(origin+'/config',{signal:AbortSignal.timeout(15000)});
        if (health.ok && (await health.json()).ok === true && quota.ok && (await quota.json()).quota?.kvAvailable === true && response.ok && (await response.json()).turnstileSiteKey === config.vars.TURNSTILE_SITE_KEY) {ready=true;break;}
      } catch {}
      if (attempt<5) await new Promise(r=>setTimeout(r,3000));
    }
    if (!ready) throw new Error('Worker 已部署但 API_URL 健康檢查未通過；請檢查網址與 workers.dev 是否啟用。未觸發 Pages。');
    // Only public configuration is persisted as GitHub Actions variables.
    for (const key of ['API_URL','SITE_URL','STORE_URL','DONATION_URL','CHAT_MAKER_URL','REPLAY_URL','CONTACT_URL','CREATOR_COPYRIGHT','CREATOR_ENGLISH','CREATOR_CHINESE']) run('gh',['variable','set',key,'--repo',env.GITHUB_REPOSITORY,'--body',env[key] || '']);
    run('gh',['workflow','run','pages.yml','--repo',env.GITHUB_REPOSITORY,'--ref',env.PAGES_REF || 'main']);
    console.log('Worker 健康檢查通過；GitHub Pages workflow 已觸發（尚須在 Actions 確認發布成功）。');
  }
} catch (e) { console.error(e.message); process.exitCode=1; }
