import { defineConfig } from 'vite';
export default defineConfig({
  // NO_HMR=1 runs a second, reload-free instance (port 5174) for headless
  // renders so other agents' edits can't reload a page mid-capture.
  server: process.env.NO_HMR
    ? { port: 5174, strictPort: true, host: true, hmr: false, fs: { allow: ['.'] } }
    : { port: 5173, strictPort: true, host: true, fs: { allow: ['.'] } },
  build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', progress: 'progress.html' } } },
  publicDir: 'public',
});
