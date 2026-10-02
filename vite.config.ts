import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `npm run build:pages` (mode "pages", see .env.pages): static build for GitHub Pages.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/Mark-Prototype/' : '/',
  build: { outDir: mode === 'pages' ? 'dist-pages' : 'dist' },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5280,
    strictPort: true,
    host: true,
    proxy: { '/api': { target: 'http://localhost:5281' } },
  },
}));
