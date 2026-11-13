import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicSettings, settings } from './settings.mjs';
const escapeHtml = s => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function build(env = settings(), output = 'dist') {
  const config = publicSettings(env);
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  // Explicit allowlist: never copy worker/, .env, Git metadata, or tooling.
  for (const name of ['index.html','privacy.html','app.js','styles.css','sw.js','manifest.json','favicon.ico','icon-192.png','icon-512.png','icon-maskable.png','apple-touch-icon.png','og.png','screenshot-mobile.webp','screenshot-desktop.webp','assets','vendor','LICENSE']) cpSync(name, `${output}/${name}`, {recursive:true});
  const template = readFileSync('config.js','utf8');
  writeFileSync(`${output}/config.js`, template.replace(/window\.APP_CONFIG = Object\.freeze\(.*?\);/, () => `window.APP_CONFIG = Object.freeze(${JSON.stringify(config).replaceAll('<','\\u003c')});`));
  for (const name of ['index.html', 'privacy.html']) {
    const text = readFileSync(`${output}/${name}`, 'utf8')
      .replaceAll('https://ming32409-boop.github.io/LINE-/', () => escapeHtml(config.siteUrl))
      .replaceAll('https://github.com/ming32409-boop/LINE-', () => escapeHtml(config.repositoryUrl));
    writeFileSync(`${output}/${name}`,text);
  }
  writeFileSync(`${output}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${config.siteUrl}sitemap.xml\n`);
  writeFileSync(`${output}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeHtml(config.siteUrl)}</loc></url><url><loc>${escapeHtml(config.siteUrl)}privacy.html</loc></url></urlset>\n`);
  writeFileSync(`${output}/.nojekyll`, '');
  console.log(`前端已打包至 ${output}（僅包含公開檔案）`);
  return config;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { build(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
