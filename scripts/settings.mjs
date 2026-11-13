import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
export function settings() {
  return { ...(existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {}), ...process.env };
}
export function required(env, name) {
  const value = env[name]?.trim();
  if (!value || /YOUR_|CHANGE_ME|example\.(com|invalid)/i.test(value)) throw new Error(`請填寫 ${name}（見 .env.example）`);
  return value;
}
export function httpsUrl(value, name) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) throw new Error(`${name} 必須是無帳密、query、fragment 的 HTTPS 網址`);
  return u.href;
}
export function publicSettings(env) {
  const api = new URL(httpsUrl(required(env, 'API_URL'), 'API_URL'));
  if (api.pathname !== '/') throw new Error('API_URL 必須是 Worker origin，不能包含路徑');
  const site = httpsUrl(required(env, 'SITE_URL'), 'SITE_URL').replace(/\/?$/, '/');
  const repository = required(env, 'GITHUB_REPOSITORY');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY 格式須為 owner/repository');
  const links = {};
  for (const [key, name] of Object.entries({storeUrl:'STORE_URL', donationUrl:'DONATION_URL', chatMakerUrl:'CHAT_MAKER_URL', replayUrl:'REPLAY_URL', contactUrl:'CONTACT_URL'})) {
    if (env[name]?.trim()) links[key] = httpsUrl(env[name].trim(), name);
  }
  return { copyright: env.CREATOR_COPYRIGHT || '', creatorEnglish: env.CREATOR_ENGLISH || '', creatorChinese: env.CREATOR_CHINESE || '', apiUrl: api.origin, siteUrl: site, repositoryUrl: `https://github.com/${repository}`, links };
}
export function workerSettings(env) {
  const name = required(env, 'WORKER_NAME');
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new Error('WORKER_NAME 請用小寫英文、數字與連字號（最多 63 字元）');
  const account = required(env, 'CLOUDFLARE_ACCOUNT_ID');
  const kv = required(env, 'KV_NAMESPACE_ID');
  if (!/^[a-f0-9]{32}$/i.test(account) || !/^[a-f0-9]{32}$/i.test(kv)) throw new Error('Account ID 與 KV Namespace ID 必須是 32 位十六進位 ID');
  const siteKey = required(env, 'TURNSTILE_SITE_KEY');
  if (/^[123]x000/.test(siteKey)) throw new Error('正式部署不可使用 Turnstile 測試 site key');
  const vars = { TURNSTILE_SITE_KEY: siteKey, AI_DISABLED: '0' };
  if (env.DEFAULT_MODEL) vars.DEFAULT_MODEL = env.DEFAULT_MODEL;
  if (env.GEMINI_WEB_BASE_URL) vars.GEMINI_WEB_BASE_URL = httpsUrl(env.GEMINI_WEB_BASE_URL, 'GEMINI_WEB_BASE_URL').replace(/\/$/, '');
  return { name, account_id: account, main: 'src/index.js', compatibility_date: '2025-01-01', workers_dev: true, vars, kv_namespaces: [{ binding: 'QUOTA', id: kv }] };
}
