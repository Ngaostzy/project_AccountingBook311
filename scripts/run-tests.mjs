import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, '../public/standalone-preview.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);

global.window = global;
global.document = {
  getElementById: () => ({
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { remove: () => {}, add: () => {}, toggle: () => {} },
    innerHTML: ''
  }),
  querySelectorAll: () => [],
  addEventListener: () => {}
};
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.navigator = { onLine: true };

eval(scriptMatch[1]);
const results = global.ThuTienSachEngine.runAutomatedTests();
let failed = 0;
for (const r of results) {
  console.log(`${r.passed ? 'PASS' : 'FAIL'} | ${r.name} -> ${r.detail}`);
  if (!r.passed) failed++;
}
console.log(`\nTotal: ${results.length - failed}/${results.length} passed.`);
if (failed > 0) process.exit(1);
