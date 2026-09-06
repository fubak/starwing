import { defineConfig } from 'vite';
export default defineConfig({
  server: { port: 5173, strictPort: true, host: true, fs: { allow: ['.'] } },
  build: { target: 'es2022', rollupOptions: { input: { main: 'index.html', progress: 'progress.html' } } },
  publicDir: 'public',
});
