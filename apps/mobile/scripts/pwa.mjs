// Depois do `expo export --platform web`: transforma o build num app instalável
// ("Adicionar à tela inicial" no Android e no iPhone).
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';

const dist = new URL(process.env.PWA_DIST ? 'file://' + process.env.PWA_DIST + '/' : '../dist/', import.meta.url);
const app = JSON.parse(readFileSync(new URL('../app.json', import.meta.url))).expo;

const manifest = {
  name: app.name,
  short_name: app.web?.shortName ?? app.name,
  description: app.description,
  lang: 'pt-BR',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  theme_color: app.web?.themeColor ?? '#0F766E',
  background_color: app.web?.backgroundColor ?? '#F6F7F9',
  icons: [
    { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(new URL('manifest.webmanifest', dist), JSON.stringify(manifest, null, 2));

let html = readFileSync(new URL('index.html', dist), 'utf8');
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
      '<link rel="manifest" href="/manifest.webmanifest">',
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
      '<meta name="apple-mobile-web-app-capable" content="yes">',
      '<meta name="mobile-web-app-capable" content="yes">',
      '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
      `<meta name="apple-mobile-web-app-title" content="${manifest.short_name}">`,
      `<style>html,body{background:${manifest.background_color}}</style>`,
      '</head>',
    ].join('\n'),
  );
writeFileSync(new URL('index.html', dist), html);

// Abrir direto um endereço interno (ex.: /filho/123) também carrega o app
copyFileSync(new URL('index.html', dist), new URL('404.html', dist));
console.log('PWA pronto em dist/');
