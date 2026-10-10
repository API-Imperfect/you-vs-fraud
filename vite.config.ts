import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // phones on the LAN can reach the dev server
    proxy: { '/api': 'http://localhost:4000' },
  },
});
