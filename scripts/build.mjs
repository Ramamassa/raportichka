import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
const out = new URL('../dist/', import.meta.url);
await mkdir(new URL('vendor/', out), { recursive: true });
const reference = await readFile(new URL('../designs/sharrowkin-15e43b14-ac23-4ca9-b623-b0d9e5dbb616.html', import.meta.url), 'utf8');
// Only the visual stylesheet is reused. No reference script or markup is executed.
await writeFile(new URL('reference.css', out), reference.match(/<style>([\s\S]*?)<\/style>/)[1].replaceAll('.nav label', '.nav button'));
for (const file of ['index.html', 'app.css', 'app.js', 'telegram.js', 'model.js', 'roster.js', 'navigation.js', 'excel.js', 'manifest.webmanifest', 'icon.svg', 'sw.js']) await copyFile(new URL('../' + file, import.meta.url), new URL(file, out));
await copyFile(new URL('../node_modules/exceljs/dist/exceljs.min.js', import.meta.url), new URL('vendor/exceljs.min.js', out));
console.log('Built dist: HTML, CSS, modules, local Excel library and offline assets.');
