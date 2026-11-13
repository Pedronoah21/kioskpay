// Depois do `expo export --platform web`: transforma o build num app instalável
// ("Adicionar à tela inicial" no Android e no iPhone).
//
// Com EXPO_BASE_URL=/kioskpay o app mora numa pasta (ex.: www.cedcci.com.br/kioskpay):
// os arquivos vão para dist/kioskpay/ e a raiz redireciona para lá.
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = process.env.PWA_DIST ?? path.join(here, '..', 'dist');
const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, ''); // '' ou '/kioskpay'
const app = JSON.parse(readFileSync(path.join(here, '..', 'app.json'), 'utf8')).expo;

// 1) Com pasta: move tudo para dist/<pasta>/
const root = base ? path.join(dist, base) : dist;
if (base) {
  const tmp = `${dist}.__tmp`;
  renameSync(dist, tmp);
  mkdirSync(root, { recursive: true });
  for (const f of readdirSync(tmp)) renameSync(path.join(tmp, f), path.join(root, f));
  rmSync(tmp, { recursive: true });
}

// 2) Manifesto
const manifest = {
  name: app.name,
  short_name: app.web?.shortName ?? app.name,
  description: app.description,
  lang: 'pt-BR',
  id: `${base}/`,
  start_url: `${base}/`,
  scope: `${base}/`,
  display: 'standalone',
  orientation: 'portrait',
  theme_color: app.web?.themeColor ?? '#0F766E',
  background_color: app.web?.backgroundColor ?? '#F6F7F9',
  icons: [
    { src: `${base}/pwa-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${base}/pwa-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${base}/pwa-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(path.join(root, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// 3) HTML: idioma, tela cheia no celular e ícones
let html = readFileSync(path.join(root, 'index.html'), 'utf8');
html = html
  .replace('<html lang="en">', '<html lang="pt-BR">')
  .replace(
    'content="width=device-width, initial-scale=1, shrink-to-fit=no"',
    'content="width=device-width, initial-scale=1, viewport-fit=cover"',
  )
  .replace(
    '</head>',
    [
      `<meta name="description" content="${manifest.description}">`,
      `<link rel="manifest" href="${base}/manifest.webmanifest">`,
      `<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png">`,
      '<meta name="apple-mobile-web-app-capable" content="yes">',
      '<meta name="mobile-web-app-capable" content="yes">',
      '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
      `<meta name="apple-mobile-web-app-title" content="${manifest.short_name}">`,
      `<style>html,body{background:${manifest.background_color}}</style>`,
      '</head>',
    ].join('\n'),
  );
writeFileSync(path.join(root, 'index.html'), html);

// 4) Abrir direto um endereço interno (ex.: /kioskpay/filho/123) também carrega o app
writeFileSync(path.join(dist, '404.html'), html);
if (base) {
  writeFileSync(
    path.join(dist, 'index.html'),
    `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${base}/"><title>${app.name}</title><a href="${base}/">Abrir ${app.name}</a>`,
  );
}
console.log(`PWA pronto em ${root}`);
