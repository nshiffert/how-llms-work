import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Pure static output: `dist/` can be copied to any static host. `base: './'`
// keeps asset URLs relative so it works from a subpath too.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2020', chunkSizeWarningLimit: 2500 },
});
