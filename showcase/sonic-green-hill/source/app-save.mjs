// Opens a generated document in the real editor and saves it through File > Save,
// capturing the bytes the app writes.  usage: node app-save.mjs <doc.json> <out.styk> [screenshot.png]
import {chromium} from '../../../tests/support/playwright.mjs';
import {installProjectSavePicker} from '../../../tests/support/project-save-picker.mjs';
import {readFile} from 'node:fs/promises';

const [docPath, outPath, shot] = process.argv.slice(2);
const origin = process.env.STYK_ORIGIN || 'http://127.0.0.1:47831';
const text = await readFile(docPath, 'utf8');
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}, acceptDownloads: true});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[page]', m.text().slice(0, 300)); });
await installProjectSavePicker(page);
await page.goto(origin);
await page.waitForFunction(() => window.styk?.ready, null, {timeout: 120000});
const started = Date.now();
const info = await page.evaluate(async ({text, name}) => {
  const report = JSON.parse(text);
  await styk.editor.load(report, name);
  styk.fit?.();
  return {name: styk.editor.name, objects: styk.editor.evaluatedFrame.objects.length};
}, {text, name: process.env.STYK_NAME || 'Sonic'});
console.log('loaded', info, `${Date.now() - started} ms`);
await page.waitForTimeout(1500);
if (shot) await page.screenshot({path: shot});
const pending = page.waitForEvent('download', {timeout: 600000});
await page.locator('[data-action="save"]').first().click();
const download = await pending;
await download.saveAs(outPath);
console.log('saved', outPath, download.suggestedFilename(), `${Date.now() - started} ms`);
if (errors.length) console.log('page errors', errors);
await browser.close();
