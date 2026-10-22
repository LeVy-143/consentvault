import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Demo is explicit at process startup; a browser flag cannot enable it in live.
  server: mode === 'demo'
    ? { host: '127.0.0.1', port: 5174, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3101' },
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.demo/**', '**/data/**', '**/.setup/**'] } }
    : { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3001', '/tide_dpop': 'http://127.0.0.1:3001' } },
}));
