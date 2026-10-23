// Renders a document through the app's own export pipeline (ExportFrameRenderer:
// the worker that video/GIF/PNG export uses), writing numbered PNG frames.
// usage: node export.mjs <doc.json> <outdir> [--size 1920x1080] [--frames a-b] [--step n]
import {chromium} from '../../../tests/support/playwright.mjs';
import {readFile, writeFile, mkdir} from 'node:fs/promises';

const args = process.argv.slice(2);
const [docPath, outDir] = args;
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const [width, height] = opt('--size', '1280x720').split('x').map(Number);
const step = Number(opt('--step', '1'));
const range = opt('--frames', null);
const origin = process.env.STYK_ORIGIN || 'http://127.0.0.1:47831';
await mkdir(outDir, {recursive: true});
const text = await readFile(docPath, 'utf8');
const browser = await chromium.launch({headless: true});
const page = await browser.newPage();
page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log('[page]', m.text().slice(0, 400)); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`${origin}/api/health`);
const ticks = await page.evaluate(async ({text, width, height}) => {
  const {ExportFrameRenderer} = await import('/src/export-frame-renderer.mjs');
  const {timeline} = await import('/src/pivot/geometry.mjs');
  const {validateScene} = await import('/src/pivot/model.mjs');
  const doc = JSON.parse(text);
  validateScene(doc);
  window.__renderer = new ExportFrameRenderer({width, height, smoothing: 'edges', timeoutMs: 600000});
  await window.__renderer.load(doc);
  return timeline(doc).reduce((n, row) => Math.max(n, row.start + row.count), 0);
}, {text, width, height});
let [first, last] = range ? range.split('-').map(Number) : [0, ticks - 1];
if (last === undefined || Number.isNaN(last)) last = first;
console.log(`ticks ${ticks}; rendering ${first}..${last} at ${width}x${height}`);
const started = Date.now();
for (let tick = first; tick <= last; tick += step) {
  const b64 = await page.evaluate(async tick => {
    const result = await window.__renderer.renderNativeTick(tick, {preserveAlpha: false});
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, tick);
  await writeFile(`${outDir}/f${String(tick).padStart(4, '0')}.png`, Buffer.from(b64, 'base64'));
  if ((tick - first) % (30 * step) === 0) console.log('frame', tick, `${((Date.now() - started) / 1000).toFixed(1)}s`);
}
await page.evaluate(() => window.__renderer.dispose());
await browser.close();
