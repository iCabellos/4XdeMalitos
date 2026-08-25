/**
 * Folds the single-file Vite build into one self-contained HTML document.
 *
 * Vite still emits the JS and CSS as separate files next to index.html; this
 * inlines both so the result runs from a `file://` path, a static host, or a
 * sandbox that blocks every external request.
 *
 * Usage:
 *   npm run build:single              -> a complete standalone HTML document
 *   tsx scripts/bundleSingleFile.ts out.html --fragment
 *                                     -> the same page without the document
 *                                        skeleton, for hosts that supply their
 *                                        own <html>/<head>/<body> wrapper
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DIST = 'dist-single';
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const OUT = args.find((a) => !a.startsWith('--')) ?? join(DIST, 'operacion-9-dias.html');

const assetsDir = join(DIST, 'assets');
const files = readdirSync(assetsDir);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile) throw new Error('No se encontro el bundle JS en dist-single/assets');

const js = readFileSync(join(assetsDir, jsFile), 'utf8');
const css = cssFile ? readFileSync(join(assetsDir, cssFile), 'utf8') : '';
const html = readFileSync(join(DIST, 'index.html'), 'utf8');

// Keep whatever <link rel="icon"> the template carries, drop the asset tags.
const iconMatch = html.match(/<link rel="icon"[\s\S]*?\/>/);
const icon = iconMatch ? iconMatch[0] : '';

/**
 * `</script>` inside string literals would close the inline script tag early.
 * Splitting the sequence keeps the JS byte-identical to the browser.
 */
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const body = `<div id="root"></div>
<script type="module">${safeJs}</script>
`;

const document = fragment
  ? `<title>OPERACION 9 DIAS</title>
<style>${css}</style>
${body}`
  : `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
    />
    <meta name="theme-color" content="#0e1116" />
    <title>OPERACION 9 DIAS</title>
    ${icon}
    <style>${css}</style>
  </head>
  <body>
${body}  </body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, document, 'utf8');
const kb = (Buffer.byteLength(document) / 1024).toFixed(0);
console.log(`Escrito ${OUT} (${kb} kB, un solo fichero, sin peticiones externas)`);
