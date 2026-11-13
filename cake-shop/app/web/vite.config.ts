import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development Vite serves the React app and forwards /api to the Express server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
