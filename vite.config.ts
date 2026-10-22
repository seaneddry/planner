import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// GitHub Pages serves the site from /<repo-name>/. Change this if you rename the repo,
// or set VITE_BASE in the build environment.
const base = process.env.VITE_BASE ?? '/planner/';

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-64.png'],
      manifest: {
        name: 'Planner',
        short_name: 'Planner',
        description: 'Work and personal to-dos, follow-ups, reminders and plans in one place.',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Quick capture', short_name: 'Capture', url: `${base}?capture=1` },
          { name: 'Upcoming', url: `${base}upcoming` },
        ],
      },
      workbox: {
        // The app shell is cached so it opens offline; data is cached by the app itself.
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        importScripts: ['push-sw.js'],
      },
    }),
  ],
});
