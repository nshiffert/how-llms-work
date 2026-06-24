#!/usr/bin/env node
// Generate the lesson-card images from image-prompts.md using OpenAI's
// image model, writing them to public/images/<slug>-demo.png.
//
// Usage:
//   node scripts/generate-images.mjs                 # generate any missing images
//   node scripts/generate-images.mjs --force         # regenerate everything
//   node scripts/generate-images.mjs lora rag        # only these slugs (substring match)
//   node scripts/generate-images.mjs --list          # parse + list, no API calls
//
// Reads OPENAI_API_TOKEN from .env (or the environment).

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROMPTS_FILE = path.join(ROOT, 'image-prompts.md');
const OUT_DIR = path.join(ROOT, 'public', 'images');

// ---- Generation settings -------------------------------------------------
// gpt-image-1 renders the IBM Plex Mono labels / UI text in these prompts far
// more legibly than dall-e-3, and follows the layout instructions closely.
// 1536x1024 (3:2) is the model's widest size; the cards use object-fit:cover
// in a 16:9 box, so the slightly-taller frame is cropped cleanly top/bottom.
const MODEL = 'gpt-image-1';
const SIZE = '1536x1024';
const QUALITY = 'high';

// Appended to every prompt so the whole set stays visually consistent and
// matches the site's near-black surface (#070a10, the ink-900 page bg).
//
// Tuned to match the cinematic "hero render" look of the Gemini reference
// images: neon bloom, a tilted 3D glass plane with depth/perspective,
// glassmorphic panels, gradient-glowing elements, and an atmospheric
// background — rather than a flat documentation diagram.
const STYLE_SUFFIX =
  ' Render as a premium, cinematic 3D hero image: arrange the elements on a ' +
  'subtly tilted glassmorphic plane with real perspective and depth, ' +
  'translucent dark-glass panels with soft reflections and rounded corners. ' +
  'Apply strong neon bloom and volumetric glow to the electric-cyan and ' +
  'magenta elements; fill chips, bars and nodes with luminous cyan-to-magenta ' +
  'gradients and bright glowing outlines. Atmospheric deep near-black #070a10 ' +
  'background with a faint wireframe constellation of connected nodes, soft ' +
  'depth-of-field bokeh, and a gentle vignette. Sharp, high-detail, polished ' +
  'and visually striking. Wide 16:9 full-bleed composition, no outer frame or ' +
  'border, no title text, no watermark, no logo, no people.';

// Social / Open Graph cards (filenames starting with `social-`) DO need legible
// title text, so they get their own suffix that allows it and keeps the
// composition centered with safe margins for the link-preview crop.
const SOCIAL_SUFFIX =
  ' Render as a premium, cinematic 16:9 social-share / Open Graph card. Deep ' +
  'near-black #070a10 background with electric-cyan and magenta neon glow, ' +
  'subtle glassmorphic panels, and a faint wireframe constellation of ' +
  'connected nodes with soft depth-of-field bokeh and a gentle vignette. Keep ' +
  'all text large, crisp, perfectly spelled and high-contrast, with the whole ' +
  'composition centered inside generous safe margins so nothing important sits ' +
  'near the edges. Polished, modern, visually striking. No people, no extra ' +
  'watermark, no logo.';

const isSocial = (file) => /^social-/.test(file);

const CONCURRENCY = 3;
const MAX_RETRIES = 3;

