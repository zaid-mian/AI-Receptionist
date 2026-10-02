import { defineConfig } from 'vite';

// JSX transform handled by esbuild with the automatic runtime (no extra plugin,
// keeping dependencies minimal per project constraints).
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
