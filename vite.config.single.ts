import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Single-file build: one HTML with every asset inlined, no chunking and no
 * network requests at all. Used to produce a playable build that can be dropped
 * on any static host (or into a sandbox that forbids external fetches).
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2020',
    outDir: 'dist-single',
    cssCodeSplit: false,
    // Inline every asset regardless of size so nothing is fetched separately.
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
});
