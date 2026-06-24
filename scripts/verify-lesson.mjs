#!/usr/bin/env node
// verify-lesson.mjs — the headless "Chrome test" substitute for the Ralph loop.
//
// Serves the freshly built dist/ and confirms ONE lesson's interactive island actually
// works: the page loads, the <astro-island> hydrates (renders real DOM), and nothing throws
// in the console. Saves a screenshot to ralph/logs/<slug>.png for a human to eyeball later.
//
// Usage:  node scripts/verify-lesson.mjs <slug>
//
// Full check requires Playwright + chromium:  npx playwright install chromium
// Without it, the script falls back to a static check on the built HTML (still useful,
// but it cannot prove the island hydrated without a runtime error). Exit code: 0 pass, 1 fail.

import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const LOGDIR = path.join(ROOT, 'ralph', 'logs');

const slug = process.argv[2];
if (!slug) {
  console.error('usage: node scripts/verify-lesson.mjs <slug>');
  process.exit(1);
}

const fail = (msg) => { console.error(`✗ verify ${slug}: ${msg}`); process.exit(1); };
const pass = (msg) => { console.log(`✓ verify ${slug}: ${msg}`); process.exit(0); };

const pageDir = path.join(DIST, 'topics', slug);
const pageHtml = path.join(pageDir, 'index.html');
if (!existsSync(DIST)) fail('dist/ not found — run `npm run build` first.');
if (!existsSync(pageHtml)) fail(`built page not found at dist/topics/${slug}/index.html — did the build include this topic (status: 'ready')?`);

// --- minimal static file server over dist/ ---------------------------------
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.wasm': 'application/wasm', '.map': 'application/json',
};
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let fsPath = path.join(DIST, urlPath);
      if (urlPath.endsWith('/')) fsPath = path.join(fsPath, 'index.html');
      else {
        try { if ((await stat(fsPath)).isDirectory()) fsPath = path.join(fsPath, 'index.html'); }
        catch { /* fall through */ }
      }
      const buf = await readFile(fsPath);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fsPath)] || 'application/octet-stream' });
      res.end(buf);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// --- try Playwright; fall back to static check -----------------------------
let chromium = null;
try { ({ chromium } = await import('playwright')); }
catch { try { ({ chromium } = await import('@playwright/test')); } catch { /* not installed */ } }

await mkdir(LOGDIR, { recursive: true });

if (!chromium) {
  // Static fallback: prove the island markup is on the page and the build didn't error.
  const html = await readFile(pageHtml, 'utf8');
  if (!html.includes('astro-island')) fail('no <astro-island> in the built HTML — the lesson has no hydrated island. (Static check; install Playwright for the real test.)');
  if (/MDXError|Could not render|astro-error/i.test(html)) fail('build-error markers found in the HTML.');
  console.warn('  (Playwright not installed — ran STATIC check only. For the real hydration+console test: npx playwright install chromium)');
  pass(`static check ok — <astro-island> present in dist/topics/${slug}/index.html.`);
}

let server, browser;
try {
  server = await startServer();
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/topics/${slug}/`;

  browser = await chromium.launch();
  const page = await browser.newPage();

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

  const islandCount = await page.locator('astro-island').count();
  if (islandCount === 0) fail('no <astro-island> on the page — lesson is missing its interactive widget.');

  // Trigger client:visible islands by scrolling each into view, then give React a beat to mount.
  for (let i = 0; i < islandCount; i++) {
    await page.locator('astro-island').nth(i).scrollIntoViewIfNeeded().catch(() => {});
  }
  await page.waitForTimeout(1200);

  const hydrated = await page.evaluate(() =>
    [...document.querySelectorAll('astro-island')].some((el) => el.childElementCount > 0));
  if (!hydrated) fail('no <astro-island> rendered any DOM children — the island did not hydrate.');

  const shot = path.join(LOGDIR, `${slug}.png`);
  await page.screenshot({ path: shot, fullPage: true });

  if (errors.length) {
    console.error(`  console/page errors:\n   - ${errors.join('\n   - ')}`);
    fail(`${errors.length} runtime error(s) on the page. Screenshot: ${path.relative(ROOT, shot)}`);
  }
  pass(`${islandCount} island(s) hydrated, no console errors. Screenshot: ${path.relative(ROOT, shot)}`);
} catch (e) {
  fail(`harness error: ${e.message}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
}
