import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      '/api/psa': {
        target: 'https://www.psacard.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/psa/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      '/api/pwcc': {
        target: 'https://www.pwccmarketplace.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pwcc/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      '/api/cardladder': {
        target: 'https://www.cardladder.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cardladder/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    }
  }
});