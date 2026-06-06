import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
});
