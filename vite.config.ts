import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, proxy: { '/matchmake': 'http://127.0.0.1:2567', '/api': 'http://127.0.0.1:2567', '/healthz': 'http://127.0.0.1:2567' } },
  build: { target: 'es2022', rollupOptions: { output: { manualChunks: { three: ['three'], react: ['react', 'react-dom'], multiplayer: ['@colyseus/sdk'] } } } }
});
