// Adds the hidden /admin page to the build and injects the announcement/maintenance script into the
// main page, so no existing file has to be edited.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const main = fileURLToPath(new URL('./index.html', import.meta.url));
const admin = fileURLToPath(new URL('./admin/index.html', import.meta.url));

export default defineConfig({
  plugins: [{
    name: 'bk-inject-announce',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.filename || ctx.filename !== main) return html; // only the public app, never /admin
        return html.replace('</body>', '<script type="module" src="/src/announce.js"></script>\n</body>');
      },
    },
  }],
  build: { rollupOptions: { input: { main, admin } } },
});
