/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = (env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

  const backendProxy = {
    target: apiProxyTarget,
    changeOrigin: true,
  };

  return {
  plugins: [react()],
  optimizeDeps: {
    include: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'charts': ['recharts'],
          'motion': ['framer-motion'],
        },
      },
    },
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
      },
      '/api/pokemonprice': {
        target: 'https://www.pokemonprice.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pokemonprice/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      '/api/prices': backendProxy,
      '/api/cards': backendProxy,
      '/api/auth': backendProxy,
      '/api/alerts': backendProxy,
      '/api/portfolio': backendProxy,
      '/api/packs': backendProxy,
      '/api/binders': backendProxy,
      '/api/market-insights': backendProxy,
      '/api/grading': backendProxy,
      '/api/update': backendProxy,
      '/api/cloud-backup': backendProxy,
      '/api/sync-catalog': backendProxy,
      '/api/sync-onepiece': backendProxy,
      '/api/health': backendProxy,
      '/api/status': backendProxy,
      '/api/pokemontcg': {
        target: 'https://api.pokemontcg.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pokemontcg/, ''),
        timeout: 60000, // 60 second timeout for proxy
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      },
      '/images/pokemontcg': {
        target: 'https://images.pokemontcg.io',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/images\/pokemontcg/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      },
      '/api/optcg': {
        target: 'https://optcgapi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/optcg/, '/api'),
        timeout: 30000,
        headers: {
          'Accept': 'application/json'
        }
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'dist/',
      ],
    },
  },
  };
});