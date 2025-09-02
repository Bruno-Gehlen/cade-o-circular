import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/public',
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../../dist',
  },
});
