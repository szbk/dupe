import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: '0.0.0.0', // dış erişim
    port: 5173,
    strictPort: true,
    watch: { usePolling: true } // bazen hot reload için gerekir
  }
});