// ---- .env loader (no dependency) -----------------------------------------
async function loadEnv() {
  try {
    const raw = await readFile(path.join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const key = m[1];
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* no .env file — rely on the environment */
  }
}

// ---- Prompt parsing ------------------------------------------------------
// Each card line looks like:
//   `images/<slug>-demo.png` *(existing)* — "Dark ... no people."
function parsePrompts(md) {
  const re = /^`images\/([^`]+)`[^\n—-]*[—-]+\s*"([^"]+)"/gm;
  const out = [];
  let m;
  while ((m = re.exec(md)) !== null) {
    const file = m[1].trim(); // e.g. tokenization-demo.png
    const slug = file.replace(/-demo\.png$/, '').replace(/\.png$/, '');
    out.push({ slug, file, prompt: m[2].trim() });
  }
  return out;
}

async function exists(p) {
  try {
    await access(p, FS.F_OK);
    return true;
  } catch {
    return false;
  }
}

// ---- OpenAI image call ---------------------------------------------------
async function generateOne(item, apiKey) {
  const body = {
    model: MODEL,
    prompt: item.prompt + (isSocial(item.file) ? SOCIAL_SUFFIX : STYLE_SUFFIX),
    n: 1,
    size: SIZE,
    quality: QUALITY,
  };

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        // Retry transient/server/rate errors; fail fast on client errors.
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
        }
        throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`), {
          fatal: true,
        });
      }

      const json = await res.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) throw new Error('No image data in response');

      const outPath = path.join(OUT_DIR, item.file);
      await writeFile(outPath, Buffer.from(b64, 'base64'));
      return outPath;
    } catch (err) {
      lastErr = err;
      if (err.fatal || attempt === MAX_RETRIES) break;
      const backoff = 1500 * 2 ** (attempt - 1);
      console.warn(`  ↻ ${item.slug}: ${err.message} — retry ${attempt}/${MAX_RETRIES - 1} in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

// ---- Simple concurrency pool ---------------------------------------------
async function runPool(items, worker, limit) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx).then(
        (value) => ({ status: 'ok', value }),
        (error) => ({ status: 'err', error })
      );
    }
  });
  await Promise.all(runners);
  return results;
}

// ---- Main ----------------------------------------------------------------
async function main() {
  await loadEnv();

  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const listOnly = args.includes('--list');
  const slugFilters = args.filter((a) => !a.startsWith('--'));

  const md = await readFile(PROMPTS_FILE, 'utf8');
  let items = parsePrompts(md);

  if (slugFilters.length) {
    items = items.filter((it) => slugFilters.some((f) => it.slug.includes(f)));
  }

  if (!items.length) {
    console.error('No prompts matched. Check image-prompts.md or your slug filters.');
    process.exit(1);
  }

  console.log(`Parsed ${items.length} prompt(s) from image-prompts.md`);
  if (listOnly) {
    for (const it of items) console.log(`  • ${it.file}`);
    return;
  }

  const apiKey = process.env.OPENAI_API_TOKEN || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Missing OPENAI_API_TOKEN (or OPENAI_API_KEY) in .env / environment.');
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  // Decide what actually needs generating.
  const todo = [];
  let skipped = 0;
  for (const it of items) {
    if (!force && (await exists(path.join(OUT_DIR, it.file)))) {
      skipped++;
      continue;
    }
    todo.push(it);
  }

  if (skipped) console.log(`Skipping ${skipped} image(s) that already exist (use --force to regenerate).`);
  if (!todo.length) {
    console.log('Nothing to generate. ✓');
    return;
  }

  console.log(`Generating ${todo.length} image(s) with ${MODEL} @ ${SIZE} (${QUALITY})...\n`);

  let done = 0;
  const results = await runPool(
    todo,
    async (it) => {
      const outPath = await generateOne(it, apiKey);
      done++;
      console.log(`  ✓ [${done}/${todo.length}] ${path.relative(ROOT, outPath)}`);
      return outPath;
    },
    CONCURRENCY
  );

  const failures = results.filter((r) => r.status === 'err');
  if (failures.length) {
    console.error(`\n${failures.length} image(s) failed:`);
    for (let n = 0; n < results.length; n++) {
      if (results[n].status === 'err') {
        console.error(`  ✗ ${todo[n].slug}: ${results[n].error.message}`);
      }
    }
    process.exit(1);
  }

  console.log(`\nDone. ${todo.length} image(s) written to public/images/. ✓`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
