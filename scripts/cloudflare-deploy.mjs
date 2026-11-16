import { appendFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { build } from './build.mjs';
import { workerSettings } from './settings.mjs';

// API response bodies and child-process output may contain credentials: never log them.
const env = { ...process.env };
function mask(value) { if (value && env.GITHUB_ACTIONS) console.log(`::add-mask::${value}`); }
async function api(path, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method, headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    const error = new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}; codes ${(data.errors || []).map(e => e.code).join(',')}`);
    error.status = response.status;
    error.codes = (data.errors || []).map(e => e.code);
    throw error;
  }
  return data.result;
}
async function list(path) {
  const results = [];
  for (let page = 1; ; page++) {
    const batch = await api(`${path}?per_page=100&page=${page}`);
    results.push(...batch);
    if (batch.length < 100) return results;
  }
}
function wrangler(args, input) {
  const result = spawnSync(process.execPath, ['worker/node_modules/wrangler/bin/wrangler.js', ...args, '--config', 'worker/wrangler.generated.json'], {
    env, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) throw new Error(`Wrangler ${args[0]} failed; output suppressed to protect secrets. Check token Workers Scripts permissions and configuration.`);
}
export async function deploy() {
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error('Set repository Actions secret CLOUDFLARE_API_TOKEN.');
  const token = await api('/user/tokens/verify');
  if (token.status !== 'active') throw new Error('CLOUDFLARE_API_TOKEN is not active; replace it in repository Actions secrets.');
  console.log('Cloudflare API token verified active.');
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    const accounts = await list('/accounts');
    if (accounts.length !== 1) throw new Error('Set repository variable CLOUDFLARE_ACCOUNT_ID to select one Cloudflare account.');
    env.CLOUDFLARE_ACCOUNT_ID = accounts[0].id;
  }
  const root = `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}`;
  env.WORKER_NAME ||= 'line-sticker-studio';
  env.SITE_URL ||= `https://${env.GITHUB_REPOSITORY.split('/')[0]}.github.io/${env.GITHUB_REPOSITORY.split('/')[1]}/`;
  const hostname = new URL(env.SITE_URL).hostname;
  const namespaceTitle = `${env.WORKER_NAME}-quota`;
  const namespaces = await list(`${root}/storage/kv/namespaces`);
  const namespace = namespaces.find(n => n.title === namespaceTitle) || await api(`${root}/storage/kv/namespaces`, 'POST', { title: namespaceTitle });
  env.KV_NAMESPACE_ID = namespace.id;
  console.log('QUOTA KV namespace ready.');
  const widgetName = `${env.WORKER_NAME}-pages`;
  const widgets = await list(`${root}/challenges/widgets`);
  let widget = widgets.find(w => w.name === widgetName);
  widget = widget ? await api(`${root}/challenges/widgets/${widget.sitekey}`) : await api(`${root}/challenges/widgets`, 'POST', { name: widgetName, domains: [hostname], mode: 'managed' });
  mask(widget.secret);
  if (!widget.domains.includes(hostname)) {
    widget = await api(`${root}/challenges/widgets/${widget.sitekey}`, 'PUT', { name: widgetName, domains: [...widget.domains, hostname], mode: widget.mode });
    mask(widget.secret);
  }
  if (!widget.secret) throw new Error('Turnstile secret unavailable; check Turnstile Edit permission.');
  env.TURNSTILE_SITE_KEY = widget.sitekey;
  console.log('Turnstile widget ready.');
  let subdomain;
  try {
    subdomain = await api(`${root}/workers/subdomain`);
  } catch (error) {
    // New accounts report the missing workers.dev subdomain as 404 / 10007.
    if (error.status !== 404 || !error.codes.includes(10007)) throw error;
  }
  if (!subdomain?.subdomain) {
    subdomain = await api(`${root}/workers/subdomain`, 'PUT', { subdomain: `${env.GITHUB_REPOSITORY.split('/')[0]}-stickers` });
  }
  env.API_URL = `https://${env.WORKER_NAME}.${subdomain.subdomain}.workers.dev`;
  let existingSecrets = [];
  // List scripts first to distinguish a new Worker from a permissions failure.
  const scripts = await api(`${root}/workers/scripts`);
  if (scripts.some(s => s.id === env.WORKER_NAME)) existingSecrets = await api(`${root}/workers/scripts/${env.WORKER_NAME}/secrets`);
  const hasVertex = Boolean(env.VERTEX_API_KEY) || existingSecrets.some(s => s.name === 'VERTEX_API_KEY');
  const config = workerSettings(env);
  config.vars.AI_DISABLED = hasVertex ? '0' : '1';
  writeFileSync('worker/wrangler.generated.json', JSON.stringify(config, null, 2), { mode: 0o600 });
  wrangler(['deploy']);
  const secrets = { TURNSTILE_SECRET: widget.secret };
  if (env.VERTEX_API_KEY) secrets.VERTEX_API_KEY = env.VERTEX_API_KEY;
  if (!existingSecrets.some(s => s.name === 'ADMIN_TOKEN')) secrets.ADMIN_TOKEN = randomBytes(32).toString('hex');
  for (const value of Object.values(secrets)) mask(value);
  wrangler(['secret', 'bulk'], JSON.stringify(secrets));
  await api(`${root}/workers/scripts/${env.WORKER_NAME}/subdomain`, 'POST', { enabled: true });
  console.log(`Checking public Worker endpoint: ${env.API_URL}`);
  let ready = false;
  let healthError = 'Response did not match expected health, KV, or Turnstile configuration';
  for (let attempt = 0; attempt < 36; attempt++) {
    try {
      const get = async path => {
        const response = await fetch(env.API_URL + path, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Health check ${path}: HTTP ${response.status}`);
        return response.json();
      };
      const [health, quota, publicConfig] = await Promise.all(['/', '/quota', '/config'].map(get));
      if (health.ok && quota.quota?.kvAvailable && publicConfig.turnstileSiteKey === widget.sitekey) { ready = true; break; }
    } catch (error) {
      healthError = error.cause?.code || error.message;
    }
    if (attempt % 6 === 0) console.log(`Waiting for Worker endpoint (${attempt + 1}/36): ${healthError}`);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (!ready) throw new Error(`Worker deployed but health check failed (${healthError}); Pages was not published.`);
  build(env);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## Deployment\n- Worker: ${env.API_URL}\n- Pages target: ${env.SITE_URL}\n- KV and Turnstile: verified\n- AI: ${hasVertex ? 'configured (image generation not tested)' : 'disabled; add VERTEX_API_KEY in repository Actions secrets, then rerun'}\n`);
  console.log(`Worker verified: ${env.API_URL}; AI ${hasVertex ? 'configured' : 'disabled until VERTEX_API_KEY is provided'}.`);
}
deploy().catch(error => { console.error(error.message); process.exitCode = 1; });
